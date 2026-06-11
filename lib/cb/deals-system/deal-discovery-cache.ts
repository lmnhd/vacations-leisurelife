/**
 * Deal Discovery Ideas local cache read/write helpers.
 *
 * Reads/writes `.github/data/deal-discovery-ideas-cache.json`. Discovery ideas
 * are the entry point of the deal workflow; this lets the workbench API generate,
 * list, and re-load them across requests without hand-editing JSON. Mirrors
 * `curated-deal-cache.ts`.
 */

import * as fs from "fs";

import { DEALS_CACHE_PATHS, emptyDealDiscoveryIdeasCache } from "./caches";
import type {
  DealDiscoveryIdea,
  DealDiscoveryIdeasCache,
} from "./deal-discovery-types";
import { validateDealDiscoveryIdeasCache } from "./validate";

const CACHE_PATH = DEALS_CACHE_PATHS.dealDiscoveryIdeas;

export function loadDealDiscoveryIdeasCache(): DealDiscoveryIdeasCache {
  if (!fs.existsSync(CACHE_PATH)) {
    return emptyDealDiscoveryIdeasCache();
  }
  const raw = fs.readFileSync(CACHE_PATH, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  const result = validateDealDiscoveryIdeasCache(parsed);
  if (!result.ok || !result.value) {
    throw new Error(
      `deal-discovery-ideas-cache.json failed validation:\n  - ${result.errors.join("\n  - ")}`
    );
  }
  return result.value;
}

export function saveDealDiscoveryIdeasCache(cache: DealDiscoveryIdeasCache): void {
  const validated = validateDealDiscoveryIdeasCache(cache);
  if (!validated.ok) {
    throw new Error(
      `Refusing to write invalid deal discovery ideas cache:\n  - ${validated.errors.join("\n  - ")}`
    );
  }
  fs.writeFileSync(CACHE_PATH, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
}

/** Insert or replace an idea by id, returning the updated cache (not yet saved). */
export function upsertDealDiscoveryIdea(
  cache: DealDiscoveryIdeasCache,
  idea: DealDiscoveryIdea
): DealDiscoveryIdeasCache {
  const ideas = cache.ideas.filter((existing) => existing.id !== idea.id);
  ideas.push(idea);
  return { ...cache, generatedAtIso: new Date().toISOString(), ideas };
}
