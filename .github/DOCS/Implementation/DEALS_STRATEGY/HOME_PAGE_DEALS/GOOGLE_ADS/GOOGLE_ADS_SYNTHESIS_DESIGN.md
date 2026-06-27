# Google Ads Synthesis — Deal Workflow Step (Design)

> Status: **Proposed.** Authored 2026-06-25. Mirrors **Meta Ad Synthesis** (the
> existing pipeline step that turns a Funnel Synthesis carousel card into ready-to-launch
> Meta creative) but targets **Google Ads Responsive Display Ads**, reusing the
> `createGoogleDisplayDraft` / `synthesizeGoogleTargeting` infrastructure that the
> group-campaigns flow already has wired up to a live Google Ads account.

## Why this step exists

The deal pipeline already produces a `DealFunnelSynthesis` (landing page + 4-card
hyper-niche carousel) and already turns that carousel into Meta creative
(`DealMetaAdSynthesis`) and a Meta distribution draft. Group campaigns separately
already have a complete, tested Google Ads path: OAuth + token refresh
(`lib/integrations/google-ads.ts`), targeting synthesis
(`lib/campaigns/distribution/platforms/google-ads/targeting.ts`), and paused-draft
creation/cleanup (`lib/campaigns/distribution/platforms/google-ads/campaign.ts`). The
deals system has never plugged a Deal into that path.

This step closes that gap: it adapts a deal's funnel carousel copy + curated imagery
into Google's Responsive Display Ad asset shape, lets the operator generate/regenerate
images sized for Google's aspect ratios, and dispatches a paused Google Ads draft the
same way group campaigns do today.

## Where it sits in the pipeline

```
Step 7  Funnel Synthesis        DealFunnelSynthesis (landingPage + carousel[4] + imageSet)
Step 8  Meta Ad Synthesis        DealMetaAdSynthesis (4 square cards) → Meta distribution
Step 9  Google Ads Synthesis     DealGoogleAdsSynthesis (this step)   → Google Ads distribution   <- NEW
```

Both Step 8 and the new step consume the **same** `DealFunnelSynthesis` independently —
neither depends on the other's output. The dashboard gets a new card after Meta Ad
Synthesis.

## What's different from Meta (and why)

| | Meta carousel (Step 8) | Google RDA (this step) |
|---|---|---|
| Asset shape | 4 cards, each self-contained (headline + primaryText + square image) | 1 ad per synthesis: shared headline/long_headline/description text **plus 2 images** (landscape 1.91:1 + square 1:1) |
| Char limits | headline ≤40, primaryText ≤125 | `headline` ≤30, `long_headline` ≤90, `description` ≤90, `business_name` ≤25 (see `lib/campaigns/distribution/platforms/google-ads/campaign.ts:210-213`) |
| Image aspect | square 1:1 only | landscape (1.91:1, e.g. 1200×628) **and** square (1:1, e.g. 1200×1200) — Google RDAs require both |
| Targeting | Meta interest clusters | keywords + placements + negative keywords (`GoogleTargetingPackage`) |
| Dispatch result | Meta ad/post id | paused Google Ads `campaignId` / `adGroupId` / `adId` |
| Review surface | Meta Ads Manager link | Google Ads Manager link (`ocid=...&campaignId=...`) |

The Google copy fields are **not** a 1:1 reuse of the Meta card text — `headline` (30
chars) is tighter than Meta's (40), and there's a `long_headline` (90) and `description`
(90) slot Meta doesn't have. Rather than re-running the CRO/copy generator, this step
maps the funnel carousel's primary card onto the three Google fields and lets the
operator hand-edit lengths in the lab (same "validate-and-warn, never auto-truncate"
guardrail used everywhere else in this pipeline).

## Data model

New file: `lib/cb/deals-system/deal-google-ads-synthesis-types.ts`

```ts
type DealGoogleAdsAssetStatus = "pending" | "generating" | "ready" | "error";

interface DealGoogleAdsImageAsset {
  aspect: "landscape_1_91x1" | "square_1x1"; // 1200x628 / 1200x1200
  status: DealGoogleAdsAssetStatus;
  imageUrl?: string;
  generator?: "gpt_image_2" | "gemini3_flash";
  promptUsed?: string;
  generatedAtIso?: string;
  error?: string;
  previousImages: Array<{ imageUrl: string; generatedAtIso: string; promptUsed: string }>;
}

interface DealGoogleAdsSynthesis {
  id: string;                      // cache key == sourceFunnelSynthesisId (1:1, same convention as Meta)
  dealId: string;
  generatedAtIso: string;
  sourceFunnelSynthesisId: string;
  sailingAngleTitle: string;
  businessName: string;            // cap 25, defaults to "LeisureLife Interactive"
  headline: string;                // cap 30
  longHeadline: string;            // cap 90
  description: string;             // cap 90
  promptTemplate: string;          // operator-editable, {{HEADLINE}}/{{LONG_HEADLINE}}/{{DESCRIPTION}}
  images: DealGoogleAdsImageAsset[]; // exactly 2: landscape_1_91x1, square_1x1
}
```

`interpolateGoogleAdsPrompt(template, synthesis)` mirrors
`interpolateMetaAdPrompt`. Default template: `"Generate a premium travel display ad
background for:\n{{HEADLINE}}\n{{LONG_HEADLINE}}"` (no on-image text — Google composites
the text fields itself in the RDA, so the generated image should be a clean visual, not
a flyer with baked-in copy — see *Media output differences* below).

`buildDealGoogleAdsSynthesis(funnelSynthesis)` takes `funnelSynthesis.carousel.cards[0]`
(the lead card) as the seed:
- `headline` ← `cap(card.headline, 30)`
- `longHeadline` ← `cap(card.primaryText, 90)`
- `description` ← derived from `funnelSynthesis.landingPage.heroSubhead` capped to 90,
  falling back to a trimmed `card.primaryText`
- both image slots seeded `status: "pending"`, no `imageUrl`

Validation (`validateDealGoogleAdsSynthesis`, warn-not-truncate, matching the Step 7/8
guardrail pattern): flags `headline`/`longHeadline`/`description` over their caps,
mirrors `validateCarouselCard`.

## Media output differences (the actual ask: "modify media output to fit Google's design preference")

Confirmed against Google's own policy (`support.google.com/adspolicy/answer/10347108`):
**standard Display/RDA image assets with a designed text or graphic overlay are a
disapproval trigger**, not just a quality-score ding ("Not Allowed: Images with text or
graphic overlay including brand logos"). Naturally-occurring text in a photo (a port
sign, ship signage) is fine; a designed flyer with headline copy laid over the scene is
not. This is the one hard constraint vs. Meta's generator
(`deal-meta-ad-synthesis-generator.ts`), which intentionally asks for "a vivid square ad
flyer" with the headline/body baked into the image.

**Resolution (operator decision):** keep the same compositional density and
selling instinct as the Meta flyer prompt — an "artistic," scene-rich composition that
still visually sells the package (real ship details, real port/destination cues, mood,
color, premium framing) — just drop the literal text-rendering instructions from the
prompt. The Google `headline`/`long_headline`/`description` fields carry the language;
the image carries the persuasion through composition alone, not through replicating a
flyer's text block. Concretely:

1. **Two aspect ratios per synthesis, not one.** Generate landscape (`aspect: "1.91:1"`,
   target 1200×628) and square (`aspect: "1:1"`, target 1200×1200) — both via the same
   `generateGptImage2` gateway call as Meta uses, just different `aspect` args.
2. **Prompt template is the Meta-style flyer prompt minus the text-rendering clause.**
   Default: `"Generate a vivid, artistic display-ad scene promoting the following
   Cruise Package — composition and mood should sell the package on their own, no text
   or words rendered in the image:\n{{HEADLINE}}\n{{LONG_HEADLINE}}"`. The
   headline/long_headline are passed for *scene context* (what to depict), not for the
   model to render as on-image text.
3. **Reuse the Meta lab's negation rules**, with one addition seeded specifically for
   this step: "Do not render any text, words, logos, or graphic overlays in the image"
   — operator can disable it per-synthesis if a specific scene calls for naturally
   occurring signage (a port sign, ship deck placard), which Google's policy permits.
4. **Real SERP gallery as an explicit fallback, not the default.** The Funnel
   Synthesis image pool (`DealImageCandidate`, real photography, already categorized by
   hero/cabins/destination/etc.) stays one click away in the lab — "Use gallery photo
   instead" per aspect slot — for cases where a generated scene reads too generic/stock.
   This keeps generation as the primary path (consistent with Meta and with the
   operator's preference for a single consistent creative pipeline) while giving an
   escape hatch if a given synthesis looks artificial.
5. **R2 storage path:** `deals/{dealId}/google-ads-synthesis/{synthesisId}/{aspect}-{timestamp}.png`.
6. **`previousImages` is per-aspect**, not a single shared history (since there are two
   independent images to revert).

## Cache & persistence

New file: `lib/cb/deals-system/deal-google-ads-synthesis-cache.ts`, mirroring
`deal-meta-ad-synthesis-cache.ts` exactly:
- `loadDealGoogleAdsSynthesisCache()` / `saveDealGoogleAdsSynthesisCache(cache)` /
  `upsertDealGoogleAdsSynthesis(cache, synthesis)`
- Cache path: `.github/data/deal-google-ads-syntheses-cache.json`
- Schema: `{ version: 1, generatedAtIso, syntheses: DealGoogleAdsSynthesis[] }`
- Wire into `lib/cb/deals-system/validate.ts` (`validateDealGoogleAdsSynthesisCache`) and
  the deals-system barrel (`index.ts`) the same way every prior cache was added.

## Generator

New file: `lib/cb/deals-system/deal-google-ads-synthesis-generator.ts`:
- `buildDealGoogleAdsSynthesis(funnelSynthesis)` — pure, as above.
- `generateDealGoogleAdsImage(synthesis, aspect, promptSuffix?)`:
  - Interpolates template + appends enabled negation rules (reuse the same rule list
    shape the Meta lab persists, just read from the same localStorage key or a
    shared one — operator preference, default to **sharing** the Meta negation rules
    since "no text/QR/fabrication" applies identically to both platforms).
  - Calls `generateGptImage2(promptUsed, { aspect: aspect === "landscape_1_91x1" ? "1.91:1" : "1:1" })`.
  - Stores to R2, moves prior `imageUrl` into that aspect's `previousImages`.
  - Returns updated image asset with `status: "ready"`.

## API route

New file: `app/api/tests/deals-system/google-ads-synthesis/route.ts`, mirroring
`meta-ad-synthesis/route.ts`:
- `GET` → `{ ok, funnelSyntheses, syntheses }`
- `POST { action: "init", funnelSynthesisId }` → build + upsert
- `POST { action: "update_fields", synthesisId, businessName?, headline?, longHeadline?, description?, promptTemplate? }`
  (replaces Meta's single `update_prompt` since Google has more editable text fields)
- `POST { action: "generate_image", synthesisId, aspect, promptSuffix? }`
- `POST { action: "revert_image", synthesisId, aspect, historyIndex }`

## Lab UI

New file: `app/(tests)/tests/deals-system/google-ads-synthesis/google-ads-synthesis-view.tsx`,
mirroring `meta-ad-synthesis-view.tsx`'s structure:
- Funnel synthesis picker (same selector pattern) → "Load from funnel" (POST init)
- Editable fields: Business name (25), Headline (30), Long headline (90), Description
  (90) — each with a live `n/max` counter + over-limit warning (no auto-truncate)
- Two image panels side by side: **Landscape (1.91:1)** and **Square (1:1)**, each with
  generate/regenerate, previous-images history + revert, prompt preview (interpolated +
  negation rules), and a **"Use gallery photo instead"** picker scoped to that aspect
  (filters the funnel's curated `DealImageCandidate` pool, cropped to the target ratio)
  — same `ImageLightbox` component reused
- Negation rules panel — reuse/share the Meta lab's component if practical, else
  duplicate the same default list + custom-rule UI; seed one Google-specific rule ("no
  text/words/logos/overlays in the image") on by default, toggleable per-synthesis
- **GoogleAdsDistributionPanel** (Step 10 handoff, mirrors `MetaDistributionPanel`):
  - "Build plan / preview" → resolves `DealTargetingDemographic.channelTargeting.google`
    (already generated upstream in `targeting-demographic.ts:143-159` — `searchThemes`,
    `keywordIdeas`, `negativeKeywords`) into a `GoogleTargetingPackage`-shaped preview
  - Mode toggle: Simulate / Live (creates paused draft)
  - Dispatch button label depends on mode; live mode calls a deal-scoped wrapper around
    `createGoogleDisplayDraft`
  - Status display: campaignId/adGroupId/adId, Google Ads Manager review URL, targeting
    verification (keywords/placements/negatives requested vs. applied — same shape as
    `GoogleDisplayTargetingVerification`)

## Targeting bridge (deals → group-campaigns Google Ads infra)

The deal already has `DealTargetingDemographic.channelTargeting.google` (search themes,
keyword ideas, negative keywords — see `lib/cb/deals-system/targeting-demographic.ts:143-159`),
but `createGoogleDisplayDraft` expects a `GoogleTargetingPackage`
(`lib/campaigns/distribution/platforms/google-ads/targeting.ts`) and a
`CampaignMediaManifest` + `ScheduledPost`, which are group-campaign-shaped, not
deal-shaped.

Rather than force a Deal into a synthetic `Campaign`/`ScheduledPost` (the same trap the
parked "Meta Ads Export" hit and the Funnel Synthesis doc explicitly calls out as
avoided — see `FUNNEL_SYNTHESIS_DESIGN.md` "What was removed / parked"), add a thin
deal-specific adapter:

- New file: `lib/cb/deals-system/deal-google-ads-distribution.ts`
  - `buildGoogleTargetingPackageFromDeal(targetingDemographic): GoogleTargetingPackage`
    — maps `searchThemes`→keywords pool, `keywordIdeas`→keywords, `negativeKeywords`→
    negatives; no placements (deals have no audience-signal placement sourcing yet —
    leave `placements: []` and surface a "no placement signals" warning in the lab,
    consistent with the "warn don't fabricate" guardrail used throughout this pipeline)
  - `createDealGoogleDisplayDraft(synthesis, dealId)` — builds a minimal
    `CampaignMediaManifest`-shaped object in-memory from the synthesis's two images +
    headline/long_headline/description (no real Campaign entity, no R2 manifest
    persistence beyond what the synthesis cache already has), then calls
    `createGoogleDisplayDraft` from the existing platform module directly.
  - This keeps deals reading the group-campaigns Google Ads platform code (already
    tested: `lib/campaigns/distribution/platforms/__tests__/google-ads-draft.test.ts`,
    `google-ads-targeting.test.ts`) without deals writing into group-campaign caches —
    same separation principle as "Deals stay separate from Groups" in the Funnel
    Synthesis doc.
- New type: `DealGoogleAdsDistribution` (parallels `DealMetaDistribution`): `dealId`,
  `sourceGoogleAdsSynthesisId`, `mode` (`simulate | live`), `campaignId`, `adGroupId`,
  `adId`, `reviewUrl`, `targetingVerification`, `lastAttempt` (status/timestamp/notes).
  New cache: `.github/data/deal-google-ads-distributions-cache.json`.

## Dashboard wiring

`app/(tests)/tests/deals-system/dashboard-view.tsx` — add a new `StepCard` after the
Meta Ad Synthesis card:

```
Step 9 (renumber Meta Distribution to 10 if it's currently 9, else append as 9)
Title: "Google Ads Synthesis"
Description: "Turn the funnel synthesis into a Google Responsive Display Ad — landscape
  + square creative, headline/description text, and a paused Google Ads draft using the
  same targeting + campaign infra group campaigns already use."
Href: /tests/deals-system/google-ads-synthesis
Accent: amber (new, distinct from cyan/fuchsia/violet already in use)
CTA: "Open Google Ads Synthesis"
```

> Note: confirm current step numbering against `STATUS.md` before wiring — the dashboard
> labels lag the doc-numbering at least once already (Funnel Synthesis is coded as
> "Step 4" in the dashboard but documented as Step 7). Fix the label for this new card to
> match whatever the live numbering is at implementation time, and consider correcting
> the existing drift while touching this file.

## Guardrails (carried from existing policy)

- LLM Gateway Mandate: any AI text/image call goes through the shared gateway
  (`generateGptImage2`), no provider SDKs — consistent with every prior step.
- Validate-and-warn, never auto-fix: char-limit and "no placement signals" warnings
  surface in the lab; nothing is silently truncated or fabricated.
- No real Google Ads spend: drafts are created **PAUSED**, identical to
  `createGoogleDisplayDraft`'s existing behavior for group campaigns — the operator
  manually unpauses in Google Ads Manager.
- Deals stay separate from Groups: the new adapter calls into the existing
  group-campaigns Google Ads *platform* module (stateless functions operating on
  passed-in data) but does not read or write any group-campaign Campaign/Schedule
  entities or caches.

## Implementation order

1. Types + cache + validate.ts/index.ts wiring (`deal-google-ads-synthesis-types.ts`,
   `-cache.ts`)
2. Generator (`deal-google-ads-synthesis-generator.ts`) + unit tests
   (`tests/deal-google-ads-synthesis.ts`, mirroring `tests/deal-meta-ad-synthesis.ts` if
   it exists, else following the `tests/deal-funnel-synthesis.ts` assertion style)
3. API route + route tests
4. Lab UI (text fields + two image panels + negation rules, no distribution panel yet)
5. Targeting adapter (`deal-google-ads-distribution.ts`) + distribution cache + tests
   (mirroring `google-ads-draft.test.ts` / `google-ads-targeting.test.ts` patterns)
6. `GoogleAdsDistributionPanel` in the lab UI (simulate mode first, live mode behind
   explicit confirmation given it touches a real ad account)
7. Dashboard card wiring + step-numbering correction
