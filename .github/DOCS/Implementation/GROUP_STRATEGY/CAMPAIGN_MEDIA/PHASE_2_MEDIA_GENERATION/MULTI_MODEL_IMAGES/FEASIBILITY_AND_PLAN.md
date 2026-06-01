# Multi-Model Image Generation — Feasibility Report & Plan

**Created:** 2026-05-31
**Status:** ✅ Flyer pilot COMPLETE (Phases A–E). Phase F (extend to heroes/scenes/concepts) is future work.

### Progress
- **Phase A** ✅ `gpt-image.ts` (`generateGptImage2`, b64, retry) + `image-backends.ts` registry
  (`getActiveImageBackends`, `generateVariants`) + `GPT_IMAGE_2_CONFIG`. Smoke-tested live.
- **Phase B** ✅ `AssetRecord.variantGroupId`, `manifest.modelVersionSelections`,
  `updateManifestModelVersionSelections`, `PATCH …/media/model-version`.
- **Phase C** ✅ `generateFlyerImages` is multi-model (one variant per axis × backend,
  `variantGroupId = flyer_NNN`, generator-suffixed ids); orchestrator stamps per-variant
  `generator` + `variantGroupId` and reads `flyerControls.models`; controls editor has a
  model picker (`gemini3_flash` primary, `gpt_image_2` opt-in). Single-model default unchanged.
- **Phase D** ✅ `collapseVariantGroups` + `collectSelectableImageGroups` (picker-facing, one
  canonical per group) + collapsed `getFlyerImages`; `buildImageAssetIndex` stays uncollapsed so
  already-selected variants still resolve. Canva-templates + media-generation pickers use the
  collapsed pool. Verified deterministically.
- **Phase E** ✅ Review panel groups flyer variants into one card; `ReviewAssetCard` shows a
  **Source** toggle (model labels) that PATCHes `…/media/model-version` and refreshes. Single-model
  items show no toggle.
**Trigger:** Add OpenAI **gpt-image-2** alongside the current Gemini (Nano-Banana) image path; generate the same prompt across N models, store each as an independent "model-version" of one logical item, and add a per-item **source-LLM toggle** in the UI.

---

## 1. Verdict

**Feasible and low-risk — if we pilot on the flyer section first.** The current pipeline already decouples *what model ran* (`AssetRecord.generator`) from *where the asset lives* (manifest section arrays), and Phase 3 already established the "selection persisted on the manifest" pattern. Multi-model fits both cleanly:

- A new **image-backend registry** lets us call 1..N models with one prompt without touching the single-model flow (one backend ⇒ identical behavior to today).
- A **`variantGroupId`** on `AssetRecord` links the model-versions of one logical item; the UI renders one card per group with a source-LLM toggle.
- **Flyers are the ideal pilot**: they are *not* auto-consumed by ads/downstream (operator selects them per use-point via Phase 3 `imageSelections`), so doubling the variant count has near-zero blast radius on pool-building/curation/distribution. We prove the pattern there, then extend to heroes/scenes/concepts once pool consumers are made variant-aware.

---

## 2. OpenAI gpt-image-2 — research findings

| Item | Finding |
|---|---|
| **Model id** | `gpt-image-2` (snapshot `gpt-image-2-2026-04-21`) |
| **Released** | API opened to developers early **May 2026** (model launched Apr 21, 2026) |
| **Endpoint** | `POST https://api.openai.com/v1/images/generations` |
| **Auth** | Standard OpenAI API key (`OPENAI_API_KEY`) — already present in this project (LLM calls + the env-check "OPENAI" badge) |
| **Request body** | `{ model, prompt, size, quality, n, response_format }` (prompt up to ~4000 chars) |
| **Sizes** | `1024x1024`, `1792x1024`, `1024x1792`, `2048x2048` (1:1, ~16:9, ~9:16, large 1:1) |
| **Quality** | ✅ **VERIFIED 2026-05-31:** `low` \| `medium` \| `high` \| `auto` (gpt-image-1 lineage) — **NOT** the `standard`/`high` some third-party docs claim. |
| **Response** | ✅ **VERIFIED:** returns **`b64_json` only** (no `url` in practice), matching the Nano-Banana Buffer flow. Our generator still falls back to `url` defensively. |
| **Latency (1024²)** | ✅ **MEASURED:** `low` ≈ 40s · `medium` ≈ 61s · `high` > 110s. We default to **`medium`** for flyer comparison (knob in `GPT_IMAGE_2_CONFIG`). |
| **Availability** | ✅ **CONFIRMED** in this account's `/v1/models`: `gpt-image-2`, `gpt-image-2-2026-04-21` (also `gpt-image-1`, `-mini`, `-1.5`). |
| **Pricing** | ~**$0.04–$0.35 per image** (token-based; varies by size/quality) |
| **Rate limit** | Tier-1 starts at **5 image requests/min** |
| **Notable** | Reasoning pipeline (slower at high quality). DALL·E 2/3 retire **May 12, 2026** — `dalle3` in our enum is now legacy. |

> ✅ **Phase A smoke test (2026-05-31)** locked the request shape: `POST /v1/images/generations` `{ model:'gpt-image-2', prompt, size:'1024x1024', quality:'medium', n:1 }` → `data[0].b64_json` → Buffer. Connectivity/auth/availability all green.

**Sources:**
- [GPT Image 2 — OpenAI API docs](https://developers.openai.com/api/docs/models/gpt-image-2)
- [Introducing gpt-image-2 — OpenAI Developer Community](https://community.openai.com/t/introducing-gpt-image-2-available-today-in-the-api-and-codex/1379479)
- [GPT Image 2 API developer guide (pricing & params)](https://framia.converge.ai/page/en-US/news/gpt-image-2-api)
- [GPT Image 2 complete guide 2026](https://www.befreed.ai/blog/gpt-image-2-guide-2026)

---

## 3. Current architecture (single-model)

- **One image model, hardcoded.** Every section's generator (hero/flyer/scene/concept/merch) ultimately calls `generateNanoBananaImage()` (Gemini `gemini-2.5-flash-image`) in `stability-generator.ts`. `NANO_BANANA_CONFIG` holds its params.
- **`generator` is metadata, decoupled from the call.** `getMediaImageGeneratorService()` returns the literal `'gemini3_flash'` (`media-pipeline-config.ts`), stamped onto every `AssetRecord.generator`. The actual model is *not* selected through this — it's a label. (This decoupling is exactly what makes multi-model easy.)
- **Per-section flow:** `generateXImages()` → `GeneratedImage[] { buffer, prompt, assetId, fileName, filterId }` → `uploadAndRecord(...)` stamps `assetType`, `generator`, `tags`, `eligibilityRole` → `saveAssetRecord()` + push into the manifest section array.
- **Selection (Phase 3):** `manifest.imageSelections: Record<UsePointKey, assetId>` overrides which asset fills an ad slot; `collectSelectableImageAssets` / `buildImageAssetIndex` enumerate the pool. Flyers feed this but are excluded from auto-pools.

---

## 4. Proposed architecture

### 4.1 Image-backend registry (the core abstraction)
`lib/campaigns/media/generators/image-backends.ts`

```ts
export interface ImageBackend {
  id: GeneratorService;          // 'gemini3_flash' | 'gpt_image_2' | …
  label: string;                 // 'Gemini 3 Flash', 'GPT Image 2'
  isAvailable(): boolean;        // env/key present
  // aspect is the pipeline's existing '1:1' | '16:9' | '9:16' vocabulary;
  // each backend maps it to its own size/quality params internally.
  generate(prompt: string, opts: { aspect: AspectRatio; quality?: 'standard'|'high'; referenceImage?: Buffer }): Promise<Buffer>;
}
```

- `geminiNanoBananaBackend` wraps the existing `generateNanoBananaImage` (now exported).
- `gptImage2Backend` POSTs to `/v1/images/generations`, maps aspect→size (`1:1`→`1024x1024`/`2048x2048`, `16:9`→`1792x1024`, `9:16`→`1024x1792`), decodes `b64_json`→Buffer, with the same retry/backoff Nano-Banana already uses.
- A registry `IMAGE_BACKENDS: ImageBackend[]` + `getActiveImageBackends()` that reads config (which models are enabled) and filters to `isAvailable()`.

**Single-model flow is preserved:** if config lists only Gemini, everything behaves exactly as today.

### 4.2 Multi-model generation helper
```ts
generateVariants(prompt, opts, backends): Promise<Array<{ generator: GeneratorService; buffer: Buffer }>>
```
Sequential (respects gpt-image-2's 5/min limit) with per-backend error isolation — if one model fails, the others still produce a variant, and the failure is surfaced as a job warning (same `errors[]` pattern the orchestrator already uses).

### 4.3 Variant grouping (data model)
Add to `AssetRecordSchema` (both optional ⇒ backward compatible):
```ts
variantGroupId: z.string().optional(),   // shared by all model-versions of one logical item
// generator already exists and distinguishes the members
```
**assetId convention:** `${groupId}__${generator}` (e.g. `flyer_001__gemini3_flash`, `flyer_001__gpt_image_2`). `fileName` carries the same suffix so R2 paths never collide. All variants live in the **same section array** (`images.flyerImages`).

### 4.4 Model-version selection (which variant is canonical)
Add to the manifest (Phase-3-style, optional):
```ts
modelVersionSelections: z.record(z.string(), z.string()).optional()  // variantGroupId -> generator
```
- Default canonical = the **primary** backend (config order) when no selection saved.
- The **source-LLM toggle** writes `modelVersionSelections[groupId] = generator`.
- **Pool/eligibility consumers consult this at read-time** (no re-stamping on toggle): when enumerating a section's selectable/eligible assets, collapse each `variantGroupId` to its selected member. For flyers this is trivial because they only surface through `imageSelections` + the picker; we make `collectSelectableImageAssets` show the selected variant per group (with the others reachable via the toggle).

### 4.5 UI — per-item source-LLM toggle
- **Review panel** groups a section's entries by `variantGroupId` → one `ReviewAssetCard` per group.
- The card gains a compact **segmented toggle** of the group's available generators (`Gemini | GPT Image 2 | …`). Selecting one: (a) swaps the previewed image, (b) PATCHes `modelVersionSelections`. Single-member groups render no toggle (single-model unchanged).
- Same toggle concept can later appear on the canva-templates `ImageSlotPicker` so you compare models *in situ* on an ad.

### 4.6 Config surface
Extend the flyer controls (or a new media-config field) with an **active image models** list, e.g. `manifest.flyerControls.models?: GeneratorService[]` or a global `AD_IMAGE_MODELS=gemini3_flash,gpt_image_2`. Per-section opt-in keeps cost controlled (only flyers go multi-model at first).

---

## 5. Why flyers first (blast-radius analysis)

| Consumer | Risk if variants double | Flyer-specific |
|---|---|---|
| Curation pools (`applyCurationContract`) | Could double-count | Flyers carry `source.flyer`, not in grounded pools → **no impact** |
| Ad `resolveSlotImages` auto-pick | Could pick a non-selected variant | Flyers never auto-fill; only via `imageSelections` → **no impact** |
| Distribution | — | Flyers not auto-distributed → **no impact** |
| `collectSelectableImageAssets` (picker) | Shows both variants | We collapse to selected variant per group → **the one change needed** |

So the flyer pilot needs: backend registry + `gptImage2Backend`, variant grouping, `modelVersionSelections`, the picker/review collapse, and the toggle UI. **No changes to curation/distribution.**

---

## 6. File-by-file plan (phased)

### Phase A — Backend layer (no behavior change)
- `lib/campaigns/media/generators/stability-generator.ts` — already exports `generateNanoBananaImage`.
- **NEW** `lib/campaigns/media/generators/gpt-image.ts` — `generateGptImage2(prompt, { aspect, quality })`.
- **NEW** `lib/campaigns/media/generators/image-backends.ts` — registry, `getActiveImageBackends()`, `generateVariants()`.
- `lib/campaigns/media/media-pipeline-config.ts` — `GPT_IMAGE_2_CONFIG`, aspect→size maps, active-models resolver.
- `lib/campaigns/schema.ts` — add `gpt_image_2` to `GeneratorServiceEnum`.

### Phase B — Variant data model
- `lib/campaigns/schema.ts` — `AssetRecord.variantGroupId?`; manifest `modelVersionSelections?`.
- `lib/campaigns/media/media-store.ts` — `updateManifestModelVersionSelections()`; include in `createEmptyManifest`/`finalizeManifest`.
- **NEW** `app/api/groups/campaign/[slug]/media/model-version/route.ts` — PATCH `{ groupId, generator }`.

### Phase C — Flyer pilot (generation)
- `lib/campaigns/media/generators/flyer-generator.ts` — `generateFlyerImages` emits one `GeneratedImage` per (axis × active backend), with `variantGroupId = flyer_<axis#>` and `generator`-suffixed ids.
- `lib/campaigns/media/media-orchestrator.ts` — flyer block stamps `variantGroupId`/`generator` per variant (uses `generateVariants`).

### Phase D — Selection-aware reads
- `lib/ads/html-templates/core.ts` — `collectSelectableImageAssets` / flyer enumeration collapse each `variantGroupId` to its `modelVersionSelections` member (fallback: primary).

### Phase E — UI
- `app/(tests)/tests/media-generation/media-review-panel.tsx` — group entries by `variantGroupId`.
- `app/(tests)/tests/media-generation/review-asset-card.tsx` — segmented **source-LLM toggle**; PATCH on change.
- (later) `ImageSlotPicker` on canva-templates — same toggle for in-ad comparison.

### Phase F — Extend beyond flyers (future)
- Make curation pool-builders + `resolveSlotImages` variant-aware (collapse to selected member), then enable multi-model for heroes/scenes/concepts behind the per-section models config.

---

## 7. Cost, rate limits, failure modes

- **Cost:** N models ⇒ ~N× image spend. Flyer run today = 6 renditions; with Gemini+gpt-image-2 = 12 images (~$0.5–$2 extra/run at gpt-image-2 rates). Gate via per-section model list; keep `AD_FLYER_COUNT` honored.
- **Rate limit:** gpt-image-2 Tier-1 = 5/min. Generate **sequentially** with the existing retry/backoff; 6 flyers ≈ within limits. Cross-section parallelism must not fan out gpt-image-2 calls concurrently in the pilot.
- **Partial failure:** per-backend isolation — a model failing yields fewer variants for that group, never a hard failure; surfaced as a job warning. The group still has the surviving variant(s).
- **Aspect/size mismatch:** gpt-image-2 has no native '2K 1:1' equal to Nano-Banana; use `2048x2048` for parity on square flyers (slightly higher cost) or `1024x1024` for economy — make it a config knob.

---

## 8. Open questions to confirm before/at build

1. **Exact gpt-image-2 params** (quality enum, `response_format` support, max `n`) against the official API with a live key.
2. **Square resolution** for flyers: `1024` vs `2048` (cost vs fidelity).
3. **Where the "active models" config lives**: global env, per-section, or per-campaign (`flyerControls.models`). Recommend per-campaign on `flyerControls` for parity with the controls UX.
4. **Default canonical** when no selection: primary backend by config order (recommended) vs. always Gemini.

---

## 9. Recommended sequencing

1. **Phase A+B** (backend registry + `gptImage2Backend` + variant schema) — invisible, fully tested against a single live gpt-image-2 call.
2. **Phase C+D+E for flyers** — the user-visible pilot: generate dual-model flyers, toggle in the review card, selected variant flows through the Phase-3 picker.
3. **Iterate** on quality/cost knobs with real outputs.
4. **Phase F** — generalize to other sections once pool consumers are variant-aware.

> First concrete step after approval: Phase A — add `gpt_image_2` to the enum, build `gpt-image.ts` + the backend registry, and smoke-test one real gpt-image-2 generation to lock the exact request params.
