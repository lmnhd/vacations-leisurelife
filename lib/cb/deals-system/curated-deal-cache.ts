/**
 * Curated Odysseus Deals local cache read/write helpers.
 *
 * Reads/writes `.github/data/odysseus-curated-deals-cache.json` (the Phase 1
 * file). Used by the assemble-curated-deal operator script and the workbench API
 * routes so a Deal can be saved and re-loaded across stages without hand-editing
 * JSON. Production storage is a later phase; this keeps the same record shape.
 */

import * as fs from "fs";

import { DEALS_CACHE_PATHS, emptyCuratedDealsCache } from "./caches";
import type {
  CuratedOdysseusDeal,
  CuratedOdysseusDealsCache,
  OdysseusDealBrief,
} from "./curated-deal-types";
import { validateCuratedDealsCache } from "./validate";

const CACHE_PATH = DEALS_CACHE_PATHS.curatedDeals;

export function loadCuratedDealsCache(): CuratedOdysseusDealsCache {
  if (!fs.existsSync(CACHE_PATH)) {
    return emptyCuratedDealsCache();
  }
  const raw = fs.readFileSync(CACHE_PATH, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  const result = validateCuratedDealsCache(parsed);
  if (!result.ok || !result.value) {
    throw new Error(
      `odysseus-curated-deals-cache.json failed validation:\n  - ${result.errors.join("\n  - ")}`
    );
  }
  return result.value;
}

export function saveCuratedDealsCache(cache: CuratedOdysseusDealsCache): void {
  const validated = validateCuratedDealsCache(cache);
  if (!validated.ok) {
    throw new Error(
      `Refusing to write invalid curated deals cache:\n  - ${validated.errors.join("\n  - ")}`
    );
  }
  fs.writeFileSync(CACHE_PATH, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
}

/** Insert or replace a Deal by id, returning the updated cache (not yet saved). */
export function upsertCuratedDeal(
  cache: CuratedOdysseusDealsCache,
  deal: CuratedOdysseusDeal
): CuratedOdysseusDealsCache {
  const deals = cache.deals.filter((existing) => existing.id !== deal.id);
  deals.push(deal);
  return {
    ...cache,
    generatedAtIso: new Date().toISOString(),
    deals,
  };
}

/** Insert or replace a brief by id, returning the updated cache (not yet saved). */
export function upsertDealBrief(
  cache: CuratedOdysseusDealsCache,
  brief: OdysseusDealBrief
): CuratedOdysseusDealsCache {
  const briefs = cache.briefs.filter((existing) => existing.id !== brief.id);
  briefs.push(brief);
  return { ...cache, generatedAtIso: new Date().toISOString(), briefs };
}

export function findCuratedDeal(
  cache: CuratedOdysseusDealsCache,
  dealId: string
): CuratedOdysseusDeal | undefined {
  return cache.deals.find((deal) => deal.id === dealId);
}
