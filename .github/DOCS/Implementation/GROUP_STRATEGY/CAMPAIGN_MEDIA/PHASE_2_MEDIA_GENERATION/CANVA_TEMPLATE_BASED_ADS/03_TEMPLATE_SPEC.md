# Template Spec — Slot Contracts for Hand-Designed Canva Templates

This is the **canonical contract** between the templates you design in Canva and the code that fills them. Slot names are **case-sensitive** and must match exactly between:

1. The variable name in Canva (when imported into Templated.io).
2. The `slots[]` array in `lib/ads/template-registry/templates.json`.
3. The keys produced by Copy Forge (`SlotPack` schema).

If they ever diverge, render fails at boot — by design.

---

## Common slot vocabulary

These slot names are reserved. Always use them when the meaning matches; never invent synonyms.

| Slot name | Type | Max length | Meaning |
|---|---|---|---|
| `headline` | text | 50 chars | Primary catchy hook. No period. |
| `subhead` | text | 80 chars | Clarifier — what / where / when, in plain words. |
| `microcopy` | text | 30 chars | Eyebrow / badge / sticker label (e.g. "Issue 02", "Boarding April"). |
| `cta` | text | 20 chars | Action phrase ("Reserve a cabin", "See the deal"). |
| `hero_image` | image | — | The big background or focal image. |
| `accent_color` | color | hex | Brand-extracted accent color (passed from `tokens.accentHex`). |
| `vessel` | text | 30 chars | Ship name. |
| `route` | text | 40 chars | Destination string. |
| `departure` | text | 30 chars | Date / month string. |
| `page_image` | image | — | Carousel: per-page image. |
| `page_title` | text | 40 chars | Carousel: per-page heading. |
| `page_body`  | text | 120 chars | Carousel: per-page paragraph. |

If your template uses **any other slot name**, add it to the registry entry; Copy Forge will be told about it via the schema and produce a value for it.

---

## Per-format contracts

You will design **one template per `(visualFlavor, format)` pair**. Start with one visualFlavor end-to-end before fanning out.

### 1. IG Square — 1080 × 1080

**Aspect:** 1:1.
**Required slots:** `headline`, `cta`, `hero_image`.
**Optional slots:** `subhead`, `microcopy`, `accent_color`, `vessel`, `route`, `departure`.
**Design rules:**
- Headline must remain legible at 250×250 px (Instagram thumbnail).
- Leave a safe bottom 120 px for any platform watermark overlay.
- Do not bake real text into the background — only the `headline` / `subhead` / `cta` text layers should carry copy.

### 2. FB / Google Display — 1200 × 628

**Aspect:** ≈ 1.91:1.
**Required slots:** `headline`, `cta`, `hero_image`.
**Optional slots:** `subhead`, `accent_color`.
**Design rules:**
- Headline + CTA must stay inside the central 1000 × 500 region (some placements crop edges).
- Google Display rejects creatives with > 20% text coverage in image — keep typography to roughly 1/4 of canvas area.

### 3. Story / Reel — 1080 × 1920

**Aspect:** 9:16.
**Required slots:** `headline`, `cta`, `hero_image`.
**Optional slots:** `microcopy`, `subhead`, `accent_color`.
**Design rules:**
- Reserve top 250 px and bottom 250 px as **safe-zone** (IG/TikTok overlays cover these).
- All copy must sit in the central 1080 × 1420 area.
- Hero image can extend full bleed.

### 4. Carousel — 1080 × 1350 (multi-page)

**Aspect:** 4:5 per page.
**Required slots per page:** `page_title`, `page_image`. Page 1 should also have `headline`. Last page should also have `cta`.
**Design rules:**
- Maintain a visible visual link across pages (consistent accent stripe, footer mark, or border) so the carousel reads as one set.
- Page 1 = hook. Pages 2-3 = proof / detail. Last page = CTA.
- Default page count: **4**. Configurable via registry `pages` field.

---

## Mapping from Copy Forge `SlotPack` to template slots

Copy Forge always emits the same shape (`SlotPack`). The provider layer projects it onto the actual template's slot list:

```
SlotPack.headline   -> slots.headline        (if present)
SlotPack.subhead    -> slots.subhead         (if present)
SlotPack.microcopy  -> slots.microcopy       (if present)
SlotPack.cta        -> slots.cta             (if present)
SlotPack.imageHints -> resolves to slots.hero_image / slots.page_image via image-uploader
tokens.accentHex    -> slots.accent_color    (if present)
tokens.vesselName   -> slots.vessel          (if present)
tokens.route        -> slots.route           (if present)
tokens.departure    -> slots.departure       (if present)
```

Unused `SlotPack` fields are dropped silently. Missing required slots throw.

---

## Image slot resolution

The `imageHints` array from Copy Forge contains tags / asset kinds in priority order, e.g. `["trust_photo", "hero", "ship_reference"]`.

The image-uploader resolves them against the campaign manifest in this order:

1. `manifest.images.shipReferences` (SerpAPI / Nano-Banana real-ship layer — source of truth)
2. `manifest.images.hero`
3. `manifest.images.aestheticConcepts`
4. `manifest.images.documentaryDetails`

The first match that is `active && reviewStatus !== 'rejected'` is uploaded to the provider and assigned to the image slot.

If **no** image matches and a slot is required, render fails. (No silent fallback to a stock asset — per the user rule against compensating with mocks.)

---

## Naming convention for your Canva files

Use this filename pattern so the import-to-registry step is unambiguous:

```
LLI__<workflow>__<visualFlavor>__<format>__v<version>.canva
```

Examples:
- `LLI__group_campaign__travel_nostalgia__ig_square__v1.canva`
- `LLI__cb_deal__modern_brand__story_reel__v2.canva`

When you import into Templated.io, keep the same name as the template title. The registry sync script (planned for P3) reads Templated's template list and matches by this convention.

---

## Versioning

- Bump `v<n>` in the filename whenever you change the template visually.
- The registry stores both `templated_id` (current) and `templated_id_previous` (last good).
- The orchestrator always uses `templated_id`. If a render fails N times in a row, the provider auto-rolls forward to `templated_id_previous` and surfaces a warning. (Implemented in P3.)

---

## Acceptance checks for a new template

Before promoting a template into the registry:

1. **Slot dataset matches registry exactly** — fetched via Templated.io's template dataset endpoint, diffed against `templates.json`.
2. **Renders at all max-length copy values** — run `/tests/canva-ads` with `headline = "X".repeat(50)`, `cta = "X".repeat(20)`. No overflow.
3. **Renders with shortest copy** — single-word headline, single-word CTA. No empty whitespace gaps.
4. **Image slot accepts both portrait and landscape source images** without ugly cropping (use object-fit: cover in the template).
5. **No bake-in of campaign-specific text or images** — every variable element must be a true slot.
