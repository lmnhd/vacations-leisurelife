import type { Campaign } from "./types";
import type {
  AssetRecord,
  CampaignAestheticBrief,
  CampaignMediaManifest,
  DistributionPostStatus,
  ScheduledPost,
} from "./schema";
import { collapseAssetVariantGroups } from "./media/image-selection";

// CTAs that are banned for shadow/waitlist campaigns.
// When the manifest has stale copy with one of these, substitute the brief's
// waitlist CTA instead of letting banned language reach live ad platforms.
const BANNED_CTA_SUBSTRINGS = ['book', 'buy now', 'purchase', 'reserve a cabin'];

function sanitizeCta(cta: string, brief?: CampaignAestheticBrief): string {
  const lower = cta.toLowerCase();
  const isBanned = BANNED_CTA_SUBSTRINGS.some((b) => lower.includes(b));
  if (!isBanned) return cta;
  // Prefer the brief's waitlist CTA; fall back to a safe default
  return brief?.messaging?.ctaVariants?.waitlist ?? 'Get First Access';
}
import {
  buildMetaAdsReviewUrl,
  createMetaAdSet,
  createMetaCampaign,
  getMetaAdsConfig,
  publishFacebookPagePost,
} from "@/lib/integrations/meta-ads";
import { synthesizeMetaTargeting } from "./distribution/platforms/meta-ads/targeting";

export type MarketingProviderMode = "simulate" | "live";

export interface MarketingDispatchResult {
  postId: string;
  platform: ScheduledPost["platform"];
  status: DistributionPostStatus;
  externalPostId?: string;
  externalReviewUrl?: string;
  metadataNotes?: string[];
  warning?: string;
  preview: Record<string, unknown>;
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
    error_user_title?: string;
    error_user_msg?: string;
    fbtrace_id?: string;
  };
}

interface MetaGraphCreateResponse {
  id: string;
}

function getAllManifestAssets(manifest: CampaignMediaManifest): AssetRecord[] {
  return [
    ...manifest.images.shipReferences,
    ...manifest.images.hero,
    ...(manifest.images.flyerImages ?? []),
    ...manifest.images.sceneImages,
    ...manifest.images.aestheticConcepts,
    ...(manifest.images.documentaryDetails ?? []),
    ...(manifest.images.designedAdArtifacts ?? []),
    ...Object.values(manifest.images.platformCrops).flat(),
    ...(manifest.videos.tiktokSeed ? [manifest.videos.tiktokSeed] : []),
    ...(manifest.videos.heroExplainer ? [manifest.videos.heroExplainer] : []),
    ...(manifest.videos.thresholdAnnouncement
      ? [manifest.videos.thresholdAnnouncement]
      : []),
    ...manifest.videos.countdown,
    ...manifest.videos.broll,
    ...(manifest.audio.ambientNarration
      ? [manifest.audio.ambientNarration]
      : []),
    ...(manifest.audio.hypeClip ? [manifest.audio.hypeClip] : []),
    ...(manifest.audio.themeMusic ? [manifest.audio.themeMusic] : []),
    ...manifest.merch.designs,
    ...manifest.merch.mockups,
  ];
}

function resolveAssetUrl(
  manifest: CampaignMediaManifest,
  assetId: string,
): string | null {
  return (
    getAllManifestAssets(manifest).find((asset) => asset.assetId === assetId)
      ?.url ?? null
  );
}

function resolveAssetRecord(
  manifest: CampaignMediaManifest,
  assetId: string,
): AssetRecord | null {
  return (
    getAllManifestAssets(manifest).find((asset) => asset.assetId === assetId) ??
    null
  );
}

// First active hero image URL — used as a video-ad thumbnail fallback when the
// video asset has no own thumbnail. MULTI_MODEL_IMAGES (Phase F): collapse to the
// operator-selected model-version first so the fallback honors the A/B pick.
function getFirstHeroImageUrl(manifest: CampaignMediaManifest): string | null {
  return collapseAssetVariantGroups(manifest.images.hero, manifest.modelVersionSelections)
    .find((asset) => asset.active)?.url ?? null;
}

function resolveAssetUrls(
  manifest: CampaignMediaManifest,
  assetIds: string[] | undefined,
): string[] {
  if (!assetIds || assetIds.length === 0) {
    return [];
  }

  return assetIds
    .map((assetId) => resolveAssetUrl(manifest, assetId))
    .filter((url): url is string => Boolean(url));
}

function parseTrailingIndex(value: string): number | null {
  const match = value.match(/_(\d+)$/);
  if (!match) {
    return null;
  }

  const parsed = Number.parseInt(match[1], 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function getTikTokCaption(
  manifest: CampaignMediaManifest,
  fallback: string,
  copyVariant: string,
): string {
  const entries = manifest.copy?.captions.tiktok;
  if (!entries || entries.length === 0) {
    return fallback;
  }

  const index = parseTrailingIndex(copyVariant) ?? 0;
  const selected = entries[index] ?? entries[0];
  const hashtags = selected.hashtags
    .map((tag) => (tag.startsWith("#") ? tag : `#${tag}`))
    .join(" ");
  return `${selected.caption} ${hashtags}`.trim();
}

function getInstagramCaption(
  manifest: CampaignMediaManifest,
  campaign: Campaign,
  brief?: CampaignAestheticBrief,
): string {
  // The brief's heroSlogan is the authoritative source of truth — it updates
  // with every brief regeneration. The manifest's carouselSlides are generated
  // copy that can go stale between regenerations, so when the brief is
  // available we always prefer it over stored slides.
  if (brief?.messaging?.heroSlogan) {
    return brief.messaging.heroSlogan;
  }
  const slide = manifest.copy?.carouselSlides[0]?.trim();
  if (slide && slide.length > 0) {
    return slide;
  }
  return campaign.description;
}

function getCampaignLandingUrl(campaign: Campaign): string {
  const configuredBaseUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    "https://leisurelifeinteractive.net";

  return `${configuredBaseUrl.replace(/\/$/, "")}/groups/${campaign.id}`;
}

function getMetaAdCopy(
  manifest: CampaignMediaManifest,
  campaign: Campaign,
  copyVariant: string,
  brief?: CampaignAestheticBrief,
): {
  headline: string;
  primaryText: string;
  description: string;
  cta: string;
} {
  const variantToken = copyVariant.split("_").pop();
  const variant =
    variantToken === "A" || variantToken === "B" || variantToken === "C"
      ? variantToken
      : undefined;

  const selected = variant
    ? manifest.copy?.adVariants.find((entry) => entry.variant === variant)
    : manifest.copy?.adVariants[0];

  // The brief's heroSlogan is the authoritative headline — it matches what is
  // visually rendered inside the static ad image so both text layers tell the
  // same story in responsive placements.
  const headline = brief?.messaging?.heroSlogan ?? selected?.headline ?? campaign.name;

  if (selected) {
    return {
      headline,
      primaryText: selected.primaryText,
      description: selected.description,
      cta: sanitizeCta(selected.cta, brief),
    };
  }

  return {
    headline,
    primaryText: campaign.description,
    description: campaign.description,
    cta: sanitizeCta("LEARN_MORE", brief),
  };
}

function buildPreviewPayload(
  campaign: Campaign,
  manifest: CampaignMediaManifest,
  post: ScheduledPost,
  assetUrl: string,
  brief?: CampaignAestheticBrief,
): Record<string, unknown> {
  if (post.platform === "tiktok") {
    return {
      endpoint: "/v2/post/publish/inbox/video/init/",
      caption: getTikTokCaption(
        manifest,
        campaign.description,
        post.copyVariant,
      ),
      mediaUrl: assetUrl,
      deliveryMode: "INBOX_SHARE_DRAFT",
      privacyLevel: "SELF_ONLY",
      publishVisibility:
        "User must complete the TikTok inbox review flow before the video appears on the profile page.",
      campaignStage: post.campaignStage,
    };
  }

  if (post.platform === "tiktok_paid") {
    const adCopy = getMetaAdCopy(manifest, campaign, post.copyVariant, brief);
    return {
      endpoint:
        "/campaign/create + /adgroup/create + /ad/create + /lead/form/create",
      workflow: "TIKTOK_PAID_LEAD_GEN_DRAFT",
      providerDraftType: "paid_lead_gen_ad",
      mediaUrl: assetUrl,
      headline: adCopy.headline,
      primaryText: adCopy.primaryText,
      description: adCopy.description,
      cta: adCopy.cta,
      landingUrl: getCampaignLandingUrl(campaign),
      activationState: "paused",
      campaignStage: post.campaignStage,
    };
  }

  if (post.platform === "facebook_page") {
    // Organic Facebook Page post. The caption reuses the Instagram caption
    // resolution (brief heroSlogan → carousel slide → description) and appends
    // the campaign landing URL so the Page post links back to the waitlist.
    return {
      endpoint: "/{page-id}/photos | /{page-id}/feed",
      mediaType: "PAGE_POST",
      caption: getInstagramCaption(manifest, campaign, brief),
      mediaUrl: assetUrl,
      link: getCampaignLandingUrl(campaign),
      campaignStage: post.campaignStage,
    };
  }

  if (
    post.platform === "instagram_feed" ||
    post.platform === "instagram_reels" ||
    post.platform === "instagram_story"
  ) {
    const mediaUrls = resolveAssetUrls(manifest, post.assetIds);
    const isCarousel = post.platform === "instagram_feed" && mediaUrls.length > 1;
    return {
      endpoint: "/{ig-user-id}/media + /{ig-user-id}/media_publish",
      mediaType:
        isCarousel
          ? "CAROUSEL"
          : post.platform === "instagram_reels"
          ? "REELS"
          : post.platform === "instagram_story"
            ? "STORY"
            : "IMAGE",
      caption: getInstagramCaption(manifest, campaign, brief),
      mediaUrl: assetUrl,
      ...(isCarousel ? { mediaUrls } : {}),
      campaignStage: post.campaignStage,
    };
  }

  const adCopy = getMetaAdCopy(manifest, campaign, post.copyVariant, brief);

  if (post.platform === "google_display") {
    return {
      endpoint:
        "/customers/{id}/campaignBudgets + /campaigns + /adGroups + /adGroupAds + /adGroupCriteria",
      workflow: "GOOGLE_DISPLAY_CONTEXTUAL_DRAFT",
      providerDraftType: "display_contextual",
      mediaUrl: assetUrl,
      headline: adCopy.headline,
      primaryText: adCopy.primaryText,
      description: adCopy.description,
      cta: adCopy.cta,
      destinationUrl: getCampaignLandingUrl(campaign),
      activationState: "paused",
      campaignStage: post.campaignStage,
    };
  }

  return {
    endpoint: "/act_<ad-account-id>/adcreatives + /ads",
    mediaUrl: assetUrl,
    headline: adCopy.headline,
    primaryText: adCopy.primaryText,
    description: adCopy.description,
    cta: adCopy.cta,
    destinationUrl: getCampaignLandingUrl(campaign),
    campaignStage: post.campaignStage,
  };
}

function toGraphErrorMessage(payload: unknown): string {
  const errorPayload = payload as MetaGraphError;
  if (!errorPayload.error) {
    return "Unknown Graph API error";
  }

  const message =
    errorPayload.error.error_user_msg ??
    errorPayload.error.message ??
    "Unknown Graph API error";
  const type = errorPayload.error.type ?? "GraphError";
  const code =
    errorPayload.error.code !== undefined
      ? ` code=${errorPayload.error.code}`
      : "";
  const subCode =
    errorPayload.error.error_subcode !== undefined
      ? ` subcode=${errorPayload.error.error_subcode}`
      : "";
  return `${type}:${code}${subCode} ${message}`.trim();
}

function describeUnknownError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function mapCtaType(rawCta: string): string {
  const allowed = new Set([
    "LEARN_MORE",
    "SIGN_UP",
    "BOOK_NOW",
    "SHOP_NOW",
    "CONTACT_US",
  ]);

  const normalized = rawCta.trim().toUpperCase();
  if (allowed.has(normalized)) {
    return normalized;
  }

  return "LEARN_MORE";
}

function getMetaDailyBudgetCents(): number {
  const raw = process.env.META_DAILY_BUDGET_CENTS?.trim();
  if (!raw) return 500;

  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed < 100) {
    return 500;
  }

  return parsed;
}

function buildMetaAdSetWindow(): { startTime: string; endTime: string } {
  const start = new Date(Date.now() + 10 * 60 * 1000);
  const end = new Date(start.getTime() + 14 * 24 * 60 * 60 * 1000);
  return {
    startTime: start.toISOString(),
    endTime: end.toISOString(),
  };
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
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: formData.toString(),
  });

  const payload = (await response.json()) as unknown;
  if (!response.ok) {
    throw new Error(toGraphErrorMessage(payload));
  }

  return payload as TResponse;
}

async function createInstagramGraphContainer(
  igUserId: string,
  accessToken: string,
  form: Record<string, string>,
): Promise<string> {
  const response = await postMetaGraphForm<MetaGraphCreateResponse>(
    `https://graph.facebook.com/v22.0/${igUserId}/media`,
    {
      access_token: accessToken,
      ...form,
    },
  );

  if (!response.id) {
    throw new Error("Instagram Graph API did not return a media container id");
  }

  return response.id;
}

async function publishInstagramGraphContainer(
  igUserId: string,
  accessToken: string,
  creationId: string,
): Promise<string> {
  const response = await postMetaGraphForm<MetaGraphCreateResponse>(
    `https://graph.facebook.com/v22.0/${igUserId}/media_publish`,
    {
      access_token: accessToken,
      creation_id: creationId,
    },
  );

  if (!response.id) {
    throw new Error("Instagram Graph API did not return a published media id");
  }

  return response.id;
}

async function dispatchInstagramGraphLive(
  campaign: Campaign,
  manifest: CampaignMediaManifest,
  post: ScheduledPost,
  preview: Record<string, unknown>,
): Promise<{
  externalPostId: string;
  status: DistributionPostStatus;
  metadataNotes: string[];
}> {
  const config = getMetaAdsConfig();
  const igUserId = config?.instagramActorId?.trim();
  if (!config || !igUserId) {
    throw new Error(
      "Missing META_ACCESS_TOKEN or META_INSTAGRAM_ACTOR_ID for Instagram Graph publishing.",
    );
  }

  const caption =
    typeof preview.caption === "string" ? preview.caption : campaign.description;
  const primaryAsset = resolveAssetRecord(manifest, post.assetId);
  if (!primaryAsset?.url) {
    throw new Error(
      `Instagram Graph dispatch could not resolve asset ${post.assetId}.`,
    );
  }

  let creationId: string;
  if (post.platform === "instagram_feed" && post.assetIds && post.assetIds.length > 1) {
    const childUrls = resolveAssetUrls(manifest, post.assetIds);
    if (childUrls.length === 0) {
      throw new Error("Instagram carousel dispatch requires at least one child image URL.");
    }

    const childIds: string[] = [];
    for (const childUrl of childUrls) {
      const childId = await createInstagramGraphContainer(
        igUserId,
        config.accessToken,
        {
          image_url: childUrl,
          is_carousel_item: "true",
        },
      );
      childIds.push(childId);
    }

    creationId = await createInstagramGraphContainer(
      igUserId,
      config.accessToken,
      {
        media_type: "CAROUSEL",
        children: childIds.join(","),
        caption,
      },
    );
  } else if (post.platform === "instagram_reels") {
    creationId = await createInstagramGraphContainer(
      igUserId,
      config.accessToken,
      {
        video_url: primaryAsset.url,
        caption,
        media_type: "REELS",
        share_to_feed: "true",
      },
    );
  } else if (post.platform === "instagram_story") {
    const isVideo = primaryAsset.mimeType.startsWith("video/");
    creationId = await createInstagramGraphContainer(
      igUserId,
      config.accessToken,
      isVideo
        ? {
            video_url: primaryAsset.url,
            media_type: "STORIES",
          }
        : {
            image_url: primaryAsset.url,
            media_type: "STORIES",
          },
    );
  } else {
    creationId = await createInstagramGraphContainer(
      igUserId,
      config.accessToken,
      {
        image_url: primaryAsset.url,
        caption,
      },
    );
  }

  const publishedMediaId = await publishInstagramGraphContainer(
    igUserId,
    config.accessToken,
    creationId,
  );

  return {
    externalPostId: publishedMediaId,
    status: "posted",
    metadataNotes: [
      `instagram_graph_user_id=${igUserId}`,
      `instagram_graph_creation_id=${creationId}`,
      `instagram_graph_media_id=${publishedMediaId}`,
      `instagram_graph_media_type=${String(preview.mediaType ?? "IMAGE")}`,
      `instagram_graph_dispatched_at=${new Date().toISOString()}`,
    ],
  };
}

async function dispatchFacebookPageLive(
  campaign: Campaign,
  manifest: CampaignMediaManifest,
  post: ScheduledPost,
  preview: Record<string, unknown>,
): Promise<{
  externalPostId: string;
  status: DistributionPostStatus;
  metadataNotes: string[];
}> {
  const config = getMetaAdsConfig();
  if (!config) {
    throw new Error(
      "Missing META_ACCESS_TOKEN, META_AD_ACCOUNT_ID, or META_PAGE_ID for Facebook Page publishing.",
    );
  }

  const caption =
    typeof preview.caption === "string" ? preview.caption : campaign.description;
  const link =
    typeof preview.link === "string"
      ? preview.link
      : getCampaignLandingUrl(campaign);
  const primaryAsset = resolveAssetRecord(manifest, post.assetId);
  if (!primaryAsset?.url) {
    throw new Error(
      `Facebook Page dispatch could not resolve asset ${post.assetId}.`,
    );
  }

  // Organic launch posts are created UNPUBLISHED (draft) so the operator can
  // review them on the Page before they go live — consistent with the
  // draft-for-approval safety pattern used for paid ads.
  const result = await publishFacebookPagePost(config, {
    message: `${caption}\n\n${link}`.trim(),
    imageUrl: primaryAsset.url,
    published: false,
  });

  return {
    externalPostId: result.postId,
    status: "draft_created",
    metadataNotes: [
      `facebook_page_id=${config.pageId}`,
      `facebook_page_post_id=${result.postId}`,
      `facebook_page_published=${result.published}`,
      `facebook_page_dispatched_at=${new Date().toISOString()}`,
    ],
  };
}

async function dispatchMetaAdsLive(
  campaign: Campaign,
  manifest: CampaignMediaManifest,
  post: ScheduledPost,
  preview: Record<string, unknown>,
): Promise<{
  externalPostId: string;
  status: DistributionPostStatus;
  externalReviewUrl: string;
  metadataNotes: string[];
  metaTargeting: Record<string, unknown>;
}> {
  const config = getMetaAdsConfig();
  if (!config) {
    throw new Error(
      "Missing META_ACCESS_TOKEN, META_AD_ACCOUNT_ID, or META_PAGE_ID",
    );
  }

  const headline =
    typeof preview.headline === "string" ? preview.headline : campaign.name;
  const primaryText =
    typeof preview.primaryText === "string"
      ? preview.primaryText
      : campaign.description;
  const description =
    typeof preview.description === "string"
      ? preview.description
      : campaign.description;
  const destinationUrl =
    typeof preview.destinationUrl === "string"
      ? preview.destinationUrl
      : getCampaignLandingUrl(campaign);
  const mediaUrl = typeof preview.mediaUrl === "string" ? preview.mediaUrl : "";
  const ctaType = mapCtaType(
    typeof preview.cta === "string" ? preview.cta : "LEARN_MORE",
  );

  if (!mediaUrl) {
    throw new Error(
      "Meta Ads requires an image or video URL in preview.mediaUrl",
    );
  }

  // Branch image vs video creative on the resolved asset's mime type. A video
  // asset (e.g. the vertical TikTok/Reels seed) becomes a paused VIDEO ad;
  // everything else becomes the existing image link ad.
  const primaryAsset = resolveAssetRecord(manifest, post.assetId);
  const isVideoCreative = primaryAsset?.mimeType.startsWith("video/") ?? false;

  const targeting = await synthesizeMetaTargeting(campaign, {
    config,
    resolveInterestIds: true,
  });
  const dynamicAdSetAvailable = targeting.resolvedInterests.length > 0;
  let metaCampaignId: string | undefined;
  let metaAdSetId: string | undefined;
  const metaTargetingNotes = [
    `meta_interest_queries=${targeting.interestQueries.length}`,
    `meta_interests_resolved=${targeting.resolvedInterests.length}`,
    `meta_unresolved_queries=${targeting.unresolvedQueries.length}`,
    `meta_targeting_summary=${targeting.summary.replace(/\n/g, " | ")}`,
    ...targeting.resolvedInterests.map(
      (interest) => `meta_interest=${interest.name}:${interest.id}`,
    ),
    ...targeting.warnings.map((warning) => `meta_targeting_warning=${warning}`),
  ];

  if (dynamicAdSetAvailable) {
    const adSetWindow = buildMetaAdSetWindow();
    try {
      metaCampaignId = await createMetaCampaign(config, {
        name: `[DRAFT] ${campaign.name} Meta ${post.postId}`,
      });
      metaAdSetId = await createMetaAdSet(config, {
        name: `[DRAFT] ${campaign.name} Audience ${post.postId}`,
        campaignId: metaCampaignId,
        targeting: targeting.targeting,
        dailyBudgetCents: getMetaDailyBudgetCents(),
        startTime: adSetWindow.startTime,
        endTime: adSetWindow.endTime,
        status: "PAUSED",
      });
    } catch (campaignError: unknown) {
      const reason = campaignError instanceof Error ? campaignError.message : String(campaignError);
      console.warn('[Meta dispatch] dynamic campaign creation failed, trying static fallback:', reason);
      metaCampaignId = undefined;
      metaAdSetId = undefined;
      if (config.adSetId) {
        metaAdSetId = config.adSetId;
        metaTargetingNotes.push(
          "meta_ad_set_mode=static_fallback",
          `meta_targeting_warning=Dynamic campaign creation failed (${reason}); using META_AD_SET_ID fallback.`,
        );
      } else {
        throw new Error(
          `Meta dynamic campaign creation failed and META_AD_SET_ID fallback is not configured. Reason: ${reason}`,
        );
      }
    }
  } else if (config.adSetId) {
    metaAdSetId = config.adSetId;
    metaTargetingNotes.push(
      "meta_ad_set_mode=static_fallback",
      "meta_targeting_warning=No Meta interests resolved; using META_AD_SET_ID fallback.",
    );
  } else {
    throw new Error(
      "Meta targeting produced no resolved interests and META_AD_SET_ID fallback is not configured.",
    );
  }

  const objectStorySpec: Record<string, unknown> = { page_id: config.pageId };
  const creativeNotes: string[] = [];

  if (isVideoCreative) {
    // Paused VIDEO ad: upload the video to the ad account, wait for processing,
    // then bind it as video_data. Meta requires a thumbnail for video ads — use
    // the asset's own thumbnail if present, else the campaign hero image.
    const videoId = await uploadMetaAdVideo(
      mediaUrl,
      config.adAccountId,
      config.accessToken,
    );
    const thumbnailUrl =
      primaryAsset?.sourceThumbnailUrl ?? getFirstHeroImageUrl(manifest) ?? null;
    const videoData: Record<string, unknown> = {
      video_id: videoId,
      message: primaryText,
      title: headline,
      call_to_action: {
        type: ctaType,
        value: { link: destinationUrl },
      },
    };
    if (thumbnailUrl) {
      videoData.image_url = thumbnailUrl;
    }
    objectStorySpec.video_data = videoData;
    creativeNotes.push(`meta_creative_type=video`, `meta_video_id=${videoId}`);
    if (!thumbnailUrl) {
      creativeNotes.push(
        "meta_targeting_warning=No video thumbnail available; Meta will auto-select a frame.",
      );
    }
  } else {
    const imageHash = await uploadMetaImageHash(
      mediaUrl,
      config.adAccountId,
      config.accessToken,
    );
    objectStorySpec.link_data = {
      message: primaryText,
      link: destinationUrl,
      name: headline,
      description,
      image_hash: imageHash,
      call_to_action: {
        type: ctaType,
        value: { link: destinationUrl },
      },
    };
    creativeNotes.push(`meta_creative_type=image`);
  }

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
      adset_id: metaAdSetId,
      creative: JSON.stringify({ creative_id: creativeResponse.id }),
      status: "PAUSED",
    },
  );

  const externalReviewUrl = buildMetaAdsReviewUrl(
    config.adAccountId,
    adResponse.id,
  );

  return {
    externalPostId: adResponse.id,
    status: "draft_created",
    externalReviewUrl,
    metadataNotes: [
      `meta_ad_account_id=${config.adAccountId}`,
      ...(metaCampaignId ? [`meta_campaign_id=${metaCampaignId}`] : []),
      `meta_ad_set_id=${metaAdSetId}`,
      `meta_ad_set_mode=${dynamicAdSetAvailable ? "dynamic" : "static_fallback"}`,
      `meta_ad_creative_id=${creativeResponse.id}`,
      `meta_ad_id=${adResponse.id}`,
      `meta_review_url=${externalReviewUrl}`,
      `meta_destination_url=${destinationUrl}`,
      `meta_dispatched_at=${new Date().toISOString()}`,
      ...creativeNotes,
      ...metaTargetingNotes,
    ],
    metaTargeting: {
      seedKeywords: targeting.seedKeywords,
      audienceSignals: targeting.audienceSignals,
      interestQueries: targeting.interestQueries,
      resolvedInterests: targeting.resolvedInterests,
      unresolvedQueries: targeting.unresolvedQueries,
      targeting: targeting.targeting,
      summary: targeting.summary,
      rationale: targeting.rationale,
      warnings: targeting.warnings,
      adSetMode: dynamicAdSetAvailable ? "dynamic" : "static_fallback",
      ...(metaCampaignId ? { campaignId: metaCampaignId } : {}),
      adSetId: metaAdSetId,
    },
  };
}

async function dispatchTikTokLive(
  campaign: Campaign,
  manifest: CampaignMediaManifest,
  post: ScheduledPost,
  assetUrl: string,
): Promise<{
  externalPostId: string;
  status: DistributionPostStatus;
  metadataNotes: string[];
}> {
  const { loadTikTokCredentials, refreshTikTokAccessToken, isTokenNearExpiry } =
    await import("@/lib/integrations/tiktok-auth");
  const { uploadTikTokVideoDraft, fetchTikTokPublishStatus } =
    await import("@/lib/campaigns/distribution/platforms/tiktok");
  const { upsertProviderToken } =
    await import("@/lib/integrations/provider-token-store");

  const credentials = await loadTikTokCredentials();
  let accessToken = credentials.accessToken;

  if (isTokenNearExpiry(credentials.accessTokenExpiresAt)) {
    if (
      !credentials.refreshToken ||
      isTokenNearExpiry(credentials.refreshTokenExpiresAt)
    ) {
      throw new Error(
        "TikTok access token is expired and cannot be refreshed. " +
          "Re-authorize via /api/integrations/tiktok/connect.",
      );
    }
    const refreshed = await refreshTikTokAccessToken(credentials.refreshToken);
    await upsertProviderToken("tiktok", credentials.accountLabel, {
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

  const caption = getTikTokCaption(
    manifest,
    campaign.description,
    post.copyVariant,
  );
  const result = await uploadTikTokVideoDraft(accessToken, assetUrl, caption);
  const publishStatus = await fetchTikTokPublishStatus(
    accessToken,
    result.publishId,
  );

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
    metadataNotes.push(
      `tiktok_public_post_id=${publishStatus.publiclyAvailablePostId}`,
    );
  }

  return {
    externalPostId: result.publishId,
    status:
      publishStatus.status === "PUBLISH_COMPLETE"
        ? "posted"
        : publishStatus.status === "FAILED"
          ? "failed"
          : "draft_created",
    metadataNotes,
  };
}

async function dispatchTikTokPaidLive(
  campaign: Campaign,
  post: ScheduledPost,
): Promise<{
  externalPostId: string;
  status: DistributionPostStatus;
  metadataNotes: string[];
}> {
  const { getTikTokAdvertiserStatus } =
    await import("@/lib/integrations/tiktok-auth");
  const { createTikTokPaidLeadGenDraft } =
    await import("@/lib/campaigns/distribution/platforms/tiktok-paid");

  const advertiserStatus = getTikTokAdvertiserStatus();
  if (!advertiserStatus.ready) {
    throw new Error(
      "TikTok paid dispatch blocked: advertiser credentials are not configured. " +
        `Missing env vars: ${advertiserStatus.requiredVars.join(", ")}.`,
    );
  }

  const landingUrl = getCampaignLandingUrl(campaign);
  const leadFormId = process.env.TIKTOK_LEAD_FORM_ID?.trim() || undefined;
  const contract = await createTikTokPaidLeadGenDraft({
    campaignSlug: campaign.id,
    advertiserAccountId: advertiserStatus.advertiserAccountId,
    adAssetId: post.assetId,
    leadFormTemplateId: leadFormId,
    dailyBudget: 20,
  });

  const metadataNotes = [
    "draftType=paid_lead_gen_ad",
    `native_campaign_id=${contract.nativeCampaignId ?? ""}`,
    `native_adgroup_id=${contract.nativeAdGroupId ?? ""}`,
    `native_ad_id=${contract.nativeAdId ?? ""}`,
    `native_form_id=${contract.nativeFormId ?? leadFormId}`,
    `activation_state=${contract.activationState}`,
    `landing_url=${landingUrl}`,
    leadFormId ? `lead_form_mode=preconfigured` : `lead_form_mode=omitted`,
    `dispatched_at=${new Date().toISOString()}`,
  ];

  return {
    externalPostId: contract.nativeAdId ?? `tiktok_paid_${Date.now()}`,
    status: "draft_created",
    metadataNotes,
  };
}

async function uploadMetaImageHash(
  imageUrl: string,
  adAccountId: string,
  accessToken: string,
): Promise<string> {
  const fetchResponse = await fetch(imageUrl);
  if (!fetchResponse.ok) {
    throw new Error(
      `Failed to download image for Meta upload: ${fetchResponse.statusText}`,
    );
  }

  const blob = await fetchResponse.blob();
  const formData = new FormData();
  formData.append("access_token", accessToken);
  formData.append("filename", blob, "ad_image.jpg");

  const response = await fetch(
    `https://graph.facebook.com/v22.0/act_${adAccountId}/adimages`,
    {
      method: "POST",
      body: formData as any,
    },
  );

  const payload = (await response.json()) as any;
  if (!response.ok) {
    throw new Error(`Meta Image Upload Error: ${JSON.stringify(payload)}`);
  }

  const imageHash = payload.images?.["ad_image.jpg"]?.hash;
  if (!imageHash) {
    throw new Error("Meta API did not return an image hash");
  }

  return imageHash;
}

// Upload a video to the ad account's video library and wait for Meta to finish
// processing it. Returns the native video_id usable in a video ad creative.
// Videos are NOT immediately usable after upload — Meta transcodes them, so we
// poll the processing status until it is `ready` (or fail on `error`/timeout).
async function uploadMetaAdVideo(
  videoUrl: string,
  adAccountId: string,
  accessToken: string,
): Promise<string> {
  const fetchResponse = await fetch(videoUrl);
  if (!fetchResponse.ok) {
    throw new Error(
      `Failed to download video for Meta upload: ${fetchResponse.statusText}`,
    );
  }

  const blob = await fetchResponse.blob();
  const formData = new FormData();
  formData.append("access_token", accessToken);
  formData.append("source", blob, "ad_video.mp4");

  const response = await fetch(
    `https://graph.facebook.com/v22.0/act_${adAccountId}/advideos`,
    {
      method: "POST",
      body: formData as any,
    },
  );

  const payload = (await response.json()) as { id?: string };
  if (!response.ok || !payload.id) {
    throw new Error(`Meta Video Upload Error: ${JSON.stringify(payload)}`);
  }

  await waitForMetaVideoReady(payload.id, accessToken);
  return payload.id;
}

// Poll GET /{video_id}?fields=status until processing completes. Meta returns
// video_status `processing` → `ready` (or `error`). Caps at ~90s so a stuck
// transcode fails the dispatch loudly rather than hanging the request.
async function waitForMetaVideoReady(
  videoId: string,
  accessToken: string,
  maxAttempts = 30,
  intervalMs = 3000,
): Promise<void> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const url = `https://graph.facebook.com/v22.0/${videoId}?fields=status&access_token=${encodeURIComponent(accessToken)}`;
    const response = await fetch(url);
    const payload = (await response.json()) as {
      status?: { video_status?: string };
      error?: unknown;
    };
    if (!response.ok) {
      throw new Error(`Meta video status check failed: ${JSON.stringify(payload)}`);
    }

    const videoStatus = payload.status?.video_status;
    if (videoStatus === "ready") return;
    if (videoStatus === "error") {
      throw new Error(`Meta video ${videoId} failed processing: ${JSON.stringify(payload)}`);
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(
    `Meta video ${videoId} did not finish processing within ${(maxAttempts * intervalMs) / 1000}s. Retry the draft once Meta finishes transcoding.`,
  );
}

export async function dispatchMarketingPost(
  campaign: Campaign,
  manifest: CampaignMediaManifest,
  post: ScheduledPost,
  mode: MarketingProviderMode,
  brief?: CampaignAestheticBrief,
): Promise<MarketingDispatchResult> {
  const assetUrl = resolveAssetUrl(manifest, post.assetId);
  if (!assetUrl) {
    return {
      postId: post.postId,
      platform: post.platform,
      status: "failed",
      warning: `Asset URL not found in manifest for assetId ${post.assetId}`,
      preview: {
        campaignSlug: campaign.id,
        postId: post.postId,
        assetId: post.assetId,
        ...(post.assetIds && post.assetIds.length > 0 ? { assetIds: post.assetIds } : {}),
      },
    };
  }

  const preview = buildPreviewPayload(campaign, manifest, post, assetUrl, brief);

  if (mode === "live") {
    if (post.platform === "tiktok") {
      try {
        const liveResult = await dispatchTikTokLive(
          campaign,
          manifest,
          post,
          assetUrl,
        );
        return {
          postId: post.postId,
          platform: post.platform,
          status: liveResult.status,
          externalPostId: liveResult.externalPostId,
          metadataNotes: liveResult.metadataNotes,
          preview,
        };
      } catch (error: unknown) {
        const message =
          error instanceof Error
            ? error.message
            : "Unknown TikTok live dispatch error";
        return {
          postId: post.postId,
          platform: post.platform,
          status: "failed",
          warning: `TikTok live dispatch failed: ${message}`,
          preview,
        };
      }
    }

    if (post.platform === "tiktok_paid") {
      try {
        const liveResult = await dispatchTikTokPaidLive(campaign, post);
        return {
          postId: post.postId,
          platform: post.platform,
          status: liveResult.status,
          externalPostId: liveResult.externalPostId,
          metadataNotes: liveResult.metadataNotes,
          preview,
        };
      } catch (error: unknown) {
        const message =
          error instanceof Error
            ? error.message
            : "Unknown TikTok paid live dispatch error";
        return {
          postId: post.postId,
          platform: post.platform,
          status: "failed",
          warning: `TikTok paid dispatch failed: ${message}`,
          preview,
        };
      }
    }

    if (post.platform === "google_display") {
      try {
        const { createGoogleDisplayDraft } = await import("./distribution/platforms/google-ads/campaign");
        const { synthesizeGoogleTargeting } = await import("./distribution/platforms/google-ads/targeting");
        const targeting = synthesizeGoogleTargeting(campaign);
        const blueprintSummary = campaign.description ?? "A themed group cruise vacation.";
        const googleResult = await createGoogleDisplayDraft(
          campaign.id,
          post,
          manifest,
          blueprintSummary,
          targeting,
        );

        const enrichedPreview: Record<string, unknown> = {
          ...preview,
          googleTargeting: {
            keywords: googleResult.targeting.keywords,
            placements: googleResult.targeting.placements,
            negativeKeywords: googleResult.targeting.negativeKeywords,
            summary: googleResult.targeting.summary,
            rationale: googleResult.targeting.rationale,
            seedKeywords: googleResult.targeting.seedKeywords,
            audienceSignals: googleResult.targeting.audienceSignals,
          },
          googleVerification: googleResult.verification,
        };

        return {
          postId: post.postId,
          platform: post.platform,
          status: "draft_created",
          externalPostId: googleResult.campaignId,
          externalReviewUrl: `https://ads.google.com/aw/campaigns?campaignId=${googleResult.campaignId}`,
          metadataNotes: [
            `draftType=display_contextual`,
            `campaign_id=${googleResult.campaignId}`,
            `ad_group_id=${googleResult.adGroupId}`,
            `ad_id=${googleResult.adId}`,
            `status=PAUSED`,
            `keywords_requested=${googleResult.verification.requestedKeywords}`,
            `keywords_applied=${googleResult.verification.appliedKeywords}`,
            `placements_requested=${googleResult.verification.requestedPlacements}`,
            `placements_applied=${googleResult.verification.appliedPlacements}`,
            `negatives_requested=${googleResult.verification.requestedNegatives}`,
            `negatives_applied=${googleResult.verification.appliedNegatives}`,
            `verification_matches=${googleResult.verification.matches}`,
            `targeting_summary=${googleResult.targeting.summary.replace(/\n/g, " | ")}`,
            ...googleResult.verification.discrepancies.map(
              (note) => `verification_discrepancy=${note}`,
            ),
          ],
          preview: enrichedPreview,
        };
      } catch (error: unknown) {
        const message = describeUnknownError(error);
        return {
          postId: post.postId,
          platform: post.platform,
          status: "failed",
          warning: `Google Ads dispatch failed: ${message}`,
          preview,
        };
      }
    }

    if (post.platform === "facebook_ad") {
      try {
        const liveResult = await dispatchMetaAdsLive(campaign, manifest, post, preview);
        const enrichedPreview: Record<string, unknown> = {
          ...preview,
          metaTargeting: liveResult.metaTargeting,
        };
        return {
          postId: post.postId,
          platform: post.platform,
          status: liveResult.status,
          externalPostId: liveResult.externalPostId,
          externalReviewUrl: liveResult.externalReviewUrl,
          metadataNotes: liveResult.metadataNotes,
          preview: enrichedPreview,
        };
      } catch (error: unknown) {
        const message =
          error instanceof Error
            ? error.message
            : "Unknown Meta Ads live dispatch error";
        return {
          postId: post.postId,
          platform: post.platform,
          status: "failed",
          warning: `Meta Ads live dispatch failed: ${message}`,
          preview,
        };
      }
    }

    if (post.platform === "facebook_page") {
      try {
        const liveResult = await dispatchFacebookPageLive(
          campaign,
          manifest,
          post,
          preview,
        );
        return {
          postId: post.postId,
          platform: post.platform,
          status: liveResult.status,
          externalPostId: liveResult.externalPostId,
          metadataNotes: liveResult.metadataNotes,
          preview,
        };
      } catch (error: unknown) {
        const message =
          error instanceof Error
            ? error.message
            : "Unknown Facebook Page live dispatch error";
        return {
          postId: post.postId,
          platform: post.platform,
          status: "failed",
          warning: `Facebook Page live dispatch failed: ${message}`,
          preview,
        };
      }
    }

    if (
      post.platform === "instagram_feed" ||
      post.platform === "instagram_reels" ||
      post.platform === "instagram_story"
    ) {
      try {
        const liveResult = await dispatchInstagramGraphLive(
          campaign,
          manifest,
          post,
          preview,
        );
        return {
          postId: post.postId,
          platform: post.platform,
          status: liveResult.status,
          externalPostId: liveResult.externalPostId,
          metadataNotes: liveResult.metadataNotes,
          preview,
        };
      } catch (error: unknown) {
        const message =
          error instanceof Error
            ? error.message
            : "Unknown Instagram Graph live dispatch error";
        return {
          postId: post.postId,
          platform: post.platform,
          status: "failed",
          warning: `Instagram Graph live dispatch failed: ${message}`,
          preview,
        };
      }
    }

    return {
      postId: post.postId,
      platform: post.platform,
      status: "failed",
      warning: `Live platform adapter not implemented yet for ${post.platform}. Use providerMode=simulate for end-to-end testing.`,
      preview,
    };
  }

  const externalPostId = `sim_${post.platform}_${Date.now()}`;
  let simulatedPreview = preview;
  const simulatedNotes: string[] = [
    post.platform === "tiktok_paid"
      ? "draftType=paid_lead_gen_ad"
      : post.platform === "tiktok"
        ? "draftType=organic_post"
        : post.platform === "google_display"
          ? "draftType=display_contextual"
          : "simulation_only=true",
    "simulation_only=true",
    `simulated_at=${new Date().toISOString()}`,
  ];

  if (post.platform === "google_display") {
    try {
      const { synthesizeGoogleTargeting } = await import(
        "./distribution/platforms/google-ads/targeting"
      );
      const targeting = synthesizeGoogleTargeting(campaign);
      simulatedPreview = {
        ...preview,
        googleTargeting: {
          keywords: targeting.keywords,
          placements: targeting.placements,
          negativeKeywords: targeting.negativeKeywords,
          summary: targeting.summary,
          rationale: targeting.rationale,
          seedKeywords: targeting.seedKeywords,
          audienceSignals: targeting.audienceSignals,
        },
      };
      simulatedNotes.push(
        `keywords_planned=${targeting.keywords.length}`,
        `placements_planned=${targeting.placements.length}`,
        `negatives_planned=${targeting.negativeKeywords.length}`,
        `targeting_summary=${targeting.summary.replace(/\n/g, " | ")}`,
      );
    } catch (error: unknown) {
      simulatedNotes.push(
        `targeting_synthesis_warning=${describeUnknownError(error)}`,
      );
    }
  }

  if (post.platform === "facebook_ad") {
    try {
      const targeting = await synthesizeMetaTargeting(campaign, {
        resolveInterestIds: false,
      });
      simulatedPreview = {
        ...preview,
        metaTargeting: {
          seedKeywords: targeting.seedKeywords,
          audienceSignals: targeting.audienceSignals,
          parentNodes: targeting.parentNodes,
          interestQueries: targeting.interestQueries,
          resolvedInterests: targeting.resolvedInterests,
          unresolvedQueries: targeting.unresolvedQueries,
          targeting: targeting.targeting,
          summary: targeting.summary,
          rationale: targeting.rationale,
          warnings: targeting.warnings,
          adSetMode: "dynamic_preview_unresolved",
        },
      };
      simulatedNotes.push(
        "draftType=meta_dynamic_ad_set",
        `meta_interest_queries_planned=${targeting.interestQueries.length}`,
        `meta_targeting_summary=${targeting.summary.replace(/\n/g, " | ")}`,
        ...targeting.warnings.map((warning) => `meta_targeting_warning=${warning}`),
      );
    } catch (error: unknown) {
      simulatedNotes.push(
        `meta_targeting_synthesis_warning=${describeUnknownError(error)}`,
      );
    }
  }

  return {
    postId: post.postId,
    platform: post.platform,
    status: "draft_created",
    externalPostId,
    metadataNotes: simulatedNotes,
    warning: `Simulated dispatch only. No live API call was sent to ${post.platform}.`,
    preview: simulatedPreview,
  };
}
