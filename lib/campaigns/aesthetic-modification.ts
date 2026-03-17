import {
    getAestheticBrief,
    saveAestheticBrief,
} from './campaign-store';
import {
    type CampaignAestheticBrief,
    type AestheticModificationRequest,
    type AestheticModificationOperation,
    type AestheticModificationResult,
    type AestheticModificationHistoryEntry,
    type AestheticInvalidation,
    type AestheticAppliedOperation,
    type AestheticIssueCode,
    AestheticModificationRequestSchema,
} from './schema';
import {
    runOperation,
    ISSUE_CODE_OPERATIONS,
    suggestDeterministicIssueCodes,
    FixerPathError,
} from './aesthetic-fixers/registry';

export { FixerPathError };

export class AllNoOpError extends Error {
    constructor() {
        super('All operations were no-ops — nothing in the brief matched the requested fixes.');
        this.name = 'AllNoOpError';
    }
}

// ────────────────────────────────────────────────────────────────────────────
// Paths that affect visual planning (trigger lint/bible invalidation)
// ────────────────────────────────────────────────────────────────────────────

const VISUAL_PLANNING_PATHS = [
    'videoConcepts.',
    'visual.',
    'copy.',
    'audio.',
];

function affectsVisualPlanning(touchedPaths: string[]): boolean {
    return touchedPaths.some(p =>
        VISUAL_PLANNING_PATHS.some(prefix => p.startsWith(prefix))
    );
}

// ────────────────────────────────────────────────────────────────────────────
// Invalidation computation
// ────────────────────────────────────────────────────────────────────────────

export function computeAestheticInvalidation(
    touchedPaths: string[],
    priorBrief: CampaignAestheticBrief,
): AestheticInvalidation {
    const hadApproval = priorBrief.humanReviewStatus === 'approved' || priorBrief.humanReviewStatus === 'revised';
    const clearVisualArtifacts = affectsVisualPlanning(touchedPaths);

    return {
        humanReviewStatus: hadApproval ? 'revised' : 'unchanged',
        clearedRedTeamReview: true,
        clearedProductionBible: false,
        clearedLandingStillBible: false,
        clearedProductionBuildLint: clearVisualArtifacts,
    };
}

// ────────────────────────────────────────────────────────────────────────────
// Follow-up action builder
// ────────────────────────────────────────────────────────────────────────────

function buildFollowUpActions(
    invalidation: AestheticInvalidation,
    operationFollowUps: string[],
): string[] {
    const actions: string[] = [];

    if (invalidation.clearedRedTeamReview) {
        actions.push('Run red team again to verify structural issues are resolved.');
    }
    if (invalidation.humanReviewStatus === 'revised') {
        actions.push('Re-approve the aesthetic brief before proceeding to media generation.');
    }
    if (invalidation.clearedProductionBuildLint) {
        actions.push('Regenerate the Production Bible to re-evaluate build quality against the updated brief.');
    }

    for (const followUp of operationFollowUps) {
        if (!actions.includes(followUp)) actions.push(followUp);
    }

    return actions;
}

// ────────────────────────────────────────────────────────────────────────────
// Modification history append
// ────────────────────────────────────────────────────────────────────────────

export function appendModificationHistory(
    brief: CampaignAestheticBrief,
    entry: AestheticModificationHistoryEntry,
): CampaignAestheticBrief {
    const existing = brief.modificationHistory ?? [];
    return {
        ...brief,
        modificationHistory: [...existing, entry],
    };
}

// ────────────────────────────────────────────────────────────────────────────
// Core modification runner
// ────────────────────────────────────────────────────────────────────────────

export async function runAestheticModification(
    slug: string,
    request: AestheticModificationRequest,
): Promise<AestheticModificationResult> {
    // Validate request schema
    const parseResult = AestheticModificationRequestSchema.safeParse(request);
    if (!parseResult.success) {
        throw new Error(`Invalid modification request: ${parseResult.error.message}`);
    }

    const brief = await getAestheticBrief(slug);
    if (!brief) {
        throw new Error(`No aesthetic brief found for campaign: ${slug}`);
    }

    // Resolve operations from issue codes + explicit operations
    const resolvedOperations = resolveOperations(request);
    if (resolvedOperations.length === 0) {
        throw new Error('No operations could be resolved from the provided issue codes or operations list.');
    }

    // Run all operations in sequence
    let currentBrief = brief;
    const allTouchedPaths: string[] = [];
    const allAppliedOps: AestheticAppliedOperation[] = [];
    const allFollowUps: string[] = [];
    const appliedIssueCodes: AestheticIssueCode[] = [];

    // FixerPathError propagates immediately — caller maps to 422
    for (const op of resolvedOperations) {
        const result = runOperation(currentBrief, op);
        currentBrief = result.brief;
        allTouchedPaths.push(...result.touchedPaths);
        allAppliedOps.push(...result.appliedOperations);
        allFollowUps.push(...result.followUps);
    }

    // Reject if nothing actually changed — prevents misleading success: true no-op responses
    const anyApplied = allAppliedOps.some(o => o.status === 'applied');
    if (!anyApplied) {
        throw new AllNoOpError();
    }

    // Collect applied issue codes from request
    if (request.issueCodes) {
        appliedIssueCodes.push(...request.issueCodes);
    }

    // Compute invalidation
    const invalidation = computeAestheticInvalidation(allTouchedPaths, brief);

    // Build revision notes summary
    const appliedSummaries = allAppliedOps
        .filter(o => o.status === 'applied')
        .map(o => o.summary)
        .join(' ');
    const revisionNotesSummary = appliedSummaries ||
        `Deterministic modification run (${request.mode}) — no fields changed.`;

    // Apply invalidation to brief (always done, even in preview, but only persisted on apply)
    if (allTouchedPaths.length > 0) {
        currentBrief = applyInvalidationToBrief(currentBrief, invalidation, revisionNotesSummary);
    }

    // Build history entry
    const historyEntry: AestheticModificationHistoryEntry = {
        modifiedAt: new Date().toISOString(),
        mode: request.mode,
        actor: request.actor,
        appliedIssueCodes,
        appliedOperations: allAppliedOps,
        touchedPaths: allTouchedPaths,
        invalidation,
        reason: request.reason,
        revisionNotesSummary,
    };

    // In apply mode: append history + persist
    if (request.mode === 'apply' && allTouchedPaths.length > 0) {
        currentBrief = appendModificationHistory(currentBrief, historyEntry);
        await saveAestheticBrief(currentBrief);
    }

    const followUpActions = buildFollowUpActions(invalidation, allFollowUps);

    return {
        success: true,
        mode: request.mode,
        brief: currentBrief,
        appliedIssueCodes,
        appliedOperations: allAppliedOps,
        touchedPaths: allTouchedPaths,
        invalidation,
        followUpActions,
        historyEntry,
    };
}

// ────────────────────────────────────────────────────────────────────────────
// Convenience wrappers
// ────────────────────────────────────────────────────────────────────────────

export async function previewAestheticModification(
    slug: string,
    request: Omit<AestheticModificationRequest, 'mode'>,
): Promise<AestheticModificationResult> {
    return runAestheticModification(slug, { ...request, mode: 'preview' });
}

export async function applyAestheticModification(
    slug: string,
    request: Omit<AestheticModificationRequest, 'mode'>,
): Promise<AestheticModificationResult> {
    return runAestheticModification(slug, { ...request, mode: 'apply' });
}

// ────────────────────────────────────────────────────────────────────────────
// Public: derive suggestions from red team review
// ────────────────────────────────────────────────────────────────────────────

export { suggestDeterministicIssueCodes };

// ────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ────────────────────────────────────────────────────────────────────────────

function resolveOperations(request: AestheticModificationRequest): AestheticModificationOperation[] {
    const ops: AestheticModificationOperation[] = [];

    if (request.source === 'issue_codes' || request.source === 'mixed') {
        for (const code of request.issueCodes ?? []) {
            const mapped = ISSUE_CODE_OPERATIONS[code];
            if (mapped) ops.push(...mapped);
        }
    }

    if (request.source === 'operations' || request.source === 'mixed') {
        ops.push(...(request.operations ?? []));
    }

    // Deduplicate by kind+targetPath
    const seen = new Set<string>();
    return ops.filter(op => {
        const key = `${op.kind}::${op.targetPath}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function applyInvalidationToBrief(
    brief: CampaignAestheticBrief,
    invalidation: AestheticInvalidation,
    revisionNotesSummary: string,
): CampaignAestheticBrief {
    const updated: CampaignAestheticBrief = {
        ...brief,
        revisionNotes: revisionNotesSummary,
        redTeamReview: undefined,
    };

    if (invalidation.humanReviewStatus === 'revised') {
        updated.humanReviewStatus = 'revised';
    }

    if (invalidation.clearedProductionBuildLint) {
        updated.productionBuildLint = undefined;
        updated.productionBuildStatus = undefined;
        updated.productionBuildEvaluatedAt = undefined;
    }

    return updated;
}
