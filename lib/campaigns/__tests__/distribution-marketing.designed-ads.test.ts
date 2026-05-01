import assert from 'node:assert/strict';
import type { CampaignMediaManifest, ScheduledPost } from '../schema';
import type { Campaign } from '../types';
import { dispatchMarketingPost } from '../distribution-marketing';

function makeCampaign(): Campaign {
    return {
        PK: 'CAMPAIGN#dist-marketing-ads',
        SK: 'METADATA',
        id: 'dist-marketing-ads',
        name: 'Distribution Marketing Designed Ads Test',
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

function makeManifest(): CampaignMediaManifest {
    return {
        slug: 'dist-marketing-ads',
        generatedAt: '2026-04-30T00:00:00.000Z',
        totalAssets: 0,
        completionStatus: 'partial',
        images: {
            shipReferences: [],
            hero: [],
            sceneImages: [],
            aestheticConcepts: [],
            documentaryDetails: [],
            designedAdArtifacts: [{
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
            }],
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

async function main(): Promise<void> {
    const campaign = makeCampaign();
    const manifest = makeManifest();
    const post: ScheduledPost = {
        postId: 'post1',
        platform: 'facebook_ad',
        assetId: 'ad_image_detail_191x100',
        copyVariant: 'ad_variant_A',
        scheduledAt: new Date().toISOString(),
        campaignStage: 'seed_day_0',
        status: 'scheduled',
        notes: [],
    };

    const result = await dispatchMarketingPost(campaign, manifest, post, 'simulate');
    assert.equal(result.status, 'draft_created');
    assert.equal(typeof result.preview.mediaUrl, 'string');
    assert.ok(String(result.preview.mediaUrl).includes('ad_detail'));

    console.log('distribution marketing designed ads tests passed');
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
