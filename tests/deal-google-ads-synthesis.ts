/**
 * Deal Google Ads Synthesis proof artifact (Step 9): funnel lead carousel
 * card → Google Responsive Display Ad text fields + image slots.
 *
 * Asserts:
 *   1. buildDealGoogleAdsSynthesis adapts the funnel's lead carousel card into
 *      capped headline/long_headline/description fields, seeds the default
 *      business name + prompt template, and seeds exactly 2 pending image
 *      slots (landscape_1_91x1, square_1x1).
 *   2. capGoogleAdsText caps without truncating mid-word's surrounding
 *      whitespace (trims trailing space after slicing) and leaves
 *      under-length text untouched.
 *   3. interpolateGoogleAdsPrompt substitutes {{HEADLINE}}/{{LONG_HEADLINE}}
 *      and leaves the default template free of literal text-rendering
 *      instructions (the operator-confirmed Google policy constraint).
 *   4. Cache upsert is idempotent (same id replaces, not duplicates) and the
 *      validator accepts a well-formed payload and rejects one with the
 *      wrong image-slot count.
 *   5. useDealGoogleAdsGalleryImage assigns a real gallery photo URL with no
 *      AI call, tags it generator "gallery_photo", and preserves the prior
 *      image (if any) in previousImages for revert.
 *
 * Run:
 *   npm run test:deal-google-ads-synthesis
 */

import {
  buildDealGoogleAdsSynthesis,
  capGoogleAdsText,
  emptyDealGoogleAdsSynthesisCache,
  interpolateGoogleAdsPrompt,
  upsertDealGoogleAdsSynthesis,
  useDealGoogleAdsGalleryImage,
  validateDealGoogleAdsSynthesisCache,
  GOOGLE_ADS_DESCRIPTION_MAX,
  GOOGLE_ADS_HEADLINE_MAX,
  GOOGLE_ADS_LONG_HEADLINE_MAX,
  DEFAULT_GOOGLE_ADS_BUSINESS_NAME,
  type DealFunnelSynthesis,
  type DealGoogleAdsSynthesis,
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

const longHeadline =
  "Zero GMs. Nine Nights. One Ocean. A transatlantic crossing built entirely around solo journaling tabletop roleplay.";

const funnelSynthesis: DealFunnelSynthesis = {
  id: "funnel-roll-the-dice",
  dealId: "deal-1578937",
  generatedAtIso: GEN_AT,
  generator: "gpt",
  sourceAdCopyId: "adcopy-roll-the-dice",
  sailingAngleTitle: "Seven Sea Days, One Thousand Years: A Mid-Atlantic Solo RPG Crossing",
  landingPage: {
    heroHeadline: "An Unhurried Crossing, Built for Quiet Days at Sea",
    heroSubhead: "Nine nights of open ocean, premium cabins, and atmospheric evenings — no itinerary rush.",
    segments: [
      { segment: "cabins", heading: "Your Space at Sea", body: "Spacious staterooms with private balconies overlooking the Atlantic." },
      { segment: "lounges", heading: "Quiet Lounges", body: "Quiet, sophisticated lounges for unhurried evenings." },
      { segment: "atrium", heading: "The Grand Atrium", body: "A grand atrium that anchors the ship's calm, social heart." },
      { segment: "dining", heading: "Relaxed Dining", body: "Relaxed, multi-course dining without a fixed schedule." },
      { segment: "excursions", heading: "Optional Excursions", body: "Optional port excursions along the way." },
    ],
    warnings: [],
  },
  carousel: {
    cards: [
      {
        headline: "Zero GMs. Nine Nights. One Ocean.",
        primaryText: longHeadline,
      },
      {
        headline: "Your Campaign Finally Gets Sea Days.",
        primaryText: "9 unbroken sea days for solo journaling RPG play, no land-life interruptions.",
      },
    ],
    warnings: [],
  },
  candidates: [],
  galleryIds: [],
  heroImageId: undefined,
};

// ── buildDealGoogleAdsSynthesis ──────────────────────────────────────────────

const synthesis = buildDealGoogleAdsSynthesis(funnelSynthesis);

check("synthesis.id equals the funnel synthesis id (1:1 cache key)", synthesis.id === funnelSynthesis.id);
check("synthesis.dealId carried from the funnel", synthesis.dealId === funnelSynthesis.dealId);
check(
  "synthesis.sourceFunnelSynthesisId equals the funnel id",
  synthesis.sourceFunnelSynthesisId === funnelSynthesis.id
);
check(
  "businessName defaults to DEFAULT_GOOGLE_ADS_BUSINESS_NAME",
  synthesis.businessName === DEFAULT_GOOGLE_ADS_BUSINESS_NAME
);
check(
  "headline is capped at GOOGLE_ADS_HEADLINE_MAX",
  synthesis.headline.length <= GOOGLE_ADS_HEADLINE_MAX,
  `got ${synthesis.headline.length} chars`
);
check(
  "headline sourced from the lead carousel card (card 0, not card 1)",
  synthesis.headline === capGoogleAdsText(funnelSynthesis.carousel.cards[0].headline, GOOGLE_ADS_HEADLINE_MAX)
);
check(
  "longHeadline is capped at GOOGLE_ADS_LONG_HEADLINE_MAX",
  synthesis.longHeadline.length <= GOOGLE_ADS_LONG_HEADLINE_MAX,
  `got ${synthesis.longHeadline.length} chars`
);
check(
  "description is capped at GOOGLE_ADS_DESCRIPTION_MAX and sourced from the landing hero subhead",
  synthesis.description.length <= GOOGLE_ADS_DESCRIPTION_MAX &&
    synthesis.description === capGoogleAdsText(funnelSynthesis.landingPage.heroSubhead, GOOGLE_ADS_DESCRIPTION_MAX)
);
check("seeds exactly 2 image slots", synthesis.images.length === 2);
check(
  "image slots are landscape_1_91x1 and square_1x1",
  synthesis.images.some((img) => img.aspect === "landscape_1_91x1") &&
    synthesis.images.some((img) => img.aspect === "square_1x1")
);
check(
  "both image slots start pending with no imageUrl",
  synthesis.images.every((img) => img.status === "pending" && !img.imageUrl)
);
check(
  "default prompt template is the multi-image composite flyer prompt",
  /multi-image ad flyer/i.test(synthesis.promptTemplate)
);
check(
  "default prompt template relies on the negation rules panel (not its own wording) to keep text off the image",
  !/no text or words rendered in the image/i.test(synthesis.promptTemplate)
);

// ── description falls back to the lead card's primaryText when heroSubhead is absent ──

const funnelNoSubhead: DealFunnelSynthesis = {
  ...funnelSynthesis,
  landingPage: { ...funnelSynthesis.landingPage, heroSubhead: "" },
};
const fallbackSynthesis = buildDealGoogleAdsSynthesis(funnelNoSubhead);
check(
  "description falls back to the lead card's primaryText when heroSubhead is empty",
  fallbackSynthesis.description === capGoogleAdsText(funnelSynthesis.carousel.cards[0].primaryText, GOOGLE_ADS_DESCRIPTION_MAX)
);

// ── buildDealGoogleAdsSynthesis throws on a funnel with no carousel cards ──────

let threwOnEmptyCarousel = false;
try {
  buildDealGoogleAdsSynthesis({ ...funnelSynthesis, carousel: { cards: [], warnings: [] } });
} catch {
  threwOnEmptyCarousel = true;
}
check("buildDealGoogleAdsSynthesis throws when the funnel has no carousel cards", threwOnEmptyCarousel);

// ── useDealGoogleAdsGalleryImage ──────────────────────────────────────────────

const galleryPhotoUrl = "https://img.example/gallery/cabins-0.jpg";
const galleryAsset = useDealGoogleAdsGalleryImage(synthesis, "square_1x1", galleryPhotoUrl);
check("gallery image assigns the candidate's URL", galleryAsset.imageUrl === galleryPhotoUrl);
check("gallery image is tagged generator gallery_photo", galleryAsset.generator === "gallery_photo");
check("gallery image has no promptUsed (no AI call)", galleryAsset.promptUsed === undefined);
check("gallery image status is ready", galleryAsset.status === "ready");
check(
  "assigning a gallery photo to a slot with no prior image leaves previousImages empty",
  (galleryAsset.previousImages ?? []).length === 0
);

const synthesisWithGenerated: DealGoogleAdsSynthesis = {
  ...synthesis,
  images: synthesis.images.map((img) =>
    img.aspect === "square_1x1"
      ? { ...img, status: "ready", imageUrl: "https://r2.example/generated.png", generator: "gpt_image_2" }
      : img
  ),
};
const galleryOverGenerated = useDealGoogleAdsGalleryImage(synthesisWithGenerated, "square_1x1", galleryPhotoUrl);
check(
  "switching from a generated image to a gallery photo preserves the generated one in previousImages",
  (galleryOverGenerated.previousImages ?? []).some(
    (entry) => entry.imageUrl === "https://r2.example/generated.png" && entry.generator === "gpt_image_2"
  )
);

let threwOnUnknownAspect = false;
try {
  useDealGoogleAdsGalleryImage(synthesis, "missing_aspect" as never, galleryPhotoUrl);
} catch {
  threwOnUnknownAspect = true;
}
check("useDealGoogleAdsGalleryImage throws on an unknown aspect", threwOnUnknownAspect);

// ── capGoogleAdsText ──────────────────────────────────────────────────────────

check("capGoogleAdsText leaves under-length text untouched", capGoogleAdsText("Short headline", 30) === "Short headline");
check(
  "capGoogleAdsText caps over-length text and trims trailing whitespace from the cut",
  capGoogleAdsText("This headline is definitely too long to fit", 20) ===
    "This headline is def".trimEnd()
);

// ── interpolateGoogleAdsPrompt ───────────────────────────────────────────────

const interpolated = interpolateGoogleAdsPrompt(synthesis.promptTemplate, synthesis);
check("interpolated prompt contains the headline", interpolated.includes(synthesis.headline));
check("interpolated prompt contains the long headline", interpolated.includes(synthesis.longHeadline));
check(
  "interpolated prompt has no leftover {{...}} placeholders",
  !/\{\{[A-Z_]+\}\}/.test(interpolated)
);

// ── cache upsert + validation ────────────────────────────────────────────────

const emptyCache = emptyDealGoogleAdsSynthesisCache(GEN_AT);
check("empty cache validates", validateDealGoogleAdsSynthesisCache(emptyCache).ok);

const cacheWithOne = upsertDealGoogleAdsSynthesis(emptyCache, synthesis);
check("upsert adds the synthesis", cacheWithOne.syntheses.length === 1);

const updatedSynthesis: DealGoogleAdsSynthesis = { ...synthesis, headline: "Edited Headline" };
const cacheAfterReupsert = upsertDealGoogleAdsSynthesis(cacheWithOne, updatedSynthesis);
check(
  "re-upserting the same id replaces rather than duplicates",
  cacheAfterReupsert.syntheses.length === 1 && cacheAfterReupsert.syntheses[0].headline === "Edited Headline"
);
check("well-formed cache passes validation", validateDealGoogleAdsSynthesisCache(cacheAfterReupsert).ok);

const malformedCache = {
  ...cacheAfterReupsert,
  syntheses: [{ ...synthesis, images: [synthesis.images[0]] }], // only 1 of 2 required slots
};
const malformedResult = validateDealGoogleAdsSynthesisCache(malformedCache);
check("cache with wrong image-slot count fails validation", !malformedResult.ok);

// ── summary ───────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed.`);
if (failed > 0) {
  process.exit(1);
}
