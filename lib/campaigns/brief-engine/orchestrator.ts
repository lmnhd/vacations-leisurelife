import { getCampaignBlueprint, getAestheticBrief, saveAestheticBrief } from '../campaign-store';
import { generateAestheticBrief } from '../aesthetic-engine';
import { runTrinitySession } from '../trinity/orchestrator';
import { trinityDeterministicKernel } from '../trinity/deterministic-kernel';
import { trinityDesignerAgent } from '../trinity/agents/designer';
import { trinityBuilderAgent } from '../trinity/agents/builder';
import { trinityReviewerAgent } from '../trinity/agents/reviewer';
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
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function computeReadiness(brief: CampaignAestheticBrief, campaign: Campaign): { readiness: ReadinessState; issues: ValidationIssue[]; summary: string } {
    if (brief.humanReviewStatus === 'approved') {
        const validation = validateBrief(brief, campaign);
        if (validation.passed) {
            return { readiness: 'ready_for_media', issues: [], summary: 'Brief is approved and passes all structural checks.' };
        }
        return { readiness: 'needs_review', issues: validation.issues, summary: `Approved brief has new issues: ${validation.summary}` };
    }

    const validation = validateBrief(brief, campaign);
    if (validation.passed) {
        return { readiness: 'needs_review', issues: [], summary: 'Brief passes structural checks but needs human approval.' };
    }
    return { readiness: 'needs_review', issues: validation.issues, summary: validation.summary };
}

// ────────────────────────────────────────────────────────────────────────────
// 1. create_or_refresh_brief
// ────────────────────────────────────────────────────────────────────────────

export async function createOrRefreshBrief(slug: string, options?: { instructions?: string }): Promise<BriefEngineResult> {
    const warnings: string[] = [];

    const campaign = await getCampaignBlueprint(slug);
    if (!campaign) throw new Error(`Campaign not found: ${slug}`);

    const existingBrief = await getAestheticBrief(slug);
    let brief = existingBrief;
    if (!brief) {
        console.log(`[brief-engine] No brief exists for ${slug}. Generating initial brief...`);
        brief = await generateAestheticBrief(campaign);
        await saveAestheticBrief(brief);
    }

    console.log(`[brief-engine] create_or_refresh for ${slug}`);

    // ── Run Trinity pipeline (designer → builder → reviewer) ──────────
    const result = await runTrinitySession(campaign, brief, 3, {
        kernel: trinityDeterministicKernel,
        designer: trinityDesignerAgent,
        builder: trinityBuilderAgent,
        reviewer: trinityReviewerAgent,
    });

    brief = result.session.brief;

    // ── Consolidated validation ───────────────────────────────────────
    let validation = validateBrief(brief, campaign);

    // ── One-strike auto-fix if validation fails ───────────────────────
    let autoFixApplied = false;
    let fixedCodes: string[] = [];

    if (!validation.passed) {
        const autoFixableCount = validation.issues.filter((i) => i.autoFixable).length;
        if (autoFixableCount > 0) {
            console.log(`[brief-engine] one-strike auto-fix: ${autoFixableCount} fixable issues`);
            const fixResult = applyAutoFixes(brief, validation.issues);
            brief = fixResult.brief;
            fixedCodes = fixResult.fixedCodes;
            autoFixApplied = fixedCodes.length > 0;

            if (autoFixApplied) {
                validation = validateBrief(brief, campaign);
            }

            if (fixResult.unfixableCodes.length > 0) {
                warnings.push(`Unfixable blockers remain: ${fixResult.unfixableCodes.join(', ')}`);
            }
        }
    }

    // ── Persist ───────────────────────────────────────────────────────
    const briefToPersist = applySupervisorState(brief, {
        issues: validation.issues,
        reviewStatus: 'pending',
        origin: 'create_or_refresh',
        revisionCycleCount: brief.revisionCycleCount,
    });
    await saveAestheticBrief(briefToPersist);

    const readiness: ReadinessState = validation.passed ? 'needs_review' : 'needs_review';
    const summary = validation.passed
        ? 'Brief generated and passes all structural checks. Ready for approval.'
        : `Brief generated but ${validation.issues.filter((i) => i.severity === 'blocker').length} blocker(s) remain. ${validation.summary}`;

    return {
        readiness,
        brief: briefToPersist,
        issues: validation.issues,
        summary,
        warnings,
        autoFixApplied,
        fixedCodes,
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

    // ── If instructions provided, run Trinity for one round ───────────
    if (revision.instructions) {
        const result = await runTrinitySession(campaign, brief, 1, {
            kernel: trinityDeterministicKernel,
            designer: trinityDesignerAgent,
            builder: trinityBuilderAgent,
            reviewer: trinityReviewerAgent,
        });
        brief = result.session.brief;
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

    const readiness: ReadinessState = validation.passed ? 'needs_review' : 'needs_review';
    return {
        readiness,
        brief: revisedBrief,
        issues: validation.issues,
        summary: validation.passed ? 'Revision applied. All structural checks pass. Ready for approval.' : validation.summary,
        warnings,
        autoFixApplied,
        fixedCodes,
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

    const { readiness, issues, summary } = computeReadiness(brief, campaign);
    return { readiness, brief, issues, summary, campaignName: campaign.name };
}

// ────────────────────────────────────────────────────────────────────────────
// 4. approve_for_media
// ────────────────────────────────────────────────────────────────────────────

export async function approveForMedia(slug: string): Promise<ApprovalResult> {
    const campaign = await getCampaignBlueprint(slug);
    if (!campaign) throw new Error(`Campaign not found: ${slug}`);

    const brief = await getAestheticBrief(slug);
    if (!brief) throw new Error(`No brief exists for ${slug}.`);

    // ── Launch window gate ────────────────────────────────────────────
    const launchWindow = getLaunchWindowAssessment({ matchedSailDate: campaign.matchedSailDate, targetDates: campaign.targetDates });
    if (launchWindow.meetsMinimumLeadTime === false) {
        throw new Error(`Launch window too short: ${launchWindow.daysUntilSail} days. Minimum is ${MINIMUM_CAMPAIGN_LEAD_DAYS}.`);
    }

    // ── Structural validation gate ────────────────────────────────────
    const validation = validateBrief(brief, campaign);
    if (!validation.passed) {
        const blockers = validation.issues.filter((i) => i.severity === 'blocker');
        throw new Error(`Cannot approve: ${blockers.length} blocker(s) remain. ${blockers.map((b) => b.message).join(' | ')}`);
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
