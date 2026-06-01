// lib/campaigns/media/__tests__/source-quality.test.ts
//
// Phase 3 (IMAGE_GEN_REVAMP_5-26): regression tests for the deterministic
// source-quality scoring heuristics. These cover composition family / time
// of day / treatment inference, people-count estimation, the two 0..1 scores
// (themeLegibility, groupAction), the orchestrator (computeSourceQuality),
// and the Copy-Forge pool advisory aggregator.

import assert from 'node:assert/strict';
import type { CampaignAestheticBrief, SceneSpec, SourceQualityMetadata } from '../../schema';
import {
    applyVisionVerifiedSourceQuality,
    buildSourcePoolAdvisory,
    computeSourceQuality,
    inferArtisticTreatment,
    inferCompositionFamily,
    inferPeopleCount,
    inferTimeOfDay,
    scoreGroupAction,
    scoreThemeLegibility,
} from '../source-quality';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeScene(overrides: Partial<SceneSpec> = {}): SceneSpec {
    return {
        sceneId: 'scene-1',
        location: 'open deck at golden hour',
        timeOfDay: 'golden hour',
        lighting: 'warm directional light',
        cameraAngle: 'medium-wide',
        subjectAction: 'four friends laughing as they gather along the rail',
        environmentDetails: 'teak deck, ocean horizon',
        mood: 'easy belonging',
        imagePrompt: 'A group of four friends gather along the polished teak rail at golden hour, laughing together',
        referenceCategory: 'open_deck',
        ...overrides,
    };
}

function makeBrief(overrides: Partial<{ niche: string[]; minPeople: number; age: string; diversity: string }> = {}): CampaignAestheticBrief {
    return {
        slug: 'test',
        themeName: 'wellness-and-nature-cruise',
        identityBlueprint: {
            evidenceOfBelonging: overrides.niche ?? ['wellness retreat', 'breath practice', 'mindful gathering'],
            imageBehavior: overrides.niche ?? ['mindful pause', 'shared breath'],
            propFamilies: [],
            visualFlavor: 'travel_nostalgia',
            emotionalPromise: '',
            energyMode: '',
        },
        // Cast as any below — only the fields source-quality reads need to be present.
        visual: {
            humanRepresentation: {
                castingGoal: '',
                ageRangeGuidance: overrides.age ?? 'mixed ages including senior and young adult',
                diversityIntent: overrides.diversity ?? 'visibly diverse, multi-ethnic group',
                pairingGuidance: '',
                stylingGuidance: '',
                antiStereotypeRules: [],
                minimumVisiblePeople: overrides.minPeople ?? 3,
            },
        },
    } as unknown as CampaignAestheticBrief;
}

// ─── Test runner ──────────────────────────────────────────────────────────────

async function main() {
    let passed = 0;
    let failed = 0;

    function test(label: string, fn: () => void): void {
        try {
            fn();
            console.log(`PASS  ${label}`);
            passed++;
        } catch (err) {
            console.error(`FAIL  ${label}`);
            console.error(`      ${err instanceof Error ? err.message : String(err)}`);
            failed++;
        }
    }

    // ── inferCompositionFamily ────────────────────────────────────────────────

    test('rail-side prompt → "rail"', () => {
        assert.equal(inferCompositionFamily({ imagePrompt: 'leaning on the rail at sunset' }), 'rail');
    });

    test('window/cabin prompt → "window"', () => {
        assert.equal(inferCompositionFamily({ imagePrompt: 'a guest gazing out the cabin window' }), 'window');
    });

    test('dining room prompt → "dining_communal"', () => {
        assert.equal(inferCompositionFamily({ imagePrompt: 'the long communal table in the dining room' }), 'dining_communal');
    });

    test('spa/treatment prompt → "treatment_room"', () => {
        assert.equal(inferCompositionFamily({ imagePrompt: 'guest in the spa treatment room' }), 'treatment_room');
    });

    test('off-ship port prompt → "off_ship_excursion"', () => {
        assert.equal(inferCompositionFamily({ imagePrompt: 'exploring local culture at a recognizable port' }), 'off_ship_excursion');
    });

    test('unrecognized prompt → "other"', () => {
        assert.equal(inferCompositionFamily({ imagePrompt: 'a totally abstract scene' }), 'other');
    });

    // ── inferTimeOfDay ────────────────────────────────────────────────────────

    test('"golden hour" → golden_hour', () => {
        assert.equal(inferTimeOfDay('golden hour'), 'golden_hour');
    });

    test('"dusk" → dusk_blue_hour', () => {
        assert.equal(inferTimeOfDay('dusk on the deck'), 'dusk_blue_hour');
    });

    test('"sunrise" → sunrise', () => {
        assert.equal(inferTimeOfDay('sunrise yoga'), 'sunrise');
    });

    test('"night" → night', () => {
        assert.equal(inferTimeOfDay('night-time interior'), 'night');
    });

    test('unrecognized → midday default', () => {
        assert.equal(inferTimeOfDay('unspecified'), 'midday');
    });

    // ── inferArtisticTreatment ────────────────────────────────────────────────

    test('"35mm film grain" → film_grain_35mm', () => {
        assert.equal(inferArtisticTreatment({ prompt: 'shot on 35mm film grain' }), 'film_grain_35mm');
    });

    test('"watercolor" → watercolor_illustration', () => {
        assert.equal(inferArtisticTreatment({ prompt: 'a watercolor sketch of the deck' }), 'watercolor_illustration');
    });

    test('painted deck material stays natural_documentary', () => {
        assert.equal(
            inferArtisticTreatment({
                prompt: 'documentary cruise photography with painted deck surfaces, teak, steel, and glass',
            }),
            'natural_documentary',
        );
    });

    test('"black and white" → black_and_white', () => {
        assert.equal(inferArtisticTreatment({ prompt: 'a black-and-white editorial frame' }), 'black_and_white');
    });

    test('default → natural_documentary', () => {
        assert.equal(inferArtisticTreatment({ prompt: 'natural light, observational' }), 'natural_documentary');
    });

    // ── inferPeopleCount ──────────────────────────────────────────────────────

    test('explicit "5 people" → 5', () => {
        assert.equal(inferPeopleCount({ imagePrompt: '5 people gathered' }), 5);
    });

    test('"solo" → 1', () => {
        assert.equal(inferPeopleCount({ imagePrompt: 'a solo guest at the rail' }), 1);
    });

    test('"couple" → 2', () => {
        assert.equal(inferPeopleCount({ imagePrompt: 'a couple leaning over the rail' }), 2);
    });

    test('"small group" → 4', () => {
        assert.equal(inferPeopleCount({ imagePrompt: 'a small group on the open deck' }), 4);
    });

    test('"crowd" → 8', () => {
        assert.equal(inferPeopleCount({ imagePrompt: 'a crowd gathered for the talk' }), 8);
    });

    test('no signal → falls back to minimumVisiblePeople or 4', () => {
        assert.equal(inferPeopleCount({ imagePrompt: 'a scene on deck', minimumVisiblePeople: 3 }), 3);
        assert.equal(inferPeopleCount({ imagePrompt: 'a scene on deck' }), 4);
    });

    // ── scoreThemeLegibility ──────────────────────────────────────────────────

    test('niche signal in both imagePrompt and subjectAction + specific action + preserved features → 1.0', () => {
        const scene = makeScene({
            imagePrompt: 'A wellness retreat moment, breath practice on the deck',
            subjectAction: 'four guests breathing in unison during the wellness retreat pause',
            mustPreserveShipFeatures: ['glass_atrium_arches'],
        });
        const brief = makeBrief({ niche: ['wellness retreat', 'breath practice'] });
        assert.equal(scoreThemeLegibility(scene, brief), 1);
    });

    test('niche signal in neither field, no preserve features → low score', () => {
        const scene = makeScene({
            imagePrompt: 'A nondescript open-deck moment',
            subjectAction: 'people on deck',
            mustPreserveShipFeatures: undefined,
        });
        const brief = makeBrief({ niche: ['wellness retreat'] });
        const score = scoreThemeLegibility(scene, brief);
        assert.ok(score < 0.5, `expected score < 0.5, got ${score}`);
    });

    // ── scoreGroupAction ──────────────────────────────────────────────────────

    test('5 people with activity verb → 1.0', () => {
        assert.equal(scoreGroupAction({ peopleCount: 5, subjectAction: 'four friends gather and laugh' }), 1);
    });

    test('5 people without activity verb → 1.0 still (count alone covers it)', () => {
        assert.equal(scoreGroupAction({ peopleCount: 5, subjectAction: 'sitting quietly' }), 1);
    });

    test('2 people with activity verb → 0.5', () => {
        const score = scoreGroupAction({ peopleCount: 2, subjectAction: 'two friends share a moment' });
        assert.ok(score > 0.3 && score <= 0.6, `expected mid score, got ${score}`);
    });

    test('1 person no activity → 0', () => {
        assert.equal(scoreGroupAction({ peopleCount: 1, subjectAction: '' }), 0);
    });

    // ── computeSourceQuality (orchestrator) ───────────────────────────────────

    test('computeSourceQuality returns all fields populated', () => {
        const scene = makeScene({
            imagePrompt: 'A wellness retreat moment with four friends breathing on the deck at golden hour',
            subjectAction: 'four friends share a wellness retreat breath',
            timeOfDay: 'golden hour',
            location: 'open deck',
            referenceCategory: 'pool_deck',
            mustPreserveShipFeatures: ['glass_atrium_arches'],
        });
        const brief = makeBrief({ niche: ['wellness retreat', 'breath practice'] });
        const meta: SourceQualityMetadata = computeSourceQuality({
            scene,
            brief,
            promptUsed: scene.imagePrompt,
            tags: ['scene'],
        });
        assert.equal(meta.compositionFamily, 'open_deck');
        assert.equal(meta.timeOfDay, 'golden_hour');
        assert.equal(meta.peopleCount, 4);
        assert.equal(meta.shipLocationFamily, 'pool_deck');
        assert.equal(meta.artisticTreatment, 'natural_documentary');
        assert.ok(meta.groupActionScore >= 0.8, `groupActionScore should be high, got ${meta.groupActionScore}`);
        assert.ok(meta.themeLegibilityScore >= 0.75, `themeLegibilityScore should be high, got ${meta.themeLegibilityScore}`);
    });

    // ── buildSourcePoolAdvisory ───────────────────────────────────────────────

    test('vision verification preserves support-surface integrity findings', () => {
        const base: SourceQualityMetadata = {
            compositionFamily: 'pool_apron',
            peopleCount: 4,
            demographicCoverage: { ageBands: [], ethnicityBands: [] },
            timeOfDay: 'midday',
            themeLegibilityScore: 0.5,
            groupActionScore: 0.5,
            artisticTreatment: 'natural_documentary',
        };
        const verified = applyVisionVerifiedSourceQuality(base, {
            supportSurfaceIntegrity: {
                supported: false,
                issue: 'guest appears to be seated directly on open pool water',
            },
            evaluatedAt: '2026-05-28T00:00:00.000Z',
        });
        assert.equal(verified.scoringSource, 'vision_verified');
        assert.deepEqual(verified.supportSurfaceIntegrity, {
            supported: false,
            issue: 'guest appears to be seated directly on open pool water',
        });
    });

    test('empty advisory has zero sample size', () => {
        const advisory = buildSourcePoolAdvisory([]);
        assert.equal(advisory.sampleSize, 0);
        assert.equal(advisory.bestGroupActionScore, 0);
    });

    test('advisory averages people and tracks best scores', () => {
        const meta: SourceQualityMetadata[] = [
            {
                compositionFamily: 'rail',
                peopleCount: 2,
                demographicCoverage: { ageBands: [], ethnicityBands: [] },
                timeOfDay: 'midday',
                themeLegibilityScore: 0.5,
                groupActionScore: 0.3,
                artisticTreatment: 'natural_documentary',
            },
            {
                compositionFamily: 'open_deck',
                peopleCount: 6,
                demographicCoverage: { ageBands: ['multi_gen'], ethnicityBands: ['diverse_mixed'] },
                timeOfDay: 'golden_hour',
                themeLegibilityScore: 0.9,
                groupActionScore: 1,
                artisticTreatment: 'natural_documentary',
            },
        ];
        const advisory = buildSourcePoolAdvisory(meta);
        assert.equal(advisory.sampleSize, 2);
        assert.equal(advisory.averagePeopleCount, 4);
        assert.equal(advisory.bestGroupActionScore, 1);
        assert.equal(advisory.bestThemeLegibilityScore, 0.9);
        assert.equal(advisory.compositionFamilyBreakdown.rail, 1);
        assert.equal(advisory.compositionFamilyBreakdown.open_deck, 1);
        assert.equal(advisory.timeOfDayBreakdown.midday, 1);
        assert.equal(advisory.timeOfDayBreakdown.golden_hour, 1);
    });

    // ─── Summary ──────────────────────────────────────────────────────────────

    console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
    if (failed > 0) process.exit(1);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
