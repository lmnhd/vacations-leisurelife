# HTML Ad Template Reference

Complete specification for all 8 HTML ad templates. Each template is a React
component in `lib/ads/html-templates/components.tsx`, rendered server-side at
native pixel dimensions via `app/ads/render/[slug]/[format]/page.tsx`.

---

## Common Behavior (All Templates)

**Copy sources** (in priority order for each field):

| Field | Source |
|---|---|
| Headline / hero text | `brief.messaging.heroSlogan` |
| Subheadline | `brief.messaging.subSlogan` |
| Elevator pitch | `brief.messaging.elevatorPitch` |
| CTA button | `brief.messaging.ctaVariants.waitlist` |
| Color palette | `brief.visual.colorPalette` (primary/secondary/accent/background/textOnDark) |
| Fonts | `brief.visual.typographyDirection.suggestedFonts[0]` + `, sans-serif` |
| Theme name | `brief.themeName` |

**Image rendering:** Every image slot uses `backgroundImage: url(...), gradient` — the gradient is layered *beneath* the campaign image. If the image fails to load, the gradient is still visible. If no image is resolved, only the gradient renders.

**Gradient fallbacks** (defined in `core.ts`):
- `coldSea` — linear dark navy → primary → secondary
- `obsGlow` — radial amber glow + coldSea base
- `warmCore` — radial amber/warm centered gradient
- `glassGrid` — repeating 60px transparent grid overlay (simulates observatory glass)

---

## T1 — Google Display Landscape

| | |
|---|---|
| **Format key** | `google_display_landscape` |
| **Component** | `T1GoogleLandscape` |
| **Dimensions** | 1200 × 628 |
| **Platform** | Google Display Network |

**Layout:** Full-bleed background image with dark left-side gradient overlay. Left-aligned content: eyebrow ship name + amber rule, stacked ALL-CAPS headline (84px, tight leading), subheadline, amber CTA button + "from $X/person" price label. Right side: circular arc suggestion for glass dome aesthetic.

**Image slots:**

| Slot | Priority types | Role |
|---|---|---|
| `image-bg` | `scene_image`, `hero` | Full-bleed background |

**Copy used:** `heroSlogan` (headline), `subSlogan` (subhead), `ctaVariants.waitlist` (button)

---

## T2 — Elegant Story

| | |
|---|---|
| **Format key** | `story_reel` |
| **Component** | `T2ElegantStory` |
| **Dimensions** | 1080 × 1920 |
| **Platform** | Instagram/Meta Story, Reels |

**Layout:** Dark background image with 72% black tint overlay. Centered vertical text stack with ornamental gold elements: upward rule → eyebrow → diamond dividers → theme name (98px) → elevator pitch → horizontal divider with ✦ → ship + price → outlined CTA button → ornamental bottom closing. Optional strip of 4 tile images at the very bottom (120px tall, 60% opacity).

**Image slots:**

| Slot | Priority types | Role |
|---|---|---|
| `background-image` | `aesthetic_concept`, `hero`, `still` | Full-bleed atmospheric canvas |
| `hero_image` | `hero`, `scene_image`, `still` | Semi-transparent inset panel (right side, 35% opacity) |
| `tile_image_1` | `scene_image`, `still` | Bottom strip tile 1 |
| `tile_image_2` | `scene_image`, `hero`, `still` | Bottom strip tile 2 |
| `tile_image_3` | `still`, `aesthetic_concept`, `scene_image` | Bottom strip tile 3 |
| `tile_image_4` | `ship_reference`, `scene_image`, `hero` | Bottom strip tile 4 |

**Copy used:** `themeName` (main headline), `elevatorPitch` (body text), `ctaVariants.waitlist` (button)

---

## T3 — Google Display Square

| | |
|---|---|
| **Format key** | `google_display_square` |
| **Component** | `T3GoogleSquare` |
| **Dimensions** | 1080 × 1080 |
| **Platform** | Google Display Network |

**Layout:** Editorial split panel. Left 560px: dark image panel with concentric circle arcs (glass dome suggestion), aesthetic label watermark. Right panel: cream/white `#F8F5F0` background with amber rule + ship name eyebrow, large ALL-CAPS headline (70px), subheadline, dark CTA button + price.

**Image slots:**

| Slot | Priority types | Role |
|---|---|---|
| `hero_image` | `hero`, `scene_image` | Left panel background (with 25% dark overlay) |

**Copy used:** `heroSlogan` (headline), `subSlogan` (subhead), `ctaVariants.bookNow` (button), `aestheticLabel` (watermark)

---

## T4 — Meta Carousel Card

| | |
|---|---|
| **Format key** | `meta_carousel_square` |
| **Component** | `T4MetaCarousel` |
| **Dimensions** | 1080 × 1080 |
| **Platform** | Meta Feed Carousel |

**Layout:** Full-bleed background image with 45% dark overlay + glass grid texture. Bottom-anchored content: aesthetic label (amber eyebrow) → large ALL-CAPS headline (86px) → italic subheadline → amber CTA button + ship/price micro-label.

**Image slots:**

| Slot | Priority types | Role |
|---|---|---|
| `hero_image` | `scene_image`, `hero`, `aesthetic_concept` | Full-bleed background |

**Copy used:** `heroSlogan` (headline), `subSlogan` (subhead), `ctaVariants.bookNow` (button)

---

## T5 — Meta Story / Reel

| | |
|---|---|
| **Format key** | `meta_story_reel` |
| **Component** | `T5MetaStory` |
| **Dimensions** | 1080 × 1920 |
| **Platform** | Meta Story, Instagram Reels |

**Layout:** Full-bleed background image with 42% dark overlay + ambient amber glow radial gradient. Two diamond-masked accent images (rotated 45°, clipped circular interior): one upper-left (200×200), one lower-right (180×180). Two nested diamond frame outlines (640px and 572px, also rotated). Top: amber eyebrow. Center: large ALL-CAPS headline (106px). Bottom: subheadline + amber CTA + ship name.

**Image slots:**

| Slot | Priority types | Role |
|---|---|---|
| `hero_image` | `scene_image`, `hero` | Full-bleed background |
| `tile_image_1` | `still`, `scene_image` | Upper-left diamond accent |
| `tile_image_2` | `hero`, `scene_image`, `still` | Lower-right diamond accent |

**Copy used:** `heroSlogan` (headline), `subSlogan` (subhead), `ctaVariants.waitlist` (button)

---

## T6 — Meta Feed Square Collage

| | |
|---|---|
| **Format key** | `meta_feed_square` |
| **Component** | `T6MetaFeedSquare` |
| **Dimensions** | 1080 × 1080 |
| **Platform** | Meta Feed Square |

**Layout:** 2×2 grid of image panels (3px gap) filling the full canvas, with a 44% dark overlay covering all panels and a centered text block: aesthetic label (amber eyebrow) → ALL-CAPS headline (66px) → subheadline → amber CTA button.

**Image slots:**

| Slot | Priority types | Visual position |
|---|---|---|
| `tile_image_4` | `scene_image`, `aesthetic_concept` | Top-left |
| `tile_image_5` | `scene_image`, `hero` | Top-right |
| `tile_image_6` | `still`, `aesthetic_concept` | Bottom-left |
| `tile_image_1` | `still`, `aesthetic_concept` | Bottom-right |

*Note: tile_image_2, tile_image_3 are defined in SLOT_TYPES but used when needed for additional panels in extended layouts.*

**Copy used:** `heroSlogan` (headline), `subSlogan` (subhead), `ctaVariants.waitlist` (button)

---

## T7 — Meta Feed Portrait

| | |
|---|---|
| **Format key** | `meta_feed_portrait` |
| **Component** | `T7MetaFeedPortrait` |
| **Dimensions** | 1080 × 1350 |
| **Platform** | Meta Feed 4:5 |

**Layout:** Top 780px: 3 equal vertical image panels (3px gap). Bottom 570px: dark background block with amber top border (3px), amber eyebrow (ship + price) → stacked ALL-CAPS headline (54px) → subheadline → inline amber CTA button.

**Image slots:**

| Slot | Priority types | Visual position |
|---|---|---|
| `tile_image_1` | `scene_image`, `still` | Left panel |
| `tile_image_2` | `scene_image`, `still` | Center panel |
| `tile_image_3` | `still`, `scene_image` | Right panel |

**Copy used:** `heroSlogan` (headline), `subSlogan` (subhead), `ctaVariants.waitlist` (button)

---

## T8 — IG Story Grid

| | |
|---|---|
| **Format key** | `ig_story_grid` |
| **Component** | `T8IGStoryGrid` |
| **Dimensions** | 1080 × 1920 |
| **Platform** | Instagram Story, Vertical feed |

**Layout:** Top 1200px: 3×2 grid of image panels (3px gap). Bottom 720px: dark background block with amber top border (2px), aesthetic label (amber eyebrow) → ALL-CAPS headline (88px) → elevator pitch body text → amber CTA button + ship name.

**Image slots** (reuses `story_reel` slot names for image resolution):

| Slot | Priority types | Grid position |
|---|---|---|
| `tile_image_1` | `scene_image`, `still` | Row 1, col 1 |
| `hero_image` | `hero`, `scene_image`, `still` | Row 1, col 2 |
| `tile_image_2` | `scene_image`, `hero`, `still` | Row 1, col 3 |
| `tile_image_3` | `still`, `aesthetic_concept`, `scene_image` | Row 2, col 1 |
| `background-image` | `aesthetic_concept`, `hero`, `still` | Row 2, col 2 |
| `tile_image_4` | `ship_reference`, `scene_image`, `hero` | Row 2, col 3 |

**Copy used:** `heroSlogan` (headline), `elevatorPitch` (body), `ctaVariants.waitlist` (button)

---

## Shared Slot Name Contract

All slot names match the `templates.json` registry so Copy Forge image directives
and the Templated.io render path use the same vocabulary:

| Slot name | Typical role |
|---|---|
| `hero_image` | Primary focal / full-bleed background |
| `background-image` | Atmospheric canvas behind everything else |
| `image-bg` | Full-bleed background (landscape format variant) |
| `tile_image_1` … `tile_image_6` | Collage panels, film-strip tiles, grid cells |
