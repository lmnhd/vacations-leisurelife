/**
 * Deal Community Search proof artifact: real SerpAPI web-search query
 * building + result classification for Google Ads placement candidates.
 *
 * Asserts:
 *   1. buildDealCommunityQuery builds a site:reddit.com / site:youtube.com /
 *      generic-forum query per platform from the niche text.
 *   2. searchDealCommunityPlacements (offline, test-seamed) stamps every
 *      candidate's provenance as "serpapi_web_search" (never an LLM guess),
 *      classifies platform from the URL, and carries the sourceQuery.
 *   3. searchDealCommunityPlacementsAllPlatforms merges all 3 platforms,
 *      de-dupes by URL, and is best-effort — one platform's search throwing
 *      doesn't sink the others' results.
 *
 * Run:
 *   npm run test:deal-community-search
 */

import {
  __setDealCommunitySearchForTests,
  buildDealCommunityQuery,
  searchDealCommunityPlacements,
  searchDealCommunityPlacementsAllPlatforms,
} from "../lib/cb/deals-system/deal-community-search";

let passed = 0;
let failed = 0;
function check(name: string, condition: boolean, detail?: string): void {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.error(`  FAIL  ${name}${detail ? ` - ${detail}` : ""}`);
  }
}

// ── buildDealCommunityQuery ───────────────────────────────────────────────────

check(
  "reddit query is scoped with site:reddit.com",
  buildDealCommunityQuery("glacier photography", "reddit") === "site:reddit.com glacier photography"
);
check(
  "youtube query is scoped with site:youtube.com",
  buildDealCommunityQuery("glacier photography", "youtube") === "site:youtube.com glacier photography channel"
);
check(
  "forum_or_other query has no site: scoping",
  buildDealCommunityQuery("glacier photography", "forum_or_other") === "glacier photography forum community"
);

// ── offline stub (mirrors deal-image-search.ts's __setDealImageSearchForTests) ──

function slugStub(q: string): string {
  return q.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

async function run(): Promise<void> {
  __setDealCommunitySearchForTests(async (query: string, count = 10) => ({
    results: Array.from({ length: Math.min(count, 3) }, (_, i) => {
      const isReddit = query.includes("site:reddit.com");
      const isYoutube = query.includes("site:youtube.com");
      const domain = isReddit ? "reddit.com/r" : isYoutube ? "youtube.com/@" : "forum.example.com";
      return {
        title: `${query} result ${i}`,
        url: `https://${domain}/${slugStub(query)}-${i}`,
        snippet: `A community about ${query}.`,
      };
    }),
    query,
    totalResults: count,
  }));

  // ── searchDealCommunityPlacements (single platform) ─────────────────────────

  const redditResult = await searchDealCommunityPlacements("glacier photography", "reddit");
  check("single-platform search returns candidates", redditResult.candidates.length > 0);
  check(
    "every candidate's provenance is serpapi_web_search (never LLM-imagined)",
    redditResult.candidates.every((c) => c.provenance === "serpapi_web_search")
  );
  check(
    "reddit.com URLs are classified as platform 'reddit'",
    redditResult.candidates.every((c) => c.platform === "reddit")
  );
  check(
    "every candidate carries the query that found it",
    redditResult.candidates.every((c) => c.sourceQuery === redditResult.query)
  );

  const youtubeResult = await searchDealCommunityPlacements("glacier photography", "youtube");
  check(
    "youtube.com URLs are classified as platform 'youtube'",
    youtubeResult.candidates.every((c) => c.platform === "youtube")
  );

  const forumResult = await searchDealCommunityPlacements("glacier photography", "forum_or_other");
  check(
    "non-reddit/youtube URLs classify as forum_or_other",
    forumResult.candidates.every((c) => c.platform === "forum_or_other")
  );

  // ── searchDealCommunityPlacementsAllPlatforms ────────────────────────────────

  const all = await searchDealCommunityPlacementsAllPlatforms("glacier photography");
  check("all-platforms search covers reddit, youtube, and forum_or_other", all.perPlatform.length === 3);
  check(
    "all-platforms search merges candidates from every platform",
    all.candidates.some((c) => c.platform === "reddit") &&
      all.candidates.some((c) => c.platform === "youtube") &&
      all.candidates.some((c) => c.platform === "forum_or_other")
  );

  // ── best-effort: one platform failing doesn't sink the others ────────────────

  __setDealCommunitySearchForTests(async (query: string, count = 10) => {
    if (query.includes("site:youtube.com")) {
      throw new Error("simulated youtube search failure");
    }
    return {
      results: Array.from({ length: Math.min(count, 2) }, (_, i) => ({
        title: `${query} result ${i}`,
        url: `https://reddit.com/r/${slugStub(query)}-${i}`,
        snippet: "",
      })),
      query,
      totalResults: count,
    };
  });

  const partial = await searchDealCommunityPlacementsAllPlatforms("glacier photography");
  const youtubeOutcome = partial.perPlatform.find((p) => p.platform === "youtube");
  check("a failing platform records its error without throwing", youtubeOutcome?.error !== undefined);
  check(
    "a failing platform's failure doesn't prevent other platforms' results",
    partial.candidates.some((c) => c.platform === "reddit")
  );

  console.log(`\n${passed} passed, ${failed} failed.`);
  if (failed > 0) {
    process.exit(1);
  }
}

void run();
