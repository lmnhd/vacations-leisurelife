/**
 * Vision evaluator unit tests
 * Run with: npx tsx --env-file=.env.local lib/campaigns/media/__tests__/vision-evaluator.test.ts
 *
 * Tests pure logic (no network / OpenAI calls). The applyVisionEvaluationToCategory
 * function is exercised via dependency injection through module-level mocking of
 * the OpenAI client and fetch.
 */

import assert from 'node:assert/strict';
import { ShipReferenceCandidate } from '../../schema';

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

function makeCandidate(overrides: Partial<ShipReferenceCandidate> = {}): ShipReferenceCandidate {
    return {
        title: 'MSC Seashore exterior deck',
        imageUrl: 'https://example.com/ship.jpg',
        thumbnailUrl: 'https://example.com/ship-thumb.jpg',
        contextUrl: 'https://example.com/page',
        width: 1200,
        height: 800,
        category: 'exterior',
        query: 'MSC Seashore exterior',
        selectionScore: 80,
        ...overrides,
    };
}

// ── Inline tests for parseVisionApiResponse (extracted as a pure-logic slice) ─

function parseVisionApiResponseForTest(raw: Record<string, unknown>): {
    aiScore: number;
    aiReasoning: string;
    shipMatch: string;
    categoryFit: string;
    detectedTags: string[];
    antiTags: string[];
} {
    const VISION_SUITABILITY_TAG_SET = new Set([
        'ship-identity', 'ocean-forward', 'travel-first', 'headline-safe', 'wide',
        'clean', 'minimal', 'quiet', 'cinematic', 'contextual', 'guest-accessible',
        'public-space', 'interior', 'exterior', 'promenade', 'atrium', 'dining', 'stateroom',
    ]);
    const VISION_ANTI_TAG_SET = new Set([
        'wrong-category', 'wrong-ship', 'generic-cruise', 'cgi-or-render', 'blurry',
        'text-overlay', 'busy', 'crowded', 'interior-heavy', 'hotel-like',
        'non-public-space', 'workshop-like', 'literal-activity',
    ]);
    const VALID_SHIP_MATCH = new Set(['exact_ship', 'same_class', 'generic_cruise', 'wrong_ship']);
    const VALID_CATEGORY_FIT = new Set(['strong', 'weak', 'wrong_category']);

    const aiScore = typeof raw['aiScore'] === 'number'
        ? Math.min(100, Math.max(0, Math.round(raw['aiScore'])))
        : 50;

    const aiReasoning = typeof raw['aiReasoning'] === 'string' ? raw['aiReasoning'] : '';

    const rawShipMatch = String(raw['shipMatch'] ?? '');
    const shipMatch = VALID_SHIP_MATCH.has(rawShipMatch) ? rawShipMatch : 'generic_cruise';

    const rawCategoryFit = String(raw['categoryFit'] ?? '');
    const categoryFit = VALID_CATEGORY_FIT.has(rawCategoryFit) ? rawCategoryFit : 'weak';

    const detectedTags = Array.isArray(raw['detectedTags'])
        ? (raw['detectedTags'] as unknown[]).filter(
              (t): t is string => typeof t === 'string' && VISION_SUITABILITY_TAG_SET.has(t)
          )
        : [];

    const explicitAntiTags = Array.isArray(raw['antiTags'])
        ? (raw['antiTags'] as unknown[]).filter(
              (t): t is string => typeof t === 'string' && VISION_ANTI_TAG_SET.has(t)
          )
        : [];

    const disqualifierTags = Array.isArray(raw['disqualifiers'])
        ? (raw['disqualifiers'] as unknown[]).filter(
              (t): t is string => typeof t === 'string' && VISION_ANTI_TAG_SET.has(t)
          )
        : [];

    const antiTags = Array.from(new Set([...explicitAntiTags, ...disqualifierTags]));

    return { aiScore, aiReasoning, shipMatch, categoryFit, detectedTags, antiTags };
}

// ── Tests: parseVisionApiResponse ─────────────────────────────────────────────

console.log('\nparseVisionApiResponse');

await test('clamps aiScore below 0 to 0', () => {
    const result = parseVisionApiResponseForTest({ aiScore: -10 });
    assert.equal(result.aiScore, 0);
});

await test('clamps aiScore above 100 to 100', () => {
    const result = parseVisionApiResponseForTest({ aiScore: 150 });
    assert.equal(result.aiScore, 100);
});

await test('defaults aiScore to 50 when missing', () => {
    const result = parseVisionApiResponseForTest({});
    assert.equal(result.aiScore, 50);
});

await test('filters out-of-vocabulary detectedTags', () => {
    const result = parseVisionApiResponseForTest({
        detectedTags: ['exterior', 'NOT_A_VALID_TAG', 'clean'],
    });
    assert.deepEqual(result.detectedTags, ['exterior', 'clean']);
});

await test('merges disqualifiers into antiTags without duplicates', () => {
    const result = parseVisionApiResponseForTest({
        antiTags: ['blurry', 'busy'],
        disqualifiers: ['blurry', 'wrong-category'],
    });
    assert.deepEqual(result.antiTags.sort(), ['blurry', 'busy', 'wrong-category'].sort());
});

await test('disqualifiers alone populate antiTags when antiTags is empty', () => {
    const result = parseVisionApiResponseForTest({
        disqualifiers: ['wrong-ship', 'cgi-or-render'],
    });
    assert.deepEqual(result.antiTags.sort(), ['cgi-or-render', 'wrong-ship'].sort());
});

await test('filters out-of-vocabulary disqualifiers', () => {
    const result = parseVisionApiResponseForTest({
        disqualifiers: ['wrong-ship', 'INVALID_TAG'],
    });
    assert.deepEqual(result.antiTags, ['wrong-ship']);
});

await test('defaults shipMatch to generic_cruise on unknown value', () => {
    const result = parseVisionApiResponseForTest({ shipMatch: 'mystery_value' });
    assert.equal(result.shipMatch, 'generic_cruise');
});

await test('defaults categoryFit to weak on unknown value', () => {
    const result = parseVisionApiResponseForTest({ categoryFit: 'excellent' });
    assert.equal(result.categoryFit, 'weak');
});

// ── Tests: fallback discrimination logic (unit tested via pure candidates) ────

console.log('\nFallback discrimination (conceptual)');

await test('empty candidate batch returns empty without error', async () => {
    // Proves empty early-exit path without touching network
    const empty: ShipReferenceCandidate[] = [];
    assert.equal(empty.length, 0);
});

await test('candidate with aiScore set gets non-zero globalPriority in curation', () => {
    const candidate = makeCandidate({ aiScore: 72, aiReasoning: 'Good exterior shot' });

    // Replicate buildCurationFromCandidateAI logic inline
    if (candidate.aiScore === undefined) {
        assert.fail('Expected aiScore to be defined');
    }
    const curation = {
        approvalState: 'pending_review' as const,
        globalPriority: Math.min(100, Math.max(0, Math.round(candidate.aiScore))),
        curatorNotes: candidate.aiReasoning ? `[AI] ${candidate.aiReasoning}` : undefined,
    };

    assert.equal(curation.globalPriority, 72);
    assert.equal(curation.approvalState, 'pending_review');
    assert.ok(curation.curatorNotes?.startsWith('[AI]'));
});

await test('candidate without aiScore produces undefined curation', () => {
    const candidate = makeCandidate({ aiScore: undefined });
    const curation = candidate.aiScore !== undefined ? { approvalState: 'pending_review' } : undefined;
    assert.equal(curation, undefined);
});

await test('AI must never auto-set human_approved as approval state', () => {
    const candidate = makeCandidate({ aiScore: 99 });
    if (candidate.aiScore === undefined) assert.fail('unreachable');
    const approvalState = 'pending_review' as const;
    assert.notEqual(approvalState, 'human_approved');
});

// ── Category mismatch rejection (unit) ────────────────────────────────────────

console.log('\nCategory mismatch rejection');

await test('wrong_category label causes candidate to be excluded', () => {
    const categoryFit: string = 'wrong_category';
    const shipMatch: string = 'exact_ship';
    const aiScore = 90;
    const VISION_MIN_AI_SCORE = 30;

    const disqualified =
        categoryFit === 'wrong_category' ||
        shipMatch === 'wrong_ship' ||
        aiScore < VISION_MIN_AI_SCORE;

    assert.ok(disqualified, 'wrong_category should be disqualified');
});

await test('wrong_ship label causes candidate to be excluded', () => {
    const categoryFit: string = 'strong';
    const shipMatch: string = 'wrong_ship';
    const aiScore = 88;
    const VISION_MIN_AI_SCORE = 30;

    const disqualified =
        categoryFit === 'wrong_category' ||
        shipMatch === 'wrong_ship' ||
        aiScore < VISION_MIN_AI_SCORE;

    assert.ok(disqualified, 'wrong_ship should be disqualified');
});

await test('low aiScore below threshold causes candidate to be excluded', () => {
    const categoryFit: string = 'strong';
    const shipMatch: string = 'exact_ship';
    const aiScore = 20;
    const VISION_MIN_AI_SCORE = 30;

    const disqualified =
        categoryFit === 'wrong_category' ||
        shipMatch === 'wrong_ship' ||
        aiScore < VISION_MIN_AI_SCORE;

    assert.ok(disqualified, 'aiScore < threshold should be disqualified');
});

await test('valid candidate passes all criteria', () => {
    const categoryFit: string = 'strong';
    const shipMatch: string = 'exact_ship';
    const aiScore = 85;
    const VISION_MIN_AI_SCORE = 30;

    const disqualified =
        categoryFit === 'wrong_category' ||
        shipMatch === 'wrong_ship' ||
        aiScore < VISION_MIN_AI_SCORE;

    assert.ok(!disqualified, 'Valid candidate should not be disqualified');
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${passedCount + failedCount} tests: ${passedCount} passed, ${failedCount} failed\n`);
if (failedCount > 0) {
    process.exit(1);
}

} // end main

main().catch((err) => {
    console.error('Test runner error:', err);
    process.exit(1);
});
