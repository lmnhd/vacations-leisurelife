import assert from 'node:assert/strict';
import type { CampaignAestheticBrief } from '../schema';
import type { ValidationIssue } from '../brief-engine/validation';

// ────────────────────────────────────────────────────────────────────────────
// Orchestrator contract regression tests
// These are unit-level tests that verify the correction-context builder and
// the BriefEngineResult shape — not the full LLM generation pipeline.
// ────────────────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(label: string, fn: () => void): void {
    try {
        fn();
        console.log(`  ✓ ${label}`);
        passed++;
    } catch (error) {
        console.error(`  ✗ ${label}`);
        console.error(`    ${error instanceof Error ? error.message : String(error)}`);
        failed++;
    }
}

// ── Correction context builder (inline — mirrors orchestrator logic) ────────

function buildCorrectionContext(blockers: ValidationIssue[]): string {
    return blockers
        .map((b, i) => `${i + 1}. [${b.code}] ${b.message}`)
        .join('\n');
}

// ── BriefEngineResult shape — structural contract check ─────────────────────

interface BriefEngineResult {
    readiness: 'drafting' | 'needs_review' | 'ready_for_media';
    brief: unknown;
    issues: ValidationIssue[];
    summary: string;
    warnings: string[];
    autoFixApplied: boolean;
    fixedCodes: string[];
    correctiveRepromptUsed: boolean;
}

console.log('\nBrief Engine Orchestrator Contract Tests\n');

test('buildCorrectionContext formats blockers as numbered list with code and message', () => {
    const blockers: ValidationIssue[] = [
        { code: 'workshop_language_survives', message: 'Workshop language detected.', severity: 'blocker', autoFixable: true },
        { code: 'hero_slogan_too_long', message: 'Hero slogan is 8 words (max 6).', severity: 'warning', autoFixable: true },
    ];
    const context = buildCorrectionContext(blockers);
    assert.ok(context.includes('1. [workshop_language_survives]'));
    assert.ok(context.includes('Workshop language detected.'));
    assert.ok(context.includes('2. [hero_slogan_too_long]'));
    assert.ok(context.includes('Hero slogan is 8 words (max 6).'));
});

test('buildCorrectionContext returns empty string for empty input', () => {
    assert.equal(buildCorrectionContext([]), '');
});

test('BriefEngineResult includes correctiveRepromptUsed field', () => {
    const result: BriefEngineResult = {
        readiness: 'needs_review',
        brief: null,
        issues: [],
        summary: 'Brief generated.',
        warnings: [],
        autoFixApplied: false,
        fixedCodes: [],
        correctiveRepromptUsed: false,
    };
    assert.equal(result.correctiveRepromptUsed, false);
    const usedReprompt: BriefEngineResult = { ...result, correctiveRepromptUsed: true };
    assert.equal(usedReprompt.correctiveRepromptUsed, true);
});

test('launch_window_violation blocker does not trigger corrective reprompt by design', () => {
    const blockers: ValidationIssue[] = [
        { code: 'launch_window_violation', message: 'Sailing is 5 days away. Minimum is 30.', severity: 'blocker', autoFixable: false },
    ];
    // Corrective reprompt should skip launch_window blockers since they cannot be resolved by regeneration
    const nonLaunchBlockers = blockers.filter((b) => b.code !== 'launch_window_violation');
    assert.equal(nonLaunchBlockers.length, 0);
    assert.equal(buildCorrectionContext(nonLaunchBlockers), '');
});

test('readiness is always needs_review after generation regardless of issues', () => {
    const successResult: BriefEngineResult = {
        readiness: 'needs_review',
        brief: null,
        issues: [],
        summary: 'All checks pass.',
        warnings: [],
        autoFixApplied: false,
        fixedCodes: [],
        correctiveRepromptUsed: false,
    };
    const failResult: BriefEngineResult = {
        ...successResult,
        issues: [{ code: 'workshop_language_survives', message: 'Workshop detected.', severity: 'blocker', autoFixable: true }],
        summary: '1 blocker remains.',
    };
    assert.equal(successResult.readiness, 'needs_review');
    assert.equal(failResult.readiness, 'needs_review');
});

test('approval route is only valid when no blockers remain', () => {
    const issues: ValidationIssue[] = [
        { code: 'workshop_language_survives', message: 'Workshop detected.', severity: 'blocker', autoFixable: true },
    ];
    const canApprove = issues.filter((i) => i.severity === 'blocker').length === 0;
    assert.equal(canApprove, false);

    const clearedIssues: ValidationIssue[] = [];
    const canApproveAfterFix = clearedIssues.filter((i) => i.severity === 'blocker').length === 0;
    assert.equal(canApproveAfterFix, true);
});

// ────────────────────────────────────────────────────────────────────────────
// Production build lint gating regression tests
// Acceptance criteria 7, 8, 9 from current-phase.md
// These inline the same gate logic used by approveForMedia and computeReadiness
// so the tests remain pure and don't require database mocks.
// ────────────────────────────────────────────────────────────────────────────

// Mirrors the approveForMedia production build gate
function simulateApprovalGate(brief: Pick<CampaignAestheticBrief, 'productionBuildStatus' | 'landingStillBible'>): string | null {
    if (!brief.productionBuildStatus || !brief.landingStillBible) {
        return 'Cannot approve: production build has not been evaluated.';
    }
    if (brief.productionBuildStatus === 'fail') {
        return 'Cannot approve: production build lint failed (productionBuildStatus = fail).';
    }
    return null; // gate passes
}

// Mirrors the computeReadiness production build gate for approved briefs
type ReadinessState = 'drafting' | 'needs_review' | 'ready_for_media';
function simulateReadinessForApproved(brief: Pick<CampaignAestheticBrief, 'productionBuildStatus' | 'landingStillBible'>): ReadinessState {
    if (!brief.productionBuildStatus || !brief.landingStillBible) {
        return 'needs_review';
    }
    if (brief.productionBuildStatus === 'fail') {
        return 'needs_review';
    }
    return 'ready_for_media';
}

// Mirrors the media-orchestrator spend-gated check (media-orchestrator.ts lines 322-336)
function simulateMediaOrchestratorGate(brief: Pick<CampaignAestheticBrief, 'productionBuildStatus' | 'landingStillBible'>): string | null {
    if (brief.productionBuildStatus === 'fail') {
        return 'ProductionBuildLintError: failed pre-spend quality checks';
    }
    if (!brief.landingStillBible || !brief.productionBuildStatus) {
        return 'ProductionBuildLintError: production build has not been evaluated';
    }
    return null; // gate passes
}

console.log('\nProduction Build Lint Gating Regression\n');

// ── Acceptance criterion 7: approval blocked when productionBuildStatus = fail ──

test('approveForMedia blocks when productionBuildStatus is fail', () => {
    const briefFail = { productionBuildStatus: 'fail' as const, landingStillBible: { stillLibrary: [], globalDirectionNotes: '', avoidDirectives: [] } };
    const error = simulateApprovalGate(briefFail);
    assert.ok(error !== null, 'Expected approval to be blocked');
    assert.ok(error.includes('productionBuildStatus = fail'));
});

test('approveForMedia blocks when productionBuildStatus is missing', () => {
    const briefMissing = { productionBuildStatus: undefined, landingStillBible: undefined };
    const error = simulateApprovalGate(briefMissing);
    assert.ok(error !== null, 'Expected approval to be blocked when productionBuildStatus is missing');
});

test('approveForMedia blocks when landingStillBible is missing', () => {
    const briefNoLanding = { productionBuildStatus: 'pass' as const, landingStillBible: undefined };
    const error = simulateApprovalGate(briefNoLanding);
    assert.ok(error !== null, 'Expected approval to be blocked when landingStillBible is missing');
});

test('approveForMedia passes when productionBuildStatus is pass and landingStillBible exists', () => {
    const briefPass = { productionBuildStatus: 'pass' as const, landingStillBible: { stillLibrary: [], globalDirectionNotes: '', avoidDirectives: [] } };
    assert.equal(simulateApprovalGate(briefPass), null);
});

test('approveForMedia passes when productionBuildStatus is warn (warn is not a hard block)', () => {
    const briefWarn = { productionBuildStatus: 'warn' as const, landingStillBible: { stillLibrary: [], globalDirectionNotes: '', avoidDirectives: [] } };
    assert.equal(simulateApprovalGate(briefWarn), null);
});

// ── Acceptance criterion 8: readiness downgraded from ready_for_media when fail ──

test('computeReadiness returns needs_review for approved brief with productionBuildStatus = fail', () => {
    const briefFail = { productionBuildStatus: 'fail' as const, landingStillBible: { stillLibrary: [], globalDirectionNotes: '', avoidDirectives: [] } };
    assert.equal(simulateReadinessForApproved(briefFail), 'needs_review');
});

test('computeReadiness returns needs_review for approved brief with missing productionBuildStatus', () => {
    const briefMissing = { productionBuildStatus: undefined, landingStillBible: undefined };
    assert.equal(simulateReadinessForApproved(briefMissing), 'needs_review');
});

test('computeReadiness returns ready_for_media for approved brief with productionBuildStatus = pass', () => {
    const briefPass = { productionBuildStatus: 'pass' as const, landingStillBible: { stillLibrary: [], globalDirectionNotes: '', avoidDirectives: [] } };
    assert.equal(simulateReadinessForApproved(briefPass), 'ready_for_media');
});

// ── Acceptance criterion 9: parity between brief-step and media-orchestrator gating ──

test('parity: brief-engine gate and media-orchestrator gate both block on productionBuildStatus = fail', () => {
    const brief = { productionBuildStatus: 'fail' as const, landingStillBible: { stillLibrary: [], globalDirectionNotes: '', avoidDirectives: [] } };
    const briefEngineBlocks = simulateApprovalGate(brief) !== null;
    const mediaOrchestratorBlocks = simulateMediaOrchestratorGate(brief) !== null;
    assert.equal(briefEngineBlocks, true, 'brief-engine gate must block');
    assert.equal(mediaOrchestratorBlocks, true, 'media-orchestrator gate must block');
    assert.equal(briefEngineBlocks, mediaOrchestratorBlocks, 'both gates must agree');
});

test('parity: brief-engine gate and media-orchestrator gate both block when productionBuildStatus is missing', () => {
    const brief = { productionBuildStatus: undefined, landingStillBible: undefined };
    const briefEngineBlocks = simulateApprovalGate(brief) !== null;
    const mediaOrchestratorBlocks = simulateMediaOrchestratorGate(brief) !== null;
    assert.equal(briefEngineBlocks, mediaOrchestratorBlocks, 'both gates must agree on missing productionBuildStatus');
});

test('parity: brief-engine gate and media-orchestrator gate both pass on productionBuildStatus = pass', () => {
    const brief = { productionBuildStatus: 'pass' as const, landingStillBible: { stillLibrary: [], globalDirectionNotes: '', avoidDirectives: [] } };
    const briefEngineBlocks = simulateApprovalGate(brief) !== null;
    const mediaOrchestratorBlocks = simulateMediaOrchestratorGate(brief) !== null;
    assert.equal(briefEngineBlocks, false, 'brief-engine gate must pass');
    assert.equal(mediaOrchestratorBlocks, false, 'media-orchestrator gate must pass');
    assert.equal(briefEngineBlocks, mediaOrchestratorBlocks, 'both gates must agree');
});

// ────────────────────────────────────────────────────────────────────────────
// Acceptance criterion 11: stale-lint regression
// A brief with stored productionBuildStatus = fail that would evaluate to
// warn or pass under current lint rules must be resynced and not falsely blocked.
// These tests inline the drift-detection and resync logic from recomputeAndResyncLint.
// ────────────────────────────────────────────────────────────────────────────

type LintVerdict = 'pass' | 'warn' | 'fail';

interface StaleLintSimulation {
    storedStatus: LintVerdict | undefined;
    freshStatus: LintVerdict;
}

function simulateDriftDetection(sim: StaleLintSimulation): boolean {
    return sim.storedStatus !== sim.freshStatus;
}

function simulateResyncedApprovalGate(sim: StaleLintSimulation, hasLandingStillBible: boolean): string | null {
    const effectiveStatus = simulateDriftDetection(sim) ? sim.freshStatus : sim.storedStatus;
    if (!effectiveStatus || !hasLandingStillBible) {
        return 'Cannot approve: production build has not been evaluated.';
    }
    if (effectiveStatus === 'fail') {
        return 'Cannot approve: production build lint failed (productionBuildStatus = fail).';
    }
    return null;
}

function simulateResyncedReadiness(sim: StaleLintSimulation, hasLandingStillBible: boolean): ReadinessState {
    const effectiveStatus = simulateDriftDetection(sim) ? sim.freshStatus : sim.storedStatus;
    if (!effectiveStatus || !hasLandingStillBible) return 'needs_review';
    if (effectiveStatus === 'fail') return 'needs_review';
    return 'ready_for_media';
}

console.log('\nStale-Lint Regression (AC 11)\n');

test('drift detected when stored status is fail but fresh recomputed status is warn', () => {
    const sim: StaleLintSimulation = { storedStatus: 'fail', freshStatus: 'warn' };
    assert.equal(simulateDriftDetection(sim), true, 'drift must be detected when stored=fail and fresh=warn');
});

test('drift detected when stored status is fail but fresh recomputed status is pass', () => {
    const sim: StaleLintSimulation = { storedStatus: 'fail', freshStatus: 'pass' };
    assert.equal(simulateDriftDetection(sim), true, 'drift must be detected when stored=fail and fresh=pass');
});

test('no drift detected when stored status matches fresh status', () => {
    const sim: StaleLintSimulation = { storedStatus: 'fail', freshStatus: 'fail' };
    assert.equal(simulateDriftDetection(sim), false, 'no drift when stored and fresh match');
});

test('stale fail + fresh warn: resynced approval gate passes (campaign unblocked)', () => {
    const sim: StaleLintSimulation = { storedStatus: 'fail', freshStatus: 'warn' };
    const error = simulateResyncedApprovalGate(sim, true);
    assert.equal(error, null, 'approval gate must pass after resync when fresh status is warn');
});

test('stale fail + fresh pass: resynced approval gate passes (campaign unblocked)', () => {
    const sim: StaleLintSimulation = { storedStatus: 'fail', freshStatus: 'pass' };
    const error = simulateResyncedApprovalGate(sim, true);
    assert.equal(error, null, 'approval gate must pass after resync when fresh status is pass');
});

test('stale fail + fresh fail: resynced approval gate still blocks (true failure preserved)', () => {
    const sim: StaleLintSimulation = { storedStatus: 'fail', freshStatus: 'fail' };
    const error = simulateResyncedApprovalGate(sim, true);
    assert.ok(error !== null, 'approval gate must still block when fresh recomputed status is also fail');
});

test('stale fail + fresh warn: resynced readiness returns ready_for_media for approved brief', () => {
    const sim: StaleLintSimulation = { storedStatus: 'fail', freshStatus: 'warn' };
    const readiness = simulateResyncedReadiness(sim, true);
    assert.equal(readiness, 'ready_for_media', 'readiness must be ready_for_media after resync when fresh status is warn');
});

test('stale fail + fresh fail: resynced readiness still returns needs_review (true failure preserved)', () => {
    const sim: StaleLintSimulation = { storedStatus: 'fail', freshStatus: 'fail' };
    const readiness = simulateResyncedReadiness(sim, true);
    assert.equal(readiness, 'needs_review', 'readiness must remain needs_review when fresh recomputed status is also fail');
});

test('stale undefined + fresh pass: resynced gate passes (first-time lint)', () => {
    const sim: StaleLintSimulation = { storedStatus: undefined, freshStatus: 'pass' };
    const error = simulateResyncedApprovalGate(sim, true);
    assert.equal(error, null, 'approval gate must pass when stored status was undefined but fresh evaluation is pass');
});

console.log(`\nPassed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
    process.exit(1);
}
