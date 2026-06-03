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
### Image-rich landing refresh proposal - 2026-06-02

**Problem:** The four landing designs are structurally working, but they still feel too sparse.
They use a hero, a few gallery moments, and occasional trust imagery, while the media pipeline is
now producing enough expressive image material to make the pages feel much more alive. The missing
piece is not another generic gallery alone; it is an image placement system that lets each design
use more pictures as atmosphere, texture, card depth, and section identity without flattening the
distinct visual flavor of the four designs.

**Design direction:** Keep the current four aesthetics intact, but increase image density by turning
images into a reusable visual material:

- Hero stays the strong first read, but the body should gain image-backed component surfaces: chat
  window, story cards, progress cards, pricing card, itinerary/process steps, FAQ strips,
  waitlist/form shell, sticky sidebar, banners, list-scroll rows, and quote blocks.
- Galleries should become multiple designed image moments, not one monolithic gallery section:
  editorial strips, stacked postcards, horizontal film rolls, zine clippings, background murals,
  and small supporting thumbnails inside cards.
- Background images should stay legible: dimmed, blurred, masked, duotoned, or cropped behind text
  with strong overlays. The image is atmosphere unless the component is explicitly a gallery or
  inspection component.
- Each visual flavor gets its own treatment:
  - `editorial_magazine`: full-bleed chapter images, masthead-like image bands, side-by-side
    editorial photo essays, polished image-backed quote panels.
  - `travel_nostalgia`: postcard stacks, faded paper photo panels, warm map/banner imagery,
    low-contrast image textures behind itinerary and pricing modules.
  - `indie_zine`: cutout collage tiles, sticker-like thumbnails, rough image strips, energetic
    image-backed callouts and list rows.
  - `none` / modular: clean operational image panels, dimmed card backgrounds, product-like
    media rails, calm image accents that keep the UI readable.

**Core implementation idea:** Add a semantic landing image placement layer on top of the current
collection system. The current `heroImage`, `galleryImages[]`, and `trustImages[]` remain the
fallback collections. A new optional placement map lets the studio pin exact assets to exact
semantic uses.

Proposed manifest shape:

```ts
manifest.landingImageSets = {
  gallery?: string[];
  trust?: string[];
  placements?: Record<LandingImagePlacementKey, string | string[]>;
}
```

Example placement keys:

| Placement key | Intent | Suggested fallback |
|---|---|---|
| `hero.primary` | Main landing hero | `heroImage` |
| `hero.supporting` | Secondary hero/card image | `galleryImages[0]` |
| `chat.backdrop` | Blurred/dimmed chat window image | `heroImage ?? galleryImages[0]` |
| `story.whatItIs.background` | Image behind or beside opening story module | `galleryImages[1]` |
| `story.expectation.cards` | Per-card thumbnails/backgrounds for guest expectations | `galleryImages[2..]` |
| `progress.card.background` | Formation/progress card atmosphere | `trustImages[0] ?? galleryImages[0]` |
| `pricing.banner` | Price/inventory module banner | `galleryImages[3]` |
| `itinerary.rail` | Process/how-it-works image rail | `galleryImages[4..6]` |
| `trust.card.backgrounds` | Trust bullet card backgrounds | `trustImages[]` |
| `faq.banner` | FAQ/decision reassurance banner | `galleryImages[7]` |
| `form.backdrop` | Waitlist form shell/background image | `galleryImages[8] ?? heroImage` |
| `footer.strip` | Closing visual strip | `galleryImages[9]` |

**View-model addition:** Resolve these placements once in `buildLandingViewModel` and expose them
as a typed `landing.imagePlacements` object. Renderers do not search the manifest themselves; they
ask for `landing.imagePlacements.chatBackdrop`, `landing.imagePlacements.formBackdrop`, etc. If a
placement is absent, the view-model falls back to the existing gallery/trust/hero ordering. This
keeps all four renderers deterministic and keeps the public route safe when no manual placement has
been curated.

**Landing Studio requirement:** `/tests/landing-studio` should become the manual control surface for
every image that can appear on the landing page:

- Add a `Placements` tab/panel below Hero/Gallery/Trust.
- Show every semantic placement as a compact row with current selected thumbnail(s), placement
  label, flavor usage note, clear button, and `Pick image`.
- For multi-image placements such as expectation cards, trust card backgrounds, or itinerary rails,
  use the same ordered tray pattern as Gallery: add/remove/reorder, then Apply.
- Add filters to the image pool: all, hero, scene, flyer, trust/ship, documentary, designed ads,
  generator/model, approved-only.
- Add a flavor preview hint per placement: for example, `chat.backdrop` shows "used as blurred
  panel background in all flavors"; `story.expectation.cards` shows "zine uses thumbnails, editorial
  uses card background crops."
- Keep batch-apply behavior so an operator can select many placements and reload the iframe once.
- Add an "auto fill empty placements" button that assigns unused approved assets across the
  placement map while preserving existing manual choices.

**Renderer approach:** Do not make four separate data models. Each renderer receives the same
semantic placements, then applies them in its own aesthetic language:

- Shared helpers: `ImageBackdrop`, `ImageCardSurface`, `ImageRail`, and `PlacedImage`.
- Editorial uses larger, cleaner crops and fewer overlays.
- Nostalgia uses warmer filters, paper edges, and postcard-like spacing.
- Zine uses more fragments, smaller crops, high contrast, and irregular placement.
- Modular uses quieter, lower-opacity backgrounds and clear card hierarchy.

**Acceptance standard:** The page should visibly contain more campaign-specific images above the
fold and throughout the body without hurting scanability or form completion:

- At least 8-12 distinct image appearances on a complete landing page when enough assets exist.
- Chat module has a selectable image background.
- Waitlist/form area has a selectable image background or companion image.
- Progress/pricing/trust areas have selectable image-backed treatments.
- The studio can manually pick or clear every non-algorithmic image placement.
- If no manual placement exists, the page still renders from the current hero/gallery/trust
  algorithms with no broken images.

**Phased delivery:**

1. **Phase 5 - Placement registry + view-model:** Add placement keys, manifest schema support, route
   support, and `landing.imagePlacements` fallback resolution.
2. **Phase 6 - Studio placement control:** Add placement rows/trays, image-pool filters, batch
   apply, clear, and auto-fill empty placements.
3. **Phase 7 - Renderer enrichment pass:** Update all four landing designs to consume placements in
   flavor-specific ways, starting with chat backdrop, form backdrop, story cards, progress/pricing,
   and trust cards.
4. **Phase 8 - Visual QA:** Use `/tests/landing-studio` to compare all four flavors on at least two
   campaigns, checking readability, mobile cropping, image repetition, and whether the page feels
   vibrant without turning into a loose collage.

### Implementation checkpoint - 2026-06-02

- Added `landingImageSets.placements` to the manifest schema and persisted it through the existing
  `/api/groups/campaign/[slug]/media/landing-images` route.
- Added typed landing image placement resolution in `buildLandingViewModel`, with graceful fallback
  to the existing hero/gallery/trust collections when a manual placement is absent or unusable.
- Extended `/tests/landing-studio` with a Placements panel for single-image placements and ordered
  multi-image placements. The panel uses the existing thumbnail pool and batch Apply behavior.
- Wired the first visible placement consumers: chat backdrop, progress card background, pricing
  banner, and waitlist/form backdrop.
- Added curated trust-set resolution in the view-model so future Trust studio controls can use the
  same full-replace behavior as Gallery.

### Visual QA correction - 2026-06-02

- Replaced the sand-heavy light-system palettes across the active landing renderers with brighter
  editorial, sea-glass nostalgia, and punchier zine surfaces.
- Expanded placement-backed image usage beyond isolated strips: story sections, progress/pricing,
  itinerary/travel bands, expectation cards, trust cards, form shell, and closing CTA now use
  selected placements or gallery fallbacks.
- Added stronger readability treatment for image-backed text surfaces: images are blurred/faded and
  sit under high-opacity light/dark gradient scrims so copy remains readable in all four design
  systems.

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
