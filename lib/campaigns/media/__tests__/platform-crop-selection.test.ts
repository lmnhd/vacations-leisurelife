import assert from 'node:assert/strict';
import type { AssetRecord } from '../../schema';
import { planPlatformCropSources } from '../platform-crop-selection';

function makeAsset(assetId: string, assetType: AssetRecord['assetType']): AssetRecord {
    return {
        assetId,
        assetType,
        url: `https://example.com/${assetId}.png`,
        generator: 'sharp',
        promptUsed: '',
        fileSizeBytes: 1000,
        mimeType: 'image/png',
        tags: assetType === 'scene_image' ? ['scene', assetId] : [assetType],
        createdAt: '2026-05-14T00:00:00.000Z',
        reviewStatus: 'human_approved',
        version: 1,
        active: true,
        curation: {
            approvalState: 'human_approved',
            globalPriority: 50,
            contextPriorities: {},
            approvedContexts: [],
            blockedContexts: [],
            suitabilityTags: [],
            antiTags: [],
            downstreamLocked: false,
            generationLocked: false,
            updatedAt: '2026-05-14T00:00:00.000Z',
        },
    };
}

async function main() {
    let passedCount = 0;
    let failedCount = 0;

    async function test(label: string, fn: () => Promise<void> | void): Promise<void> {
        try {
            await fn();
            console.log(`PASS ${label}`);
            passedCount++;
        } catch (err) {
            console.error(`FAIL ${label}`);
            console.error(`  ${err instanceof Error ? err.message : String(err)}`);
            failedCount++;
        }
    }

    await test('crop planning spreads selections across hero and scene pools when both exist', () => {
        const heroA = makeAsset('hero-a', 'hero_image');
        const heroB = makeAsset('hero-b', 'hero_image');
        const sceneA = makeAsset('scene-a', 'scene_image');
        const sceneB = makeAsset('scene-b', 'scene_image');
        const conceptA = makeAsset('concept-a', 'aesthetic_concept');

        const plan = planPlatformCropSources(
            [sceneA, sceneB],
            [heroA, heroB],
            [conceptA],
            null,
            ['hero_16x9', 'hero_4x5', 'story_9x16', 'square_1x1'],
        );

        const chosenIds = Array.from(plan.values()).map((asset) => asset.assetId);
        assert.equal(plan.size, 4);
        assert.ok(chosenIds.includes('hero-a') || chosenIds.includes('hero-b'));
        assert.ok(chosenIds.includes('scene-a') || chosenIds.includes('scene-b'));
        assert.ok(new Set(chosenIds).size >= 3, 'expected crop plan to diversify across multiple source assets');
    });

    await test('crop planning still resolves when hero assets are absent', () => {
        const sceneA = makeAsset('scene-a', 'scene_image');
        const conceptA = makeAsset('concept-a', 'aesthetic_concept');

        const plan = planPlatformCropSources(
            [sceneA],
            [],
            [conceptA],
            null,
            ['hero_16x9', 'hero_4x5'],
        );

        assert.equal(plan.size, 2);
        assert.ok(Array.from(plan.values()).every((asset) => asset.assetId === 'scene-a' || asset.assetId === 'concept-a'));
    });

    if (failedCount > 0) {
        throw new Error(`${failedCount} platform crop selection test(s) failed`);
    }

    console.log(`\n${passedCount} platform crop selection tests passed`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
