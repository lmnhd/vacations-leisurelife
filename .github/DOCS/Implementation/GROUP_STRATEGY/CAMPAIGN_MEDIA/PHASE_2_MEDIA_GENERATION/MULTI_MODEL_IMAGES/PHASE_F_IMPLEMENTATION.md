# Multi-Model Image Generation — Phase F Implementation

**Implemented:** 2026-06-07
**Status:** ✅ Complete and verified end-to-end (Playwright UI + API + data inspection).
**Scope:** Extend the flyer multi-model pilot (Phases A–E) to the remaining generated
image sections — **Hero / Concepts, Documentary Details, Scene Images** — with the
per-tile A/B "Source" toggle, a shared model-selection control, and a tabbed controls
container on the Test Media Generation page.

> Companion to [`FEASIBILITY_AND_PLAN.md`](./FEASIBILITY_AND_PLAN.md) (the original
> verdict + phased plan). That doc described *what to build*; this doc records *what
> was built*, the bugs found during verification, and the operator-facing behavior.

---

## 1. Product decisions (locked at build time)

1. **Reference grounding:** the OpenAI (`gpt_image_2`) variant for scenes/heroes is
   **text-only**. gpt-image-2's `/v1/images/generations` endpoint takes no reference
   image, and we did NOT build the `/v1/images/edits` path. The Gemini variant keeps
   its ship-reference grounding; the OpenAI variant runs the same prompt without it
   and is tagged `no_reference_available`. A/B lets the operator pick the better tile.
2. **Config scope:** **one shared** "Image Models" control governs Hero/Concepts +
   Documentary + Scenes together. Flyers keep their own independent `flyerControls.models`.
3. **Downstream:** **only the selected** model-version is eligible downstream. Every
   auto-pick pool collapses each variant group to its selected member (default = the
   primary backend, Gemini). The non-selected variant is never auto-used.

---

## 2. How it works (operator-facing)

### The flow
1. On `/tests/media-generation`, pick a campaign.
2. Open **Image Generation Controls → Image Models** tab. Toggle **Gemini 3 Flash**
   and/or **GPT Image 2**.
3. **Click "Save Models".** (Watch the panel switch from *"using defaults"* to
   *"custom"* — see the gotcha in §6.)
4. Regenerate the section (Hero Images button, "Regenerate Section", or Generate All).
5. Each logical image is now generated once per active backend. In the review panel the
   two model-versions appear as **one card** with a **SOURCE** toggle
   (`Gemini 3 Flash | GPT Image 2`). Click to switch which version is canonical.

### What the toggle actually does (important)
Selecting a version writes a **pointer**, not a destructive edit:

```jsonc
"modelVersionSelections": { "img_hero_001": "gpt_image_2" }   // groupId -> generator
```

- **Both** model-version records stay stored and `active` in the section array.
- Downstream consumers obey the pointer at read time via `collapseVariantGroups`,
  which picks `modelVersionSelections[groupId]` or falls back to the **primary**
  backend (Gemini) when unset.
- So "the selected version is what flows to ads/landing/distribution"; the other
  version remains available to flip back to. The manifest still contains both.

### Single-model = legacy behavior
With one active backend, every logical image is a **single-member variant group** —
identical assetIds/paths to pre-Phase-F, no toggle shown, no collapse change. The whole
feature is opt-in and backward compatible (all new schema fields are optional).

---

## 3. Architecture & data model

| Concept | Where | Notes |
|---|---|---|
| **Backend registry** | `lib/campaigns/media/generators/image-backends.ts` | `getActiveImageBackends(models?)`, `IMAGE_BACKENDS` (order = priority; `[0]` = canonical default). `generate()` is text-only (no reference param). |
| **Shared config** | `schema.ts` → manifest `imageModelControls.models` | Parallel to `flyerControls.models`. One list for hero/concept/documentary/scene. |
| **Per-tile selection** | `schema.ts` → manifest `modelVersionSelections` | `variantGroupId -> generator`. Absent ⇒ primary. |
| **Variant grouping** | `AssetRecord.variantGroupId` + generator-suffixed ids | `${groupId}__${generator}` for assetId & R2 path so versions never collide. |
| **Collapse (the prerequisite)** | `lib/ads/html-templates/core.ts` → `collapseVariantGroups`, `buildImagePool` | Auto-pick pool collapses each section to the selected member. |

### Reference-aware variant helper
`stability-generator.ts` adds `generateReferenceAwareVariants(prompt, aspect, opts)`:
Gemini generates **with** the reference buffer (when present); every other backend
(gpt-image-2 today) generates text-only. Used by concepts (no ref) and heroes; scenes
inline the same Gemini-with-ref / OpenAI-text-only branch to preserve the existing
per-scene `referenceStatus` bookkeeping.

---

## 4. Files changed

### New
- `app/api/groups/campaign/[slug]/media/image-model-controls/route.ts` — GET/PATCH the
  shared `imageModelControls.models` (mirrors the flyer-controls route).
- `app/(tests)/tests/media-generation/image-model-controls-editor.tsx` — `ImageModelControlsBody`,
  the slim model-toggle editor saving to the new route.
- `app/(tests)/tests/media-generation/media-controls-tabs.tsx` — `MediaControlsTabs`, one
  collapsible card with two tabs (**Flyer Controls | Image Models**).

### Modified — schema/store
- `lib/campaigns/schema.ts` — add manifest `imageModelControls.models`.
- `lib/campaigns/media/media-store.ts` — `updateManifestImageModelControls`.

### Modified — generators (multi-model)
- `lib/campaigns/media/generators/stability-generator.ts` — `generateReferenceAwareVariants`
  + `VariantGeneratedImage`; `generateAestheticConcepts`, `generateSceneImages`,
  `generateHeroImages`, `generateReferenceGroundedHeroImages` now emit per-backend variants
  with `variantGroupId` + warnings.
- `lib/campaigns/media/ship-reference-service.ts` — `importHeroAssetsFromReferences` is
  variant-aware: the **primary** variant drives near-duplicate detection + the hero
  ordinal/cap; all model-versions of a hero are persisted under one `variantGroupId`.
- `lib/campaigns/media/generators/ad-artifact-generator.ts` — documentary details go
  multi-model; **only the canonical (primary) variant** seeds designed ads
  (`buildDesignedAdRenderSpecs`), all variants are stored + reviewable.

### Modified — orchestrator
- `lib/campaigns/media/media-orchestrator.ts` — reads `imageModelControls.models`, passes
  it to all four blocks, stamps `generator`/`variantGroupId` on records. **Critically also
  preserves `imageModelControls` in both manifest-reconstruction writes** (see §5, Bug 3).

### Modified — downstream collapse
- `lib/ads/html-templates/core.ts` — `buildImagePool` collapses every section to its
  selected model-version before building the auto-pick pool. (`collectSelectableImageGroups`
  / `getFlyerImages` already collapsed; `collectSelectableImageAssets` / `buildImageAssetIndex`
  stay UNcollapsed by design — they validate/resolve explicit operator overrides.)

### Modified — review UI
- `app/(tests)/tests/media-generation/media-review-panel.tsx` — `groupVariantEntries`
  generalizes the flyers-only grouping to hero/concept/scene/documentary tabs.
- `app/(tests)/tests/media-generation/flyer-controls-editor.tsx` — split body
  (`FlyerControlsBody`) from the `<details>` shell so the tabbed container reuses it.
- `app/(tests)/tests/media-generation/page.tsx` — render `MediaControlsTabs`.
- The `ReviewAssetCard` **Source toggle was already section-agnostic** (keys off
  `asset.variantGroupId`) — no change needed; it lights up automatically once a section
  emits variant groups.

### Modified — other generate/regenerate entry points (the gap that bit us)
- `app/api/groups/campaign/[slug]/media/regenerate-with-revision/core-logic.ts` — the
  per-asset **revision** route (used by "Regenerate Section" and per-card Revise) now
  respects the model config: regenerates a tile as a Gemini/OpenAI pair sharing a
  `variantGroupId`, replacing the whole old group. (Was single-model only.)
- `app/api/groups/campaign/[slug]/directives/[id]/apply/route.ts` &
  `app/api/groups/campaign/[slug]/media/test/images/route.ts` — updated for the new
  `{ images, warnings }` generator return shapes (single-model paths, no behavior change).

---

## 5. Bugs found during verification (and fixed)

The first "done" was premature; driving the real UI surfaced three real bugs. Recorded
here because each is a class of mistake worth not repeating.

1. **"Regenerate Section" bypassed multi-model.** It loops the per-asset
   `regenerate-with-revision` route, NOT the orchestrator. That route was single-model.
   → Made it model-config-aware (regenerates a variant pair, replaces the old group).
2. **Per-asset revision produced single-model.** Same route, per-card Revise. Same fix.
3. **The setting did not survive a generate run.** The orchestrator reads
   `imageModelControls` at the start (correct) but rebuilds the manifest at the end; the
   two reconstruction blocks carried `flyerControls` forward but **not**
   `imageModelControls`, so every full generate wiped the saved setting → the *next* run
   read `undefined` → single-model. This is why repeated "Generate Heroes" produced no
   toggles. → Added `imageModelControls: existingManifest?.imageModelControls` to both
   manifest-reconstruction writes in `media-orchestrator.ts`.

**Lesson:** "the data is correct" ≠ "the feature works from the UI." Verifying with the
actual page (Playwright) caught in minutes what data/API inspection missed across several
rounds. Always trace what the UI **buttons** call, not just the happy-path endpoint.

---

## 6. Known gotcha (operator UX) — NOT yet fixed

**The model toggle requires an explicit "Save Models" click.** Toggling the Gemini/OpenAI
buttons sets *unsaved local UI state*; the buttons show checkmarks even though the panel
still reads **"using defaults."** If you generate before clicking **Save Models**, the
orchestrator reads the default (single-model) and you get no toggles — with no obvious
signal why. This is a footgun, not a bug in the pipeline.

**Recommended fix (open):** auto-save the selection on toggle (drop the separate Save
click) and/or gate the per-category Generate buttons behind a saved setting. Until then,
the rule is: **toggle → Save Models (confirm "custom") → then generate.**

---

## 7. Verification performed

All on live campaigns against the running dev server:

- **Single-model regression:** unset `imageModelControls` ⇒ one record per logical image,
  no `__` suffix, no toggle, ads/curation unchanged.
- **Dual-model generate:** save `[gemini3_flash, gpt_image_2]` → generate heroes ⇒ each
  hero is a 2-member group sharing `variantGroupId`; review panel shows the SOURCE toggle.
  Confirmed via Playwright (`sourceToggleCount: 5` on baseball-card, `4` on speedcubers)
  and screenshots of the rendered toggle.
- **Setting persistence:** save models → run a full generate → setting survives
  (`usingDefaults: false`) — confirms Bug 3 fix.
- **Toggle round-trip:** clicking **GPT Image 2** on a hero card fires
  `PATCH …/media/model-version {groupId, generator}`, persists
  `modelVersionSelections`, and swaps the card's image + meta line to the OpenAI version.
- **Revision route multi-model:** a single hero revision produced
  `img_hero_rev_…__gemini3_flash` + `…__gpt_image_2` in one group.

---

## 8. Cost & safety

- N models ⇒ ~N× image spend for the enabled sections. Default = primary-only
  (single-model), so cost is opt-in per campaign.
- gpt-image-2 Tier-1 ≈ 5 img/min → variant generation stays **sequential**; avoid fanning
  concurrent OpenAI calls across sections.
- Backward compatible: every new schema field optional; Gemini-only ⇒ identical to pre-F.

---

## 9. Downstream-consumer audit (2026-06-07) ✅

A full trace of every reader of `images.hero` / `sceneImages` / `aestheticConcepts` /
`documentaryDetails` was done to ensure no path uses a non-selected variant or
double-counts both. **Shared helper added:** `collapseAssetVariantGroups(assets, selections)`
in `lib/campaigns/media/image-selection.ts` — an `AssetRecord`-typed mirror of
`core.ts` `collapseVariantGroups`, so any media/landing/distribution consumer can collapse
without the `HtmlTemplateAsset` dependency.

**The rule applied:** collapse wherever a section array is enumerated to **auto-pick or
auto-assemble output**; leave UNcollapsed wherever the operator's **explicit per-asset
override** must resolve to a specific variant.

### Bypasses found & fixed (would have used a non-selected/duplicate variant)
| Consumer | File | Fix |
|---|---|---|
| Landing hero auto-pick | `landing/view-model.ts` `selectLandingHeroAsset` | collapse hero+concept candidates |
| Landing gallery auto-assembly | `landing/view-model.ts` `buildGalleryImages` | collapse scene/hero/concept/detail (was showing BOTH variants — visible duplicate) |
| Landing trust cards | `landing/view-model.ts` `buildTrustImages` | collapse documentary details |
| Video-ad thumbnail fallback | `distribution-marketing.ts` `getFirstHeroImageUrl` | collapse hero |
| Distribution hero/Pinterest pick | `distribution-planner.ts` `getPrimaryHeroAssetId`, pinterest | collapse hero/concepts |
| Google Display image | `distribution/platforms/google-ads/campaign.ts` | collapse hero |
| Ad source pool | `lib/ads/render-pack.ts` `flattenManifestImages` | collapse all 4 sections before filtering |
| Platform-crop source auto-pick | `media-orchestrator.ts` (crop call site) | collapse hero/scene/concept |
| **Storyboard video scene map** (production) | `media-orchestrator.ts` sceneImageMap | collapse scenes (both variants share the sceneId tag → last-write-wins picked wrong variant) |
| Video regen scene map + hero | `regenerate-with-revision/core-logic.ts` | collapse scenes + hero |
| Generation plan scene map | `media/generate-plan/route.ts` | collapse scenes |
| TikTok beat resolution | `media/tiktok-edits/route.ts`, `media/tiktok-sequence/route.ts` | search collapsed pool/scenes |
| Storyboard/video test routes | `media/test/video`, `media/test/storyboard-shot` | collapse scenes |

### Intentionally UNcollapsed (verified correct — not bugs)
- **Explicit-override resolvers / assetId indexes** — must contain every variant so a
  curated non-canonical pick resolves: `findLandingSelectionOverride` & `buildLandingAssetIndex`
  (`view-model.ts`), `findSelectionOverride` & the `imageSelections` lookup
  (`platform-crop-selection.ts`), `resolveAssetUrl` (`distribution-discord.ts`),
  `findManifestAssetId` (`distribution-planner.ts`), `collectSelectableImageAssets` /
  `buildImageAssetIndex` (`core.ts`), and the selections-validation route.
- **`visual-compass-lint.ts` `collectPhotoRealSourceAssets`** — lint is a QUALITY GATE; it
  should audit ALL stored variants (so a broken non-selected variant is still flagged before
  you toggle to it), not just the selected one.
- **Directive/artifact management routes** (`directive-patch.ts`, `manifest/*-artifact`) —
  operate at the assetId level; intentionally see all variants for per-variant revise/remove.

### Cosmetic over-counts (no output impact — left as-is)
- `ad-pack-adapter.ts` pool-summary counts, `flyer-lab/talking-points` counts, and the
  media-generation page asset count show physical (both-variant) totals. These are
  diagnostic numbers, not output; collapsing them would arguably hide that 2× assets exist.

**Result:** every production OUTPUT path (landing, ads, distribution, video assembly,
platform crops) now honors `modelVersionSelections`. Typecheck green.

---

## 10. Out of scope / follow-ups

- **OpenAI `/v1/images/edits` reference grounding** — the OpenAI scene/hero variant is
  text-only for now.
- **Per-section independent toggles** — one shared control by decision.
- **`ImageSlotPicker` in-ad model comparison** on canva-templates (per original doc).
- **The Save-Models UX footgun** (§6) — recommend auto-save on toggle.
