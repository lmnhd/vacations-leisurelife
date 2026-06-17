/**
 * Deal Meta Ad Synthesis cache read/write helpers (Step 8). Mirrors
 * deal-funnel-synthesis-cache.ts.
 */

import * as fs from "fs";

import { DEALS_CACHE_PATHS, emptyDealMetaAdSynthesisCache } from "./caches";
import type {
  DealMetaAdSynthesis,
  DealMetaAdSynthesisCache,
} from "./deal-meta-ad-synthesis-types";
import { validateDealMetaAdSynthesisCache } from "./validate";

const CACHE_PATH = DEALS_CACHE_PATHS.dealMetaAdSyntheses;

export function loadDealMetaAdSynthesisCache(): DealMetaAdSynthesisCache {
  if (!fs.existsSync(CACHE_PATH)) {
    return emptyDealMetaAdSynthesisCache();
  }
  const raw = fs.readFileSync(CACHE_PATH, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  const result = validateDealMetaAdSynthesisCache(parsed);
  if (!result.ok || !result.value) {
    throw new Error(
      `deal-meta-ad-syntheses-cache.json failed validation:\n  - ${result.errors.join("\n  - ")}`
    );
  }
  return result.value;
}

export function saveDealMetaAdSynthesisCache(cache: DealMetaAdSynthesisCache): void {
  const validated = validateDealMetaAdSynthesisCache(cache);
  if (!validated.ok) {
    throw new Error(
      `Refusing to write invalid meta ad synthesis cache:\n  - ${validated.errors.join("\n  - ")}`
    );
  }
  fs.writeFileSync(CACHE_PATH, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
}

export function upsertDealMetaAdSynthesis(
  cache: DealMetaAdSynthesisCache,
  synthesis: DealMetaAdSynthesis
): DealMetaAdSynthesisCache {
  const syntheses = cache.syntheses.filter((existing) => existing.id !== synthesis.id);
  syntheses.push(synthesis);
  return { ...cache, generatedAtIso: new Date().toISOString(), syntheses };
}
