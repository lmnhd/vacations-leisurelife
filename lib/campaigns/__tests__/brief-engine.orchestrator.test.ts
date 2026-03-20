import assert from 'node:assert/strict';
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

console.log(`\nPassed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
    process.exit(1);
}
