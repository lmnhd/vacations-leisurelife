/**
 * Deal Ad Copy cache read/write helpers. Mirrors the other deals-system caches.
 */

import * as fs from "fs";

import { DEALS_CACHE_PATHS, emptyDealAdCopyCache } from "./caches";
import type { DealAdCopy, DealAdCopyCache } from "./deal-ad-copy-types";
import { validateDealAdCopyCache } from "./validate";

const CACHE_PATH = DEALS_CACHE_PATHS.dealAdCopy;

export function loadDealAdCopyCache(): DealAdCopyCache {
  if (!fs.existsSync(CACHE_PATH)) {
    return emptyDealAdCopyCache();
  }
  const raw = fs.readFileSync(CACHE_PATH, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  const result = validateDealAdCopyCache(parsed);
  if (!result.ok || !result.value) {
    throw new Error(
      `deal-ad-copy-cache.json failed validation:\n  - ${result.errors.join("\n  - ")}`
    );
  }
  return result.value;
}

export function saveDealAdCopyCache(cache: DealAdCopyCache): void {
  const validated = validateDealAdCopyCache(cache);
  if (!validated.ok) {
    throw new Error(
      `Refusing to write invalid ad copy cache:\n  - ${validated.errors.join("\n  - ")}`
    );
  }
  fs.writeFileSync(CACHE_PATH, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
}

export function upsertDealAdCopy(cache: DealAdCopyCache, adCopy: DealAdCopy): DealAdCopyCache {
  const adCopies = cache.adCopies.filter((existing) => existing.id !== adCopy.id);
  adCopies.push(adCopy);
  return { ...cache, generatedAtIso: new Date().toISOString(), adCopies };
}
