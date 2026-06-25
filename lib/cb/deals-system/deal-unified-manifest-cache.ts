/**
 * Deal Unified Manifest cache + assembler.
 *
 * `assembleDealUnifiedManifest` is pure (no AI): it stitches a Step 1 angle and its
 * Step 2 trip manifest into the single artifact Step 3 consumes. The cache persists
 * unified manifests so the copywriter and the lab can reload them.
 */

import * as fs from "fs";

import { DEALS_CACHE_PATHS, emptyDealUnifiedManifestsCache } from "./caches";
import type { DealDiscoveryIdea } from "./deal-discovery-types";
import type { DealTripManifest } from "./deal-trip-manifest-types";
import type { CbPromoIntelligenceRecord } from "./promo-intelligence-types";
import type {
  DealUnifiedManifest,
  DealUnifiedManifestsCache,
  DealUnifiedPromotionBrief,
} from "./deal-unified-manifest-types";
import { validateDealUnifiedManifestsCache } from "./validate";

const CACHE_PATH = DEALS_CACHE_PATHS.dealUnifiedManifests;

function buildPromotionBrief(
  record: CbPromoIntelligenceRecord
): DealUnifiedPromotionBrief {
  return {
    promoRecordId: record.id,
    title: record.title,
    vendor: record.vendor,
    bookingWindow: record.bookingWindow.rawText,
    sailingWindow: record.sailingWindow.rawText,
    offerTypes: record.extracted.offerTypes,
    publicClaimsAllowed: record.marketingUse.publicClaimsAllowed,
    publicClaimsNeedsQualifier: record.marketingUse.publicClaimsNeedsQualifier,
    visitorFriendlySummary: record.marketingUse.visitorFriendlySummary,
    suggestedAngles: record.marketingUse.suggestedAngles,
    cautionFlags: record.marketingUse.cautionFlags,
    percentDiscounts: record.extracted.percentDiscounts,
    dollarSavings: record.extracted.dollarSavings,
    onboardCredits: record.extracted.onboardCredits,
    freeGuestOffers: record.extracted.freeGuestOffers,
    exclusions: record.extracted.exclusions,
    applicableProducts: record.extracted.applicableProducts,
    applicableMarkets: record.extracted.applicableMarkets,
  };
}

/**
 * Stitch a discovery angle + its trip manifest into a unified manifest. Pure — both
 * halves are carried verbatim so the copywriter expands known content, never guesses.
 */
export function assembleDealUnifiedManifest(
  angle: DealDiscoveryIdea,
  tripManifest: DealTripManifest,
  options: {
    generatedAtIso?: string;
    promoRecords?: CbPromoIntelligenceRecord[];
  } = {}
): DealUnifiedManifest {
  const generatedAtIso = options.generatedAtIso ?? new Date().toISOString();
  const applicablePromoIds = new Set(
    tripManifest.appliedPromos
      .filter(
        (promo) =>
          promo.status === "likely_applicable" ||
          promo.status === "possibly_applicable_needs_review"
      )
      .map((promo) => promo.promoRecordId)
  );
  const promotionBriefs = (options.promoRecords ?? [])
    .filter((record) => applicablePromoIds.has(record.id))
    .map(buildPromotionBrief);

  return {
    id: `unified-${tripManifest.id}`,
    generatedAtIso,
    expiresOnIso: tripManifest.expiresOnIso,
    sourceAngleId: angle.id,
    sourceManifestId: tripManifest.id,
    sailingAngleTitle: angle.sailingAngleProfile.sailingAngleTitle,
    creativeBrief: {
      isolatedNiche: angle.isolatedNiche,
      researchRationale: angle.researchRationale,
      successLogic: angle.successLogic,
      audienceSignals: angle.audienceSignals,
      angle: angle.sailingAngleProfile,
    },
    inventoryManifest: {
      assembleDraft: tripManifest.assembleDraft,
      lookupQuery: tripManifest.lookupQuery,
      targetingSeeds: tripManifest.targetingSeeds,
      appliedPromos: tripManifest.appliedPromos,
      promotionBriefs,
      promoStrategy: tripManifest.promoStrategy,
      manifestReasoning: tripManifest.manifestReasoning,
    },
  };
}

export function loadDealUnifiedManifestsCache(): DealUnifiedManifestsCache {
  if (!fs.existsSync(CACHE_PATH)) {
    return emptyDealUnifiedManifestsCache();
  }
  const raw = fs.readFileSync(CACHE_PATH, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  const result = validateDealUnifiedManifestsCache(parsed);
  if (!result.ok || !result.value) {
    throw new Error(
      `deal-unified-manifests-cache.json failed validation:\n  - ${result.errors.join("\n  - ")}`
    );
  }
  return result.value;
}

export function saveDealUnifiedManifestsCache(cache: DealUnifiedManifestsCache): void {
  const validated = validateDealUnifiedManifestsCache(cache);
  if (!validated.ok) {
    throw new Error(
      `Refusing to write invalid unified manifests cache:\n  - ${validated.errors.join("\n  - ")}`
    );
  }
  fs.writeFileSync(CACHE_PATH, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
}

export function upsertDealUnifiedManifest(
  cache: DealUnifiedManifestsCache,
  manifest: DealUnifiedManifest
): DealUnifiedManifestsCache {
  const manifests = cache.manifests.filter((existing) => existing.id !== manifest.id);
  manifests.push(manifest);
  return { ...cache, generatedAtIso: new Date().toISOString(), manifests };
}
