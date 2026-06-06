# Vertical Video Editor

**Status:** planning
**Owner:** Curtis Clement
**Goal:** a Canva-style studio page for the vertical (9:16) TikTok / Instagram Reels video — where every scene's imagery, copy, and overlay elements can be swapped beat-by-beat and saved to the campaign manifest, then rendered through the existing production pipeline.

## Why this exists

We already have:

- A **Canva ad image studio** (`/tests/canva-templates`) where each ad's image slots and copy source are picked from the campaign's image pool and persisted to the manifest. This is the interaction model we like.
- A **TikTok static-package render pipeline** (`buildPackageSequenceBeats` → `createContainedStillVerticalClip` → overlay cards → `composeProductionVideo`) that turns a synthesized `TikTokPromotionPackage` + storyboard + scene images into a 9:16 MP4.
- A **TikTok style playground** (`/tests/tiktok-style-playground`) that can preview a single overlay card or a `sequenceBeats[]` array but is hardcoded, single-card, not scene-aware, and saves nothing.

What's missing is the **Canva-for-video** layer: a per-scene editor that sits on top of the real beat sequence, lets the operator change the image, copy, and elements of each beat, previews it at the true 1080×1920 coordinate system, persists the edits, and feeds them into the production render. The same vertical artifact is the TikTok video **and** the Instagram Reel.

## Documents

- [RESEARCH.md](./RESEARCH.md) — how the current TikTok video, Canva templates, scene images, and persistence work today; the exact data contracts and code seams we build on.
- [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) — the phased build plan, the manifest schema additions, the API surface, the editor UI, and the render integration. Includes a disjoint agent execution plan.

## One-line summary of the plan

Reuse the existing beat → scene → overlay-card data model. Build a scene-strip editor (one column per beat) that loads the real sequence, lets the operator override each beat's **scene image** (from the campaign scene pool), **copy** (headline / subline / badge / spoken / CTA), and **element layout** (placements, brand lockup, grain), persists those overrides under a new `tiktokVideoEdits` manifest field, and renders the live preview + final MP4 through the existing composer. Reels reuses the identical artifact.
