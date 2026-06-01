# HTML + Playwright Ad System — Master Plan

**Created:** 2026-05-29  
**Status:** Implemented and active  
**Supersedes:** `../TEMPLATED_IO/MASTER_PLAN.md`

---

## 1. Why We Switched from Templated.io to HTML + Playwright

The original plan was: design templates in Canva → import to Templated.io → call their render API → get PNGs. That plan was well-specified (see `../TEMPLATED_IO/MASTER_PLAN.md`) and we built the full Copy Forge + quality gate pipeline around it.

We switched because:

1. **Canva subscription cost** ($30/month) for 8 templates that are geometrically simple enough to build in HTML/CSS in a few hours.
2. **Dependency on two external services** (Canva + Templated.io) for what is ultimately a screenshot of styled HTML.
3. **Version control.** Template designs now live in the codebase as React components. Any visual change is a code change, reviewed in a PR, with full history.
4. **Speed.** Playwright screenshots are faster than a Templated.io API round-trip and don't require rehosting images to an external CDN first.
5. **Slot parity.** The same slot names (`hero_image`, `tile_image_1–6`, `image-bg`, `background-image`) were preserved from `templates.json`, so all downstream selection logic and copy-forge image directives continue to work without changes.

The Templated.io render path is still present behind `AD_RENDER_PROVIDER=templated`. The HTML screenshot path is the default.

---

## 2. System Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│  UPSTREAM (unchanged)                                                     │
│  Discovery → Brief Engine → Approved CampaignAestheticBrief              │
│            + Media pipeline → sceneImages, hero, shipReferences, stills  │
└────────────────────────────────────┬─────────────────────────────────────┘
                                     │
                                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  HTML AD RENDER SYSTEM  (lib/ads/html-templates/ + lib/ads/providers/)   │
│                                                                           │
│  1. TEMPLATE COMPONENTS  (lib/ads/html-templates/components.tsx)         │
│     8 React components, one per ad format. Each renders at native        │
│     pixel dimensions with inline CSS. Uses brief colors, heroSlogan,     │
│     ctaVariants.waitlist. Images are CSS backgroundImage layers          │
│     (campaign manifest URLs layered over gradient fallbacks).            │
│                                                                           │
│  2. RENDER ROUTE  (app/ads/render/[slug]/[format]/page.tsx)              │
│     Server component. Fetches brief + manifest directly from DynamoDB.   │
│     Resolves slot images via SLOT_TYPES priority tables. Renders          │
│     the template at native size. Injects CSS reset to hide Next.js        │
│     chrome and pins the template to the viewport corner.                  │
│                                                                           │
│  3. PLAYWRIGHT SCREENSHOT  (lib/ads/providers/html-screenshot.ts)        │
│     chromium.launch({ headless: true })                                   │
│     Sets viewport = template dimensions exactly.                          │
│     Navigates to /ads/render/[slug]/[format].                             │
│     Waits for all CSS background-images to load via page.evaluate().     │
│     Takes a clipped PNG at [0,0,w,h].                                     │
│                                                                           │
│  4. UPLOAD + MANIFEST WRITE  (generators/html-ad-generator.ts)           │
│     storeAsset() → R2 → public URL                                        │
│     AssetRecord { assetType: 'designed_ad_artifact',                      │
│                   generator: 'html_screenshot',                            │
│                   tags: ['designed_ad', 'html_screenshot',                │
│                          'provider:html_screenshot', 'format:X', 'meta'  │
│                          | 'google_display' | 'story' | 'reel', ...] }   │
│     saveAssetRecord() → DynamoDB                                          │
│                                                                           │
└────────────────────────────────────┬─────────────────────────────────────┘
                                     │
                                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  DOWNSTREAM (unchanged)                                                   │
│  manifest.images.designedAdArtifacts                                      │
│  Distribution planner → review UI → social publishing                    │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 3. File Map

```
lib/ads/
├── html-templates/
│   ├── core.ts              Data layer: types, resolveTemplateData(), SLOT_TYPES,
│   │                        buildImagePool(), resolveSlotImages(), TEMPLATE_DIMENSIONS,
│   │                        CSS helpers (imgOrGrad, coldSea, obsGlow, glassGrid)
│   └── components.tsx       8 React template components + FORMAT_COMPONENTS map
│
├── providers/
│   └── html-screenshot.ts   screenshotHtmlTemplate(), screenshotAllHtmlTemplates(),
│                            HTML_SCREENSHOT_SUPPORTED_FORMATS
│
└── template-registry/
    └── templates.json        Still the source of truth for slot names and
                              preferredAssetTypes — shared with the Templated.io path

app/ads/render/
├── layout.tsx               Minimal passthrough layout (no page chrome)
└── [slug]/[format]/
    └── page.tsx             Server component — fetches brief + manifest,
                             renders template + CSS reset + .ad-render-root pin

lib/campaigns/media/generators/
└── html-ad-generator.ts    generateHtmlAdArtifacts({ slug, formats?, onProgress? })

app/api/ads/
└── html-render/
    └── route.ts             POST { slug, formats? } → triggers generation

app/(tests)/tests/
└── canva-templates/
    └── page.tsx             Preview page — all 8 templates at scaled size,
                             live brief + manifest data, zoom controls
```

---

## 4. The 8 Templates

| Format key | Component | Dimensions | Image slots | Visual design |
|---|---|---|---|---|
| `google_display_landscape` | `T1GoogleLandscape` | 1200 × 628 | `image-bg`, `tile_image_1–2` | Hero bg + left headline, right 2-image facet column with accent divider |
| `story_reel` | `T2ElegantStory` | 1080 × 1920 | `background-image`, `hero_image`, `tile_image_1–4` | Navy/gold ornamental story, centered text, tile strip at bottom |
| `google_display_square` | `T3GoogleSquare` | 1080 × 1080 | `hero_image`, `tile_image_1–2` | Editorial split: dominant hero + 2 facet tiles left, cream text panel right |
| `meta_carousel_square` | `T4MetaCarousel` | 1080 × 1080 | `hero_image`, `tile_image_1–3` | Full-bleed hero + top-right facet strip, bottom-anchored headline + italic subline |
| `meta_story_reel` | `T5MetaStory` | 1080 × 1920 | `hero_image`, `tile_image_1–3` | Cold sea bg, rotated-square diamond frame, 3 diamond-masked tile images |
| `meta_feed_square` | `T6MetaFeedSquare` | 1080 × 1080 | `hero_image`, `tile_image_1–6` | 2×2 collage panels + centered dark text overlay |
| `meta_feed_portrait` | `T7MetaFeedPortrait` | 1080 × 1350 | `hero_image`, `tile_image_1–3` | 3 vertical panels top, dark text block bottom |
| `ig_story_grid` | `T8IGStoryGrid` | 1080 × 1920 | story_reel slot names | 3×2 grid of image panels + editorial text block bottom |

All templates use `brief.messaging.heroSlogan` as the headline, `brief.messaging.ctaVariants.waitlist` as the CTA button, and `brief.visual.colorPalette` for brand colors. CSS gradient fallbacks are applied automatically when no image is available for a slot.

### Single-image path: simple slug-prompt heroes

The brief-derived hero prompts (`buildHeroPrompts`) are long and heavily
constrained — right for grounded scene work, but they tend to produce literal,
busy frames that don't carry a whole niche in one shot. For ads that read as
ONE dominant image, the media run also generates a small batch of heroes from a
deliberately minimal prompt seeded only by the campaign slug:

```
Generate an image only, no text, for an ad promoting the following Themed Cruise:

'<campaign-slug>'
```

(`generateFlyerImages` in `generators/flyer-generator.ts`, generated at 1:1; see the
FLYER-IMAGE-REFACTOR plan.) These
land in `manifest.images.hero` tagged `simple_slug_hero` and are **excluded** from
the grounded hero pool that feeds the multi-facet layouts — `buildImagePool`
filters them out and `getSimpleSlugHeroes` surfaces them separately.

A **hero-source toggle** decides which look the single-image-capable formats
(`google_display_landscape`, `google_display_square`, `meta_carousel_square`) use:

- `pool` (default) → the multi-facet / brief-grounded look from the section below.
- `simple_slug` → `resolveSlotImages` fills only the format's primary image slot
  with one slug-prompt hero and drops every facet tile, so the single image stands
  alone. Toggle it on the `/tests/canva-templates` preview page (Hero · Simple slug),
  per render via `?heroSource=simple_slug`, or globally with `AD_HERO_SOURCE`.

### Design principle: multi-range visuals

A single packaged-group niche is multi-faceted — one photo rarely conveys the
whole theme, and counting on orchestration to auto-place one "perfect" hero that
expresses every idea at once is unrealistic. So **most templates carry multiple
images.** A template stays single-image only when one dominant frame genuinely
carries the format (e.g. the story-reel hero behind ornamental text).

Where a hero still anchors a format, supporting **facet tiles** were added rather
than rebuilding the layout — a slim strip or column of 2–3 secondary scenes that
hint at the rest of the experience while the hero keeps the drama. Every facet
slot renders only when the image pool can fill it; a thin pool degrades back to
the original single-image look (no empty boxes). See `resolveSlotImages` in
`core.ts` — it de-dupes picks across slots so facets differ from the hero.

---

## 5. Image Slot System

Slot names are identical to the Templated.io path so all upstream slot-assignment logic (Copy Forge image directives, `SLOT_TYPES` priority tables) is shared.

### How images are resolved

1. `getAestheticBrief(slug)` + `getMediaManifest(slug)` fetched server-side in the render route.
2. `buildImagePool(manifest)` buckets active assets by type (`hero`, `scene_image`, `aesthetic_concept`, `still`, `ship_reference`).
3. `resolveSlotImages(formatKey, pool)` iterates each slot in `SLOT_TYPES[formatKey]`, tries each `preferredAssetTypes` entry in order, picks the first unused URL.
4. Image URLs become CSS `backgroundImage` values layered over gradient fallbacks.

### Slot priority tables (from `core.ts`)

```ts
SLOT_TYPES = {
  google_display_landscape: {
    'image-bg':     ['scene_image', 'hero'],
    'tile_image_1': ['aesthetic_concept', 'still', 'scene_image'],   // right facet column
    'tile_image_2': ['ship_reference', 'scene_image', 'still'],
  },
  story_reel: {
    'background-image': ['aesthetic_concept', 'hero', 'still'],
    'hero_image':       ['hero', 'scene_image', 'still'],
    'tile_image_1':     ['scene_image', 'still'],
    'tile_image_2':     ['scene_image', 'hero', 'still'],
    'tile_image_3':     ['still', 'aesthetic_concept', 'scene_image'],
    'tile_image_4':     ['ship_reference', 'scene_image', 'hero'],
  },
  meta_feed_square: {
    'hero_image':   ['hero', 'scene_image'],
    'tile_image_1': ['still', 'aesthetic_concept'],
    'tile_image_2': ['still', 'aesthetic_concept'],
    'tile_image_3': ['scene_image', 'aesthetic_concept'],
    'tile_image_4': ['scene_image', 'aesthetic_concept'],
    'tile_image_5': ['scene_image', 'hero'],
    'tile_image_6': ['still', 'aesthetic_concept'],
  },
  // ... see core.ts for all formats
}
```

---

## 6. Playwright Screenshot Details

The screenshotter (`lib/ads/providers/html-screenshot.ts`) works as follows:

1. **Launch:** `chromium.launch({ headless: true })` — uses the Playwright Chromium bundled with the project (already a production dependency via `OdysseusEngine.ts`, `booking-link-validator.ts`).
2. **Viewport:** `page.setViewportSize({ width, height })` — set to the template's exact native pixel dimensions so no scaling occurs.
3. **Navigate:** `page.goto(/ads/render/${slug}/${format}, { waitUntil: 'domcontentloaded' })` — `networkidle` is intentionally avoided because CSS `backgroundImage` fetches (S3/R2 URLs) don't satisfy the networkidle heuristic and cause the timeout to stall indefinitely.
4. **Wait for images:** `page.evaluate(...)` — walks every DOM element, collects all `url(...)` values from computed `background-image`, and preloads each via `new Image()`. Resolves on both load and error so no stall.
5. **Paint settle:** `page.waitForTimeout(800ms)` — short extra wait for compositing.
6. **Screenshot:** `page.screenshot({ clip: { x: 0, y: 0, width, height } })` — precise crop, no browser chrome.

### CSS Reset in the Render Page

The render route injects a `<style>` block that:
- Resets `html, body { margin: 0; background: #000; overflow: hidden }`
- Pins the template div to `position: fixed; top: 0; left: 0; z-index: 2147483647` using class `.ad-render-root`
- Hides the Next.js dev overlay portals (`nextjs-portal`, `[data-nextjs-toast]`, etc.)

This ensures the screenshot captures only the template regardless of which other providers/portals Next.js has mounted.

---

## 7. Manifest Integration

Generated ads land in `manifest.images.designedAdArtifacts` as `AssetRecord` entries with:

```ts
{
  assetId:    'html_screenshot_meta_feed_square',
  assetType:  'designed_ad_artifact',
  generator:  'html_screenshot',
  url:        'https://pub-xxx.r2.dev/campaigns/{slug}/ads/html/meta_feed_square.png',
  tags: [
    'designed_ad',
    'html_screenshot',
    'provider:html_screenshot',
    'format:meta_feed_square',
    'workflow:group_campaign',
    'meta',                        // platform routing tag
  ],
  dimensions: { width: 1080, height: 1080 },
  reviewStatus: 'needs_review',
}
```

### Asset path in R2

`campaigns/{slug}/ads/html/{format}.png`

---

## 8. Distribution Integration

The distribution planner (`lib/campaigns/distribution-planner.ts`) selects designed ads by tag. The `selectDesignedAdAssetId` function now **prefers** `provider:html_screenshot` ads over legacy satori artifacts when both share a platform tag:

```
Facebook → searches ['meta'] first, then ['facebook'] legacy fallback
Google   → searches ['google_display'] — HTML screenshots carry this tag
TikTok   → uses video asset directly (not designed ads)
Instagram feed → searches ['instagram_feed'] then ['instagram_square']
```

The distribution marketing layer (`lib/campaigns/distribution-marketing.ts`) also uses `brief.messaging.heroSlogan` as the ad `headline` (overriding stale manifest copy) so the payload headline matches what's baked into the image — important for Google Display responsive placements where both can appear simultaneously.

---

## 9. Orchestrator Integration

`lib/campaigns/media/media-orchestrator.ts` checks `process.env.AD_RENDER_PROVIDER`:

```ts
const adRenderProvider = process.env.AD_RENDER_PROVIDER ?? 'html_screenshot';

if (adRenderProvider === 'html_screenshot') {
    await runWithJob(slug, 'designed_ad_artifact', 'html_screenshot', ..., async () => {
        const result = await generateHtmlAdArtifacts({ slug });
        ...
    });
} else {
    // Templated.io path — still fully functional
    await runWithJob(slug, 'designed_ad_artifact', 'templated', ..., async () => {
        const result = await generateTemplatedAdArtifactPack({ slug, brief, campaign, manifest });
        ...
    });
}
```

Default is `html_screenshot`. Set `AD_RENDER_PROVIDER=templated` to revert to Templated.io.

---

## 10. Preview Page

`/tests/canva-templates` — the canva-templates test page renders all 8 templates at scaled size using live brief + manifest data. Use it to:

- Preview all templates for a campaign before triggering media generation
- Verify color palette, headline, and images are correct
- Use the campaign selector to switch between campaigns
- Use the 75% / 100% / 125% zoom control to inspect at different scales
- Check the image pool counts (`hero:6 scene_image:10 ...`) at the top

---

## 11. Manual Trigger

To generate ads without going through the full media orchestrator:

```bash
# POST to the html-render route
curl -X POST http://localhost:3000/api/ads/html-render \
  -H "Content-Type: application/json" \
  -d '{"slug": "your-campaign-slug"}'

# Or for specific formats only:
curl -X POST http://localhost:3000/api/ads/html-render \
  -H "Content-Type: application/json" \
  -d '{"slug": "your-campaign-slug", "formats": ["google_display_landscape", "meta_feed_square"]}'
```

---

## 12. Environment Variables

```
AD_RENDER_PROVIDER=html_screenshot    # default — HTML + Playwright path
AD_RENDER_PROVIDER=templated          # Templated.io path (requires TEMPLATED_API_KEY)
APP_BASE_URL=http://localhost:3000    # base URL for the Playwright render fetch
                                       # in production this must be set to the deployed URL
AD_FLYER_COUNT=6                      # # of flyer images generated per media run
                                       # (0 disables the flyer path). See the
                                       # FLYER-IMAGE-REFACTOR plan.
AD_HERO_SOURCE=pool                   # default — single-image formats use the
                                       # multi-facet / brief-grounded look
AD_HERO_SOURCE=flyer                  # single-image-capable formats render ONE
                                       # flyer image, facet tiles dropped
```

`APP_BASE_URL` is critical in production. If unset, Playwright will attempt `http://localhost:3000` which will fail in a serverless or containerized deployment.

---

## 13. Adding a New Template

1. **Design the component** in `lib/ads/html-templates/components.tsx`. Follow the existing T1–T8 pattern: fixed pixel dimensions via inline styles, `{ d: ResolvedTemplateData; imgs: Imgs }` props, gradient fallbacks from `core.ts`.

2. **Register dimensions** in `TEMPLATE_DIMENSIONS` in `core.ts`:
   ```ts
   your_new_format: { width: 1080, height: 1080 }
   ```

3. **Register slot priorities** in `SLOT_TYPES` in `core.ts`:
   ```ts
   your_new_format: {
     'hero_image': ['hero', 'scene_image'],
     'tile_image_1': ['still', 'aesthetic_concept'],
   }
   ```

4. **Add to `FORMAT_COMPONENTS`** map at the bottom of `components.tsx`.

5. **Add a template entry** in `lib/ads/template-registry/templates.json` under the appropriate workflow/flavor key. Mirror the slot names exactly — this is what the copy-forge and the Templated.io path both reference.

6. **Update the preview page** (`app/(tests)/tests/canva-templates/page.tsx`) by adding the new format to the `TEMPLATES` array with an appropriate display scale.

7. **Update distribution planner tags** in `lib/campaigns/distribution-planner.ts` if the new format targets a platform that doesn't have a routing tag yet.

---

## 14. Relationship to the Templated.io Plan

The HTML/Playwright approach replaces Templated.io as the **render step only**. Everything else from the original plan remains:

| Component | Status |
|---|---|
| Copy Forge (`lib/ads/copy-forge/`) | ✅ Active — still generates per-format catchy copy + quality gate |
| Template Registry (`templates.json`) | ✅ Active — slot names and `preferredAssetTypes` shared between both paths |
| Image selection from manifest | ✅ Active — same priority logic, same slot names |
| `manifest.images.designedAdArtifacts` | ✅ Active — HTML screenshots land here exactly as Templated renders did |
| Distribution planner tag routing | ✅ Active — updated to prefer `provider:html_screenshot` |
| Review UI | ✅ Active — unchanged, reads from manifest |
| Templated.io provider | ✅ Retained — behind `AD_RENDER_PROVIDER=templated` flag |
| Canva Autofill provider | 🔲 Stub — still present for future Enterprise path |
