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
import {
  projectPublicDealPage,
  projectPublicDealTile,
  type PublicDealPage,
  type PublicDealTile,
} from "./public-deal-projection";
import { validateCuratedDealsCache } from "./validate";

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

/**
 * Public deal page projection by id. Returns null when the Deal does not exist
 * OR is not homepage-eligible, so a non-approved / non-valid-link Deal renders as
 * notFound instead of leaking.
 */
export async function getPublicDealPageById(id: string): Promise<PublicDealPage | null> {
  const deals = await loadEligibleDeals();
  const deal = deals.find((candidate) => candidate.id === id);
  return deal ? projectPublicDealPage(deal) : null;
}
