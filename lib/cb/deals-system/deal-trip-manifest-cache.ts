/**
 * Deal Trip Manifests local cache read/write helpers.
 *
 * Reads/writes `.github/data/deal-trip-manifests-cache.json`. Mirrors
 * `deal-discovery-cache.ts`. A manifest is the Step 2 output that pre-fills SOURCE
 * & ASSEMBLE; this lets the lab generate, list, and re-load manifests across
 * requests without hand-editing JSON.
 */

import * as fs from "fs";

import { DEALS_CACHE_PATHS, emptyDealTripManifestsCache } from "./caches";
import type {
  DealTripManifest,
  DealTripManifestsCache,
} from "./deal-trip-manifest-types";
import { manifestsBelongToSameDealCampaign } from "./deal-trip-manifest-identity";
import { validateDealTripManifestsCache } from "./validate";

const CACHE_PATH = DEALS_CACHE_PATHS.dealTripManifests;

export function loadDealTripManifestsCache(): DealTripManifestsCache {
  if (!fs.existsSync(CACHE_PATH)) {
    return emptyDealTripManifestsCache();
  }
  const raw = fs.readFileSync(CACHE_PATH, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  const result = validateDealTripManifestsCache(parsed);
  if (!result.ok || !result.value) {
    throw new Error(
      `deal-trip-manifests-cache.json failed validation:\n  - ${result.errors.join("\n  - ")}`
    );
  }
  return result.value;
}

export function saveDealTripManifestsCache(cache: DealTripManifestsCache): void {
  const validated = validateDealTripManifestsCache(cache);
  if (!validated.ok) {
    throw new Error(
      `Refusing to write invalid deal trip manifests cache:\n  - ${validated.errors.join("\n  - ")}`
    );
  }
  fs.writeFileSync(CACHE_PATH, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
}

/**
 * Insert or replace the active manifest for a Deal package. Angle edits can
 * change the readable manifest id, but they must not create a second campaign.
 */
export function upsertDealTripManifest(
  cache: DealTripManifestsCache,
  manifest: DealTripManifest
): DealTripManifestsCache {
  const manifests = cache.manifests.filter(
    (existing) =>
      existing.id !== manifest.id &&
      !manifestsBelongToSameDealCampaign(existing, manifest)
  );
  manifests.push(manifest);
  return { ...cache, generatedAtIso: new Date().toISOString(), manifests };
}

/** Remove a trip manifest by id. Pure. No-op if the id isn't present. */
export function removeDealTripManifest(
  cache: DealTripManifestsCache,
  id: string
): DealTripManifestsCache {
  const manifests = cache.manifests.filter((existing) => existing.id !== id);
  return { ...cache, generatedAtIso: new Date().toISOString(), manifests };
}
