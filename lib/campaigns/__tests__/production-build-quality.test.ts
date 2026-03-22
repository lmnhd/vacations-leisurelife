import assert from 'node:assert/strict';
import { lintProductionBuild } from '../media/production-build-lint';
import type { LandingStillSpec, LandingStillBible } from '../schema';

// ────────────────────────────────────────────────────────────────────────────
// Production Build Quality Regression Tests
// Acceptance criteria 10, 11, 12 from current-phase.md
//
// These tests verify that the lint compliance guidance added in Phase 2B
// produces correctly structured still sets, and that the main recurring
// failure patterns (weak_niche_signal, identity_legibility_too_low,
// repeated_composition_family, missing_role_coverage) are covered.
//
// Tests are pure unit tests against lintProductionBuild — no LLM calls.
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

// ── Fixture helpers ──────────────────────────────────────────────────────────

const NICHE_KEYWORDS = ['board games', 'dice', 'tabletop'];

function makeStill(overrides: Partial<LandingStillSpec>): LandingStillSpec {
    return {
        stillId: overrides.stillId ?? 'still-1',
        usage: overrides.usage ?? 'concept',
        location: overrides.location ?? 'ship atrium',
        environmentDetails: overrides.environmentDetails ?? 'modern ship interior with natural light',
        subjectAction: overrides.subjectAction ?? 'two guests enjoying the view',
        composition: overrides.composition ?? 'medium wide shot with ship architecture visible',
        mood: overrides.mood ?? 'warm joyful connection',
        imagePrompt: overrides.imagePrompt ?? 'Warm afternoon light fills the atrium as guests relax together, travel photography, natural light, 35mm film grain',
        lighting: overrides.lighting ?? 'natural afternoon',
        timeOfDay: overrides.timeOfDay ?? 'afternoon',
        referenceCategory: overrides.referenceCategory ?? 'atrium',
    };
}

function makeBible(stills: LandingStillSpec[]): LandingStillBible {
    return { stillLibrary: stills, globalDirectionNotes: 'niche campaign', avoidDirectives: [] };
}

// A still with niche keywords embedded in imagePrompt and subjectAction
function makeNicheStill(id: string, usage: LandingStillSpec['usage'] = 'concept'): LandingStillSpec {
    return makeStill({
        stillId: id,
        usage,
        location: 'ship promenade deck',
        subjectAction: `two guests sharing a laugh over a board games strategy, pointing at the dice on the small table between them`,
        imagePrompt: `Golden afternoon light on the promenade deck as two guests lean over a compact tabletop game, dice catching the light, laughter easy and unscripted, travel photography 35mm film grain`,
        composition: 'medium shot, clean horizon line, guests at natural mid-distance',
        mood: 'playful discovery',
    });
}

// A still with NO niche keywords anywhere — generic cruise lifestyle
function makeGenericStill(id: string): LandingStillSpec {
    return makeStill({
        stillId: id,
        usage: 'concept',
        location: 'deck railing',
        subjectAction: 'couple smiling at the ocean sunset',
        imagePrompt: 'Warm golden sunset light over the ocean as a couple stands at the railing, smiling together, travel photography',
        composition: 'wide shot of couple at rail facing horizon',
        mood: 'romantic warmth',
    });
}

// ── Rule A: Niche signal (AC 11 — weak_niche_signal) ────────────────────────

console.log('\nProduction Build Quality Regression — Niche Signal\n');

test('still with niche keyword in imagePrompt registers as explicit cue', () => {
    const still = makeNicheStill('s1', 'hero_primary');
    const bible = makeBible([still]);
    const report = lintProductionBuild({ landingStillBible: bible, nicheKeywords: NICHE_KEYWORDS });
    const diag = report.stillDiagnostics.find(d => d.stillId === 's1');
    assert.ok(diag, 'diagnostic must exist');
    assert.equal(diag.cueStrength, 'explicit', 'niche keyword in imagePrompt must register as explicit cue');
});

test('still with no niche keywords registers as absent cue', () => {
    const still = makeGenericStill('s1');
    const bible = makeBible([still]);
    const report = lintProductionBuild({ landingStillBible: bible, nicheKeywords: NICHE_KEYWORDS });
    const diag = report.stillDiagnostics.find(d => d.stillId === 's1');
    assert.ok(diag);
    assert.equal(diag.cueStrength, 'absent');
});

test('weak_niche_signal blocker fires when 4+ stills have absent cue (pre-guidance failure mode)', () => {
    const stills = [
        makeGenericStill('s1'),
        makeGenericStill('s2'),
        makeGenericStill('s3'),
        makeGenericStill('s4'),
        makeNicheStill('s5'),
        makeNicheStill('s6'),
    ];
    const bible = makeBible(stills);
    const report = lintProductionBuild({ landingStillBible: bible, nicheKeywords: NICHE_KEYWORDS });
    const blocker = report.blockingIssues.find(i => i.code === 'weak_niche_signal');
    assert.ok(blocker, 'weak_niche_signal must fire when 4+ stills have absent cue');
});

test('weak_niche_signal does NOT fire when only 2 stills have absent cue (post-guidance target)', () => {
    const stills = [
        makeNicheStill('s1', 'hero_primary'),
        makeNicheStill('s2', 'hero_alt'),
        makeNicheStill('s3', 'concept'),
        makeNicheStill('s4', 'email_header'),
        makeGenericStill('s5'),
        makeGenericStill('s6'),
    ];
    const bible = makeBible(stills);
    const report = lintProductionBuild({ landingStillBible: bible, nicheKeywords: NICHE_KEYWORDS });
    const blocker = report.blockingIssues.find(i => i.code === 'weak_niche_signal');
    assert.ok(!blocker, `weak_niche_signal must NOT fire when only 2 stills have absent cue, got: ${blocker?.message}`);
});

// ── Rule B: Role coverage (AC 11 — missing_role_coverage) ───────────────────

console.log('\nProduction Build Quality Regression — Role Coverage\n');

test('missing_role_coverage fires when no intimate/tight composition exists (pre-guidance failure mode)', () => {
    // All stills are wide editorial — no intimate composition
    const stills = [
        makeStill({ stillId: 's1', usage: 'hero_primary', composition: 'wide shot hero framing' }),
        makeStill({ stillId: 's2', usage: 'hero_alt', composition: 'wide shot hero alternate' }),
        makeStill({ stillId: 's3', usage: 'concept', composition: 'medium editorial wide' }),
        makeStill({ stillId: 's4', usage: 'email_header', composition: 'editorial medium' }),
        makeStill({ stillId: 's5', usage: 'social_square', composition: 'medium wide social' }),
        makeStill({ stillId: 's6', usage: 'concept', composition: 'wide establishing shot' }),
    ];
    const bible = makeBible(stills);
    const report = lintProductionBuild({ landingStillBible: bible, nicheKeywords: NICHE_KEYWORDS });
    const blocker = report.blockingIssues.find(i => i.code === 'missing_role_coverage');
    assert.ok(blocker, 'missing_role_coverage must fire when no intimate still exists');
    assert.ok(blocker.message.includes('intimate'), `message must mention intimate, got: ${blocker.message}`);
});

test('missing_role_coverage does NOT fire with correct usage + intimate composition (post-guidance target)', () => {
    const stills = [
        makeNicheStill('s1', 'hero_primary'),                               // hero role
        makeNicheStill('s2', 'hero_alt'),                                   // hero role
        makeStill({ stillId: 's3', usage: 'concept', composition: 'medium wide editorial framing with ship architecture' }),   // editorial
        makeStill({ stillId: 's4', usage: 'email_header', composition: 'medium wide editorial' }),  // editorial
        makeStill({ stillId: 's5', usage: 'concept', composition: 'intimate close crop of two hands sharing a game piece, soft focus ocean behind' }), // intimate ✓
        makeStill({ stillId: 's6', usage: 'social_square', composition: 'square crop editorial social' }),  // supporting
    ];
    const bible = makeBible(stills);
    const report = lintProductionBuild({ landingStillBible: bible, nicheKeywords: NICHE_KEYWORDS });
    const blocker = report.blockingIssues.find(i => i.code === 'missing_role_coverage');
    assert.ok(!blocker, `missing_role_coverage must NOT fire with correct distribution, got: ${blocker?.message}`);
});

test('missing_role_coverage fires when fewer than 2 hero stills', () => {
    const stills = [
        makeStill({ stillId: 's1', usage: 'hero_primary', composition: 'wide hero' }),
        makeStill({ stillId: 's2', usage: 'concept', composition: 'editorial wide' }),
        makeStill({ stillId: 's3', usage: 'email_header', composition: 'editorial' }),
        makeStill({ stillId: 's4', usage: 'concept', composition: 'intimate close' }),
        makeStill({ stillId: 's5', usage: 'social_square', composition: 'social' }),
        makeStill({ stillId: 's6', usage: 'social_square', composition: 'social square' }),
    ];
    const bible = makeBible(stills);
    const report = lintProductionBuild({ landingStillBible: bible, nicheKeywords: NICHE_KEYWORDS });
    const blocker = report.blockingIssues.find(i => i.code === 'missing_role_coverage');
    assert.ok(blocker, 'missing_role_coverage must fire when only 1 hero still');
});

// ── Rule C: Composition variety (AC 11 — repeated_composition_family) ────────

console.log('\nProduction Build Quality Regression — Composition Variety\n');

test('repeated_composition_family blocker fires when 3 stills are rail_couple_laugh (pre-guidance failure)', () => {
    const makeRailLaugh = (id: string) => makeStill({
        stillId: id,
        usage: 'concept',
        location: 'ship railing balcony',
        subjectAction: 'couple laughing together leaning on the rail',
        composition: 'couple together at rail smiling',
    });
    const stills = [makeRailLaugh('s1'), makeRailLaugh('s2'), makeRailLaugh('s3'), makeNicheStill('s4'), makeNicheStill('s5'), makeNicheStill('s6')];
    const bible = makeBible(stills);
    const report = lintProductionBuild({ landingStillBible: bible, nicheKeywords: NICHE_KEYWORDS });
    const blocker = report.blockingIssues.find(i => i.code === 'repeated_composition_family');
    assert.ok(blocker, 'repeated_composition_family must fire when 3+ stills are rail_couple_laugh');
});

test('generic_fallback_overuse fires when 4+ stills match generic templates (pre-guidance failure)', () => {
    const makeRailLaugh = (id: string) => makeStill({
        stillId: id, location: 'railing', subjectAction: 'couple laughing', composition: 'couple together at rail smiling',
    });
    const makeWindowSolo = (id: string) => makeStill({
        stillId: id, location: 'cabin window porthole stateroom', subjectAction: 'solo guest gazing outside alone', composition: 'quiet solo contemplation window',
    });
    const stills = [makeRailLaugh('s1'), makeRailLaugh('s2'), makeWindowSolo('s3'), makeWindowSolo('s4'), makeNicheStill('s5'), makeNicheStill('s6')];
    const bible = makeBible(stills);
    const report = lintProductionBuild({ landingStillBible: bible, nicheKeywords: NICHE_KEYWORDS });
    const blocker = report.blockingIssues.find(i => i.code === 'generic_fallback_overuse');
    assert.ok(blocker, 'generic_fallback_overuse must fire when 4+ stills are in generic fallback families');
});

// ── AC 10: Full still set following new guidance passes all lint checks ───────

console.log('\nProduction Build Quality Regression — Full Set Passing Lint\n');

test('AC 10: well-structured still set following new guidance passes lintProductionBuild', () => {
    // This represents what the improved prompt guidance should produce.
    // 2 hero, 2 editorial, 1 intimate, 1 social_square.
    // Niche keywords in imagePrompt/subjectAction for 5 of 6 stills.
    // No generic fallback family used more than once.
    const stills: LandingStillSpec[] = [
        // Hero 1 — wide deck shot with niche keyword
        makeStill({
            stillId: 'hero-1',
            usage: 'hero_primary',
            location: 'ship promenade deck forward section',
            subjectAction: 'couple leaning on the bow rail as dolphins surface near the ship, one pointing at the board games atlas tucked under their arm',
            imagePrompt: 'Warm turquoise morning light on the promenade as a couple stands at the bow rail, board games strategy booklet in hand, dolphins curving below — observational travel photography, natural light, 35mm film grain',
            composition: 'wide cinematic establishing shot with ship bow visible, ocean horizon stretching far',
            mood: 'wonder and playful discovery',
        }),
        // Hero 2 — atrium with niche keyword
        makeStill({
            stillId: 'hero-2',
            usage: 'hero_alt',
            location: 'ship atrium lobby',
            subjectAction: 'guest pausing mid-step in the atrium, holding a compact dice game and looking up at the light-filled glass ceiling with delight',
            imagePrompt: 'Afternoon light cascades through the atrium glass as a guest holds a small tabletop dice game and looks upward in quiet amazement — natural candid light, 35mm film grain, warm amber tones',
            composition: 'low angle wide shot capturing atrium height, subject at comfortable mid-distance',
            mood: 'serene awe',
        }),
        // Editorial 1 — deck pool area, no intimate words
        makeStill({
            stillId: 'editorial-1',
            usage: 'email_header',
            location: 'pool deck lido area',
            subjectAction: 'two guests lounging side by side under canvas shade, one flipping through a games rule booklet, the other laughing at something on the horizon',
            imagePrompt: 'Dappled shade over the lido deck as two guests relax in adjacent loungers, one with a tabletop game rulebook open on their lap — mid-day natural light, travel photography, clean editorial framing',
            composition: 'medium wide editorial shot, pool and ocean visible in background',
            mood: 'relaxed golden leisure',
        }),
        // Editorial 2 — dining area, no intimate words
        makeStill({
            stillId: 'editorial-2',
            usage: 'concept',
            location: 'ship dining terrace window side table',
            subjectAction: 'two guests chatting over coffee, a portable board games set folded on the table beside their cups, easy and unhurried',
            imagePrompt: 'Soft morning light in the ship dining terrace as two guests chat over coffee with a small board games set resting between them — window-side table, candid travel photography, 35mm film grain',
            composition: 'medium editorial framing, window light from left, ocean visible through glass',
            mood: 'warm morning connection',
        }),
        // Intimate — close shot with niche keyword, composition contains "intimate"
        makeStill({
            stillId: 'intimate-1',
            usage: 'concept',
            location: 'ship interior lounge window seat',
            subjectAction: 'two guests leaning close together over a miniature board game set on a small side table, whispering strategy with warm smiles',
            imagePrompt: 'Late afternoon window light falls on two guests leaning together over a tiny tabletop game, faces close in quiet conspiratorial laughter — intimate candid travel photography, soft natural light, 35mm film grain',
            composition: 'intimate close medium shot, tight two-person framing with ocean soft-focus behind',
            mood: 'intimate playful warmth',
        }),
        // Social square — with niche keyword in subjectAction
        makeStill({
            stillId: 'social-1',
            usage: 'social_square',
            location: 'ship promenade rail section',
            subjectAction: 'solo guest perched on a promenade bench sorting through a handful of game tokens with a satisfied smile, sea air visible in their relaxed posture',
            imagePrompt: 'Clean evening light on the promenade as a guest sits quietly sorting their dice and board game tokens, ocean stretching behind — observational travel photography, natural light',
            composition: 'medium square-crop framing, rail and horizon balanced behind subject',
            mood: 'quiet satisfied solitude',
        }),
    ];

    const bible = makeBible(stills);
    const report = lintProductionBuild({ landingStillBible: bible, nicheKeywords: NICHE_KEYWORDS });

    assert.equal(report.blockingIssues.length, 0,
        `Expected 0 blocking issues, got ${report.blockingIssues.length}:\n${report.blockingIssues.map(i => `  [${i.code}] ${i.message}`).join('\n')}`
    );
    assert.ok(report.verdict === 'pass' || report.verdict === 'warn',
        `Expected verdict pass or warn, got: ${report.verdict}`
    );
    assert.ok(report.scoreSummary.explicitCueCount >= 4,
        `Expected 4+ explicit cue stills, got: ${report.scoreSummary.explicitCueCount}`
    );
});

// ── Phase 2C: Art/creative archetype regression ──────────────────────────────
// Covers the deck-sketchbook-society pattern:
//   niche keywords present but composition families are all generic cruise fallbacks.
// The fix is enforcing diverse composition families + niche actions in slot descriptions.

const SKETCH_KEYWORDS = ['sketching', 'sketchbook', 'botanical drawing', 'watercolor'];

function makeSketchStillNichePresent(id: string, overrides: Partial<LandingStillSpec> = {}): LandingStillSpec {
    return makeStill({
        stillId: id,
        usage: 'concept',
        imagePrompt: overrides.imagePrompt ?? 'Warm afternoon light as a guest sits at the rail with a sketchbook open, pencil poised above a half-finished botanical drawing',
        subjectAction: overrides.subjectAction ?? 'guest sketching botanical specimens in a leather sketchbook at the deck railing',
        composition: overrides.composition ?? 'medium shot, couple at railing, laughing together',
        location: overrides.location ?? 'deck railing',
        ...overrides,
    });
}

console.log('\nProduction Build Quality Regression — Phase 2C Art/Creative Archetype\n');

test('AC 12a: art/creative stills with niche keywords but all in generic composition families get generic_fallback_overuse (composition diversity failure)', () => {
    // Niche keywords ARE present in imagePrompt/subjectAction — scanner sees them
    // But ALL stills use generic fallback composition families (rail couple laugh, deck sea wide)
    const stills: LandingStillSpec[] = [
        makeSketchStillNichePresent('s1', { location: 'deck railing', subjectAction: 'couple laughing together over a sketchbook', composition: 'couple at rail smiling laughing' }),
        makeSketchStillNichePresent('s2', { location: 'railing', subjectAction: 'couple laughing sharing sketching tips', composition: 'couple at railing laughing together' }),
        makeSketchStillNichePresent('s3', { location: 'deck bow', subjectAction: 'guest with sketchbook gazing at the ocean horizon', composition: 'wide deck sea horizon couple facing horizon sunset' }),
        makeSketchStillNichePresent('s4', { location: 'stern deck', subjectAction: 'sketching the wake and horizon from the deck', composition: 'deck sea wide couple at horizon' }),
        makeSketchStillNichePresent('s5'),
        makeSketchStillNichePresent('s6'),
    ];
    const bible = makeBible(stills);
    const report = lintProductionBuild({ landingStillBible: bible, nicheKeywords: SKETCH_KEYWORDS });

    // Niche signal should be fine — keywords are present
    const nicheBlocker = report.blockingIssues.find(i => i.code === 'weak_niche_signal');
    assert.ok(!nicheBlocker, `weak_niche_signal must NOT fire when niche keywords are present, got: ${nicheBlocker?.message}`);

    // But composition family clustering should fire
    const compositionBlocker = report.blockingIssues.find(
        i => i.code === 'repeated_composition_family' || i.code === 'generic_fallback_overuse'
    );
    assert.ok(compositionBlocker, `a composition family blocker must fire when multiple generic fallback families are overused, got verdicts: ${report.blockingIssues.map(b => b.code).join(', ')}`);
});

test('AC 12b: corrected art/creative archetype with niche terms + diverse composition families passes lint (post-Phase 2C target)', () => {
    // Same niche keywords, but each still uses a different location family + no repeated generic fallback
    const stills: LandingStillSpec[] = [
        makeStill({
            stillId: 'hero-1',
            usage: 'hero_primary',
            location: 'ship library reading room',
            subjectAction: 'guest spreading watercolor sketches across the reading room table, ocean visible through the port windows',
            imagePrompt: 'Afternoon light in the ship library as a guest lays out a series of botanical watercolor sketches on the reading table — port windows open to the ocean, natural light, 35mm film grain',
            composition: 'wide editorial shot, library shelves framing subject, ocean glimpsed through window',
            mood: 'quiet creative focus',
        }),
        makeStill({
            stillId: 'hero-2',
            usage: 'hero_alt',
            location: 'ship promenade forward section',
            subjectAction: 'two guests comparing sketchbooks on a promenade bench, pointing at each other\'s botanical drawings with delighted surprise',
            imagePrompt: 'Morning light on the promenade as two guests sit side by side comparing open sketchbooks, pointing and laughing over botanical drawings — turquoise ocean stretching beyond the rail, 35mm film grain',
            composition: 'medium wide shot, promenade bench, ocean horizon behind',
            mood: 'shared creative discovery',
        }),
        makeStill({
            stillId: 'editorial-1',
            usage: 'email_header',
            location: 'ship pool deck shaded area',
            subjectAction: 'guest reclining under a canvas canopy with a sketchbook propped against their knees, lazily capturing the ship\'s funnel from below',
            imagePrompt: 'Dappled midday shade over the pool deck as a guest reclines with a sketchbook balanced on their knees, pencil working across the page — funnel silhouette above, candid travel photography',
            composition: 'medium wide editorial framing, pool and sky visible, open airy',
            mood: 'relaxed sun-filled creativity',
        }),
        makeStill({
            stillId: 'editorial-2',
            usage: 'concept',
            location: 'embarkation pier port-side',
            subjectAction: 'guest standing at the gangway holding a sketchbook open to a drawing of the ship\'s hull, comparing the sketch to the real vessel behind them',
            imagePrompt: 'Golden port-morning light as a guest stands on the pier holding an open sketchbook with a detailed drawing of the ship — actual hull rising behind them, travel photography, natural light',
            composition: 'medium wide editorial, ship hull and pier context, open framing',
            mood: 'playful documentary joy',
        }),
        makeStill({
            stillId: 'intimate-1',
            usage: 'concept',
            location: 'ship lounge window banquette',
            subjectAction: 'two guests leaning close over a single sketchbook, one guiding the other\'s pencil through a botanical detail',
            imagePrompt: 'Soft window light in the ship lounge as two guests lean together over an open sketchbook, one guest gently guiding the other\'s pencil across a botanical sketch — intimate candid travel photography',
            composition: 'intimate close medium shot, window light, two-person tight framing',
            mood: 'intimate creative warmth',
        }),
        makeStill({
            stillId: 'social-1',
            usage: 'social_square',
            location: 'ship spa solarium',
            subjectAction: 'guest relaxing in the solarium pool with a waterproof sketchbook propped on the pool edge, sketching the glass ceiling above',
            imagePrompt: 'Soft diffused light in the ship solarium as a guest floats in the warm pool, sketchbook propped on the pool rim, drawing the arching glass ceiling — candid travel photography, serene',
            composition: 'square editorial crop, glass ceiling and pool framing, medium distance',
            mood: 'serene creative solitude',
        }),
    ];

    const bible = makeBible(stills);
    const report = lintProductionBuild({ landingStillBible: bible, nicheKeywords: SKETCH_KEYWORDS });

    assert.equal(report.blockingIssues.length, 0,
        `Expected 0 blocking issues in corrected art/creative archetype, got:\n${report.blockingIssues.map(i => `  [${i.code}] ${i.message}`).join('\n')}`
    );
    assert.ok(report.verdict === 'pass' || report.verdict === 'warn',
        `Expected pass or warn, got: ${report.verdict}`
    );
    assert.ok(report.scoreSummary.explicitCueCount >= 4,
        `Expected 4+ explicit cue stills, got: ${report.scoreSummary.explicitCueCount}`
    );
});

// ── Phase B: slotRole-aware role classification ──────────────────────────────
// extractShotRole now trusts slotRole when present, so EDITORIAL_WIDE stills
// are always classified as editorial regardless of composition keywords.

console.log('\nProduction Build Quality Regression — slotRole-Aware Classification\n');

test('EDITORIAL_WIDE with intimate composition keywords is still editorial when slotRole is set', () => {
    // Without slotRole this would be classified as intimate due to composition keywords.
    // With slotRole=EDITORIAL_WIDE_A, lint should classify as editorial.
    const stills = [
        makeStill({ stillId: 's1', usage: 'hero_primary', slotRole: 'HERO_PRIMARY', composition: 'wide hero establishing' }),
        makeStill({ stillId: 's2', usage: 'hero_alt', slotRole: 'HERO_ALT', composition: 'wide hero alternate' }),
        makeStill({ stillId: 's3', usage: 'concept', slotRole: 'EDITORIAL_WIDE_A', composition: 'intimate close-up detail of strategy cards on a wide table' }),
        makeStill({ stillId: 's4', usage: 'concept', slotRole: 'EDITORIAL_WIDE_B', composition: 'airily wide, side-table foreground and open lounger context' }),
        makeStill({ stillId: 's5', usage: 'concept', slotRole: 'INTIMATE', composition: 'intimate close crop of hands sharing a game piece' }),
        makeStill({ stillId: 's6', usage: 'concept', slotRole: 'FLEX', composition: 'medium social framing' }),
    ];
    const bible = makeBible(stills);
    const report = lintProductionBuild({ landingStillBible: bible, nicheKeywords: NICHE_KEYWORDS });
    const blocker = report.blockingIssues.find(i => i.code === 'missing_role_coverage');
    assert.ok(!blocker,
        `missing_role_coverage must NOT fire when EDITORIAL_WIDE slots are present, got: ${blocker?.message}`
    );
});

test('missing_role_coverage still fires when slotRole is absent and composition triggers intimate', () => {
    // Backward compat: stills without slotRole fall through to composition-based inference
    const stills = [
        makeStill({ stillId: 's1', usage: 'hero_primary', composition: 'wide hero' }),
        makeStill({ stillId: 's2', usage: 'hero_alt', composition: 'wide hero alt' }),
        makeStill({ stillId: 's3', usage: 'concept', composition: 'intimate close shot of guests' }),
        makeStill({ stillId: 's4', usage: 'concept', composition: 'tight detail of game components' }),
        makeStill({ stillId: 's5', usage: 'social_square', composition: 'social square crop' }),
        makeStill({ stillId: 's6', usage: 'concept', composition: 'wide editorial establishing' }),
    ];
    const bible = makeBible(stills);
    const report = lintProductionBuild({ landingStillBible: bible, nicheKeywords: NICHE_KEYWORDS });
    const blocker = report.blockingIssues.find(i => i.code === 'missing_role_coverage');
    // s3 and s4 are intimate (composition keywords), s6 is editorial — only 1 editorial, needs 2
    assert.ok(blocker, 'missing_role_coverage must still fire for stills without slotRole when composition triggers intimate');
});

console.log(`\nPassed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
    process.exit(1);
}
