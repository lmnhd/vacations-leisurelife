# Funnel Synthesis — Deal Workflow Step 7 (Design)

> Status: **Implemented.** Authored 2026-06-11. Step 7 is a hub-and-spoke funnel
> split. The Step 3 copywriter output is top-of-funnel raw material — verbose,
> hyper-niche, ideal for *flagging* a subculture but wrong for a public page. Step 7
> turns it into two purpose-built assets: a **broad-market landing page** and a
> **hyper-niche Meta carousel** — plus a **selectable SERP image set** for the page.
> This doc is the spec AND the as-built reference.

## Why this step exists

The copywriter (Step 3) writes one long, jargon-dense ad per niche. Dumping that wall
of inside-baseball text onto a public `/deals/[id]` page would isolate every standard
retail traveler, every partner who isn't into the niche, and all organic traffic.

The fix is a classic conversion funnel that separates concerns:

| | Audience | Voice | Job |
|---|---|---|---|
| **The ad** (carousel) | hyper-targeted | inside-baseball jargon | win click-through from the exact subculture at low ad spend |
| **The page** (landing) | broad | premium, jargon-stripped | validate the vibe — "this looks like an incredible cruise" — and convert |

By the time a user clicks the niche ad and lands, they already know *why* they're there.
The page doesn't repeat the jargon; it proves the ship has the premium cabins, quiet
lounges, and beautiful ports that fulfill the ad's promise.

## The agent: CRO funnel split

### System role
> You are a conversion-rate-optimization (CRO) specialist. Your job is to take a
> verbose, hyper-niche ad copy draft and split it into two distinct digital assets: an
> inclusive, visually-driven Landing Page and a hyper-targeted Meta Carousel ad.

### Input
The operator-selected `DealAdCopy` variant (Step 3) — `{{HIGH_NICHE_COPY_DRAFT}}`:
headline, bodyCopy, pricingDisclaimers, callToAction, interestKeywords.

### Part 1 — the landing page (broad market)
- Tone: sophisticated, relaxed, premium — "a great cruise with great perks."
- **Remove ALL hyper-specific niche vocabulary** (hobby, props, brands, in-jokes,
  personas). Keep the *vibe* the ad promised (peace, ocean views, quiet sophisticated
  spaces, unhurried dining, atmospheric ports), strip the jargon.
- Short paragraphs (≤3 sentences) sitting next to premium imagery, broken into exactly
  five ship segments in order: **Cabins · Lounges · Atrium · Dining Rooms · Excursions**.
- Plus a broad `heroHeadline` + one-line `heroSubhead`.

### Part 2 — the Meta carousel (hyper niche)
- Tone: inside-baseball, urgent, direct-response.
- A **4-card sequence**, each card `headline` (≤40 chars) + `primaryText` (≤125 chars).
- **Double down** on the subculture's exact words and pain points to flag the consumer
  scrolling the feed.

## The selectable image set (SERP) — categorized + diversified

Step 7 curates the deal's imagery, mirroring the group-campaigns landing-studio gallery
flow — scan thumbnails, pick a set, pick a hero. Crucially, the pool is **searched per
category** so it's diverse and each candidate correlates to the copy section it
illustrates:

- **Categories** (`DealImageCategory`): `hero · cabins · lounges · atrium · dining ·
  excursions · destination`. The five interior categories map 1:1 to the landing
  segments; `hero` and `destination` cover the page hero and port scenery.
- **Per-category query specs** (`DEAL_IMAGE_CATEGORY_SPECS`) are declarative: each
  category appends specializing terms to the deal's `cruiseLine + shipClassHint +
  destination` base (e.g. cabins → "stateroom balcony cabin interior veranda";
  excursions → "port shore excursion old town harbor"). Interior categories search the
  ship only; hero/excursions/destination include the destination. This diversifies the
  pool AND makes each photo correlatable to a section.
- **Source** — `searchDealImagesByCategory` runs one category; `searchDealImagesAllCategories`
  runs every category and merges (de-duped by url, best-effort per category so one
  failing search never sinks the pool). Both go through the shared SerpAPI service,
  **test-seamed** (`__setDealImageSearchForTests`). No bytes are downloaded — only URLs;
  provenance (`serpapi_search`), the `category`, and the source query are stamped on
  every `DealImageCandidate`.
- **Curate** — the lab groups candidates by category with a per-category "+ more"
  refresh. The operator toggles candidates into an ordered `galleryIds`, picks a
  `heroImageId`, and assigns a per-segment `imageId`. The per-segment picker **filters to
  the matching category** (the Cabins block shows cabin photos), falling back to the full
  gallery only for older uncategorized syntheses. `setDealFunnelImageSelection` persists
  and rejects any image id not among the candidates.

## Complete deal facts (the page must be self-sufficient for purchase)

The page must let a guest buy **without leaving** — so the payload carries the full
public-safe cruise facts, not just copy + images. `assembleDealPageFacts(manifest,
promoRecords)` (pure, no AI — `deal-page-facts.ts`) builds a `DealPageFacts`:

- **Ship name, sail date, nights, cruise line** — real values from the manifest's
  `resolvedPackage` (Step 4); the ship class hint / sail window are the draft fallback.
- **Itinerary + every stop** — `departurePort` + ordered `portsOfCall` + the structured
  `itinerary` (departure/arrival, ports, `mapPath`).
- **Cabin pricing** — `{ inside, outside, balcony, suite, currencyCode, leadFare }`, real
  Odysseus fares (never fabricated; absent → page falls back to live-lookup price block).
- **Specials / deals / promo packages** — each applied promo reduced to PUBLIC-SAFE
  fields only: `summary` (visitorFriendlySummary), `publicClaims`, `qualifiedClaims`
  (show with a qualifier), structured `perks` (% off / $ savings / OBC / free-guest), and
  `bookingWindow`. Agent-only notes and unqualified claims never cross over.
- `readiness` is `"resolved"` (real facts) or `"draft"` (pre-Step-4), with `notes`
  telling the operator what's missing — surfaced in the lab's **Cruise facts panel**.

### Where the itinerary + pricing come from (upstream capture, not fabrication)

The day-by-day itinerary, ports, route map, and cabin pricing are **real Odysseus data**,
not AI guesses. The Odysseus search result (`CruiseResult`) already carries `itinerary`
(departure/arrival, ports, `mapPath`) + `prices` — they were simply **discarded at
ranking**. The fix runs upstream-first:

1. `RankedPackageCandidate` now keeps `itinerary` + `cabinPricing`
   (`scoreOne` + `extractCabinPricing` in `lib/cb/link-broker/package-lookup.ts`).
2. Step 4 `applyResolvedPackage` threads them onto `DealManifestResolvedPackage`
   (`cabinPricing`, `itinerary`).
3. `assembleDealPageFacts` surfaces them in the funnel payload.

The richer per-DAY schedule WITH arrival/departure times (the Odysseus package-detail
view) is a scoped follow-up — the search result gives ports + map + pricing today.

## Handoff to Claude Design (the hosted page)

The deal **page design** (layout, color, typography, motion) is produced by **Claude
Design**, not auto-generated here — the operator's decision. Step 7's job is to hand it a
clean, complete brief:

- `CLAUDE_DESIGN_DEAL_PAGE_PRIMER.md` is the deal-agnostic system/primer instruction
  (role, the funnel context, the **self-sufficiency mandate**, mobile-first/CTA/imagery
  constraints, the exact output contract: rationale + design tokens JSON + section spec
  incl. itinerary/pricing/specials + wireframe + a self-contained HTML/CSS prototype). It
  ends with a `{{FUNNEL_SYNTHESIS_JSON}}` slot.
- The lab's **"Copy Claude Design payload"** button serializes the active synthesis into
  exactly that slot's shape — `dealFacts` (ship/date/itinerary/stops/pricing/promos) +
  the broad landing copy + only the curated images (hero + gallery + per-segment picks,
  each with its `category`) — for paste-in. One funnel -> one complete page design.

## Guardrails enforced in code (validate-and-warn, never auto-fix)

- **Carousel length** — `validateCarouselCard` flags any card over 40/125 chars as an
  operator warning; copy is never truncated mid-word. The lab shows a live `n/40` and
  `n/125` counter per card.
- **Landing broad-appeal** — `validateLandingBroadAppeal` scans the page copy for an
  always-wrong-for-public category list (`rpg`, `vampire`, `dice`, brand names, etc.)
  and warns if niche jargon leaked through. Surfaced, not auto-rewritten — consistent
  with `validateAdCopyVoice` (Step 3) and `validateSailingAngleProfile` (Step 1).

## How this maps to the current implementation (as-built)

| Concern | File | Notes |
|---|---|---|
| Contracts | `lib/cb/deals-system/deal-page-design-types.ts` | `DealFunnelSynthesis` (`landingPage` + `carousel` + image set), `DealLandingSegment`, `DealCarouselCard`, `DealImageCandidate`, cache. |
| Generator | `lib/cb/deals-system/deal-page-design-generator.ts` | Claude Opus via gateway, AI-only/hard-fail. CRO system prompt; orders segments; `validateCarouselCard` / `validateLandingBroadAppeal`. Test seam `__setFunnelSynthesisStructuredObjectGeneratorForTests`. |
| Image categories | `lib/cb/deals-system/deal-page-design-types.ts` | `DealImageCategory` + `DEAL_IMAGE_CATEGORY_SPECS` (per-category query terms); `DealImageCandidate.category`. |
| SERP sourcing | `lib/cb/deals-system/deal-image-search.ts` | `searchDealImagesByCategory` / `searchDealImagesAllCategories` (diversified, de-duped, best-effort per category) over the shared SerpAPI service; `buildDealImageQuery(input, category)`; test seam `__setDealImageSearchForTests`. |
| Deal facts | `lib/cb/deals-system/deal-page-facts.ts` | `assembleDealPageFacts` (pure) → `DealPageFacts` (ship/date/itinerary/stops/pricing/public-safe promos + readiness). |
| Upstream itinerary+pricing | `lib/cb/link-broker/package-lookup.ts`, `lib/cb/deals-system/deal-package-resolver.ts`, `deal-trip-manifest-types.ts` | `RankedPackageCandidate.itinerary` + `.cabinPricing` (`extractCabinPricing`); threaded onto `DealManifestResolvedPackage` in `applyResolvedPackage`. |
| Deal-facts wiring | `funnel-synthesis/route.ts` + `funnel-synthesis/page.tsx` | both assemble `dealFacts` per ad copy; lab renders a Cruise-facts panel + includes `dealFacts` in the Claude Design payload. |
| Cache | `lib/cb/deals-system/deal-funnel-synthesis-cache.ts` | load/save/`upsertDealFunnelSynthesis`; `setDealFunnelImageSelection` (pure, id-validated). |
| Wiring | `caches.ts` / `validate.ts` / `index.ts` | cache path + empty factory + `validateDealFunnelSynthesisCache` + barrel exports. |
| API | `app/api/tests/deals-system/funnel-synthesis/route.ts` | `GET` adCopies+manifests+syntheses; `POST {action:"synthesize", adCopyId, variantIndex?}` (runs the split + diversified SERP source); `POST {action:"search_images", synthesisId, category?}` (one category or whole pool); `POST {action:"select_images", synthesisId, galleryIds?, heroImageId?, segmentImageIds?}`. |
| Lab UI | `app/(tests)/tests/deals-system/funnel-synthesis/page.tsx` + `funnel-synthesis-view.tsx` | Ad-copy picker (deep-link `?adCopyId=`), synthesize, category-grouped SERP gallery (per-category "+ more"), per-segment picker filtered to category, landing/carousel render with live char counts + warnings, **"Copy Claude Design payload"**, AI-debug panel. |
| Page design primer | `CLAUDE_DESIGN_DEAL_PAGE_PRIMER.md` | Deal-agnostic Claude Design system/primer; consumes `{{FUNNEL_SYNTHESIS_JSON}}` (the copied payload). |
| Dashboard | `dashboard-view.tsx` | "Step 7 · Funnel Synthesis" panel; Step 3 ad-copy cards carry a "Synthesize funnel →" cross-link. |
| Test | `tests/deal-funnel-synthesis.ts` (+ `tests/deals-ai-stub.ts`) | 28 assertions: 5-segment split, carousel count, length warn-not-truncate, jargon flag, categorized + diversified SERP pool, per-segment category match, selection persist + unknown-id throw, cache validation. Run: `npm run test:deal-funnel-synthesis`. |
| Test (deal facts) | `tests/deal-page-facts.ts` | 28 assertions: `extractCabinPricing` cabin-tier mapping, resolved vs draft facts, ports fallback, promo reduction to public-safe (agent-only notes never cross over), unknown-promo note. Run: `npm run test:deal-page-facts`. |

## Downstream contract

- The **landing page** copy + chosen hero/gallery feed the public `/deals/[id]` page
  (Publish, Step 5). Wiring the projection to read the curated hero + segment imagery is
  a small follow-up; the synthesis carries everything the page needs.
- The **carousel** is the real, useful replacement for the (removed, premature) "Meta
  Ads Export" — a feed-ready 4-card hyper-niche ad that flags the subculture.

## What was removed / parked

- **"Meta Ads Export" (formerly Step 6) was removed** — premature; the carousel here
  replaces its purpose.
- **Real rendered ad creatives (Canva/flyer) are parked.** Those generators are
  Campaign-entity + slug + R2 coupled. The clean path is a future `deal_campaign`
  workflow feeding the workflow-agnostic `NormalizedAdInput` renderer — not a synthetic
  Campaign. Step 7 produces the copy + image set that such a step would consume.

## Guardrails (carried from policy)
- LLM Gateway Mandate: the synthesis generates via `generateStructuredObject` +
  `ModelName.CLAUDE_4_OPUS`; no provider SDKs.
- The only AI call is the synthesis; image search hits SerpAPI but downloads no bytes;
  selection is pure.
- No booking/hold/publish from Step 7.
- Deals stay separate from Groups: reads only deals caches + the shared SerpAPI service.
