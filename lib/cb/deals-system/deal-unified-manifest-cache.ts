/**
 * Deal Unified Manifest cache + assembler.
 *
 * `assembleDealUnifiedManifest` is pure (no AI): it stitches a Step 1 angle and its
 * Step 2 trip manifest into the single artifact Step 3 consumes. The cache persists
 * unified manifests so the copywriter and the lab can reload them.
 */

import * as fs from "fs";

import { DEALS_CACHE_PATHS, emptyDealUnifiedManifestsCache } from "./caches";
import type { DealDiscoveryIdea } from "./deal-discovery-types";
import type { DealTripManifest } from "./deal-trip-manifest-types";
import type {
  DealUnifiedManifest,
  DealUnifiedManifestsCache,
} from "./deal-unified-manifest-types";
import { validateDealUnifiedManifestsCache } from "./validate";

const CACHE_PATH = DEALS_CACHE_PATHS.dealUnifiedManifests;

/**
 * Stitch a discovery angle + its trip manifest into a unified manifest. Pure — both
 * halves are carried verbatim so the copywriter expands known content, never guesses.
 */
export function assembleDealUnifiedManifest(
  angle: DealDiscoveryIdea,
  tripManifest: DealTripManifest,
  options: { generatedAtIso?: string } = {}
): DealUnifiedManifest {
  const generatedAtIso = options.generatedAtIso ?? new Date().toISOString();
  return {
    id: `unified-${tripManifest.id}`,
    generatedAtIso,
    expiresOnIso: tripManifest.expiresOnIso,
    sourceAngleId: angle.id,
    sourceManifestId: tripManifest.id,
    sailingAngleTitle: angle.sailingAngleProfile.sailingAngleTitle,
    creativeBrief: {
      isolatedNiche: angle.isolatedNiche,
      angle: angle.sailingAngleProfile,
    },
    inventoryManifest: {
      assembleDraft: tripManifest.assembleDraft,
      lookupQuery: tripManifest.lookupQuery,
      appliedPromos: tripManifest.appliedPromos,
      promoStrategy: tripManifest.promoStrategy,
      manifestReasoning: tripManifest.manifestReasoning,
    },
  };
}

export function loadDealUnifiedManifestsCache(): DealUnifiedManifestsCache {
  if (!fs.existsSync(CACHE_PATH)) {
    return emptyDealUnifiedManifestsCache();
  }
  const raw = fs.readFileSync(CACHE_PATH, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  const result = validateDealUnifiedManifestsCache(parsed);
  if (!result.ok || !result.value) {
    throw new Error(
      `deal-unified-manifests-cache.json failed validation:\n  - ${result.errors.join("\n  - ")}`
    );
  }
  return result.value;
}

export function saveDealUnifiedManifestsCache(cache: DealUnifiedManifestsCache): void {
  const validated = validateDealUnifiedManifestsCache(cache);
  if (!validated.ok) {
    throw new Error(
      `Refusing to write invalid unified manifests cache:\n  - ${validated.errors.join("\n  - ")}`
    );
  }
  fs.writeFileSync(CACHE_PATH, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
}

export function upsertDealUnifiedManifest(
  cache: DealUnifiedManifestsCache,
  manifest: DealUnifiedManifest
): DealUnifiedManifestsCache {
  const manifests = cache.manifests.filter((existing) => existing.id !== manifest.id);
  manifests.push(manifest);
  return { ...cache, generatedAtIso: new Date().toISOString(), manifests };
}
