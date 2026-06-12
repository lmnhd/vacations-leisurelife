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
  sailingAngleProfile: {
    sailingAngleTitle: "Roll the Dice, Write the Wake",
    theCorePitch: "Your campaign has been stuck for two months because the house won't stop interrupting you.",
    visualAnchor: "A worn Leuchtturm1917 journal open on a teak balcony table at golden hour.",
    targetAudienceDescriptor: "Introverted writers and analog gamers, 25-45, knowledge-work professions.",
    relevantKeywords: ["solo rpg journaling", "Thousand Year Old Vampire", "polyhedral dice set"],
    destinationAndTimeOfYearHints: "Transatlantic repositioning, late autumn through post-holiday winter 2026.",
    onboardAssetRequirements: "High balcony ratio, a genuinely quiet library, low-traffic lounges.",
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
};

async function main(): Promise<void> {
  console.log("Deal Copywriter - unified manifest → ad copy\n");

  // --- Unify (deterministic) -------------------------------------------------
  console.log("Unified manifest:");
  const unified = assembleDealUnifiedManifest(angle, tripManifest, { generatedAtIso: GEN_AT });
  check("unified carries the creative brief angle", unified.creativeBrief.angle.sailingAngleTitle === angle.sailingAngleProfile.sailingAngleTitle);
  check("unified carries the isolated niche", unified.creativeBrief.isolatedNiche === angle.isolatedNiche);
  check("unified carries the inventory draft", unified.inventoryManifest.assembleDraft.cruiseLine === "Celebrity Cruises");
  check("unified carries the applied promos", unified.inventoryManifest.appliedPromos.length === 1);
  check("unified id derives from the manifest", unified.id === `unified-${tripManifest.id}`);

  // --- Copywriter ------------------------------------------------------------
  console.log("\nAd copy generation:");
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
