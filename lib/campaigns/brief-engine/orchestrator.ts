import { getCampaignBlueprint, getAestheticBrief, saveAestheticBrief } from '../campaign-store';
import { generateAestheticBrief } from '../aesthetic-engine';
import {
    generateActionAnchors,
    generateLandingStillBible,
    repairFailingStills,
    generateProductionBibleFromStills,
    extractFailingStillIds,
    mergeRepairedStills,
    validateAnchorCompliance,
    extractViolationStillIds,
    formatViolationsForRepair,
    normalizeEditorialCompositions,
    normalizeEditorialUsage,
} from '../editors-room';
import { lintProductionBuild } from '../media/production-build-lint';
import { getExpandedNicheKeywords } from '../reference-packs';
import { validateBrief } from './validation';
import { applyAutoFixes } from './auto-fix';
import { applySupervisorState } from './supervisor';
import { getLaunchWindowAssessment } from '../launch-window';
import type { CampaignAestheticBrief, ProductionBible } from '../schema';
import type { Campaign } from '../types';
import type { ValidationIssue } from './validation';

// ────────────────────────────────────────────────────────────────────────────
// Stage duration instrumentation — surfaces slow LLM stages in server logs
// ────────────────────────────────────────────────────────────────────────────

interface StageTiming {
    stageName: string;
    elapsedMs: number;
}

interface BriefTimingPass {
    passLabel: 'initial' | 'corrective_reprompt';
    totalElapsedMs: number | null;
    stages: StageTiming[];
}

const activeBriefTimingSnapshots = new Map<string, BriefTimingPass[]>();

// ── Persisted failure diagnostics — survives route timeout ──────────────────
// Keyed by slug. Stores timing snapshot + error message from the most recent
// failed or timed-out run so Brief Studio can display it without re-running.

interface BriefFailureDiagnostic {
    slug: string;
    failedAt: string;
    errorMessage: string;
    timings: BriefTimingPass[];
}

const briefFailureDiagnostics = new Map<string, BriefFailureDiagnostic>();

export function getBriefJobDiagnostics(slug: string): BriefFailureDiagnostic | null {
    return briefFailureDiagnostics.get(slug) ?? null;
}

function stageTimer(stageName: string, campaignId: string, timings: StageTiming[]): () => void {
    const start = Date.now();
    console.log(`[brief-engine:stage] START  ${stageName} (${campaignId})`);
    return () => {
        const elapsedMs = Date.now() - start;
        const elapsedSec = (elapsedMs / 1000).toFixed(1);
        const slow = elapsedMs > 30_000 ? ' ⚠ SLOW' : '';
        timings.push({ stageName, elapsedMs });
        console.log(`[brief-engine:stage] END    ${stageName} (${campaignId}) — ${elapsedSec}s${slow}`);
    };
}

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
    timings: BriefTimingPass[];
    autoFixApplied: boolean;
    fixedCodes: string[];
    correctiveRepromptUsed: boolean;
    isolatedStillRevisionUsed: boolean;
    wholeSetRegenerationUsed: boolean;
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

function mapProductionBuildLintIssues(brief: CampaignAestheticBrief): ValidationIssue[] {
    const report = brief.productionBuildLint;
    if (!report) {
        return [];
    }

    return [
        ...report.blockingIssues,
        ...report.warnings,
    ].map((issue) => ({
        code: issue.code,
        message: issue.details ? `${issue.message} ${issue.details}` : issue.message,
        severity: issue.severity,
        autoFixable: false,
    }));
}

export function shouldUseIsolatedStillRepair(failingStillIds: string[], totalStillCount: number): boolean {
    const uniqueFailingStillCount = new Set(failingStillIds).size;
    return totalStillCount > 0 && uniqueFailingStillCount > 0 && uniqueFailingStillCount < totalStillCount;
}

export function shouldUseWholeSetRegeneration(failingStillIds: string[], totalStillCount: number): boolean {
    const uniqueFailingStillCount = new Set(failingStillIds).size;
    return totalStillCount > 0 && uniqueFailingStillCount === totalStillCount;
}

// ────────────────────────────────────────────────────────────────────────────
// Internal: generate full brief bundle (aesthetic + visual planning + lint)
// ────────────────────────────────────────────────────────────────────────────

async function generateFullBriefBundle(
    campaign: Campaign,
    timingPass: BriefTimingPass,
    options?: { correctionContext?: string; instructions?: string },
): Promise<CampaignAestheticBrief & {
    isolatedStillRevisionUsed: boolean;
    wholeSetRegenerationUsed: boolean;
}> {
    const bundleStart = Date.now();
    timingPass.stages.length = 0;
    timingPass.totalElapsedMs = null;
    console.log(`[brief-engine:bundle] START full bundle (${campaign.id})`);

    // ── Step 1: Core aesthetic brief (pass 1 + pass 2 + refinement) ──────
    const endAesthetic = stageTimer('aesthetic-bundle-total', campaign.id, timingPass.stages);
    const brief = await generateAestheticBrief(campaign, {
        ...options,
        recordStageTiming: (stageName, elapsedMs) => {
            timingPass.stages.push({ stageName, elapsedMs });
        },
    });
    endAesthetic();

    // ── Step 2: Community-native action anchors ───────────────────────────
    const endAnchors = stageTimer('anchor-generation', campaign.id, timingPass.stages);
    const anchors = await generateActionAnchors(campaign, brief, { instructions: options?.instructions });
    endAnchors();

    // ── Step 3: Landing still bible from locked anchors ───────────────
    const endStillBible = stageTimer('landing-still-bible', campaign.id, timingPass.stages);
    let landingStillBible = await generateLandingStillBible(campaign, brief, anchors, { instructions: options?.instructions });
    endStillBible();

    // ── Step 3.1: Deterministic editorial composition normalizer ──────────────
    // Replaces intimate/close/tight/detail keywords in EDITORIAL_WIDE compositions
    // so lint's extractShotRole counts them as editorial, not intimate.
    landingStillBible = normalizeEditorialCompositions(landingStillBible);

    // ── Step 3.2: Deterministic editorial usage normalizer ───────────────────
    // Fixes invalid usage values on EDITORIAL_WIDE stills (e.g. model writes
    // 'medium_wide' instead of 'concept') before anchor compliance runs.
    landingStillBible = normalizeEditorialUsage(landingStillBible);

    // ── Step 3.5: Deterministic anchor-compliance gate ───────────────
    let anchorCompliance = validateAnchorCompliance(anchors.anchors, landingStillBible);
    let anchorViolationsBlock = formatViolationsForRepair(anchorCompliance.violations);
    if (!anchorCompliance.passed) {
        console.log(`[brief-engine] anchor compliance violations for ${campaign.id}: ${anchorCompliance.violations.length}`);
    }

    // ── Step 4: Lint stills only — identify specific failures ─────────
    const expandedNicheKeywords = getExpandedNicheKeywords(campaign);
    let stillsLint = lintProductionBuild({
        landingStillBible,
        themeName: campaign.name,
        nicheKeywords: expandedNicheKeywords,
    });

    // ── Step 5: Unified repair — anchor violations + lint blockers ─────
    let isolatedStillRevisionUsed = false;
    let wholeSetRegenerationUsed = false;
    const lintFailingIds = extractFailingStillIds(stillsLint.blockingIssues);
    const anchorFailingIds = extractViolationStillIds(anchorCompliance.violations);
    const allFailingIds = [...new Set([...lintFailingIds, ...anchorFailingIds])];
    const canUseIsolatedRepair = shouldUseIsolatedStillRepair(allFailingIds, landingStillBible.stillLibrary.length);

    if (canUseIsolatedRepair) {
        console.log(`[brief-engine] unified repair for ${campaign.id}: ${allFailingIds.join(', ')} (lint=${lintFailingIds.length}, anchor=${anchorFailingIds.length})`);

        // Save pre-repair state so we can revert if repair makes things worse
        const preRepairBible = landingStillBible;
        const preRepairAnchorCompliance = anchorCompliance;
        const preRepairViolationsBlock = anchorViolationsBlock;
        const preRepairLint = stillsLint;

        const endRepair = stageTimer('isolated-still-repair', campaign.id, timingPass.stages);
        const repairedStills = await repairFailingStills(
            campaign, brief, landingStillBible, allFailingIds, stillsLint.blockingIssues, anchorViolationsBlock, { instructions: options?.instructions },
        );
        endRepair();
        landingStillBible = mergeRepairedStills(landingStillBible, repairedStills);

        // Re-validate both gates after repair
        anchorCompliance = validateAnchorCompliance(anchors.anchors, landingStillBible);
        anchorViolationsBlock = formatViolationsForRepair(anchorCompliance.violations);
        stillsLint = lintProductionBuild({
            landingStillBible,
            themeName: campaign.name,
            nicheKeywords: expandedNicheKeywords,
        });
        isolatedStillRevisionUsed = true;

        // ── Keep-best: if repair introduced MORE violations, revert ──────────
        const preRepairCount = preRepairAnchorCompliance.violations.length;
        const postRepairCount = anchorCompliance.violations.length;
        if (postRepairCount > preRepairCount) {
            console.log(`[brief-engine] repair made things worse (${preRepairCount} → ${postRepairCount}), reverting to pre-repair state for ${campaign.id}`);
            landingStillBible = preRepairBible;
            anchorCompliance = preRepairAnchorCompliance;
            anchorViolationsBlock = preRepairViolationsBlock;
            stillsLint = preRepairLint;
        } else if (!anchorCompliance.passed) {
            console.log(`[brief-engine] post-repair anchor violations remain: ${anchorCompliance.violations.length}`);
        }
    } else if (shouldUseWholeSetRegeneration(allFailingIds, landingStillBible.stillLibrary.length)) {
        // ── Whole-set failure path: every still failed both gates ──────────────
        // Isolated repair cannot preserve uniqueness when the full set collapses.
        // One-strike: regenerate the full still set with the failure profile as
        // hard-failure correction context, then re-validate. Do not retry further.
        const anchorFailureSummary = anchorViolationsBlock
            ? `Anchor contract violations:\n${anchorViolationsBlock}`
            : '';
        const lintFailureSummary = stillsLint.blockingIssues.length > 0
            ? `Lint blockers:\n${stillsLint.blockingIssues.map(i => `[${i.code}] ${i.message}`).join('\n')}`
            : '';
        const correctionContext = [anchorFailureSummary, lintFailureSummary].filter(Boolean).join('\n\n');

        console.log(`[brief-engine] whole-set failure for ${campaign.id}: all ${allFailingIds.length} stills failed — regenerating with correction context`);
        const endWholeRegen = stageTimer('whole-set-regeneration', campaign.id, timingPass.stages);
        landingStillBible = await generateLandingStillBible(campaign, brief, anchors, {
            correctionContext,
            instructions: options?.instructions,
        });
        endWholeRegen();
        landingStillBible = normalizeEditorialCompositions(landingStillBible);
        landingStillBible = normalizeEditorialUsage(landingStillBible);

        anchorCompliance = validateAnchorCompliance(anchors.anchors, landingStillBible);
        anchorViolationsBlock = formatViolationsForRepair(anchorCompliance.violations);
        stillsLint = lintProductionBuild({
            landingStillBible,
            themeName: campaign.name,
            nicheKeywords: expandedNicheKeywords,
        });

        wholeSetRegenerationUsed = true;
        if (!anchorCompliance.passed) {
            console.log(`[brief-engine] post-whole-set-regen anchor violations remain: ${anchorCompliance.violations.length}`);
        }
    }

    const structuralViolations = anchorCompliance.violations.filter(v => v.violationType === 'missing_anchor_binding');
    const contentViolations = anchorCompliance.violations.filter(v => v.violationType !== 'missing_anchor_binding');
    if (structuralViolations.length > 0 || contentViolations.length > 4) {
        throw new Error(`Anchor compliance unresolved after repair/regeneration (${anchorCompliance.violations.length} violation(s): ${structuralViolations.length} structural, ${contentViolations.length} content).`);
    } else if (contentViolations.length > 0) {
        console.log(`[brief-engine] ${contentViolations.length} content anchor violation(s) tolerated for ${campaign.id} — production lint will catch downstream impact`);
        for (const v of contentViolations) {
            console.log(`  [anchor-warn] still=${v.stillId} type=${v.violationType} expected="${v.expected}" actual="${v.actual}"`);
        }
    }

    // ── Step 6: Production bible from validated stills ────────────────────
    const endProdBible = stageTimer('production-bible-generation', campaign.id, timingPass.stages);
    let productionBible: ProductionBible = await generateProductionBibleFromStills(campaign, brief, landingStillBible, { instructions: options?.instructions });
    endProdBible();

    // ── Step 6.5: Deterministic avoidList → avoidDirectives carry-through ──
    // validation.ts checkAvoidDirectiveCoverage requires at least one
    // brief.visual.avoidList term (≥4 chars) to appear in avoidDirectives.
    // Inject any missing terms so the check always passes regardless of LLM output.
    const briefAvoidList = brief.visual?.avoidList ?? [];
    if (briefAvoidList.length > 0) {
        const existingDirectivesText = (productionBible.avoidDirectives ?? []).join(' ').toLowerCase();
        const missingTerms = briefAvoidList.filter(
            term => term.length >= 4 && !existingDirectivesText.includes(term.toLowerCase()),
        );
        if (missingTerms.length > 0) {
            productionBible = {
                ...productionBible,
                avoidDirectives: [
                    ...(productionBible.avoidDirectives ?? []),
                    ...missingTerms.map(term => `Avoid: ${term}`),
                ],
            };
            console.log(`[brief-engine] avoidList carry-through: injected ${missingTerms.length} term(s) into avoidDirectives for ${campaign.id}`);
        }
    }

    // ── Step 7: Final lint including production bible ─────────────────────
    const finalLint = lintProductionBuild({
        landingStillBible,
        productionBible,
        themeName: campaign.name,
        nicheKeywords: expandedNicheKeywords,
    });

    const totalSec = ((Date.now() - bundleStart) / 1000).toFixed(1);
    timingPass.totalElapsedMs = Date.now() - bundleStart;
    console.log(`[brief-engine:bundle] END   full bundle (${campaign.id}) — total ${totalSec}s | lint=${finalLint.verdict}`);

    return {
        ...brief,
        landingStillBible,
        productionBible,
        productionBuildLint: finalLint,
        productionBuildStatus: finalLint.verdict,
        productionBuildEvaluatedAt: finalLint.evaluatedAt,
        isolatedStillRevisionUsed,
        wholeSetRegenerationUsed,
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
        nicheKeywords: getExpandedNicheKeywords(campaign),
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

async function computeReadiness(brief: CampaignAestheticBrief, campaign: Campaign): Promise<{ readiness: ReadinessState; brief: CampaignAestheticBrief; issues: ValidationIssue[]; summary: string }> {
    // Recompute lint from saved still data to catch stale-state drift before applying gates.
    const { resolvedBrief, drifted } = await recomputeAndResyncLint(brief, campaign);
    const effectiveBrief = resolvedBrief;
    if (drifted) {
        console.log(`[brief-engine] computeReadiness used resynced lint for ${campaign.id}`);
    }

    if (effectiveBrief.humanReviewStatus === 'approved') {
        const validation = validateBrief(effectiveBrief, campaign);
        if (!validation.passed) {
            return { readiness: 'needs_review', brief: effectiveBrief, issues: validation.issues, summary: `Approved brief has new issues: ${validation.summary}` };
        }
        // ── Production build lint gate — must match media-orchestrator spend-gated semantics ──
        if (!effectiveBrief.productionBuildStatus || !effectiveBrief.landingStillBible) {
            return { readiness: 'needs_review', brief: effectiveBrief, issues: [], summary: 'Production build has not been evaluated. Regenerate the brief bundle to run pre-media lint before approving.' };
        }
        if (effectiveBrief.productionBuildStatus === 'fail') {
            const productionIssues = mapProductionBuildLintIssues(effectiveBrief);
            const blockingCount = effectiveBrief.productionBuildLint?.blockingIssues.length ?? 0;
            return {
                readiness: 'needs_review',
                brief: effectiveBrief,
                issues: productionIssues,
                summary: `Production build lint failed (${blockingCount} blocker${blockingCount === 1 ? '' : 's'}). Downstream media generation would reject this brief. Review the production build issues below, then regenerate to resolve them.`,
            };
        }
        return { readiness: 'ready_for_media', brief: effectiveBrief, issues: [], summary: 'Brief is approved and passes all structural and production-build checks.' };
    }

    const validation = validateBrief(effectiveBrief, campaign);
    if (validation.passed) {
        return { readiness: 'needs_review', brief: effectiveBrief, issues: [], summary: 'Brief passes structural checks but needs human approval.' };
    }
    return { readiness: 'needs_review', brief: effectiveBrief, issues: validation.issues, summary: validation.summary };
}

// ────────────────────────────────────────────────────────────────────────────
// 1. create_or_refresh_brief
//    Single orchestration entry point used by both UI and agent callers.
//    Flow: generate bundle → validate → auto-fix → re-validate →
//          if still blocked: one corrective reprompt → final validate → stop.
// ────────────────────────────────────────────────────────────────────────────

export async function createOrRefreshBrief(slug: string, options?: { instructions?: string }): Promise<BriefEngineResult> {
    const warnings: string[] = [];
    const timings: BriefTimingPass[] = [];

    const campaign = await getCampaignBlueprint(slug);
    if (!campaign) throw new Error(`Campaign not found: ${slug}`);

    console.log(`[brief-engine] create_or_refresh for ${slug}`);

    activeBriefTimingSnapshots.set(slug, timings);

    try {
        // ── First generation pass: full bundle ────────────────────────────
        let isolatedStillRevisionUsed = false;
        let wholeSetRegenerationUsed = false;
        const initialTimingPass: BriefTimingPass = {
            passLabel: 'initial',
            totalElapsedMs: null,
            stages: [],
        };
        timings.push(initialTimingPass);
        const firstBundle = await generateFullBriefBundle(campaign, initialTimingPass, { instructions: options?.instructions });
        isolatedStillRevisionUsed = firstBundle.isolatedStillRevisionUsed;
        wholeSetRegenerationUsed = firstBundle.wholeSetRegenerationUsed;
        let brief: CampaignAestheticBrief = firstBundle;

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

                const correctiveTimingPass: BriefTimingPass = {
                    passLabel: 'corrective_reprompt',
                    totalElapsedMs: null,
                    stages: [],
                };
                timings.push(correctiveTimingPass);
                const repromptBundle = await generateFullBriefBundle(campaign, correctiveTimingPass, {
                    correctionContext,
                    instructions: options?.instructions,
                });
                isolatedStillRevisionUsed = isolatedStillRevisionUsed || repromptBundle.isolatedStillRevisionUsed;
                wholeSetRegenerationUsed = wholeSetRegenerationUsed || repromptBundle.wholeSetRegenerationUsed;
                brief = repromptBundle;
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
            timings,
            autoFixApplied,
            fixedCodes,
            correctiveRepromptUsed,
            isolatedStillRevisionUsed,
            wholeSetRegenerationUsed,
        };
    } finally {
        // Keep diagnostics from failed runs so they survive route timeout.
        // We detect failure by checking whether execution reached the try-return
        // above. If the timing passes still have null totalElapsedMs the run did
        // not complete; persist them as a failure diagnostic.
        const snapshot = activeBriefTimingSnapshots.get(slug) ?? [];
        const isIncomplete = snapshot.some((pass) => pass.totalElapsedMs === null);
        if (isIncomplete) {
            briefFailureDiagnostics.set(slug, {
                slug,
                failedAt: new Date().toISOString(),
                errorMessage: 'Generation did not complete — partial timing snapshot preserved.',
                timings: snapshot.map((pass) => ({
                    passLabel: pass.passLabel,
                    totalElapsedMs: pass.totalElapsedMs,
                    stages: pass.stages.map((stage) => ({ ...stage })),
                })),
            });
            console.log(`[brief-engine] failure diagnostics persisted for ${slug}: ${snapshot.length} pass(es), ${snapshot.reduce((acc, p) => acc + p.stages.length, 0)} stage(s)`);
        }
        activeBriefTimingSnapshots.delete(slug);
    }
}

export function getBriefTimingSnapshot(slug: string): BriefTimingPass[] {
    const snapshot = activeBriefTimingSnapshots.get(slug) ?? [];
    return snapshot.map((pass) => ({
        passLabel: pass.passLabel,
        totalElapsedMs: pass.totalElapsedMs,
        stages: pass.stages.map((stage) => ({ ...stage })),
    }));
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
    let isolatedStillRevisionUsed = false;
    const revisionTimings: BriefTimingPass[] = [];
    if (revision.instructions) {
        const revTimingPass: BriefTimingPass = { passLabel: 'initial', totalElapsedMs: null, stages: [] };
        revisionTimings.push(revTimingPass);
        const revBundle = await generateFullBriefBundle(campaign, revTimingPass, { correctionContext: revision.instructions });
        isolatedStillRevisionUsed = revBundle.isolatedStillRevisionUsed;
        brief = revBundle;
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
        timings: revisionTimings,
        autoFixApplied,
        fixedCodes,
        correctiveRepromptUsed: false,
        isolatedStillRevisionUsed,
        wholeSetRegenerationUsed: false,
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

    const readinessResult = await computeReadiness(brief, campaign);
    return {
        readiness: readinessResult.readiness,
        brief: readinessResult.brief,
        issues: readinessResult.issues,
        summary: readinessResult.summary,
        campaignName: campaign.name,
    };
}

// ────────────────────────────────────────────────────────────────────────────
// 4. approve_for_media
// ────────────────────────────────────────────────────────────────────────────

export async function approveForMedia(slug: string): Promise<ApprovalResult> {
    const campaign = await getCampaignBlueprint(slug);
    if (!campaign) throw new Error(`Campaign not found: ${slug}`);

    const storedBrief = await getAestheticBrief(slug);
    if (!storedBrief) throw new Error(`No brief exists for ${slug}.`);

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
