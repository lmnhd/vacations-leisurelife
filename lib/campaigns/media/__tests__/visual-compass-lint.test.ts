// lib/campaigns/media/__tests__/visual-compass-lint.test.ts
//
// Phase 5 (IMAGE_GEN_REVAMP_5-26): visual-compass lint over actual manifest
// source pools, including alternate-art leakage and source-quality coverage.

import assert from 'node:assert/strict';
import { lintVisualCompass } from '../visual-compass-lint';
import type { AssetRecord, CampaignMediaManifest, SourceQualityMetadata } from '../../schema';

const NOW = '2026-05-26T00:00:00.000Z';

function quality(overrides: Partial<SourceQualityMetadata> = {}): SourceQualityMetadata {
    return {
        compositionFamily: 'open_deck',
        peopleCount: 4,
        demographicCoverage: {
            ageBands: ['middle_aged'],
            ethnicityBands: ['diverse_mixed'],
        },
        timeOfDay: 'golden_hour',
        themeLegibilityScore: 0.8,
        groupActionScore: 0.9,
        artisticTreatment: 'natural_documentary',
        scoringSource: 'deterministic',
        ...overrides,
    };
}

function asset(
    assetId: string,
    overrides: Partial<AssetRecord> = {},
): AssetRecord {
    return {
        assetId,
        assetType: 'scene_image',
        url: `https://example.com/${assetId}.png`,
        generator: 'stability_ai',
        promptUsed: 'Four people gather on deck at golden hour',
        fileSizeBytes: 100,
        mimeType: 'image/png',
        tags: ['scene'],
        createdAt: NOW,
        reviewStatus: 'auto_approved',
        version: 1,
        active: true,
        eligibilityRole: 'source.group_action',
        sourceQuality: quality(),
        ...overrides,
    };
}

function manifest(overrides: Partial<CampaignMediaManifest['images']> = {}): CampaignMediaManifest {
    return {
        slug: 'visual-compass-test',
        generatedAt: NOW,
        totalAssets: 0,
        completionStatus: 'partial',
        images: {
            shipReferences: [],
            hero: [],
            flyerImages: [],
            sceneImages: [],
            aestheticConcepts: [],
            documentaryDetails: [],
            alternateArt: [],
            designedAdArtifacts: [],
            platformCrops: {},
            ...overrides,
        },
        videos: {
            tiktokSeed: null,
            heroExplainer: null,
            thresholdAnnouncement: null,
            countdown: [],
            broll: [],
        },
        audio: {
            ambientNarration: null,
            hypeClip: null,
            themeMusic: null,
        },
        merch: {
            designs: [],
            mockups: [],
            printfulProductIds: [],
        },
        copy: null,
    };
}

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

    test('blocks alternate-art leakage from photo-real source lanes', () => {
        const report = lintVisualCompass(manifest({
            hero: [
                asset('hero-art', {
                    assetType: 'alternate_art',
                    eligibilityRole: 'alternate_art',
                    sourceQuality: quality({ artisticTreatment: 'watercolor_illustration' }),
                }),
            ],
        }));
        assert.ok(report.blockingIssues.some((issue) => issue.code === 'alternate_art_leak'));
    });

    test('warns when source quality metadata is missing', () => {
        const report = lintVisualCompass(manifest({
            sceneImages: [asset('scene-no-quality', { sourceQuality: undefined })],
        }));
        assert.ok(report.warnings.some((issue) => issue.code === 'source_quality_missing'));
    });

    test('blocks impossible human support surfaces', () => {
        const report = lintVisualCompass(manifest({
            hero: [
                asset('pool-float-body', {
                    sourceQuality: quality({
                        supportSurfaceIntegrity: {
                            supported: false,
                            issue: 'seated person appears to be resting on open pool water',
                        },
                    }),
                }),
            ],
        }));
        assert.ok(report.blockingIssues.some((issue) => issue.code === 'support_surface_impossible'));
    });

    test('warns on rail/table/window overuse, daylight overuse, and missing dusk range', () => {
        const records = Array.from({ length: 5 }, (_, i) =>
            asset(`rail-${i}`, {
                sourceQuality: quality({
                    compositionFamily: i < 4 ? 'rail' : 'open_deck',
                    timeOfDay: 'midday',
                }),
            }),
        );
        const report = lintVisualCompass(manifest({ sceneImages: records }));
        assert.ok(report.warnings.some((issue) => issue.code === 'rail_table_window_overuse'));
        assert.ok(report.warnings.some((issue) => issue.code === 'bright_daylight_overuse'));
        assert.ok(report.warnings.some((issue) => issue.code === 'dusk_blue_hour_absent'));
    });

    test('warns on demographic monotony', () => {
        const records = Array.from({ length: 5 }, (_, i) =>
            asset(`demo-${i}`, {
                sourceQuality: quality({
                    demographicCoverage: { ageBands: ['senior'], ethnicityBands: ['white'] },
                }),
            }),
        );
        const report = lintVisualCompass(manifest({ sceneImages: records }));
        assert.ok(report.warnings.some((issue) => issue.code === 'demographic_monotony'));
    });

    test('passes a healthy varied source pool', () => {
        const records = [
            asset('a', { sourceQuality: quality({ timeOfDay: 'golden_hour', demographicCoverage: { ageBands: ['middle_aged'], ethnicityBands: ['black'] } }) }),
            asset('b', { sourceQuality: quality({ compositionFamily: 'dining_communal', timeOfDay: 'morning', demographicCoverage: { ageBands: ['young_adult'], ethnicityBands: ['latino'] } }) }),
            asset('c', { sourceQuality: quality({ compositionFamily: 'studio_class', timeOfDay: 'dusk_blue_hour', demographicCoverage: { ageBands: ['senior'], ethnicityBands: ['east_asian'] } }) }),
            asset('d', { sourceQuality: quality({ compositionFamily: 'pool_apron', timeOfDay: 'night', demographicCoverage: { ageBands: ['multi_gen'], ethnicityBands: ['south_asian'] } }) }),
        ];
        const report = lintVisualCompass(manifest({ sceneImages: records }));
        assert.equal(report.blockingIssues.length, 0);
        assert.equal(report.warnings.length, 0);
    });

    console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
    if (failed > 0) process.exit(1);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
