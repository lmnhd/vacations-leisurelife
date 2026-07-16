/**
 * Approval-gated public Deals loader (Phase 10).
 *
 * Reads the curated deals cache and returns ONLY Deals that pass
 * `isDealHomepageEligible` (status "bookable" + operator-approved + valid link
 * health), projected into public-safe shapes. This is the single source the
 * homepage and /deals/[id] read from — they never touch the raw cache.
 *
 * Resilient by design: a missing or malformed cache yields zero public Deals
 * rather than throwing, so a bad cache can never crash a public page or, worse,
 * leak a non-eligible Deal. Server-only (uses fs); never import from a client
 * component.
 */

import { isDealHomepageEligible } from "./curated-deal-assembly";
import type { CuratedOdysseusDeal } from "./curated-deal-types";
import type { DealFunnelSynthesis } from "./deal-page-design-types";
import type { DealMetaAdSynthesis } from "./deal-meta-ad-synthesis-types";
import type { DealTripManifest } from "./deal-trip-manifest-types";
import type { CbPromoIntelligenceRecord } from "./promo-intelligence-types";
import {
  getCuratedDeal,
  getDealFunnelSynthesis,
  getDealMetaAdSynthesis,
  getDealTripManifest,
  getPromoRecordsByIds,
  listCuratedDeals,
  listDealFunnelSyntheses,
  listDealMetaAdSyntheses,
  listDealTripManifests,
} from "./deals-dynamo-store";
import {
  projectPublicDealPage,
  projectPublicDealTile,
  type PublicDealPage,
  type PublicDealTile,
} from "./public-deal-projection";

function addLookupKey(keys: Set<string>, value: string | undefined): void {
  const trimmed = value?.trim();
  if (trimmed) keys.add(trimmed);
}

async function loadEligibleDeals(): Promise<CuratedOdysseusDeal[]> {
  let deals: CuratedOdysseusDeal[];
  try {
    deals = await listCuratedDeals();
  } catch {
    return [];
  }
  // Pinned Deals (Phase 14) sort first; order is otherwise stable cache order.
  return deals
    .filter(isDealHomepageEligible)
    .sort((a, b) => {
      const aPinned = a.operatorVisibility?.pinned ? 1 : 0;
      const bPinned = b.operatorVisibility?.pinned ? 1 : 0;
      return bPinned - aPinned;
    });
}

/** Public homepage tiles for every approval-gated, link-valid, bookable Deal. */
export async function getPublicDealTiles(): Promise<PublicDealTile[]> {
  const deals = await loadEligibleDeals();

  // Each tile needs the deal's funnel synthesis for the operator-selected hero
  // image (matching the /deals/[id] page). loadFunnelSynthesisForDeal point-reads
  // the stamped ref and only falls back to the (cached) full scan when a ref is
  // missing or stale, so a bad ref costs the old scan — never a wrong image.
  return Promise.all(
    deals.map(async (deal) =>
      projectPublicDealTile(deal, await loadFunnelSynthesisForDeal(deal))
    )
  );
}

export function dealFunnelSynthesisLookupKeys(deal: CuratedOdysseusDeal): string[] {
  const keys = new Set<string>();
  addLookupKey(keys, deal.id);
  addLookupKey(keys, deal.packageId);
  addLookupKey(keys, deal.briefId);

  const notes = [
    ...(deal.agentOnlyNotes ?? []),
    ...(deal.copyPackage?.agentOnlyNotes ?? []),
  ];
  const manifestMarker = "Assembled from manifest ";
  const adCopyMarker = " + ad copy ";

  for (const note of notes) {
    const manifestStart = note.indexOf(manifestMarker);
    if (manifestStart < 0) continue;

    const afterManifest = note.slice(manifestStart + manifestMarker.length);
    const adCopyStart = afterManifest.indexOf(adCopyMarker);
    const manifestId =
      adCopyStart >= 0 ? afterManifest.slice(0, adCopyStart) : afterManifest;

    addLookupKey(keys, manifestId);
    if (manifestId.startsWith("unified-")) {
      addLookupKey(keys, manifestId.slice("unified-".length));
    }

    if (adCopyStart >= 0) {
      addLookupKey(keys, afterManifest.slice(adCopyStart + adCopyMarker.length));
    }
  }

  return [...keys];
}

export function findDealFunnelSynthesisForDeal(
  deal: CuratedOdysseusDeal,
  syntheses: DealFunnelSynthesis[]
): DealFunnelSynthesis | undefined {
  const keys = new Set(dealFunnelSynthesisLookupKeys(deal));
  return syntheses.find((s) =>
    keys.has(s.dealId) || keys.has(s.id) || keys.has(s.sourceAdCopyId)
  );
}

export function findDealMetaAdSynthesisForDeal(
  deal: CuratedOdysseusDeal,
  syntheses: DealMetaAdSynthesis[]
): DealMetaAdSynthesis | undefined {
  const keys = new Set(dealFunnelSynthesisLookupKeys(deal));
  return syntheses.find((s) =>
    keys.has(s.dealId) || keys.has(s.id) || keys.has(s.sourceFunnelSynthesisId)
  );
}

export function findDealTripManifestForDeal(
  deal: CuratedOdysseusDeal,
  manifests: DealTripManifest[]
): DealTripManifest | undefined {
  const keys = new Set(dealFunnelSynthesisLookupKeys(deal));
  return manifests.find((manifest) => keys.has(manifest.id));
}

function hydrateDealFromManifest(
  deal: CuratedOdysseusDeal,
  manifest: DealTripManifest | undefined
): CuratedOdysseusDeal {
  const pricing = manifest?.resolvedPackage?.cabinPricing;
  const hasDealPricing = [
    deal.cruiseFacts.cabinPrices.inside,
    deal.cruiseFacts.cabinPrices.outside,
    deal.cruiseFacts.cabinPrices.balcony,
    deal.cruiseFacts.cabinPrices.suite,
  ].some((value) => typeof value === "number" && value > 0);

  if (!pricing || hasDealPricing) return deal;

  return {
    ...deal,
    cruiseFacts: {
      ...deal.cruiseFacts,
      cabinPrices: {
        inside: pricing.inside,
        outside: pricing.outside,
        balcony: pricing.balcony,
        suite: pricing.suite,
        currencyCode: pricing.currencyCode,
      },
    },
  };
}

function warnRefFallback(kind: string, dealId: string, refId: string): void {
  console.warn(
    `[public-deals] publicContentRefs.${kind} "${refId}" on deal ${dealId} missed or no longer matches; ` +
      "falling back to scan+match. Re-run: npm run backfill-public-content-refs"
  );
}

/**
 * Trip manifest for a deal: point-read the stamped ref and verify it still
 * matches the deal's lookup keys; otherwise fall back to the legacy full
 * scan+match (cached, correct, just costlier). Never returns a record that
 * doesn't match — a stale ref degrades to the old cost profile, not to wrong
 * content.
 */
async function loadTripManifestForDeal(deal: CuratedOdysseusDeal): Promise<DealTripManifest | undefined> {
  const refId = deal.publicContentRefs?.tripManifestId;
  if (refId) {
    try {
      const manifest = await getDealTripManifest(refId);
      if (manifest && findDealTripManifestForDeal(deal, [manifest])) return manifest;
    } catch {
      // fall through to the scan
    }
    warnRefFallback("tripManifestId", deal.id, refId);
  }
  let manifests: DealTripManifest[];
  try {
    manifests = await listDealTripManifests();
  } catch {
    return undefined;
  }
  return findDealTripManifestForDeal(deal, manifests);
}

/**
 * Promo records for a deal. The projection only ever consumes promos matched to
 * `deal.promoApplicability` by id, so point-reading exactly those ids is
 * behavior-identical to listing every promo — minus the full-table scan.
 */
async function loadPromoRecordsForDeal(deal: CuratedOdysseusDeal): Promise<CbPromoIntelligenceRecord[]> {
  const ids = (deal.promoApplicability ?? [])
    .map((promo) => promo.promoRecordId)
    .filter(Boolean);
  if (ids.length === 0) return [];
  try {
    return await getPromoRecordsByIds(ids);
  } catch {
    return [];
  }
}

/**
 * Load the funnel synthesis for a deal, resilient to a missing/malformed cache
 * (returns undefined so the page falls back to the legacy rendering rather than
 * crashing). Published deals use live package ids, while synthesis records are
 * keyed to the source manifest/ad-copy ids, so we match across the carried trace
 * notes instead of only the public deal id. The stamped ref short-circuits the
 * scan; a missing/stale ref falls back to the legacy scan+match.
 */
async function loadFunnelSynthesisForDeal(deal: CuratedOdysseusDeal): Promise<DealFunnelSynthesis | undefined> {
  const refId = deal.publicContentRefs?.funnelSynthesisId;
  if (refId) {
    try {
      const synthesis = await getDealFunnelSynthesis(refId);
      if (synthesis && findDealFunnelSynthesisForDeal(deal, [synthesis])) return synthesis;
    } catch {
      // fall through to the scan
    }
    warnRefFallback("funnelSynthesisId", deal.id, refId);
  }
  let syntheses: DealFunnelSynthesis[];
  try {
    syntheses = await listDealFunnelSyntheses();
  } catch {
    return undefined;
  }
  return findDealFunnelSynthesisForDeal(deal, syntheses);
}

/**
 * Load the Meta ad synthesis (Step 8) for a deal, resilient to a missing/malformed
 * store (returns undefined so the page simply omits the ad-cards showcase rather
 * than crashing). Matched the same way as the funnel synthesis, since both are
 * keyed to the same manifest/ad-copy trace. Stamped ref first, scan fallback.
 */
async function loadMetaAdSynthesisForDeal(
  deal: CuratedOdysseusDeal
): Promise<DealMetaAdSynthesis | undefined> {
  const refId = deal.publicContentRefs?.metaAdSynthesisId;
  if (refId) {
    try {
      const synthesis = await getDealMetaAdSynthesis(refId);
      if (synthesis && findDealMetaAdSynthesisForDeal(deal, [synthesis])) return synthesis;
    } catch {
      // fall through to the scan
    }
    warnRefFallback("metaAdSynthesisId", deal.id, refId);
  }
  let syntheses: DealMetaAdSynthesis[];
  try {
    syntheses = await listDealMetaAdSyntheses();
  } catch {
    return undefined;
  }
  return findDealMetaAdSynthesisForDeal(deal, syntheses);
}

/**
 * Public deal page projection by id. Returns null when the Deal does not exist
 * OR is not homepage-eligible, so a non-approved / non-valid-link Deal renders as
 * notFound instead of leaking. When a funnel synthesis exists for the deal, the
 * projection carries the premium `designPage` view; otherwise the route falls
 * back to the legacy curated rendering.
 */
export async function getPublicDealPageById(id: string): Promise<PublicDealPage | null> {
  // Deals ARE keyed by their id, so this point-read is exact — unlike the
  // synthesis/manifest records, which need the ref/scan machinery above.
  let deal: CuratedOdysseusDeal | null;
  try {
    deal = await getCuratedDeal(id);
  } catch {
    return null;
  }
  if (!deal || !isDealHomepageEligible(deal)) return null;
  const manifest = await loadTripManifestForDeal(deal);
  const hydratedDeal = hydrateDealFromManifest(deal, manifest);
  const synthesis = await loadFunnelSynthesisForDeal(hydratedDeal);
  const metaAdSynthesis = await loadMetaAdSynthesisForDeal(hydratedDeal);
  const promoRecords = await loadPromoRecordsForDeal(hydratedDeal);
  return projectPublicDealPage(hydratedDeal, synthesis, promoRecords, metaAdSynthesis);
}

/**
 * Cheap public-eligibility check for telemetry routes that do not need the
 * hydrated page payload. One point-read of the deal record (deals ARE keyed by
 * their id) — this deliberately avoids the synthesis/manifest loads above,
 * which the tracking beacon never uses.
 */
export async function isPublicDealAvailableById(id: string): Promise<boolean> {
  try {
    const deal = await getCuratedDeal(id);
    return Boolean(deal && isDealHomepageEligible(deal));
  } catch {
    return false;
  }
}
