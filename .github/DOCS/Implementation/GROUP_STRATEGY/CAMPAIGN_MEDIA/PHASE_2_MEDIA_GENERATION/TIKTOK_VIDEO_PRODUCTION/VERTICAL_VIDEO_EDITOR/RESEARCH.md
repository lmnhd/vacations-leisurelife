# Vertical Video Editor — Research

This is the as-built map of every system the editor sits on top of. Each section ends with the **seam** we use.

---

## 1. The render coordinate system (1080 × 1920)

The production TikTok package and the sandbox preview share one coordinate space: **1080 × 1920**. Card placements in `package-template.ts` are literal pixel rectangles in that space (e.g. the social statement card is `{ x: 70, y: 1180, width: 940, height: 320 }`). The preview route renders the same overlay buffers at the same `placement.x / placement.y`, so **what you lay out in the editor is what renders**. No design-canvas indirection.

Safe areas (`TIKTOK_TEMPLATE_SYSTEM.md` §7): reserve 200px top, 380px bottom, 130px right so cards clear TikTok/Reels UI chrome. The editor must draw these guides because the same export is used for both platforms and Reels chrome is similar enough that the TikTok reserves are a safe superset.

**Seam:** the editor canvas is a CSS-scaled 1080×1920 stage. Each overlay card is an absolutely-positioned box at its `placement`. Exactly the `Scaled` pattern from `canva-templates/page.tsx`, applied to a 9:16 stage instead of a static template.

---

## 2. The beat → scene → card data model

Source of truth: [`lib/campaigns/media/generators/tiktok-formats/package-template.ts`](../../../../../../../lib/campaigns/media/generators/tiktok-formats/package-template.ts).

A finished video is an array of **beats**. `buildPackageSequenceBeats(brief, storyboard, options, promotionPackage)` produces them:

```ts
interface TikTokSequenceBeat {
  presetId: 'hook' | 'social' | 'cta';   // cycles hook → social → cta → …
  sceneId: string;                        // from storyboard.shotSequence[i].sceneId
  overlaySpecs: TikTokOverlayCardSpec[];  // 1–2 cards per beat
  brandLockup: TikTokBrandLockupSpec;     // persistent wordmark
  spokenText: string;                     // narration line for this beat
  durationSeconds: number;                // from the shot, else even split
}
```

Construction rules that the editor must respect:

- **Preset rotation is positional**: beat `i` uses `PRESET_ROTATION[i % 3]` (`hook`, `social`, `cta`). The preset decides how many cards and where they sit.
- **Scene + duration always come from the storyboard** (`storyboard.shotSequence[i]`). Copy comes from the promotion package; the storyboard `narrationSegment` is the spoken fallback.
- **Beat count is clamped `[3, 8]`**, defaulting to the storyboard's shot count or 6. The promotion package **must** have at least `beatCount` beats or the build throws.
- A synthesized `TikTokPromotionPackage` is **required** — `buildPackageSequenceBeats` throws if it's missing. There is deliberately no brief-era fallback for production (`TIKTOK_PROMOTION_SYNTHESIS_PHASE_PLAN.md` §D).

### Card slots per preset (where copy lands)

| Preset   | Card 1 (variant / placement)                          | Card 2 (variant / placement)                          |
|----------|-------------------------------------------------------|-------------------------------------------------------|
| `hook`   | `tag` top `{70,220,940,220}` — headline + subline      | —                                                     |
| `social` | `tag` top `{70,220,940,200}` — headline                | `statement` bottom `{70,1180,940,320}` — subline      |
| `cta`    | `statement` mid `{70,1100,940,320}` — headline+subline | `cta` pill `{140,1480,800,110}` — `beat.cta` label    |

(From `buildHookBeatFromPromotion` / `buildSocialBeatFromPromotion` / `buildCtaBeatFromPromotion`.) Note the **non-obvious mapping** in the social beat: the promotion beat's `subline` is promoted to the bottom **statement** card's headline, not used as a subline. The editor's copy fields must map to the same slots so a preview matches the final render.

**Seam:** the editor edits the *inputs* to these builders — the per-beat copy and the scene binding — not the placements (placements stay template-owned unless we explicitly expose them in a later phase). `buildPackageSequenceBeats` is the function whose output the editor mirrors and whose inputs it overrides.

---

## 3. The overlay card spec (the visual unit)

[`lib/campaigns/media/generators/tiktok-overlay-cards.ts`](../../../../../../../lib/campaigns/media/generators/tiktok-overlay-cards.ts).

```ts
interface TikTokOverlayCardSpec {
  badge: string;
  headline: string;
  subline: string;
  spokenText?: string;
  accentColor: string;
  accentMuted?: string;
  variant?: 'tag' | 'statement' | 'cta';
  placement: { x; y; width; height };
}
```

Three variants render three distinct nodes (`buildTagCardNode`, `buildStatementCardNode`, `buildCtaCardNode`) via Satori → PNG (`renderPngFromElement`). Type sizes, gradients, accent strips, and the CTA arrow puck are all fixed in this file. The brand lockup (`TikTokBrandLockupSpec`) renders separately and is persistent (no fade).

Important constraints the editor preview should mirror so it doesn't lie:

- Text is clamped: `tag` headline ≤ 2 lines, `statement` headline ≤ 3 lines, `cta` headline ≤ 2 lines; badges are `shorten()`-truncated (20/22/18 chars).
- Lines split on `\n`, `/`, and `|`. An operator typing `A | B` gets two lines.
- `accentColor` drives the strip/border/CTA-fill; `accentMuted` is a secondary intensity.

**Seam:** the editor's live preview can render an HTML approximation of these three variants (cheap, instant) for layout/copy feedback, and call the real Satori-backed preview route for the high-fidelity check. The HTML approximation must copy the line-clamp and split rules above or it will mislead.

---

## 4. Scene images: how a beat binds to a picture

Scene images live on the manifest at `manifest.images.sceneImages: AssetRecord[]`. The binding from a beat to its image is **by `sceneId` in the asset's `tags`**:

```ts
// app/api/groups/campaign/[slug]/media/test/storyboard-shot/route.ts
const sceneImage = manifest.images.sceneImages.find(
  (record) => record.active && record.tags.includes(sceneId),
);
```

So a beat with `sceneId: "scene_03"` renders the active `sceneImages` record whose `tags` contain `"scene_03"`. There can be multiple records per scene (versions / alternates); `active` picks the canonical one.

`AssetRecord` (schema.ts:1294) carries `assetId`, `url`, `tags`, `active`, `reviewStatus`, `selectionScore`, `dimensions`, `variantGroupId`, etc. — everything an image picker needs.

**Seam:** the editor's per-beat **image picker** lists `sceneImages` (optionally all of them, grouped by `sceneId`, plus hero/aesthetic images as alternates) and overrides which `assetId` (hence URL) backs that beat. This is the direct analog of the Canva `ImageSlotPicker` selecting from `collectSelectableImageGroups`.

---

## 5. The Canva studio interaction model (what we're copying)

[`app/(tests)/tests/canva-templates/page.tsx`](../../../../../../../app/(tests)/tests/canva-templates/page.tsx) is the gold-standard pattern:

1. Load `brief` + `manifest` for a campaign (`CampaignSelector`).
2. Build an image pool / asset index from the manifest.
3. Render each template scaled-down, with an `ImageSlotPicker` and a copy-source `<select>` per slot.
4. Hold edits in **draft state** (`draftSelections`, `draftSlotControls`, `draftCopySelections`), compute `isDirty` against the saved manifest, and **Save picks** via `PATCH /api/groups/campaign/[slug]/media/selections`.
5. The same selections are read by production rendering — the studio and the renderer share the manifest, so what you save is what ships.

Persistence helpers live in `media-store.ts`: `updateManifestImageSelections`, `updateManifestImageSlotControls`, `updateManifestCopySelections`. Each merges a `Record<key, value | null>` patch (null = delete) into the manifest, `finalizeManifest`s, and saves. Keys are namespaced (`ad:<format>:<slot>`, `copy:<format>:headlineSource`). The PATCH route validates key prefixes (`ad:`, `crop:`, `section:`, `copy:`).

**Seam:** we add a parallel namespaced override store for the video — `tiktokVideoEdits` keyed by beat index — and a sibling save endpoint (or extend `selections`). Same draft/dirty/save loop, same "studio and renderer share the manifest" guarantee.

---

## 6. The existing TikTok playground (what we extend or replace)

[`app/(tests)/tests/tiktok-style-playground/page.tsx`](../../../../../../../app/(tests)/tests/tiktok-style-playground/page.tsx) + [`app/api/tests/tiktok-playground/preview/route.ts`](../../../../../../../app/api/tests/tiktok-playground/preview/route.ts).

What it already does well:

- The **preview route accepts a `sequenceBeats[]` array** — each beat with `backgroundImageUrl`, `overlaySpecs[]`, `brandLockup`, `spokenText`, `durationSeconds`, grain controls. It renders each beat (`createContainedStillVerticalClip` → `composeVideoWithOverlayCards`), stitches with `composeVideoSequenceWithTransitions`, generates ElevenLabs narration from the concatenated `spokenText`, and mixes with `composeProductionVideo`. **This is essentially the editor's render endpoint already.**
- Grain toggle + strength, brand-lockup fixed overlay, 9:16 output.

What it lacks (the gap the editor fills):

- Single hardcoded card, not the real beat sequence; no preset awareness.
- Not scene-aware — `previewImage` is one URL/`<select>`, not a per-beat scene binding.
- Saves nothing — no manifest persistence, no `isDirty`, no reload of prior edits.
- No safe-area guides, no 1080×1920 stage; preview is a CSS box on a scaled `<img>` with px placements that don't match the render space.
- No load of the synthesized `TikTokPromotionPackage` or storyboard — so it can't show the actual beats production will render.

**Decision (see plan §1):** build a **new page** `/tests/vertical-video-editor` rather than overload the playground. The playground stays as a throwaway single-card lab; the editor is the scene-strip, manifest-backed studio. The preview route is reused (and lightly extended) rather than duplicated.

---

## 7. The render/compose primitives

[`lib/campaigns/media/video-composer.ts`](../../../../../../../lib/campaigns/media/video-composer.ts):

- `createContainedStillVerticalClip(imageBuffer, durationSeconds)` — builds the backdrop+contained-still 9:16 base clip (Layer 0/1 from `TIKTOK_TEMPLATE_SYSTEM.md`).
- `composeVideoWithOverlayCards(baseClip, overlays[], duration, opts)` — burns overlay PNGs at `{x,y}`, optional `fixedOverlays` (brand lockup), grain.
- `composeVideoSequenceWithTransitions(beatBuffers[], durations[])` — stitches beats.
- `composeProductionVideo(clips[], narration, music, opts)` — final 9:16 mux with narration/music volumes.

Overlay PNGs come from `renderTikTokOverlayCard(spec)` / `renderTikTokBrandLockup(spec)`.

**Seam:** none of this changes. The editor produces the same `sequenceBeats[]` payload the preview route already consumes; the final "render production MP4" path calls the same composer the orchestrator uses.

---

## 8. TikTok ↔ Instagram Reels

Both are 9:16, both want the same safe-area-respecting vertical artifact. The `package-template.ts` already produces a platform-neutral vertical package; distribution separates `tiktok` vs `tiktok_paid` (`TIKTOK_VIDEO_REFACTOR_PLAN.md` §6) at the *delivery* layer, not the *artifact* layer.

**Decision:** the editor produces **one canonical vertical artifact** reused as both the TikTok video and the IG Reel. Platform-specific concerns (caption, hashtags, paid-vs-organic tagging, lead form) stay in distribution, downstream of the artifact. The editor may carry a lightweight "platform note" per beat later, but the imagery/copy/elements are shared. This keeps the editor a single source of truth and avoids forking the render.

---

## 9. Persistence target — the manifest

`CampaignMediaManifestSchema` (schema.ts:1483) already carries `tiktokPromotionPackage` and the Canva-style `imageSelections` / `imageSlotControls` / `copySelections`. It's an open object persisted via `media-store.ts` and finalized by `finalizeManifest`. Adding a `tiktokVideoEdits` field is the same kind of additive, optional change that `tiktokPromotionPackage` already is — no migration needed for existing manifests (it's `.optional()`).

**Seam:** new optional manifest field `tiktokVideoEdits`, new `updateManifestTikTokVideoEdits(slug, patch)` mirroring the existing update helpers, surfaced through a save endpoint and consumed by `buildPackageSequenceBeats` (which gains an optional `edits` override argument).

---

## 10. Summary of seams (the build surface)

| Concern            | Existing thing we build on                                   | What the editor adds                                  |
|--------------------|--------------------------------------------------------------|-------------------------------------------------------|
| Beat sequence      | `buildPackageSequenceBeats(...)`                              | optional `edits` arg; editor mirrors its output       |
| Per-beat image     | `sceneImages` bound by `tags.includes(sceneId)`              | per-beat image override (assetId) picker              |
| Per-beat copy      | promotion package beat → card slots                          | per-beat copy overrides (headline/subline/badge/cta/spoken) |
| Layout / elements  | fixed placements + brand lockup + grain                      | (phase 2) per-beat placement nudges, lockup, grain    |
| Live preview       | HTML stage (Canva pattern) + Satori preview route           | 1080×1920 stage, safe-area guides, real MP4 preview   |
| Persistence        | `imageSelections` / `copySelections` + `media-store` helpers | `tiktokVideoEdits` manifest field + update helper     |
| Render             | preview route `sequenceBeats[]` + `video-composer`           | editor emits the same payload; "render MP4" button    |
| Reels              | one 9:16 artifact; distribution separates delivery           | shared artifact, no fork                              |
