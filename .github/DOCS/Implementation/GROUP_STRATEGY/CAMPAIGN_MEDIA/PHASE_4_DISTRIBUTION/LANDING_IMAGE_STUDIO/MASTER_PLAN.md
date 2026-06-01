# Landing Image Studio — Master Plan

**Created:** 2026-05-31
**Status:** Phases 1–2 ✅ landed · Phase 3 (trust) + Phase 4 (polish) pending

### Progress
- **Phase 1** ✅ `/tests/landing-studio` — campaign + preview-system selectors, live landing
  preview (iframe over `/tests/campaign-landing/[slug]`), and the **hero** picker bound to
  `section:landingHero:primary` (pool from `collectSelectableImageGroups`). No server work needed.
  Verified end-to-end: setting a flyer as the landing hero rendered that exact image on the page.
- **Phase 1 UX fix** ✅ Replaced the name-dropdown with a **visual thumbnail grid**
  (`components/campaign-media/image-thumb-picker.tsx`, reusable for gallery/trust) so the operator
  scans real images and clicks once — the iframe only reloads on commit, not while browsing. Added
  `?chrome=0` to the landing preview route so the review/flavor bars don't slide over the page in
  the studio iframe. **Iframe scroll position is preserved across reloads** (capture `scrollY`
  before reload, restore on load + delayed re-applies for late image layout).
- **Phase 2** ✅ Gallery curated set. `manifest.landingImageSets.gallery` (FULL-REPLACE) +
  `updateManifestLandingImageSets` + `GET/PATCH …/media/landing-images`. `buildGalleryImages`
  resolves the curated ids in order (`buildLandingAssetIndex`, eligibility = active & not
  rejected/revision/hold, hero excluded, capped at 10) else the algorithm. Studio gallery tray:
  thumbnail multi-select to build the set, reorder (↑↓) + remove, **batch edit then Apply** (one
  reload). Verified by unit test: curated order honored; rejected ids skipped; no-override =
  algorithm; hero excluded. (Note: gallery renders client-side, so verify visually in the studio
  iframe — bare SSR HTML carries no image URLs.)
**Decision (2026-05-31):** *Curated sets + Landing Studio.* Override landing images at the
view-model's three **collections** (hero / gallery / trust), surfaced in a dedicated studio
preview. Reuses the `imageSelections` + picker + variant-collapse machinery built for flyers/ads.
**Related:** `../../PHASE_2_MEDIA_GENERATION/MULTI_MODEL_IMAGES/FEASIBILITY_AND_PLAN.md` (the
selection/override + variant pool this builds on).

---

## 1. Why landing ≠ flyers/ads

Flyers/ads have **fixed, named slots** (`ad:meta_carousel_square:hero_image`, `tile_image_1`…), so
per-slot override is natural. A landing page does **not**. The view-model
(`lib/campaigns/landing/view-model.ts`) resolves images into **three collections**, then many
visual systems render them however they like:

| Collection | Source today | Override today |
|---|---|---|
| `heroImage` (1) | `selectLandingHeroAsset` → crop/hero/concept, curated by `landing_hero_primary`/`_alt` context | ✅ **already** reads `imageSelections["section:landingHero:primary"]` (no UI) |
| `galleryImages[]` (≤10) | `buildGalleryImages` — algorithmic mix: scenes → trust → hero/crop/concept, de-duped, approved-only | ❌ none |
| `trustImages[]` | `buildTrustImages` — ship references + documentary details | ❌ none |

There are **many** landing renderers (`landing-page-visual-system`, editorial/nostalgia/zine,
plus gemini/claude/gpt/kimi variants). The **rendered** slots shift per system; the **collections**
are stable. `buildLandingViewModel(campaign, brief, manifest, …, flavorOverride?)` already takes a
`flavorOverride` (VisualFlavor) so a preview can switch systems.

### Key insight
**The right override boundary is the three view-model collections, not rendered slots** — it's
system-agnostic. The hero is a single-asset override (already wired); gallery & trust are
**curated ordered sets**.

---

## 2. Architecture

```
manifest.imageSelections["section:landingHero:primary"] = assetId         (EXISTS)
manifest.landingImageSets = { gallery?: assetId[]; trust?: assetId[] }      (NEW, optional)

view-model:
  heroImage     ← override id (exists) else context/approved pick (unchanged)
  galleryImages ← if landingImageSets.gallery → resolve those ids in order
                  else → today's algorithm   (opt-in override, backward compatible)
  trustImages   ← same pattern as gallery

Landing Studio (/tests/landing-studio):
  campaign selector
  [visual system ▾]  ← flavorOverride → live landing preview (reuse existing renderer)
  Hero:    <ImageSlotPicker key="section:landingHero:primary">
  Gallery: tray [drag-order | remove | + add from pool]
  Trust:   tray [drag-order | remove | + add from pool]
  Pool offered = collectSelectableImageGroups(manifest)   (variant-collapsed)
  ids resolved = buildImageAssetIndex(manifest)           (uncollapsed → any variant resolves)
```

---

## 3. Data model

- **Hero** — reuse `manifest.imageSelections["section:landingHero:primary"]` (string assetId). The
  selections PATCH route already accepts `section:` keys; `selectLandingHeroAsset` already reads it.
- **Gallery / Trust** — a list doesn't fit the key→id `imageSelections` map, so add:
  ```ts
  // schema.ts — CampaignMediaManifest
  landingImageSets: z.object({
      gallery: z.array(z.string()).optional(),
      trust:   z.array(z.string()).optional(),
  }).optional(),
  ```
  Absent/empty ⇒ today's algorithm (override is strictly opt-in). Add to `createEmptyManifest` +
  `finalizeManifest` parse.
- **Store fn** `updateManifestLandingImageSets(slug, { gallery?, trust? })` (mirrors
  `updateManifestFlyerControls`). **Route** `PATCH …/media/landing-images` (set/clear each list).

---

## 4. View-model changes (`view-model.ts`)

- `buildGalleryImages`: if `manifest.landingImageSets?.gallery?.length`, resolve those ids **in
  order** to `LandingImageAsset[]` (filter inactive/rejected via the same `isApprovedAsset`/active
  checks), de-dupe, drop the hero url; else fall back to the current algorithm. **Full-replace**
  semantics by default (predictable). Resolve ids against the full image index (uncollapsed) so a
  specific model-variant id still resolves.
- `buildTrustImages`: same opt-in branch.
- `selectLandingHeroAsset`: **unchanged** (already honors the override).
- No change to any visual-system renderer — they keep consuming `heroImage/galleryImages/trustImages`.

---

## 5. The Landing Studio (`/tests/landing-studio`)

- **Preview**: reuse the existing landing render path (the `tests/campaign-landing/[slug]` page /
  `buildLandingViewModel`) inside the studio, driven by a **visual-system selector** (`flavorOverride`)
  so the operator sees the chosen system live.
- **Hero picker**: `<ImageSlotPicker usePointKey="section:landingHero:primary" assets={pool}
  selectedAssetId={…} onChange={patchSelection} />` — the component already exists
  (`components/campaign-media/image-slot-picker.tsx`) and writes through the selections route.
- **Gallery / Trust trays**: an ordered, reorderable (drag) list of chips with remove + an "+ add"
  picker drawn from `collectSelectableImageGroups` (variant-collapsed → no duplicate model-versions).
  Save → `PATCH …/media/landing-images`. Preview re-resolves and updates.
- **Pool source of truth**: `collectSelectableImageGroups` (offer) + `buildImageAssetIndex` (resolve)
  — already variant-aware from MULTI_MODEL_IMAGES.

---

## 6. Phased plan (file-by-file)

### Phase 1 — Studio shell + hero picker *(the free win)*
- **NEW** `app/(tests)/tests/landing-studio/page.tsx` — campaign selector + visual-system selector +
  live landing preview + hero `ImageSlotPicker`.
- No server work (hero override + `section:` key already supported). Validate the studio UX here.

### Phase 2 — Gallery curated set
- `lib/campaigns/schema.ts` — `landingImageSets` field.
- `lib/campaigns/media/media-store.ts` — `updateManifestLandingImageSets`; empty-manifest default.
- **NEW** `app/api/groups/campaign/[slug]/media/landing-images/route.ts` — GET (current or `[]`),
  PATCH (set/clear `gallery`).
- `lib/campaigns/landing/view-model.ts` — `buildGalleryImages` opt-in branch.
- Studio — Gallery tray (reorder/remove/add).

### Phase 3 — Trust curated set
- Same as Phase 2 for `trust` (route + view-model branch + tray).

### Phase 4 — Polish
- Visual-system default + per-system preview niceties.
- Optional **source-LLM toggle** on placed landing images (the pool is already variant-aware — a
  placed image's model-version can be switched like in the Flyers tab).
- Optional **"pin + auto-fill remaining"** gallery mode (see open decisions).

---

## 7. Reuse inventory (most of it already exists)

| Need | Reuse |
|---|---|
| Hero override store + route | `imageSelections` + `…/media/selections` (`section:` keys) ✅ |
| Image pool (offer) | `collectSelectableImageGroups` (variant-collapsed) ✅ |
| Resolve any chosen id | `buildImageAssetIndex` (uncollapsed) ✅ |
| Slot picker UI | `ImageSlotPicker` ✅ |
| Live landing preview + system switch | `buildLandingViewModel` + `flavorOverride` + existing test landing page ✅ |
| New | `landingImageSets` field + store + `…/media/landing-images` route + view-model branch + studio page |

---

## 8. Decisions

1. **Gallery semantics: FULL-REPLACE (decided 2026-05-31).** When a curated `gallery` list exists,
   it *is* the gallery, in the operator's order — the algorithm is not consulted. Predictable:
   studio == shipped. A "pin + auto-fill remaining" mode is a Phase-4 opt-in toggle if ever wanted.
2. **Default preview system: the campaign's own production flavor (decided 2026-05-31).** The studio
   opens with whatever visual system that campaign actually ships (the same flavor the production
   view-model resolves when no `flavorOverride` is set), with the switcher to compare others. No
   hardcoded system.
3. **Trust priority:** keep separate from gallery (different intent) — ship in Phase 3.
4. **Selection-broken handling:** if a curated id is later deleted/rejected, the view-model skips it
   (graceful) and the studio flags the broken chip. Mirror the flyer selection-staleness behavior.

---

## 9. Risks

- **Many renderers:** we deliberately override at the view-model collections, so no renderer changes
  — but the studio preview should default to the production-canonical system to avoid confusion.
- **Approval coupling:** the gallery/trust resolution must keep the existing approved-only / active /
  not-rejected filtering so a curated-but-unapproved image doesn't ship. Resolve, then filter.
- **Cap interaction:** full-replace gallery should still respect the `maxGalleryImages` cap (currently
  10) — trim or warn in the studio.

---

## 10. Sequencing

1. **Phase 1** (studio shell + hero picker) — pure UI, validates the surface fast.
2. **Phase 2** (gallery curated set) — the substantive piece.
3. **Phase 3** (trust) — same pattern.
4. **Phase 4** (polish, source-LLM toggle, auto-fill mode).

> First concrete step after approval: Phase 1 — stand up `/tests/landing-studio` with the live
> preview + hero `ImageSlotPicker` bound to `section:landingHero:primary` (no server work needed).
