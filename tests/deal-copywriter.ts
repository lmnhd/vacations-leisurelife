/**
 * Deal Copywriter proof artifact: unified manifest → direct-response ad copy.
 *
 * Asserts:
 *   1. assembleDealUnifiedManifest carries BOTH halves (creative brief + inventory).
 *   2. generateDealAdCopy produces ad copy with generator "gpt" + aiTrace + variants.
 *   3. Each variant has headline/body/CTA + targeting hooks.
 *   4. validateAdCopyVoice flags a banned word injected into a variant.
 *   5. A promoApplied id not in the unified manifest is remapped to "none" + reported.
 *   6. Cache upsert idempotent; validators accept good ad copy + reject empty-variant.
 *
 * Run:
 *   npm run test:deal-copywriter
 */

import {
  assembleDealUnifiedManifest,
  emptyDealAdCopyCache,
  generateDealAdCopy,
  selectDealAdCopyVariant,
  upsertDealAdCopy,
  validateAdCopyVoice,
  validateDealAdCopyCache,
  withSelectedVariantPrimary,
  type CbPromoIntelligenceRecord,
  type DealDiscoveryIdea,
  type DealTripManifest,
} from "../lib/cb/deals-system";
import { installDealsAiStub } from "./deals-ai-stub";

installDealsAiStub();

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

const GEN_AT = "2026-06-10T00:00:00.000Z";

const angle: DealDiscoveryIdea = {
  id: "angle-write-the-wake",
  generatedAtIso: GEN_AT,
  generator: "gpt",
  isolatedNiche: "The Solo Journaling Tabletop Roleplayer",
  researchRationale:
    "Workbench or discovery evidence pointed to analog journaling, solo RPG, and quiet-luxury repositioning cues as the best-fit overlap.",
  successLogic:
    "This audience responds when the sailing feels like a private creative tool rather than a generic vacation, especially on long sea-day itineraries.",
  audienceSignals: [
    "Targeting seeds center solo rpg journaling, Leuchtturm1917 notebooks, and polyhedral dice culture.",
    "Long sea-day repositioning routes align with buyers who want quiet time and private writing space.",
    "Balcony-forward premium cabins matter more here than generic family-ship entertainment.",
  ],
  sailingAngleProfile: {
    sailingAngleTitle: "Roll the Dice, Write the Wake",
    theCorePitch: "Your campaign has been stuck for two months because the house won't stop interrupting you.",
    visualAnchor: "A worn Leuchtturm1917 journal open on a teak balcony table at golden hour.",
    targetAudienceDescriptor: "Introverted writers and analog gamers, 25-45, knowledge-work professions.",
    relevantKeywords: ["solo rpg journaling", "Thousand Year Old Vampire", "polyhedral dice set"],
    destinationAndTimeOfYearHints: "Transatlantic repositioning, late autumn through post-holiday winter 2026.",
    onboardAssetRequirements: "High balcony ratio, a genuinely quiet library, low-traffic lounges.",
  },
  groundedCandidate: {
    resolvedAtIso: GEN_AT,
    packageId: "1500001",
    cruiseName: "Celebrity Edge Transatlantic Crossing",
    cruiseLine: "Celebrity",
    sailDateIso: "2026-11-08",
    nights: 14,
    departurePortCode: "FLL",
    portsOfCall: "Ponta Delgada, Funchal",
    confidence: 0.9,
    reasons: ["date match", "line match"],
  },
};

const tripManifest: DealTripManifest = {
  id: "manifest-roll-the-dice-celebrity",
  generatedAtIso: GEN_AT,
  generator: "gpt",
  sourceAngleId: angle.id,
  isolatedNiche: angle.isolatedNiche,
  sailingAngleTitle: angle.sailingAngleProfile.sailingAngleTitle,
  assembleDraft: {
    suggestedDealId: "deal-celebrity-transatlantic-write-the-wake",
    suggestedBriefId: "brief-roll-the-dice-write-the-wake",
    cruiseLine: "Celebrity Cruises",
    shipClassHint: "Edge class",
    itineraryName: "Transatlantic Westbound Repositioning",
    destination: "Transatlantic",
    nights: 14,
    sailWindow: { earliestIso: "2026-11-01", latestIso: "2027-01-31", rationale: "Late-autumn / post-holiday." },
    departurePortHint: "Fort Lauderdale",
    portsOfCall: ["Ponta Delgada", "Funchal", "Lisbon"],
  },
  appliedPromos: [
    {
      promoRecordId: "cbpromo-test",
      status: "likely_applicable",
      matchedOn: ["vendor", "sail window"],
      assumptions: ["select cabins"],
      warnings: [],
    },
  ],
  promoStrategy: "Onboard credit reframed as a Dice-and-Ink fund; balcony savings unlock the writing carrel.",
  manifestReasoning: "14-night repositioning delivers 8-10 consecutive sea days; Edge-class balcony ratio fits.",
  lookupQuery: {
    line: "Celebrity Cruises",
    ship: "Edge class",
    destination: "Transatlantic",
    date: "2026-11-15",
    nights: 14,
    port: "Fort Lauderdale",
    windowDays: 60,
  },
  targetingSeeds: {
    inferredMarket: "US",
    geoFocus: ["Fort Lauderdale", "Transatlantic travel"],
    personaSignals: ["solo journaling rpg buyers", "quiet-luxury cruise shoppers"],
    metaInterestSeeds: ["solo rpg journaling", "Leuchtturm1917 notebooks", "balcony cabins"],
    metaBehaviorSignals: ["saves slow-travel inspiration", "engages with niche hobby identity content"],
    excludedAudienceSignals: ["Avoid broad cruise-interest targeting as the only audience."],
  },
};

const promoRecord: CbPromoIntelligenceRecord = {
  id: "cbpromo-test",
  source: "cb_agent_tools_todays_view",
  sourceUrl: "https://www.cbagenttools.com/marketing/todaysview/",
  detailUrl: "https://www.cbagenttools.com/marketing/promotion/test/",
  capturedAtIso: GEN_AT,
  title: "Celebrity Summer Sale",
  vendor: "Celebrity Cruises",
  bookingWindow: {
    startsOn: "2026-06-02",
    endsOn: "2026-07-27",
    rawText: "Book June 2 through July 27, 2026.",
  },
  sailingWindow: {
    startsOn: "2026-06-03",
    endsOn: "2028-05-10",
    rawText: "Select sailings June 3, 2026 through May 10, 2028.",
  },
  promotionDetailsRaw: "Up to 75% off the second guest on qualifying rates.",
  agentInstructionsRaw: "Qualify all claims and verify live availability.",
  keyFeaturesRaw: "Premium cruise experience.",
  applicableSailingsRaw: "Select Celebrity sailings.",
  applicableProductsRaw: "Most products except Galapagos.",
  applicableMarketsRaw: "US and participating markets.",
  supportingFiles: [],
  extracted: {
    offerTypes: ["second_guest_discount", "onboard_credit"],
    percentDiscounts: [
      {
        appliesTo: "second guest",
        percentOff: 75,
        depositType: "non_refundable",
        rawText: "75% off second guest on non-refundable deposit rates.",
      },
    ],
    dollarSavings: [],
    onboardCredits: [
      {
        amountUsd: 600,
        appliesTo: "per stateroom",
        voyageLength: "6_plus_nights",
        cabinCategory: "Sky Suite and above",
        bookingDayWindow: "Thursday",
        rawText: "Up to $600 onboard credit per stateroom on Thursday.",
      },
    ],
    freeGuestOffers: [],
    combinability: { rawRules: [] },
    exclusions: ["Galapagos"],
    applicableProducts: ["Celebrity ocean cruises"],
    applicableMarkets: ["US"],
  },
  marketingUse: {
    publicClaimsAllowed: ["Second guest savings are available on select sailings."],
    publicClaimsNeedsQualifier: ["Up to 75% off the second guest on qualifying rates."],
    agentOnlyNotes: ["Verify deposit type."],
    suggestedAngles: ["Use the second-guest offer for couples."],
    cautionFlags: ["Savings depend on rate and stateroom category."],
    bestMatchedDealBriefs: [],
    visitorFriendlySummary: "Select Celebrity sailings may include second-guest savings.",
  },
  diagnostics: {
    status: "succeeded",
    notes: [],
    warnings: [],
  },
};

async function main(): Promise<void> {
  console.log("Deal Copywriter - unified manifest → ad copy\n");

  // --- Unify (deterministic) -------------------------------------------------
  console.log("Unified manifest:");
  const unified = assembleDealUnifiedManifest(angle, tripManifest, {
    generatedAtIso: GEN_AT,
    promoRecords: [promoRecord],
  });
  check("unified carries the creative brief angle", unified.creativeBrief.angle.sailingAngleTitle === angle.sailingAngleProfile.sailingAngleTitle);
  check("unified carries the isolated niche", unified.creativeBrief.isolatedNiche === angle.isolatedNiche);
  check("unified carries research rationale", unified.creativeBrief.researchRationale === angle.researchRationale);
  check("unified carries success logic", unified.creativeBrief.successLogic === angle.successLogic);
  check("unified carries audience signals", (unified.creativeBrief.audienceSignals ?? []).length === angle.audienceSignals?.length);
  check("unified carries the inventory draft", unified.inventoryManifest.assembleDraft.cruiseLine === "Celebrity Cruises");
  check(
    "unified carries targeting seeds",
    unified.inventoryManifest.targetingSeeds?.metaInterestSeeds.includes("solo rpg journaling") === true
  );
  check("unified carries the applied promos", unified.inventoryManifest.appliedPromos.length === 1);
  check(
    "unified carries public-safe promotion claims",
    unified.inventoryManifest.promotionBriefs[0]?.publicClaimsAllowed.length === 1
  );
  check("unified id derives from the manifest", unified.id === `unified-${tripManifest.id}`);

  // --- Copywriter ------------------------------------------------------------
  console.log("\nAd copy generation:");
  let missingPromoContextRejected = false;
  try {
    await generateDealAdCopy({
      unifiedManifest: assembleDealUnifiedManifest(angle, tripManifest, {
        generatedAtIso: GEN_AT,
      }),
      variantCount: 2,
      generatedAtIso: GEN_AT,
    });
  } catch {
    missingPromoContextRejected = true;
  }
  check(
    "applicable promo without its source record fails closed",
    missingPromoContextRejected
  );

  const { adCopy, rejectedPromoIds } = await generateDealAdCopy({
    unifiedManifest: unified,
    variantCount: 2,
    generatedAtIso: GEN_AT,
  });

  check("ad copy generator is gpt", adCopy.generator === "gpt");
  check("ad copy has aiTrace", Boolean(adCopy.aiTrace && adCopy.aiTrace.model.length > 0));
  check("ad copy points at the unified manifest", adCopy.sourceUnifiedManifestId === unified.id);
  check("ad copy has at least one variant", adCopy.variants.length >= 1);
  check("every variant has headline/body/CTA", adCopy.variants.every((v) => v.headline && v.bodyCopy && v.callToAction));
  check("every variant has targeting hooks", adCopy.variants.every((v) => v.adPlatformTargetingHooks.interestKeywords.length > 0));
  check("primary variant references the real promo", adCopy.variants.some((v) => v.promoApplied === "cbpromo-test"));

  // --- Promo id validation ---------------------------------------------------
  console.log("\nPromo id validation:");
  check("hallucinated promo id was remapped to none + reported", rejectedPromoIds.includes("cbpromo-FAKE"));
  check("no variant keeps a promo id outside the manifest", adCopy.variants.every((v) => v.promoApplied === "none" || v.promoApplied === "cbpromo-test"));

  // --- Voice validation ------------------------------------------------------
  console.log("\nVoice validation:");
  const cleanWarnings = validateAdCopyVoice(adCopy.variants[0]);
  check("clean variant has no voice warnings", cleanWarnings.length === 0, cleanWarnings.join(", "));
  const dirty = validateAdCopyVoice({
    headline: "Escape to paradise",
    bodyCopy: "A breathtaking group cruise.",
    callToAction: "Unwind now",
  });
  check("voice check flags banned vocabulary", dirty.length >= 3, dirty.join(", "));

  // --- Variant selection -----------------------------------------------------
  console.log("\nVariant selection (operator picks the final ad):");
  check("ad copy starts with no explicit selection", adCopy.selectedVariantIndex === undefined);

  let selCache = upsertDealAdCopy(emptyDealAdCopyCache(GEN_AT), adCopy);
  selCache = selectDealAdCopyVariant(selCache, adCopy.id, 1);
  const selected = selCache.adCopies.find((a) => a.id === adCopy.id)!;
  check("selecting variant 1 persists selectedVariantIndex", selected.selectedVariantIndex === 1);
  check("selection cache still validates", validateDealAdCopyCache(selCache).ok);

  let threw = false;
  try {
    selectDealAdCopyVariant(selCache, adCopy.id, 99);
  } catch {
    threw = true;
  }
  check("selecting an out-of-range variant throws", threw);

  // Assembly promotes the selected variant to primary (index 0).
  const promoted = withSelectedVariantPrimary(selected);
  check(
    "selected variant is promoted to primary slot",
    promoted.variants[0].headline === adCopy.variants[1].headline
  );
  check(
    "promoted primaryPromoApplied tracks the chosen variant",
    promoted.primaryPromoApplied === adCopy.variants[1].promoApplied
  );
  check("promotion keeps every variant (none dropped)", promoted.variants.length === adCopy.variants.length);
  check(
    "no selection is a no-op for assembly ordering",
    withSelectedVariantPrimary(adCopy).variants[0].headline === adCopy.variants[0].headline
  );

  // --- Cache validation ------------------------------------------------------
  console.log("\nCache upsert + validation:");
  let cache = emptyDealAdCopyCache(GEN_AT);
  cache = upsertDealAdCopy(cache, adCopy);
  cache = upsertDealAdCopy(cache, adCopy);
  check("upsert is idempotent on id", cache.adCopies.length === 1);
  cache = upsertDealAdCopy(cache, {
    ...adCopy,
    id: `${adCopy.id}-rewrite`,
    campaignName: `${adCopy.campaignName} rewrite`,
  });
  check("upsert replaces older copy for the same unified manifest", cache.adCopies.length === 1);
  check("upsert keeps the latest rewritten ad copy", cache.adCopies[0].id === `${adCopy.id}-rewrite`);
  check("validator accepts the ad copy cache", validateDealAdCopyCache(cache).ok);

  const emptyVariant = {
    ...cache,
    adCopies: [{ ...adCopy, variants: [] }],
  };
  check("validator rejects ad copy with no variants", !validateDealAdCopyCache(emptyVariant).ok);

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
