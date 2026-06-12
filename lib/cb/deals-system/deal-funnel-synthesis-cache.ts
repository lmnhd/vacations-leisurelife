/**
 * Deal Funnel Synthesis cache read/write helpers (Step 7). Mirrors the other
 * deals-system caches.
 */

import * as fs from "fs";

import { DEALS_CACHE_PATHS, emptyDealFunnelSynthesisCache } from "./caches";
import type {
  DealFunnelSynthesis,
  DealFunnelSynthesisCache,
} from "./deal-page-design-types";
import { validateDealFunnelSynthesisCache } from "./validate";

const CACHE_PATH = DEALS_CACHE_PATHS.dealFunnelSyntheses;

export function loadDealFunnelSynthesisCache(): DealFunnelSynthesisCache {
  if (!fs.existsSync(CACHE_PATH)) {
    return emptyDealFunnelSynthesisCache();
  }
  const raw = fs.readFileSync(CACHE_PATH, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  const result = validateDealFunnelSynthesisCache(parsed);
  if (!result.ok || !result.value) {
    throw new Error(
      `deal-funnel-syntheses-cache.json failed validation:\n  - ${result.errors.join("\n  - ")}`
    );
  }
  return result.value;
}

export function saveDealFunnelSynthesisCache(cache: DealFunnelSynthesisCache): void {
  const validated = validateDealFunnelSynthesisCache(cache);
  if (!validated.ok) {
    throw new Error(
      `Refusing to write invalid funnel synthesis cache:\n  - ${validated.errors.join("\n  - ")}`
    );
  }
  fs.writeFileSync(CACHE_PATH, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
}

export function upsertDealFunnelSynthesis(
  cache: DealFunnelSynthesisCache,
  synthesis: DealFunnelSynthesis
): DealFunnelSynthesisCache {
  const syntheses = cache.syntheses.filter((existing) => existing.id !== synthesis.id);
  syntheses.push(synthesis);
  return { ...cache, generatedAtIso: new Date().toISOString(), syntheses };
}

/**
 * Record the operator's curated image set (ordered gallery + hero + per-segment
 * picks) onto an existing synthesis. Pure: returns a new cache. Throws on unknown id
 * or when an image id isn't among the synthesis candidates.
 */
export function setDealFunnelImageSelection(
  cache: DealFunnelSynthesisCache,
  synthesisId: string,
  selection: {
    galleryIds?: string[];
    heroImageId?: string;
    segmentImageIds?: Partial<Record<string, string>>;
  }
): DealFunnelSynthesisCache {
  const synthesis = cache.syntheses.find((s) => s.id === synthesisId);
  if (!synthesis) {
    throw new Error(`No funnel synthesis found with id "${synthesisId}".`);
  }
  const candidateIds = new Set(synthesis.candidates.map((c) => c.id));
  const assertKnown = (id: string, where: string) => {
    if (!candidateIds.has(id)) {
      throw new Error(`Image id "${id}" (${where}) is not among the synthesis candidates.`);
    }
  };

  const galleryIds = selection.galleryIds ?? synthesis.galleryIds;
  galleryIds.forEach((id) => assertKnown(id, "gallery"));

  let heroImageId = synthesis.heroImageId;
  if (selection.heroImageId !== undefined) {
    if (selection.heroImageId) assertKnown(selection.heroImageId, "hero");
    heroImageId = selection.heroImageId || undefined;
  }

  let segments = synthesis.landingPage.segments;
  if (selection.segmentImageIds) {
    segments = segments.map((seg) => {
      const picked = selection.segmentImageIds?.[seg.segment];
      if (picked === undefined) return seg;
      if (picked) assertKnown(picked, `segment ${seg.segment}`);
      return { ...seg, imageId: picked || undefined };
    });
  }

  const updated: DealFunnelSynthesis = {
    ...synthesis,
    galleryIds,
    heroImageId,
    landingPage: { ...synthesis.landingPage, segments },
  };
  return upsertDealFunnelSynthesis(cache, updated);
}
