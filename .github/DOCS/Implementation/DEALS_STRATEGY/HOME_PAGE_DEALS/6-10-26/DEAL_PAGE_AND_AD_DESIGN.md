# Deal Page Design + Meta Ad Design (Steps 7–8)

> **SUPERSEDED (2026-06-11).** This early spec was never built as written. Per operator
> direction the deal page stays **basic** (final design goes to cloud design), so the
> "AI-generated themed page design" (color palette / typography / auto theme) below is
> NOT the implemented Step 7. The shipped Step 7 is **Funnel Synthesis** — see
> `FUNNEL_SYNTHESIS_DESIGN.md` — which splits the Step 3 ad copy into a broad landing
> page + a hyper-niche Meta carousel, plus a selectable SERP image set. The "Meta Ad
> Design + Media Artifacts" track (Step 8, real rendered creatives) is **parked**. Kept
> here for historical context only.

## Context

This document bridges the gap between Step 6 (Meta Ads Export) and the public homepage. After a Deal is approved (`bookable`) and ready to be surfaced publicly, two parallel tracks must be completed before the Deal is customer-facing:

1. **Step 7 — Deal Page Design**: The public `/deals/[id]` page must be visually designed and styled with deal-specific media (hero image, color theme, typography) that matches the angle and niche of the sailing.
2. **Step 8 — Meta Ad Design + Media Artifacts**: Ad creatives (still images, carousels, short videos) must be generated and attached to the Meta campaign export so the exported JSON references real creative assets.

Both tracks require media generation and AI-powered design. Both are gated on the `mediaPlan` and approval state.

---

## Step 7 — Deal Page Design

### Purpose

Transform a generic public deal page into a themed, deal-specific landing experience. The page should feel like it was designed for THIS sailing — not a template.

### Inputs

- `CuratedOdysseusDeal` (approved, `bookable`)
- `DealAdCopy` (variants with headlines, body copy, hooks)
- `DealMediaPlan` (scaffolded in Step 5; now needs real assets)
- `DealAngleResearch` (the niche/trend signal driving the angle)

### Outputs

- `DealPageDesign` — a typed design spec carrying:
  - `colorPalette` — primary/accent/background colors matching the destination + angle mood
  - `typography` — headline + body font pair, driven by the sailing angle (adventure vs luxury vs family)
  - `heroAsset` — resolved image URL or generated image prompt + seed
  - `layoutOverrides` — section ordering, CTA prominence, testimonial placement
  - `animationPreset` — subtle motion style (e.g. parallax hero, carousel, fade-in blocks)

### Design generation strategy

1. **Prompt construction** (AI-first, no templates):
   - Feed the LLM:
     - The sailing angle title + niche
     - The destination + cruise line + ship class
     - The primary ad-copy headline + body copy (customer voice)
     - The emotional hook from `angleResearch.recommendedPrimaryAngle`
     - The target audience description from `targetingDemographic.primaryAudience`
   - Ask for a JSON `DealPageDesign` matching the schema above.
   - Guardrails:
     - Must not use generic cruise stock imagery
     - Must align hero mood with the emotional hook (e.g. "intimate escape" → warm sunset tones, not bright family carnival)
     - CTA must remain visible above the fold

2. **Image sourcing / generation**:
   - **Tier 1**: Real ship photo from SerpAPI (source-of-truth) — hero background or split layout.
   - **Tier 2**: AI-generated destination/ambience image (Nano-Banana/Gemini) — themed to the angle.
   - **Tier 3**: Deterministic fallback — destination-themed Pexels/Unsplash fallback.
   - Rule: the `heroAsset` field records which tier was used and the provenance URL/prompt.

3. **Media plan hydration**:
   - Step 5 assembled a scaffold `DealMediaPlan` with `readiness: "waived_text_only"`.
   - Step 7 must update `readiness` to one of:
     - `"has_hero_image"` — hero asset resolved or generated
     - `"has_creative_set"` — multiple image variants for A/B
     - `"ready"` — all media artifacts present and approved

### API route

`POST /api/tests/deals-system/deal-page-design`

```json
{
  "action": "generate_design",
  "dealId": "pkg-12345",
  "variantIndex": 0
}
```

Returns:
```json
{
  "ok": true,
  "design": { "colorPalette": {...}, "typography": {...}, "heroAsset": {...}, ... },
  "updatedMediaPlan": { "readiness": "has_hero_image", ... }
}
```

### Lab UI

`/tests/deals-system/deal-page-design/`

- Load approved deals (`status: "bookable"`).
- Display current design spec (or empty state).
- "Generate design from ad copy" → AI call → show generated spec + parsed JSON.
- "Generate hero image" → triggers image pipeline (SerpAPI → Nano-Banana → fallback).
- Preview: live rendered mock of the deal page using the design spec (iframe or component preview).
- Operator can regenerate, lock, or reject the design.

---

## Step 8 — Meta Ad Design + Media Artifacts

### Purpose

The Step 6 Meta Ads Export produces a JSON skeleton with text-only creatives. Step 8 generates the actual visual ad assets (images, carousels, short-form videos) and attaches them to each ad set so the export becomes a real campaign package.

### Inputs

- `CuratedOdysseusDeal` (approved)
- `DealAdCopy` variants (headlines, body, hooks)
- `DealPageDesign` (Step 7 output — color palette, hero asset)
- `DealMediaPlan` (scaffolded in Step 5, hydrated in Step 7)

### Outputs

- `MetaCreativeAsset[]` — one per ad set / variant:
  - `assetType`: `"image" | "carousel" | "video_short"`
  - `url`: local or CDN URL
  - `dimensions`: `"1200x628" | "1080x1080" | "1080x1920"`
  - `provenance`: `"serpapi_ship_photo" | "nano_banana_generated" | "template_composite"`
  - `prompt` or `sourceQuery`: what was searched or generated
  - `variantIndex`: which ad-copy variant this asset maps to

### Asset generation strategy

1. **Still images (primary)**:
   - For each ad variant, generate a hero image that pairs:
     - The headline text (as overlay or integrated)
     - The ship / destination visual
     - The angle-specific mood (from `DealPageDesign.colorPalette`)
   - Tool chain:
     - SerpAPI: find real ship photos matching cruise line + ship name
     - Nano-Banana: transform / composite / caption the real photo with headline + angle mood
     - Fallback: template composite with Pexels background + overlaid text

2. **Carousel ads (optional)**:
   - 3-5 cards showing itinerary highlights, cabin types, or offer details
   - Each card uses the same color palette + typography from `DealPageDesign`
   - Cards generated as separate images then bundled

3. **Short video (optional)**:
   - Animated type overlay on the hero image (per campaign media direction: animated type + static image, not people-in-image animation)
   - 5-15 seconds, loop-friendly
   - Generated via RunwayML or deterministic video template

### Media plan hydration

- Update `DealMediaPlan`:
  - `imageSlots` → list of generated `MetaCreativeAsset`
  - `shortVideoConcepts` → list of video assets if any
  - `readiness` → `"has_creative_set"` or `"ready"`
- The `mediaPlan` now carries enough assets that the Step 6 Meta export can include `creativeAssetUrl` references in each ad set.

### API route

`POST /api/tests/deals-system/ad-creative-design`

```json
{
  "action": "generate_assets",
  "dealId": "pkg-12345",
  "assetTypes": ["image", "carousel"]
}
```

Returns:
```json
{
  "ok": true,
  "assets": [
    { "assetType": "image", "url": "...", "dimensions": "1200x628", "variantIndex": 0, "provenance": "nano_banana_generated" }
  ],
  "updatedMediaPlan": { "readiness": "has_creative_set", ... }
}
```

### Lab UI

`/tests/deals-system/ad-creative-design/`

- Load approved deals.
- Display current ad-copy variants with their headlines + hooks.
- For each variant: show current asset (or empty state with generate button).
- "Generate image for variant 1" → triggers asset pipeline.
- Side-by-side preview of all variant creatives.
- "Export campaign with assets" → updates the Step 6 Meta export JSON to include `creativeAssetUrl` fields.
- Operator can regenerate, lock, or reject individual assets.

---

## Approval Gates

Both Step 7 and Step 8 are gated on the Deal's `operatorApproval`:

- **Step 7 gate**: `mediaPlan.readiness !== "waived_text_only"` AND deal is `bookable`.
- **Step 8 gate**: `mediaPlan.readiness === "has_hero_image"` (Step 7 must complete first) OR operator explicitly waives Step 7.
- If the operator waives media entirely, both steps are skipped and the Deal remains text-only on the homepage and in Meta ads.

---

## Files to create

- `lib/cb/deals-system/deal-page-design-types.ts` — `DealPageDesign`, `ColorPalette`, `TypographySpec`
- `lib/cb/deals-system/deal-page-design-generator.ts` — AI prompt builder + `generateDealPageDesign()`
- `lib/cb/deals-system/ad-creative-design-types.ts` — `MetaCreativeAsset`, `AssetProvenance`
- `lib/cb/deals-system/ad-creative-design-generator.ts` — image pipeline orchestrator (SerpAPI → Nano-Banana → fallback)
- `app/api/tests/deals-system/deal-page-design/route.ts` — POST generate_design
- `app/api/tests/deals-system/ad-creative-design/route.ts` — POST generate_assets
- `app/(tests)/tests/deals-system/deal-page-design/page.tsx` + `deal-page-design-view.tsx`
- `app/(tests)/tests/deals-system/ad-creative-design/page.tsx` + `ad-creative-design-view.tsx`
