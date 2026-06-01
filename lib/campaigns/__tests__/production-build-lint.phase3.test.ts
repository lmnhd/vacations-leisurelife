// lib/campaigns/__tests__/production-build-lint.phase3.test.ts
//
// Phase 3 (IMAGE_GEN_REVAMP_5-26): regression tests for the new lint rules
// (rail_table_window_overuse, group_action_floor_missing, time_of_day_monotony).

import assert from 'node:assert/strict';
import { lintProductionBuild } from '../media/production-build-lint';
import type {
    LandingStillBible,
    LandingStillSpec,
    ProductionBible,
    SceneSpec,
    Storyboard,
} from '../schema';

// ─── Fixture helpers ──────────────────────────────────────────────────────────

function makeStill(overrides: Partial<LandingStillSpec>): LandingStillSpec {
    return {
        stillId: overrides.stillId ?? 'still-1',
        usage: overrides.usage ?? 'concept',
        location: overrides.location ?? 'ship atrium',
        environmentDetails: overrides.environmentDetails ?? 'modern ship interior with natural light',
        subjectAction: overrides.subjectAction ?? 'two guests enjoying the view',
        composition: overrides.composition ?? 'medium wide shot with ship architecture visible',
        mood: overrides.mood ?? 'warm joyful connection',
        imagePrompt: overrides.imagePrompt ?? 'Warm afternoon light fills the atrium as guests relax together',
        lighting: overrides.lighting ?? 'natural afternoon',
        timeOfDay: overrides.timeOfDay ?? 'midday',
        referenceCategory: overrides.referenceCategory ?? 'atrium',
        ...overrides,
    };
}

function makeScene(overrides: Partial<SceneSpec>): SceneSpec {
    return {
        sceneId: overrides.sceneId ?? 'scene-1',
        location: overrides.location ?? 'open deck',
        timeOfDay: overrides.timeOfDay ?? 'midday',
        lighting: overrides.lighting ?? 'natural midday',
        cameraAngle: overrides.cameraAngle ?? 'medium wide',
        subjectAction: overrides.subjectAction ?? 'four friends gather and laugh',
        environmentDetails: overrides.environmentDetails ?? 'teak deck, ocean',
        mood: overrides.mood ?? 'easy belonging',
        imagePrompt: overrides.imagePrompt ?? 'A small group of four friends gather on the open deck at midday',
        referenceCategory: overrides.referenceCategory ?? 'pool_deck',
    };
}

function makeBible(stills: LandingStillSpec[]): LandingStillBible {
    return { stillLibrary: stills, globalDirectionNotes: '', avoidDirectives: [] };
}

function makeProductionBible(scenes: SceneSpec[]): ProductionBible {
    const storyboards: Storyboard[] = [];
    return {
        sceneLibrary: scenes,
        storyboards,
        globalDirectionNotes: '',
        avoidDirectives: [],
    };
}

// Six stills with varied composition families — none in rail/table/window.
const SAFE_STILLS = Array.from({ length: 6 }, (_, i) => {
    const locations = ['dining room', 'library nook', 'sports deck', 'studio space', 'spa solarium', 'open deck'];
    const prompts = [
        'A communal dinner moment in the dining room',
        'Four friends meet in the library nook',
        'Group gathering on the sports deck',
        'Four people share a session in the studio space',
        'Quiet wellness moment in the spa solarium',
        'Four friends gather on the open deck',
    ];
    return makeStill({
        stillId: `still-${i + 1}`,
        location: locations[i],
        imagePrompt: prompts[i],
        composition: 'medium-wide',
        timeOfDay: ['golden hour', 'morning', 'midday', 'dusk', 'sunrise', 'midday'][i],
        subjectAction: `Four friends ${['gather', 'share', 'connect', 'laugh', 'cluster', 'meet'][i]} in the space`,
    });
});

// Ten scenes, all clearly group action with diverse compositions
function buildSafeScenes(): SceneSpec[] {
    return Array.from({ length: 10 }, (_, i) =>
        makeScene({
            sceneId: `scene-${i + 1}`,
            location: ['open deck', 'dining room', 'spa solarium', 'studio space', 'library nook',
                       'sports deck', 'pool apron', 'corridor', 'nature overlook', 'port excursion'][i],
            timeOfDay: ['golden hour', 'morning', 'midday', 'dusk', 'sunrise', 'midday',
                        'midday', 'midday', 'morning', 'golden hour'][i],
            subjectAction: 'four friends gather and share a wellness moment together',
            imagePrompt: 'Four friends gather and share a wellness moment together on the deck',
        }),
    );
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

    // ── rail_table_window_overuse ─────────────────────────────────────────────

    test('emits rail_table_window_overuse when > 3 specs lean on rail/table/window', () => {
        // 5 of 6 stills use rail/table/window. With no scene library the total
        // spec count is just the stills (6) — that's >= 8 only with scenes.
        // Combine with 4 rail-heavy scenes so the gate condition trips.
        const railStills = Array.from({ length: 5 }, (_, i) =>
            makeStill({
                stillId: `rail-${i + 1}`,
                location: i % 2 === 0 ? 'deck rail' : 'cabin window',
                imagePrompt: i % 2 === 0
                    ? 'Two guests leaning over the rail at sunset'
                    : 'A guest gazing out the cabin window',
                composition: 'rail-side close-up',
                timeOfDay: ['golden hour', 'dusk', 'morning', 'midday', 'sunrise'][i],
                subjectAction: `Guest ${i + 1} pauses at the rail or window`,
            }),
        );
        const okStill = makeStill({ stillId: 'still-ok', location: 'dining room', imagePrompt: 'communal table moment' });
        const railScenes = Array.from({ length: 4 }, (_, i) =>
            makeScene({
                sceneId: `scene-rail-${i + 1}`,
                location: 'deck rail',
                imagePrompt: 'four friends at the deck rail',
                subjectAction: 'four friends share a moment at the rail',
                timeOfDay: ['golden hour', 'dusk', 'sunrise', 'morning'][i],
            }),
        );
        const report = lintProductionBuild({
            landingStillBible: makeBible([...railStills, okStill]),
            productionBible: makeProductionBible(railScenes),
            themeName: 'test',
        });
        const found = report.warnings.find((w) => w.code === 'rail_table_window_overuse');
        assert.ok(found, 'rail_table_window_overuse warning must be present');
    });

    test('no rail_table_window_overuse when distribution is healthy', () => {
        const report = lintProductionBuild({
            landingStillBible: makeBible(SAFE_STILLS),
            productionBible: makeProductionBible(buildSafeScenes()),
            themeName: 'test',
        });
        const found = report.warnings.find((w) => w.code === 'rail_table_window_overuse');
        assert.equal(found, undefined, 'should not fire on a varied set');
    });

    // ── group_action_floor_missing ────────────────────────────────────────────

    test('emits group_action_floor_missing when fewer than 4 group-action scenes', () => {
        // 10 scenes but all solo/pair (peopleCount 1–2 → low groupActionScore)
        const soloScenes = Array.from({ length: 10 }, (_, i) =>
            makeScene({
                sceneId: `solo-${i + 1}`,
                imagePrompt: 'A solo guest contemplating the horizon',
                subjectAction: 'a solo guest pauses at the rail',
                location: ['deck', 'cabin', 'library', 'spa', 'dining',
                           'atrium', 'corridor', 'lounge', 'port', 'sports deck'][i],
            }),
        );
        const report = lintProductionBuild({
            landingStillBible: makeBible(SAFE_STILLS),
            productionBible: makeProductionBible(soloScenes),
            themeName: 'test',
        });
        const found = report.warnings.find((w) => w.code === 'group_action_floor_missing');
        assert.ok(found, 'group_action_floor_missing warning must be present');
    });

    test('no group_action_floor_missing when 4+ scenes read as group action', () => {
        const report = lintProductionBuild({
            landingStillBible: makeBible(SAFE_STILLS),
            productionBible: makeProductionBible(buildSafeScenes()),
            themeName: 'test',
        });
        const found = report.warnings.find((w) => w.code === 'group_action_floor_missing');
        assert.equal(found, undefined);
    });

    test('group_action_floor_missing is skipped when scene library < 6', () => {
        const fewScenes = buildSafeScenes().slice(0, 3).map((s) =>
            makeScene({ ...s, imagePrompt: 'solo moment', subjectAction: 'solo guest pause' }),
        );
        const report = lintProductionBuild({
            landingStillBible: makeBible(SAFE_STILLS),
            productionBible: makeProductionBible(fewScenes),
            themeName: 'test',
        });
        const found = report.warnings.find((w) => w.code === 'group_action_floor_missing');
        assert.equal(found, undefined, 'thin scene libraries should not trip the floor');
    });

    // ── time_of_day_monotony ──────────────────────────────────────────────────

    test('emits time_of_day_monotony when all specs are midday daylight', () => {
        const allMiddayStills = Array.from({ length: 6 }, (_, i) =>
            makeStill({
                stillId: `still-${i + 1}`,
                timeOfDay: 'midday',
                imagePrompt: `A midday scene at noon`,
                location: ['dining room', 'library nook', 'sports deck', 'studio space', 'spa solarium', 'open deck'][i],
                subjectAction: `Four friends ${['gather', 'share', 'connect', 'laugh', 'cluster', 'meet'][i]} at midday`,
            }),
        );
        const allMiddayScenes = Array.from({ length: 4 }, (_, i) =>
            makeScene({
                sceneId: `scene-${i + 1}`,
                timeOfDay: 'midday',
                imagePrompt: 'Four friends gather at midday on the deck',
            }),
        );
        const report = lintProductionBuild({
            landingStillBible: makeBible(allMiddayStills),
            productionBible: makeProductionBible(allMiddayScenes),
            themeName: 'test',
        });
        const found = report.warnings.find((w) => w.code === 'time_of_day_monotony');
        assert.ok(found, 'time_of_day_monotony warning must be present');
    });

    test('no time_of_day_monotony when at least one dusk/night/golden_hour beat exists', () => {
        const report = lintProductionBuild({
            landingStillBible: makeBible(SAFE_STILLS),
            productionBible: makeProductionBible(buildSafeScenes()),
            themeName: 'test',
        });
        const found = report.warnings.find((w) => w.code === 'time_of_day_monotony');
        assert.equal(found, undefined);
    });

    // ─── Summary ──────────────────────────────────────────────────────────────

    console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
    if (failed > 0) process.exit(1);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
