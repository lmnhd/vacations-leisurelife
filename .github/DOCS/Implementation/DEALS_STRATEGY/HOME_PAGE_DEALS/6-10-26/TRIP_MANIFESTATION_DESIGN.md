# Trip Manifestation — Deal Workflow Step 2 (Design / as-built)

> Status: **Implemented.** Authored 2026-06-10. Step 2 of the deal workflow. Takes a
> selected discovery angle (Step 1, see `DISCOVERY_LAB_DESIGN.md`) + the raw CB promo
> intelligence and produces the object that pre-fills SOURCE & ASSEMBLE for Step 3
> (Ad Copywriter; see `COPYWRITER_DESIGN.md`).

## Purpose

Discovery (Step 1) produces `SailingAngleProfile` angles. Trip Manifestation turns a
**selected** angle into a **deal-package**: it meticulously correlates the ideal cruise
line, destination, sail window, and nights that fulfil the angle's onboard-asset and
timing requirements, and determines which promotion perks/discounts apply. The result —
a `DealTripManifest` — pre-fills the existing SOURCE & ASSEMBLE form, which then feeds
Step 3 (Ad Copywriter, already built).

## The load-bearing constraint

Live Odysseus package search is **operator-run Playwright** (AI policy: no autonomous
CB/Odysseus browser). So the agent **cannot fetch a real `packageId`.** It fills
everything in SOURCE & ASSEMBLE **except** `packageId`, `shipName`, `siid`, and
`bookingUrl`, and emits a **`lookupQuery`** — the exact inputs the operator pastes into
Package Lookup to resolve the real package. The link broker (`resolveBestBookingLink`,
pure) then builds the link from the resolved id. This keeps the link-health gate honest:
no fabricated packages ever enter the pipeline.

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
   DealTripManifest { assembleDraft (no packageId/ship/siid/link), appliedPromos, lookupQuery, … }
            │                                              │
            ▼                                              ▼
   pre-fills SOURCE & ASSEMBLE              operator runs Package Lookup → real packageId
                                                         ▼
                                            link broker builds booking link → Step 3 · Ad Copywriter
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
4. **Promo-id validation.** Any `appliedPromos[].promoRecordId` the model returns that
   was NOT in the prefiltered input is dropped and reported in `rejectedPromoIds` — the
   model can never cite a promo that wasn't shown to it.

## Output contract — `DealTripManifest`

`lib/cb/deals-system/deal-trip-manifest-types.ts`:

- `id`, `generatedAtIso`, `generator: "gpt"`, `sourceAngleId`, `isolatedNiche`, `sailingAngleTitle`.
- `assembleDraft` — `suggestedDealId`, `suggestedBriefId`, `cruiseLine`, `shipClassHint?`,
  `itineraryName`, `destination`, `nights?`, `sailWindow {earliestIso?, latestIso?, rationale}`,
  `departurePortHint?`, `portsOfCall[]`. **Deliberately omits** `packageId`, `shipName`,
  `siid`, `bookingUrl` — the validator rejects a manifest that smuggles any of them.
- `appliedPromos: PromoApplicabilityResult[]` — `promoRecordId`, `status`, `matchedOn[]`,
  `assumptions[]`, `warnings[]` (reuses the existing promo-intelligence type).
- `promoStrategy`, `manifestReasoning` — the perk strategy + why this trip fits the angle.
- `lookupQuery` — `line`, `ship?`, `destination`, `date?`, `nights?`, `port?`, `windowDays`.
- `aiTrace?` — model + prompt + raw response + latency (transparency).

`DealTripManifestsCache { version:1; generatedAtIso; manifests[] }` →
`.github/data/deal-trip-manifests-cache.json`.

## As-built file map

| Concern | File | Notes |
|---|---|---|
| Contracts | `lib/cb/deals-system/deal-trip-manifest-types.ts` | `DealTripManifest` + draft/lookup/window + cache. |
| Prefilter | `lib/cb/deals-system/promo-prefilter.ts` | Pure vendor + sail-window filter; shared `cruiseLineMatches`/`normalizeCruiseLine`. |
| Generator | `lib/cb/deals-system/deal-trip-manifest-generator.ts` | Seed → prefilter → AI (Claude Opus, hard-fail). Validates promo ids. Returns `{ manifest, prefilter, rejectedPromoIds }`. Test seam `__setManifestStructuredObjectGeneratorForTests`. |
| Storage | `lib/cb/deals-system/deal-trip-manifest-cache.ts` | load/save/upsert (idempotent on id). |
| Cache wiring | `caches.ts` (`dealTripManifests` path + empty factory), `validate.ts` (`validateDealTripManifestsCache`, rejects fabricated `packageId`/ship/siid/link), `index.ts` (exports). |
| API | `app/api/tests/deals-system/trip-manifestation/route.ts` | `GET` angles + manifests; `POST {action:"manifest", angleId}` → generate + upsert + return manifest + prefilter + rejected ids. Never runs the browser. |
| Lab UI | `app/(tests)/tests/deals-system/trip-manifestation/page.tsx` + `manifestation-view.tsx` | Angle bullet picker (deep-linkable via `?angleId=`), "Manifest this trip", manifest card (assemble draft, highlighted lookup query, applied promos + reasoning, prefilter summary, AI-debug panel). |
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

## Guardrails (carried from policy)

- No autonomous CB/Odysseus browser: the agent emits a manifest + lookup query; the
  operator runs Package Lookup; the link broker builds the link.
- LLM Gateway Mandate: AI via `generateStructuredObject` + `ModelName` enum; no SDKs.
- Deals separate from Groups: reads only deals caches; no DynamoDB.
- Never fabricates `packageId`/`shipName`/`siid`/booking URL; promo ids validated against input.
- No booking/hold/publish; downstream approval + link-health gates untouched.

## Not yet done (next steps)

- **Auto-prefill SOURCE & ASSEMBLE** from a chosen manifest (today the lab presents the
  draft values; the operator carries them into the workbench form). A "Send to Assemble"
  that pre-populates the workbench is the natural follow-up.
- **Operator lookup round-trip:** wire the manifest's `lookupQuery` into the Package
  Lookup control as a one-click prefill, and capture the resolved `packageId` back onto
  the manifest.
