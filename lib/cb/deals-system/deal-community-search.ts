/**
 * Deal community placement search (Step 9/10) — real SerpAPI web search for
 * subreddits, YouTube channels, and forums matching a deal's niche audience,
 * surfaced for the operator to review and pick — never auto-applied and
 * never invented. Mirrors deal-image-search.ts's architecture exactly
 * (thin wrapper, declarative query specs, test seam) but over organic web
 * search instead of image search, since placement URLs need to be real,
 * verifiable pages rather than LLM-imagined community names.
 *
 * This exists because group campaigns' Google Ads placement targeting
 * regex-mines an LLM-generated research dossier for community mentions and
 * assumes anything that looks like "r/something" is real — it isn't
 * verified. Deals deliberately don't repeat that: every candidate here
 * carries the real search result url + the query that found it, and only an
 * operator click turns a candidate into an actual targeting placement.
 */

import { searchGoogleWeb } from "@/lib/services/media/google-web-search";

/** TEST SEAM — swap the SerpAPI call in proof scripts (mirrors deal-image-search.ts). */
type WebSearchFn = typeof searchGoogleWeb;
let webSearchFn: WebSearchFn = searchGoogleWeb;
export function __setDealCommunitySearchForTests(fn?: WebSearchFn): void {
  webSearchFn = fn ?? searchGoogleWeb;
}

export type DealCommunityPlatform = "reddit" | "youtube" | "forum_or_other";

export interface DealCommunityPlacementCandidate {
  /** Stable id within a single search response (hash of the url). */
  id: string;
  platform: DealCommunityPlatform;
  title: string;
  url: string;
  snippet: string;
  /** The query that surfaced this candidate. */
  sourceQuery: string;
  /** Always "serpapi_web_search" — never LLM-imagined. */
  provenance: "serpapi_web_search";
}

const QUERY_TEMPLATES: Record<DealCommunityPlatform, (niche: string) => string> = {
  reddit: (niche) => `site:reddit.com ${niche}`,
  youtube: (niche) => `site:youtube.com ${niche} channel`,
  forum_or_other: (niche) => `${niche} forum community`,
};

export function buildDealCommunityQuery(niche: string, platform: DealCommunityPlatform): string {
  return QUERY_TEMPLATES[platform](niche.trim());
}

function classifyPlatform(url: string): DealCommunityPlatform {
  if (/(^|[./])reddit\.com\//i.test(url)) return "reddit";
  if (/(^|[./])youtube\.com\//i.test(url)) return "youtube";
  return "forum_or_other";
}

function hash(value: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

function toCandidates(
  results: Awaited<ReturnType<WebSearchFn>>["results"],
  query: string
): DealCommunityPlacementCandidate[] {
  return results.map((r) => ({
    id: `community-${hash(r.url)}`,
    platform: classifyPlatform(r.url),
    title: r.title,
    url: r.url,
    snippet: r.snippet,
    sourceQuery: query,
    provenance: "serpapi_web_search" as const,
  }));
}

export interface SearchDealCommunityResult {
  query: string;
  platform: DealCommunityPlatform;
  candidates: DealCommunityPlacementCandidate[];
}

/** Search ONE platform's query for a niche. Hard-fails if the search throws (operator retries). */
export async function searchDealCommunityPlacements(
  niche: string,
  platform: DealCommunityPlatform,
  count = 10
): Promise<SearchDealCommunityResult> {
  const query = buildDealCommunityQuery(niche, platform);
  const response = await webSearchFn(query, count);
  return { query, platform, candidates: toCandidates(response.results, query) };
}

export interface SearchAllPlatformsResult {
  candidates: DealCommunityPlacementCandidate[];
  /** Per-platform outcome (query + how many returned), for operator legibility. */
  perPlatform: Array<{ platform: DealCommunityPlatform; query: string; count: number; error?: string }>;
}

/**
 * Search reddit + youtube + a general forum query and merge the results.
 * One platform failing never sinks the others (best-effort per-platform).
 * De-dupes by url.
 */
export async function searchDealCommunityPlacementsAllPlatforms(
  niche: string,
  perPlatformCount = 8
): Promise<SearchAllPlatformsResult> {
  const platforms: DealCommunityPlatform[] = ["reddit", "youtube", "forum_or_other"];
  const candidates: DealCommunityPlacementCandidate[] = [];
  const seen = new Set<string>();
  const perPlatform: SearchAllPlatformsResult["perPlatform"] = [];

  for (const platform of platforms) {
    try {
      const res = await searchDealCommunityPlacements(niche, platform, perPlatformCount);
      let added = 0;
      for (const c of res.candidates) {
        if (seen.has(c.url)) continue;
        seen.add(c.url);
        candidates.push(c);
        added += 1;
      }
      perPlatform.push({ platform, query: res.query, count: added });
    } catch (error) {
      perPlatform.push({
        platform,
        query: buildDealCommunityQuery(niche, platform),
        count: 0,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { candidates, perPlatform };
}
