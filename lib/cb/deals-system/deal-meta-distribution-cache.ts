/**
 * Deal Meta Distribution cache read/write helpers (Step 9). Mirrors the other
 * deals-system caches.
 */

import * as fs from "fs";

import { DEALS_CACHE_PATHS, emptyDealMetaDistributionCache } from "./caches";
import type {
  DealMetaDistribution,
  DealMetaDistributionCache,
} from "./deal-meta-distribution-types";
import { validateDealMetaDistributionCache } from "./validate";

const CACHE_PATH = DEALS_CACHE_PATHS.dealMetaDistributions;

export function loadDealMetaDistributionCache(): DealMetaDistributionCache {
  if (!fs.existsSync(CACHE_PATH)) {
    return emptyDealMetaDistributionCache();
  }
  const raw = fs.readFileSync(CACHE_PATH, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  const result = validateDealMetaDistributionCache(parsed);
  if (!result.ok || !result.value) {
    throw new Error(
      `deal-meta-distributions-cache.json failed validation:\n  - ${result.errors.join("\n  - ")}`
    );
  }
  return result.value;
}

export function saveDealMetaDistributionCache(cache: DealMetaDistributionCache): void {
  const validated = validateDealMetaDistributionCache(cache);
  if (!validated.ok) {
    throw new Error(
      `Refusing to write invalid meta distribution cache:\n  - ${validated.errors.join("\n  - ")}`
    );
  }
  fs.writeFileSync(CACHE_PATH, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
}

export function upsertDealMetaDistribution(
  cache: DealMetaDistributionCache,
  distribution: DealMetaDistribution
): DealMetaDistributionCache {
  const distributions = cache.distributions.filter((existing) => existing.id !== distribution.id);
  distributions.push(distribution);
  return { ...cache, generatedAtIso: new Date().toISOString(), distributions };
}
