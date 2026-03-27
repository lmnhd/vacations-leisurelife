/**
 * Probe evaluator unit tests
 * Run with: npx tsx --env-file=.env.local lib/campaigns/media/__tests__/probe-evaluator.test.ts
 *
 * Tests pure logic only — no network calls, no LLM calls.
 */

import assert from 'node:assert/strict';
import {
    deriveProbeStatus,
    buildReasonCodes,
    tryExtractJsonObject,
    parseProbeApiResponse,
    getSlotExpectations,
} from '../probe-evaluator';
import { deriveRunVerdict } from '../probe-engine';
import type { LandingStillSpec } from '../../schema';

async function main() {

// ── Helpers ───────────────────────────────────────────────────────────────────

let passedCount = 0;
let failedCount = 0;

async function test(label: string, fn: () => Promise<void> | void): Promise<void> {
    try {
        await fn();
        console.log(`  ✓ ${label}`);
        passedCount++;
    } catch (err) {
        console.error(`  ✗ ${label}`);
        console.error(`    ${err instanceof Error ? err.message : String(err)}`);
        failedCount++;
    }
}

function makeStillSpec(overrides: Partial<LandingStillSpec> = {}): LandingStillSpec {
    return {
        stillId: 'still-01',
        usage: 'hero_primary',
        location: 'pool deck',
        timeOfDay: 'golden hour',
        lighting: 'warm natural',
        composition: 'wide establishing',
        subjectAction: 'two friends playing a card game at a poolside table',
        environmentDetails: 'ocean horizon behind',
        mood: 'relaxed joy',
        imagePrompt: 'Two travelers playing a tabletop card game at a cruise ship pool deck during golden hour',
        referenceCategory: 'exterior',
        anchorId: 'anchor-01',
        slotRole: 'HERO_PRIMARY',
        nicheCarryThrough: 'tabletop',
        shotIntent: 'Wide hero shot establishing ship identity and tabletop niche',
        cameraDistance: 'wide',
        framingMode: 'two_shot',
        heroSubject: 'two friends at pool table',
        nicheCue: 'card game on table',
        antiFallbackNote: 'Not a generic sunbathing shot',
        referencePackId: 'ref-tabletop-v1',
        ...overrides,
    };
}

// ── deriveProbeStatus ─────────────────────────────────────────────────────────

console.log('\nderiveProbeStatus');

await test('high score + high role + no fallback → probe_pass', () => {
    assert.equal(deriveProbeStatus(70, 55, false), 'probe_pass');
});

await test('exactly at pass threshold → probe_pass', () => {
    assert.equal(deriveProbeStatus(65, 50, false), 'probe_pass');
});

await test('high score but fallback detected → probe_warn', () => {
    assert.equal(deriveProbeStatus(70, 55, true), 'probe_warn');
});

await test('high score but low role match → probe_warn', () => {
    assert.equal(deriveProbeStatus(70, 45, false), 'probe_warn');
});

await test('score in warn range → probe_warn', () => {
    assert.equal(deriveProbeStatus(50, 20, false), 'probe_warn');
});

await test('exactly at warn threshold → probe_warn', () => {
    assert.equal(deriveProbeStatus(40, 20, false), 'probe_warn');
});

await test('score below warn + role below 35 → probe_fail', () => {
    assert.equal(deriveProbeStatus(30, 20, false), 'probe_fail');
});

await test('zero scores → probe_fail', () => {
    assert.equal(deriveProbeStatus(0, 0, false), 'probe_fail');
});

await test('100 scores no fallback → probe_pass', () => {
    assert.equal(deriveProbeStatus(100, 100, false), 'probe_pass');
});

// ── buildReasonCodes ──────────────────────────────────────────────────────────

console.log('\nbuildReasonCodes');

await test('all good → empty codes', () => {
    const codes = buildReasonCodes({
        nicheSignalPresent: true,
        genericFallbackDetected: false,
        roleMatchScore: 80,
        aiScore: 75,
        slotRole: 'HERO_PRIMARY',
    });
    assert.deepEqual(codes, []);
});

await test('niche absent → niche_signal_absent', () => {
    const codes = buildReasonCodes({
        nicheSignalPresent: false,
        genericFallbackDetected: false,
        roleMatchScore: 80,
        aiScore: 75,
        slotRole: 'HERO_PRIMARY',
    });
    assert.ok(codes.includes('niche_signal_absent'));
});

await test('generic fallback → generic_fallback_detected', () => {
    const codes = buildReasonCodes({
        nicheSignalPresent: true,
        genericFallbackDetected: true,
        roleMatchScore: 80,
        aiScore: 75,
    });
    assert.ok(codes.includes('generic_fallback_detected'));
});

await test('low aiScore → subject_clarity_low', () => {
    const codes = buildReasonCodes({
        nicheSignalPresent: true,
        genericFallbackDetected: false,
        roleMatchScore: 80,
        aiScore: 30,
    });
    assert.ok(codes.includes('subject_clarity_low'));
});

await test('low roleMatchScore on HERO_PRIMARY → role_mismatch_hero_scale', () => {
    const codes = buildReasonCodes({
        nicheSignalPresent: true,
        genericFallbackDetected: false,
        roleMatchScore: 20,
        aiScore: 75,
        slotRole: 'HERO_PRIMARY',
    });
    assert.ok(codes.includes('role_mismatch_hero_scale'));
});

await test('low roleMatchScore on HERO_ALT → role_mismatch_hero_scale', () => {
    const codes = buildReasonCodes({
        nicheSignalPresent: true,
        genericFallbackDetected: false,
        roleMatchScore: 20,
        aiScore: 75,
        slotRole: 'HERO_ALT',
    });
    assert.ok(codes.includes('role_mismatch_hero_scale'));
});

await test('low roleMatchScore on INTIMATE → role_mismatch_intimate_scale', () => {
    const codes = buildReasonCodes({
        nicheSignalPresent: true,
        genericFallbackDetected: false,
        roleMatchScore: 20,
        aiScore: 75,
        slotRole: 'INTIMATE',
    });
    assert.ok(codes.includes('role_mismatch_intimate_scale'));
});

await test('low roleMatchScore on FLEX → composition_off_role', () => {
    const codes = buildReasonCodes({
        nicheSignalPresent: true,
        genericFallbackDetected: false,
        roleMatchScore: 20,
        aiScore: 75,
        slotRole: 'FLEX',
    });
    assert.ok(codes.includes('composition_off_role'));
});

await test('multiple failures → multiple codes', () => {
    const codes = buildReasonCodes({
        nicheSignalPresent: false,
        genericFallbackDetected: true,
        roleMatchScore: 20,
        aiScore: 30,
        slotRole: 'HERO_PRIMARY',
    });
    assert.ok(codes.includes('niche_signal_absent'));
    assert.ok(codes.includes('generic_fallback_detected'));
    assert.ok(codes.includes('subject_clarity_low'));
    assert.ok(codes.includes('role_mismatch_hero_scale'));
});

// ── deriveRunVerdict ──────────────────────────────────────────────────────────

console.log('\nderiveRunVerdict');

await test('6/6 pass → approved', () => {
    const { verdict } = deriveRunVerdict(6, 6);
    assert.equal(verdict, 'approved');
});

await test('4/6 pass → approved', () => {
    const { verdict } = deriveRunVerdict(4, 6);
    assert.equal(verdict, 'approved');
});

await test('3/6 pass → warn', () => {
    const { verdict } = deriveRunVerdict(3, 6);
    assert.equal(verdict, 'warn');
});

await test('2/6 pass → warn', () => {
    const { verdict } = deriveRunVerdict(2, 6);
    assert.equal(verdict, 'warn');
});

await test('1/6 pass → blocked', () => {
    const { verdict } = deriveRunVerdict(1, 6);
    assert.equal(verdict, 'blocked');
});

await test('0/6 pass → blocked', () => {
    const { verdict } = deriveRunVerdict(0, 6);
    assert.equal(verdict, 'blocked');
});

await test('verdictReason includes counts', () => {
    const { verdictReason } = deriveRunVerdict(4, 6);
    assert.ok(verdictReason.includes('4/6'));
});

// ── tryExtractJsonObject ──────────────────────────────────────────────────────

console.log('\ntryExtractJsonObject');

await test('plain JSON string → parsed object', () => {
    const result = tryExtractJsonObject('{"aiScore": 75, "aiReasoning": "good"}');
    assert.equal(result['aiScore'], 75);
});

await test('markdown-fenced JSON → parsed object', () => {
    const result = tryExtractJsonObject('```json\n{"aiScore": 80}\n```');
    assert.equal(result['aiScore'], 80);
});

await test('JSON embedded in prose → extracted', () => {
    const result = tryExtractJsonObject('Here is my result: {"aiScore": 60, "nicheSignalPresent": true} and that is it.');
    assert.equal(result['aiScore'], 60);
});

await test('empty string → throws', () => {
    assert.throws(() => tryExtractJsonObject(''));
});

await test('invalid JSON → throws', () => {
    assert.throws(() => tryExtractJsonObject('not json at all with no braces'));
});

// ── parseProbeApiResponse ─────────────────────────────────────────────────────

console.log('\nparseProbeApiResponse');

await test('full valid response → correct fields', () => {
    const spec = makeStillSpec();
    const result = parseProbeApiResponse({
        aiScore: 70,
        aiReasoning: 'Strong travel moment with niche cue visible.',
        nicheSignalPresent: true,
        roleMatchScore: 60,
        genericFallbackDetected: false,
    }, spec);
    assert.equal(result.aiScore, 70);
    assert.equal(result.probeStatus, 'probe_pass');
    assert.equal(result.nicheSignalPresent, true);
    assert.equal(result.stillId, 'still-01');
    assert.equal(result.slotRole, 'HERO_PRIMARY');
});

await test('missing fields default correctly', () => {
    const spec = makeStillSpec();
    const result = parseProbeApiResponse({}, spec);
    assert.equal(result.aiScore, 40);
    assert.equal(result.aiReasoning, '');
    assert.equal(result.nicheSignalPresent, false);
    assert.equal(result.roleMatchScore, 50);
    assert.equal(result.genericFallbackDetected, false);
});

await test('aiScore clamped to 0-100', () => {
    const spec = makeStillSpec();
    const over = parseProbeApiResponse({ aiScore: 200 }, spec);
    assert.equal(over.aiScore, 100);
    const under = parseProbeApiResponse({ aiScore: -50 }, spec);
    assert.equal(under.aiScore, 0);
});

await test('non-boolean nicheSignalPresent defaults to false', () => {
    const spec = makeStillSpec();
    const result = parseProbeApiResponse({ nicheSignalPresent: 'yes' }, spec);
    assert.equal(result.nicheSignalPresent, false);
});

await test('string nicheSignalPresent=true still false (strict boolean)', () => {
    const spec = makeStillSpec();
    const result = parseProbeApiResponse({ nicheSignalPresent: 'true' }, spec);
    assert.equal(result.nicheSignalPresent, false);
});

// ── getSlotExpectations ───────────────────────────────────────────────────────

console.log('\ngetSlotExpectations');

await test('HERO_PRIMARY contains "negative space"', () => {
    const text = getSlotExpectations('HERO_PRIMARY');
    assert.ok(text.toLowerCase().includes('negative space'), `Expected "negative space" in: ${text}`);
});

await test('INTIMATE contains "close" or "tight"', () => {
    const text = getSlotExpectations('INTIMATE');
    assert.ok(
        text.toLowerCase().includes('close') || text.toLowerCase().includes('tight'),
        `Expected "close" or "tight" in: ${text}`,
    );
});

await test('HERO_ALT contains "wide"', () => {
    const text = getSlotExpectations('HERO_ALT');
    assert.ok(text.toLowerCase().includes('wide'), `Expected "wide" in: ${text}`);
});

await test('unknown role falls back to FLEX text', () => {
    const text = getSlotExpectations('UNKNOWN_ROLE');
    const flexText = getSlotExpectations('FLEX');
    assert.equal(text, flexText);
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${passedCount + failedCount} tests: ${passedCount} passed, ${failedCount} failed\n`);
if (failedCount > 0) process.exit(1);

} // end main

main().catch((err) => {
    console.error('Test runner error:', err);
    process.exit(1);
});
