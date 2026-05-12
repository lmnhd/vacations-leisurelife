import assert from 'node:assert/strict';
import type { CampaignMediaManifest, ScheduledPost } from '../schema';
import type { Campaign } from '../types';
import { buildDistributionSchedule } from '../distribution-planner';

function makeCampaign(): Campaign {
    return {
        PK: 'CAMPAIGN#dist-designed-ads',
        SK: 'METADATA',
        id: 'dist-designed-ads',
        name: 'Distribution Designed Ads Test',
        description: 'Validation fixture',
        targetDates: '2026-11-07',
        targetDestination: 'Eastern Caribbean',
        shipTarget: 'Brilliance of the Seas',
        minCabinsRequired: 8,
        status: 'GATHERING_INTEREST',
        createdAt: '2026-04-30T00:00:00.000Z',
        updatedAt: '2026-04-30T00:00:00.000Z',
    } as Campaign;
}

function postByPlatform(posts: ScheduledPost[], platform: ScheduledPost['platform']): ScheduledPost | undefined {
    return posts.find((post) => post.platform === platform);
}

function makeManifest(): CampaignMediaManifest {
    return {
        slug: 'dist-designed-ads',
        generatedAt: '2026-04-30T00:00:00.000Z',
        totalAssets: 0,
        completionStatus: 'partial',
        images: {
            shipReferences: [],
            hero: [{
                assetId: 'img_hero_1',
                assetType: 'hero_image',
                url: 'https://example.com/hero.png',
                generator: 'stability_ai',
                promptUsed: 'hero',
                fileSizeBytes: 100,
                mimeType: 'image/png',
                tags: ['hero'],
                createdAt: '2026-04-30T00:00:00.000Z',
                reviewStatus: 'needs_review',
                version: 1,
                active: true,
            }],
            sceneImages: [],
            aestheticConcepts: [],
            documentaryDetails: [],
            designedAdArtifacts: [
                {
                    assetId: 'ad_editorial_cover_4x5',
                    assetType: 'designed_ad_artifact',
                    url: 'https://example.com/ad_editorial.png',
                    generator: 'sharp',
                    promptUsed: 'designed',
                    fileSizeBytes: 100,
                    mimeType: 'image/png',
                    tags: ['designed_ad', 'editorial_cover', 'instagram_feed'],
                    createdAt: '2026-04-30T00:00:00.000Z',
                    reviewStatus: 'needs_review',
                    version: 1,
                    active: true,
                },
                {
                    assetId: 'ad_image_detail_191x100',
                    assetType: 'designed_ad_artifact',
                    url: 'https://example.com/ad_detail.png',
                    generator: 'sharp',
                    promptUsed: 'designed',
                    fileSizeBytes: 100,
                    mimeType: 'image/png',
                    tags: ['designed_ad', 'image_detail', 'facebook', 'google_display'],
                    createdAt: '2026-04-30T00:00:00.000Z',
                    reviewStatus: 'needs_review',
                    version: 1,
                    active: true,
                },
                {
                    assetId: 'ad_itinerary_toc_4x5',
                    assetType: 'designed_ad_artifact',
                    url: 'https://example.com/ad_itinerary.png',
                    generator: 'sharp',
                    promptUsed: 'designed',
                    fileSizeBytes: 100,
                    mimeType: 'image/png',
                    tags: ['designed_ad', 'itinerary', 'carousel'],
                    createdAt: '2026-04-30T00:00:00.000Z',
                    reviewStatus: 'needs_review',
                    version: 1,
                    active: true,
                },
                {
                    assetId: 'ad_quote_card_1x1',
                    assetType: 'designed_ad_artifact',
                    url: 'https://example.com/ad_quote.png',
                    generator: 'sharp',
                    promptUsed: 'designed',
                    fileSizeBytes: 100,
                    mimeType: 'image/png',
                    tags: ['designed_ad', 'quote', 'instagram_square'],
                    createdAt: '2026-04-30T00:00:00.000Z',
                    reviewStatus: 'needs_review',
                    version: 1,
                    active: true,
                },
            ],
            platformCrops: {} as CampaignMediaManifest['images']['platformCrops'],
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

function main(): void {
    const campaign = makeCampaign();
    const manifest = makeManifest();
    const schedule = buildDistributionSchedule(campaign, manifest, { caller: 'agent' });

    assert.equal(postByPlatform(schedule.posts, 'instagram_feed')?.assetId, 'ad_editorial_cover_4x5');
    assert.deepEqual(postByPlatform(schedule.posts, 'instagram_feed')?.assetIds, [
        'ad_editorial_cover_4x5',
        'ad_itinerary_toc_4x5',
        'ad_quote_card_1x1',
    ]);
    assert.equal(postByPlatform(schedule.posts, 'facebook_ad')?.assetId, 'ad_image_detail_191x100');
    assert.equal(postByPlatform(schedule.posts, 'google_display')?.assetId, 'ad_image_detail_191x100');

    const fallbackManifest = {
        ...manifest,
        images: {
            ...manifest.images,
            designedAdArtifacts: [],
        },
    };
    const fallbackSchedule = buildDistributionSchedule(campaign, fallbackManifest, { caller: 'agent' });
    assert.equal(postByPlatform(fallbackSchedule.posts, 'facebook_ad')?.assetId, 'img_hero_1');
    assert.equal(postByPlatform(fallbackSchedule.posts, 'google_display')?.assetId, 'img_hero_1');

    console.log('distribution planner designed ads tests passed');
}

main();
