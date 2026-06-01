// lib/campaigns/media/__tests__/visual-compass-vision.test.ts
//
// Phase 5B (IMAGE_GEN_REVAMP_5-26): pure tests for visual-compass vision
// response parsing. No network or model calls.

import assert from 'node:assert/strict';
import {
    parseVisualCompassVisionResponse,
    tryExtractJsonObject,
} from '../visual-compass-vision';

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

    test('extracts fenced JSON object', () => {
        const raw = tryExtractJsonObject('```json\n{"themeLegibilityScore":0.8}\n```');
        assert.equal(raw.themeLegibilityScore, 0.8);
    });

    test('clamps scores and normalizes people count', () => {
        const parsed = parseVisualCompassVisionResponse({
            themeLegibilityScore: 2,
            groupActionScore: -1,
            peopleCount: 4.7,
        });
        assert.equal(parsed.themeLegibilityScore, 1);
        assert.equal(parsed.groupActionScore, 0);
        assert.equal(parsed.peopleCount, 5);
    });

    test('filters preserved features to expected feature list', () => {
        const parsed = parseVisualCompassVisionResponse({
            preservedFeaturesReported: ['glass_atrium_arches', 'invented_feature'],
        }, ['glass_atrium_arches']);
        assert.deepEqual(parsed.preservedFeaturesReported, ['glass_atrium_arches']);
    });

    test('keeps demographic arrays as clean strings', () => {
        const parsed = parseVisualCompassVisionResponse({
            ageBands: ['senior', '', 42, 'middle_aged'],
            ethnicityBands: ['black', null, 'latino'],
        });
        assert.deepEqual(parsed.ageBands, ['senior', 'middle_aged']);
        assert.deepEqual(parsed.ethnicityBands, ['black', 'latino']);
    });

    test('parses impossible support-surface findings', () => {
        const parsed = parseVisualCompassVisionResponse({
            supportSurfaceIntegrity: {
                supported: false,
                issue: 'guest appears seated on open water rather than a visible ledge',
            },
        });
        assert.deepEqual(parsed.supportSurfaceIntegrity, {
            supported: false,
            issue: 'guest appears seated on open water rather than a visible ledge',
        });
    });

    console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
    if (failed > 0) process.exit(1);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
