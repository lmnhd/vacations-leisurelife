/**
 * Deal image sourcing (Step 7) — SERP candidate photos for a deal's selectable
 * image set, searched PER CATEGORY so the pool is diverse and each candidate
 * correlates to a landing-page section.
 *
 * Thin wrapper over the shared SerpAPI Google-Images service. Each category
 * (hero / cabins / lounges / atrium / dining / excursions / destination) has a
 * declarative query spec (`DEAL_IMAGE_CATEGORY_SPECS`) whose terms specialize the
 * deal's `cruiseLine + ship + destination` base query. Live by default; test-seamed
 * so proof scripts run offline.
 *
 * Provenance is always stamped (`serpapi_search`), and each candidate carries its
 * `category` + originating query. No bytes are downloaded — only URLs are captured.
 */

import { searchGoogleImages } from "@/lib/services/media/google-images";

import {
  DEAL_IMAGE_CATEGORY_SPECS,
  type DealImageCandidate,
  type DealImageCategory,
  type DealImageCategorySpec,
} from "./deal-page-design-types";

/** TEST SEAM — swap the SerpAPI call in proof scripts (mirrors the gateway seams). */
type ImageSearchFn = typeof searchGoogleImages;
let imageSearchFn: ImageSearchFn = searchGoogleImages;
export function __setDealImageSearchForTests(fn?: ImageSearchFn): void {
  imageSearchFn = fn ?? searchGoogleImages;
}

export interface DealImageQueryInput {
  cruiseLine: string;
  shipClassHint?: string;
  destination: string;
}

function specFor(category: DealImageCategory): DealImageCategorySpec {
  const spec = DEAL_IMAGE_CATEGORY_SPECS.find((s) => s.category === category);
  if (!spec) throw new Error(`Unknown image category "${category}".`);
  return spec;
}

/**
 * Build the SERP query for one category: the deal's ship facts (and destination,
 * when the category calls for it) plus the category's specializing terms.
 */
export function buildDealImageQuery(
  input: DealImageQueryInput,
  category: DealImageCategory
): string {
  const spec = specFor(category);
  const base = [input.cruiseLine, input.shipClassHint];
  if (spec.useDestination) base.push(input.destination);
  return [...base, ...spec.terms]
    .filter((s): s is string => Boolean(s && s.trim()))
    .join(" ")
    .trim();
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
}

/**
 * Short, stable hash of a string (FNV-1a, base36). Used to make a candidate id
 * that depends on the image url rather than its position in the result list, so
 * re-searching the same category/query can't mint colliding ids for distinct
 * images (every consumer de-dupes by imageUrl — the id must agree).
 */
function hash(value: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

function toCandidates(
  results: Awaited<ReturnType<ImageSearchFn>>["results"],
  query: string,
  category: DealImageCategory
): DealImageCandidate[] {
  return results.map((r) => ({
    id: `img-${category}-${slug(query)}-${hash(r.imageUrl)}`,
    imageUrl: r.imageUrl,
    thumbnailUrl: r.thumbnailUrl,
    contextUrl: r.contextUrl,
    title: r.title,
    width: r.width,
    height: r.height,
    provenance: "serpapi_search" as const,
    category,
    sourceQuery: query,
  }));
}

export interface SearchDealImagesResult {
  query: string;
  category: DealImageCategory;
  candidates: DealImageCandidate[];
}

/** Search SERP for ONE category. Hard-fails if the search throws (operator retries). */
export async function searchDealImagesByCategory(
  input: DealImageQueryInput,
  category: DealImageCategory,
  count = 12
): Promise<SearchDealImagesResult> {
  const query = buildDealImageQuery(input, category);
  const response = await imageSearchFn(query, count, "l");
  return { query, category, candidates: toCandidates(response.results, query, category) };
}

export interface SearchAllCategoriesResult {
  candidates: DealImageCandidate[];
  /** Per-category outcome (query + how many returned), for operator legibility. */
  perCategory: Array<{ category: DealImageCategory; query: string; count: number; error?: string }>;
}

/**
 * Diversified pool: search EVERY category and merge the results. One category
 * failing never sinks the others (best-effort per-category), so a transient SERP
 * hiccup on, say, "atrium" still yields a usable pool. De-dupes by image url.
 */
export async function searchDealImagesAllCategories(
  input: DealImageQueryInput,
  perCategoryCount = 8,
  categories: readonly DealImageCategory[] = DEAL_IMAGE_CATEGORY_SPECS.map((s) => s.category)
): Promise<SearchAllCategoriesResult> {
  const candidates: DealImageCandidate[] = [];
  const seen = new Set<string>();
  const perCategory: SearchAllCategoriesResult["perCategory"] = [];

  for (const category of categories) {
    try {
      const res = await searchDealImagesByCategory(input, category, perCategoryCount);
      let added = 0;
      for (const c of res.candidates) {
        if (seen.has(c.imageUrl)) continue;
        seen.add(c.imageUrl);
        candidates.push(c);
        added += 1;
      }
      perCategory.push({ category, query: res.query, count: added });
    } catch (error) {
      perCategory.push({
        category,
        query: buildDealImageQuery(input, category),
        count: 0,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { candidates, perCategory };
}
