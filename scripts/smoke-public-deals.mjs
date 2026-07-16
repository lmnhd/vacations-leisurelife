/**
 * Public-deals smoke test — catches the "silent degradation" failure mode where
 * the homepage/deal pages still return 200 but render fallback content (stock
 * yacht images, legacy layout without the ad-copy banner) because the
 * synthesis/manifest lookups stopped resolving.
 *
 * Run it against production right after any deploy that touches the deals
 * system (or any time you're suspicious):
 *
 *   npm run smoke-public-deals                                  # production
 *   npm run smoke-public-deals -- --base http://localhost:3000  # local dev
 *
 * Checks:
 *   1. Homepage lists at least one deal tile, and NO tile uses the stock
 *      Pexels fallback hero images (the "duplicate yacht photos" signature).
 *   2. Every /deals/[id] page linked from the homepage renders the "design"
 *      (synthesis) layout — a `data-deal-rendering="legacy"` marker means the
 *      funnel synthesis did not resolve for that deal.
 *   3. The tracking beacon answers correctly for a bogus id (deal_not_public).
 *
 * Exit code 0 = all good; 1 = something needs eyes. No writes, no test events.
 */

const args = process.argv.slice(2);
function argValue(flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}
const BASE = (argValue("--base") ?? "https://www.leisurelifeinteractive.net").replace(/\/$/, "");

// Deterministic stock fallbacks from public-deal-projection.ts — their presence
// on the homepage means a deal's synthesis (operator-selected hero) didn't load.
const FALLBACK_HERO_SIGNATURES = [
  "images.pexels.com/photos/163236/",
  "images.pexels.com/photos/3601425/",
  "images.pexels.com/photos/2144326/",
];

let failures = 0;
let warnings = 0;
const ok = (msg) => console.log(`  PASS  ${msg}`);
const warn = (msg) => {
  warnings += 1;
  console.log(`  WARN  ${msg}`);
};
const fail = (msg) => {
  failures += 1;
  console.log(`  FAIL  ${msg}`);
};

async function fetchText(url) {
  const res = await fetch(url, { redirect: "follow", headers: { "user-agent": "lll-smoke-public-deals" } });
  const text = await res.text();
  return { status: res.status, text };
}

console.log(`Public-deals smoke test against ${BASE}\n`);

// ── 1. Homepage ───────────────────────────────────────────────────────────────
console.log("Homepage:");
let dealIds = [];
try {
  const { status, text } = await fetchText(`${BASE}/`);
  if (status !== 200) {
    fail(`homepage returned HTTP ${status}`);
  } else {
    dealIds = [...new Set([...text.matchAll(/href="\/deals\/([A-Za-z0-9_-]+)"/g)].map((m) => m[1]))];
    if (dealIds.length === 0) {
      fail("no /deals/[id] links found on the homepage — deal tiles are missing entirely");
    } else {
      ok(`${dealIds.length} deal tile link(s) found (${dealIds.join(", ")})`);
    }
    const hits = FALLBACK_HERO_SIGNATURES.filter((sig) => text.includes(sig));
    if (hits.length > 0) {
      fail(
        `stock fallback hero image(s) on homepage (${hits.length} of 3 signatures) — ` +
          "a deal's funnel synthesis is not resolving. Run: npm run backfill-public-content-refs"
      );
    } else {
      ok("no stock fallback hero images — every tile is using its operator-selected image");
    }
  }
} catch (error) {
  fail(`homepage fetch failed: ${error.message}`);
}

// ── 2. Deal pages ─────────────────────────────────────────────────────────────
console.log("\nDeal pages:");
for (const id of dealIds) {
  try {
    const { status, text } = await fetchText(`${BASE}/deals/${id}`);
    if (status !== 200) {
      fail(`/deals/${id} returned HTTP ${status}`);
      continue;
    }
    if (text.includes('data-deal-rendering="design"')) {
      ok(`/deals/${id} renders the design (synthesis) layout`);
    } else if (text.includes('data-deal-rendering="legacy"')) {
      fail(
        `/deals/${id} rendered the LEGACY layout — funnel synthesis not resolving ` +
          "(missing hero banner / wall-of-text symptom). Run: npm run backfill-public-content-refs"
      );
    } else {
      warn(`/deals/${id} has no rendering marker (build predates the marker, or CB-legacy deal)`);
    }
    const heroFallback = FALLBACK_HERO_SIGNATURES.some((sig) => text.includes(sig));
    if (heroFallback) warn(`/deals/${id} contains a stock fallback image`);
  } catch (error) {
    fail(`/deals/${id} fetch failed: ${error.message}`);
  }
}

// ── 3. Tracking beacon ────────────────────────────────────────────────────────
console.log("\nTracking beacon:");
try {
  const res = await fetch(`${BASE}/api/deals/0000000/track`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "user-agent": "lll-smoke-public-deals" },
    body: JSON.stringify({ eventType: "deal_page_view", attribution: {} }),
  });
  const body = await res.json();
  if (res.status === 200 && body?.success === true && body?.tracked === false) {
    ok("bogus id correctly rejected (deal_not_public) — beacon route + Dynamo read healthy");
  } else {
    fail(`unexpected beacon response: HTTP ${res.status} ${JSON.stringify(body)}`);
  }
} catch (error) {
  fail(`tracking beacon check failed: ${error.message}`);
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(
  `\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURE(S)`}` +
    (warnings > 0 ? ` · ${warnings} warning(s)` : "")
);
process.exitCode = failures === 0 ? 0 : 1;
