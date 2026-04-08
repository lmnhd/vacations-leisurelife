import { randomUUID } from 'crypto';
import type { Campaign } from './types';
import type {
    CampaignMediaManifest,
    DistributionCaller,
    DistributionPlatform,
    DistributionSchedule,
    ScheduledPost,
} from './schema';

interface PlannerOptions {
    caller: DistributionCaller;
    platforms?: DistributionPlatform[];
    stages?: string[];
    timezone?: string;
}

interface PostDraft {
    platform: DistributionPlatform;
    assetId: string;
    copyVariant: string;
    scheduledAt: string;
    campaignStage: string;
    notes?: string[];
}

function buildScheduledPost(draft: PostDraft): ScheduledPost {
    return {
        postId: `dist_${randomUUID().slice(0, 12)}`,
        platform: draft.platform,
        assetId: draft.assetId,
        copyVariant: draft.copyVariant,
        scheduledAt: draft.scheduledAt,
        campaignStage: draft.campaignStage,
        status: 'scheduled',
        notes: draft.notes ?? [],
    };
}

function addIfPresent(posts: PostDraft[], draft: PostDraft | null): void {
    if (draft) {
        posts.push(draft);
    }
}

function getPrimaryHeroAssetId(manifest: CampaignMediaManifest): string | null {
    return manifest.images.hero[0]?.assetId ?? manifest.images.platformCrops.hero_16x9?.[0]?.assetId ?? null;
}

function getEmailHeaderAssetId(manifest: CampaignMediaManifest): string | null {
    return manifest.images.platformCrops.email_header?.[0]?.assetId ?? null;
}

function getOgImageAssetId(manifest: CampaignMediaManifest): string | null {
    return manifest.images.platformCrops.og_image?.[0]?.assetId ?? null;
}

function resolveDefaultTikTokPlatform(options: PlannerOptions): DistributionPlatform {
    if (!options.platforms || options.platforms.length === 0) {
        return 'tiktok_paid';
    }

    const requestedPlatforms = new Set(options.platforms);
    if (requestedPlatforms.has('tiktok_paid')) {
        return 'tiktok_paid';
    }

    if (requestedPlatforms.has('tiktok')) {
        return 'tiktok';
    }

    return 'tiktok_paid';
}

export function buildDistributionSchedule(
    campaign: Campaign,
    manifest: CampaignMediaManifest,
    options: PlannerOptions,
): DistributionSchedule {
    const drafts: PostDraft[] = [];
    const primaryHeroAssetId = getPrimaryHeroAssetId(manifest);
    const emailHeaderAssetId = getEmailHeaderAssetId(manifest);
    const ogImageAssetId = getOgImageAssetId(manifest);
    const tiktokSeedId = manifest.videos.tiktokSeed?.assetId ?? null;
    const thresholdVideoId = manifest.videos.thresholdAnnouncement?.assetId ?? null;
    const hypeClipId = manifest.audio.hypeClip?.assetId ?? null;
    const countdownIds = manifest.videos.countdown.map((asset) => asset.assetId);
    const merchMockupId = manifest.merch.mockups[0]?.assetId ?? null;
    const pinterestAssetId = manifest.images.aestheticConcepts[0]?.assetId ?? primaryHeroAssetId;
    const squareFeedAssetId = manifest.images.platformCrops.square_1x1?.[0]?.assetId ?? null;
    const defaultTikTokPlatform = resolveDefaultTikTokPlatform(options);

    addIfPresent(drafts, ogImageAssetId ? {
        platform: 'email',
        assetId: ogImageAssetId,
        copyVariant: 'prelaunch_preview',
        scheduledAt: new Date().toISOString(),
        campaignStage: 'prelaunch_setup',
        notes: ['Internal placeholder until landing preview distribution adapter exists.'],
    } : null);

    addIfPresent(drafts, primaryHeroAssetId ? {
        platform: 'facebook_ad',
        assetId: primaryHeroAssetId,
        copyVariant: 'ad_variant_A',
        scheduledAt: campaign.status === 'GATHERING_INTEREST' ? new Date().toISOString() : 'ON_THRESHOLD',
        campaignStage: 'seed_day_0',
        notes: ['Creates ad-ready placeholder schedule entry. Platform adapter not implemented yet.'],
    } : null);

    addIfPresent(drafts, tiktokSeedId ? {
        platform: defaultTikTokPlatform,
        assetId: tiktokSeedId,
        copyVariant: 'tiktok_caption_0',
        scheduledAt: campaign.status === 'GATHERING_INTEREST' ? new Date().toISOString() : 'ON_THRESHOLD',
        campaignStage: 'seed_day_0',
        notes: [
            defaultTikTokPlatform === 'tiktok_paid'
                ? 'TikTok defaults to paused paid lead-gen drafts until business-account activation is complete.'
                : 'Legacy organic TikTok draft path selected explicitly.',
        ],
    } : null);

    addIfPresent(drafts, emailHeaderAssetId ? {
        platform: 'email',
        assetId: emailHeaderAssetId,
        copyVariant: 'email_waitlist_confirmation',
        scheduledAt: new Date().toISOString(),
        campaignStage: 'prelaunch_setup',
    } : null);

    addIfPresent(drafts, squareFeedAssetId ? {
        platform: 'instagram_feed',
        assetId: squareFeedAssetId,
        copyVariant: 'carousel_day_3',
        scheduledAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        campaignStage: 'seed_day_3',
    } : null);

    addIfPresent(drafts, countdownIds[0] ? {
        platform: 'email',
        assetId: countdownIds[0],
        copyVariant: 'window_day_3',
        scheduledAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        campaignStage: 'seed_day_3',
    } : null);

    addIfPresent(drafts, countdownIds[1] ? {
        platform: 'sms',
        assetId: countdownIds[1],
        copyVariant: 'window_day_7',
        scheduledAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        campaignStage: 'seed_day_7',
        notes: ['SMS adapter should resolve recipients from waitlist and manifest state.'],
    } : null);

    addIfPresent(drafts, countdownIds[2] ? {
        platform: 'instagram_story',
        assetId: countdownIds[2],
        copyVariant: 'window_day_14',
        scheduledAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        campaignStage: 'seed_day_14',
    } : null);

    addIfPresent(drafts, thresholdVideoId ? {
        platform: 'email',
        assetId: thresholdVideoId,
        copyVariant: 'threshold_met_email',
        scheduledAt: 'ON_THRESHOLD',
        campaignStage: 'threshold_met',
    } : null);

    addIfPresent(drafts, hypeClipId ? {
        platform: 'sms',
        assetId: hypeClipId,
        copyVariant: 'threshold_met_sms',
        scheduledAt: 'ON_THRESHOLD',
        campaignStage: 'threshold_met',
    } : null);

    addIfPresent(drafts, primaryHeroAssetId && campaign.communityChannelUrl ? {
        platform: 'discord',
        assetId: primaryHeroAssetId,
        copyVariant: 'discord_welcome_embed',
        scheduledAt: 'ON_THRESHOLD',
        campaignStage: 'threshold_met',
        notes: ['Uses communityChannelUrl from campaign metadata.'],
    } : null);

    addIfPresent(drafts, merchMockupId ? {
        platform: 'discord',
        assetId: merchMockupId,
        copyVariant: 'manifest_confirmation_merch',
        scheduledAt: 'ON_MANIFEST_SUBMIT',
        campaignStage: 'manifest_confirmation',
    } : null);

    addIfPresent(drafts, pinterestAssetId ? {
        platform: 'pinterest',
        assetId: pinterestAssetId,
        copyVariant: 'pinterest_seed_0',
        scheduledAt: new Date().toISOString(),
        campaignStage: 'seed_day_0',
    } : null);

    const filteredDrafts = drafts.filter((draft) => {
        const platformAllowed = !options.platforms || options.platforms.includes(draft.platform);
        const stageAllowed = !options.stages || options.stages.includes(draft.campaignStage);
        return platformAllowed && stageAllowed;
    });

    return {
        campaignSlug: campaign.id,
        timezone: options.timezone ?? 'UTC',
        generatedAt: new Date().toISOString(),
        generatedBy: options.caller,
        version: 1,
        posts: filteredDrafts.map(buildScheduledPost),
    };
}