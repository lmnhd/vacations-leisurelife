import type { Campaign } from './types';
import type { AssetRecord, CampaignMediaManifest, DistributionPostStatus, ScheduledPost } from './schema';

export type MarketingProviderMode = 'simulate' | 'live';

export interface MarketingDispatchResult {
    postId: string;
    platform: ScheduledPost['platform'];
    status: DistributionPostStatus;
    externalPostId?: string;
    metadataNotes?: string[];
    warning?: string;
    preview: Record<string, unknown>;
}

interface MetaAdsConfig {
    accessToken: string;
    adAccountId: string;
    adSetId: string;
    pageId: string;
    instagramActorId?: string;
}

interface MetaCreativeCreateResponse {
    id: string;
}

interface MetaAdCreateResponse {
    id: string;
}

interface MetaGraphError {
    error?: {
        message?: string;
        type?: string;
        code?: number;
        error_subcode?: number;
        fbtrace_id?: string;
    };
}

function getAllManifestAssets(manifest: CampaignMediaManifest): AssetRecord[] {
    return [
        ...manifest.images.shipReferences,
        ...manifest.images.hero,
        ...manifest.images.sceneImages,
        ...manifest.images.aestheticConcepts,
        ...Object.values(manifest.images.platformCrops).flat(),
        ...(manifest.videos.tiktokSeed ? [manifest.videos.tiktokSeed] : []),
        ...(manifest.videos.heroExplainer ? [manifest.videos.heroExplainer] : []),
        ...(manifest.videos.thresholdAnnouncement ? [manifest.videos.thresholdAnnouncement] : []),
        ...manifest.videos.countdown,
        ...manifest.videos.broll,
        ...(manifest.audio.ambientNarration ? [manifest.audio.ambientNarration] : []),
        ...(manifest.audio.hypeClip ? [manifest.audio.hypeClip] : []),
        ...(manifest.audio.themeMusic ? [manifest.audio.themeMusic] : []),
        ...manifest.merch.designs,
        ...manifest.merch.mockups,
    ];
}

function resolveAssetUrl(manifest: CampaignMediaManifest, assetId: string): string | null {
    return getAllManifestAssets(manifest).find((asset) => asset.assetId === assetId)?.url ?? null;
}

function parseTrailingIndex(value: string): number | null {
    const match = value.match(/_(\d+)$/);
    if (!match) {
        return null;
    }

    const parsed = Number.parseInt(match[1], 10);
    return Number.isNaN(parsed) ? null : parsed;
}

function getTikTokCaption(manifest: CampaignMediaManifest, fallback: string, copyVariant: string): string {
    const entries = manifest.copy?.captions.tiktok;
    if (!entries || entries.length === 0) {
        return fallback;
    }

    const index = parseTrailingIndex(copyVariant) ?? 0;
    const selected = entries[index] ?? entries[0];
    const hashtags = selected.hashtags.map((tag) => (tag.startsWith('#') ? tag : `#${tag}`)).join(' ');
    return `${selected.caption} ${hashtags}`.trim();
}

function getInstagramCaption(manifest: CampaignMediaManifest, campaign: Campaign): string {
    const slide = manifest.copy?.carouselSlides[0]?.trim();
    if (slide && slide.length > 0) {
        return slide;
    }

    return campaign.description;
}

function getMetaAdCopy(manifest: CampaignMediaManifest, campaign: Campaign, copyVariant: string): {
    headline: string;
    primaryText: string;
    description: string;
    cta: string;
} {
    const variantToken = copyVariant.split('_').pop();
    const variant = variantToken === 'A' || variantToken === 'B' || variantToken === 'C'
        ? variantToken
        : undefined;

    const selected = variant
        ? manifest.copy?.adVariants.find((entry) => entry.variant === variant)
        : manifest.copy?.adVariants[0];

    if (selected) {
        return {
            headline: selected.headline,
            primaryText: selected.primaryText,
            description: selected.description,
            cta: selected.cta,
        };
    }

    return {
        headline: campaign.name,
        primaryText: campaign.description,
        description: campaign.description,
        cta: 'LEARN_MORE',
    };
}

function buildPreviewPayload(
    campaign: Campaign,
    manifest: CampaignMediaManifest,
    post: ScheduledPost,
    assetUrl: string,
): Record<string, unknown> {
    if (post.platform === 'tiktok') {
        return {
            endpoint: '/v2/post/publish/inbox/video/init/',
            caption: getTikTokCaption(manifest, campaign.description, post.copyVariant),
            mediaUrl: assetUrl,
            deliveryMode: 'INBOX_SHARE_DRAFT',
            privacyLevel: 'SELF_ONLY',
            publishVisibility: 'User must complete the TikTok inbox review flow before the video appears on the profile page.',
            campaignStage: post.campaignStage,
        };
    }

    if (post.platform === 'instagram_feed' || post.platform === 'instagram_reels' || post.platform === 'instagram_story') {
        return {
            endpoint: '/{ig-user-id}/media + /{ig-user-id}/media_publish',
            mediaType: post.platform === 'instagram_reels' ? 'REELS' : post.platform === 'instagram_story' ? 'STORY' : 'IMAGE',
            caption: getInstagramCaption(manifest, campaign),
            mediaUrl: assetUrl,
            campaignStage: post.campaignStage,
        };
    }

    const adCopy = getMetaAdCopy(manifest, campaign, post.copyVariant);
    return {
        endpoint: '/act_<ad-account-id>/adcreatives + /ads',
        mediaUrl: assetUrl,
        headline: adCopy.headline,
        primaryText: adCopy.primaryText,
        description: adCopy.description,
        cta: adCopy.cta,
        destinationUrl: `/campaigns/${campaign.id}`,
        campaignStage: post.campaignStage,
    };
}

function getMetaAdsConfig(): MetaAdsConfig | null {
    const accessToken = process.env.META_ACCESS_TOKEN?.trim();
    const adAccountId = process.env.META_AD_ACCOUNT_ID?.trim();
    const adSetId = process.env.META_AD_SET_ID?.trim();
    const pageId = process.env.META_PAGE_ID?.trim();
    const instagramActorId = process.env.META_INSTAGRAM_ACTOR_ID?.trim();

    if (!accessToken || !adAccountId || !adSetId || !pageId) {
        return null;
    }

    return {
        accessToken,
        adAccountId,
        adSetId,
        pageId,
        ...(instagramActorId ? { instagramActorId } : {}),
    };
}

function toGraphErrorMessage(payload: unknown): string {
    const errorPayload = payload as MetaGraphError;
    if (!errorPayload.error) {
        return 'Unknown Graph API error';
    }

    const message = errorPayload.error.message ?? 'Unknown Graph API error';
    const type = errorPayload.error.type ?? 'GraphError';
    const code = errorPayload.error.code !== undefined ? ` code=${errorPayload.error.code}` : '';
    const subCode = errorPayload.error.error_subcode !== undefined
        ? ` subcode=${errorPayload.error.error_subcode}`
        : '';
    return `${type}:${code}${subCode} ${message}`.trim();
}

function mapCtaType(rawCta: string): string {
    const allowed = new Set([
        'LEARN_MORE',
        'SIGN_UP',
        'BOOK_NOW',
        'SHOP_NOW',
        'CONTACT_US',
    ]);

    const normalized = rawCta.trim().toUpperCase();
    if (allowed.has(normalized)) {
        return normalized;
    }

    return 'LEARN_MORE';
}

async function postMetaGraphForm<TResponse>(
    url: string,
    form: Record<string, string>,
): Promise<TResponse> {
    const formData = new URLSearchParams();
    for (const [key, value] of Object.entries(form)) {
        formData.append(key, value);
    }

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
    });

    const payload = await response.json() as unknown;
    if (!response.ok) {
        throw new Error(toGraphErrorMessage(payload));
    }

    return payload as TResponse;
}

async function dispatchMetaAdsLive(
    campaign: Campaign,
    post: ScheduledPost,
    preview: Record<string, unknown>,
): Promise<{ externalPostId: string }> {
    const config = getMetaAdsConfig();
    if (!config) {
        throw new Error('Missing META_ACCESS_TOKEN, META_AD_ACCOUNT_ID, META_AD_SET_ID, or META_PAGE_ID');
    }

    const headline = typeof preview.headline === 'string' ? preview.headline : campaign.name;
    const primaryText = typeof preview.primaryText === 'string' ? preview.primaryText : campaign.description;
    const description = typeof preview.description === 'string' ? preview.description : campaign.description;
    const destinationUrl = typeof preview.destinationUrl === 'string'
        ? preview.destinationUrl
        : `https://www.leisurelifeinteractive.com/campaigns/${campaign.id}`;
    const imageUrl = typeof preview.mediaUrl === 'string' ? preview.mediaUrl : '';
    const ctaType = mapCtaType(typeof preview.cta === 'string' ? preview.cta : 'LEARN_MORE');

    if (!imageUrl) {
        throw new Error('Meta Ads requires an image or video URL in preview.mediaUrl');
    }

    const objectStorySpec: Record<string, unknown> = {
        page_id: config.pageId,
        link_data: {
            message: primaryText,
            link: destinationUrl,
            name: headline,
            description,
            image_url: imageUrl,
            call_to_action: {
                type: ctaType,
                value: {
                    link: destinationUrl,
                },
            },
        },
    };

    if (config.instagramActorId) {
        objectStorySpec.instagram_actor_id = config.instagramActorId;
    }

    const creativeResponse = await postMetaGraphForm<MetaCreativeCreateResponse>(
        `https://graph.facebook.com/v22.0/act_${config.adAccountId}/adcreatives`,
        {
            access_token: config.accessToken,
            name: `${campaign.id}-${post.postId}-creative`,
            object_story_spec: JSON.stringify(objectStorySpec),
        },
    );

    const adResponse = await postMetaGraphForm<MetaAdCreateResponse>(
        `https://graph.facebook.com/v22.0/act_${config.adAccountId}/ads`,
        {
            access_token: config.accessToken,
            name: `${campaign.id}-${post.postId}`,
            adset_id: config.adSetId,
            creative: JSON.stringify({ creative_id: creativeResponse.id }),
            status: 'PAUSED',
        },
    );

    return {
        externalPostId: adResponse.id,
    };
}

async function dispatchTikTokLive(
    campaign: Campaign,
    manifest: CampaignMediaManifest,
    post: ScheduledPost,
    assetUrl: string,
): Promise<{ externalPostId: string; status: DistributionPostStatus; metadataNotes: string[] }> {
    const { loadTikTokCredentials, refreshTikTokAccessToken, isTokenNearExpiry } = await import('@/lib/integrations/tiktok-auth');
    const { uploadTikTokVideoDraft, fetchTikTokPublishStatus } = await import('@/lib/campaigns/distribution/platforms/tiktok');
    const { upsertProviderToken } = await import('@/lib/integrations/provider-token-store');

    const credentials = await loadTikTokCredentials();
    let accessToken = credentials.accessToken;

    if (isTokenNearExpiry(credentials.accessTokenExpiresAt)) {
        if (!credentials.refreshToken || isTokenNearExpiry(credentials.refreshTokenExpiresAt)) {
            throw new Error(
                'TikTok access token is expired and cannot be refreshed. ' +
                'Re-authorize via /api/integrations/tiktok/connect.',
            );
        }
        const refreshed = await refreshTikTokAccessToken(credentials.refreshToken);
        await upsertProviderToken('tiktok', credentials.accountLabel, {
            accessToken: refreshed.accessToken,
            refreshToken: refreshed.refreshToken,
            openId: refreshed.openId,
            scope: refreshed.scope,
            accessTokenExpiresAt: new Date(refreshed.accessTokenExpiresAt),
            refreshTokenExpiresAt: new Date(refreshed.refreshTokenExpiresAt),
            lastRefreshedAt: new Date(),
        });
        accessToken = refreshed.accessToken;
    }

    const caption = getTikTokCaption(manifest, campaign.description, post.copyVariant);
    const result = await uploadTikTokVideoDraft(accessToken, assetUrl, caption);
    const publishStatus = await fetchTikTokPublishStatus(accessToken, result.publishId);

    const metadataNotes = [
        `draftType=${result.draftType}`,
        `publish_id=${result.publishId}`,
        `tiktok_publish_status=${publishStatus.status}`,
        `dispatched_at=${new Date().toISOString()}`,
    ];

    if (publishStatus.failReason) {
        metadataNotes.push(`tiktok_fail_reason=${publishStatus.failReason}`);
    }

    if (publishStatus.publiclyAvailablePostId) {
        metadataNotes.push(`tiktok_public_post_id=${publishStatus.publiclyAvailablePostId}`);
    }

    return {
        externalPostId: result.publishId,
        status: publishStatus.status === 'PUBLISH_COMPLETE' ? 'posted' : publishStatus.status === 'FAILED' ? 'failed' : 'draft_created',
        metadataNotes,
    };
}

export async function dispatchMarketingPost(
    campaign: Campaign,
    manifest: CampaignMediaManifest,
    post: ScheduledPost,
    mode: MarketingProviderMode,
): Promise<MarketingDispatchResult> {
    const assetUrl = resolveAssetUrl(manifest, post.assetId);
    if (!assetUrl) {
        return {
            postId: post.postId,
            platform: post.platform,
            status: 'failed',
            warning: `Asset URL not found in manifest for assetId ${post.assetId}`,
            preview: {
                campaignSlug: campaign.id,
                postId: post.postId,
                assetId: post.assetId,
            },
        };
    }

    const preview = buildPreviewPayload(campaign, manifest, post, assetUrl);

    if (mode === 'live') {
        if (post.platform === 'tiktok') {
            try {
                const liveResult = await dispatchTikTokLive(campaign, manifest, post, assetUrl);
                return {
                    postId: post.postId,
                    platform: post.platform,
                    status: liveResult.status,
                    externalPostId: liveResult.externalPostId,
                    metadataNotes: liveResult.metadataNotes,
                    preview,
                };
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : 'Unknown TikTok live dispatch error';
                return {
                    postId: post.postId,
                    platform: post.platform,
                    status: 'failed',
                    warning: `TikTok live dispatch failed: ${message}`,
                    preview,
                };
            }
        }

        if (post.platform === 'facebook_ad') {
            try {
                const liveResult = await dispatchMetaAdsLive(campaign, post, preview);
                return {
                    postId: post.postId,
                    platform: post.platform,
                    status: 'posted',
                    externalPostId: liveResult.externalPostId,
                    preview,
                };
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : 'Unknown Meta Ads live dispatch error';
                return {
                    postId: post.postId,
                    platform: post.platform,
                    status: 'failed',
                    warning: `Meta Ads live dispatch failed: ${message}`,
                    preview,
                };
            }
        }

        return {
            postId: post.postId,
            platform: post.platform,
            status: 'failed',
            warning: `Live platform adapter not implemented yet for ${post.platform}. Use providerMode=simulate for end-to-end testing.`,
            preview,
        };
    }

    const externalPostId = `sim_${post.platform}_${Date.now()}`;
    return {
        postId: post.postId,
        platform: post.platform,
        status: 'posted',
        externalPostId,
        warning: `Simulated dispatch only. No live API call was sent to ${post.platform}.`,
        preview,
    };
}