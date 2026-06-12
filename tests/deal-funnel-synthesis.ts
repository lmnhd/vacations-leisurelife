/**
 * Deal Funnel Synthesis proof artifact (Step 7): ad copy → landing page + carousel.
 *
 * Asserts:
 *   1. generateDealFunnelSynthesis splits one ad-copy variant into a broad landing
 *      page (5 ordered ship segments + hero) AND a hyper-niche carousel.
 *   2. generator "gpt" + aiTrace + sourceAdCopyId carried.
 *   3. Carousel char-limit validator WARNS (does not truncate) on an over-length card.
 *   4. Landing broad-appeal validator flags niche jargon.
 *   5. SERP image search maps results to candidates (test-seamed, offline).
 *   6. Image selection (gallery/hero/segment) persists + rejects unknown ids.
 *   7. Cache upsert idempotent; validator accepts good + rejects empty-segments.
 *
 * Run:
 *   npm run test:deal-funnel-synthesis
 */

import {
  buildDealImageQuery,
  emptyDealFunnelSynthesisCache,
  generateDealFunnelSynthesis,
  searchDealImagesAllCategories,
  searchDealImagesByCategory,
  setDealFunnelImageSelection,
  upsertDealFunnelSynthesis,
  validateCarouselCard,
  validateDealFunnelSynthesisCache,
  validateLandingBroadAppeal,
  __setDealImageSearchForTests,
  type DealAdCopy,
} from "../lib/cb/deals-system";
import { installDealsAiStub } from "./deals-ai-stub";

installDealsAiStub();

// Offline SERP stub. Returns query-UNIQUE urls so the diversified (all-category)
// pool doesn't collapse during de-dup — each category's query yields its own images.
function slugStub(q: string): string {
  return q.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}
__setDealImageSearchForTests(async (query: string, count = 16) => ({
  results: Array.from({ length: Math.min(count, 6) }, (_, i) => ({
    title: `${query} ${i}`,
    imageUrl: `https://img.example/${slugStub(query)}/${i}.jpg`,
    thumbnailUrl: `https://img.example/${slugStub(query)}/${i}-thumb.jpg`,
    contextUrl: `https://src.example/${slugStub(query)}/${i}`,
    width: 1200,
    height: 800,
  })),
  query,
  totalResults: count,
}));

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

const GEN_AT = "2026-06-11T00:00:00.000Z";

const adCopy: DealAdCopy = {
  id: "adcopy-roll-the-dice",
  generatedAtIso: GEN_AT,
  generator: "gpt",
  sourceUnifiedManifestId: "unified-manifest-roll-the-dice",
  campaignName: "Roll the Dice, Write the Wake",
  targetAudienceTag: "Solo Journaling Tabletop Roleplayers",
  primaryPromoApplied: "cbpromo-2837",
  selectedVariantIndex: 0,
  variants: [
    {
      promoApplied: "cbpromo-2837",
      variantLabel: "Primary Retail",
      headline: "Prompt 34 Has Been Waiting Two Months.",
      bodyCopy: "Your Thousand Year Old Vampire campaign stalled because land life won't stop interrupting you.",
      pricingDisclaimers: "Select sailings apply. Verified at live lookup.",
      callToAction: "Search Celebrity transatlantic repositioning sailings.",
      adPlatformTargetingHooks: {
        demographicTargeting: "Adults 25-45, creative professionals.",
        interestKeywords: ["solo rpg journaling", "polyhedral dice set", "Leuchtturm1917"],
      },
      voiceWarnings: [],
    },
  ],
};

async function main(): Promise<void> {
  console.log("Deal Funnel Synthesis - ad copy → landing page + carousel\n");

  // --- Synthesis -------------------------------------------------------------
  console.log("Synthesis:");
  const { synthesis } = await generateDealFunnelSynthesis({
    adCopy,
    candidates: [],
    generatedAtIso: GEN_AT,
  });
  check("generator is gpt", synthesis.generator === "gpt");
  check("aiTrace present", Boolean(synthesis.aiTrace && synthesis.aiTrace.model.length > 0));
  check("points at the source ad copy", synthesis.sourceAdCopyId === adCopy.id);
  check("landing page has 5 ship segments", synthesis.landingPage.segments.length === 5);
  check(
    "segments are in canonical order",
    synthesis.landingPage.segments.map((s) => s.segment).join(",") ===
      "cabins,lounges,atrium,dining,excursions"
  );
  check("landing hero headline present", synthesis.landingPage.heroHeadline.length > 0);
  check("carousel has 4 cards", synthesis.carousel.cards.length === 4);

  // --- Validation: carousel length (warn, not truncate) ----------------------
  console.log("\nValidators (warn, never truncate):");
  check(
    "over-length carousel card produces a warning",
    synthesis.carousel.warnings.length >= 1,
    `warnings: ${synthesis.carousel.warnings.join("; ")}`
  );
  const longCard = validateCarouselCard(
    { headline: "x".repeat(50), primaryText: "y".repeat(200) },
    0
  );
  check("validateCarouselCard flags both fields", longCard.length === 2, longCard.join(", "));
  const okCard = validateCarouselCard({ headline: "Short", primaryText: "Fine." }, 0);
  check("validateCarouselCard passes a compliant card", okCard.length === 0);

  // --- Validation: landing broad appeal --------------------------------------
  check(
    "landing copy did not leak obvious jargon (stub is clean)",
    synthesis.landingPage.warnings.length === 0,
    synthesis.landingPage.warnings.join("; ")
  );
  check(
    "validateLandingBroadAppeal flags injected jargon",
    validateLandingBroadAppeal("A great cabin for your vampire RPG dice.").length >= 1
  );

  // --- SERP image search (categorized + diversified) -------------------------
  console.log("\nSERP image sourcing:");
  const facts = { cruiseLine: "Celebrity", shipClassHint: "Edge", destination: "Transatlantic" };
  check(
    "hero query appends category terms + destination",
    buildDealImageQuery(facts, "hero").startsWith("Celebrity Edge Transatlantic") &&
      buildDealImageQuery(facts, "hero").includes("exterior")
  );
  check(
    "cabins query specializes WITHOUT destination",
    buildDealImageQuery(facts, "cabins").includes("stateroom") &&
      !buildDealImageQuery(facts, "cabins").includes("Transatlantic")
  );
  check(
    "category queries differ across sections",
    buildDealImageQuery(facts, "cabins") !== buildDealImageQuery(facts, "dining")
  );

  const cabinsOnly = await searchDealImagesByCategory(facts, "cabins");
  check("single-category search returns candidates", cabinsOnly.candidates.length > 0);
  check("single-category candidates are tagged cabins", cabinsOnly.candidates.every((c) => c.category === "cabins"));
  check("candidates carry serpapi provenance", cabinsOnly.candidates.every((c) => c.provenance === "serpapi_search"));

  const pool = await searchDealImagesAllCategories(facts);
  const cats = new Set(pool.candidates.map((c) => c.category));
  check("diversified pool spans multiple categories", cats.size >= 5, `categories: ${[...cats].join(",")}`);
  check("per-category diagnostics returned", pool.perCategory.length >= 5);
  check(
    "pool has a cabins image AND a dining image",
    pool.candidates.some((c) => c.category === "cabins") &&
      pool.candidates.some((c) => c.category === "dining")
  );

  // --- Image selection --------------------------------------------------------
  console.log("\nImage selection:");
  const withImages = { ...synthesis, candidates: pool.candidates };
  let cache = upsertDealFunnelSynthesis(emptyDealFunnelSynthesisCache(GEN_AT), withImages);

  const heroCand = pool.candidates.find((c) => c.category === "hero")!;
  const cabinCand = pool.candidates.find((c) => c.category === "cabins")!;
  cache = setDealFunnelImageSelection(cache, synthesis.id, {
    galleryIds: [heroCand.id, cabinCand.id],
    heroImageId: heroCand.id,
    segmentImageIds: { cabins: cabinCand.id },
  });
  const saved = cache.syntheses.find((s) => s.id === synthesis.id)!;
  check("gallery persisted", saved.galleryIds.length === 2);
  check("hero persisted", saved.heroImageId === heroCand.id);
  check(
    "cabins segment got a cabins-category image",
    saved.landingPage.segments.find((s) => s.segment === "cabins")?.imageId === cabinCand.id
  );

  let threw = false;
  try {
    setDealFunnelImageSelection(cache, synthesis.id, { heroImageId: "img-does-not-exist" });
  } catch {
    threw = true;
  }
  check("selecting an unknown image id throws", threw);

  // --- Cache validation -------------------------------------------------------
  console.log("\nCache validation:");
  cache = upsertDealFunnelSynthesis(cache, saved);
  check("upsert idempotent on id", cache.syntheses.length === 1);
  check("validator accepts the cache", validateDealFunnelSynthesisCache(cache).ok);

  const emptySegments = {
    ...cache,
    syntheses: [{ ...saved, landingPage: { ...saved.landingPage, segments: [] } }],
  };
  check("validator rejects empty-segment landing page", !validateDealFunnelSynthesisCache(emptySegments).ok);

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
