/**
 * Deal Google Ads Distribution proof artifact (Step 10): Google Ads
 * synthesis + deal targeting demographic -> distribution plan + simulate
 * dispatch.
 *
 * Asserts:
 *   1. buildGoogleTargetingPackageFromDeal adapts the deal's
 *      targetingDemographic.channelTargeting.google (searchThemes +
 *      keywordIdeas) into keywords, leaves placements empty with a surfaced
 *      "no placements selected" warning when no operatorPlacements are
 *      passed (never fabricated), and folds in default negative keywords
 *      alongside the deal's own.
 *   2. Passing real operatorPlacements (operator-picked URLs) populates
 *      targeting.placements verbatim and suppresses the "no placements"
 *      warning — these are the only way placements ever get populated.
 *   3. A deal with no targetingDemographic still produces a valid (empty
 *      keywords) package with a warning rather than throwing.
 *   4. planDealGoogleAdsDistribution is pure (no network calls), resolves
 *      the final URL from the synthesis's dealId, carries the synthesis's
 *      ad text fields verbatim, only fills an image URL slot when that
 *      aspect's asset status is "ready", and threads the synthesis's
 *      operatorPlacements into the targeting plan.
 *   5. dispatchDealGoogleAdsDistribution in "simulate" mode returns a
 *      "planned" status without requiring Google Ads credentials.
 *   6. cropForGoogleAds always outputs the exact pixel dimensions Google Ads
 *      expects, regardless of the source image's native ratio — the actual
 *      fix for a real "ASPECT_RATIO_NOT_ALLOWED" live-dispatch failure
 *      (gpt-image-2 has no native 1.91:1 output; its closest supported
 *      aspect, 16:9 / 1792x1024 / ratio 1.75, was too far from Google's
 *      required ~1.91:1 to pass upload validation).
 *
 * Run:
 *   npm run test:deal-google-ads-distribution
 */

import sharp from "sharp";

import {
  buildDealGoogleAdsSynthesis,
  buildGoogleTargetingPackageFromDeal,
  cropForGoogleAds,
  dispatchDealGoogleAdsDistribution,
  emptyDealGoogleAdsDistributionCache,
  GOOGLE_ADS_TARGET_DIMENSIONS,
  planDealGoogleAdsDistribution,
  upsertDealGoogleAdsDistribution,
  validateDealGoogleAdsDistributionCache,
  type CuratedOdysseusDeal,
  type DealFunnelSynthesis,
  type DealGoogleAdsDistribution,
} from "../lib/cb/deals-system";

let passed = 0;
let failed = 0;
function check(name: string, condition: boolean, detail?: string): void {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.error(`  FAIL  ${name}${detail ? ` - ${detail}` : ""}`);
  }
}

const GEN_AT = "2026-06-25T00:00:00.000Z";

function buildDeal(overrides: Partial<CuratedOdysseusDeal> = {}): CuratedOdysseusDeal {
  return {
    id: "1543052",
    status: "bookable",
    source: "odysseus_curated_retail",
    briefId: "brief-celebrity-edge",
    capturedAtIso: GEN_AT,
    packageId: "pkg-celebrity-edge-1",
    siid: "siid-1",
    bookingUrl: "https://example.com/book/1",
    bookingUrlSource: "constructed_package_url",
    linkHealth: "valid",
    cruiseFacts: {
      title: "Celebrity Edge — Dawes Glacier, Seattle Roundtrip, 7 Nights",
      cruiseLine: "Celebrity",
      shipName: "Celebrity Edge",
      itineraryName: "Alaska Glacier Roundtrip",
      nights: 7,
      sailDateIso: "2026-07-12",
      portsOfCall: ["Juneau", "Skagway", "Ketchikan"],
      cabinPrices: { inside: 899, outside: 1099, balcony: 1399, currencyCode: "USD" },
      promoSignals: [],
    },
    scoring: { score: 80, reasons: [], warnings: [] },
    packaging: {
      headline: "Sky Suite. Dawes Glacier. July",
      shortSummary: "A suite-level Alaska sailing from Seattle.",
      highlights: [],
      destinationNotes: [],
      bestFor: [],
    },
    ...overrides,
  } as CuratedOdysseusDeal;
}

const dealWithTargeting = buildDeal({
  targetingDemographic: {
    dealId: "1543052",
    packageId: "pkg-celebrity-edge-1",
    generatedAtIso: GEN_AT,
    primaryAudience: {
      label: "Glacier photography enthusiasts",
      description: "",
      whyThisCruiseFits: "",
      emotionalDrivers: [],
      likelyObjections: [],
    },
    secondaryAudiences: [],
    nicheKeywords: {
      lifestyle: [],
      destination: [],
      shipExperience: [],
      amenities: [],
      eventsAndSeasonality: [],
      trendSignals: [],
      exclusionKeywords: [],
    },
    channelTargeting: {
      meta: { interestClusters: [], behaviorSignals: [], creativeHooks: [], audienceWarnings: [] },
      google: {
        searchThemes: ["Dawes Glacier cruise", "Endicott Arm sailing"],
        keywordIdeas: ["glacier photography cruise", "Alaska sky suite balcony"],
        negativeKeywords: ["budget alaska cruise"],
        landingPageIntentNotes: [],
      },
      tiktok: { creatorAngles: [], trendHooks: [], shortVideoConcepts: [] },
      email: { segmentIdeas: [], subjectLineAngles: [], personalizationNotes: [] },
    },
    researchSummary: { primaryInsight: "", whyNow: "", competitorBlindSpot: "", positioningStatement: "" },
    sources: [],
    confidence: { score: 80, strengths: [], risks: [], needsHumanReview: [] },
  },
});

const dealWithoutTargeting = buildDeal();

// ── buildGoogleTargetingPackageFromDeal ──────────────────────────────────────

const preview = buildGoogleTargetingPackageFromDeal(dealWithTargeting);
check(
  "keywords combine keywordIdeas and searchThemes",
  preview.targeting.keywords.includes("glacier photography cruise") &&
    preview.targeting.keywords.includes("dawes glacier cruise")
);
check("placements is empty with no operatorPlacements passed", preview.targeting.placements.length === 0);
check(
  "warnings flag that no placements were selected",
  preview.warnings.some((w) => /no placements selected/i.test(w))
);
check(
  "negativeKeywords includes the deal's own negative plus the defaults",
  preview.targeting.negativeKeywords.includes("budget alaska cruise") &&
    preview.targeting.negativeKeywords.includes("cheap cruise")
);

const previewWithPlacements = buildGoogleTargetingPackageFromDeal(dealWithTargeting, [
  "reddit.com/r/AlaskaCruise",
  "youtube.com/@GlacierPhotographer",
]);
check(
  "operator-picked placements populate targeting.placements verbatim",
  previewWithPlacements.targeting.placements.includes("reddit.com/r/alaskacruise") &&
    previewWithPlacements.targeting.placements.includes("youtube.com/@glacierphotographer")
);
check(
  "operator-picked placements suppress the \"no placements selected\" warning",
  !previewWithPlacements.warnings.some((w) => /no placements selected/i.test(w))
);

// ── over-length keyword guard (the real KEYWORD_TEXT_TOO_LONG fix) ────────────

// Mirrors the live-dispatch failure: a descriptive audience-label-shaped
// sentence ended up in keywordIdeas upstream and Google rejected the whole
// mutate batch because one criterion exceeded its 80-char/10-word limit.
const tooLongKeyword =
  "affluent couples 40-65 with seattle access, milestone-trip intent, and premium-cabin willingness";
const tooManyWordsKeyword = "one two three four five six seven eight nine ten eleven twelve";
const dealWithOverLengthKeyword = buildDeal({
  targetingDemographic: {
    ...dealWithTargeting.targetingDemographic!,
    channelTargeting: {
      ...dealWithTargeting.targetingDemographic!.channelTargeting,
      google: {
        ...dealWithTargeting.targetingDemographic!.channelTargeting.google,
        keywordIdeas: ["glacier photography cruise", tooLongKeyword],
        searchThemes: ["Dawes Glacier cruise", tooManyWordsKeyword],
        negativeKeywords: ["budget alaska cruise", tooLongKeyword],
      },
    },
  },
});
const previewOverLength = buildGoogleTargetingPackageFromDeal(dealWithOverLengthKeyword);
check(
  "an over-80-char keyword is dropped, not truncated",
  !previewOverLength.targeting.keywords.some((k) => k.startsWith("affluent couples")) &&
    previewOverLength.targeting.keywords.includes("glacier photography cruise")
);
check(
  "an over-10-word keyword is dropped, not truncated",
  !previewOverLength.targeting.keywords.some((k) => k.startsWith("one two three"))
);
check(
  "dropped keywords are named in a warning rather than silently disappearing",
  previewOverLength.warnings.some((w) => w.includes("Dropped") && w.includes(tooLongKeyword))
);
check(
  "the same over-length guard applies to negative keywords",
  !previewOverLength.targeting.negativeKeywords.some((k) => k.startsWith("affluent couples")) &&
    previewOverLength.targeting.negativeKeywords.includes("budget alaska cruise")
);

const dealWithNegativeKeywordConflict = buildDeal({
  targetingDemographic: {
    ...dealWithTargeting.targetingDemographic!,
    channelTargeting: {
      ...dealWithTargeting.targetingDemographic!.channelTargeting,
      google: {
        ...dealWithTargeting.targetingDemographic!.channelTargeting.google,
        keywordIdeas: ["early booking cruise deals", "family cruise suite"],
        searchThemes: ["royal caribbean"],
        negativeKeywords: ["cruise deals", "cheap cruise"],
      },
    },
  },
});
const previewNegativeConflict = buildGoogleTargetingPackageFromDeal(dealWithNegativeKeywordConflict);
check(
  "negative keyword conflicts are dropped before Google Ads dispatch",
  !previewNegativeConflict.targeting.negativeKeywords.includes("cruise deals") &&
    previewNegativeConflict.targeting.keywords.includes("early booking cruise deals")
);
check(
  "negative keyword conflict warning names the blocked positive keyword",
  previewNegativeConflict.warnings.some((w) => w.includes("cruise deals blocks early booking cruise deals"))
);

const previewNoTargeting = buildGoogleTargetingPackageFromDeal(dealWithoutTargeting);
check("deal with no targetingDemographic produces empty keywords (not a throw)", previewNoTargeting.targeting.keywords.length === 0);
check(
  "deal with no targetingDemographic surfaces a specific warning",
  previewNoTargeting.warnings.some((w) => /no targetingDemographic/i.test(w))
);
check(
  "deal with no targetingDemographic still gets default negative keywords",
  previewNoTargeting.targeting.negativeKeywords.includes("cheap cruise")
);

// ── planDealGoogleAdsDistribution ─────────────────────────────────────────────

const funnelSynthesis: DealFunnelSynthesis = {
  id: "funnel-1543052",
  dealId: "1543052",
  generatedAtIso: GEN_AT,
  generator: "gpt",
  sourceAdCopyId: "adcopy-1",
  sailingAngleTitle: "See Dawes Glacier from Celebrity Edge",
  landingPage: {
    heroHeadline: "An Alaska Sailing Built Around the Glacier Moment",
    heroSubhead: "A suite-level Alaska sailing from Seattle — summer 2026.",
    segments: [],
    warnings: [],
  },
  carousel: {
    cards: [{ headline: "Sky Suite. Dawes Glacier. July", primaryText: "Your private veranda when Edge noses into Endicott Arm." }],
    warnings: [],
  },
  candidates: [],
  galleryIds: [],
};

const synthesis = buildDealGoogleAdsSynthesis(funnelSynthesis);
check("a freshly built synthesis starts with no operatorPlacements", synthesis.operatorPlacements.length === 0);

const synthesisOneReady = {
  ...synthesis,
  images: synthesis.images.map((img) =>
    img.aspect === "square_1x1" ? { ...img, status: "ready" as const, imageUrl: "https://r2.example/square.png" } : img
  ),
  operatorPlacements: ["reddit.com/r/alaskacruise"],
};

const plan = planDealGoogleAdsDistribution(synthesisOneReady, dealWithTargeting);
check("plan.dealId matches the synthesis's dealId", plan.dealId === synthesis.dealId);
check("plan.finalUrl points at the deal's public page", plan.finalUrl.endsWith(`/deals/${synthesis.dealId}`));
check("plan carries the synthesis's ad text fields verbatim", plan.headline === synthesis.headline && plan.description === synthesis.description);
check("plan.squareImageUrl is filled when that slot is ready", plan.squareImageUrl === "https://r2.example/square.png");
check("plan.landscapeImageUrl is empty when that slot isn't ready", plan.landscapeImageUrl === "");
check("plan.targeting carries the adapted keywords", plan.targeting.targeting.keywords.length > 0);
check(
  "plan.targeting threads the synthesis's operatorPlacements through",
  plan.targeting.targeting.placements.includes("reddit.com/r/alaskacruise")
);

const overLongEditedSynthesis = {
  ...synthesisOneReady,
  businessName: "LeisureLife Interactive Cruises".repeat(2),
  headline: "Balconies â‰ˆ Inside Pricing".repeat(2),
  longHeadline: "This premium sailing headline was edited past Google's long headline cap â€” with mojibake. ".repeat(3),
  description: "This description was edited past Google's responsive display description cap. ".repeat(3),
  sailingAngleTitle: "A very long campaign angle title for premium cruise shoppers ".repeat(8),
};
const cappedPlan = planDealGoogleAdsDistribution(overLongEditedSynthesis, dealWithTargeting);
check("plan caps businessName before live dispatch", cappedPlan.businessName.length <= 25);
check("plan caps headline before live dispatch", cappedPlan.headline.length <= 30);
check("plan caps longHeadline before live dispatch", cappedPlan.longHeadline.length <= 90);
check("plan caps description before live dispatch", cappedPlan.description.length <= 90);
check("plan caps campaignName before live dispatch", cappedPlan.campaignName.length <= 255);
check("plan caps businessName by UTF-8 bytes", Buffer.byteLength(cappedPlan.businessName, "utf8") <= 25);
check("plan caps headline by UTF-8 bytes", Buffer.byteLength(cappedPlan.headline, "utf8") <= 30);
check("plan caps longHeadline by UTF-8 bytes", Buffer.byteLength(cappedPlan.longHeadline, "utf8") <= 90);
check("plan caps description by UTF-8 bytes", Buffer.byteLength(cappedPlan.description, "utf8") <= 90);
check("plan caps campaignName by UTF-8 bytes", Buffer.byteLength(cappedPlan.campaignName, "utf8") <= 255);
check("plan sanitizes mojibake before live dispatch", cappedPlan.headline.includes("approx.") && !cappedPlan.headline.includes("â"));

// ── dispatchDealGoogleAdsDistribution (simulate) ──────────────────────────────

async function runSimulateDispatch(): Promise<void> {
  const oldFlyerPromptSynthesis = {
    ...synthesisOneReady,
    promptTemplate: "Generate a multi-image ad flyer showing composite images",
    images: synthesisOneReady.images.map((img) => ({
      ...img,
      status: "ready" as const,
      imageUrl: img.imageUrl ?? "https://r2.example/image.png",
      promptUsed: "Generate a multi-image ad flyer showing composite images",
    })),
  };
  const oldFlyerPromptPlan = planDealGoogleAdsDistribution(oldFlyerPromptSynthesis, dealWithTargeting);
  const oldFlyerPromptDistribution = await dispatchDealGoogleAdsDistribution(
    oldFlyerPromptSynthesis,
    oldFlyerPromptPlan,
    "live"
  );
  check("live dispatch blocks old flyer/collage image prompts before Google calls", oldFlyerPromptDistribution.status === "error");
  check(
    "old flyer/collage image prompt error tells the operator to regenerate",
    oldFlyerPromptDistribution.error?.includes("replace or regenerate the flagged Google image asset") === true
  );

  const staleTemplateGallerySynthesis = {
    ...synthesisOneReady,
    promptTemplate: "Generate a multi-image ad flyer showing composite images",
    images: synthesisOneReady.images.map((img) => ({
      ...img,
      status: "ready" as const,
      imageUrl: img.imageUrl ?? "https://r2.example/gallery.png",
      generator: "gallery_photo" as const,
      promptUsed: undefined,
    })),
  };
  const savedGoogleAdsEnv = {
    GOOGLE_ADS_CLIENT_ID: process.env.GOOGLE_ADS_CLIENT_ID,
    GOOGLE_ADS_CLIENT_SECRET: process.env.GOOGLE_ADS_CLIENT_SECRET,
    GOOGLE_ADS_DEVELOPER_TOKEN: process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
    GOOGLE_ADS_CUSTOMER_ID: process.env.GOOGLE_ADS_CUSTOMER_ID,
    GOOGLE_ADS_REDIRECT_URI: process.env.GOOGLE_ADS_REDIRECT_URI,
  };
  delete process.env.GOOGLE_ADS_CLIENT_ID;
  delete process.env.GOOGLE_ADS_CLIENT_SECRET;
  delete process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  delete process.env.GOOGLE_ADS_CUSTOMER_ID;
  delete process.env.GOOGLE_ADS_REDIRECT_URI;
  const staleTemplateGalleryDistribution = await dispatchDealGoogleAdsDistribution(
    staleTemplateGallerySynthesis,
    planDealGoogleAdsDistribution(staleTemplateGallerySynthesis, dealWithTargeting),
    "live"
  );
  for (const [key, value] of Object.entries(savedGoogleAdsEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  check(
    "live dispatch does not block gallery photos because of a stale flyer prompt template",
    staleTemplateGalleryDistribution.error?.startsWith("Missing Google Ads env vars") === true
  );

  const distribution = await dispatchDealGoogleAdsDistribution(synthesisOneReady, plan, "simulate");
  check("simulate dispatch returns status planned", distribution.status === "planned");
  check("simulate dispatch does not populate campaignId", distribution.campaignId === undefined);
  check(
    "simulate dispatch notes record the requested keyword/negative counts",
    distribution.notes.some((n) => n.startsWith("requested_keywords=")) &&
      distribution.notes.some((n) => n.startsWith("requested_negatives="))
  );

  // ── cache upsert + validation ───────────────────────────────────────────────
  const emptyCache = emptyDealGoogleAdsDistributionCache(GEN_AT);
  check("empty distribution cache validates", validateDealGoogleAdsDistributionCache(emptyCache).ok);

  const cacheWithOne = upsertDealGoogleAdsDistribution(emptyCache, distribution);
  check("upsert adds the distribution", cacheWithOne.distributions.length === 1);

  const updated: DealGoogleAdsDistribution = { ...distribution, status: "error", error: "test override" };
  const cacheAfterReupsert = upsertDealGoogleAdsDistribution(cacheWithOne, updated);
  check(
    "re-upserting the same id replaces rather than duplicates",
    cacheAfterReupsert.distributions.length === 1 && cacheAfterReupsert.distributions[0].status === "error"
  );
  check("well-formed distribution cache passes validation", validateDealGoogleAdsDistributionCache(cacheAfterReupsert).ok);

  const malformedCache = { ...cacheAfterReupsert, distributions: [{ ...distribution, mode: "not_a_mode" }] };
  check("distribution cache with an invalid mode fails validation", !validateDealGoogleAdsDistributionCache(malformedCache).ok);

  // ── cropForGoogleAds (the ASPECT_RATIO_NOT_ALLOWED fix) ───────────────────────

  // gpt-image-2's closest supported aspect to Google's 1.91:1 landscape slot is
  // "16:9" (1792x1024, ratio 1.75) — too far off to pass Google's upload
  // validation. Simulate that exact source and confirm the crop step always
  // lands on Google's required exact pixel dimensions.
  const gptImage2LandscapeSource = await sharp({
    create: { width: 1792, height: 1024, channels: 3, background: { r: 100, g: 150, b: 200 } },
  })
    .png()
    .toBuffer();
  const croppedLandscape = await cropForGoogleAds(gptImage2LandscapeSource, "landscape_1_91x1");
  const croppedLandscapeMeta = await sharp(croppedLandscape).metadata();
  check(
    "cropForGoogleAds outputs the exact landscape_1_91x1 target dimensions from a 16:9 (1.75:1) source",
    croppedLandscapeMeta.width === GOOGLE_ADS_TARGET_DIMENSIONS.landscape_1_91x1.width &&
      croppedLandscapeMeta.height === GOOGLE_ADS_TARGET_DIMENSIONS.landscape_1_91x1.height
  );

  const gptImage2SquareSource = await sharp({
    create: { width: 1024, height: 1024, channels: 3, background: { r: 100, g: 150, b: 200 } },
  })
    .png()
    .toBuffer();
  const croppedSquare = await cropForGoogleAds(gptImage2SquareSource, "square_1x1");
  const croppedSquareMeta = await sharp(croppedSquare).metadata();
  check(
    "cropForGoogleAds outputs the exact square_1x1 target dimensions from a 1:1 source",
    croppedSquareMeta.width === GOOGLE_ADS_TARGET_DIMENSIONS.square_1x1.width &&
      croppedSquareMeta.height === GOOGLE_ADS_TARGET_DIMENSIONS.square_1x1.height
  );

  console.log(`\n${passed} passed, ${failed} failed.`);
  if (failed > 0) {
    process.exit(1);
  }
}

void runSimulateDispatch();
