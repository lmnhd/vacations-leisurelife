import assert from 'node:assert/strict';
import { validateAnchorCompliance, extractViolationStillIds, formatViolationsForRepair, normalizeEditorialCompositions, normalizeEditorialUsage } from '../editors-room';
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
        location: 'spa solarium daybed alcove', environmentDetails: 'glass roof and thermal loungers',
        imagePrompt: 'Editorial wide of strategy cards in the spa solarium', subjectAction: 'Guest arranging strategy cards in the spa solarium',
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
        stillId: 'still-6', anchorId: 'anchor-6', slotRole: 'FLEX', usage: 'concept',
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

console.log('\nAnchor Compliance — anchor_location_mismatch\n');

test('still text drifting to a different concrete location family triggers anchor_location_mismatch', () => {
    const still = makeStill({
        stillId: 'still-location-drift',
        anchorId: 'anchor-1',
        location: 'pool deck railing',
        environmentDetails: 'open rail overlooking the sea',
        imagePrompt: 'Wide shot of tabletop gaming near the pool deck railing',
        subjectAction: 'Pair enjoys tabletop gaming beside the pool deck railing',
    });
    const result = validateAnchorCompliance(ANCHORS, makeBible([still]));
    const v = result.violations.find(v => v.violationType === 'anchor_location_mismatch');
    assert.ok(v, 'expected anchor_location_mismatch violation');
    assert.equal(v.expected, 'library');
    assert.equal(v.actual, 'rail');
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

test('EDITORIAL_WIDE_A with usage=hero_primary triggers slot_usage_mismatch', () => {
    const still = makeStill({
        stillId: 'still-editorial-hero', slotRole: 'EDITORIAL_WIDE_A', usage: 'hero_primary',
        location: 'ship promenade', environmentDetails: 'open walkway',
        imagePrompt: 'Wide shot of strategy cards on promenade', subjectAction: 'Guest arranging strategy cards',
        nicheCarryThrough: 'strategy cards', anchorId: 'anchor-3',
        composition: 'wide establishing shot',
    });
    const result = validateAnchorCompliance(ANCHORS, makeBible([still]));
    const v = result.violations.find(v => v.violationType === 'slot_usage_mismatch' && v.message.includes('EDITORIAL_WIDE_A'));
    assert.ok(v, 'expected slot_usage_mismatch for editorial slot with hero usage');
});

test('EDITORIAL_WIDE_B with usage=email_header passes (allowed editorial usage)', () => {
    const still = makeStill({
        stillId: 'still-editorial-email', slotRole: 'EDITORIAL_WIDE_B', usage: 'email_header',
        location: 'dining lounge', environmentDetails: 'elegant booths',
        imagePrompt: 'Wide shot of dice rolling in dining lounge', subjectAction: 'Pair engaged in dice rolling over cocktails',
        nicheCarryThrough: 'dice rolling', anchorId: 'anchor-4',
        composition: 'wide environmental shot',
    });
    const result = validateAnchorCompliance(ANCHORS, makeBible([still]));
    const v = result.violations.find(v => v.violationType === 'slot_usage_mismatch');
    assert.ok(!v, 'email_header should be allowed for EDITORIAL_WIDE_B');
});

console.log('\nAnchor Compliance — duplicate_location_family (anchor-declared)\n');

test('two stills sharing same anchor locationFamily triggers duplicate_location_family', () => {
    // Both stills use anchors with the same locationFamily
    const customAnchors = [
        { anchorId: 'a-1', nicheSignal: 'tabletop gaming', locationFamily: 'library' },
        { anchorId: 'a-2', nicheSignal: 'board games', locationFamily: 'library' },
    ];
    const stills = [
        makeStill({
            stillId: 'still-lib-a', anchorId: 'a-1', slotRole: 'HERO_PRIMARY',
            imagePrompt: 'Tabletop gaming in library', subjectAction: 'Pair enjoys tabletop gaming',
        }),
        makeStill({
            stillId: 'still-lib-b', anchorId: 'a-2', slotRole: 'HERO_ALT', usage: 'hero_alt',
            imagePrompt: 'Board games in library', subjectAction: 'Friends with board games',
            nicheCarryThrough: 'board games',
        }),
    ];
    const result = validateAnchorCompliance(customAnchors, makeBible(stills));
    const dupes = result.violations.filter(v => v.violationType === 'duplicate_location_family');
    assert.equal(dupes.length, 2, 'both stills should be flagged for duplicate location family');
});

test('distinct anchor locationFamilies do NOT trigger duplicate_location_family', () => {
    // library vs spa vs theater — all would collapse to "other" under lint extractor
    const customAnchors = [
        { anchorId: 'a-1', nicheSignal: 'tabletop gaming', locationFamily: 'library' },
        { anchorId: 'a-2', nicheSignal: 'board games', locationFamily: 'spa' },
        { anchorId: 'a-3', nicheSignal: 'strategy cards', locationFamily: 'theater' },
    ];
    const stills = [
        makeStill({
            stillId: 'still-lib', anchorId: 'a-1', slotRole: 'HERO_PRIMARY',
            imagePrompt: 'Tabletop gaming in library', subjectAction: 'Pair enjoys tabletop gaming',
        }),
        makeStill({
            stillId: 'still-spa', anchorId: 'a-2', slotRole: 'HERO_ALT', usage: 'hero_alt',
            location: 'spa solarium terrace', environmentDetails: 'thermal loungers and calm water features',
            imagePrompt: 'Board games in spa', subjectAction: 'Friends with board games in spa',
            nicheCarryThrough: 'board games',
        }),
        makeStill({
            stillId: 'still-theater', anchorId: 'a-3', slotRole: 'EDITORIAL_WIDE_A', usage: 'concept',
            location: 'ship theater mezzanine', environmentDetails: 'velvet seating and stage glow',
            imagePrompt: 'Strategy cards in theater', subjectAction: 'Guest arranging strategy cards in theater',
            nicheCarryThrough: 'strategy cards', composition: 'wide overhead establishing',
        }),
    ];
    const result = validateAnchorCompliance(customAnchors, makeBible(stills));
    const dupes = result.violations.filter(v => v.violationType === 'duplicate_location_family');
    assert.equal(dupes.length, 0, 'distinct anchor families should not collide');
});

test('duplicate actual still location families are flagged even when anchor metadata differs', () => {
    const stills = [
        makeStill({
            stillId: 'still-drift-a', anchorId: 'anchor-1', slotRole: 'HERO_PRIMARY',
            location: 'pool deck railing', environmentDetails: 'open rail with sea view',
            imagePrompt: 'Tabletop gaming on the pool deck railing', subjectAction: 'Pair enjoys tabletop gaming by the rail',
        }),
        makeStill({
            stillId: 'still-drift-b', anchorId: 'anchor-3', slotRole: 'HERO_ALT', usage: 'hero_alt',
            location: 'pool deck rail corner', environmentDetails: 'teak rail and loungers',
            imagePrompt: 'Strategy cards beside the pool deck rail', subjectAction: 'Guest arranges strategy cards by the rail',
            nicheCarryThrough: 'strategy cards',
        }),
    ];
    const result = validateAnchorCompliance(ANCHORS, makeBible(stills));
    const dupes = result.violations.filter(v => v.violationType === 'duplicate_location_family');
    assert.equal(dupes.length, 2, 'duplicate actual location families should be flagged');
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

// ── normalizeEditorialCompositions ──────────────────────────────────────────

console.log('\nPhase B — Editorial Composition Normalization\n');

test('EDITORIAL_WIDE with intimate composition is normalized to wide', () => {
    const bible = makeBible([makeStill({
        stillId: 'ed-intimate',
        slotRole: 'EDITORIAL_WIDE_A',
        usage: 'concept',
        composition: 'Intimate close-up shot of guests at the table',
        location: 'ship library', environmentDetails: 'bookshelves',
        imagePrompt: 'Tabletop gaming in library', subjectAction: 'Pair enjoys tabletop gaming',
        anchorId: 'anchor-1',
    })]);
    const result = normalizeEditorialCompositions(bible);
    const fixed = result.stillLibrary[0];
    assert.ok(!fixed.composition.toLowerCase().includes('intimate'), 'intimate should be replaced');
    assert.ok(!fixed.composition.toLowerCase().includes('close-up'), 'close-up should be replaced');
});

test('EDITORIAL_WIDE with tight composition is normalized', () => {
    const bible = makeBible([makeStill({
        stillId: 'ed-tight',
        slotRole: 'EDITORIAL_WIDE_B',
        usage: 'concept',
        composition: 'Tight editorial frame around board game components',
        location: 'ship library', environmentDetails: 'bookshelves',
        imagePrompt: 'Board games in library', subjectAction: 'Friends with board games',
        anchorId: 'anchor-2',
    })]);
    const result = normalizeEditorialCompositions(bible);
    const fixed = result.stillLibrary[0];
    assert.ok(!fixed.composition.toLowerCase().includes('tight'), 'tight should be replaced');
});

test('EDITORIAL_WIDE with detail composition is normalized', () => {
    const bible = makeBible([makeStill({
        stillId: 'ed-detail',
        slotRole: 'EDITORIAL_WIDE_A',
        usage: 'email_header',
        composition: 'Detailed overhead view of strategy card arrangement',
        location: 'ship promenade', environmentDetails: 'promenade walkway',
        imagePrompt: 'Strategy cards on promenade', subjectAction: 'Guest arranging strategy cards',
        anchorId: 'anchor-3',
    })]);
    const result = normalizeEditorialCompositions(bible);
    const fixed = result.stillLibrary[0];
    assert.ok(!fixed.composition.toLowerCase().includes('detail'), 'detail should be replaced');
});

test('HERO_PRIMARY with intimate composition is NOT touched', () => {
    const originalComposition = 'Intimate close shot of two guests';
    const bible = makeBible([makeStill({
        stillId: 'hero-intimate',
        slotRole: 'HERO_PRIMARY',
        usage: 'hero_primary',
        composition: originalComposition,
    })]);
    const result = normalizeEditorialCompositions(bible);
    assert.equal(result.stillLibrary[0].composition, originalComposition, 'HERO stills must not be modified');
});

test('INTIMATE slot composition is NOT touched', () => {
    const originalComposition = 'Intimate close-up of miniature painting';
    const bible = makeBible([makeStill({
        stillId: 'intimate-correct',
        slotRole: 'INTIMATE',
        usage: 'concept',
        composition: originalComposition,
    })]);
    const result = normalizeEditorialCompositions(bible);
    assert.equal(result.stillLibrary[0].composition, originalComposition, 'INTIMATE stills must not be modified');
});

test('EDITORIAL_WIDE with safe composition is returned unchanged', () => {
    const originalComposition = 'Wide overhead establishing shot of the library';
    const bible = makeBible([makeStill({
        stillId: 'ed-wide-safe',
        slotRole: 'EDITORIAL_WIDE_A',
        usage: 'concept',
        composition: originalComposition,
    })]);
    const result = normalizeEditorialCompositions(bible);
    assert.equal(result.stillLibrary[0].composition, originalComposition, 'safe compositions must not be mutated');
    assert.equal(result, bible, 'should return same reference when no changes made');
});

test('after normalization EDITORIAL_WIDE stills no longer trigger slot_usage_mismatch in anchor compliance', () => {
    const anchors = [{ anchorId: 'anchor-1', nicheSignal: 'tabletop gaming', locationFamily: 'library' }];
    const bible = makeBible([makeStill({
        stillId: 'ed-was-intimate',
        slotRole: 'EDITORIAL_WIDE_A',
        usage: 'concept',
        composition: 'Intimate close-up of tabletop gaming components',
        location: 'ship library', environmentDetails: 'bookshelves',
        imagePrompt: 'Wide shot of tabletop gaming in library', subjectAction: 'Guests enjoying tabletop gaming',
        nicheCarryThrough: 'tabletop gaming', anchorId: 'anchor-1',
    })]);
    const normalized = normalizeEditorialCompositions(bible);
    const result = validateAnchorCompliance(anchors, normalized);
    const mismatch = result.violations.find(v => v.violationType === 'slot_usage_mismatch' && v.message.includes('EDITORIAL_WIDE'));
    assert.ok(!mismatch, 'slot_usage_mismatch on EDITORIAL_WIDE composition should be resolved after normalization');
});

// ── Phase A: balcony/rail location drift regression ──────────────────────

console.log('\nPhase A — Balcony/Rail Location Family Precision\n');

test('promenade-anchored still with "promenade window nook" resolves to promenade not cabin', () => {
    const anchors = [{ anchorId: 'anchor-5', nicheSignal: 'Ravelry', locationFamily: 'promenade' }];
    const still = makeStill({
        stillId: 'still-promenade-window',
        anchorId: 'anchor-5',
        slotRole: 'HERO_ALT',
        usage: 'hero_alt',
        location: 'promenade window nook',
        environmentDetails: 'bay window seat along the promenade deck',
        imagePrompt: 'Hero shot of knitter in the promenade window nook with Ravelry open',
        subjectAction: 'Solo guest knitting in promenade window nook with Ravelry on phone',
        nicheCarryThrough: 'Ravelry',
        composition: 'medium_wide single_subject in window nook',
    });
    const result = validateAnchorCompliance(anchors, makeBible([still]));
    const v = result.violations.find(v => v.violationType === 'anchor_location_mismatch');
    assert.ok(!v, 'promenade window nook should resolve to promenade — promenade keyword now checked before cabin/window');
});

test('balcony-anchored still with only "railing" in location (no "balcony") triggers anchor_location_mismatch', () => {
    const anchors = [{ anchorId: 'anchor-5', nicheSignal: 'miniature painting', locationFamily: 'cabin balcony' }];
    const still = makeStill({
        stillId: 'still-balcony-drift',
        anchorId: 'anchor-5',
        slotRole: 'INTIMATE',
        usage: 'concept',
        location: 'private railing above the sea',
        environmentDetails: 'warm breeze, metal railing, sea view',
        imagePrompt: 'Intimate close shot of miniature painting at the railing',
        subjectAction: 'Solo guest focused on miniature painting at the railing',
        nicheCarryThrough: 'miniature painting',
        composition: 'intimate close-up detail',
    });
    const result = validateAnchorCompliance(anchors, makeBible([still]));
    const v = result.violations.find(v => v.violationType === 'anchor_location_mismatch');
    assert.ok(v, 'expected anchor_location_mismatch when balcony anchor drifts to railing-only location text');
    assert.equal(v.expected, 'balcony');
    assert.equal(v.actual, 'rail');
});

test('balcony-anchored still with both "balcony" and "railing" in location passes anchor_location_mismatch', () => {
    const anchors = [{ anchorId: 'anchor-5', nicheSignal: 'miniature painting', locationFamily: 'cabin balcony' }];
    const still = makeStill({
        stillId: 'still-balcony-ok',
        anchorId: 'anchor-5',
        slotRole: 'INTIMATE',
        usage: 'concept',
        location: 'cabin balcony railing',
        environmentDetails: 'private balcony with railing and sea view',
        imagePrompt: 'Intimate close shot of miniature painting on the cabin balcony',
        subjectAction: 'Solo guest focused on miniature painting on the balcony',
        nicheCarryThrough: 'miniature painting',
        composition: 'intimate close-up detail',
    });
    const result = validateAnchorCompliance(anchors, makeBible([still]));
    const v = result.violations.find(v => v.violationType === 'anchor_location_mismatch');
    assert.ok(!v, 'balcony+railing in location should pass — balcony is checked first in inferLocationFamilyFromText');
});

test('balcony-anchored still with only "balcony" in location (no railing) passes anchor_location_mismatch', () => {
    const anchors = [{ anchorId: 'anchor-5', nicheSignal: 'miniature painting', locationFamily: 'cabin balcony' }];
    const still = makeStill({
        stillId: 'still-balcony-clean',
        anchorId: 'anchor-5',
        slotRole: 'INTIMATE',
        usage: 'concept',
        location: 'private cabin balcony',
        environmentDetails: 'sea view from the balcony',
        imagePrompt: 'Intimate close shot of miniature painting on the cabin balcony',
        subjectAction: 'Solo guest focused on miniature painting on the balcony',
        nicheCarryThrough: 'miniature painting',
        composition: 'intimate close-up detail',
    });
    const result = validateAnchorCompliance(anchors, makeBible([still]));
    const v = result.violations.find(v => v.violationType === 'anchor_location_mismatch');
    assert.ok(!v, 'pure balcony location should pass with no mismatch');
});

// ── Phase B: normalizeEditorialUsage ──────────────────────────────────────────────────────

console.log('\nPhase B — Editorial Usage Normalization\n');

test('EDITORIAL_WIDE_A with invalid usage is normalized to concept', () => {
    const bible = makeBible([makeStill({
        stillId: 'ed-bad-usage',
        slotRole: 'EDITORIAL_WIDE_A',
        usage: 'hero_primary',  // invalid for editorial slot
        composition: 'wide establishing shot',
        location: 'ship library', environmentDetails: 'bookshelves',
        imagePrompt: 'Tabletop gaming in library', subjectAction: 'Pair enjoys tabletop gaming',
        anchorId: 'anchor-1',
    })]);
    const result = normalizeEditorialUsage(bible);
    assert.equal(result.stillLibrary[0].usage, 'concept', 'invalid usage should be normalized to concept');
});

test('EDITORIAL_WIDE_B with invalid usage is normalized to concept', () => {
    const bible = makeBible([makeStill({
        stillId: 'ed-b-bad-usage',
        slotRole: 'EDITORIAL_WIDE_B',
        usage: 'social_square',  // invalid for editorial slot
        composition: 'wide overhead shot',
        location: 'dining lounge', environmentDetails: 'elegant booths',
        imagePrompt: 'Dice rolling in dining lounge', subjectAction: 'Pair engaged in dice rolling',
        anchorId: 'anchor-4', nicheCarryThrough: 'dice rolling',
    })]);
    const result = normalizeEditorialUsage(bible);
    assert.equal(result.stillLibrary[0].usage, 'concept', 'invalid usage should be normalized to concept');
});

test('EDITORIAL_WIDE with already-valid usage=concept is unchanged', () => {
    const bible = makeBible([makeStill({
        stillId: 'ed-valid-concept',
        slotRole: 'EDITORIAL_WIDE_A',
        usage: 'concept',
        composition: 'wide establishing shot',
    })]);
    const result = normalizeEditorialUsage(bible);
    assert.equal(result.stillLibrary[0].usage, 'concept', 'valid concept usage should not change');
    assert.equal(result, bible, 'should return same reference when no changes made');
});

test('EDITORIAL_WIDE with already-valid usage=email_header is unchanged', () => {
    const bible = makeBible([makeStill({
        stillId: 'ed-valid-email',
        slotRole: 'EDITORIAL_WIDE_B',
        usage: 'email_header',
        composition: 'wide environmental shot',
    })]);
    const result = normalizeEditorialUsage(bible);
    assert.equal(result.stillLibrary[0].usage, 'email_header', 'valid email_header usage should not change');
    assert.equal(result, bible, 'should return same reference when no changes made');
});

test('HERO_PRIMARY with any usage is NOT touched by normalizeEditorialUsage', () => {
    const bible = makeBible([makeStill({
        stillId: 'hero-pass-through',
        slotRole: 'HERO_PRIMARY',
        usage: 'hero_primary',
        composition: 'wide establishing shot',
    })]);
    const result = normalizeEditorialUsage(bible);
    assert.equal(result.stillLibrary[0].usage, 'hero_primary', 'HERO stills must not be modified');
    assert.equal(result, bible, 'should return same reference for non-editorial stills');
});

test('after normalizeEditorialUsage EDITORIAL_WIDE with previously invalid usage no longer triggers slot_usage_mismatch', () => {
    const anchors = [{ anchorId: 'anchor-3', nicheSignal: 'strategy cards', locationFamily: 'spa solarium' }];
    const bible = makeBible([makeStill({
        stillId: 'ed-was-bad-usage',
        slotRole: 'EDITORIAL_WIDE_A',
        usage: 'hero_primary',  // invalid — would trigger slot_usage_mismatch before normalization
        composition: 'wide overhead establishing shot',
        location: 'spa solarium daybed alcove', environmentDetails: 'glass roof and thermal loungers',
        imagePrompt: 'Editorial wide of strategy cards in the spa solarium', subjectAction: 'Guest arranging strategy cards in the spa solarium',
        nicheCarryThrough: 'strategy cards', anchorId: 'anchor-3',
    })]);
    const normalized = normalizeEditorialUsage(bible);
    const result = validateAnchorCompliance(anchors, normalized);
    const mismatch = result.violations.find(v => v.violationType === 'slot_usage_mismatch');
    assert.ok(!mismatch, 'slot_usage_mismatch should be resolved after normalizeEditorialUsage');
});

// ── Summary ────────────────────────────────────────────────────────────────────

console.log(`\nPassed: ${passed}`);
console.log(`Failed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
