# Flyer-Image Refactor — Master Plan

**Created:** 2026-05-30
**Status:** Phases 1 + 0 + 2 landed · Phase 3 (universal override) next · Phase 4 pending
**Owner:** Curtis
**Related:** `../CANVA_TEMPLATE_BASED_ADS/HTML_PLAYWRIGHT/MASTER_PLAN.md` (single-image / `heroSource` toggle this work supersedes and generalizes)

### Progress log

- **Phase 1 (sandbox)** ✅ `/tests/flyer-lab` + `flyer-prompt.ts` (pure) + `flyer-generator.ts` +
  `/api/ads/flyer-lab/generate`. Negation rules finalized in `DEFAULT_FLYER_NEGATIONS`
  (added "no old-fashioned / painted style"; dropped redundant "oversized/grandiose").
- **Phase 0 (clean base)** ✅ `flyer_image` is a first-class asset type; `manifest.images.flyerImages`
  section; orchestrator emits flyers there (`AD_FLYER_COUNT`, default 6) with `eligibilityRole:
  'source.flyer'`; the `simple_slug` tag-hack is gone; `heroSource` value renamed `simple_slug`→`flyer`.
- **Phase 2 (section)** ✅ Flyers tab in the review panel, `source.flyer` curation lane, batch-regen +
  delete + history + regenerate-with-revision all route flyers; dedicated generate buttons on both
  `/tests/media-generation` (category) and `/tests/media-generation/test` (per-generator card).
- **UI tidy** ✅ `/tests/media-generation`: collapsed the layer-explainer, Copy Results, and full-JSON
  panels into `<details>`; added the Flyers category button + asset-count tile.

---

## 1. Why this exists

The "simple slug-prompt" single-image experiment worked — a deliberately minimal prompt
seeded by the campaign slug produces vivid, evocative single images that carry a whole
niche at a glance. But the first production rendition exposed a real problem:

- **What we want** (the originally-prompted reference): an *interior passenger POV* — guests
  inside the glass observatory, looking out at the aurora and a breaching whale. It sells the
  *experience* and the *perspective of the guest*.
- **What we got** (current generation): a sweeping *exterior hero shot of the whole ship*,
  rendered exorbitantly large and fantastical. This **counteracts the sell** (it's about being
  *aboard*, not gawking at a megaship) and **falsely portrays the vessel**.

This is the first of a set of **negation rules** the flyer-image prompt needs. We don't yet
know the full set — they have to be discovered empirically, one at a time, against many
campaign slugs. Hence: **build a sandbox first**, develop the rules, then graduate the
flyer-image into a first-class, fully-controllable part of the media pipeline.

Confirmed direction (this session):
- **Override scope:** *universal from day one* — every image-use point (ads, crops, flyer,
  hero, section primaries) becomes user-overridable from one shared mechanism.
- **Flyer prompt seed:** *slug + light brief anchors* — keep the slug seed, add a few
  brief-derived anchors (season, niche signal) to stay on-theme, then negations + variation.

---

## 2. Goals / Non-goals

### Goals
1. A **sandbox test page** to generate flyer images from arbitrary slugs and iteratively
   develop/toggle/refine **negation rules** one by one.
2. A first-class **`flyer_image` section**: its own asset type, manifest section, review tab,
   curation participation, dedicated generate button, AND integration into the full pipeline.
3. The flyer generator produces **6 wildly-varying renditions** per run for selection.
4. A **universal image-selection / override layer**: at *every* point the system auto-selects
   an image, the operator can swap in *any other image from the full manifest set* — including
   flyer images — and that choice is honored at render. This **subsumes** the `heroSource`
   toggle and delivers per-slot control over multi-image ads before rendering.
5. **On-the-fly regeneration**: regenerate any single flyer image from the UI by sending an
   update/steering message to the image model.
6. The **toggle behavior moves into the main pipeline**, not just the test page.

### Non-goals
- Flyer images are **not** auto-consumed by ads/other assets. They sit in their own pool and
  are only used where the operator explicitly selects them.
- No change to video/audio generation pipelines (override layer covers their *thumbnail/poster*
  image-use points only where applicable; A/V generation itself is out of scope).
- Not removing the multi-facet ad layouts — those remain the default look.

---

## 3. Terminology

| Term | Meaning |
|---|---|
| **flyer image** | A vivid, single-frame "flyer/poster" image seeded by slug + light brief anchors. New asset type `flyer_image`, manifest section `flyerImages`. |
| **negation rule** | A constraint appended to the flyer prompt to suppress an unwanted tendency (e.g. "no full-ship exterior hero shots"). Tunable; developed in the sandbox. |
| **variation axis** | A directive that pushes a rendition toward a distinct interpretation (perspective / time-of-day / mood / framing) so the 6 renditions vary wildly. |
| **image-use point** | Any place the system selects an image to display/render: an ad slot, a crop source, the flyer/hero chosen for a single-image ad, a section primary, etc. |
| **selection override** | An operator-set mapping `image-use point → assetId`, persisted, that wins over automatic selection. |

---

## 4. Architecture at a glance

```
┌─ SANDBOX (Phase 1) ──────────────────────────────────────────────┐
│ /tests/flyer-lab                                                  │
│  slug picker → editable negation-rule list + variation axes       │
│  → POST /api/ads/flyer-lab/generate  (transient, NOT persisted)   │
│  → grid of renditions, per-tile "regenerate with note"            │
│  Outcome: a finalized DEFAULT_FLYER_NEGATIONS set in code.        │
└───────────────────────────────────────────────────────────────────┘
                          │ graduates into
                          ▼
┌─ FLYER SECTION (Phase 2) ────────────────────────────────────────┐
│ assetType 'flyer_image' · manifest.images.flyerImages             │
│ generator: buildFlyerPrompt(slug, brief, negations, axis)         │
│ orchestrator step → 6 renditions · own generate button · own tab  │
│ curation + review + history all participate                       │
└───────────────────────────────────────────────────────────────────┘
                          │ feeds (only when selected)
                          ▼
┌─ UNIVERSAL OVERRIDE LAYER (Phase 3) ─────────────────────────────┐
│ manifest.imageSelections: Record<UsePointKey, assetId>  (1 store) │
│ every image-use point reads override-first, auto-pick fallback    │
│ EDIT SURFACES split: canva-templates = ad-slot studio;            │
│   media-generation = pool/curation + non-ad points + deep-link    │
│ render route + resolveSlotImages honor overrides (replaces toggle)│
└───────────────────────────────────────────────────────────────────┘
                          │ plus
                          ▼
┌─ ON-THE-FLY REGEN (Phase 4) ─────────────────────────────────────┐
│ per-image "steer & regenerate" → image model → replaces in place  │
│ built on existing regenerate-with-revision plumbing               │
└───────────────────────────────────────────────────────────────────┘
```

---

## 5. Phase 0 — Refactor the stopgap into a clean base

The current single-image work stuffed slug-prompt heroes into `images.hero` behind a
`simple_slug_hero` tag. Promote it to its own section so everything downstream is clean.

- **schema.ts** — add `flyer_image` to `AssetTypeEnum` (L1169); add
  `flyerImages: z.array(AssetRecordSchema).default([])` to the manifest `images` object (L1488).
- **asset-manifest-section.ts** — map `flyer_image → 'flyerImages'`; add to
  `TAB_HISTORY_ASSET_TYPES` under a new `flyers` tab.
- **media-orchestrator.ts** — change the simple-slug block to emit `assetType: 'flyer_image'`,
  tag `flyer` (drop the `simple_slug_hero`-on-hero hack), and merge into a new
  `flyerImages` manifest section instead of `heroRecords`. Keep `AD_SIMPLE_SLUG_HERO_COUNT`
  → rename `AD_FLYER_COUNT` (default 6 once Phase 2 lands; 2 until then).
- **lib/ads/html-templates/core.ts** — replace the tag-filtering hack: `getSimpleSlugHeroes`
  → `getFlyerImages(manifest)` reads `manifest.images.flyerImages`. `buildImagePool` no longer
  needs to exclude tagged heroes (they're not in `hero` anymore). Keep the `heroSource` plumbing
  but rename to `flyer_image` source value (see Phase 3 — it ultimately becomes an override).
- **distribution / render-pack** — `flyerImages` is a *source* pool excluded from grounded
  hero selection (mirror how `designedAdArtifacts` is structurally excluded in `render-pack.ts`).

> Phase 0 is a clean prerequisite; it doesn't change behavior, it just gives flyers a real home.

---

## 6. Phase 1 — The sandbox (`/tests/flyer-lab`)

**Purpose:** discover the negation rules empirically. This is where we work *first*.

### UI
- Campaign **slug picker** (reuse `CampaignSelector`) + free-text slug entry (so we can test
  slugs without a full campaign).
- **Negation-rule list** — editable rows, each: `{ enabled, text }`. Seeded with the known
  first rule ("no full-ship exterior hero shots; interior/guest-POV preferred"). Add / remove /
  toggle / reorder. This is the "weed them out one by one" surface.
- **Variation axes** — editable list of the 6 axis directives used to spread the renditions.
- **Brief-anchor preview** — shows the light anchors (season, niche signal) that will be
  injected, pulled from the brief; toggle individual anchors on/off.
- **Generate** → calls the lab endpoint, renders a grid of N renditions.
- Per-tile: **prompt readout**, **regenerate-with-note** (steer a single tile), download.
- **"Copy as DEFAULT_FLYER_NEGATIONS"** — exports the finalized enabled rules as the code
  constant to paste into the generator. This is how the sandbox graduates into Phase 2.

### Backend
- `POST /api/ads/flyer-lab/generate` — body `{ slug, negations[], axes[], anchors[], count }`.
  Builds prompts via the shared `buildFlyerPrompt`, calls the image model, returns base64/data
  URLs. **Transient** — nothing is written to the manifest (lab is throwaway).
- Reuses `generateSimpleSlugAdImages`'s model path, refactored into `buildFlyerPrompt` +
  `generateFlyerImages` (see §7).

### Outcome
A finalized `DEFAULT_FLYER_NEGATIONS` + `DEFAULT_FLYER_VARIATION_AXES` committed to code, ready
for Phase 2. No production wiring happens until the rules feel right.

---

## 7. The flyer prompt model

```
buildFlyerPrompt(slug, brief, { negations, anchors, axis }) =>
   base:      "Generate an image only, no text, for an ad promoting the following
               Themed Cruise:\n\n'<slug>'"
 + anchors:   light brief-derived hints, e.g. "Season: winter."  "Niche: deep-sea / aurora watching."
              (kept SHORT — 1 line each, opt-in; not the long brief paragraphs)
 + negations: "Avoid: full-ship exterior hero shots; oversized/exorbitant vessel portrayal;
               drone/aerial megaship framing; <…discovered in sandbox…>"
 + axis:      one of 6 variation directives, e.g.
               1. interior guest POV from the observatory looking out
               2. intimate two-guest moment, foreground detail
               3. wildlife/landscape-led with ship edge implied
               4. golden/blue-hour tonal shift
               5. cozy low-light interior ambience
               6. deck-level human-scale vantage
```

- **Aspect:** generate at `1:1` (covers square single-image formats; wide/tall center-crop).
- **6 renditions = 6 axes** by default, so the set varies by construction, not just by RNG.
- Negations & axes are **data** (arrays), tuned in the sandbox, shipped as defaults, and
  overridable per-call.

---

## 8. Phase 2 — Flyer section in media generation

### Generation
- New orchestrator step (Phase 0 already moved it to `flyer_image`): generate **6** renditions
  via `generateFlyerImages(slug, brief, count=6)`, store in `manifest.images.flyerImages` as
  `flyer_image` records, `eligibilityRole: 'source.flyer'` (new role; **not** auto-selected by
  ads). Runs inside "Generate All" and via its own button.
- **Own generate button** on `/tests/media-generation/test` — a `GenerationControl` card
  ("Flyer Images — 6 wildly-varying single-image renditions; not auto-used; selectable per use").
- **`assetTypes: ['flyer_image']`** routes through the existing `/media/generate` path.
- Add `flyer_image` to `PRODUCTION_ALL_MEDIA_ASSET_TYPES` / `default-asset-types.ts` and
  `shouldRunAsset` handling.

### Review / Curation
- New **`flyers` tab** in `media-review-panel.tsx` (`{ id: 'flyers', label: 'Flyers', icon: … }`),
  grouping `manifest.images.flyerImages`.
- New curation eligibility role row `source.flyer` in the curation role list.
- Approve / Revise / Reject / Curate / lock / batch-regenerate all work via existing card plumbing
  (`flyer_image` added to `BATCH_REGENERABLE_IMAGE_TYPES` and the image delete/regen endpoints).
- History/restore: `flyer_image` already covered once added to `ASSET_TYPE_TO_SECTION`.

---

## 9. Phase 3 — Universal image-selection / override layer (the big one)

This is the unifying feature behind "swap any image," "select any image in a multi-image ad
before rendering," and "move the toggle into the pipeline." **Universal from day one.**

### Data model
```ts
// New manifest field (schema.ts)
imageSelections: Record<UsePointKey, string /* assetId */>   // default {}
```
A **UsePointKey** is a stable string identifying one image-use point. Proposed grammar:
```
ad:<format>:<slotName>        e.g. ad:meta_carousel_square:hero_image
ad:<format>:flyer             the single-image/flyer choice for a format
crop:<imageFormat>            platform crop source
section:<section>:primary     a section's chosen primary, if any
```
Override resolution everywhere becomes: **`imageSelections[key]` (if the asset is still active &
eligible) → else the existing automatic pick.**

### Resolver changes
- `lib/ads/html-templates/core.ts` — `resolveSlotImages(format, pool, opts)` gains
  `selections?: Record<string,string>` + an `assetById` lookup. For each slot it checks
  `selections['ad:'+format+':'+slot]` first. The current `heroSource` special-case becomes just
  a selection on the primary slot (`ad:<format>:hero_image|image-bg` = a flyer assetId). **The
  `heroSource` toggle is retired in favor of explicit per-slot selection.**
- Render route + `html-screenshot` provider pass the campaign's `imageSelections` through (read
  from manifest server-side — no query param needed; this is the "in the main pipeline" ask).

### One store, surfaces split by domain
The override **store is singular and universal** — `manifest.imageSelections` is the only source
of truth, written by a single `PATCH /api/groups/campaign/[slug]/media/selections` route, read by
the render route + distribution. But the **editing surfaces are split** so neither page is
crammed (decided 2026-05-30):

- **`/tests/canva-templates` = the ad image-switching studio.** It already renders all 8 templates
  live from the pool, so per-slot swapping with instant re-render belongs here. Each ad shows
  per-slot pickers (hover overlay) backed by the **full manifest image set**
  (hero + scene + concept + still + ship ref + **flyer**). The existing `heroSource` toggle
  *becomes* the hero/primary slot's picker (choose a flyer, a hero, or any pool image). A "Save"
  writes the chosen `ad:<format>:<slot>` selections; the live preview is faithful because the
  render route reads the same store.
- **media-generation = pool + curation surface.** Stays focused on *"is this image any good?"*
  (review / approve / regenerate / manage flyers & heroes & scenes). It hosts pickers only for
  **non-ad** use points (crops, section primaries) and shows an **"Edit ad images →" link** that
  deep-links to `/tests/canva-templates` for the selected campaign when the operator wants to
  compose the ads.
- **Reusable `<ImageSlotPicker>`**: one component, given a UsePointKey + the full image set,
  used by both surfaces; writes to the shared store.
- **Curation continuity:** selections respect curation (a blocked/rejected asset can't be chosen;
  if a selected asset is later rejected, resolution falls back to auto-pick and flags it).

> Note: `/tests/canva-templates` is currently a throwaway test page. As it becomes the real ad
> composition tool, graduate it out of `/tests/` — **non-blocking follow-up**, tracked here.

### Render integration
- Distribution/render reads `imageSelections` so what ships matches what the operator chose.
- Because selection is per-use-point and persisted, the multi-facet ads and the single/flyer ads
  are just *different selection sets* over the same templates — no separate template needed.

---

## 10. Phase 4 — Intelligent on-the-fly flyer regeneration

- Per-flyer (and reusable for any image) **"steer & regenerate"**: operator types an update
  message ("pull back inside the dome, dusk light, remove the megaship silhouette"); the system
  composes original prompt + negations + the steering note into one coherent prompt and
  regenerates **that single asset in place**, versioned.
- Built on the **existing** `regenerate-with-revision` route + `regenerate-with-revision/core-logic.ts`
  (already does "rewrite original prompt + repair note into one coherent prompt"). Extend it to
  accept a free-text steering message and to handle `flyer_image`.
- Surfaces in: the flyers tab card, the sandbox tiles, and (optionally) the ad slot picker
  ("regenerate the image in this slot").

### Implementation checkpoint — 2026-05-31

- `regenerate-with-revision` now accepts `steeringMessage` as an alias for the revision note and
  supports `flyer_image` in the image regeneration branch.
- Flyer regeneration uses the square flyer image settings (`1:1`) instead of the hero-image
  aspect ratio.
- New flyer versions preserve the source eligibility role and logical `variantGroupId`, reset
  approval to review-needed, and carry a version increment.
- Manifest references are retargeted from the old asset id to the regenerated asset id so saved
  `imageSelections` and landing gallery selections keep pointing at the operator's intended image.
- The media-generation asset card labels flyer regeneration as **Steer & Regenerate Flyer** and
  sends the operator note as `steeringMessage`.

### Implementation checkpoint — 2026-06-02

- `/tests/flyer-lab` now requests actual selected image backends (`gemini3_flash`,
  `gpt_image_2`, or both) instead of tagging one generated image as a different model.
- `generateFlyerRenditions` uses the shared multi-model image backend registry and returns
  grouped per-rendition variants plus backend warnings.
- The lab result cards now expose a **source** switcher that swaps between the real generated
  model outputs for that rendition.
- Add/assign manifest commits save the currently displayed variant bytes and its real
  `generator`, so a GPT Image 2 save is backed by a GPT Image 2 render.
- Flyer Lab settings are now saved per campaign slug in local storage: base prompt template,
  negation rules, variation axes, selected image models, fallback count, and brief-anchor
  toggles return when that campaign is loaded again.
- The latest saved Flyer Lab state from any campaign is now exposed as a reusable template on
  every other campaign, so operators can clone a proven setup into a new slug without rebuilding
  the controls by hand.
- Added a lab-only Talking Point Generator that reads the campaign brief and media manifest,
  proposes campaign-specific in-image callout chips, stores them per campaign, and passes
  enabled chips into the actual flyer prompt as optional text-box material.
- Flyer Lab panels are collapsible at the major-column level and at the nested control/result
  level, including generated rendition tiles, so the expanded lab stays usable as settings grow.

---

## 11. Data-model change summary

| File | Change |
|---|---|
| `lib/campaigns/schema.ts` | `AssetTypeEnum` += `flyer_image`; manifest `images.flyerImages`; manifest `imageSelections: Record<string,string>` default `{}`; new eligibility role `source.flyer`. |
| `lib/campaigns/media/asset-manifest-section.ts` | `flyer_image → 'flyerImages'`; `flyers` tab in `TAB_HISTORY_ASSET_TYPES`. |
| `lib/campaigns/media/default-asset-types.ts` | add `flyer_image` to production asset types. |

---

## 12. File-by-file change map (by phase)

**Phase 0 (refactor base)**
- `lib/campaigns/schema.ts`, `asset-manifest-section.ts`
- `lib/campaigns/media/media-orchestrator.ts` (emit `flyer_image`, new section merge, rename count env)
- `lib/ads/html-templates/core.ts` (`getFlyerImages`, drop tag hack)
- `lib/ads/render-pack.ts` (exclude `flyerImages` from source pools)

**Phase 1 (sandbox)**
- `lib/campaigns/media/generators/flyer-generator.ts` (NEW — `buildFlyerPrompt`,
  `generateFlyerImages`, `DEFAULT_FLYER_NEGATIONS`, `DEFAULT_FLYER_VARIATION_AXES`;
  refactor `generateSimpleSlugAdImages` into this)
- `app/(tests)/tests/flyer-lab/page.tsx` (NEW — the sandbox)
- `app/api/ads/flyer-lab/generate/route.ts` (NEW — transient generation)

**Phase 2 (section)**
- `media-orchestrator.ts` (6 renditions, generate-all wiring)
- `app/(tests)/tests/media-generation/test/page.tsx` (Flyer generate card)
- `app/(tests)/tests/media-generation/media-review-panel.tsx` (flyers tab, curation role)
- `review-asset-card.tsx` (flyer regen affordance)
- `app/api/.../media/generate` (already generic over assetTypes — verify)

**Phase 3 (universal override)**
- `lib/campaigns/schema.ts` (`imageSelections`)
- `lib/ads/html-templates/core.ts` (selection-first resolution; retire `heroSource`)
- `app/ads/render/[slug]/[format]/page.tsx`, `lib/ads/providers/html-screenshot.ts`
  (read selections from manifest; drop the env/query toggle)
- `components/.../ImageSlotPicker.tsx` (NEW), wired into canva-templates + media-generation
- `app/api/groups/campaign/[slug]/media/selections/route.ts` (NEW — PATCH selections)
- `lib/campaigns/distribution-*.ts` (honor selections at ship time)

**Phase 4 (regen)**
- `app/api/.../media/regenerate-with-revision/core-logic.ts` (steering message, `flyer_image`)
- UI hooks in flyers tab + sandbox

---

## 13. Open decisions / risks (to confirm as we build)

1. **UsePointKey grammar** — proposed in §9; lock it before Phase 3 since it's persisted.
2. **6-rendition cost** — 6 image-gen calls per campaign run. Gate behind `AD_FLYER_COUNT`
   (default 6, 0 disables). Sandbox runs are on-demand only.
3. **Selection staleness** — when a selected asset is deleted/rejected, resolution must fall back
   gracefully and surface a "selection broken → using auto-pick" warning.
4. **Aspect coverage** — flyers are 1:1; landscape ads center-crop. If a flyer is chosen for a
   landscape slot and crops badly, the picker should warn (or we generate an extra wide flyer axis).
5. **`heroSource` retirement** — Phase 3 removes the env/query toggle from
   `CANVA_TEMPLATE_BASED_ADS` in favor of selections; update that doc when it lands.

---

## 14. Sequencing

1. **Phase 1 sandbox first** (per your instruction) — but it needs the `flyer-generator.ts`
   extraction (small slice of Phase 0). We do: extract generator → build `/tests/flyer-lab` →
   iterate negation rules with you until the set feels right.
2. **Phase 0 finish** — promote `flyer_image` to a real section (schema/manifest/orchestrator).
3. **Phase 2** — flyer section in media-generation (tab, button, 6 renditions, curation).
4. **Phase 3** — universal override layer (lock UsePointKey grammar first).
5. **Phase 4** — on-the-fly steered regeneration.

> First concrete step after this plan is approved: extract `flyer-generator.ts` and stand up
> `/tests/flyer-lab` so we can start weeding out negation rules.
