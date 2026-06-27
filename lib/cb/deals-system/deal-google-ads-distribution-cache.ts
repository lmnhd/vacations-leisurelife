/**
 * Deal Google Ads Distribution cache read/write helpers (Step 10). Mirrors
 * deal-meta-distribution-cache.ts.
 */

import * as fs from "fs";

import { DEALS_CACHE_PATHS, emptyDealGoogleAdsDistributionCache } from "./caches";
import type {
  DealGoogleAdsDistribution,
  DealGoogleAdsDistributionCache,
} from "./deal-google-ads-distribution-types";
import { validateDealGoogleAdsDistributionCache } from "./validate";

const CACHE_PATH = DEALS_CACHE_PATHS.dealGoogleAdsDistributions;

export function loadDealGoogleAdsDistributionCache(): DealGoogleAdsDistributionCache {
  if (!fs.existsSync(CACHE_PATH)) {
    return emptyDealGoogleAdsDistributionCache();
  }
  const raw = fs.readFileSync(CACHE_PATH, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  const result = validateDealGoogleAdsDistributionCache(parsed);
  if (!result.ok || !result.value) {
    throw new Error(
      `deal-google-ads-distributions-cache.json failed validation:\n  - ${result.errors.join("\n  - ")}`
    );
  }
  return result.value;
}

export function saveDealGoogleAdsDistributionCache(cache: DealGoogleAdsDistributionCache): void {
  const validated = validateDealGoogleAdsDistributionCache(cache);
  if (!validated.ok) {
    throw new Error(
      `Refusing to write invalid Google Ads distribution cache:\n  - ${validated.errors.join("\n  - ")}`
    );
  }
  fs.writeFileSync(CACHE_PATH, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
}

export function upsertDealGoogleAdsDistribution(
  cache: DealGoogleAdsDistributionCache,
  distribution: DealGoogleAdsDistribution
): DealGoogleAdsDistributionCache {
  const distributions = cache.distributions.filter((existing) => existing.id !== distribution.id);
  distributions.push(distribution);
  return { ...cache, generatedAtIso: new Date().toISOString(), distributions };
}
