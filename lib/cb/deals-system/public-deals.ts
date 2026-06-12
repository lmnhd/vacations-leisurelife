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

import fs from "fs/promises";

import { DEALS_CACHE_PATHS } from "./caches";
import { isDealHomepageEligible } from "./curated-deal-assembly";
import type { CuratedOdysseusDeal } from "./curated-deal-types";
import type { DealFunnelSynthesis } from "./deal-page-design-types";
import type { DealTripManifest } from "./deal-trip-manifest-types";
import type { CbPromoIntelligenceRecord } from "./promo-intelligence-types";
import {
  projectPublicDealPage,
  projectPublicDealTile,
  type PublicDealPage,
  type PublicDealTile,
} from "./public-deal-projection";
import {
  validateCuratedDealsCache,
  validateDealFunnelSynthesisCache,
  validateDealTripManifestsCache,
  validatePromoIntelligenceCache,
} from "./validate";

function addLookupKey(keys: Set<string>, value: string | undefined): void {
  const trimmed = value?.trim();
  if (trimmed) keys.add(trimmed);
}

async function loadEligibleDeals(): Promise<CuratedOdysseusDeal[]> {
  let raw: string;
  try {
    raw = await fs.readFile(DEALS_CACHE_PATHS.curatedDeals, "utf8");
  } catch {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  const result = validateCuratedDealsCache(parsed);
  if (!result.ok || !result.value) {
    return [];
  }
  // Pinned Deals (Phase 14) sort first; order is otherwise stable cache order.
  return result.value.deals
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
  return deals.map(projectPublicDealTile);
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

async function loadTripManifestForDeal(deal: CuratedOdysseusDeal): Promise<DealTripManifest | undefined> {
  let raw: string;
  try {
    raw = await fs.readFile(DEALS_CACHE_PATHS.dealTripManifests, "utf8");
  } catch {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  const result = validateDealTripManifestsCache(parsed);
  if (!result.ok || !result.value) return undefined;
  return findDealTripManifestForDeal(deal, result.value.manifests);
}

async function loadPromoRecords(): Promise<CbPromoIntelligenceRecord[]> {
  let raw: string;
  try {
    raw = await fs.readFile(DEALS_CACHE_PATHS.promoIntelligence, "utf8");
  } catch {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  const result = validatePromoIntelligenceCache(parsed);
  if (!result.ok || !result.value) return [];
  return result.value.records;
}

/**
 * Load the funnel synthesis for a deal, resilient to a missing/malformed cache
 * (returns undefined so the page falls back to the legacy rendering rather than
 * crashing). Published deals use live package ids, while synthesis records are
 * keyed to the source manifest/ad-copy ids, so we match across the carried trace
 * notes instead of only the public deal id.
 */
async function loadFunnelSynthesisForDeal(deal: CuratedOdysseusDeal): Promise<DealFunnelSynthesis | undefined> {
  let raw: string;
  try {
    raw = await fs.readFile(DEALS_CACHE_PATHS.dealFunnelSyntheses, "utf8");
  } catch {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  const result = validateDealFunnelSynthesisCache(parsed);
  if (!result.ok || !result.value) return undefined;
  return findDealFunnelSynthesisForDeal(deal, result.value.syntheses);
}

/**
 * Public deal page projection by id. Returns null when the Deal does not exist
 * OR is not homepage-eligible, so a non-approved / non-valid-link Deal renders as
 * notFound instead of leaking. When a funnel synthesis exists for the deal, the
 * projection carries the premium `designPage` view; otherwise the route falls
 * back to the legacy curated rendering.
 */
export async function getPublicDealPageById(id: string): Promise<PublicDealPage | null> {
  const deals = await loadEligibleDeals();
  const deal = deals.find((candidate) => candidate.id === id);
  if (!deal) return null;
  const manifest = await loadTripManifestForDeal(deal);
  const hydratedDeal = hydrateDealFromManifest(deal, manifest);
  const synthesis = await loadFunnelSynthesisForDeal(hydratedDeal);
  const promoRecords = await loadPromoRecords();
  return projectPublicDealPage(hydratedDeal, synthesis, promoRecords);
}
