import { z } from 'zod';
import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { saveAestheticBrief } from './campaign-store';
import { ALLOWED_OPERATION_PATHS } from './aesthetic-fixers/registry';
import type {
    CampaignAestheticBrief,
    AestheticIssueRecord,
    AestheticPatchRequest,
    AestheticPatchResult,
    PatchArtifact,
    ClosureOutcome,
} from './schema';
import { suggestDeterministicIssueCodes } from './aesthetic-fixers/registry';

// ────────────────────────────────────────────────────────────────────────────
// Model
// ────────────────────────────────────────────────────────────────────────────

const PATCH_MODEL = openai('gpt-4o');

// ────────────────────────────────────────────────────────────────────────────
// Derive allowed paths for a patch request
// Scoped to ALLOWED_OPERATION_PATHS to prevent deep path hallucination
// ────────────────────────────────────────────────────────────────────────────

function resolveAllowedPaths(request: AestheticPatchRequest): string[] {
    const artifactPrefix = artifactToPathPrefix(request.artifact);
    const narrowed = request.allowedPaths.filter(path => {
        if (!ALLOWED_OPERATION_PATHS.has(path)) return false;
        if (artifactPrefix === 'all') return true;
        return path.startsWith(artifactPrefix) || !path.includes('.');
    });
    return narrowed.length > 0 ? narrowed : request.allowedPaths.filter(p => ALLOWED_OPERATION_PATHS.has(p));
}

function artifactToPathPrefix(artifact: PatchArtifact): string {
    if (artifact === 'production_bible') return 'productionBible.';
    if (artifact === 'landing_still_bible') return 'landingStillBible.';
    return 'all';
}

// ────────────────────────────────────────────────────────────────────────────
// Extract relevant artifact slice from brief
// ────────────────────────────────────────────────────────────────────────────

function extractArtifactSlice(
    brief: CampaignAestheticBrief,
    artifact: PatchArtifact,
    allowedPaths: string[],
): Record<string, unknown> {
    const fullBrief = brief as unknown as Record<string, unknown>;

    if (artifact === 'production_bible') {
        return { productionBible: fullBrief.productionBible ?? {} };
    }
    if (artifact === 'landing_still_bible') {
        return { landingStillBible: fullBrief.landingStillBible ?? {} };
    }

    const slice: Record<string, unknown> = {};
    for (const path of allowedPaths) {
        const topKey = path.split('.')[0];
        if (topKey && !slice[topKey]) {
            slice[topKey] = fullBrief[topKey];
        }
    }
    return slice;
}

// ────────────────────────────────────────────────────────────────────────────
// Build the LLM patch response schema dynamically
// Forces the model to return only top-level keys matching allowed paths
// ────────────────────────────────────────────────────────────────────────────

function buildPatchResponseSchema(allowedPaths: string[]): z.ZodObject<Record<string, z.ZodTypeAny>> {
    const topKeys = Array.from(new Set(allowedPaths.map(p => p.split('.')[0]).filter(Boolean)));
    const shape: Record<string, z.ZodTypeAny> = {};
    for (const key of topKeys) {
        shape[key] = z.unknown();
    }
    shape['patchSummary'] = z.string();
    return z.object(shape);
}

// ────────────────────────────────────────────────────────────────────────────
// Apply patch response back onto the brief
// ────────────────────────────────────────────────────────────────────────────

function applyPatchToBrief(
    brief: CampaignAestheticBrief,
    patchResponse: Record<string, unknown>,
    allowedPaths: string[],
): { updatedBrief: CampaignAestheticBrief; touchedPaths: string[] } {
    const briefRecord = { ...(brief as unknown as Record<string, unknown>) };
    const touchedPaths: string[] = [];

    for (const path of allowedPaths) {
        const topKey = path.split('.')[0];
        if (!topKey || !(topKey in patchResponse)) continue;

        const patchedTopValue = patchResponse[topKey];
        if (patchedTopValue === undefined || patchedTopValue === null) continue;

        if (JSON.stringify(briefRecord[topKey]) !== JSON.stringify(patchedTopValue)) {
            briefRecord[topKey] = patchedTopValue;
            touchedPaths.push(path);
        }
    }

    return {
        updatedBrief: briefRecord as unknown as CampaignAestheticBrief,
        touchedPaths,
    };
}

// ────────────────────────────────────────────────────────────────────────────
// Run closure checks post-patch
// ────────────────────────────────────────────────────────────────────────────

function runClosureChecks(
    updatedBrief: CampaignAestheticBrief,
    request: AestheticPatchRequest,
    issues: AestheticIssueRecord[],
): ClosureOutcome[] {
    const briefText = JSON.stringify(updatedBrief).toLowerCase();
    const outcomes: ClosureOutcome[] = [];

    for (const check of request.closureChecks) {
        const checkLower = check.toLowerCase();

        if (checkLower.includes('crane') || checkLower.includes('dolly') || checkLower.includes('camera')) {
            const stillPresent = /\b(crane|dolly|slider|cable\s*cam|tracking\s+shot)\b/i.test(briefText);
            outcomes.push({ check, passed: !stillPresent, note: stillPresent ? 'Banned camera tokens still present' : 'No banned camera tokens found' });
            continue;
        }

        const detectedCodes = suggestDeterministicIssueCodes([], briefText);
        const issueCodesForCheck = issues
            .filter(i => i.closureChecks.includes(check) && i.issueCode !== 'custom')
            .map(i => i.issueCode);
        const allCleared = issueCodesForCheck.every(code => !detectedCodes.includes(code as never));
        outcomes.push({ check, passed: allCleared, note: allCleared ? 'Pattern cleared' : 'Pattern may still be present' });
    }

    return outcomes;
}

// ────────────────────────────────────────────────────────────────────────────
// Public: run a targeted LLM patch
// ────────────────────────────────────────────────────────────────────────────

export async function runAestheticPatch(
    slug: string,
    brief: CampaignAestheticBrief,
    request: AestheticPatchRequest,
    issues: AestheticIssueRecord[],
): Promise<{ result: AestheticPatchResult; updatedBrief: CampaignAestheticBrief }> {
    const allowedPaths = resolveAllowedPaths(request);

    if (allowedPaths.length === 0) {
        return {
            result: {
                success: false,
                issueIds: request.issueIds,
                artifact: request.artifact,
                touchedPaths: [],
                closureOutcomes: [],
                patchSummary: '',
                failureReason: 'No valid allowed paths could be resolved for this patch request',
            },
            updatedBrief: brief,
        };
    }

    const artifactSlice = extractArtifactSlice(brief, request.artifact, allowedPaths);
    const patchSchema = buildPatchResponseSchema(allowedPaths);

    const systemPrompt = [
        'You are a targeted field-patch engine for Leisure Life Interactive campaign aesthetic briefs.',
        'You receive a slice of the current brief and a set of explicit fix instructions.',
        'Your ONLY job is to fix the specified fields. Do NOT rewrite unrelated content.',
        'Return exactly the top-level keys that changed, plus a patchSummary.',
        '',
        'FORBIDDEN:',
        '- Do not invent new top-level keys',
        '- Do not change any field not listed in allowedPaths',
        '- Do not rewrite fields that do not need fixing',
        '- Do not use crane, dolly, track, slider, or cable-cam camera language',
        '- Do not use workshop, retreat, residency, or event-program framing',
    ].join('\n');

    const userPrompt = JSON.stringify({
        issueIds: request.issueIds,
        artifact: request.artifact,
        allowedPaths,
        instructions: request.instructions,
        closureChecks: request.closureChecks,
        currentArtifactSlice: artifactSlice,
    });

    try {
        const { object } = await generateObject({
            model: PATCH_MODEL,
            schema: patchSchema,
            system: systemPrompt,
            prompt: userPrompt,
            temperature: 0.15,
        });

        const patchResponse = object as Record<string, unknown>;
        const { updatedBrief, touchedPaths } = applyPatchToBrief(brief, patchResponse, allowedPaths);
        const closureOutcomes = runClosureChecks(updatedBrief, request, issues);
        const allPassed = closureOutcomes.every(o => o.passed);

        const result: AestheticPatchResult = {
            success: touchedPaths.length > 0,
            issueIds: request.issueIds,
            artifact: request.artifact,
            touchedPaths,
            closureOutcomes,
            patchSummary: typeof patchResponse.patchSummary === 'string' ? patchResponse.patchSummary : `Patched ${touchedPaths.length} paths`,
            failureReason: !allPassed ? 'Some closure checks did not pass after patching' : undefined,
        };

        if (touchedPaths.length > 0) {
            const briefWithClearedReview: CampaignAestheticBrief = {
                ...updatedBrief,
                redTeamReview: undefined,
                humanReviewStatus: 'revised',
                revisionNotes: result.patchSummary,
            };
            await saveAestheticBrief(briefWithClearedReview);
            return { result, updatedBrief: briefWithClearedReview };
        }

        return { result, updatedBrief };

    } catch (error: unknown) {
        const detail = error instanceof Error ? error.message : 'LLM patch call failed';
        return {
            result: {
                success: false,
                issueIds: request.issueIds,
                artifact: request.artifact,
                touchedPaths: [],
                closureOutcomes: [],
                patchSummary: '',
                failureReason: detail,
            },
            updatedBrief: brief,
        };
    }
}

// ────────────────────────────────────────────────────────────────────────────
// Build patch requests from issue ledger (grouped by artifact)
// ────────────────────────────────────────────────────────────────────────────

export function buildPatchRequestsFromIssues(
    issues: AestheticIssueRecord[],
): AestheticPatchRequest[] {
    const llmIssues = issues.filter(i => i.remediationMode === 'llm_patch' && i.status === 'open');

    const byArtifact = new Map<PatchArtifact, AestheticIssueRecord[]>();
    for (const issue of llmIssues) {
        const artifact = owningArtifactToPatchArtifact(issue.owningArtifact);
        if (!artifact) continue;
        const group = byArtifact.get(artifact) ?? [];
        group.push(issue);
        byArtifact.set(artifact, group);
    }

    const requests: AestheticPatchRequest[] = [];
    for (const [artifact, groupIssues] of byArtifact) {
        const allowedPaths = Array.from(new Set(groupIssues.flatMap(i => i.targetPaths)));
        const instructions = groupIssues.map(i => `[${i.issueId}] ${i.title}: ${i.summary}`);
        const closureChecks = Array.from(new Set(groupIssues.flatMap(i => i.closureChecks)));

        requests.push({
            issueIds: groupIssues.map(i => i.issueId),
            artifact,
            allowedPaths,
            closureChecks,
            instructions,
        });
    }

    return requests;
}

function owningArtifactToPatchArtifact(owningArtifact: string): PatchArtifact | null {
    if (owningArtifact === 'brief') return 'brief';
    if (owningArtifact === 'production_bible') return 'production_bible';
    if (owningArtifact === 'landing_still_bible') return 'landing_still_bible';
    return 'brief';
}
