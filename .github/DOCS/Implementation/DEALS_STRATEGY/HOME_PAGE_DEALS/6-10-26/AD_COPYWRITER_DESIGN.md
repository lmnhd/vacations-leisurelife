# Ad Copywriter — Deal Workflow Step 3 (Design)

> Status: **Implemented.** Authored 2026-06-10. The Ad Copywriter is the only AI
> step in the Step 1 → 2 → 3 pipeline. It consumes a **unified manifest** (the
> Step 1 creative brief stitched to the Step 2 inventory/promo manifest) and writes
> direct-response retail ad copy as one or more **variants**. The operator then
> **selects which variant becomes the final ad**, and that pick drives the published
> deal-page headline/hero at assembly. This doc is the spec AND the as-built
> reference; see "How this maps to the current implementation" for exact files.

## Purpose

Copywriting is **step 3 of the deal workflow**. Step 1 (Discovery) produces a
`SailingAngleProfile` — the *why/voice*. Step 2 (Trip Manifestation) produces a
`DealTripManifest` — the *what/where/perks* (cruise line, ship class, itinerary,
sail window, applied promos, promo strategy). Step 3 fuses both into high-converting
ad copy without re-deciding anything: it is a strict **expansion engine**.

It **replaces** the three older Slice-1 generators (Targeting / Sales Pitch / Deal
Copy) for this workflow. The ad-platform targeting hooks (demographic + interest
keywords) are embedded directly in each variant, so no separate targeting pass runs.

## The unified manifest — no creative drift

The multi-agent risk is **creative drift**: each downstream agent silently re-guesses
what an upstream agent decided. The Group Strategy system solved this with a *unified
manifest*; Deals does the same.

`assembleDealUnifiedManifest(angle, tripManifest)` is **pure — no AI**. It stitches
the two existing objects into one artifact so the copywriter receives both halves
verbatim:

```
DealUnifiedManifest {
  id = `unified-${tripManifest.id}`; generatedAtIso; sourceAngleId; sourceManifestId;
  sailingAngleTitle;
  creativeBrief:    { isolatedNiche, angle: SailingAngleProfile };    // Step 1 (why/voice)
  inventoryManifest:{ assembleDraft, lookupQuery, appliedPromos,
                      promoStrategy, manifestReasoning };             // Step 2 (what/where/perks)
}
```

Because unification is deterministic, the copywriter always sees the real angle and
the real inventory — it cannot drift. The unified manifest is persisted for
traceability (`deal-unified-manifests-cache.json`), but its assembly is plumbing, not
an operator step: clicking **"Unify & write ad copy"** does both in one request.

## The agent: direct-response DTC copywriter

### System role
> You are an elite, direct-response direct-to-consumer (DTC) copywriting agent. Your
> sole purpose is to synthesize a hyper-targeted Creative Brief with live
> Inventory/Promotional data to write high-converting retail ad copy.

### Inputs (the mandated split)
The prompt feeds the agent two clearly separated JSON blocks:
1. **`{{CREATIVE_BRIEF_JSON}}`** — `isolatedNiche` + the full `SailingAngleProfile`
   (insider vocabulary, visual anchor, target audience, core pitch).
2. **`{{INVENTORY_MANIFEST_JSON}}`** — `assembleDraft` + `lookupQuery` +
   `appliedPromos` + `promoStrategy` + `manifestReasoning` (live cruise line, ship
   class, itinerary, dates, promotions, booking-window constraints).

### Strict ad-copy rules (hard constraints)
1. **THE EXPANSION RULE.** Do not invent new creative concepts or change the angle.
   Expand the brief's exact hook into flowing copy, embedding the pricing, promo, and
   itinerary constraints.
2. **HYPER-SPECIFICITY & INSIDER COGNITION.** Lean into the brief's exact pain points,
   tools (brand names / rulesets), and insider vocabulary. If a regular tourist
   wouldn't parse the opening line but the target enthusiast feels seen, it worked.
3. **NO MASS-GROUP OR ISOLATED-TRAVELER TRAPS.** Pitch a self-contained retail
   vacation for an individual / couple / single household. No "group cruise,"
   "organized meetups," "clubs," or "mass gatherings"; don't alienate a partner, but
   keep the personal-passion focus.
4. **BANNED TRAVEL-AGENT PLATITUDES.** Forbidden: *paradise, escape, unwind, cruising,
   hidden gem, luxury for less, magnificent, breathtaking* (plus the group terms).
5. **INTEGRATE THE PROMO LEGALLY & LIFESTYLE-WISE.** Reframe generic incentives into
   the subculture's lifestyle (e.g. Onboard Credit → a named hobby/props subsidy), and
   append mandatory discretionary disclaimers (select sailings, stateroom dependencies,
   verified at live lookup).

### Output schema — `DealAdCopy`

| Field | Type | Definition |
|---|---|---|
| `campaignName` | string | Internal campaign id/handle. |
| `targetAudienceTag` | string | The audience this copy targets. |
| `primaryPromoApplied` | string | Promo id the primary variant leans on. |
| `variants` | `DealAdVariant[]` | Primary retail play + aspirational upsell tiers. |
| `selectedVariantIndex?` | number | **Operator's chosen final ad** (absent = primary/0). |

Each `DealAdVariant`: `promoApplied`, `variantLabel`, `headline`, `bodyCopy`,
`pricingDisclaimers`, `callToAction`, `adPlatformTargetingHooks { demographicTargeting,
interestKeywords[] }`, and `voiceWarnings[]` (banned-vocab hits flagged, never
auto-rewritten).

## Variants and operator selection

The copywriter emits **multiple variants** (1–5, default 2): a primary play on the
strongest applicable promo, plus an aspirational upsell per additional applicable promo
tier. The operator reviews them in the Step 3 lab and clicks **"Use this as the final
ad"** on one. That records `selectedVariantIndex` on the persisted ad copy (action
`select`; pure helper `selectDealAdCopyVariant`).

**Why an index, not a rewrite.** All variants are kept (they remain valuable as Meta
A/B ad sets in Step 6). The selection is a pointer. At assembly time
`withSelectedVariantPrimary(adCopy)` reorders so the chosen variant sits at index 0 —
the "primary" slot every downstream builder already reads from — and re-points
`primaryPromoApplied` at it. The published deal page's headline, hero copy, and pitch
brief therefore come from the operator's pick, with zero changes to the builders. A
no-selection ad copy is a no-op (defaults to the primary the model wrote first).

```
                    DealUnifiedManifest (pure stitch, no AI)
                                 │
                                 ▼
              Ad Copywriter  (the only AI step — expansion engine)
                                 │
                                 ▼
   DealAdCopy { variants: [ primary, upsell… ] }   ← multi-variant output
                                 │   operator clicks "Use this as the final ad"
                                 ▼
   DealAdCopy { variants, selectedVariantIndex }    ← persisted pick
                                 │
        Step 5 Publish:  withSelectedVariantPrimary() moves the pick to index 0
                                 ▼
   CuratedOdysseusDeal.packaging.headline / heroCopy / pitchBrief  ← deal page
   Step 6 Meta export: selected variant leads the ad sets + summary
```

## Guardrails enforced in code (not just the prompt)

- **Banned-vocabulary scan.** `validateAdCopyVoice` regex-scans every variant's
  headline / bodyCopy / callToAction for the banned terms and writes any hits to
  `voiceWarnings`. It is **surfaced, never auto-fixed** — consistent with
  `validateSailingAngleProfile` (Step 1) and the manifest no-fabrication checks (Step 2).
- **Promo-id hallucination drop.** Allowed promo ids = the unified manifest's
  `appliedPromos` plus the literal `"none"`. Any `promoApplied` the model invents is
  reported in `rejectedPromoIds` and remapped to `"none"`; the copywriter cannot
  conjure a promotion that isn't real.
- **Selection range guard.** `selectedVariantIndex` is validated to be an integer
  within `[0, variants.length-1]` both in `selectDealAdCopyVariant` and the cache
  validator; the `select` route rejects out-of-range/non-integer values.

## How this maps to the current implementation (as-built)

| Concern | File | Notes |
|---|---|---|
| Unified contract | `lib/cb/deals-system/deal-unified-manifest-types.ts` | `DealUnifiedManifest` (creativeBrief + inventoryManifest) + cache. |
| Unified stitch (pure) | `lib/cb/deals-system/deal-unified-manifest-cache.ts` | `assembleDealUnifiedManifest` (no AI); load/save/upsert. |
| Ad-copy contract | `lib/cb/deals-system/deal-ad-copy-types.ts` | `DealAdCopy` / `DealAdVariant` (+ `selectedVariantIndex`). |
| Ad-copy cache | `lib/cb/deals-system/deal-ad-copy-cache.ts` | load/save/upsert + `selectDealAdCopyVariant` (pure). |
| Copywriter agent | `lib/cb/deals-system/deal-copywriter-generator.ts` | Claude Opus via gateway (`ModelName.CLAUDE_4_OPUS`), AI-only/hard-fail. Operator's exact system prompt; `validateAdCopyVoice`; promo-id drop. Returns `{ adCopy, rejectedPromoIds }`. |
| Selected-variant promotion | `lib/cb/deals-system/deal-manifest-assembly.ts` | `withSelectedVariantPrimary` reorders the chosen variant to index 0; used by Step 5 assembly + Step 6 Meta export. |
| Validators | `lib/cb/deals-system/validate.ts` | `validateDealAdCopyCache` (generator `"gpt"`, ≥1 variant, headline/body/CTA per variant, in-range `selectedVariantIndex`). |
| Wiring | `caches.ts` / `index.ts` | cache paths + empty factories + barrel exports. |
| API | `app/api/tests/deals-system/copywriter/route.ts` | `GET` manifests+adCopies; `POST {action:"write", manifestId, variantCount?}` (auto-unify → write); `POST {action:"select", adCopyId, variantIndex}`. `force-dynamic`, `nodejs`, `maxDuration 300`. |
| Tab UI | `app/(tests)/tests/deals-system/copywriter/page.tsx` + `copywriter-view.tsx` | Manifest picker (deep-link preselect via `?manifestId=`), variant-count selector (1–4), per-variant **"Use this as the final ad"** with a ★ badge on the chosen one; AI-debug panel. |
| Dashboard | `app/(tests)/tests/deals-system/dashboard-view.tsx` | Step 2 manifest bullets with "Write ad copy →" + Step 3 "Ad Copywriter" panel with ad-copy count. |
| Publish surfacing | `app/(tests)/tests/deals-system/publish/publish-view.tsx` | Ad-copy match line shows which variant is the final ad (warns when defaulting to primary). |
| Test | `tests/deal-copywriter.ts` (+ `tests/deals-ai-stub.ts`) | 27 assertions incl. selection persistence, out-of-range throw, assembly promotion, no-op default. Run: `npm run test:deal-copywriter`. |

## Downstream contract

A selected ad copy feeds **Step 4 (Resolve)** → **Step 5 (Publish)**, where
`assembleCuratedDealFromManifest` builds the `CuratedOdysseusDeal` directly from the
resolved manifest + the ad copy — no AI re-run. With the selection promoted to index 0:

- `packaging.headline` / `heroCopy` come from the chosen variant.
- `pitchBrief` / `targetingDemographic` lead with the chosen variant's hooks.
- `adStructure` keeps every variant as channel plans (chosen first).

**Step 6 (Meta export)** builds one ad set per variant for A/B testing, with the chosen
variant leading the ad sets and driving the targeting summary.

## Guardrails (carried from policy)
- LLM Gateway Mandate: the copywriter generates via `generateStructuredObject` +
  `ModelName.CLAUDE_4_OPUS`; no provider SDKs in feature code.
- The only AI step is the copywriter; unification and selection-promotion are pure.
- No fabricated `packageId` / ship / booking link — those are carried from Step 4's
  resolved package; the copywriter never touches them.
- No booking, hold, or publish from Step 3 — it writes copy only.
- Deals stay separate from Groups: reads/writes only deals caches.
