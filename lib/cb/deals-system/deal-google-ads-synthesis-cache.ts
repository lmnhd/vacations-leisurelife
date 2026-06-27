/**
 * Deal Google Ads Synthesis cache read/write helpers (Step 9). Mirrors
 * deal-meta-ad-synthesis-cache.ts.
 */

import * as fs from "fs";

import { DEALS_CACHE_PATHS, emptyDealGoogleAdsSynthesisCache } from "./caches";
import type {
  DealGoogleAdsSynthesis,
  DealGoogleAdsSynthesisCache,
} from "./deal-google-ads-synthesis-types";
import { validateDealGoogleAdsSynthesisCache } from "./validate";

const CACHE_PATH = DEALS_CACHE_PATHS.dealGoogleAdsSyntheses;

export function loadDealGoogleAdsSynthesisCache(): DealGoogleAdsSynthesisCache {
  if (!fs.existsSync(CACHE_PATH)) {
    return emptyDealGoogleAdsSynthesisCache();
  }
  const raw = fs.readFileSync(CACHE_PATH, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  const result = validateDealGoogleAdsSynthesisCache(parsed);
  if (!result.ok || !result.value) {
    throw new Error(
      `deal-google-ads-syntheses-cache.json failed validation:\n  - ${result.errors.join("\n  - ")}`
    );
  }
  return {
    ...result.value,
    // Backward compatibility: default operatorPlacements for syntheses cached
    // before the field existed.
    syntheses: result.value.syntheses.map((s) => ({ ...s, operatorPlacements: s.operatorPlacements ?? [] })),
  };
}

export function saveDealGoogleAdsSynthesisCache(cache: DealGoogleAdsSynthesisCache): void {
  const validated = validateDealGoogleAdsSynthesisCache(cache);
  if (!validated.ok) {
    throw new Error(
      `Refusing to write invalid Google Ads synthesis cache:\n  - ${validated.errors.join("\n  - ")}`
    );
  }
  fs.writeFileSync(CACHE_PATH, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
}

export function upsertDealGoogleAdsSynthesis(
  cache: DealGoogleAdsSynthesisCache,
  synthesis: DealGoogleAdsSynthesis
): DealGoogleAdsSynthesisCache {
  const syntheses = cache.syntheses.filter((existing) => existing.id !== synthesis.id);
  syntheses.push(synthesis);
  return { ...cache, generatedAtIso: new Date().toISOString(), syntheses };
}
