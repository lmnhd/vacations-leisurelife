# Status — Deal Workflow Build

## DONE — Step 2 narrowed: promo-only AI + deterministic framing (2026-06-15)

After the inversion, Step 1B (niche-reformer) and Step 2 both wrote AI marketing framing for
the SAME real cruise — Step 2's AI re-derived `itineraryName`/`destination` from facts the
grounded candidate already carried (a drift risk, since both fed the Step 3 copywriter prompt).
Traced the full 1B→2→3 field flow and collapsed only the redundant part (option 1, not a full
step removal — promo correlation + booking-link resolution are genuinely unique to Step 2):

- **`deal-trip-manifest-generator.ts`** — `manifestSchema` reduced to `appliedPromos` +
  `promoStrategy` + `manifestReasoning` (dropped AI `itineraryName`/`destination`/`shipClassHint`).
  Added pure `deriveDestination()` (region from cruiseName + ports) + `deriveItineraryName()`
  (real nights + region) — framing is now DETERMINISTIC from `groundedCandidate`, so it can never
  drift from the reformer. SYSTEM_PROMPT + buildPrompt narrowed to promo correlation only;
  `shipClassHint` left unset (optional). Header doc updated.
- **`deal-trip-manifest-types.ts`** — fixed STALE docs that described the pre-inversion manual
  "operator pastes lookupQuery into Package Lookup / Step 4 Resolve / agent CANNOT fetch packageId"
  flow. Now describes inventory-first reality (packageId known from Discovery; framing derived;
  AI = promos only; link broker resolves the booking link).
- **`tests/deal-trip-manifestation.ts`** — added assertions that `destination`/`itineraryName`
  are derived from the grounded ports (Nassau,Cozumel → "Caribbean" / "7-Night Caribbean"),
  NOT from the AI stub (which no longer emits them). 25/25.
- Net: Step 2's AI call is now promo-only (cheaper prompt, no quality loss); each step's job is
  crisp — Discovery = real deal + niche; Step 2 = promos + booking link; framing = facts.
- Full deals suite green (268 assertions, 0 fail); tsc clean. NOTE: live route needs a dev-server
  restart to pick up the new generator (proof scripts already run the new code via tsx).

## DONE — Inventory-first Discovery: killed "nothing matches this angle" by inversion (2026-06-15)

The root cause of "nothing in inventory matches this angle" was never the scorer — it was
the **direction of the workflow**. Old Discovery: AI invents a niche → invents a fabricated
destination/season/cruise-line → we hunt inventory trying to make a real ship fit the
fiction → almost nothing fits → angle discarded. The niche was the cause; the ship was
forced to be the effect. That inversion made the failure *structural*.

**New direction (re-envisioned with the operator, 2026-06-15):** start from REAL, bookable
inventory. A broad sweep pulls genuine sailings, a deterministic scorer selects the best
"excellent deals" by objective signals, and only THEN does the AI re-form a niche to fit
each winning cruise. The ship is the cause; the niche is the effect — so an angle can no
longer exist without a real ship, **by construction**. Operator decisions locked:
- **Deal selection = inventory signals only** (no research-steering of the search; the net
  is cast broad and objective deal-quality wins).
- **Niche matching = match-or-discard** (if no honest, specific niche fits a strong cruise,
  the cruise is held as "strong deal, no angle yet" — never a contrived audience).

### DONE — Step 1A: Deep Cruise Search & Select (2026-06-15)

- **`lib/cb/deals-system/deep-cruise-search.ts`** — pure, deterministic scorer + selector
  (no browser / network / AI). Scores each real `CruiseResult` on five objective signals,
  all read from real inventory data (zero fabrication):
  - **value** (≤0.35) — per-night lead fare vs an $80–$350/night band (via `extractCabinPricing`).
  - **sea-day density** (≤0.20) — `nights − ports`, normalized; rewards restful long voyages.
  - **itinerary distinctiveness** (≤0.30) — ocean crossings, world/grand voyages, expedition
    regions (fjords/Antarctic/Galápagos), long one-way repositionings; the deal-merit version
    of the broker's itinerary intelligence, scoring the sailing on its OWN terms (not fit-to-a-query).
  - **group-rate** (≤0.08) — margin sweetener (facet not yet surfaced by `searchCruises`; defaults false).
  - **promo overlap** (≤0.07) — live CB promo whose vendor + sail window could apply (via `prefilterPromoRecords`).
  `qualityScore` = Σpoints / maxPoints, clamped 0..1, with a per-signal breakdown for transparency.
  `selectDealsFromSweep()` de-dups by packageId (keeps higher-scored) and returns top-N best-first.
- **`scripts/deep-cruise-search.ts`** (+ `npm run deep-cruise-search`) — operator-run broad
  sweep over forward date windows (`--months 6,12,18` default, each ~3-month span),
  vendor-unfiltered so all lines compete; emits a `---DEEP_CRUISE_SEARCH_RESULT_JSON---` block.
- **`tests/deep-cruise-search.ts`** (+ `npm run test:deep-cruise-search`) — **21/21 pass.**
- **Proven against LIVE Odysseus:** swept **100 real sailings**, surfaced genuinely excellent
  deals — e.g. a 15-Day South America repositioning (Carnival, real pkg `1622160`) at **$74/night**
  with a live promo applying → 0.82; 14-Day Southeast Asia Sydney→Singapore at $71/night → 0.81.
  Every selected deal is a real, bookable cruise with real fares + itineraries.
- No regressions: deal-discovery (23), trip-manifestation (23), copywriter (27) green; tsc clean.

### DONE — Step 1B: Match & Re-Form Niche (2026-06-15)

- **`lib/cb/deals-system/niche-reformer.ts`** — `reformNicheForDeal(deal, opts)` feeds ONE
  real `SelectedDeal` + saved niche research to the model with the inverted question: "which
  niche is THIS real cruise the uniquely ideal venue for? Re-form its angle to fit this exact
  ship/itinerary/season." The cruise facts are non-negotiable truth; the AI only picks the
  niche + writes framing. Reuses the `SailingAngleProfile` schema + `validateSailingAngleProfile`
  voice rules, so downstream is unchanged.
- **Match-or-discard** (operator-locked): model returns `nicheFits` + `fitConfidence` +
  `fitReasoning`. Below `NICHE_FIT_THRESHOLD` (0.7) or an explicit decline → `held` outcome
  ("strong deal, no angle yet"), never a forced/contrived audience. A `matched` outcome is a
  full `DealDiscoveryIdea` whose `groundedCandidate` is populated from the REAL deal facts
  (packageId/line/sailDate/nights/ports), with the deal's qualityScore as its confidence —
  nothing fabricated. AI failure propagates (hard fail). NOTE: this threshold gates NICHE FIT,
  not inventory reality (the cruise is already real by construction).
- Test seam `__setNicheReformerStructuredObjectGeneratorForTests` + a `reform` stub candidate
  added to `tests/deals-ai-stub.ts` (schema-discriminated, no cross-stage interference).
- **`tests/niche-reformer.ts`** (+ `npm run test:niche-reformer`) — **17/17 pass** (matched,
  decline, below-threshold, missing-research guard).
- No regressions: deal-discovery (23), trip-manifestation (23), copywriter (27), funnel (28),
  deep-cruise-search (21) all green; tsc clean.

### DONE — Step 1C: Rewrote the discovery route + view (2026-06-15)

- **`app/api/tests/deals-system/discovery/route.ts`** — POST now runs Step 1A (`runDeepCruiseSearch`,
  a new route-only child-process runner in `deep-cruise-search-runner.ts` that shells the
  operator sweep + parses its JSON) then Step 1B (`reformNicheForDeal` per selected deal,
  match-or-discard). Over-pulls `max(2×count, count+3)` deals so held deals don't starve the
  batch; skips deals already cached (idempotent re-runs by packageId); seeds + grows a
  `usedNiches` exclusion across the batch for niche diversity. Deleted the old
  `groundAngleAgainstInventory` function and all `buildAngleSearchSeed` / `runOdysseusLookup` /
  `MATCH_CONFIDENCE_THRESHOLD` imports from the route. Response carries `dealsConsidered` +
  `heldCount`; "exhausted" now means "every fresh deal held for lack of a niche fit," never
  "no inventory." (`buildAngleSearchSeed` / `MATCH_CONFIDENCE_THRESHOLD` remain in the lib —
  still used by Step 2 targeted resolution; only Discovery stopped using them.)
- **`discovery-view.tsx`** — message rewritten: "N new angle(s) matched to real deals from M
  real deal(s) considered (K strong deal(s) held for lack of a niche fit)." No more
  "discarded — no inventory match," because inventory is never the missing thing now.
- **Niche-diversity refinement** added to `niche-reformer.ts`: `usedNiches` option → a
  "prefer a different niche" exclusion block (mirrors the old generator's dedup), so a batch
  of long sea-day voyages doesn't get the same niche stamped on every one.

### PROVEN END-TO-END (live Odysseus, 2026-06-15)

`POST /api/tests/deals-system/discovery {count:4}` → **4 angles, 4 DISTINCT niches**, each
grounded on a different real Carnival "Journeys" sailing with a real package id:
Solo-Journaling RPG → 15-Day South America (pkg 1622160); Cyanotype Alchemists → 14-Day SE
Asia (1583429); Sashiko Menders → 16-Day SE Asia (1583431); Mechanical Puzzle Solvers →
16-Day South America (1622162). `generated:4, dealsConsidered:8, heldCount:0`. Every angle
born from real, bookable inventory — the ship-before-niche guarantee holds by construction.

**Full suite green:** deep-cruise-search 21, niche-reformer 17, deal-discovery 23,
trip-manifestation 23, copywriter 27, funnel 28, page-facts 28, curated-deal-assembly 40,
public-deal-projection 59 (266 assertions, 0 fail). tsc clean.

## DONE — Deal expiration flow (2026-06-12)

Optional `expiresOnIso` on the trip manifest → unified manifest → curated deal. Omitted =
unchanged behavior (never expires). Date-only values (`2026-06-27`) stay public through
the end of that UTC day, then the central `isDealHomepageEligible` gate (via new
`isDealExpired` / `dealExpiryDate` in `curated-deal-assembly.ts`) excludes them from BOTH
the homepage and `/deals/[id]`. Invalid values fail open (no expiry). No cache data edited
— add a live deal's expiry manually. tsc clean; public-deal-projection + curated-deal-
assembly suites green. See `DEAL_EXPIRATION_DESIGN.md`.

## DONE — Premium Deal Page master template wired to live data (2026-06-12)

The Claude Design "Deal Page" handoff is the production `/deals/[id]` master template.
`projectPublicDealPage(deal, synthesis?, promoRecords?)` now attaches a `designPage` view
(hero + fact band + five alternating segments + itinerary + pricing table + specials),
rendered by `components/cb/deal-landing-page.tsx` (+ client enhancements: fonts, fade-up
reveal, sticky mobile CTA). `getPublicDealPageById` hydrates pricing from the matched trip
manifest and matches the funnel synthesis across carried trace ids (deal/package/brief/
manifest/ad-copy) via `findDealFunnelSynthesisForDeal`, so live-id deals still resolve
their synthesis. Resolved/draft fork; image fallbacks per slot; no fabricated facts. Route
renders the premium page when `designPage` is present, legacy layout otherwise. tsc +
build clean; all 14 deals-system suites green (public-deal-projection 59). See
`DEAL_PAGE_IMPLEMENTATION_PLAN.md`.

## DONE — Itinerary-aware ranking: the real fix for "no usable match" (2026-06-12)

The multi-line fallback (below) was treating a symptom. The real bug: the package
ranker (`lib/cb/link-broker/package-lookup.ts`) scored candidates almost entirely on
**sail-date proximity + night-count**, and was blind to *what kind of cruise* each
sailing is. Because the angle's requested date is a fabricated season-center, every
real sailing fell outside the date tolerance and scored an identical ~0.05 — so
`--best-effort` (which sorted by date proximity FIRST) handed back whatever sailing
happened to be date-closest: e.g. a **4-night Singapore day-cruise** for a
**Transatlantic** angle, while a genuine **"13-Night Westbound Transatlantic Cruise
From Southampton → Fort Lauderdale"** sat tied-for-last in the same 50-result pool.

Two changes fix it:

1. **`scoreItineraryFit()`** — reads what a sailing actually IS from its name + port
   sequence and matches it against the angle's destination CONCEPT (not an exact
   substring): detects transatlantic/ocean crossings (departure continent ≠ arrival
   continent, one-way, long), world-voyage / high-sea-day / repositioning runs, and
   region/named-destination matches (Caribbean, Mediterranean, fjords, etc.). Worth up
   to **+0.45 confidence** — now the dominant real signal, with explanatory reasons.
   A `portContinent()` helper buckets embarkation/disembarkation ports by continent.
2. **Best-effort sort = confidence FIRST, date only as a near-tie (±0.02) tiebreaker.**
   The fabricated season-center date can no longer drag a junk sailing above a genuine
   itinerary-type fit. Strict (group-broker) mode is unchanged.

Result: a "Transatlantic" angle now ranks the real Southampton→Lauderdale crossing #1
instead of a Bahamas hop. `tsc` clean; `test:package-lookup` 19/19 (backward compatible
— equal-confidence pools still break ties by date as before).

## DONE — Multi-line cruise-line fallback for Step 2 inventory match (2026-06-12)

Root cause of the stuck `manifest-roll-dice-write-the-wake-cunard` manifest: not a bug —
this CB/Odysseus agency feed's "Cunard" allotment contains only ~6-7 European/Asian
fly-cruise itinerary templates and NO Transatlantic (QM2) crossing product, regardless of
search window. A single line's live allotment can be thin or missing the angle's
itinerary type entirely, even though the FLEET-WIDE feed (14 lines, hundreds of
departures) almost always has something that fits.

Fix: Step 2 now searches **multiple candidate cruise lines in order**, not just one.

- **`DealManifestAssembleDraft.alternateCruiseLines?: string[]`** (`deal-trip-manifest-types.ts`) —
  2-3 ranked fallback lines sharing the angle's onboard-asset/vibe profile.
- **Generator** (`deal-trip-manifest-generator.ts`): schema + system prompt updated so the
  AI returns `cruiseLine` (primary) AND `alternateCruiseLines` (2-3 fallbacks with a similar
  fleet profile, e.g. for a quiet/library/sea-day angle: Cunard, then Holland America, then
  Princess).
- **Route** (`trip-manifestation/route.ts`): the resolution loop tries
  `[cruiseLine, ...alternateCruiseLines]` in order, running the broad `runOdysseusLookup`
  for each until one returns a non-empty candidate pool (de-duped, first non-empty wins).
  The resolved manifest's `lookupQuery.line` reflects whichever line actually matched.
  AI fit-select + reframe (existing mechanism, `needsReframe`/`reframedItineraryName`/etc.)
  then runs once on that pool, as before — fit-select always chooses one, so the fallback
  triggers only on a genuinely EMPTY pool for a given line, not a loose fit (loose fits are
  handled by reframe on whichever line produced candidates).
- Stub (`tests/deals-ai-stub.ts`) manifest candidate now includes `alternateCruiseLines`.
- `tsc` clean; full `test:deals-system:all` (14 suites) green.

Still open: re-run Step 2 for `angle-roll-dice-write-the-wake` against live Odysseus to
confirm the fallback resolves the stuck Cunard manifest (via Holland America/Princess or a
Cunard reframe).

## DONE — One-call resolution folded into Trip Manifestation; Step 4 lab removed (2026-06-11)

Architectural fix: a manifest is no longer "done" until it is tied to ONE real
Odysseus cruise (ship, sail date, itinerary, cabin pricing, AND booking link).
Resolution now happens immediately as part of Step 2, not deferred to a separate
manual lab.

### Inventory-aware Step 2 (2026-06-11 update)

Step 2 is now **inventory-aware**: it searches live cruise inventory broadly, uses an
AI fit-select pass to pick the best real cruise, and auto-resolves the booking link.
The old "no match" dead-end is gone.

- **Broad `lookupQuery`**: the manifest generator no longer pins to a specific ship/date.
  The query omits `ship`, uses a wide `windowDays` (60+), and treats destination as a
  category. This prevents over-specific angles that fail to match real inventory.
- **`bestEffort` ranker** (`package-lookup.ts`): overrides the strict ±3 day sail-date
  tolerance. If any candidates exist, one is always selected (never `no_match`). A
  fallback retry drops the vendor filter if the initial search is empty.
- **AI fit-select** (`selectBestFitCandidate` in `deal-trip-manifest-generator.ts`):
  given the pool of real inventory candidates, a second AI pass picks the package
  that best embodies the angle's essence. Returns `chosenPackageId`, `fitRationale`,
  and `runnerUpPackageIds` — surfaced in the lab UI.
- **JSON emission** (`scripts/lookup-odysseus-package.ts`): the CLI script emits a
  machine-readable `---ODYSSEUS_LOOKUP_RESULT_JSON---` block with full candidate data
  (itinerary, cabin pricing, cruise line, ports). `deal-package-resolution.ts` parses
  this JSON block first, falling back to legacy regex for older runs.
- **Reconcile** (`reconcileAssembleDraftWithResolved` in `deal-package-resolver.ts`):
  factual fields (`nights`, `departurePortHint`, `portsOfCall`) sync from the resolved
  real cruise; marketing fields (`itineraryName`, `destination`, `shipClassHint`) are
  preserved from the AI's angle-crafted draft.

### Original one-call resolution (preserved)

- **`deal-package-resolution.ts`** (new, server-only, not in barrel) — wraps the live
  Odysseus lookup (`runOdysseusLookup`, shells out to `lookup-odysseus-package`) and the
  link-broker booking-link build (`resolveCandidateOntoManifest`) into one module. Only
  imported directly by API routes (uses `node:child_process`).
- **Step 2 route (`trip-manifestation/route.ts`)**: after `generateDealTripManifest`,
  immediately runs the Odysseus lookup in the SAME request.
  - `confident_match` → auto-resolves via the broker and stamps `resolvedPackage` —
    operator does nothing extra.
  - `ambiguous` → saves the unresolved manifest and returns `candidates[]` for an
    inline pick via the new `resolve_candidate` action (still Step 2, no separate lab).
  - `no_match` / `lookup_failed` → manifest saved unresolved and blocked from
    proceeding (no "Write ad copy" link).
- **Manifestation lab**: badge shows `resolved · {ship}` or `needs resolution`; new
  `ResolvedPackagePanel` (full resolved-package display), `CandidatePicker`
  (ambiguous inline pick), and **fit rationale panel** components. "Write ad copy →"
  only active once `resolvedPackage` exists.
- **Step 3 (copywriter) gated** on `resolvedPackage`: route returns 409 if missing; lab
  disables unresolved manifests in the picker with a "needs resolution" note.
- **Step 4 "Resolve" lab removed entirely** — deleted
  `app/(tests)/tests/deals-system/resolve/` and
  `app/api/tests/deals-system/resolve-package/route.ts` (logic relocated into
  `deal-package-resolution.ts`).
- **Renumbered**: Publish is now Step 4, Funnel Synthesis is now Step 5 (dashboard +
  lab headers + route doc comments updated).
- Caches (`.github/data/*.json` for discovery/manifests/ad-copy/funnel-synthesis)
  cleared for a clean end-to-end re-run on real data.

## DONE — Lab UI cleanup + Claude Design = master template (2026-06-11)

- **Claude Design is a ONE-TIME master-template step, not a workflow node.** Reframed
  `CLAUDE_DESIGN_DEAL_PAGE_PRIMER.md`: it designs one reusable `/deals/[id]` template
  that dynamically renders ANY deal's payload (like the Multi-Flavor group landing
  pages). The appended funnel is just a representative example to ground the prototype;
  design for the payload CONTRACT. No re-running Step 2/3 needed — `dealFacts` is
  assembled live on every lab load, so an existing synthesis already gets the new
  itinerary/pricing/specials fields in its payload (resolve Step 4 for real values).
- **Lab UI optimized (Steps 1–3).** New shared `result-list.tsx` (`ResultList`):
  - collapsible result cards (summary header always visible, detail on demand),
  - header with count + expand-all / collapse-all,
  - latest-only view (newest 3, "show older" toggle),
  - per-result delete (× → confirm) wired to new `DELETE ?id=` routes.
  - Applied to Discovery, Trip Manifestation, and Ad Copywriter labs; each card got a
    `bare` mode + a compact `*Summary` header.
- **Delete plumbing**: `removeDealDiscoveryIdea` / `removeDealTripManifest` /
  `removeDealAdCopy` (pure) + `DELETE` handlers on the three routes.
- `tsc` clean; `next build` 117/117; full suite 14/14 green.

## DONE — Complete deal facts for the page (ship/date/itinerary/pricing/promos) (2026-06-11)

The hosted deal page must be self-sufficient for purchase (guest never leaves). The
funnel payload now carries the full public-safe cruise facts, captured **upstream** from
real Odysseus data — not fabricated.

- **Upstream un-drop**: the Odysseus search result already had `itinerary` (ports,
  departure/arrival, route `mapPath`) + `prices`, but ranking discarded them.
  - `RankedPackageCandidate` now keeps `itinerary` + `cabinPricing`
    (`extractCabinPricing` maps the price set → Inside/Outside/Balcony/Suite + lead fare).
  - `applyResolvedPackage` (Step 4) threads them onto `DealManifestResolvedPackage`.
- **`assembleDealPageFacts`** (pure, `deal-page-facts.ts`) → `DealPageFacts`: ship name,
  sail date, nights, departure + every stop, structured itinerary + map, real cabin
  pricing, and the specials/promo packages reduced to PUBLIC-SAFE fields (summary,
  publicClaims, qualifiedClaims, structured perks, bookingWindow) — agent-only notes never
  cross over. `readiness` flags resolved vs. draft (pre-Step-4) with operator notes.
- **Lab**: a "Cruise facts for the page" panel (resolved/draft badge + ship/date/
  itinerary/pricing/specials + warnings); `dealFacts` is now included in the "Copy Claude
  Design payload" output. The Claude Design primer gained a self-sufficiency mandate +
  itinerary/pricing/specials input + layout sections.
- `tests/deal-page-facts.ts` (28 assertions); `test:deals-system:all` now 14 suites.
- Per-DAY schedule WITH arrival/departure times (Odysseus package-DETAIL parse) remains a
  scoped follow-up; the search result supplies ports + map + pricing today.

## DONE — Step 7 image categorization + Claude Design primer (2026-06-11)

- **Categorized + diversified SERP image pool.** Images are now sourced per category
  (`hero · cabins · lounges · atrium · dining · excursions · destination`) via declarative
  per-category query specs that specialize the ship/destination base query. The pool
  diversifies and each candidate is tagged with its `category`.
  - `deal-image-search.ts`: `searchDealImagesByCategory` + `searchDealImagesAllCategories`
    (de-duped, best-effort per category); `buildDealImageQuery(input, category)`.
  - `DealImageCandidate.category` + `DEAL_IMAGE_CATEGORIES` / `DEAL_IMAGE_CATEGORY_SPECS`.
  - Route `search_images` takes an optional `category`; `synthesize` sources the whole pool.
  - Lab: category-grouped gallery with per-category "+ more"; the per-segment image picker
    filters to the matching category (Cabins block shows cabin photos).
  - Test 22 → 28 assertions (category queries differ, single-category tagging, diversified
    pool spans ≥5 categories, per-segment category match). Suite green; `tsc` clean.
- **Claude Design hosted-page primer.** `CLAUDE_DESIGN_DEAL_PAGE_PRIMER.md` — a
  deal-agnostic system/primer instruction (role, funnel context, mobile-first/CTA/imagery
  constraints, exact output contract: rationale + design-tokens JSON + section spec +
  wireframe + self-contained HTML/CSS prototype) ending in a `{{FUNNEL_SYNTHESIS_JSON}}`
  slot. The lab's **"Copy Claude Design payload"** button serializes the active synthesis
  (broad copy + only curated images w/ categories) into that slot — one funnel → one page.

## DONE — Step 7 Funnel Synthesis + scope correction (2026-06-11)

The "superior model" pass left Steps 7–8 specced but **unbuilt** (all 8 files in
`DEAL_PAGE_AND_AD_DESIGN.md` were missing) and shipped a premature Meta export. Fixed:

- **Removed "Meta Ads Export" (was Step 6)** — premature. Deleted `meta-ads-export.ts`,
  its route + lab UI, the barrel export, and the dashboard panel.
- **Built Step 7 — Funnel Synthesis** (hub-and-spoke split). A CRO agent consumes the
  Step 3 ad copy (operator-selected variant) and produces:
  - **(A) Broad-market landing page** — jargon stripped, 5 ordered ship-segment
    paragraphs (Cabins/Lounges/Atrium/Dining/Excursions) + hero, ≤3 sentences each.
  - **(B) Hyper-niche 4-card Meta carousel** — headline ≤40, primaryText ≤125, doubles
    down on insider vocabulary. Replaces the removed Meta export's purpose.
  - **Selectable SERP image set** — `searchDealImages` (SerpAPI, test-seamed) by
    ship/destination; operator curates an ordered gallery + hero + per-segment image
    (landing-studio-style picker).
  - Char limits + landing jargon validated-and-warned (never truncated/auto-fixed).
  - Files: `deal-page-design-types.ts`, `deal-page-design-generator.ts`,
    `deal-image-search.ts`, `deal-funnel-synthesis-cache.ts`,
    `app/api/tests/deals-system/funnel-synthesis/route.ts`,
    `app/(tests)/tests/deals-system/funnel-synthesis/{page,funnel-synthesis-view}.tsx`;
    `caches.ts` / `validate.ts` / `index.ts` wired; dashboard Step 7 panel + Step 3
    "Synthesize funnel →" cross-link.
  - `tests/deal-funnel-synthesis.ts` (22 assertions); `test:deals-system:all` now 13
    suites, all green; `tsc` clean. See `FUNNEL_SYNTHESIS_DESIGN.md`.
- **Step 8 (real rendered ad creatives) PARKED** — Canva/flyer generators are
  Campaign-entity + slug + R2 coupled; the clean path is a future `deal_campaign`
  workflow feeding the workflow-agnostic `NormalizedAdInput` renderer, not a synthetic
  Campaign. Final deal-page design goes to cloud design separately.

## DONE — Step 3 documented + final-ad variant selection (2026-06-10)

- **`AD_COPYWRITER_DESIGN.md`** authored — full as-built spec for Step 3 (unified
  manifest, expansion-engine prompt, guardrails, file map).
- **Final-ad variant selection**: the copywriter emits multiple variants; the operator
  now picks one as the final ad.
  - `DealAdCopy.selectedVariantIndex` (optional; absent = primary/0) + range validation.
  - Copywriter route `POST {action:"select", adCopyId, variantIndex}` +
    `selectDealAdCopyVariant` (pure).
  - Step 3 lab: per-variant **"Use this as the final ad"** with a ★ badge on the pick.
  - `withSelectedVariantPrimary` promotes the chosen variant to index 0 at assembly, so
    the deal-page headline/hero/pitch (Step 5) and the lead Meta ad set (Step 6) use it —
    every variant is kept (none dropped) for A/B testing.
  - Publish view surfaces which variant is the final ad (warns when defaulting).
  - `tests/deal-copywriter.ts`: 19 → 27 assertions (selection persist, out-of-range
    throw, assembly promotion, no-op default). Full suite (12 files) green; `tsc` clean.

## DONE — All Steps 4-6 Complete

### Step 4 — Resolve (package lookup + capture)
- **Types**: `DealManifestResolvedPackage` + `resolvedPackage` field on `DealTripManifest` (`deal-trip-manifest-types.ts`)
- **Validator**: `resolvedPackage` provenance gate in `validate.ts`
- **Pure helpers**: `deal-package-resolver.ts` (`manifestLookupFacts`, `applyResolvedPackage`, `parseRankedCandidate`)
- **API**: `app/api/tests/deals-system/resolve-package/route.ts` (POST `lookup` → run live Odysseus lookup; POST `resolve` → broker booking link + stamp onto manifest)
- **Lab UI**: `/tests/deals-system/resolve/` — manifest picker, lookup query display, candidate review, resolve action

### Step 5 — Publish (assemble + approve)
- **Pure assembly adapter**: `deal-manifest-assembly.ts` — maps manifest + ad copy → `CuratedOdysseusDeal` without re-running AI. Builds `cruiseFacts`, `copyPackage`, `adStructure`, `angleResearch`, `targetingDemographic`, `pitchBrief`, `mediaPlan`.
- **API**: `app/api/tests/deals-system/publish/route.ts` (POST `publish`, `approve`, `set_link_valid`)
- **Lab UI**: `/tests/deals-system/publish/` — manifest picker, ad-copy match detection, assemble deal, approval gate review, approve for homepage

### Step 6 — Meta Ads Export
- **Pure builder**: `meta-ads-export.ts` — maps `DealAdCopy` variants → `MetaCampaignExport` with ad sets, targeting hooks, creative copy
- **API**: `app/api/tests/deals-system/meta-export/route.ts` (GET all ad copies, POST `export` → JSON payload)
- **Lab UI**: `/tests/deals-system/meta-export/` — ad copy picker, targeting summary preview, ad set drill-down, copyable JSON output

### Dashboard wiring
- Added Step 4, 5, 6 panels to `dashboard-view.tsx` with deep-links and descriptions matching existing Step 1-3 pattern

### Text-only launch hero hide
- Verified: `public-deal-projection.ts` already projects `textOnlyLaunchWaived`; `curated-deal-page.tsx` already conditionally suppresses hero image and shows "images coming soon" notice

### Verification
- TypeScript: **clean** (zero errors)
- Tests: passed (no regressions in existing test suites)

## Next Steps

- **Step 7 — Funnel Synthesis: DONE** (see `FUNNEL_SYNTHESIS_DESIGN.md`). Superseded the
  "themed page design" concept in `DEAL_PAGE_AND_AD_DESIGN.md` — per operator direction
  the page stays basic (final design goes to cloud design) and Step 7 instead produces
  the broad landing copy + niche carousel + selectable SERP image set.
- **Wire the public page** to read the curated hero + per-segment imagery from the
  synthesis (small projection follow-up).
- **Step 8 — Real rendered ad creatives: PARKED** (big question mark). Needs a
  `deal_campaign` workflow into the workflow-agnostic `NormalizedAdInput` renderer
  rather than impersonating a group Campaign. The Canva ad-template + flyer image
  systems are the intended engines once that bridge exists.

## Files created/modified

- `lib/cb/deals-system/deal-trip-manifest-types.ts`
- `lib/cb/deals-system/validate.ts`
- `lib/cb/deals-system/deal-package-resolver.ts` (new)
- `lib/cb/deals-system/deal-manifest-assembly.ts` (new)
- `lib/cb/deals-system/meta-ads-export.ts` (new)
- `lib/cb/deals-system/index.ts` (barrel exports)
- `app/api/tests/deals-system/resolve-package/route.ts` (new)
- `app/api/tests/deals-system/publish/route.ts` (new)
- `app/api/tests/deals-system/meta-export/route.ts` (new)
- `app/(tests)/tests/deals-system/resolve/page.tsx` + `resolve-view.tsx` (new)
- `app/(tests)/tests/deals-system/publish/page.tsx` + `publish-view.tsx` (new)
- `app/(tests)/tests/deals-system/meta-export/page.tsx` + `meta-export-view.tsx` (new)
- `app/(tests)/tests/deals-system/dashboard-view.tsx` (wiring)
- `.github/DOCS/Implementation/DEALS_STRATEGY/HOME_PAGE_DEALS/6-10-26/DEAL_PAGE_AND_AD_DESIGN.md` (new)
