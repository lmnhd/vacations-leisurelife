import { getCampaignBlueprint, getAestheticBrief, saveAestheticBrief } from '../campaign-store';
import { generateAestheticBrief, generateVisualPlanningFromBrief } from '../aesthetic-engine';
import { lintProductionBuild } from '../media/production-build-lint';
import { validateBrief } from './validation';
import { applyAutoFixes } from './auto-fix';
import { applySupervisorState } from './supervisor';
import { getLaunchWindowAssessment, MINIMUM_CAMPAIGN_LEAD_DAYS } from '../launch-window';
import type { CampaignAestheticBrief } from '../schema';
import type { Campaign } from '../types';
import type { ValidationIssue } from './validation';

// ────────────────────────────────────────────────────────────────────────────
// Readiness state machine — 3 states, no more
// ────────────────────────────────────────────────────────────────────────────

type ReadinessState = 'drafting' | 'needs_review' | 'ready_for_media';

// ────────────────────────────────────────────────────────────────────────────
// Shared response shape for all orchestrator operations
// ────────────────────────────────────────────────────────────────────────────

interface BriefEngineResult {
    readiness: ReadinessState;
    brief: CampaignAestheticBrief | null;
    issues: ValidationIssue[];
    summary: string;
    warnings: string[];
    autoFixApplied: boolean;
    fixedCodes: string[];
    correctiveRepromptUsed: boolean;
}

interface ApprovalResult {
    readiness: ReadinessState;
    brief: CampaignAestheticBrief;
    summary: string;
}

interface ReadinessResult {
    readiness: ReadinessState;
    brief: CampaignAestheticBrief | null;
    issues: ValidationIssue[];
    summary: string;
    campaignName: string | null;
}

// ────────────────────────────────────────────────────────────────────────────
// Internal: generate full brief bundle (aesthetic + visual planning + lint)
// ────────────────────────────────────────────────────────────────────────────

async function generateFullBriefBundle(
    campaign: Campaign,
    options?: { correctionContext?: string },
): Promise<CampaignAestheticBrief> {
    const brief = await generateAestheticBrief(campaign, options);
    const visualPlanning = await generateVisualPlanningFromBrief(campaign, brief);
    const lintReport = lintProductionBuild({
        landingStillBible: visualPlanning.landingStillBible,
        productionBible: visualPlanning.productionBible,
        themeName: campaign.name,
        nicheKeywords: campaign.targetingKeywords ?? [],
    });

    return {
        ...brief,
        landingStillBible: visualPlanning.landingStillBible,
        productionBible: visualPlanning.productionBible,
        productionBuildLint: lintReport,
        productionBuildStatus: lintReport.verdict,
        productionBuildEvaluatedAt: lintReport.evaluatedAt,
    };
}

// ────────────────────────────────────────────────────────────────────────────
// Internal: build a corrective reprompt context string from remaining blockers
// ────────────────────────────────────────────────────────────────────────────

function buildCorrectionContext(blockers: ValidationIssue[]): string {
    return blockers
        .map((b, i) => `${i + 1}. [${b.code}] ${b.message}`)
        .join('\n');
}

// ────────────────────────────────────────────────────────────────────────────
// Internal: recompute production-build lint from saved still data and resync
// if the stored verdict has drifted from what current rules produce.
// This is the single source of truth for gate-time lint evaluation.
// ────────────────────────────────────────────────────────────────────────────

interface LintResyncResult {
    resolvedBrief: CampaignAestheticBrief;
    drifted: boolean;
    freshStatus: CampaignAestheticBrief['productionBuildStatus'];
}

async function recomputeAndResyncLint(
    brief: CampaignAestheticBrief,
    campaign: Campaign,
): Promise<LintResyncResult> {
    if (!brief.landingStillBible) {
        return { resolvedBrief: brief, drifted: false, freshStatus: brief.productionBuildStatus };
    }

    const freshLint = lintProductionBuild({
        landingStillBible: brief.landingStillBible,
        productionBible: brief.productionBible,
        themeName: campaign.name,
        nicheKeywords: campaign.targetingKeywords ?? [],
    });

    const storedStatus = brief.productionBuildStatus;
    const freshStatus = freshLint.verdict;
    const drifted = storedStatus !== freshStatus;

    if (!drifted) {
        return { resolvedBrief: brief, drifted: false, freshStatus };
    }

    console.log(`[brief-engine] lint drift for ${campaign.id}: stored=${storedStatus ?? 'undefined'} → recomputed=${freshStatus}`);

    const resynced: CampaignAestheticBrief = {
        ...brief,
        productionBuildLint: freshLint,
        productionBuildStatus: freshStatus,
        productionBuildEvaluatedAt: freshLint.evaluatedAt,
    };
    await saveAestheticBrief(resynced);

    return { resolvedBrief: resynced, drifted: true, freshStatus };
}

// ────────────────────────────────────────────────────────────────────────────
// Internal: compute readiness from brief + campaign
// ────────────────────────────────────────────────────────────────────────────

async function computeReadiness(brief: CampaignAestheticBrief, campaign: Campaign): Promise<{ readiness: ReadinessState; issues: ValidationIssue[]; summary: string }> {
    // Recompute lint from saved still data to catch stale-state drift before applying gates.
    const { resolvedBrief, drifted } = await recomputeAndResyncLint(brief, campaign);
    const effectiveBrief = resolvedBrief;
    if (drifted) {
        console.log(`[brief-engine] computeReadiness used resynced lint for ${campaign.id}`);
    }

    if (effectiveBrief.humanReviewStatus === 'approved') {
        const validation = validateBrief(effectiveBrief, campaign);
        if (!validation.passed) {
            return { readiness: 'needs_review', issues: validation.issues, summary: `Approved brief has new issues: ${validation.summary}` };
        }
        // ── Production build lint gate — must match media-orchestrator spend-gated semantics ──
        if (!effectiveBrief.productionBuildStatus || !effectiveBrief.landingStillBible) {
            return { readiness: 'needs_review', issues: [], summary: 'Production build has not been evaluated. Regenerate the brief bundle to run pre-media lint before approving.' };
        }
        if (effectiveBrief.productionBuildStatus === 'fail') {
            return { readiness: 'needs_review', issues: [], summary: 'Production build lint failed (productionBuildStatus = fail). Downstream media generation would reject this brief. Regenerate to resolve production build issues.' };
        }
        return { readiness: 'ready_for_media', issues: [], summary: 'Brief is approved and passes all structural and production-build checks.' };
    }

    const validation = validateBrief(effectiveBrief, campaign);
    if (validation.passed) {
        return { readiness: 'needs_review', issues: [], summary: 'Brief passes structural checks but needs human approval.' };
    }
    return { readiness: 'needs_review', issues: validation.issues, summary: validation.summary };
}

// ────────────────────────────────────────────────────────────────────────────
// 1. create_or_refresh_brief
//    Single orchestration entry point used by both UI and agent callers.
//    Flow: generate bundle → validate → auto-fix → re-validate →
//          if still blocked: one corrective reprompt → final validate → stop.
// ────────────────────────────────────────────────────────────────────────────

export async function createOrRefreshBrief(slug: string, options?: { instructions?: string }): Promise<BriefEngineResult> {
    const warnings: string[] = [];

    const campaign = await getCampaignBlueprint(slug);
    if (!campaign) throw new Error(`Campaign not found: ${slug}`);

    console.log(`[brief-engine] create_or_refresh for ${slug}`);

    // ── First generation pass: full bundle ────────────────────────────
    let brief = await generateFullBriefBundle(campaign);

    // ── First validation ──────────────────────────────────────────────
    let validation = validateBrief(brief, campaign);

    // ── One-strike auto-fix ───────────────────────────────────────────
    let autoFixApplied = false;
    let fixedCodes: string[] = [];
    let correctiveRepromptUsed = false;

    if (!validation.passed) {
        const autoFixableCount = validation.issues.filter((i) => i.autoFixable).length;
        if (autoFixableCount > 0) {
            console.log(`[brief-engine] auto-fix: ${autoFixableCount} fixable issues`);
            const fixResult = applyAutoFixes(brief, validation.issues);
            brief = fixResult.brief;
            fixedCodes = fixResult.fixedCodes;
            autoFixApplied = fixedCodes.length > 0;
            if (autoFixApplied) {
                validation = validateBrief(brief, campaign);
            }
            if (fixResult.unfixableCodes.length > 0) {
                warnings.push(`Auto-fix could not address: ${fixResult.unfixableCodes.join(', ')}`);
            }
        }
    }

    // ── One corrective reprompt if blockers still remain ──────────────
    if (!validation.passed) {
        const remainingBlockers = validation.issues.filter((i) => i.severity === 'blocker');
        const nonLaunchBlockers = remainingBlockers.filter((i) => i.code !== 'launch_window_violation');

        if (nonLaunchBlockers.length > 0) {
            correctiveRepromptUsed = true;
            const correctionContext = buildCorrectionContext(nonLaunchBlockers);
            console.log(`[brief-engine] corrective reprompt for ${slug}: ${nonLaunchBlockers.length} blocker(s)`);

            brief = await generateFullBriefBundle(campaign, { correctionContext });
            const repromptAutoFix = applyAutoFixes(brief, validateBrief(brief, campaign).issues);
            brief = repromptAutoFix.brief;
            if (repromptAutoFix.fixedCodes.length > 0) {
                fixedCodes = [...new Set([...fixedCodes, ...repromptAutoFix.fixedCodes])];
                autoFixApplied = true;
            }
            validation = validateBrief(brief, campaign);
        }
    }

    // ── Persist final brief ───────────────────────────────────────────
    const briefToPersist = applySupervisorState(brief, {
        issues: validation.issues,
        reviewStatus: 'pending',
        origin: 'create_or_refresh',
        revisionCycleCount: (brief.revisionCycleCount ?? 0),
    });
    await saveAestheticBrief(briefToPersist);

    const blockerCount = validation.issues.filter((i) => i.severity === 'blocker').length;
    const summary = validation.passed
        ? 'Brief generated and passes all structural checks. Ready for approval.'
        : `Brief generated but ${blockerCount} blocker(s) remain.${correctiveRepromptUsed ? ' Corrective reprompt was used.' : ''} ${validation.summary}`;

    return {
        readiness: 'needs_review',
        brief: briefToPersist,
        issues: validation.issues,
        summary,
        warnings,
        autoFixApplied,
        fixedCodes,
        correctiveRepromptUsed,
    };
}

// ────────────────────────────────────────────────────────────────────────────
// 2. apply_structured_revision
// ────────────────────────────────────────────────────────────────────────────

interface RevisionInput {
    fieldEdits?: Record<string, unknown>;
    instructions?: string;
}

export async function applyStructuredRevision(slug: string, revision: RevisionInput): Promise<BriefEngineResult> {
    const warnings: string[] = [];

    const campaign = await getCampaignBlueprint(slug);
    if (!campaign) throw new Error(`Campaign not found: ${slug}`);

    let brief = await getAestheticBrief(slug);
    if (!brief) throw new Error(`No aesthetic brief exists for ${slug}.`);

    console.log(`[brief-engine] apply_structured_revision for ${slug}`);

    // ── Apply field edits directly ────────────────────────────────────
    if (revision.fieldEdits && Object.keys(revision.fieldEdits).length > 0) {
        brief = { ...brief, ...revision.fieldEdits } as CampaignAestheticBrief;
    }

    // ── If instructions provided, regenerate full bundle with instruction context ──
    if (revision.instructions) {
        brief = await generateFullBriefBundle(campaign, { correctionContext: revision.instructions });
    }

    // ── Validate ─────────────────────────────────────────────────────
    let validation = validateBrief(brief, campaign);

    let autoFixApplied = false;
    let fixedCodes: string[] = [];

    if (!validation.passed) {
        const fixResult = applyAutoFixes(brief, validation.issues);
        brief = fixResult.brief;
        fixedCodes = fixResult.fixedCodes;
        autoFixApplied = fixedCodes.length > 0;
        if (autoFixApplied) {
            validation = validateBrief(brief, campaign);
        }
    }

    // ── Persist as revised ────────────────────────────────────────────
    const revisedBrief = applySupervisorState(brief, {
        issues: validation.issues,
        reviewStatus: 'revised',
        origin: 'structured_revision',
        revisionCycleCount: (brief.revisionCycleCount ?? 0) + 1,
    });
    await saveAestheticBrief(revisedBrief);

    return {
        readiness: 'needs_review',
        brief: revisedBrief,
        issues: validation.issues,
        summary: validation.passed ? 'Revision applied. All structural checks pass. Ready for approval.' : validation.summary,
        warnings,
        autoFixApplied,
        fixedCodes,
        correctiveRepromptUsed: false,
    };
}

// ────────────────────────────────────────────────────────────────────────────
// 3. get_readiness
// ────────────────────────────────────────────────────────────────────────────

export async function getReadiness(slug: string): Promise<ReadinessResult> {
    const campaign = await getCampaignBlueprint(slug);
    if (!campaign) throw new Error(`Campaign not found: ${slug}`);

    const brief = await getAestheticBrief(slug);
    if (!brief) {
        return { readiness: 'drafting', brief: null, issues: [], summary: 'No brief exists yet.', campaignName: campaign.name };
    }

    const { readiness, issues, summary } = await computeReadiness(brief, campaign);
    return { readiness, brief, issues, summary, campaignName: campaign.name };
}

// ────────────────────────────────────────────────────────────────────────────
// 4. approve_for_media
// ────────────────────────────────────────────────────────────────────────────

export async function approveForMedia(slug: string): Promise<ApprovalResult> {
    const campaign = await getCampaignBlueprint(slug);
    if (!campaign) throw new Error(`Campaign not found: ${slug}`);

    const storedBrief = await getAestheticBrief(slug);
    if (!storedBrief) throw new Error(`No brief exists for ${slug}.`);

    // ── Launch window gate ────────────────────────────────────────────
    const launchWindow = getLaunchWindowAssessment({ matchedSailDate: campaign.matchedSailDate, targetDates: campaign.targetDates });
    if (launchWindow.meetsMinimumLeadTime === false) {
        throw new Error(`Launch window too short: ${launchWindow.daysUntilSail} days. Minimum is ${MINIMUM_CAMPAIGN_LEAD_DAYS}.`);
    }

    // ── Structural validation gate ────────────────────────────────────
    const validation = validateBrief(storedBrief, campaign);
    if (!validation.passed) {
        const blockers = validation.issues.filter((i) => i.severity === 'blocker');
        throw new Error(`Cannot approve: ${blockers.length} blocker(s) remain. ${blockers.map((b) => b.message).join(' | ')}`);
    }

    // ── Production build lint gate ────────────────────────────────────────────
    // Must match spend-gated semantics in media-orchestrator.ts (lines 322-336).
    // Recompute lint first to eliminate stale-state drift before applying the gate.
    const { resolvedBrief: lintResolvedBrief, drifted: lintDrifted } = await recomputeAndResyncLint(storedBrief, campaign);
    const brief = lintResolvedBrief;
    if (lintDrifted) {
        console.log(`[brief-engine] lint resynced at approval time for ${slug}`);
    }

    if (!brief.productionBuildStatus || !brief.landingStillBible) {
        throw new Error(
            `Cannot approve: production build has not been evaluated for ${slug}. ` +
            `Regenerate the brief bundle to run pre-approval lint before approving.`
        );
    }
    if (brief.productionBuildStatus === 'fail') {
        throw new Error(
            `Cannot approve: production build lint failed (productionBuildStatus = fail) for ${slug}. ` +
            `Downstream media generation would reject this brief. Regenerate to resolve production build issues.`
        );
    }

    const approvedBrief = applySupervisorState(brief, {
        issues: validation.issues,
        reviewStatus: 'approved',
        origin: 'approval',
        revisionCycleCount: brief.revisionCycleCount,
    });
    await saveAestheticBrief(approvedBrief);

    console.log(`[brief-engine] approved for media: ${slug}`);

    return { readiness: 'ready_for_media', brief: approvedBrief, summary: 'Brief approved for media generation.' };
}

// ────────────────────────────────────────────────────────────────────────────
// 5. get_history (returns modification history from the brief itself)
// ────────────────────────────────────────────────────────────────────────────

interface HistoryEntry {
    action: string;
    timestamp: string;
    details: string;
}

export async function getHistory(slug: string): Promise<{ entries: HistoryEntry[]; briefExists: boolean }> {
    const brief = await getAestheticBrief(slug);
    if (!brief) return { entries: [], briefExists: false };

    const entries: HistoryEntry[] = [];

    if (brief.generatedAt) {
        entries.push({ action: 'generated', timestamp: brief.generatedAt, details: `Generated by ${brief.generatedBy ?? 'unknown'}` });
    }

    if (brief.modificationHistory) {
        for (const mod of brief.modificationHistory) {
            entries.push({
                action: mod.mode ?? 'modification',
                timestamp: mod.modifiedAt ?? 'unknown',
                details: `${mod.appliedIssueCodes.length} issue codes applied. ${mod.revisionNotesSummary}`,
            });
        }
    }

    entries.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    return { entries, briefExists: true };
}

export type { BriefEngineResult, ApprovalResult, ReadinessResult, ReadinessState, HistoryEntry, RevisionInput };
