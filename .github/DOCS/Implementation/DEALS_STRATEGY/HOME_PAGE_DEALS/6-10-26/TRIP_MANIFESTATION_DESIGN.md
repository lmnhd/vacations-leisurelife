# Trip Manifestation — Deal Workflow Step 2 (Design / as-built)

> Status: **Implemented.** Authored 2026-06-10; updated 2026-06-11 for the
> **inventory-aware** auto-resolution flow. Step 2 now searches live inventory broadly,
> uses an AI fit-select pass to pick the best real cruise, and resolves the booking link
> automatically — no "no match" dead-ends. Produces the object that pre-fills SOURCE &
> ASSEMBLE for Step 3 (Ad Copywriter; see `COPYWRITER_DESIGN.md`).

## Purpose

Discovery (Step 1) produces `SailingAngleProfile` angles. Trip Manifestation turns a
**selected** angle into a **deal-package**: it meticulously correlates the ideal cruise
line, destination, sail window, and nights that fulfil the angle's onboard-asset and
timing requirements, and determines which promotion perks/discounts apply. The result —
a `DealTripManifest` — pre-fills the existing SOURCE & ASSEMBLE form, which then feeds
Step 3 (Ad Copywriter, already built).

## The load-bearing constraint

Live Odysseus package search is **operator-run Playwright** (AI policy: no autonomous
CB/Odysseus browser). However, the Step 2 route now **auto-resolves** the real cruise
within the same request: it shells out to the operator-run `lookup-odysseus-package` CLI
(with `--best-effort`), runs an AI fit-select pass over the returned candidates, and
builds the booking link via the link broker — all before returning to the lab UI.

The agent still **never touches the browser directly**. The `lookupQuery` it emits is
broad (no ship, wide season window) so that real inventory always returns candidates.
The `bestEffort` ranker guarantees a selection if any candidates exist, and the AI
fit-select guarantees the chosen cruise actually serves the angle. No manifest ever
leaves Step 2 without a `resolvedPackage` — the old "no match" dead-end is gone.

```
SailingAngleProfile (selected)  +  raw CB promo intelligence
            │
            ▼
   (1) deterministic seed: coarse cruise line + sail window from the angle
            ▼
   (2) prefilter promo records by vendor + sail-window overlap (cut noise)
            ▼
   (3) AI correlation (Claude Opus): line / destination / window / nights + applicable perks
            ▼
   DealTripManifest { assembleDraft, appliedPromos, lookupQuery (broad: no ship, wide window), … }
            │
            ▼
   (4) live Odysseus search (broad lookupQuery, --best-effort) → pool of REAL sailings
            │
            ▼
   (5) AI fit-select: pick the candidate that best embodies the angle
            │
            ▼
   (6) link broker resolves booking link for the chosen real cruise
            │
            ▼
   (7) reconcile: sync factual fields (nights, ports) from real cruise → assembleDraft
            │
            ▼
   DealTripManifest with resolvedPackage (ship, date, itinerary, pricing, bookingUrl)
            │
            ▼
   pre-fills SOURCE & ASSEMBLE → Step 3 · Ad Copywriter
```

## Pipeline detail

1. **Deterministic seed (pure).** Parse a coarse cruise line and sail window from the
   angle's `destinationAndTimeOfYearHints` / `onboardAssetRequirements` / title. Months
   ("July 2026") and seasons ("late spring through early autumn") map to ISO window
   bounds; a recognised cruise-line name maps to a vendor. Intentionally permissive —
   if nothing parses, that filter is simply skipped. Used ONLY to prefilter promos; the
   AI's manifest is the authoritative line/window.
2. **Promo prefilter (`promo-prefilter.ts`, pure).** `prefilterPromoRecords(records,
   { cruiseLine?, sailWindow? })` keeps records whose vendor matches the seed line and
   whose sailing window can overlap the seed window. Conservative: records with no
   parseable window are KEPT (can't prove non-overlap). Returns `{ kept, dropped,
   diagnostics }` so the lab shows exactly what was filtered and why. This is the "filter
   on a date if we have one to eliminate unnecessary data" step — it trims the AI prompt
   to relevant promos only.
3. **AI correlation (`deal-trip-manifest-generator.ts`).** Claude Opus via the gateway
   (`generateStructuredObject`, AI-only/hard-fail). System role = "cruise inventory +
   promo strategist." Inputs: the full angle + the prefiltered promo records (offer
   types, claims, windows). Output: the `assembleDraft`, `appliedPromos`
   (`PromoApplicabilityResult` per promo), `promoStrategy`, `manifestReasoning`, and
   `lookupQuery`.

   The `lookupQuery` is **broad by design**: no `ship`, a wide `windowDays` (60+),
   destination as a category rather than a specific route, and `nights` as a soft
   preference. This prevents over-specific ideas that fail to match real inventory.
4. **Promo-id validation.** Any `appliedPromos[].promoRecordId` the model returns that
   was NOT in the prefiltered input is dropped and reported in `rejectedPromoIds` — the
   model can never cite a promo that wasn't shown to it.
5. **Live Odysseus search (`runOdysseusLookup`).** The route shells out to
   `lookup-odysseus-package --best-effort` using the broad `lookupQuery`. The
   `bestEffort` flag in the ranker (`package-lookup.ts`) overrides the strict ±3 day
   sail-date tolerance: if any candidates exist, one is always selected (never
   `no_match`). If no results with the initial vendor filter, the search retries with
   the vendor filter dropped.
6. **AI fit-select (`selectBestFitCandidate`).** Given the pool of real inventory
   candidates, a second AI pass (Claude Opus, structured output) picks the package that
   best embodies the angle's essence. It returns `chosenPackageId`, `fitRationale`, and
   `runnerUpPackageIds`. The fit rationale explains *why* this cruise serves the
   angle — surfaced in the lab UI.
7. **Link-broker resolution (`resolveCandidateOntoManifest`).** The chosen candidate is
   passed to `resolveBestBookingLink` (pure) to build the booking URL. The result is
   stamped onto the manifest as `resolvedPackage` with full cruise facts: ship, sail
   date, itinerary, cabin pricing, and booking link.
8. **Reconcile (`reconcileAssembleDraftWithResolved`).** Factual fields in
   `assembleDraft` are synced from the resolved real cruise (`nights`,
   `departurePortHint`, `portsOfCall`). Marketing fields (`itineraryName`,
   `destination`, `shipClassHint`, `sailWindow`) are deliberately **preserved** — they
   were crafted by the AI for the angle and should not be overwritten by the real cruise
   data.

## Output contract — `DealTripManifest`

`lib/cb/deals-system/deal-trip-manifest-types.ts`:

- `id`, `generatedAtIso`, `generator: "gpt"`, `sourceAngleId`, `isolatedNiche`, `sailingAngleTitle`.
- `assembleDraft` — `suggestedDealId`, `suggestedBriefId`, `cruiseLine`, `shipClassHint?`,
  `itineraryName`, `destination`, `nights?`, `sailWindow {earliestIso?, latestIso?, rationale}`,
  `departurePortHint?`, `portsOfCall[]`. **Deliberately omits** `packageId`, `shipName`,
  `siid`, `bookingUrl` in the draft — the validator rejects a manifest that smuggles any
  of them into `assembleDraft`.
- `appliedPromos: PromoApplicabilityResult[]` — `promoRecordId`, `status`, `matchedOn[]`,
  `assumptions[]`, `warnings[]` (reuses the existing promo-intelligence type).
- `promoStrategy`, `manifestReasoning` — the perk strategy + why this trip fits the angle.
- `lookupQuery` — `line`, `ship?` (omitted for broad search), `destination`, `date?`,
  `nights?`, `port?`, `windowDays` (60+ for broad seasonal windows).
- `resolvedPackage?` — `packageId`, `cruiseName`, `cruiseLine`, `shipName`, `sailDateIso`,
  `nights`, `departurePortCode`, `confidence`, `reasons`, `siid`, `bookingUrl`,
  `bookingLinkClass`, `linkHealth`, `cabinPricing`, `itinerary`, `lookupDiagnostics[]`.
  Populated automatically by the route; a manifest is not considered "done" until this
  field exists.
- `aiTrace?` — model + prompt + raw response + latency (transparency).

`DealTripManifestsCache { version:1; generatedAtIso; manifests[] }` →
`.github/data/deal-trip-manifests-cache.json`.

## As-built file map

| Concern | File | Notes |
|---|---|---|
| Contracts | `lib/cb/deals-system/deal-trip-manifest-types.ts` | `DealTripManifest` + draft/lookup/window + cache + `resolvedPackage`. |
| Prefilter | `lib/cb/deals-system/promo-prefilter.ts` | Pure vendor + sail-window filter; shared `cruiseLineMatches`/`normalizeCruiseLine`. |
| Generator | `lib/cb/deals-system/deal-trip-manifest-generator.ts` | Seed → prefilter → AI (Claude Opus, hard-fail). Validates promo ids. Returns `{ manifest, prefilter, rejectedPromoIds }`. Includes `selectBestFitCandidate` (AI fit-select pass). Test seam `__setManifestStructuredObjectGeneratorForTests`. |
| Ranker | `lib/cb/link-broker/package-lookup.ts` | `rankPackageCandidates` with `bestEffort` flag: overrides strict date tolerance, always selects if candidates exist. |
| Live lookup | `lib/cb/deals-system/deal-package-resolution.ts` | `runOdysseusLookup` shells out to the CLI script; `parseLookupStdout` prefers JSON block, falls back to regex. |
| Resolver | `lib/cb/deals-system/deal-package-resolver.ts` | Pure helpers: `manifestLookupFacts`, `applyResolvedPackage`, `parseRankedCandidate`, `reconcileAssembleDraftWithResolved`. |
| Script | `scripts/lookup-odysseus-package.ts` | CLI script; emits `--best-effort` to lookup; prints JSON result block for machine parsing. |
| Storage | `lib/cb/deals-system/deal-trip-manifest-cache.ts` | load/save/upsert (idempotent on id). |
| Cache wiring | `caches.ts` (`dealTripManifests` path + empty factory), `validate.ts` (`validateDealTripManifestsCache`, rejects fabricated `packageId`/ship/siid/link in draft), `index.ts` (exports). |
| API | `app/api/tests/deals-system/trip-manifestation/route.ts` | `GET` angles + manifests; `POST {action:"manifest", angleId}` → generate → live lookup → fit-select → resolve → reconcile → upsert. Returns manifest + `fitRationale` + candidates + diagnostics. |
| Lab UI | `app/(tests)/tests/deals-system/trip-manifestation/page.tsx` + `manifestation-view.tsx` | Angle bullet picker (deep-linkable via `?angleId=`), "Manifest this trip", manifest card (assemble draft, fit rationale panel, resolved package panel, applied promos + reasoning, prefilter summary, AI-debug panel). |
| Entry points | `discovery-view.tsx` ("Manifest this angle →" on each card) + `dashboard-view.tsx` (Step 1 angle bullets with "Manifest →" + "manifested" badge; Step 2 panel). | Both cross-link and in-lab picker. |
| Dashboard data | `dashboard-data.ts` | `discovery.angles[]` (id/title/niche/`hasManifest`) + `manifestCount`. |
| Test | `tests/deal-trip-manifestation.ts` (+ `tests/deals-ai-stub.ts`) | Run: `npm run test:trip-manifestation`. |

## Entry flow (both paths)

- **From Discovery cards:** each angle card has "Manifest this angle →" →
  `/tests/deals-system/trip-manifestation?angleId=<id>` (angle preselected).
- **From the dashboard:** the Step 1 panel lists the cached angles as bullets, each with a
  "Manifest →" deep-link and a "manifested" badge once a manifest exists. Step 2 manifests
  also appear as bullets with cruise line + destination, a "Write ad copy →" trigger, and
  an "ad copy ✓" badge once Step 3 has been written.
- **In-lab picker:** the Manifestation lab lists all cached angles as selectable bullets.

## Test coverage (`npm run test:trip-manifestation`)

Prefilter keeps the matching vendor / drops the off-vendor; manifest has `generator:"gpt"`
+ `aiTrace`; `assembleDraft` omits `packageId`/`shipName`/`siid`/`bookingUrl`; applied
promos reference only prefiltered ids; a hallucinated id is dropped + reported; a
`lookupQuery` is produced; cache upsert is idempotent; the validator accepts a clean
manifest and **rejects** one with a fabricated `packageId`.

Inventory-aware additions:
- `selectBestFitCandidate` returns a chosen candidate and a non-empty `fitRationale`.
- `reconcileAssembleDraftWithResolved` updates factual fields (`nights`,
  `departurePortHint`, `portsOfCall`) from the resolved real cruise while preserving
  marketing fields (`itineraryName`, `destination`).

## Guardrails (carried from policy)

- No autonomous CB/Odysseus browser: the agent emits a manifest + broad `lookupQuery`;
  the operator-run CLI performs the live search; the AI fit-selects from real results;
  the link broker builds the link. The agent never touches the browser.
- `bestEffort` guarantee: the ranker always selects a candidate if any exist — never
  returns `no_match` when inventory is available. A fallback retry drops the vendor
  filter if the initial search is empty.
- Reconcile discipline: factual fields (`nights`, `ports`) sync from the real cruise;
  marketing fields (`itineraryName`, `destination`, `shipClassHint`) are preserved from
  the AI's angle-crafted draft.
- LLM Gateway Mandate: AI via `generateStructuredObject` + `ModelName` enum; no SDKs.
- Deals separate from Groups: reads only deals caches; no DynamoDB.
- Never fabricates `packageId`/`shipName`/`siid`/booking URL in the draft; promo ids
  validated against input.
- No booking/hold/publish; downstream approval + link-health gates untouched.

## Not yet done (next steps)

- **Auto-prefill SOURCE & ASSEMBLE** from a chosen manifest (today the lab presents the
  draft values; the operator carries them into the workbench form). A "Send to Assemble"
  that pre-populates the workbench is the natural follow-up.
