# Vertical Video Editor — Implementation Plan

**Status:** planning ready
**Prereq reading:** [RESEARCH.md](./RESEARCH.md), [`TIKTOK_TEMPLATE_SYSTEM.md`](../TIKTOK_TEMPLATE_SYSTEM.md), [`TIKTOK_PROMOTION_SYNTHESIS_PHASE_PLAN.md`](../TIKTOK_PROMOTION_SYNTHESIS_PHASE_PLAN.md)

The editor is **Canva-for-the-vertical-video**: a scene-strip studio where each beat of the TikTok / Reels video can have its image, copy, and elements changed, previewed at true 1080×1920, saved to the manifest, and rendered through the production composer.

---

## 0. Decisions (locked)

1. **New page** `app/(tests)/tests/vertical-video-editor/page.tsx`. Leave `tiktok-style-playground` as the single-card scratch lab. Rationale in RESEARCH §6.
2. **Reuse, don't fork, the render.** The editor emits the same `sequenceBeats[]` payload the existing preview route consumes, and final renders go through `buildPackageSequenceBeats` + `video-composer`. RESEARCH §7.
3. **One artifact for TikTok + Reels.** Platform delivery stays downstream in distribution. RESEARCH §8.
4. **Edits are overrides, not replacements.** The synthesized `TikTokPromotionPackage` + storyboard remain the base; `tiktokVideoEdits` is a sparse per-beat override layer (like `imageSelections`). A campaign with no edits renders exactly as today.
5. **Placements stay template-owned in Phase 1.** Copy + image are editable first (highest value, lowest risk). Element/placement nudging is Phase 2 behind the same override store.
6. **No new fallback copy path.** The production rule that TikTok render fails without a promotion package is preserved. The editor refuses to render a beat sequence if the package is missing — it surfaces a "synthesize promotion package first" state instead.

---

## 1. Data model: the `tiktokVideoEdits` manifest field

Add an optional, additive field to `CampaignMediaManifestSchema` (`lib/campaigns/schema.ts`), mirroring how `tiktokPromotionPackage` and `imageSelections` are already optional.

```ts
export const TikTokBeatEditSchema = z.object({
  // Image override: which sceneImages asset backs this beat.
  // null/absent ⇒ use the storyboard sceneId → active scene image binding.
  imageAssetId: z.string().optional(),

  // Copy overrides — absent field ⇒ fall through to the promotion-package beat.
  // Field names are slot-semantic, mapped to card slots in package-template.
  headline: z.string().optional(),
  subline: z.string().optional(),
  badge: z.string().optional(),
  cta: z.string().optional(),       // pill label on cta preset
  spokenText: z.string().optional(),

  // Phase 2 (not built in P1): element/layout nudges.
  placements: z.record(z.string(), z.object({
    x: z.number(), y: z.number(), width: z.number(), height: z.number(),
  })).optional(),
  hideBrandLockup: z.boolean().optional(),
});

export const TikTokVideoEditsSchema = z.object({
  updatedAt: z.string(),
  // Global render controls.
  applyFilmGrain: z.boolean().optional(),
  grainStrength: z.number().min(0).max(20).optional(),
  // Sparse per-beat overrides, keyed by beat index as a string ("0".."7").
  beats: z.record(z.string(), TikTokBeatEditSchema).default({}),
});
export type TikTokVideoEdits = z.infer<typeof TikTokVideoEditsSchema>;

// in CampaignMediaManifestSchema:
tiktokVideoEdits: TikTokVideoEditsSchema.optional(),
```

**Why beat-index keys, not sceneId keys:** the preset rotation is positional and the beat count is clamped, so the stable identity of "the third beat" is its index. SceneId can repeat or change; the index is what the renderer iterates. (If beat count changes because the storyboard changed, stale higher-index edits are simply ignored — document this.)

### Persistence helper (`lib/campaigns/media/media-store.ts`)

```ts
export async function updateManifestTikTokVideoEdits(
  slug: string,
  patch: Partial<TikTokVideoEdits> & { beats?: Record<string, TikTokBeatEdit | null> },
): Promise<CampaignMediaManifest>
```

Mirror `updateManifestImageSlotControls`: deep-merge `patch.beats` (a `null` beat-edit value deletes that beat's overrides; a partial merges per-field with `null` clearing a field), set `updatedAt`, merge the global grain flags, `finalizeManifest`, save. No migration — existing manifests just lack the field.

---

## 2. The base-sequence builder gains an override arg

Extend `buildPackageSequenceBeats` in [`package-template.ts`](../../../../../../../lib/campaigns/media/generators/tiktok-formats/package-template.ts) to accept an optional `edits?: TikTokVideoEdits`. After building each beat from the promotion package (unchanged), apply the sparse override for that index:

- **Copy**: if `edits.beats[i].headline` is set, replace the headline in the beat's primary copy slot **using the same slot mapping the promotion builders use** (e.g. for `social`, `subline` override → bottom statement card's headline; for `cta`, `cta` override → pill label). Keep the mapping in one place so editor preview and final render agree.
- **Image**: store `imageAssetId` on the returned beat (add an optional `imageAssetId?: string` to `TikTokSequenceBeat`) so the renderer resolves that asset instead of the `sceneId → active scene image` default.
- **Grain**: global, passed through to the composer call, not per beat.

This keeps the editor and the orchestrator on one code path: the orchestrator already calls `buildPackageSequenceBeats` — once it passes `manifest.tiktokVideoEdits`, **the saved edits ship in production automatically** (the Canva guarantee).

### Image resolution helper

Add a small resolver (colocate near the storyboard-shot route's helper, or lift it into `media-store`/a util):

```ts
function resolveBeatImageUrl(beat, manifest): string {
  if (beat.imageAssetId) {
    const a = allImageAssets(manifest).find(r => r.assetId === beat.imageAssetId && r.active);
    if (a) return a.url;
  }
  const scene = manifest.images.sceneImages.find(r => r.active && r.tags.includes(beat.sceneId));
  if (!scene) throw new Error(`No active scene image for ${beat.sceneId}`);
  return scene.url;
}
```

`allImageAssets` = sceneImages ∪ hero ∪ aestheticConcepts (the selectable pool for a beat). Validate the override `assetId` against this pool in the save endpoint, exactly like `selections` validates against `collectSelectableImageAssets`.

---

## 3. API surface

Two endpoints. Prefer extending existing routes over inventing new shapes.

### 3a. Load: reuse existing reads

The editor loads with the same calls the Canva page uses:

- `GET /api/groups/campaign/[slug]/media/aesthetic` → brief (has `productionBible.storyboards`, `colorPalette`).
- `GET /api/groups/campaign/[slug]/media/manifest` → manifest (has `tiktokPromotionPackage`, `sceneImages`, and now `tiktokVideoEdits`).

From these the editor can compute the **base beat sequence client-side** by porting the beat→card mapping, OR (preferred, single source of truth) add a tiny read:

- `GET /api/groups/campaign/[slug]/media/tiktok-sequence` → returns `buildPackageSequenceBeats(brief, storyboard, {}, promotionPackage, edits)` already resolved (beats with final copy, resolved image URLs, placements). The editor renders straight from this; no client-side duplication of the mapping. **Recommended** — it guarantees the editor preview equals the render.

### 3b. Save: per-beat edits

- `PATCH /api/groups/campaign/[slug]/media/tiktok-edits`
  Body: `{ beats?: Record<string, BeatEditPatch | null>, applyFilmGrain?, grainStrength? }`.
  Validates: beat indices in range `[0, beatCount)`; `imageAssetId` in the selectable pool; copy lengths within card clamps (warn, don't hard-fail). Calls `updateManifestTikTokVideoEdits`. Returns the updated manifest + the freshly rebuilt sequence (so the client refreshes in one round-trip).

(Alternatively fold this into the existing `/media/selections` route with a `tiktok:<i>:<field>` key namespace to match the Canva convention. The standalone `tiktok-edits` route is cleaner because the value shape is richer than a flat string; pick one and be consistent.)

### 3c. Preview render: reuse `tiktok-playground/preview`

The editor's "Preview MP4" button posts the resolved sequence as `sequenceBeats[]` to the **existing** [`POST /api/tests/tiktok-playground/preview`](../../../../../../../app/api/tests/tiktok-playground/preview/route.ts) route. It already does per-beat still+overlay compose, stitch, narration, mix, 9:16. Light extension only:

- accept an optional `themeMusicUrl` (already supported) sourced from the campaign's audio manifest;
- accept a `targetDurationSeconds` for the whole sequence (currently hardcoded 35 in the sequence branch) so the editor can honor the storyboard total.

For a **production** render (not preview), wire a button to the existing media generation path that calls `buildPackageSequenceBeats` with edits — i.e. the orchestrator already does this once §2 lands; the editor just needs a "regenerate tiktok_seed_video" trigger (existing `/media/generate` or `/media/test/video`).

---

## 4. The editor page — UI

`app/(tests)/tests/vertical-video-editor/page.tsx`. Layout mirrors `canva-templates` (header with `CampaignSelector`, dirty/save, zoom) but the body is a **horizontal scene strip**: one editor column per beat.

### Header
- `CampaignSelector` (defaultFilter `'designed'`), brief/manifest status chips.
- Promotion-package status: present (N beats) / missing (blocked, link to synthesize).
- Global controls: film grain toggle + strength slider, safe-area-guides toggle, theme-music select.
- **Save edits** button (dirty-aware, same draft/`isDirty`/save loop as Canva). **Preview MP4** button. **Render production video** button.

### Scene strip — per beat column
Each column = one beat, in render order, showing its `presetId`:

1. **Mini 9:16 stage** (CSS-scaled 1080×1920), showing:
   - the resolved scene image as contained still + dimmed backdrop band (approximation of `createContainedStillVerticalClip`);
   - the beat's overlay cards as absolutely-positioned HTML approximations of `tag`/`statement`/`cta` (copy the line-clamp + `/|`-split rules from `tiktok-overlay-cards.ts` so it doesn't lie);
   - the brand lockup;
   - dashed rose safe-area guides (200/380/130) when toggled.
2. **Image picker** — lists scene images grouped by `sceneId` (highlight the beat's default scene), plus hero/aesthetic as alternates. Selecting overrides `imageAssetId`. Reuse/adapt `ImageSlotPicker` or `components/campaign-media/image-slot-picker`.
3. **Copy fields** — only the slots that preset uses:
   - `hook`: badge, headline, subline, spokenText.
   - `social`: badge, headline (top tag), subline (→ bottom statement headline — label it clearly), spokenText.
   - `cta`: badge, headline, subline, cta (pill label), spokenText.
   Each field shows a placeholder = the promotion-package value; typing creates an override; a "reset to synthesized" clears it. Show the card char-clamp as a soft counter.
4. **Beat meta** — sceneId (read-only), duration (read-only from storyboard in P1), preset chip.

### Draft/save semantics
- Hold `draftEdits: TikTokVideoEdits` in state; `isDirty = JSON.stringify(draft) !== JSON.stringify(manifest.tiktokVideoEdits ?? empty)`.
- Save diffs draft vs saved per beat/field and PATCHes only changes (null clears), exactly like `saveSelections` in canva-templates.
- After save, refetch the resolved sequence so the strip reflects server truth.

### Empty / blocked states
- No promotion package → strip is disabled with a clear CTA to run synthesis (don't invent copy).
- No storyboard → blocked (sequence needs shots for scene + duration).
- No scene image for a beat's sceneId and no override → that beat's stage shows a "missing scene image" placeholder and the production render button is disabled until resolved.

---

## 5. Phasing

### Phase 1 — Read-only sequence mirror (de-risk) — ✅ IMPLEMENTED
- Schema: added `tiktokVideoEdits` + `TikTokBeatEdit`/`TikTokVideoEdits` + `imageAssetId` on `TikTokSequenceBeat`. (`schema.ts`)
- `buildPackageSequenceBeats` now accepts an optional `edits` arg and applies a centralized `applyBeatEdit` slot mapping; `edits` threaded through the format registry `buildSequenceBeats`. Empty edits are a verified no-op. (`package-template.ts`, `tiktok-formats/index.ts`)
- `updateManifestTikTokVideoEdits` store helper added. (`media-store.ts`)
- `GET …/media/tiktok-sequence` returns the resolved sequence (beats with final copy + resolved image URLs via override→scene-default), the selectable image pool, grain settings, and blocked-state statuses (`no_promotion_package`, `no_storyboard`, …). (new route)
- Page `app/(tests)/tests/vertical-video-editor/page.tsx`: CampaignSelector + horizontal scene strip rendering the **real** beats at true 1080×1920 (contained still + backdrop band, HTML overlay-card approximations mirroring the Satori variants + line-clamp/split rules, brand lockup, dashed safe-area guides, zoom). Read-only.
- Tests: `lib/campaigns/media/__tests__/tiktok-video-edits.test.ts` (6 passing) covering no-op edits + per-preset slot overrides + image/spoken overrides + fall-through.
- **Exit met:** `tsc --noEmit` clean; edit-override + existing seed-format tests green. Visual spot-check of `board-games-at-sea` in the browser is the remaining manual confirmation.

### Phase 2 — Image + copy overrides (the core ask) — ✅ IMPLEMENTED
- `buildPackageSequenceBeats` honors `edits` via centralized `applyBeatEdit` (Phase 1).
- `PATCH …/media/tiktok-edits`: validates beat indices against the real beat count + image overrides against the active selectable pool; persists via `updateManifestTikTokVideoEdits`; returns the rebuilt resolved sequence + baselines in one round-trip.
- Merge logic extracted to a pure, unit-tested `mergeTikTokVideoEdits` (`media-store.ts`) — per-field merge, null/empty clear, empty-beat drop, grain set/clear, whole-field removal when nothing remains.
- Endpoints now return a per-beat `baseline` (synthesized no-edit values, read with the same slot semantics) so the UI shows placeholders and offers reset-to-synthesized without replicating the mapping.
- Page: per-beat **image picker** (scene matches first, then alternates; reset-to-scene), **copy fields** per preset (labelled to the actual slot, incl. the social subline→bottom-statement mapping), draft/`isDirty`/**Save edits** loop, per-field reset, **film-grain** toggle + strength. Live preview applies unsaved draft via a client `applyDraftToBeat` that mirrors `applyBeatEdit`.
- Tests: extended `tiktok-video-edits.test.ts` to 11 passing (6 builder + 5 merge).
- **Exit met:** `tsc --noEmit` clean; 11 tests green. Save round-trips through the PATCH route (manual browser confirmation pending). **Note:** orchestrator wiring to actually ship edits in production renders is Phase 3 / Agent D — not yet done, so saved edits persist but do not yet affect the generated `tiktok_seed_video`.

### Phase 3 — Preview + production render — ✅ IMPLEMENTED
- **Image pool broadened to the whole library** (per request): both routes + the orchestrator now use `collectSelectableImageGroups` (hero, scene, flyer, concepts, documentary, ship refs, platform crops; model-version-collapsed, eligibility-filtered) — the same pool the Canva ad studio offers. The picker surfaces scene-tagged images first and hides the rest behind an "all images (N)" toggle with asset-type chips.
- **Orchestrator ships edits:** `generateStoryboardVideo` / `generateStaticPackageStoryboardVideo` gained optional `edits` + `beatImageUrlById` params. The orchestrator passes `existingManifest.tiktokVideoEdits` and a full-library `assetId → url` map; the static-package loop resolves `beat.imageAssetId` (any campaign image) ahead of the scene default, falling back to the scene image when the id is unknown. Absent edits ⇒ byte-identical to the pre-editor render.
- **Preview route** honors an explicit `durationSeconds` for the sequence branch (storyboard total) instead of a hardcoded 35s; theme music was already supported.
- **Page:** **Preview MP4** button builds the `sequenceBeats[]` payload from the current (unsaved) draft-applied beats and renders inline; **Render production** button (disabled while dirty) POSTs `{ assetTypes:['tiktok_seed_video'], forceRegenerateAssetTypes:['tiktok_seed_video'] }` to `/media/generate`. A results panel shows the preview video + render status.
- **Exit met:** `tsc --noEmit` clean; all tests green (11 edit + 1 seed-format). Preview/production are live; the actual MP4 round-trip needs the running app to confirm visually.

**Caveat — other render callers:** `regenerate-with-revision/core-logic.ts` and `test/video/route.ts` also call `generateStoryboardVideo` but do not yet pass edits (the new params are optional, so they compile and behave exactly as before). Wiring edits into those revision/test paths is a small follow-up if we want edits to apply there too; the primary `/media/generate` path is fully wired.

### Music bed fix (post-Phase 3)
The render code always mixes `themeMusicBuffer` into `composeProductionVideo`, but the buffer is only populated when `theme_music` is in the run's `assetTypes` (else it falls back to a pre-existing manifest track). The editor's two render paths missed this:
- **Production render** now sends `assetTypes: ['tiktok_seed_video', 'theme_music']` + `themeMusicSource: 'default'` — so a campaign with no track gets a free default-library track (no paid Replicate generation); an existing locked track is reused. Without this, narrated videos rendered with a silent bed and only a warning.
- **Preview MP4** now threads the campaign theme-music URL: the `tiktok-sequence` GET exposes `themeMusicUrl` (from `manifest.audio.themeMusic`), and the page passes it in the preview payload (the preview route already accepted `themeMusicUrl`).
- A header chip shows whether a music bed is present, warning when none exists yet.

### One artifact, both platforms (confirmed)
The render writes a single `videos.tiktokSeed` slot; the media-generation page reads the same manifest, so it updates automatically. The distribution planner fans that one asset out to `tiktok`/`tiktok_paid` **and** `instagram_reels` (same `assetId`, different caption variant) — one 9:16 render serves both, by design.

### Phase 4 — Element/layout controls + Reels polish (stretch)
- Per-beat placement nudges (drag or numeric) writing `placements` overrides; brand-lockup hide toggle.
- Optional per-platform caption note carried alongside the artifact (still one render).
- **Exit:** operator can nudge a card and the render honors it.

---

## 6. Files touched (map)

**New**
- `app/(tests)/tests/vertical-video-editor/page.tsx` — the studio.
- `app/api/groups/campaign/[slug]/media/tiktok-sequence/route.ts` — resolved base/edited sequence (GET).
- `app/api/groups/campaign/[slug]/media/tiktok-edits/route.ts` — save per-beat edits (PATCH).
- (optional) `components/campaign-media/vertical-beat-stage.tsx` — the 1080×1920 HTML preview stage + card approximations, shared by strip + any future review UI.

**Changed**
- `lib/campaigns/schema.ts` — `TikTokBeatEditSchema`, `TikTokVideoEditsSchema`, manifest field, `imageAssetId` on sequence beat type.
- `lib/campaigns/media/generators/tiktok-formats/package-template.ts` — `edits` arg + centralized slot-mapping + image override on beat.
- `lib/campaigns/media/media-store.ts` — `updateManifestTikTokVideoEdits`.
- `lib/campaigns/media/media-orchestrator.ts` — pass `manifest.tiktokVideoEdits` into `buildPackageSequenceBeats`; resolve per-beat image via override.
- `app/api/tests/tiktok-playground/preview/route.ts` — accept `targetDurationSeconds` for sequence; optional theme music passthrough.

**Reused unchanged**
- `tiktok-overlay-cards.ts`, `video-composer.ts`, `CampaignSelector`, `image-slot-picker`.

---

## 7. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Editor preview diverges from final render | Drive the strip from the server-resolved `tiktok-sequence` (one mapping). Copy the exact card clamp/split rules into the HTML approximation; offer the Satori-backed MP4 preview for the truth check. |
| Beat index drift when storyboard changes | Edits keyed by index; stale higher-index edits ignored on shorter sequences. Document; surface a "beat count changed, N edits inactive" notice. |
| Operator edits a campaign with no promotion package | Block render, show synthesize CTA. Never fall back to brief-era copy (preserves the §6 production rule). |
| Image override points at a stale/inactive asset | Validate `imageAssetId` against the active selectable pool in the PATCH route; fall back to scene default + warn if it later goes inactive. |
| Two save paths (selections vs tiktok-edits) confuse | Pick the standalone `tiktok-edits` route for the rich shape; keep Canva's `selections` route untouched. |

---

## 8. Agent execution plan (disjoint scopes)

### Agent A — Schema + store + builder
- `schema.ts`: `TikTokBeatEditSchema`, `TikTokVideoEditsSchema`, manifest field, `imageAssetId` on `TikTokSequenceBeat`.
- `media-store.ts`: `updateManifestTikTokVideoEdits`.
- `package-template.ts`: `edits` arg, centralized slot mapping, image override on beat.
- **Done when:** unit test shows `buildPackageSequenceBeats` with a sparse edit produces overridden copy/image and is identical to base when edits are empty.

### Agent B — API routes
- `GET …/media/tiktok-sequence` (resolved sequence with image URLs).
- `PATCH …/media/tiktok-edits` (validate + persist via Agent A's store helper).
- extend `tiktok-playground/preview` for duration + theme music.
- **Done when:** curl PATCH persists, GET reflects it, preview renders a sequence MP4.

### Agent C — Editor page + stage component
- `vertical-video-editor/page.tsx` + `vertical-beat-stage.tsx`.
- CampaignSelector, scene strip, image picker, copy fields, safe-area guides, draft/dirty/save, preview/render buttons.
- **Done when:** load `board-games-at-sea`, edit a beat image + headline, save, reload → persisted; Preview MP4 reflects the edit.

### Agent D — Orchestrator wiring + Reels note
- `media-orchestrator.ts`: pass `tiktokVideoEdits` into the builder and resolve per-beat image override on the production path.
- Confirm the one artifact is consumed by both `tiktok` and `tiktok_paid`/Reels distribution unchanged.
- **Done when:** a production `tiktok_seed_video` regeneration reflects saved edits; distribution still separates delivery without forking the artifact.

Keep A→B→C dependency order (C depends on B's routes, B depends on A's types/store). D lands after A.

---

## 9. What "done" looks like

- An operator opens `/tests/vertical-video-editor`, picks a campaign, and sees the real beat sequence as a scene strip at true 1080×1920 with safe-area guides.
- They can change each beat's **scene image**, **copy** (headline/subline/badge/CTA/spoken), and toggle **grain** — and (stretch) nudge **elements**.
- Edits save to `manifest.tiktokVideoEdits` and survive reload.
- A Preview MP4 reflects the edits; a production render of `tiktok_seed_video` reads the same edits — studio and renderer share the manifest.
- The identical vertical artifact is used for the TikTok video and the Instagram Reel; platform delivery stays in distribution.
- A campaign with no edits renders exactly as it does today (pure override layer, no regressions).
