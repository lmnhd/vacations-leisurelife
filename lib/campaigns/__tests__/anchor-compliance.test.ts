import assert from 'node:assert/strict';
import { validateAnchorCompliance, extractViolationStillIds, formatViolationsForRepair } from '../editors-room';
import type { LandingStillSpec, LandingStillBible } from '../schema';

// ────────────────────────────────────────────────────────────────────────────
// Anchor Compliance Regression Tests
// Verifies deterministic structural enforcement of anchor-to-still binding.
// Pure unit tests — no LLM calls.
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

// ── Helpers ──────────────────────────────────────────────────────────────────

const ANCHORS = [
    { anchorId: 'anchor-1', nicheSignal: 'tabletop gaming', locationFamily: 'library' },
    { anchorId: 'anchor-2', nicheSignal: 'board games', locationFamily: 'pool deck' },
    { anchorId: 'anchor-3', nicheSignal: 'strategy cards', locationFamily: 'spa solarium' },
    { anchorId: 'anchor-4', nicheSignal: 'dice rolling', locationFamily: 'dining lounge' },
    { anchorId: 'anchor-5', nicheSignal: 'miniature painting', locationFamily: 'cabin balcony' },
    { anchorId: 'anchor-6', nicheSignal: 'game night', locationFamily: 'ship atrium' },
];

function makeStill(overrides: Partial<LandingStillSpec> & { stillId: string }): LandingStillSpec {
    return {
        stillId: overrides.stillId,
        usage: overrides.usage ?? 'hero_primary',
        location: overrides.location ?? 'library nook',
        timeOfDay: 'golden hour',
        lighting: 'warm ambient',
        composition: overrides.composition ?? 'wide establishing shot',
        subjectAction: overrides.subjectAction ?? 'A pair explores tabletop gaming in a cozy library nook',
        environmentDetails: overrides.environmentDetails ?? 'shelves of classic novels, leather armchairs',
        mood: 'belonging',
        imagePrompt: overrides.imagePrompt ?? 'Wide shot of two guests enjoying tabletop gaming in a cruise ship library',
        referenceCategory: 'interior',
        anchorId: overrides.anchorId ?? 'anchor-1',
        slotRole: overrides.slotRole ?? 'HERO_PRIMARY',
        nicheCarryThrough: overrides.nicheCarryThrough ?? 'tabletop gaming',
    };
}

function makeBible(stills: LandingStillSpec[]): LandingStillBible {
    return {
        stillLibrary: stills,
        globalDirectionNotes: 'test notes',
        avoidDirectives: ['No generic cruise scenes'],
    };
}

// ── Fully compliant set ─────────────────────────────────────────────────────

const COMPLIANT_STILLS: LandingStillSpec[] = [
    makeStill({
        stillId: 'still-1', anchorId: 'anchor-1', slotRole: 'HERO_PRIMARY', usage: 'hero_primary',
        location: 'library nook', environmentDetails: 'shelves and armchairs',
        imagePrompt: 'Wide shot of tabletop gaming in cruise library', subjectAction: 'Pair enjoys tabletop gaming',
        nicheCarryThrough: 'tabletop gaming', composition: 'wide establishing shot',
    }),
    makeStill({
        stillId: 'still-2', anchorId: 'anchor-2', slotRole: 'HERO_ALT', usage: 'hero_alt',
        location: 'pool deck lounge', environmentDetails: 'open air deck chairs',
        imagePrompt: 'Medium shot of board games by the pool', subjectAction: 'Friends playing board games on deck',
        nicheCarryThrough: 'board games', composition: 'medium over-shoulder',
    }),
    makeStill({
        stillId: 'still-3', anchorId: 'anchor-3', slotRole: 'EDITORIAL_WIDE_A', usage: 'concept',
        location: 'ship promenade', environmentDetails: 'open-air walkway with teak benches',
        imagePrompt: 'Editorial wide of strategy cards on promenade bench', subjectAction: 'Guest arranging strategy cards on the promenade',
        nicheCarryThrough: 'strategy cards', composition: 'wide overhead establishing',
    }),
    makeStill({
        stillId: 'still-4', anchorId: 'anchor-4', slotRole: 'EDITORIAL_WIDE_B', usage: 'email_header',
        location: 'dining lounge corner', environmentDetails: 'elegant booth seating',
        imagePrompt: 'Wide shot of dice rolling session in dining lounge', subjectAction: 'Pair engaged in dice rolling over cocktails',
        nicheCarryThrough: 'dice rolling', composition: 'wide environmental',
    }),
    makeStill({
        stillId: 'still-5', anchorId: 'anchor-5', slotRole: 'INTIMATE', usage: 'concept',
        location: 'cabin balcony', environmentDetails: 'private balcony with sea view',
        imagePrompt: 'Intimate close shot of miniature painting on cabin balcony', subjectAction: 'Solo guest focused on miniature painting',
        nicheCarryThrough: 'miniature painting', composition: 'intimate close-up detail',
    }),
    makeStill({
        stillId: 'still-6', anchorId: 'anchor-6', slotRole: 'FLEX', usage: 'social_square',
        location: 'ship atrium grand hall', environmentDetails: 'multi-story atrium',
        imagePrompt: 'Social shot of game night gathering in atrium', subjectAction: 'Community game night in the grand atrium',
        nicheCarryThrough: 'game night', composition: 'medium group shot',
    }),
];

// ────────────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────────────

console.log('\nAnchor Compliance — Fully Compliant Set\n');

test('fully compliant still set passes with zero violations', () => {
    const result = validateAnchorCompliance(ANCHORS, makeBible(COMPLIANT_STILLS));
    assert.equal(result.passed, true);
    assert.equal(result.violations.length, 0);
});

console.log('\nAnchor Compliance — missing_anchor_binding\n');

test('still with unknown anchorId triggers missing_anchor_binding', () => {
    const stills = [makeStill({ stillId: 'still-bad', anchorId: 'anchor-FAKE' })];
    const result = validateAnchorCompliance(ANCHORS, makeBible(stills));
    assert.equal(result.passed, false);
    const v = result.violations.find(v => v.violationType === 'missing_anchor_binding');
    assert.ok(v, 'expected missing_anchor_binding violation');
    assert.equal(v.stillId, 'still-bad');
});

test('still with empty anchorId triggers missing_anchor_binding', () => {
    const still = makeStill({ stillId: 'still-empty' });
    still.anchorId = undefined;
    const result = validateAnchorCompliance(ANCHORS, makeBible([still]));
    assert.equal(result.passed, false);
    assert.ok(result.violations.some(v => v.violationType === 'missing_anchor_binding'));
});

console.log('\nAnchor Compliance — niche_signal_dropped\n');

test('still missing anchor nicheSignal from imagePrompt triggers niche_signal_dropped', () => {
    const still = makeStill({
        stillId: 'still-no-niche', anchorId: 'anchor-1',
        imagePrompt: 'Wide shot of couple on cruise ship', // no "tabletop gaming"
        subjectAction: 'Pair enjoys tabletop gaming in library',
    });
    const result = validateAnchorCompliance(ANCHORS, makeBible([still]));
    const v = result.violations.find(v => v.violationType === 'niche_signal_dropped');
    assert.ok(v, 'expected niche_signal_dropped violation');
    assert.ok(v.actual.includes('imagePrompt'));
});

test('still missing anchor nicheSignal from subjectAction triggers niche_signal_dropped', () => {
    const still = makeStill({
        stillId: 'still-no-niche-act', anchorId: 'anchor-1',
        imagePrompt: 'Wide shot of tabletop gaming in library',
        subjectAction: 'Couple relaxing on deck', // no "tabletop gaming"
    });
    const result = validateAnchorCompliance(ANCHORS, makeBible([still]));
    const v = result.violations.find(v => v.violationType === 'niche_signal_dropped');
    assert.ok(v, 'expected niche_signal_dropped violation');
    assert.ok(v.actual.includes('subjectAction'));
});

test('still with nicheSignal in both fields passes niche check', () => {
    const still = makeStill({
        stillId: 'still-ok', anchorId: 'anchor-1',
        imagePrompt: 'Wide shot of tabletop gaming session', subjectAction: 'Guests playing tabletop gaming in library',
    });
    const result = validateAnchorCompliance(ANCHORS, makeBible([still]));
    assert.ok(!result.violations.some(v => v.violationType === 'niche_signal_dropped'));
});

console.log('\nAnchor Compliance — niche_carry_mismatch\n');

test('nicheCarryThrough not in imagePrompt triggers niche_carry_mismatch', () => {
    const still = makeStill({
        stillId: 'still-carry-bad', anchorId: 'anchor-1',
        imagePrompt: 'Wide shot of cruise library scene', // no "tabletop gaming"
        subjectAction: 'Pair enjoys tabletop gaming',
        nicheCarryThrough: 'tabletop gaming',
    });
    const result = validateAnchorCompliance(ANCHORS, makeBible([still]));
    const v = result.violations.find(v => v.violationType === 'niche_carry_mismatch');
    assert.ok(v, 'expected niche_carry_mismatch violation');
});

console.log('\nAnchor Compliance — duplicate_slot_role\n');

test('two stills with same slotRole triggers duplicate_slot_role', () => {
    const stills = [
        makeStill({ stillId: 'still-a', slotRole: 'HERO_PRIMARY', location: 'library', environmentDetails: 'books' }),
        makeStill({ stillId: 'still-b', slotRole: 'HERO_PRIMARY', location: 'spa terrace', environmentDetails: 'spa area' }),
    ];
    const result = validateAnchorCompliance(ANCHORS, makeBible(stills));
    const dupes = result.violations.filter(v => v.violationType === 'duplicate_slot_role');
    assert.equal(dupes.length, 2, 'both stills should be flagged');
});

console.log('\nAnchor Compliance — slot_usage_mismatch\n');

test('HERO_PRIMARY with usage != hero_primary triggers slot_usage_mismatch', () => {
    const still = makeStill({ stillId: 'still-wrong-usage', slotRole: 'HERO_PRIMARY', usage: 'concept' });
    const result = validateAnchorCompliance(ANCHORS, makeBible([still]));
    const v = result.violations.find(v => v.violationType === 'slot_usage_mismatch');
    assert.ok(v, 'expected slot_usage_mismatch violation');
});

test('INTIMATE without intimate keyword in composition triggers slot_usage_mismatch', () => {
    const still = makeStill({
        stillId: 'still-intimate-wide', slotRole: 'INTIMATE', usage: 'concept',
        composition: 'wide establishing shot', // should be intimate
    });
    const result = validateAnchorCompliance(ANCHORS, makeBible([still]));
    const v = result.violations.find(v => v.violationType === 'slot_usage_mismatch' && v.message.includes('INTIMATE'));
    assert.ok(v, 'expected slot_usage_mismatch for INTIMATE composition');
});

test('EDITORIAL_WIDE_A with intimate composition triggers slot_usage_mismatch', () => {
    const still = makeStill({
        stillId: 'still-wide-intimate', slotRole: 'EDITORIAL_WIDE_A', usage: 'concept',
        location: 'spa solarium', environmentDetails: 'glass roof',
        imagePrompt: 'Intimate close detail of strategy cards', subjectAction: 'Guest arranging strategy cards',
        nicheCarryThrough: 'strategy cards', anchorId: 'anchor-3',
        composition: 'intimate close-up detail', // should be wide
    });
    const result = validateAnchorCompliance(ANCHORS, makeBible([still]));
    const v = result.violations.find(v => v.violationType === 'slot_usage_mismatch' && v.message.includes('EDITORIAL_WIDE'));
    assert.ok(v, 'expected slot_usage_mismatch for EDITORIAL_WIDE composition');
});

console.log('\nAnchor Compliance — duplicate_location_family\n');

test('two stills in same location family triggers duplicate_location_family', () => {
    const stills = [
        makeStill({
            stillId: 'still-lib-a', location: 'ship library', environmentDetails: 'bookshelves',
            slotRole: 'HERO_PRIMARY',
        }),
        makeStill({
            stillId: 'still-lib-b', location: 'library corner', environmentDetails: 'reading area',
            slotRole: 'HERO_ALT', usage: 'hero_alt', anchorId: 'anchor-2',
            imagePrompt: 'Board games in cruise library', subjectAction: 'Friends with board games in library',
            nicheCarryThrough: 'board games',
        }),
    ];
    // Both map to 'other' location family since 'library' isn't in the lint location map
    // — this tests the actual extractLocationFamily behavior
    const result = validateAnchorCompliance(ANCHORS, makeBible(stills));
    const dupes = result.violations.filter(v => v.violationType === 'duplicate_location_family');
    assert.equal(dupes.length, 2, 'both stills should be flagged for duplicate location family');
});

test('two stills in deck location family triggers duplicate_location_family', () => {
    const stills = [
        makeStill({
            stillId: 'still-deck-a', location: 'pool deck', environmentDetails: 'outdoor seating',
            slotRole: 'HERO_PRIMARY',
            imagePrompt: 'Tabletop gaming on pool deck', subjectAction: 'Playing tabletop gaming on deck',
        }),
        makeStill({
            stillId: 'still-deck-b', location: 'lido deck', environmentDetails: 'outdoor bar area',
            slotRole: 'HERO_ALT', usage: 'hero_alt', anchorId: 'anchor-2',
            imagePrompt: 'Board games on lido deck', subjectAction: 'Friends with board games on lido deck',
            nicheCarryThrough: 'board games',
        }),
    ];
    const result = validateAnchorCompliance(ANCHORS, makeBible(stills));
    const dupes = result.violations.filter(v => v.violationType === 'duplicate_location_family');
    assert.ok(dupes.length >= 2, 'both deck stills should be flagged');
});

console.log('\nAnchor Compliance — Utilities\n');

test('extractViolationStillIds returns unique IDs', () => {
    const violations = [
        { stillId: 'a', violationType: 'niche_signal_dropped' as const, message: '', expected: '', actual: '' },
        { stillId: 'a', violationType: 'slot_usage_mismatch' as const, message: '', expected: '', actual: '' },
        { stillId: 'b', violationType: 'missing_anchor_binding' as const, message: '', expected: '', actual: '' },
    ];
    const ids = extractViolationStillIds(violations);
    assert.deepEqual(ids.sort(), ['a', 'b']);
});

test('formatViolationsForRepair produces structured block', () => {
    const violations = [
        { stillId: 'still-1', violationType: 'niche_signal_dropped' as const, message: 'test', expected: 'foo', actual: 'bar' },
    ];
    const block = formatViolationsForRepair(violations);
    assert.ok(block.startsWith('ANCHOR COMPLIANCE VIOLATIONS:'));
    assert.ok(block.includes('still-1'));
    assert.ok(block.includes('niche_signal_dropped'));
});

test('formatViolationsForRepair returns empty string for no violations', () => {
    assert.equal(formatViolationsForRepair([]), '');
});

// ── Summary ──────────────────────────────────────────────────────────────────

console.log(`\nPassed: ${passed}`);
console.log(`Failed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
