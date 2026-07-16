import {
  assertSupportedPublicClaims,
  buildDealAdCopyId,
  deleteDealTripManifestRecord,
  getDealTripManifest,
  listDealFunnelSyntheses,
  loadDealAdCopyCache,
  loadDealUnifiedManifestsCache,
  saveDealAdCopyCache,
  saveDealUnifiedManifestsCache,
  removeDealAdCopy,
  upsertDealAdCopy,
  upsertDealFunnelSynthesisRecord,
  validateAdCopyVoice,
  type DealAdCopy,
  type DealAdVariant,
} from "../../lib/cb/deals-system";

const DEAL_ID = "1640418";
const SOURCE_MANIFEST_ID = "unified-manifest-1640418-your-8-night-january-reset";
const LEGACY_TRIP_MANIFEST_ID =
  "manifest-1640418-your-8-night-january-reset-4-countries-zero-kids-one-incredible-ship";
const LEGACY_UNIFIED_MANIFEST_ID = `unified-${LEGACY_TRIP_MANIFEST_ID}`;
const LEGACY_AD_COPY_ID =
  "adcopy-1640418-your-8-night-january-reset-resilient-lady-2027-01-16";
const DOSSIER_PATH =
  ".github/DOCS/Implementation/DEALS_STRATEGY/LIVE_DEAL_DATA_WORK_DIRECTORY/WINTER_CRUISE_SENTIMENT_DOSSIER_DEC_2026_JAN_2027.md";

function finishVariant(
  variant: Omit<DealAdVariant, "voiceWarnings">
): DealAdVariant {
  return {
    ...variant,
    voiceWarnings: validateAdCopyVoice(variant),
  };
}

async function main(): Promise<void> {
  const unifiedCache = loadDealUnifiedManifestsCache();
  const unified = unifiedCache.manifests.find(
    (manifest) => manifest.id === SOURCE_MANIFEST_ID
  );
  if (!unified) {
    throw new Error(`Unified manifest ${SOURCE_MANIFEST_ID} was not found.`);
  }

  const variants: DealAdVariant[] = [
    finishVariant({
      promoApplied: "none",
      variantLabel: "Primary - Your January Reset",
      headline: "Your 8-Night January Reset",
      bodyCopy:
        "Winter has been going on long enough. Trade one cold week for eight adults-only nights aboard Resilient Lady, sailing roundtrip from Miami on January 16, 2027.\n\nThe reset has a real shape: Costa Maya, Roatan, Belize City, Cozumel and Bimini, with two sea days to stop watching the clock and start feeling like the year belongs to you again.\n\nThis is not a rushed weekend away. It is eight nights for couples and friends who want a genuine break after the holidays - long enough to change the rhythm, specific enough to plan with confidence.\n\nSee the full itinerary and decide whether this is the January reset you have been waiting for.",
      pricingDisclaimers:
        "Itinerary and sailing details are subject to change. Review current stateroom options, pricing, taxes, fees and availability before booking.",
      callToAction: "View the January 16 sailing",
      adPlatformTargetingHooks: {
        demographicTargeting:
          "US adults ages 30-55, couples and friend groups planning a meaningful post-holiday winter trip",
        interestKeywords: [
          "January winter reset",
          "adults-only Caribbean cruise",
          "January 2027 cruise from Miami",
          "winter cruise for couples",
          "Virgin Voyages",
          "Resilient Lady",
          "eight-night Caribbean cruise",
          "Western Caribbean cruise",
        ],
      },
    }),
    finishVariant({
      promoApplied: "none",
      variantLabel: "Variant B - The Grown-Up Winter Break",
      headline: "Take the Grown-Up Winter Break",
      bodyCopy:
        "By mid-January, the holidays are over, routine is back and winter still has a long way to go. That is exactly when eight adults-only nights from Miami start to feel less like another vacation idea and more like a reset button.\n\nResilient Lady sails January 16, 2027, on a route through Costa Maya, Roatan, Belize City, Cozumel and Bimini, with two sea days built into the eight-night itinerary.\n\nBring your partner or your favorite people. Let the week become something bigger than another quick getaway: new places ahead, room to slow down and a real date on the calendar to look forward to.\n\nWinter break can be for grown-ups too.",
      pricingDisclaimers:
        "Itinerary and sailing details are subject to change. Review current stateroom options, pricing, taxes, fees and availability before booking.",
      callToAction: "See the full itinerary",
      adPlatformTargetingHooks: {
        demographicTargeting:
          "US adults ages 30-55, couples, close friends and adult travelers seeking a longer winter break",
        interestKeywords: [
          "grown-up winter break",
          "adults-only cruise",
          "couples Caribbean cruise",
          "Virgin Voyages Resilient Lady",
          "January cruise from Miami",
          "post-holiday vacation",
          "Bimini cruise",
          "Western Caribbean itinerary",
        ],
      },
    }),
  ];

  assertSupportedPublicClaims(unified, variants);
  const voiceWarnings = variants.flatMap((variant) => variant.voiceWarnings);
  if (voiceWarnings.length > 0) {
    throw new Error(`Curated copy failed voice review: ${voiceWarnings.join("; ")}`);
  }

  const generatedAtIso = new Date().toISOString();
  const existingAdCopyCache = loadDealAdCopyCache();
  const existingCanonicalAdCopy = existingAdCopyCache.adCopies.find(
    (existing) => existing.id === buildDealAdCopyId(DEAL_ID, "Your 8-Night January Reset")
  );
  const legacyAdCopy = existingAdCopyCache.adCopies.find(
    (existing) => existing.id === LEGACY_AD_COPY_ID
  );
  const preservedSelection =
    legacyAdCopy?.selectedVariantIndex ?? existingCanonicalAdCopy?.selectedVariantIndex;
  const adCopy: DealAdCopy = {
    id: buildDealAdCopyId(DEAL_ID, "Your 8-Night January Reset"),
    generatedAtIso,
    generator: "operator_curated",
    sourceUnifiedManifestId: SOURCE_MANIFEST_ID,
    campaignName: "Your 8-Night January Reset - Resilient Lady - 2027-01-16",
    targetAudienceTag:
      "US adults and couples seeking a meaningful post-holiday winter reset",
    primaryPromoApplied: "none",
    variants,
    selectedVariantIndex: preservedSelection,
    editorialNote:
      "Directly curated from the approved sentiment dossier after model output flattened the emotional January Reset angle and added unsupported claims.",
    sourceResearchPaths: [DOSSIER_PATH],
  };

  const legacyManifest = await getDealTripManifest(LEGACY_TRIP_MANIFEST_ID);
  if (legacyManifest) {
    await deleteDealTripManifestRecord(LEGACY_TRIP_MANIFEST_ID);
  }

  const manifests = unifiedCache.manifests.filter(
    (manifest) => manifest.id !== LEGACY_UNIFIED_MANIFEST_ID
  );
  if (manifests.length !== unifiedCache.manifests.length) {
    saveDealUnifiedManifestsCache({
      ...unifiedCache,
      generatedAtIso,
      manifests,
    });
  }

  const legacyFunnels = (await listDealFunnelSyntheses()).filter(
    (synthesis) => synthesis.sourceAdCopyId === LEGACY_AD_COPY_ID
  );
  for (const synthesis of legacyFunnels) {
    await upsertDealFunnelSynthesisRecord({
      ...synthesis,
      sourceAdCopyId: adCopy.id,
    });
  }

  let adCopyCache = upsertDealAdCopy(existingAdCopyCache, adCopy);
  adCopyCache = removeDealAdCopy(adCopyCache, LEGACY_AD_COPY_ID);
  saveDealAdCopyCache(adCopyCache);
  console.log(
    JSON.stringify(
      {
        ok: true,
        adCopyId: adCopy.id,
        generator: adCopy.generator,
        variants: adCopy.variants.map((variant) => ({
          label: variant.variantLabel,
          headline: variant.headline,
          cta: variant.callToAction,
        })),
        selectedVariantIndex: adCopy.selectedVariantIndex ?? null,
        removedLegacyManifest: Boolean(legacyManifest),
        migratedLegacyFunnels: legacyFunnels.length,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
