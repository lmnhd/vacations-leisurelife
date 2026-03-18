/**
 * Production-Bible Deterministic Fixers — unit tests
 * Covers all 12 WORK.txt acceptance test cases for the film-and-zine recovery plan.
 * Run with: npx tsx lib/campaigns/__tests__/aesthetic-fixers.production-bible.test.ts
 */

import assert from 'node:assert/strict';
import type {
    CampaignAestheticBrief,
    ProductionBible,
    Storyboard,
    ShotSpec,
    SceneSpec,
    VideoBrief,
} from '../schema';
import {
    fixCameraMoveFeasibility,
    fixCabinTypePlausibility,
    fixGangwayExchangeProhibited,
    fixStoryboardDurationAlignment,
    fixProductionSafetyOpsMissing,
} from '../aesthetic-fixers/production-bible';
import {
    ISSUE_CODE_OPERATIONS,
    isAllowedTargetPath,
    suggestDeterministicIssueCodes,
} from '../aesthetic-fixers/registry';

// ── Fixture factories ─────────────────────────────────────────────────────────

function makeShot(overrides: Partial<ShotSpec> = {}): ShotSpec {
    return {
        shotNumber: 1,
        sceneId: 'SC1',
        durationSeconds: 5,
        cameraMovement: 'static wide',
        subjectMotion: 'walking forward',
        environmentMotion: 'gentle waves',
        transitionIn: 'cut',
        transitionOut: 'cut',
        emotionalBeat: 'arrival energy',
        narrationSegment: 'Welcome aboard.',
        musicCue: 'swell',
        ...overrides,
    };
}

function makeStoryboard(overrides: Partial<Storyboard> = {}): Storyboard {
    return {
        deliverableId: 'hero_explainer',
        title: 'Hero Explainer',
        totalDurationSeconds: 30,
        shotSequence: [makeShot(), makeShot({ shotNumber: 2, durationSeconds: 5 }), makeShot({ shotNumber: 3, durationSeconds: 5 })],
        narrationScript: 'Join us on the voyage of a lifetime.',
        musicDirection: 'aspirational jazz',
        editingStyle: 'editorial cuts, wide establishing, medium close',
        ...overrides,
    };
}

function makeScene(overrides: Partial<SceneSpec> = {}): SceneSpec {
    return {
        sceneId: 'SC1',
        location: 'Outdoor pool deck, midship',
        timeOfDay: 'morning',
        lighting: 'natural overcast',
        cameraAngle: 'wide establishing',
        subjectAction: 'guests relaxing',
        environmentDetails: 'Pool area with deck chairs and blue water',
        mood: 'relaxed and inviting',
        imagePrompt: 'wide shot of pool deck with guests',
        referenceCategory: 'ship_exterior',
        ...overrides,
    };
}

function makeProductionBible(overrides: Partial<ProductionBible> = {}): ProductionBible {
    return {
        sceneLibrary: [makeScene()],
        storyboards: [makeStoryboard()],
        globalDirectionNotes: 'All footage must be shot handheld or on approved mounts.',
        avoidDirectives: ['no logos', 'no identifiable crew uniforms'],
        ...overrides,
    };
}

function makeVideoConcept(overrides: Partial<VideoBrief> = {}): VideoBrief {
    return {
        title: 'Test Video',
        durationSeconds: 30,
        tool: 'runwayml',
        scriptOrNarration: 'Join us.',
        visualDirectionNotes: 'Wide establishing.',
        avatarRequired: false,
        backgroundDescription: 'Ocean horizon.',
        musicMood: 'aspirational',
        ...overrides,
    };
}

function makeBrief(overrides: Partial<CampaignAestheticBrief> = {}): CampaignAestheticBrief {
    return {
        slug: 'film-and-zine-afloat-2026',
        themeName: 'Film & Zine Afloat 2026',
        visual: {
            aestheticLabel: 'Analogue Editorial',
            colorPalette: { primary: '#2c1810', secondary: '#8b7355', accent: '#d4a853', background: '#0a0a0a', textOnDark: '#ffffff', textOnLight: '#111111' },
            typographyDirection: { headlineStyle: 'Serif editorial', bodyStyle: 'Clean mono', suggestedFonts: ['Libre Baskerville'] },
            imageryMood: 'film-grain cinematic',
            lightingStyle: 'natural directional',
            compositionNotes: 'Rule of thirds, layered depth.',
            avoidList: [],
            referenceMoodboard: ['darkroom amber', 'deck twilight', 'zine aesthetic'],
            plausibilityFramework: { governingPrinciple: 'Cruise-native', cruiseNativeMoments: [], nicheEnhancedMoments: [], implausibleLiteralizations: [], allowedProps: [], discouragedProps: [] },
            humanRepresentation: { castingGoal: 'Mixed', ageRangeGuidance: '25-65', diversityIntent: 'Inclusive', pairingGuidance: 'Mixed pairs', stylingGuidance: 'Smart casual', antiStereotypeRules: [] },
        },
        messaging: { heroSlogan: 'Frame Every Moment', subSlogan: 'An artist voyage', ctaVariants: { waitlist: 'Join', bookNow: 'Book', merch: 'Shop', share: 'Share' }, elevatorPitch: 'Film and photography at sea.', toneKeywords: [], voicePersona: 'Thoughtful and direct' },
        communityExpression: { corePromise: 'Creative community', participationStyle: 'Active', socialGravity: 'High', optionalGatherings: [], belongingSignals: [], solitudeAntiPatterns: [], visualTogethernessNotes: 'Workshop energy', copyFramingRule: 'Inclusive' },
        socialConcepts: {} as unknown as CampaignAestheticBrief['socialConcepts'],
        videoConcepts: {
            heroExplainer: makeVideoConcept({ title: 'Hero', durationSeconds: 30 }),
            tiktokSeed: makeVideoConcept({ title: 'TikTok', durationSeconds: 15 }),
            thresholdAnnouncement: makeVideoConcept({ title: 'Threshold', durationSeconds: 18 }),
            merchReveal: makeVideoConcept({ title: 'Merch', durationSeconds: 20 }),
            countdownSeries: [],
        },
        merch: { conceptStatement: 'Film merch', coreItem: {} as CampaignAestheticBrief['merch']['coreItem'], practicalItem: {} as CampaignAestheticBrief['merch']['practicalItem'], nicheSpecificItems: [], logoConceptDescription: 'Zine motif', tagline: 'Frame it', printStyle: 'Risograph' },
        audio: { ambientNarrationScript: 'Welcome aboard.', hypeClipScript: 'The voyage begins.', voiceProfile: 'Warm baritone', musicMood: 'jazz' },
        generatedAt: '2026-01-01T00:00:00Z',
        generatedBy: 'agent',
        humanReviewStatus: 'pending',
        revisionCycleCount: 0,
        productionBible: makeProductionBible(),
        ...overrides,
    };
}

// ── Test runner ───────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(label: string, fn: () => void): void {
    try {
        fn();
        console.log(`  ✓ ${label}`);
        passed++;
    } catch (err) {
        console.error(`  ✗ ${label}`);
        console.error(`    ${err instanceof Error ? err.message : String(err)}`);
        failed++;
    }
}

// ── 1 & 2: Camera Move Feasibility ───────────────────────────────────────────

console.log('\nFixer 1: Camera Move Feasibility\n');

test('no-ops when no banned camera movements present and safety note already present', () => {
    const safeNote = 'No tracks, cranes, sliders, or floor cables in passenger walkways. Use handheld or compact gimbal only.';
    const brief = makeBrief({ productionBible: makeProductionBible({ globalDirectionNotes: `All footage handheld only. ${safeNote}` }) });
    const result = fixCameraMoveFeasibility(brief);
    assert.equal(result.applied, false);
});

test('no-ops when no productionBible present', () => {
    const brief = makeBrief({ productionBible: undefined });
    const result = fixCameraMoveFeasibility(brief);
    assert.equal(result.applied, false);
    assert.equal(result.appliedOperations[0].status, 'no_op');
});

test('detects crane movement in shot cameraMovement', () => {
    const shot = makeShot({ cameraMovement: 'crane drop from sky, settle on deck' });
    const brief = makeBrief({ productionBible: makeProductionBible({ storyboards: [makeStoryboard({ shotSequence: [shot] })] }) });
    const result = fixCameraMoveFeasibility(brief);
    assert.equal(result.applied, true);
    const fixedShot = result.brief.productionBible!.storyboards[0].shotSequence[0];
    assert.ok(!fixedShot.cameraMovement.match(/\bcrane\b/i), `crane still present: "${fixedShot.cameraMovement}"`);
    assert.ok(fixedShot.cameraMovement.includes('handheld') || fixedShot.cameraMovement.includes('gimbal'));
});

test('detects dolly movement and replaces', () => {
    const shot = makeShot({ cameraMovement: 'dolly forward along the rail' });
    const brief = makeBrief({ productionBible: makeProductionBible({ storyboards: [makeStoryboard({ shotSequence: [shot] })] }) });
    const result = fixCameraMoveFeasibility(brief);
    assert.equal(result.applied, true);
    const fixedShot = result.brief.productionBible!.storyboards[0].shotSequence[0];
    assert.ok(!fixedShot.cameraMovement.match(/\bdolly\b/i));
});

test('detects track shot and replaces', () => {
    const shot = makeShot({ cameraMovement: 'tracking shot across promenade' });
    const brief = makeBrief({ productionBible: makeProductionBible({ storyboards: [makeStoryboard({ shotSequence: [shot] })] }) });
    const result = fixCameraMoveFeasibility(brief);
    assert.equal(result.applied, true);
    const fixedShot = result.brief.productionBible!.storyboards[0].shotSequence[0];
    assert.ok(!fixedShot.cameraMovement.match(/\btrack(ing)?\b/i));
});

test('detects slider in editingStyle and replaces', () => {
    const sb = makeStoryboard({ editingStyle: 'slider moves, editorial pacing' });
    const brief = makeBrief({ productionBible: makeProductionBible({ storyboards: [sb] }) });
    const result = fixCameraMoveFeasibility(brief);
    assert.equal(result.applied, true);
    assert.ok(!result.brief.productionBible!.storyboards[0].editingStyle.match(/\bslider\b/i));
});

test('(test 2) injects no-tracks/no-cranes safety note into globalDirectionNotes', () => {
    const shot = makeShot({ cameraMovement: 'crane rise then dolly forward' });
    const brief = makeBrief({ productionBible: makeProductionBible({ storyboards: [makeStoryboard({ shotSequence: [shot] })] }) });
    const result = fixCameraMoveFeasibility(brief);
    assert.ok(result.brief.productionBible!.globalDirectionNotes.includes('No tracks, cranes, sliders'));
});

test('(test 2) safety note injected exactly once — second run is no-op', () => {
    const shot = makeShot({ cameraMovement: 'crane shot' });
    const brief = makeBrief({ productionBible: makeProductionBible({ storyboards: [makeStoryboard({ shotSequence: [shot] })] }) });
    const first = fixCameraMoveFeasibility(brief);
    const second = fixCameraMoveFeasibility(first.brief);
    assert.equal(second.applied, false, 'second run must be no-op');
    const noteCount = (first.brief.productionBible!.globalDirectionNotes.match(/No tracks, cranes/g) ?? []).length;
    assert.equal(noteCount, 1, 'safety note should appear exactly once');
});

test('camera fixer touchedPaths includes productionBible.storyboards and globalDirectionNotes', () => {
    const shot = makeShot({ cameraMovement: 'cable cam sweep' });
    const brief = makeBrief({ productionBible: makeProductionBible({ storyboards: [makeStoryboard({ shotSequence: [shot] })] }) });
    const result = fixCameraMoveFeasibility(brief);
    assert.ok(result.touchedPaths.includes('productionBible.storyboards'));
    assert.ok(result.touchedPaths.includes('productionBible.globalDirectionNotes'));
});

// ── 3 & 4: Cabin Type Plausibility ───────────────────────────────────────────

console.log('\nFixer 2: Cabin Type Plausibility\n');

test('no-ops when no interior+window contradiction present', () => {
    const brief = makeBrief();
    const result = fixCabinTypePlausibility(brief);
    assert.equal(result.applied, false);
});

test('(test 3) resolves interior stateroom + ocean-view window to Oceanview stateroom', () => {
    const scene = makeScene({ location: 'Interior stateroom desk with ocean-view window' });
    const brief = makeBrief({ productionBible: makeProductionBible({ sceneLibrary: [scene] }) });
    const result = fixCabinTypePlausibility(brief);
    assert.equal(result.applied, true);
    const fixedScene = result.brief.productionBible!.sceneLibrary[0];
    assert.ok(!fixedScene.location.match(/interior.*window/i), `Still contains contradiction: "${fixedScene.location}"`);
    assert.ok(fixedScene.location.includes('Oceanview stateroom'));
});

test('(test 3) resolves interior+window in environmentDetails', () => {
    const scene = makeScene({ environmentDetails: 'Interior cabin with window overlooking ocean' });
    const brief = makeBrief({ productionBible: makeProductionBible({ sceneLibrary: [scene] }) });
    const result = fixCabinTypePlausibility(brief);
    assert.equal(result.applied, true);
    assert.ok(!result.brief.productionBible!.sceneLibrary[0].environmentDetails.match(/interior.*window/i));
});

test('(test 4) fixes cabin contradiction in storyboard narrationScript', () => {
    const sb = makeStoryboard({ narrationScript: 'Shot inside interior stateroom with window facing ocean.' });
    const brief = makeBrief({ productionBible: makeProductionBible({ storyboards: [sb] }) });
    const result = fixCabinTypePlausibility(brief);
    assert.equal(result.applied, true);
    assert.ok(!result.brief.productionBible!.storyboards[0].narrationScript.match(/interior.*window/i));
});

test('(test 4) cabin-type fixer aligns all linked references to the same valid type', () => {
    const scene = makeScene({ location: 'Interior stateroom with window', environmentDetails: 'Interior cabin interior with window view' });
    const shot = makeShot({ narrationSegment: 'Inside interior stateroom with window to ocean.' });
    const sb = makeStoryboard({ shotSequence: [shot] });
    const brief = makeBrief({ productionBible: makeProductionBible({ sceneLibrary: [scene], storyboards: [sb] }) });
    const result = fixCabinTypePlausibility(brief);
    assert.equal(result.applied, true);
    const fixedScene = result.brief.productionBible!.sceneLibrary[0];
    const fixedShot = result.brief.productionBible!.storyboards[0].shotSequence[0];
    assert.ok(!fixedScene.location.match(/interior.*window/i), 'scene location still contradictory');
    assert.ok(!fixedScene.environmentDetails.match(/interior.*window/i), 'scene envDetails still contradictory');
    assert.ok(!fixedShot.narrationSegment.match(/interior.*window/i), 'shot narration still contradictory');
});

test('cabin-type fixer is idempotent', () => {
    const scene = makeScene({ location: 'Interior stateroom desk with ocean-view window' });
    const brief = makeBrief({ productionBible: makeProductionBible({ sceneLibrary: [scene] }) });
    const first = fixCabinTypePlausibility(brief);
    const second = fixCabinTypePlausibility(first.brief);
    assert.equal(second.applied, false);
    assert.equal(second.appliedOperations[0].status, 'no_op');
});

// ── 5 & 6: Gangway Exchange Prohibited ───────────────────────────────────────

console.log('\nFixer 3: Gangway Exchange Prohibited\n');

test('no-ops when no gangway exchange language present and rule note already present', () => {
    const ruleNote = 'No exchanges, greetings, or handoffs on gangways or in primary embark/disembark flow paths.';
    const brief = makeBrief({ productionBible: makeProductionBible({ globalDirectionNotes: `All footage handheld only. ${ruleNote}` }) });
    const result = fixGangwayExchangeProhibited(brief);
    assert.equal(result.applied, false);
});

test('(test 5) detects and relocates gangway exchange in shot narration', () => {
    const shot = makeShot({ narrationSegment: 'Host exchanges welcome gifts on the gangway.' });
    const sb = makeStoryboard({ shotSequence: [shot] });
    const brief = makeBrief({ productionBible: makeProductionBible({ storyboards: [sb], globalDirectionNotes: 'No exchanges, greetings, or handoffs on gangways or in primary embark/disembark flow paths.' }) });
    const result = fixGangwayExchangeProhibited(brief);
    assert.equal(result.applied, true);
    const fixedShot = result.brief.productionBible!.storyboards[0].shotSequence[0];
    assert.ok(!fixedShot.narrationSegment.match(/\bgangway\b/i), `gangway still in fixed narration: "${fixedShot.narrationSegment}"`);
    assert.ok(fixedShot.narrationSegment.includes('dockside'), `expected 'dockside' in fixed narration: "${fixedShot.narrationSegment}"`);
});

test('(test 5) detects and relocates gangway handoff in shot subjectMotion', () => {
    const shot = makeShot({ subjectMotion: 'handoff on the gangway, moving crowd' });
    const sb = makeStoryboard({ shotSequence: [shot] });
    const brief = makeBrief({ productionBible: makeProductionBible({ storyboards: [sb] }) });
    const result = fixGangwayExchangeProhibited(brief);
    assert.equal(result.applied, true);
    const fixedShot = result.brief.productionBible!.storyboards[0].shotSequence[0];
    assert.ok(fixedShot.subjectMotion.includes('dockside') || !fixedShot.subjectMotion.match(/\bgangway\b/i));
});

test('(test 6) injects no-exchanges-on-gangways note into globalDirectionNotes', () => {
    const shot = makeShot({ narrationSegment: 'Exchange welcome bags on the gangway.' });
    const brief = makeBrief({ productionBible: makeProductionBible({ storyboards: [makeStoryboard({ shotSequence: [shot] })] }) });
    const result = fixGangwayExchangeProhibited(brief);
    assert.ok(result.brief.productionBible!.globalDirectionNotes.includes('No exchanges, greetings, or handoffs on gangways'));
});

test('(test 6) gangway rule injected exactly once — second run is no-op', () => {
    const shot = makeShot({ narrationSegment: 'Handoff on the gangway.' });
    const brief = makeBrief({ productionBible: makeProductionBible({ storyboards: [makeStoryboard({ shotSequence: [shot] })] }) });
    const first = fixGangwayExchangeProhibited(brief);
    assert.equal(first.applied, true, 'first run must apply');
    const second = fixGangwayExchangeProhibited(first.brief);
    assert.equal(second.applied, false, 'second run must be no-op');
    const ruleCount = (first.brief.productionBible!.globalDirectionNotes.match(/No exchanges, greetings/g) ?? []).length;
    assert.equal(ruleCount, 1, 'rule note should appear exactly once');
});

test('gangway fixer idempotent on storyboard narrationScript too', () => {
    const sb = makeStoryboard({ narrationScript: 'The trade happens on the gangway entrance.' });
    const brief = makeBrief({ productionBible: makeProductionBible({ storyboards: [sb] }) });
    const first = fixGangwayExchangeProhibited(brief);
    assert.equal(first.applied, true, 'first run must apply');
    const fixedNarration = first.brief.productionBible!.storyboards[0].narrationScript;
    assert.ok(!fixedNarration.match(/\btrade\b.*\bgangway\b/i) && !fixedNarration.match(/\bgangway\b.*\btrade\b/i), `trade+gangway still present: "${fixedNarration}"`);
    const second = fixGangwayExchangeProhibited(first.brief);
    assert.equal(second.applied, false);
});

// ── 7 & 8: Storyboard Duration Alignment ────────────────────────────────────

console.log('\nFixer 4: Storyboard Duration Alignment\n');

test('no-ops when all durations already match', () => {
    const sb = makeStoryboard({ deliverableId: 'hero_explainer', totalDurationSeconds: 30 });
    const brief = makeBrief({ productionBible: makeProductionBible({ storyboards: [sb] }) });
    const result = fixStoryboardDurationAlignment(brief);
    assert.equal(result.applied, false);
});

test('(test 7) aligns tiktok_seed storyboard to videoConcepts.tiktokSeed.durationSeconds = 15', () => {
    const sb = makeStoryboard({ deliverableId: 'tiktok_seed', totalDurationSeconds: 35, shotSequence: [
        makeShot({ shotNumber: 1, durationSeconds: 12 }),
        makeShot({ shotNumber: 2, durationSeconds: 12 }),
        makeShot({ shotNumber: 3, durationSeconds: 11 }),
    ]});
    const brief = makeBrief({ productionBible: makeProductionBible({ storyboards: [sb] }) });
    const result = fixStoryboardDurationAlignment(brief);
    assert.equal(result.applied, true);
    const fixed = result.brief.productionBible!.storyboards[0];
    assert.equal(fixed.totalDurationSeconds, 15, `expected 15, got ${fixed.totalDurationSeconds}`);
});

test('(test 7) aligns threshold_announcement storyboard to 18', () => {
    const sb = makeStoryboard({ deliverableId: 'threshold_announcement', totalDurationSeconds: 30, shotSequence: [
        makeShot({ shotNumber: 1, durationSeconds: 10 }),
        makeShot({ shotNumber: 2, durationSeconds: 10 }),
        makeShot({ shotNumber: 3, durationSeconds: 10 }),
    ]});
    const brief = makeBrief({ productionBible: makeProductionBible({ storyboards: [sb] }) });
    const result = fixStoryboardDurationAlignment(brief);
    assert.equal(result.applied, true);
    const fixed = result.brief.productionBible!.storyboards[0];
    assert.equal(fixed.totalDurationSeconds, 18);
});

test('(test 8) per-shot durations sum exactly to the new total', () => {
    const sb = makeStoryboard({ deliverableId: 'tiktok_seed', totalDurationSeconds: 35, shotSequence: [
        makeShot({ shotNumber: 1, durationSeconds: 12 }),
        makeShot({ shotNumber: 2, durationSeconds: 12 }),
        makeShot({ shotNumber: 3, durationSeconds: 11 }),
    ]});
    const brief = makeBrief({ productionBible: makeProductionBible({ storyboards: [sb] }) });
    const result = fixStoryboardDurationAlignment(brief);
    const fixed = result.brief.productionBible!.storyboards[0];
    const shotSum = fixed.shotSequence.reduce((sum, s) => sum + s.durationSeconds, 0);
    assert.equal(shotSum, fixed.totalDurationSeconds, `shot sum ${shotSum} ≠ totalDurationSeconds ${fixed.totalDurationSeconds}`);
});

test('(test 8) per-shot sum correct for 4 shots at 15s total', () => {
    const shots = [1, 2, 3, 4].map(n => makeShot({ shotNumber: n, durationSeconds: 10 }));
    const sb = makeStoryboard({ deliverableId: 'tiktok_seed', totalDurationSeconds: 40, shotSequence: shots });
    const brief = makeBrief({ productionBible: makeProductionBible({ storyboards: [sb] }) });
    const result = fixStoryboardDurationAlignment(brief);
    const fixed = result.brief.productionBible!.storyboards[0];
    const shotSum = fixed.shotSequence.reduce((sum, s) => sum + s.durationSeconds, 0);
    assert.equal(shotSum, 15, `shot sum should be 15, got ${shotSum}`);
    assert.equal(fixed.totalDurationSeconds, 15);
});

test('duration fixer is idempotent', () => {
    const sb = makeStoryboard({ deliverableId: 'threshold_announcement', totalDurationSeconds: 30, shotSequence: [
        makeShot({ shotNumber: 1, durationSeconds: 10 }),
        makeShot({ shotNumber: 2, durationSeconds: 10 }),
        makeShot({ shotNumber: 3, durationSeconds: 10 }),
    ]});
    const brief = makeBrief({ productionBible: makeProductionBible({ storyboards: [sb] }) });
    const first = fixStoryboardDurationAlignment(brief);
    const second = fixStoryboardDurationAlignment(first.brief);
    assert.equal(second.applied, false, 'second run must be no-op');
});

test('duration fixer does not mutate non-named deliverable IDs', () => {
    const sb = makeStoryboard({ deliverableId: 'countdown_1', totalDurationSeconds: 9999 });
    const brief = makeBrief({ productionBible: makeProductionBible({ storyboards: [sb] }) });
    const result = fixStoryboardDurationAlignment(brief);
    assert.equal(result.applied, false, 'countdown_1 is not a named deliverable mapping — should not be touched');
});

// ── 9: Production Safety Ops Missing ─────────────────────────────────────────

console.log('\nFixer 5: Production Safety Ops Missing\n');

test('no-ops when ops bundle already present everywhere', () => {
    const bundle = 'Passenger-area capture rules: max two-person crew, one off-frame spotter, off-peak capture only, maintain single-file keep-right flow, and stand down immediately if passenger traffic builds or flow is impeded.';
    const brief = makeBrief({ productionBible: makeProductionBible({ globalDirectionNotes: `Approved direction. ${bundle}` }) });
    const result = fixProductionSafetyOpsMissing(brief);
    assert.equal(result.applied, false);
});

test('(test 9) injects full ops bundle into globalDirectionNotes', () => {
    const brief = makeBrief();
    const result = fixProductionSafetyOpsMissing(brief);
    assert.equal(result.applied, true);
    assert.ok(result.brief.productionBible!.globalDirectionNotes.includes('max two-person crew'));
    assert.ok(result.brief.productionBible!.globalDirectionNotes.includes('single-file keep-right flow'));
    assert.ok(result.brief.productionBible!.globalDirectionNotes.includes('stand down immediately'));
});

test('(test 9) ops bundle injected exactly once — not duplicated on second run', () => {
    const brief = makeBrief();
    const first = fixProductionSafetyOpsMissing(brief);
    const second = fixProductionSafetyOpsMissing(first.brief);
    assert.equal(second.applied, false, 'second run must be no-op');
    const bundleCount = (first.brief.productionBible!.globalDirectionNotes.match(/max two-person crew/g) ?? []).length;
    assert.equal(bundleCount, 1, 'ops bundle should appear exactly once');
});

test('injects local ops note into walkway-sensitive storyboard editingStyle', () => {
    const sb = makeStoryboard({
        editingStyle: 'editorial, deliberate pace',
        narrationScript: 'Wide shot along the promenade as guests walk.',
    });
    const brief = makeBrief({ productionBible: makeProductionBible({ storyboards: [sb] }) });
    const result = fixProductionSafetyOpsMissing(brief);
    assert.equal(result.applied, true);
    assert.ok(result.brief.productionBible!.storyboards[0].editingStyle.includes('max two-person crew'));
});

test('does not inject local ops note into non-walkway storyboard', () => {
    const sb = makeStoryboard({
        editingStyle: 'editorial cuts',
        narrationScript: 'Wide aerial of ocean and ship.',
    });
    const brief = makeBrief({ productionBible: makeProductionBible({ storyboards: [sb] }) });
    const result = fixProductionSafetyOpsMissing(brief);
    assert.equal(result.applied, true, 'global note should still be injected');
    assert.ok(!result.brief.productionBible!.storyboards[0].editingStyle.includes('max two-person crew'), 'non-walkway storyboard should not get local ops note');
});

// ── 10: Idempotency of all five fixers ───────────────────────────────────────

console.log('\nAll Five Fixers — Idempotency\n');

test('(test 10) camera fixer idempotent', () => {
    const shot = makeShot({ cameraMovement: 'crane rise then dolly forward' });
    const brief = makeBrief({ productionBible: makeProductionBible({ storyboards: [makeStoryboard({ shotSequence: [shot] })] }) });
    const first = fixCameraMoveFeasibility(brief);
    const second = fixCameraMoveFeasibility(first.brief);
    assert.equal(second.applied, false);
});

test('(test 10) cabin fixer idempotent', () => {
    const scene = makeScene({ location: 'Interior stateroom desk with ocean-view window' });
    const brief = makeBrief({ productionBible: makeProductionBible({ sceneLibrary: [scene] }) });
    const first = fixCabinTypePlausibility(brief);
    const second = fixCabinTypePlausibility(first.brief);
    assert.equal(second.applied, false);
});

test('(test 10) gangway fixer idempotent', () => {
    const shot = makeShot({ narrationSegment: 'Exchange on the gangway.' });
    const brief = makeBrief({ productionBible: makeProductionBible({ storyboards: [makeStoryboard({ shotSequence: [shot] })] }) });
    const first = fixGangwayExchangeProhibited(brief);
    assert.equal(first.applied, true, 'first run must apply');
    const second = fixGangwayExchangeProhibited(first.brief);
    assert.equal(second.applied, false, 'second run must be no-op');
});

test('(test 10) duration fixer idempotent', () => {
    const sb = makeStoryboard({ deliverableId: 'tiktok_seed', totalDurationSeconds: 35, shotSequence: [makeShot({ durationSeconds: 35 })] });
    const brief = makeBrief({ productionBible: makeProductionBible({ storyboards: [sb] }) });
    const first = fixStoryboardDurationAlignment(brief);
    const second = fixStoryboardDurationAlignment(first.brief);
    assert.equal(second.applied, false);
});

test('(test 10) safety ops fixer idempotent', () => {
    const brief = makeBrief();
    const first = fixProductionSafetyOpsMissing(brief);
    const second = fixProductionSafetyOpsMissing(first.brief);
    assert.equal(second.applied, false);
});

// ── 11: Deadlock suggestion logic ────────────────────────────────────────────

console.log('\nDeadlock Suggestion Patterns\n');

test('(test 11) suggests camera_move_feasibility for crane/dolly mentions', () => {
    const suggestions = suggestDeterministicIssueCodes(['SC3 uses crane movement in passenger walkway'], '');
    assert.ok(suggestions.includes('camera_move_feasibility'), `Expected camera_move_feasibility, got: ${suggestions.join(', ')}`);
});

test('(test 11) suggests camera_move_feasibility for dolly shot', () => {
    const suggestions = suggestDeterministicIssueCodes(['dolly forward in public area not permitted'], '');
    assert.ok(suggestions.includes('camera_move_feasibility'));
});

test('(test 11) suggests cabin_type_plausibility for interior+window contradiction', () => {
    const suggestions = suggestDeterministicIssueCodes(['SC8 interior stateroom with window is impossible'], '');
    assert.ok(suggestions.includes('cabin_type_plausibility'));
});

test('(test 11) suggests gangway_exchange_prohibited for gangway mention', () => {
    const suggestions = suggestDeterministicIssueCodes(['SC10 shows exchange on the gangway'], '');
    assert.ok(suggestions.includes('gangway_exchange_prohibited'));
});

test('(test 11) suggests storyboard_duration_alignment for duration mismatch', () => {
    const suggestions = suggestDeterministicIssueCodes(['duration mismatch between tiktok_seed and storyboard'], '');
    assert.ok(suggestions.includes('storyboard_duration_alignment'));
});

test('(test 11) suggests production_safety_ops_missing for spotter/crew mentions', () => {
    const suggestions = suggestDeterministicIssueCodes(['missing spotter and off-peak rules'], '');
    assert.ok(suggestions.includes('production_safety_ops_missing'));
});

test('(test 11) suggests production_safety_ops_missing for keep-right flow', () => {
    const suggestions = suggestDeterministicIssueCodes([], 'add two-person crew max and stand-down protocol');
    assert.ok(suggestions.includes('production_safety_ops_missing'));
});

// ── 12: Registry integrity ────────────────────────────────────────────────────

console.log('\nRegistry Integrity\n');

test('(test 12) all new issue codes target whitelisted paths', () => {
    const newCodes = [
        'camera_move_feasibility',
        'cabin_type_plausibility',
        'gangway_exchange_prohibited',
        'storyboard_duration_alignment',
        'production_safety_ops_missing',
    ] as const;
    const violations: string[] = [];
    for (const code of newCodes) {
        for (const op of ISSUE_CODE_OPERATIONS[code]) {
            if (!isAllowedTargetPath(op.targetPath)) {
                violations.push(`${code}: ${op.targetPath}`);
            }
        }
    }
    assert.deepEqual(violations, [], `Operations with disallowed paths: ${violations.join(', ')}`);
});

test('camera_move_feasibility maps to normalize_camera_movements', () => {
    const ops = ISSUE_CODE_OPERATIONS.camera_move_feasibility;
    assert.equal(ops.length, 1);
    assert.equal(ops[0].kind, 'normalize_camera_movements');
    assert.equal(ops[0].targetPath, 'productionBible.storyboards');
});

test('cabin_type_plausibility maps to normalize_cabin_type', () => {
    const ops = ISSUE_CODE_OPERATIONS.cabin_type_plausibility;
    assert.equal(ops.length, 1);
    assert.equal(ops[0].kind, 'normalize_cabin_type');
    assert.equal(ops[0].targetPath, 'productionBible.sceneLibrary');
});

test('gangway_exchange_prohibited maps to remove_or_relocate_scene_beat', () => {
    const ops = ISSUE_CODE_OPERATIONS.gangway_exchange_prohibited;
    assert.equal(ops.length, 1);
    assert.equal(ops[0].kind, 'remove_or_relocate_scene_beat');
    assert.equal(ops[0].targetPath, 'productionBible.storyboards');
});

test('storyboard_duration_alignment maps to align_storyboard_durations', () => {
    const ops = ISSUE_CODE_OPERATIONS.storyboard_duration_alignment;
    assert.equal(ops.length, 1);
    assert.equal(ops[0].kind, 'align_storyboard_durations');
    assert.equal(ops[0].targetPath, 'productionBible.storyboards');
});

test('production_safety_ops_missing maps to inject_production_safety_ops', () => {
    const ops = ISSUE_CODE_OPERATIONS.production_safety_ops_missing;
    assert.equal(ops.length, 1);
    assert.equal(ops[0].kind, 'inject_production_safety_ops');
    assert.equal(ops[0].targetPath, 'productionBible.globalDirectionNotes');
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
