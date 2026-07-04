/**
 * Deal Google Ads Distribution generator/dispatcher (Step 10).
 *
 * Pushes a Step 9 Google Ads Synthesis to the live Google Ads account as a
 * PAUSED Responsive Display Ad, reusing the group-campaign system's tested
 * Google Ads platform primitives (asset upload, campaign/budget/ad-group/ad
 * creation, targeting criteria, verification readback) rather than its
 * createGoogleDisplayDraft entry point — that function is shaped around a
 * CampaignMediaManifest + ScheduledPost, which a Deal doesn't have. Deals
 * stay separate from Groups: this module reads no group-campaign caches or
 * entities, only the stateless google-ads platform functions operating on
 * data built here.
 *
 *   - buildGoogleTargetingPackageFromDeal: pure adapter from the deal's
 *     targetingDemographic.channelTargeting.google (searchThemes,
 *     keywordIdeas, negativeKeywords) into a GoogleTargetingPackage. Deals
 *     have no audience-signal placement sourcing yet, so placements is
 *     always empty with a surfaced warning rather than a fabricated guess.
 *   - planDealGoogleAdsDistribution: pure preview (no API calls). Builds the
 *     targeting package and the ad's final fields from the synthesis.
 *   - dispatchDealGoogleAdsDistribution: "simulate" returns the plan only.
 *     "live" uploads both image assets and creates a PAUSED campaign,
 *     budget, ad group, Responsive Display Ad, and targeting criteria via
 *     the Google Ads API, then reads back a verification summary.
 */

import { GoogleAdsApi, enums } from "google-ads-api";
import sharp from "sharp";

import { getGoogleAdsConfig } from "@/lib/integrations/google-ads";
import { loadProviderToken } from "@/lib/integrations/provider-token-store";
import {
  buildAdGroupCriterionOperations,
  removeGoogleDisplayDraft,
  summarizeTargetingVerification,
  type AdGroupCriterionRow,
  type AdGroupRow,
  type CampaignStatusRow,
  type GoogleDisplayTargetingVerification,
} from "@/lib/campaigns/distribution/platforms/google-ads/campaign";
import type { GoogleTargetingPackage } from "@/lib/campaigns/distribution/platforms/google-ads/targeting";

import type { CuratedOdysseusDeal } from "./curated-deal-types";
import { sanitizeGoogleAdsText, type DealGoogleAdsImageAspect, type DealGoogleAdsSynthesis } from "./deal-google-ads-synthesis-types";
import type {
  DealGoogleAdsDistribution,
  DealGoogleAdsDistributionMode,
  DealGoogleAdsDistributionPlan,
  DealGoogleAdsDistributionTargetingPreview,
} from "./deal-google-ads-distribution-types";

const DEFAULT_NEGATIVE_KEYWORDS = [
  "cheap cruise",
  "cruise deals",
  "last minute cruise",
  "discount cruise",
];
const GOOGLE_ADS_ENTITY_NAME_MAX = 255;
const GOOGLE_ADS_AD_GROUP_SUFFIX = " - Group 1";

function getSiteBaseUrl(): string {
  const configured =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    "https://leisurelifeinteractive.net";
  return configured.replace(/\/$/, "");
}

function normalizeTerm(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function unique(values: string[]): string[] {
  const out: string[] = [];
  for (const value of values) {
    const normalized = normalizeTerm(value);
    if (normalized && !out.includes(normalized)) out.push(normalized);
  }
  return out;
}

/**
 * Adapt a deal's targetingDemographic.channelTargeting.google into a
 * GoogleTargetingPackage. Pure — no AI, no network calls. Deals have no
 * audience-signal placement sourcing the way group campaigns do (regex-mining
 * an LLM-generated research dossier for unverified community mentions), so
 * this never fabricates placements. Real placements only come from
 * operatorPlacements — URLs the operator picked from actual SerpAPI web
 * search results (deal-community-search.ts) in the Step 9 lab. No operator
 * picks yet → empty placements + a warning, never a guess.
 */
/** Google Ads keyword criterion limits: KEYWORD_TEXT_TOO_LONG (>80 chars) and
 * KEYWORD_HAS_TOO_MANY_WORDS (>10 words). A descriptive sentence (e.g. an
 * audience label) can violate either even when it reads like a reasonable
 * "keyword" upstream. Google rejects the WHOLE mutate batch if even one
 * criterion violates this, so these must be filtered out before dispatch —
 * never truncated, since cutting a sentence at 80 chars produces a
 * different, possibly nonsensical phrase rather than a valid keyword. */
const GOOGLE_ADS_KEYWORD_MAX_CHARS = 80;
const GOOGLE_ADS_KEYWORD_MAX_WORDS = 10;

function termTokens(keyword: string): string[] {
  return keyword
    .toLowerCase()
    .split(" ")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function negativeConflictsWithKeyword(negativeKeyword: string, keyword: string): boolean {
  const negativeTokens = termTokens(negativeKeyword);
  const keywordTokens = termTokens(keyword);
  if (negativeTokens.length === 0 || keywordTokens.length === 0) return false;
  return negativeTokens.every((token) => keywordTokens.includes(token));
}

function negativeConflictsWithAnyKeyword(negativeKeyword: string, keywords: string[]): string | undefined {
  return keywords.find((keyword) => negativeConflictsWithKeyword(negativeKeyword, keyword));
}

function isValidGoogleAdsKeyword(keyword: string): boolean {
  return (
    keyword.length <= GOOGLE_ADS_KEYWORD_MAX_CHARS &&
    keyword.split(/\s+/).filter(Boolean).length <= GOOGLE_ADS_KEYWORD_MAX_WORDS
  );
}

export function buildGoogleTargetingPackageFromDeal(
  deal: CuratedOdysseusDeal,
  operatorPlacements: string[] = []
): DealGoogleAdsDistributionTargetingPreview {
  const google = deal.targetingDemographic?.channelTargeting.google;
  const warnings: string[] = [];

  const seedKeywords = unique(google?.keywordIdeas ?? []);
  const searchThemeKeywords = unique(google?.searchThemes ?? []);
  const allKeywords = unique([...seedKeywords, ...searchThemeKeywords]);
  const keywords = allKeywords.filter(isValidGoogleAdsKeyword);
  const droppedKeywords = allKeywords.filter((k) => !isValidGoogleAdsKeyword(k));
  const allNegativeKeywords = unique([...(google?.negativeKeywords ?? []), ...DEFAULT_NEGATIVE_KEYWORDS]);
  const validNegativeKeywords = allNegativeKeywords.filter(isValidGoogleAdsKeyword);
  const negativeKeywordConflicts = validNegativeKeywords
    .map((negativeKeyword) => ({ negativeKeyword, conflictingKeyword: negativeConflictsWithAnyKeyword(negativeKeyword, keywords) }))
    .filter((conflict): conflict is { negativeKeyword: string; conflictingKeyword: string } =>
      conflict.conflictingKeyword !== undefined
    );
  const negativeKeywords = validNegativeKeywords.filter(
    (negativeKeyword) => !negativeKeywordConflicts.some((conflict) => conflict.negativeKeyword === negativeKeyword)
  );
  const droppedNegativeKeywords = allNegativeKeywords.filter((k) => !isValidGoogleAdsKeyword(k));
  const placements = unique(operatorPlacements);

  if (!deal.targetingDemographic) {
    warnings.push("Deal has no targetingDemographic; targeting falls back to default negatives only.");
  } else if (keywords.length === 0) {
    warnings.push(
      "Deal's targetingDemographic.channelTargeting.google has no searchThemes/keywordIdeas; no keywords to target."
    );
  }

  if (droppedKeywords.length > 0) {
    warnings.push(
      `Dropped ${droppedKeywords.length} keyword(s) over Google's ${GOOGLE_ADS_KEYWORD_MAX_CHARS}-char/` +
        `${GOOGLE_ADS_KEYWORD_MAX_WORDS}-word criterion limit (never truncated — these read as descriptive ` +
        `phrases upstream, not real keywords): ${droppedKeywords.join(" | ")}`
    );
  }
  if (droppedNegativeKeywords.length > 0) {
    warnings.push(
      `Dropped ${droppedNegativeKeywords.length} negative keyword(s) over Google's same criterion limit: ` +
        droppedNegativeKeywords.join(" | ")
    );
  }
  if (negativeKeywordConflicts.length > 0) {
    warnings.push(
      `Dropped ${negativeKeywordConflicts.length} negative keyword(s) that would conflict with requested ` +
        `positive keywords: ${negativeKeywordConflicts
          .map((conflict) => `${conflict.negativeKeyword} blocks ${conflict.conflictingKeyword}`)
          .join(" | ")}`
    );
  }

  if (placements.length === 0) {
    warnings.push(
      "No placements selected: search for real communities in the Step 9 lab (\"Search for real communities\") " +
        "and pick from actual SerpAPI results. Placements are never auto-applied or guessed."
    );
  }

  const summaryLines = [
    `Keywords (${keywords.length}): ${keywords.join(", ") || "none"}`,
    placements.length > 0
      ? `Placements (${placements.length}, operator-picked from real search results): ${placements.join(", ")}`
      : "Placements: none selected.",
    `Negative keywords (${negativeKeywords.length}): ${negativeKeywords.join(", ")}`,
  ];

  const targeting: GoogleTargetingPackage = {
    keywords,
    placements,
    negativeKeywords,
    summary: summaryLines.join("\n"),
    rationale:
      `Seeded from ${seedKeywords.length} deal targetingDemographic.channelTargeting.google.keywordIdeas term(s) ` +
      `and ${searchThemeKeywords.length} searchThemes term(s). Placements are 100% operator-picked from real ` +
      "SerpAPI search results — never LLM-imagined or auto-applied.",
    seedKeywords,
    audienceSignals: [],
    placementSources: placements.length > 0 ? ["audience_signals"] : [],
  };

  return { targeting, warnings };
}

/**
 * Build the distribution plan for a Google Ads synthesis: final URL, ad
 * text fields, both ready image URLs, and the adapted targeting package.
 * Pure preview — no Google Ads API calls.
 */
export function planDealGoogleAdsDistribution(
  synthesis: DealGoogleAdsSynthesis,
  deal: CuratedOdysseusDeal
): DealGoogleAdsDistributionPlan {
  const landscape = synthesis.images.find((img) => img.aspect === "landscape_1_91x1");
  const square = synthesis.images.find((img) => img.aspect === "square_1x1");

  const finalUrl = `${getSiteBaseUrl()}/deals/${encodeURIComponent(synthesis.dealId)}`;
  const targeting = buildGoogleTargetingPackageFromDeal(deal, synthesis.operatorPlacements);

  return {
    dealId: synthesis.dealId,
    finalUrl,
    businessName: cap(synthesis.businessName, 25),
    headline: cap(synthesis.headline, 30),
    longHeadline: cap(synthesis.longHeadline, 90),
    description: cap(synthesis.description, 90),
    landscapeImageUrl: landscape?.status === "ready" ? landscape.imageUrl ?? "" : "",
    squareImageUrl: square?.status === "ready" ? square.imageUrl ?? "" : "",
    targeting,
    campaignName: capGoogleAdsEntityName(`[DRAFT] Deal ${synthesis.dealId} - ${synthesis.sailingAngleTitle}`),
  };
}

function cap(text: string, max: number): string {
  const clean = sanitizeGoogleAdsText(text);
  if (Buffer.byteLength(clean, "utf8") <= max) return clean;
  let capped = "";
  for (const char of Array.from(clean)) {
    const next = `${capped}${char}`;
    if (Buffer.byteLength(next, "utf8") > max) break;
    capped = next;
  }
  return capped.trimEnd();
}

function capGoogleAdsEntityName(text: string, suffix = ""): string {
  const maxBaseLength = GOOGLE_ADS_ENTITY_NAME_MAX - Buffer.byteLength(suffix, "utf8");
  return `${cap(text, maxBaseLength)}${suffix}`;
}

function extractId(resourceName: string): string {
  return resourceName.split("/").pop() ?? resourceName;
}

/**
 * The google-ads-api library throws a decoded GoogleAdsFailure object on
 * mutate errors — NOT a plain Error — so `error instanceof Error` is false
 * and `String(error)` collapses to the useless "[object Object]". Pull the
 * real per-error messages (and error codes, when present) out of its
 * `errors: GoogleAdsError[]` shape; fall back to Error.message, then
 * JSON.stringify, so something diagnosable is always returned.
 */
function describeGoogleAdsError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "errors" in error) {
    const failure = error as { errors?: Array<{ message?: string; error_code?: unknown }> };
    if (Array.isArray(failure.errors) && failure.errors.length > 0) {
      return failure.errors
        .map((e) => {
          const code = e.error_code ? ` (${JSON.stringify(e.error_code)})` : "";
          return `${e.message ?? "Unknown Google Ads error"}${code}`;
        })
        .join("; ");
    }
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

/**
 * Google rejects Display image assets whose pixel aspect ratio doesn't match
 * its expected bands closely enough (media_upload_error:
 * ASPECT_RATIO_NOT_ALLOWED). gpt-image-2 has no native 1.91:1 output — the
 * generator uses its closest supported aspect ("16:9" → 1792x1024, ratio
 * 1.75:1) for the landscape slot, which is too far from Google's required
 * ~1.91:1 (1200x628) to pass. Crop every image to its exact target
 * dimensions with sharp's "cover" fit (same pattern as
 * lib/campaigns/media/generators/sharp-processor.ts) before upload, so the
 * bytes Google receives are always exactly the ratio it expects regardless
 * of what the source generation/gallery photo's native ratio was.
 */
export const GOOGLE_ADS_TARGET_DIMENSIONS: Record<DealGoogleAdsImageAspect, { width: number; height: number }> = {
  landscape_1_91x1: { width: 1200, height: 628 },
  square_1x1: { width: 1200, height: 1200 },
};

/**
 * Crop an image buffer to the exact pixel dimensions Google Ads expects for
 * the given aspect slot, regardless of the source's native ratio. Exported
 * separately from uploadGoogleAdsImageAsset so the crop math itself (the
 * actual fix for ASPECT_RATIO_NOT_ALLOWED) can be proven offline without a
 * live Google Ads connection.
 */
export async function cropForGoogleAds(sourceBuffer: Buffer, aspect: DealGoogleAdsImageAspect): Promise<Buffer> {
  const { width, height } = GOOGLE_ADS_TARGET_DIMENSIONS[aspect];
  return sharp(sourceBuffer)
    .resize(width, height, { fit: "cover", position: "attention" })
    .png()
    .toBuffer();
}

function hasOldFlyerPromptLanguage(text: string | undefined): boolean {
  const lowered = text?.toLowerCase() ?? "";
  return (
    lowered.includes("multi-image") ||
    lowered.includes("ad flyer") ||
    lowered.includes("collage") ||
    lowered.includes("split-panel") ||
    lowered.includes("composite images") ||
    lowered.includes("composite sheet")
  );
}

function googleAdsImagePolicyWarnings(synthesis: DealGoogleAdsSynthesis): string[] {
  const warnings: string[] = [];
  for (const image of synthesis.images) {
    if (image.status !== "ready") continue;
    if (hasOldFlyerPromptLanguage(image.promptUsed)) {
      warnings.push(`${image.aspect} was generated from a flyer/collage-style prompt`);
    }
  }
  return warnings;
}

async function uploadGoogleAdsImageAsset(
  customer: ReturnType<GoogleAdsApi["Customer"]>,
  imageUrl: string,
  assetName: string,
  aspect: DealGoogleAdsImageAspect
): Promise<string> {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch Google display image asset ${assetName}: ${response.status} ${response.statusText}`);
  }
  const sourceBuffer = Buffer.from(await response.arrayBuffer());
  const buffer = await cropForGoogleAds(sourceBuffer, aspect);
  const assetRes = await customer.assets.create([
    { name: assetName, type: enums.AssetType.IMAGE, image_asset: { data: buffer } },
  ]);
  const resourceName = assetRes.results[0]?.resource_name;
  if (!resourceName) {
    throw new Error(`Image asset creation returned no resource_name for ${assetName}`);
  }
  return resourceName;
}

/**
 * Dispatch a distribution plan. "simulate" returns a "planned" record
 * without touching the Google Ads API. "live" uploads both image assets and
 * creates the campaign, budget, ad group, PAUSED Responsive Display Ad, and
 * targeting criteria, then verifies the readback.
 */
export async function dispatchDealGoogleAdsDistribution(
  synthesis: DealGoogleAdsSynthesis,
  plan: DealGoogleAdsDistributionPlan,
  mode: DealGoogleAdsDistributionMode
): Promise<DealGoogleAdsDistribution> {
  const base: DealGoogleAdsDistribution = {
    id: synthesis.id,
    dealId: synthesis.dealId,
    sourceGoogleAdsSynthesisId: synthesis.id,
    generatedAtIso: new Date().toISOString(),
    mode,
    status: "planned",
    plan,
    notes: [],
  };

  if (mode === "simulate") {
    return {
      ...base,
      notes: [
        `simulated_at=${new Date().toISOString()}`,
        `requested_keywords=${plan.targeting.targeting.keywords.length}`,
        `requested_negatives=${plan.targeting.targeting.negativeKeywords.length}`,
        ...plan.targeting.warnings.map((w) => `targeting_warning=${w}`),
      ],
    };
  }

  // ── live ─────────────────────────────────────────────────────────────────
  if (!plan.landscapeImageUrl || !plan.squareImageUrl) {
    return {
      ...base,
      status: "error",
      error: "Both landscape and square images must be ready before dispatching live. Generate them first.",
    };
  }

  const imagePolicyWarnings = googleAdsImagePolicyWarnings(synthesis);
  if (imagePolicyWarnings.length > 0) {
    return {
      ...base,
      status: "error",
      error:
        "Google Ads image policy preflight: replace or regenerate the flagged Google image asset(s) before live dispatch. " +
        imagePolicyWarnings.join("; "),
    };
  }

  const config = getGoogleAdsConfig();
  if (!config) {
    return {
      ...base,
      status: "error",
      error:
        "Missing Google Ads env vars: GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET, GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_CUSTOMER_ID, GOOGLE_ADS_REDIRECT_URI.",
    };
  }

  const tokenRecord = await loadProviderToken("google", "business");
  if (!tokenRecord?.refreshToken) {
    return {
      ...base,
      status: "error",
      error: "Google Ads refresh token not found. Visit /api/integrations/google/connect to authorize.",
    };
  }

  const notes: string[] = [];
  let liveStage = "initializing Google Ads client";

  try {
    const googleAds = new GoogleAdsApi({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      developer_token: config.developerToken,
    });
    const customer = googleAds.Customer({
      customer_id: config.customerId,
      refresh_token: tokenRecord.refreshToken,
      ...(config.managerId ? { login_customer_id: config.managerId } : {}),
    });

    const assetBaseName = `ll-deal-${synthesis.dealId}-google-display-${Date.now()}`;
    liveStage = "uploading landscape image asset";
    const landscapeAssetName = await uploadGoogleAdsImageAsset(
      customer,
      plan.landscapeImageUrl,
      capGoogleAdsEntityName(assetBaseName, "-landscape"),
      "landscape_1_91x1"
    );
    liveStage = "uploading square image asset";
    const squareAssetName = await uploadGoogleAdsImageAsset(
      customer,
      plan.squareImageUrl,
      capGoogleAdsEntityName(assetBaseName, "-square"),
      "square_1x1"
    );

    // Google rejects creating a campaign whose name matches an existing
    // active/paused campaign (DUPLICATE_CAMPAIGN_NAME). campaignName is
    // derived only from dealId + sailingAngleTitle, so a stale draft left
    // over from an earlier partial/errored dispatch of this same deal
    // collides with every retry. Self-heal: find and remove any existing
    // campaign with this exact name before creating the new one.
    liveStage = "checking for stale campaign name";
    const existingCampaignRows = (await customer.query(
      `SELECT campaign.id FROM campaign WHERE campaign.name = '${plan.campaignName.replace(/'/g, "\\'")}' ` +
        `AND campaign.status IN ('PAUSED', 'ENABLED')`
    )) as Array<{ campaign?: { id?: string | number } }>;
    for (const row of existingCampaignRows) {
      const staleCampaignId = row.campaign?.id;
      if (staleCampaignId === undefined || staleCampaignId === null) continue;
      liveStage = `removing stale campaign ${staleCampaignId}`;
      await removeGoogleDisplayDraft(String(staleCampaignId));
      notes.push(`removed_stale_campaign_id=${staleCampaignId}`);
    }

    liveStage = "creating campaign budget";
    const budgetRes = await customer.campaignBudgets.create([
      {
        name: capGoogleAdsEntityName(`Budget ${plan.campaignName}`),
        amount_micros: 5_000_000,
        delivery_method: enums.BudgetDeliveryMethod.STANDARD,
        explicitly_shared: false,
      },
    ]);
    const budgetName = budgetRes.results[0]?.resource_name;
    if (!budgetName) throw new Error("Campaign budget creation returned no resource_name");

    liveStage = "creating paused display campaign";
    const campaignRes = await customer.campaigns.create([
      {
        name: plan.campaignName,
        status: enums.CampaignStatus.PAUSED,
        advertising_channel_type: enums.AdvertisingChannelType.DISPLAY,
        campaign_budget: budgetName,
        contains_eu_political_advertising: enums.EuPoliticalAdvertisingStatus.DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING,
        target_spend: {},
      },
    ]);
    const campaignResourceName = campaignRes.results[0]?.resource_name;
    if (!campaignResourceName) throw new Error("Campaign creation returned no resource_name");
    const campaignId = extractId(campaignResourceName);

    liveStage = "creating paused ad group";
    const adGroupRes = await customer.adGroups.create([
      {
        name: capGoogleAdsEntityName(plan.campaignName, GOOGLE_ADS_AD_GROUP_SUFFIX),
        campaign: campaignResourceName,
        status: enums.AdGroupStatus.PAUSED,
        cpc_bid_micros: 1_000_000,
      },
    ]);
    const adGroupResourceName = adGroupRes.results[0]?.resource_name;
    if (!adGroupResourceName) throw new Error("Ad group creation returned no resource_name");
    const adGroupId = extractId(adGroupResourceName);

    liveStage = "creating responsive display ad";
    const adRes = await customer.adGroupAds.create([
      {
        ad_group: adGroupResourceName,
        status: enums.AdGroupAdStatus.PAUSED,
        ad: {
          final_urls: [plan.finalUrl],
          responsive_display_ad: {
            business_name: plan.businessName,
            headlines: [{ text: plan.headline }],
            long_headline: { text: plan.longHeadline },
            descriptions: [{ text: plan.description }],
            marketing_images: [{ asset: landscapeAssetName }],
            square_marketing_images: [{ asset: squareAssetName }],
          },
        },
      },
    ]);
    const adResourceName = adRes.results[0]?.resource_name;
    if (!adResourceName) throw new Error("Ad creation returned no resource_name");
    const adId = extractId(adResourceName);

    const criterionOperations = buildAdGroupCriterionOperations(adGroupResourceName, plan.targeting.targeting);
    if (criterionOperations.length > 0) {
      liveStage = "creating ad group targeting criteria";
      await customer.adGroupCriteria.create(criterionOperations as never);
    }

    liveStage = "verifying campaign status";
    const campaignStatusRows = (await customer.query(
      `SELECT campaign.status FROM campaign WHERE campaign.resource_name = '${campaignResourceName}'`
    )) as CampaignStatusRow[];
    liveStage = "verifying ad group";
    const adGroupRows = (await customer.query(
      `SELECT ad_group.id FROM ad_group WHERE ad_group.resource_name = '${adGroupResourceName}'`
    )) as AdGroupRow[];
    liveStage = "verifying targeting criteria";
    const criterionRows = (await customer.query(
      `SELECT ad_group_criterion.type, ad_group_criterion.negative, ` +
        `ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ` +
        `ad_group_criterion.placement.url ` +
        `FROM ad_group_criterion WHERE ad_group.resource_name = '${adGroupResourceName}'`
    )) as AdGroupCriterionRow[];
    const campaignStatusRaw = campaignStatusRows[0]?.campaign?.status;
    const campaignStatus =
      typeof campaignStatusRaw === "string"
        ? campaignStatusRaw
        : typeof campaignStatusRaw === "number"
          ? String(enums.CampaignStatus[campaignStatusRaw] ?? campaignStatusRaw)
          : "UNKNOWN";

    const verification: GoogleDisplayTargetingVerification = summarizeTargetingVerification(
      campaignStatus,
      adGroupRows.length > 0,
      criterionRows,
      plan.targeting.targeting
    );

    const reviewUrl = `https://ads.google.com/aw/campaigns?campaignId=${campaignId}${
      config.managerId ? `&__c=${config.managerId}` : ""
    }`;

    notes.push(
      `google_ads_customer_id=${config.customerId}`,
      `google_ads_campaign_id=${campaignId}`,
      `google_ads_ad_group_id=${adGroupId}`,
      `google_ads_ad_id=${adId}`,
      `keywords_applied=${verification.appliedKeywords}/${verification.requestedKeywords}`,
      `negatives_applied=${verification.appliedNegatives}/${verification.requestedNegatives}`,
      `placements_applied=${verification.appliedPlacements}/${verification.requestedPlacements}`,
      ...plan.targeting.warnings.map((w) => `targeting_warning=${w}`),
      `google_ads_dispatched_at=${new Date().toISOString()}`
    );

    return {
      ...base,
      status: "dispatched",
      campaignId,
      adGroupId,
      adId,
      reviewUrl,
      verification,
      notes,
    };
  } catch (error: unknown) {
    return {
      ...base,
      status: "error",
      notes,
      error: `${liveStage}: ${describeGoogleAdsError(error)}`,
    };
  }
}
