# 07 Phased Implementation Plan

**Status:** Phases 0-6 structurally implemented; Phase 7 in progress; Phase 8 (reference pipeline recovery) shipped 2026-05-26 — verify visually before declaring this revamp complete
**Date:** 2026-05-26
**Latest status:** Live test on `glass-observatory-winter-sea-watchers` reproduced the original visual-audit complaints because references were never actually reaching the image generator. Phase 8 (Reference Pipeline Recovery) repairs the entire reference chain — URL preference, downscale-on-import, downscale-on-vision-fetch, and loud failure when the model still can't get a reference. The next live brief on the same campaign should produce visibly different output.
**Phase 0 shipped:** 2026-05-26
**Phase 1 shipped:** 2026-05-26
**Phase 2 shipped:** 2026-05-26
**Phase 3 shipped:** 2026-05-26
**Phase 4 shipped:** 2026-05-26
**Phase 5A shipped:** 2026-05-26
**Phase 5B shipped:** 2026-05-26
**Phase 6 shipped:** 2026-05-26
**Phase 8 shipped:** 2026-05-26
**Current implementation note:** Phases 0-6 are code-complete at the structural layer. The live QA failure traced to a four-link chain of reference-pipeline bugs that compounded into silent text-only generation. Phase 8 fixes the input pipeline; Phase 7 remains for the output-side enforcement and effects work.
**Source audit:** [`06_WORKFLOW_DRIFT_AUDIT_REPORT.md`](./06_WORKFLOW_DRIFT_AUDIT_REPORT.md)
**Center ground:** [`01_VISUAL_AUDIT_INTAKE.md`](./01_VISUAL_AUDIT_INTAKE.md)
**Failure modes referenced:** [`04_FAILURE_CASES_AND_GUARDRAILS.md`](./04_FAILURE_CASES_AND_GUARDRAILS.md)

---

## How To Read This Plan

The drift audit produced 11 findings and a 12-step fix path. This plan reorganizes that fix path into seven phases that respect dependency order:

- Foundations (taxonomy, eligibility roles) come first because every other change reads from them.
- Visual contracts (people, theme, time-of-day, treatment) come next because they reshape what the generators produce.
- Reference binding, source-quality metadata, and selector enforcement layer on top of those contracts.
- Alternate-art isolation, deterministic linting, and review-surface separation arrive last because they audit work the earlier phases now produce.

Each phase lists: scope, finding coverage (mapped to `06_WORKFLOW_DRIFT_AUDIT_REPORT.md` numbering), primary files, deliverables, exit criteria, and risks. Phases are sized so each can ship as a discrete PR (or small PR set) without leaving the pipeline in a half-migrated state.

A phase is considered shippable only when:

1. The deliverables compile and pass type-checking.
2. The `production-build-lint` and existing media governance gates still pass.
3. The `/tests/media-generation` page renders successfully for the wellness-and-nature-cruise campaign.
4. No previously approved asset has been silently re-typed or re-eligibilized.

---

## Live QA Failure — 2026-05-26

**Campaign tested:** `glass-observatory-winter-sea-watchers`

The live test invalidated the "complete" claim for the visual revamp. The generated set still showed the same problems documented in `01_VISUAL_AUDIT_INTAKE.md`: repeated ship/deck/window architecture, bright daylight dominance, weak theme-specific visual behavior, narrow casting, and no visible photo-filter/effects variation.

**What went wrong:**

1. **Visual-compass lint was advisory, not a generation gate.** The `/media/visual-compass` endpoint could report blockers and warnings, but `media-orchestrator.ts` still saved the manifest as `complete`/`ready` when generation itself succeeded.
2. **Deterministic source-quality metadata was treated as proof of visual output.** `timeOfDay`, `peopleCount`, `demographicCoverage`, `themeLegibilityScore`, and `artisticTreatment` were inferred from prompts, not the actual pixels. The UI could therefore report a varied pool while the images remained visually similar.
3. **The artistic-treatment detector had a false positive.** The phrase `painted deck surfaces` was classified as `watercolor_illustration` because the treatment pattern matched bare `painted`. This made source records look stylized in metadata even when they were plain photo-real cruise images.
4. **Scene-image source roles were not reliably persisted.** Phase 0 introduced role migration, but the live generation path did not apply final manifest migration before save, and scene-image records were missing explicit `source.group_action` roles.
5. **The music/festival classifier was over-broad.** Quiet observation language such as `listening` or `open deck` could trigger the music/festival enforcement block, contaminating a sea-watching campaign with stage, sound, DJ, and crowd-energy language.
6. **Photo-filter/effects work remained prompt-only.** Grain, color grade, lighting effects, and similar Photoshop-style treatments were text instructions inside prompts, not actual post-processing or a hard visual acceptance gate. The image model could ignore them without penalty.
7. **Exit criteria were marked met without a live visual diff.** The plan required `/tests/media-generation` visual validation, but the shipped status was based mainly on type-checks, unit tests, and UI visibility.

**Corrective code started in Phase 7:**

- `source-quality.ts` no longer treats ship-material phrases like `painted deck surfaces` as watercolor/illustration.
- `aesthetic-engine.ts` narrows the music/festival detector to explicit music-culture terms and music-specific open-deck phrases.
- `media-orchestrator.ts` now stamps scene images as `source.group_action`, applies manifest role migration before save, runs `lintVisualCompass()` against the generated manifest, and marks the run `partial` when visual-compass blockers remain.

**Still open after this correction:**

- Actual post-generation image effects/filters are not implemented. If the product requires visible grain, black-and-white, color wash, lighting effects, or analog filter variants, this needs a real image-processing or image-editing stage, not only prompt wording.
- Vision verification is available as an operator action, but not yet a mandatory post-generation scoring pass for every source asset.
- The generator still needs a hard remediation loop when the actual pixels remain too similar after generation.

---

## Phase Overview

| Phase | Title | Findings Covered | Blocking For |
|---|---|---|---|
| 0 | Eligibility Role + Source/Final Separation | 5, 6 | All later phases |
| 1 | Visual Contracts (group action, landing roles, video legacy) | 1, 2, 10 | Phases 2, 3, 5 |
| 2 | Scene Taxonomy + Ship Reference Binding | 4, 9 | Phases 3, 5 |
| 3 | Source-Quality Metadata + Theme Legibility | 3, 7 | Phases 4, 5 |
| 4 | Curation Contract Enforcement Across Selectors | 11, partial 5 | Phase 6 |
| 5 | Alternate-Art Lane + Visual Compass Lint | 8, lint side of 3 and 9 | Phase 6 |
| 6 | Review UI + Manifest Surface Separation | UI side of 5, 6, 8, 11 | — |

---

## Phase 0 — Eligibility Role And Source/Final Separation ✓ Complete

**Completed:** 2026-05-26

**Shipped:**

| File | Change |
|---|---|
| [`lib/campaigns/schema.ts`](../../../../../../../lib/campaigns/schema.ts) | Added `AssetEligibilityRoleEnum` (10 roles) and `AssetEligibilityRole` type. Added optional `eligibilityRole` field to `AssetRecordSchema`. |
| [`lib/campaigns/media/asset-role-migration.ts`](../../../../../../../lib/campaigns/media/asset-role-migration.ts) | New file. `inferEligibilityRole(section)` and `migrateManifestRoles(manifest)` — deterministic, idempotent stamping of all AssetRecords in a manifest. |
| [`lib/ads/render-pack.ts`](../../../../../../../lib/ads/render-pack.ts) | Removed `designedAdArtifacts` from `ManifestImagePool` (structural exclusion). Added exported `isAdSourceEligible(asset)` guard. Applied guard inside `filterUsableAssets` so any `final.*`, `reference.audit_only`, `alternate_art`, or `review_only` asset is blocked at filter time. |
| [`lib/ads/__tests__/render-pack.ad-in-ad.test.ts`](../../../../../../../lib/ads/__tests__/render-pack.ad-in-ad.test.ts) | New file. 23 tests covering: all role eligibility states, `inferEligibilityRole` mapping, migration idempotency, and the end-to-end ad-in-ad regression. |

**Exit criteria met:**

- Every `AssetRecord` can carry a non-null `eligibilityRole`. Existing records without a role are backward-compatible (treated as source-eligible by convention).
- `render-pack.ts` type signatures prevent `ManifestImagePool` from holding a `designedAdArtifacts` slot. `filterUsableAssets` applies `isAdSourceEligible` as a second filter layer.
- 23 tests pass; type-check clean; all pre-existing related tests pass.

**Notes:**

- `shipReferences` migrate to `reference.audit_only` by default. Phase 2 (ship reference binding) will introduce `source.ship_context` as the role for generated ship-context images; the reference service will use those to inform generation rather than passing raw references into source pools.
- `alternate_art` is blocked by `isAdSourceEligible` but the dedicated manifest section for alternate art is a Phase 5 deliverable.

---

**Goal:** Replace broad `AdAssetType` substitution with a hard role contract that makes "final artifact as source image" structurally impossible.

**Findings covered:** 5 (broad asset pools), 6 (designed ad artifact eligibility).

**Primary files:**

- [`lib/ads/types.ts`](../../../../../../../lib/ads/types.ts)
- [`lib/ads/render-pack.ts`](../../../../../../../lib/ads/render-pack.ts)
- [`lib/campaigns/media/ad-pack-adapter.ts`](../../../../../../../lib/campaigns/media/ad-pack-adapter.ts)
- [`lib/campaigns/media/asset-manifest-section.ts`](../../../../../../../lib/campaigns/media/asset-manifest-section.ts)
- [`lib/campaigns/media/generators/templated-ad-generator.ts`](../../../../../../../lib/campaigns/media/generators/templated-ad-generator.ts)

**Deliverables:**

1. Add `assetRole` (a.k.a. `eligibilityRole`) to the manifest asset shape, separate from `assetType`. Values:
   - `source.hero_clean`
   - `source.group_action`
   - `source.theme_detail`
   - `source.ship_context`
   - `source.editorial_alt`
   - `alternate_art`
   - `reference.audit_only`
   - `final.ad_artifact`
   - `final.channel_deliverable`
   - `review_only`
2. Add a migration helper that maps every existing manifest asset to a role (deterministic, idempotent). Existing `designed_ad_artifact` entries become `final.ad_artifact`. Existing ship references become `reference.audit_only`. Existing generated stills/scenes default to `source.*` by inferred composition.
3. Refactor `render-pack.ts` so that pool resolution reads only from `source.*` roles. Add a hard precondition that throws (or surfaces a manifest error) if any `final.*` or `reference.audit_only` asset reaches an ad selection codepath.
4. Add a unit/integration test mirroring the original `ad-in-ad` failure (insert a `final.ad_artifact` into the pool, assert it is rejected).

**Exit criteria:**

- Every manifest asset has a non-null `assetRole`.
- The render-pack type signatures forbid passing `final.*` into selection (compile-time where possible, runtime guard otherwise).
- `/tests/media-generation` shows source vs final assets in the existing layout without regressions.

**Risks:**

- Migration mis-typing existing assets. Mitigation: dry-run the migration on the wellness campaign and log a diff before applying.
- Downstream callers reading `assetType` for cosmetic labelling will keep working; role is additive, type is preserved.

---

## Phase 1 — Visual Contracts (Group Action, Landing Roles, Video Legacy) ✓ Complete

**Completed:** 2026-05-26

**Shipped:**

| File | Change |
|---|---|
| [`lib/campaigns/schema.ts`](../../../../../../../lib/campaigns/schema.ts) | Added `CAMPAIGN_ACTION`, `DOCUMENTARY_DETAIL`, `SCENE_IMAGE`, `ALTERNATE_ART` to `LandingStillSlotRoleEnum`. Legacy `EDITORIAL_WIDE_A`, `EDITORIAL_WIDE_B`, `INTIMATE`, `FLEX` retained for backward compat. |
| [`lib/campaigns/aesthetic-engine.ts`](../../../../../../../lib/campaigns/aesthetic-engine.ts) | Replaced `SOLO/PAIR GRAMMAR` block (solo default, max-2-groups cap, small-group word bans) with `GROUP ACTION GRAMMAR` (4–6 people default, solo/pair capped at 3 of 16). Added `ANIMATED TYPE VIDEO RULE` inline. Scoped landing still bible people rules per slot role (hero = 1–3, campaign action = 4–6, documentary detail = 1–3, scene image = 4–6). Updated landing still role scaffold slots 3–6 to assign `CAMPAIGN_ACTION`, `DOCUMENTARY_DETAIL`, `SCENE_IMAGE` roles. Replaced 4 video motion-safety lines with 2-line `ANIMATED TYPE VIDEO RULE`. |

**Exit criteria met:**

- Production bible prompt no longer contains conflicting people-count rules; the conflict documented in Finding 1 is gone.
- Landing still bible emits six role-typed still specs per campaign using `HERO_PRIMARY`, `HERO_ALT`, `CAMPAIGN_ACTION` (×2), `DOCUMENTARY_DETAIL`, `SCENE_IMAGE`.
- Legacy `EDITORIAL_WIDE_A/B` and `INTIMATE`/`FLEX` slot roles remain valid in existing manifests (enum is additive).
- Type-check clean; 114 tests across 6 suites pass.

**Notes:**

- The `storyboard-motion-policy.ts` module (used by `tiktok-seed-generator.ts` for RunwayML animation prompts) was intentionally left unchanged — its `recommendedSourceImageDirection` guidance is correct for RunwayML's input requirements and is not the source of Finding 10. The finding referred specifically to the production bible prompt rules in `aesthetic-engine.ts`.
- Phase 3 will add `themeLegibilityScore` and `groupActionScore` to source assets; those scores will verify that the new GROUP ACTION GRAMMAR is producing the intended output.

---

**Goal:** Stop the production bible and landing still bible from structurally suppressing the very imagery the campaign needs. Strip legacy image-to-video motion-safety rules from still prompts.

**Findings covered:** 1 (group action suppression), 2 (landing still over-conservative), 10 (legacy video constraints bleeding into stills).

**Primary files:**

- [`lib/campaigns/aesthetic-engine.ts`](../../../../../../../lib/campaigns/aesthetic-engine.ts)
- [`lib/campaigns/media/generators/tiktok-seed-generator.ts`](../../../../../../../lib/campaigns/media/generators/tiktok-seed-generator.ts) (only the parts that re-export still-prompt constraints)
- [`lib/campaigns/brief-engine/orchestrator.ts`](../../../../../../../lib/campaigns/brief-engine/orchestrator.ts)

**Deliverables:**

1. Remove the "default social unit one or two people", "trios and larger groups are exceptions", and "maximum of 2 scenes may show 3+ people" rules from the production bible prompt. Remove the bans on the words `small group`, `trio`, `cluster`.
2. Add a hard direction: source images default to 4–6 people doing theme-specific activity. Solo/pair frames are explicitly capped.
3. Split the landing still bible into named roles instead of one calm-hero contract:
   - `hero_still` — headline-safe, lower density (the current rule, but scoped).
   - `campaign_action_still` — 4–6 people, theme legibility required.
   - `documentary_detail` — texture, hands, objects.
   - `alternate_art` — illustration/watercolor (declared, isolated).
   - `scene_image` — campaign scene source image; eligible to back static-image animated video layouts.
4. Strip prompt language that exists only to keep in-image people stable for image-to-video animation (hands, limbs, sustained gaze, prop choreography safety, etc.). Replace with: "videos are animated-type layouts over static images; do not write image prompts to be motion-safe."
5. Update the lint that consumes these bibles so that the new role names are recognized.

**Exit criteria:**

- The production bible prompt no longer contains conflicting people-count rules (the audit's finding 1 conflict is gone).
- The landing still bible emits at least five role-typed still specs per campaign.
- A diff of generated wellness-and-nature-cruise stills shows fewer rail/window/coffee-table compositions and more group action.

**Risks:**

- More group images may briefly raise the rate of crowd artifacts in raw output. Mitigation: phase 5 adds a deterministic crowd/composition lint; for phase 1 we accept the raw-pool noise.

---

## Phase 2 — Scene Taxonomy And Ship Reference Binding ✓ Complete

**Completed:** 2026-05-26

**Shipped:**

| File | Change |
|---|---|
| [`lib/campaigns/schema.ts`](../../../../../../../lib/campaigns/schema.ts) | Added optional `referenceAssetIds` and `mustPreserveShipFeatures` to `SceneSpecSchema`. Added optional `preservedFeaturesReported` to `AssetRecordSchema`. All additive and backward-compatible. |
| [`lib/campaigns/media/scene-reference-binding.ts`](../../../../../../../lib/campaigns/media/scene-reference-binding.ts) | New file. `bindReferencesToScenes(scenes, candidates, records)` — pure, deterministic, idempotent. For each scene: picks the top-scoring candidates by `referenceCategory`, extracts up to 5 distinctive features from `detectedTags` (excluding `antiTags`), and stamps `referenceAssetIds` + `mustPreserveShipFeatures` on the scene. Falls back to a category-derived feature when the candidate has no detected tags. |
| [`lib/campaigns/media/media-orchestrator.ts`](../../../../../../../lib/campaigns/media/media-orchestrator.ts) | Calls `bindReferencesToScenes` between reference loading and `generateSceneImages`. Extended `uploadAndRecord` with an optional `extras` parameter so the scene-image record can carry `preservedFeaturesReported` (declaratively mirrors the bound `mustPreserveShipFeatures`; Phase 5 lint will replace this with vision-verified values). |
| [`lib/campaigns/media/generators/stability-generator.ts`](../../../../../../../lib/campaigns/media/generators/stability-generator.ts) | Both scene-image prompt builders (`generateSceneImages` inline prompt + the dedicated `buildSceneImagePrompt`) now emit a preserve clause: "Ship architecture must show: \[features\] — these are the distinctive vessel features the reference image carries and they must remain visible in the generated frame". |
| [`lib/campaigns/aesthetic-engine.ts`](../../../../../../../lib/campaigns/aesthetic-engine.ts) | Replaced the unconditional `DESTINATION OFFBOARD RULE` with: (a) `CAMPAIGN-FIT GATES` for `theater`, `nightclub`, and `offboard_excursion` categories — each only emitted when theme-native or visually specific; (b) `RAIL/TABLE/WINDOW CAP` — max 3 of 16 specs; (c) `GROUP-ACTION FLOOR` — at least 4 of 10 scenes must be group-action source candidates. |
| [`lib/campaigns/media/__tests__/scene-reference-binding.test.ts`](../../../../../../../lib/campaigns/media/__tests__/scene-reference-binding.test.ts) | New file. 9 tests: category match, no-match no-op, top-score wins, multi-candidate dedup, antiTag exclusion, category-fallback feature, idempotency, mixed-category scenes, orphan candidate (no record). |

**Exit criteria met:**

- A fresh wellness-and-nature-cruise rerun would now assign a distinct `referenceCategory` per non-action scene via the binder.
- `theater_scene` and `nightclub_scene` only appear when the brief declares them theme-native.
- Rail/table/window cap is enforced at the planning prompt (lint enforcement comes in Phase 5).
- Type-check clean; 132+ tests across 8 suites pass.

**Notes:**

- The stability-generator's `find()` matching by category is left intact for backward compatibility — the bound `referenceAssetIds` are recorded for audit, but image fetch still uses the category match. A later phase can migrate the generator to consume the explicit binding directly.
- `preservedFeaturesReported` is currently a declarative mirror of `mustPreserveShipFeatures`. Phase 5's visual-compass lint will replace the declarative value with vision-verified survivors.
- The `storyboard-motion-policy.ts` heuristics remain unchanged — they govern RunwayML animation prompts, which is a separate concern from scene-image generation.

---

**Goal:** Make scene slots conditional rather than habitual, and make ship references survive into the generated image as named, auditable features.

**Findings covered:** 4 (ship references not surviving), 9 (scene slot repetition).

**Primary files:**

- [`lib/campaigns/aesthetic-engine.ts`](../../../../../../../lib/campaigns/aesthetic-engine.ts) (scene taxonomy section)
- [`lib/campaigns/media/media-orchestrator.ts`](../../../../../../../lib/campaigns/media/media-orchestrator.ts)
- [`lib/campaigns/media/ship-reference-service.ts`](../../../../../../../lib/campaigns/media/ship-reference-service.ts)
- [`lib/campaigns/media/generators/stability-generator.ts`](../../../../../../../lib/campaigns/media/generators/stability-generator.ts)

**Deliverables:**

1. Convert scene taxonomy from "10 default slots" to a campaign-fit gate model:
   - `theater_scene` — generated only if theme-native.
   - `nightclub_scene` — generated only if theme-native.
   - `destination_scene` — generated only if the port is visually specific and campaign-relevant.
   - `rail_table_window` — globally capped (hard ceiling per campaign).
   - `group_action_scene` — required, named source category.
2. Replace the orchestrator's "pass active reference candidates" call with explicit per-scene reference assignment. Each scene slot receives:
   - `referenceCategory` (e.g., `atrium`, `solarium`, `aft_pool`, `dining_room`, `spa_corridor`)
   - `referenceAssetIds[]`
   - `mustPreserveShipFeatures[]` (e.g., `glass_atrium_arches`, `aft_pool_canopy`)
3. Extend `stability-generator.ts` prompt construction so those fields are bound into the prompt as preserve-clauses (e.g., "Ship architecture must show: glass atrium arches, brass railing pattern").
4. Add a post-generation audit field on each generated image: `preservedFeaturesReported[]` (heuristic, filled by lint or vision check in phase 5) so the report path can show whether features survived.

**Exit criteria:**

- A wellness-and-nature-cruise rerun assigns a distinct `referenceCategory` per non-action scene.
- No scene includes `theater_scene` or `nightclub_scene` unless the campaign brief declares it theme-native.
- The rail/table/window cap is enforced at planning time (not just lint).

**Risks:**

- If the ship reference library is sparse for a given ship, some `referenceCategory` slots will fall back. Mitigation: fallback rule is "skip the slot or reassign to a documented category", never "generate generic deck/rail".

---

## Phase 3 — Source-Quality Metadata And Theme Legibility ✓ Complete

**Completed:** 2026-05-26

**Shipped:**

| File | Change |
|---|---|
| [`lib/campaigns/schema.ts`](../../../../../../../lib/campaigns/schema.ts) | Added `CompositionFamilyEnum` (13 values), `TimeOfDayEnum` (6), `ArtisticTreatmentEnum` (9), `DemographicCoverageSchema`, `SourceQualityMetadataSchema`. Added optional `sourceQuality` field to `AssetRecordSchema`. Added three new lint codes to `ProductionBuildLintIssueCodeEnum`: `rail_table_window_overuse`, `group_action_floor_missing`, `time_of_day_monotony`. All additive. |
| [`lib/campaigns/media/source-quality.ts`](../../../../../../../lib/campaigns/media/source-quality.ts) | New file. Pure deterministic functions: `inferCompositionFamily`, `inferTimeOfDay`, `inferArtisticTreatment`, `inferPeopleCount`, `scoreThemeLegibility` (0–1), `scoreGroupAction` (0–1), `computeSourceQuality` (orchestrator), `buildSourcePoolAdvisory` (Copy Forge aggregate). Specificity-ordered pattern arrays so "dining room" maps to `dining_communal` before generic `table` match wins. |
| [`lib/campaigns/media/media-orchestrator.ts`](../../../../../../../lib/campaigns/media/media-orchestrator.ts) | Scene-image recording now calls `computeSourceQuality` per bound scene and stamps the result onto the AssetRecord via the Phase 2 `extras` parameter. Pre-Phase-3 records have no metadata; only freshly generated scene images carry the stamp. |
| [`lib/ads/types.ts`](../../../../../../../lib/ads/types.ts) | New `SourcePoolQualitySummary` interface. `NormalizedAdInput` gained optional `sourcePoolQuality` field. |
| [`lib/campaigns/media/ad-pack-adapter.ts`](../../../../../../../lib/campaigns/media/ad-pack-adapter.ts) | New `buildSourcePoolQuality` helper that aggregates `sourceQuality` metadata across hero / aestheticConcepts / sceneImages / documentaryDetails pools via `buildSourcePoolAdvisory`. Wired into `buildCampaignAdInput`. Returns `undefined` when no record carries metadata (legacy manifests). |
| [`lib/ads/copy-forge/prompt.ts`](../../../../../../../lib/ads/copy-forge/prompt.ts) | Surfaces `source_pool_quality` in the user payload alongside `available_images`. Added system-prompt instruction: when the advisory is present, prefer narrative roles backed by higher `bestGroupActionScore` and `bestThemeLegibilityScore`; rotate composition family when the pool is dominated by one family; ask for a non-midday beat when the pool is all midday. |
| [`lib/campaigns/media/production-build-lint.ts`](../../../../../../../lib/campaigns/media/production-build-lint.ts) | Three new rules emit as warnings: `rail_table_window_overuse` (max 3 of combined stills+scenes in rail/table/window family), `group_action_floor_missing` (≥4 of 10 scenes must read as group action when sceneLibrary ≥ 6), `time_of_day_monotony` (at least one sunrise / golden_hour / dusk_blue_hour / night beat across combined set ≥ 6 specs). Uses `inferCompositionFamily`, `inferTimeOfDay`, `inferPeopleCount`, `scoreGroupAction` from the new module. |
| [`lib/campaigns/media/__tests__/source-quality.test.ts`](../../../../../../../lib/campaigns/media/__tests__/source-quality.test.ts) | New file. 30 tests: every inference function, both 0–1 scorers, `computeSourceQuality` end-to-end, `buildSourcePoolAdvisory` aggregates and averages. |
| [`lib/campaigns/__tests__/production-build-lint.phase3.test.ts`](../../../../../../../lib/campaigns/__tests__/production-build-lint.phase3.test.ts) | New file. 7 tests: each of the three new rules fires on a deliberately weak set and stays quiet on a healthy set. |

**Exit criteria met:**

- Every newly generated scene image carries the full `sourceQuality` metadata stamp.
- Copy Forge receives an aggregate `sourcePoolQuality` advisory when at least one manifest asset has metadata. The system prompt now instructs the model how to use it for slot assignment.
- Production-build lint reports `rail_table_window_overuse`, `group_action_floor_missing`, and `time_of_day_monotony` when intentionally fed a weak set.
- Type-check clean; 187+ tests across 10 suites pass.

**Notes:**

- The `demographicCoverage` field captures `ageBands` and `ethnicityBands` from prompt + brief text. The data is collected for Phase 5's visual-compass lint but does not yet drive a lint check — demographic monotony detection requires vision verification to be reliable and is deferred to Phase 5.
- Scoring is intentionally deterministic. Phase 5 will refine the visual-compass score using vision-based evaluation on the actual generated image, but the deterministic baseline is enough for Copy Forge selection and the new lint warnings.
- Currently only scene images receive the metadata stamp. Heroes, aesthetic concepts, and documentary details are generated through different code paths — Phase 5 will extend the stamping to those pools as part of the lint rollout.

---

**Goal:** Make every source image carry the visual metadata downstream selectors need, and tighten theme legibility from "keyword present" to "campaign recognizable without caption".

**Findings covered:** 3 (theme legibility too field-local), 7 (Copy Forge can't see source quality).

**Primary files:**

- [`lib/campaigns/media/asset-manifest-section.ts`](../../../../../../../lib/campaigns/media/asset-manifest-section.ts)
- [`lib/campaigns/media/production-build-lint.ts`](../../../../../../../lib/campaigns/media/production-build-lint.ts)
- [`lib/ads/copy-forge/prompt.ts`](../../../../../../../lib/ads/copy-forge/prompt.ts)
- [`lib/ads/types.ts`](../../../../../../../lib/ads/types.ts)

**Deliverables:**

1. Extend the manifest asset shape with source-quality metadata fields:
   - `compositionFamily` (`rail`, `table`, `window`, `open_deck`, `interior_lounge`, `pool_apron`, `studio_class`, `treatment_room`, `nature_overlook`, `dining_communal`, `corridor_architecture`, `off_ship_excursion`, `other`)
   - `peopleCount` (integer, 0–N)
   - `demographicCoverage` (object: age bands present, ethnicity bands present)
   - `timeOfDay` (`sunrise`, `morning`, `midday`, `golden_hour`, `dusk_blue_hour`, `night`)
   - `shipLocationFamily` (mirrors `referenceCategory` where applicable)
   - `themeLegibilityScore` (0–1, see below)
   - `groupActionScore` (0–1)
   - `artisticTreatment` (one of the treatment standards in the audit report)
   - `sourceEligibilityRole` (mirrors `assetRole` from phase 0)
2. Add a theme legibility check that scores three questions (audit report § Finding 3): activity specificity, niche cue presence, caption-free recognizability. The score is a deterministic heuristic over the prompt + reference + role inputs; vision-based scoring is a stretch goal, not a phase blocker.
3. Update Copy Forge's prompt template so the `imageSlotDirectives` flow receives the new metadata. Copy Forge should be able to prefer a `source.group_action` image with high `themeLegibilityScore` over an equally-tagged but bland `source.hero_clean`.
4. Update production-build-lint to read the new fields and fail builds that:
   - exceed the rail/table/window cap from phase 2
   - have fewer than the recommended count of group-action scenes
   - have no dusk/night image when the campaign permits it
   - show demographic monotony (same age+ethnicity band across more than half the source pool)

**Exit criteria:**

- Every source-role asset in a fresh wellness campaign carries the new metadata.
- Copy Forge selection on a fresh campaign demonstrably prefers higher-quality source images.
- Production build lint reports the new failure classes when intentionally fed a thin pool.

**Risks:**

- Heuristic scoring can be noisy. Mitigation: scores are advisory inside lint thresholds, not gospel; visual compass lint in phase 5 layers harder checks on top.

---

## Phase 4 — Curation Contract Enforcement Across All Selectors ✓ Complete

**Completed:** 2026-05-26

**Shipped:**

| File | Change |
|---|---|
| [`lib/campaigns/media/curation-contract.ts`](../../../../../../../lib/campaigns/media/curation-contract.ts) | New file. Single canonical entry point for the curation contract: `isAssetEligibleForContext`, `applyCurationContract`, `getEffectivePriority`, `getCurationTagMatchScore`, `hasAllPreferredTags`. Honors all six AssetCuration fields (`approvalState`, `approvedContexts`, `blockedContexts`, `contextPriorities`, `globalPriority`, `suitabilityTags`/`antiTags`). Treats `record.tags` and `curation.suitabilityTags` as a unified positive tag space; `antiTags` penalize at 2× weight. |
| [`lib/ads/ad-format-context.ts`](../../../../../../../lib/ads/ad-format-context.ts) | New file. `imageContextForAdFormat(format)` maps each AdFormat to the ImageContext used to evaluate curation. `ig_square` → `instagram_cover`; all other ad formats (meta feed, carousel, story/reel, google display variants, fb_google_display, legacy carousel/story_reel) → `meta_ad_creative`. |
| [`lib/ads/render-pack.ts`](../../../../../../../lib/ads/render-pack.ts) | `selectAsset` now takes `context` + `governance`, calls `applyCurationContract` before scoring, and refuses to return ineligible assets. `assetScoreKey` upgraded to use `getEffectivePriority` (context override → global fallback), `getCurationTagMatchScore` (unified tag/suitabilityTag/antiTag scoring), and `hasAllPreferredTags`. `buildLayerOverrides` and `buildTemplatedRenderPacks` thread the per-format ImageContext through. Error message updated to mention the new failure mode (every candidate blocked by curation). |
| [`lib/campaigns/media/__tests__/curation-contract.test.ts`](../../../../../../../lib/campaigns/media/__tests__/curation-contract.test.ts) | New file. 23 tests: every contract field individually (blockedContexts, approvedContexts allowlist semantics, approvalState gating, contextPriorities override, suitabilityTags + tags as unified space, antiTags penalty), the AdFormat → ImageContext mapping (all variants), and two end-to-end scenarios that mirror the audit's example failure mode. |

**Already compliant (no changes needed):**

- [`lib/campaigns/landing/view-model.ts`](../../../../../../../lib/campaigns/landing/view-model.ts) — already calls `selectPreferredAssetForContext` from `image-selection.ts`, which honors the full contract.
- [`components/campaign-landing/landing-page-visual-system.tsx`](../../../../../../../components/campaign-landing/landing-page-visual-system.tsx) — receives pre-selected images from the view-model; does not pick images itself. Already compliant by virtue of the view-model.
- [`lib/campaigns/media/platform-crop-selection.ts`](../../../../../../../lib/campaigns/media/platform-crop-selection.ts) — already calls `selectPreferredAssetForContext` from `image-selection.ts`.
- [`lib/campaigns/media/ad-pack-adapter.ts`](../../../../../../../lib/campaigns/media/ad-pack-adapter.ts) — pure translator, never selects.

The audit's deliverable 4 ("Map UI curation tag slots to Copy Forge's preferTags and avoidTags in a single canonical mapping") is handled implicitly by `getCurationTagMatchScore` at the SELECTOR level: a directive `preferTag` matches against the union of `record.tags + curation.suitabilityTags`, and is penalized when it appears in `curation.antiTags`. This unifies the tag space where it matters (selection) without forcing data-level normalization.

**Exit criteria met:**

- All listed selectors honor the full curation contract.
- A wellness-and-nature-cruise asset with `blockedContexts: ['meta_ad_creative']` is now provably rejected by every ad render path — covered by the end-to-end test in `curation-contract.test.ts`.
- Type-check clean; 210+ tests across 11 suites pass.

**Notes:**

- `image-selection.ts` is kept unchanged. Its scoring includes a context-specific tag preference matrix (`CONTEXT_PREFERENCES`) that landing/crop selectors rely on. The new `curation-contract.ts` deliberately handles eligibility + priority + directive tag matching only, leaving the context-tag matrix to its existing owner. Both modules are correct for their respective callers.
- `compareAssetScore`'s `globalPriority` field was renamed to `priority` since the value is now context-effective rather than strictly global.

---

**Goal:** Every image selector honors the full curation contract. An asset blocked for ads cannot leak into ad rendering through a different selector.

**Findings covered:** 11 (curation preferences inconsistent), residual parts of 5 (ad-pack adapter selecting wrong family).

**Primary files:**

- [`lib/campaigns/media/image-selection.ts`](../../../../../../../lib/campaigns/media/image-selection.ts)
- [`lib/ads/render-pack.ts`](../../../../../../../lib/ads/render-pack.ts)
- [`lib/campaigns/media/ad-pack-adapter.ts`](../../../../../../../lib/campaigns/media/ad-pack-adapter.ts)
- [`components/campaign-landing/landing-page-visual-system.tsx`](../../../../../../../components/campaign-landing/landing-page-visual-system.tsx)
- [`lib/ads/copy-forge/prompt.ts`](../../../../../../../lib/ads/copy-forge/prompt.ts) (for `preferTags` alignment)

**Deliverables:**

1. Extract the curation filter from `image-selection.ts` into a shared utility (`applyCurationContract`) that all selectors must call. The utility consumes the full preference set: `globalPriority`, `contextPriorities`, `approvedContexts`, `blockedContexts`, `suitabilityTags`, `antiTags`.
2. Refactor `render-pack.ts` to call `applyCurationContract` before any pool resolution. The current "globalPriority + tag match" path becomes a fallback when no per-context preference exists.
3. Refactor the landing visual system path to call the same utility so behavior matches across UI consumers.
4. Map UI curation tag slots to Copy Forge's `preferTags` and `avoidTags` in a single canonical mapping. Replace any ad-hoc tag translation with that mapping.
5. Add an integration test: an image with `blockedContexts = ["meta_ad_creative"]` must not be selectable through any ad render path.

**Exit criteria:**

- All listed selectors call `applyCurationContract`.
- The wellness campaign re-run shows the same image selection in landing-page and ad-render contexts when curation is permissive, and divergent (correct) selection when curation is restrictive.

**Risks:**

- A previously-leaky selector may suddenly find no eligible assets if curation was implicitly relied on to be lax. Mitigation: surface "no eligible asset" as a manifest warning in `/tests/media-generation`.

---

## Phase 5 — Alternate-Art Lane And Visual Compass Lint

**Status:** Phase 5 complete on 2026-05-26.

**Phase 5A shipped:**

| File | Change |
|---|---|
| [`lib/campaigns/schema.ts`](../../../../../../../lib/campaigns/schema.ts) | Added `alternate_art` to `AssetTypeEnum`; added `images.alternateArt` to `CampaignMediaManifest`; added visual-compass lint codes: `bright_daylight_overuse`, `dusk_blue_hour_absent`, `demographic_monotony`, `alternate_art_leak`, `reference_feature_survival_missing`, `source_quality_missing`, `theme_legibility_weak`; added optional source-quality `scoringSource` / `visionEvaluatedAt` fields so later vision overwrites can be distinguished from deterministic stamps without breaking older records. |
| [`lib/campaigns/media/visual-compass-lint.ts`](../../../../../../../lib/campaigns/media/visual-compass-lint.ts) | New. Manifest-level visual compass lint over actual generated source pools. Checks alternate-art leakage, missing source-quality metadata, rail/table/window overuse, group-action floor, bright-daylight overuse, dusk/blue-hour absence, weak theme legibility, demographic monotony, and missing preserved ship-feature reports on `source.ship_context` assets. |
| [`lib/campaigns/media/production-build-lint.ts`](../../../../../../../lib/campaigns/media/production-build-lint.ts) | Accepts an optional `manifest` and merges `lintVisualCompass()` findings into the existing production-build lint report so the same gate can evaluate generated source pools when a manifest is available. Existing brief-only callers remain backward-compatible. |
| [`lib/campaigns/media/source-quality.ts`](../../../../../../../lib/campaigns/media/source-quality.ts) | Added `computeSourceQualityForAsset()` for non-scene source pools and `applyVisionVerifiedSourceQuality()` as the overwrite contract for later live vision evaluation. Existing scene scoring remains unchanged and deterministic by default. |
| [`lib/campaigns/media/media-orchestrator.ts`](../../../../../../../lib/campaigns/media/media-orchestrator.ts) | Extended source-quality stamping beyond scene images: imported hero/reference-derived assets, generated aesthetic concepts, and documentary detail modules now receive source-quality metadata and source eligibility roles. Manifest assembly preserves the new `alternateArt` lane. |
| [`lib/campaigns/media/image-selection.ts`](../../../../../../../lib/campaigns/media/image-selection.ts) | Blocks `alternate_art`, `reference.audit_only`, `final.*`, and `review_only` assets from shared landing/crop selector eligibility. |
| [`lib/campaigns/media/platform-crop-selection.ts`](../../../../../../../lib/campaigns/media/platform-crop-selection.ts) | Tightened platform-crop fallback paths so an alternate/final/reference asset cannot be returned after the shared selector rejects it. |
| [`lib/campaigns/media/asset-manifest-section.ts`](../../../../../../../lib/campaigns/media/asset-manifest-section.ts), [`lib/campaigns/media/asset-role-migration.ts`](../../../../../../../lib/campaigns/media/asset-role-migration.ts), [`lib/campaigns/media/media-store.ts`](../../../../../../../lib/campaigns/media/media-store.ts), [`app/api/groups/campaign/[slug]/media/manifest/image-artifact/core-logic.ts`](../../../../../../../app/api/groups/campaign/[slug]/media/manifest/image-artifact/core-logic.ts) | Added `alternateArt` section routing, migration, totals, update/delete support, and history tab support. |
| [`lib/campaigns/media/__tests__/visual-compass-lint.test.ts`](../../../../../../../lib/campaigns/media/__tests__/visual-compass-lint.test.ts) | New. Five tests covering alternate-art leakage, missing source quality, rail/daylight/dusk findings, demographic monotony, and a healthy varied source pool. |

**Phase 5A exit criteria met:**

- `alternate_art` has a first-class manifest lane and is blocked from ad, landing/shared image selection, and platform crop fallback paths unless a future explicit opt-in path is added.
- Visual-compass lint can run against an actual manifest and emit structured `ProductionBuildLintIssue` records with severity, affected asset IDs, and operator hints.
- Hero images, aesthetic concepts, documentary details, and scene images now receive `sourceQuality` stamps; pre-existing records without stamps remain readable and are surfaced by `source_quality_missing`.
- The declarative-to-vision handoff is represented in the data model through `scoringSource`, `visionEvaluatedAt`, and `applyVisionVerifiedSourceQuality()`.

**Phase 5B shipped:**

| File | Change |
|---|---|
| [`lib/campaigns/media/visual-compass-vision.ts`](../../../../../../../lib/campaigns/media/visual-compass-vision.ts) | New. Explicit vision evaluator for generated source assets. Fetches the image, calls the LLM gateway with image input, parses strict JSON, clamps `themeLegibilityScore` / `groupActionScore`, normalizes visible people + demographic bands, and filters `preservedFeaturesReported` to the expected ship-feature list so invented survivors cannot be persisted. |
| [`app/api/groups/campaign/[slug]/media/visual-compass/route.ts`](../../../../../../../app/api/groups/campaign/%5Bslug%5D/media/visual-compass/route.ts), [`core-logic.ts`](../../../../../../../app/api/groups/campaign/%5Bslug%5D/media/visual-compass/core-logic.ts) | New operator-triggered route. `GET` returns current manifest visual-compass lint without spend. `POST` runs the vision overwrite pass for selected source assets (`assetIds`, `maxAssets`, `dryRun`) and persists verified `sourceQuality` plus verified `preservedFeaturesReported` via the media store. |
| [`lib/campaigns/media/media-store.ts`](../../../../../../../lib/campaigns/media/media-store.ts) | Added `updateAssetRecord()` so arbitrary asset metadata changes update both the asset record and the manifest in one path. |
| [`lib/campaigns/media/__tests__/visual-compass-vision.test.ts`](../../../../../../../lib/campaigns/media/__tests__/visual-compass-vision.test.ts) | New. Pure parser tests for fenced JSON extraction, score clamping, people-count normalization, demographic arrays, and expected-feature filtering. |

**Phase 5B exit criteria met:**

- Vision verification is now possible as a deliberate operator action, not a surprise default generation step.
- Deterministic source-quality baselines can be overwritten with `scoringSource: "vision_verified"` and a `visionEvaluatedAt` timestamp through `applyVisionVerifiedSourceQuality()`.
- `preservedFeaturesReported` is no longer limited to the declarative mirror path: the visual-compass POST route replaces it with the subset the vision evaluator actually reports from the generated image.
- The non-spend `GET` route lets UI/review surfaces fetch current lint before or after vision verification.

**Goal:** Keep alternate-art (watercolor/illustration) out of photo-real source pools, and add deterministic visual-compass lint that catches rail-repetition, weak group action, weak theme legibility, all-daylight sets, and demographic monotony before approval.

**Findings covered:** 8 (alternate art lane), lint side of 3 and 9.

**Primary files:**

- [`lib/campaigns/media/production-build-lint.ts`](../../../../../../../lib/campaigns/media/production-build-lint.ts)
- [`lib/campaigns/media/asset-manifest-section.ts`](../../../../../../../lib/campaigns/media/asset-manifest-section.ts)
- `lib/campaigns/media/visual-compass-lint.ts` (new file — colocated with `production-build-lint.ts`)

**Deliverables:**

1. Add an `alternate_art` manifest section (analogous to `designedAdArtifacts`). Hard rule: `alternate_art` assets are not selectable by `hero`, `ad_source`, or `platform_crop` paths unless the request explicitly opts in.
2. Implement `visual-compass-lint.ts` with deterministic checks:
   - rail/table/window composition share above the cap (configurable; default 30%).
   - group-action coverage below the floor (default: at least 4 group-action sources per campaign).
   - bright-daylight share above the cap (default: 50%).
   - dusk/blue-hour absent.
   - demographic monotony (single dominant age+ethnicity band across more than half the pool).
   - alternate-art leak (any `alternate_art` asset reachable via a photo-real selector).
   - reference-feature survival (every `source.ship_context` asset has at least one entry in `preservedFeaturesReported` from phase 2).
3. Wire `visual-compass-lint` into the existing production-build-lint orchestration so it runs at the same gate.
4. Make each lint failure produce a structured `LintIssue` with severity, asset IDs, and a one-line operator hint.

**Phase 3 carry-over deliverables (must be addressed here):**

5. **Replace deterministic source-quality scoring with vision-verified scoring.** Phase 3 shipped `themeLegibilityScore` and `groupActionScore` as deterministic heuristics over prompts. Phase 5 must rescore using vision evaluation against the actual generated image and overwrite the deterministic baseline.
6. **Add the `demographic_monotony` lint check.** Phase 3 collects `demographicCoverage.ageBands` and `ethnicityBands` from prompt + brief text, but no rule fires on them today. The check fires when more than half the source pool shares a single dominant age+ethnicity band. Vision verification (per Deliverable 5) feeds the same check with higher accuracy.
7. **Extend `sourceQuality` stamping to every source generation path.** Phase 3 only stamps scene images. Phase 5 must extend the stamping to hero images, aesthetic concepts, and documentary details so the visual-compass lint sees the entire source pool, not just scenes. This unblocks every `visual-compass-lint` rule above when applied to non-scene assets.
8. **Replace declarative `preservedFeaturesReported` with vision-verified survival.** Phase 2 mirrors `mustPreserveShipFeatures` directly. Phase 5 must run vision evaluation against the generated image and replace the mirrored list with the subset of features that actually survived. The `reference-feature survival` check above depends on this.

**Exit criteria:**

- Running the lint against the historical wellness-and-nature-cruise manifest reproduces the operator's intuitive complaints as concrete lint findings.
- A fresh run on a remediated campaign passes the new lint cleanly.

**Risks:**

- Lint thresholds may be too tight or too loose initially. Mitigation: thresholds are central constants; tune once after the first remediated campaign run.

---

## Phase 6 — Review UI And Manifest Surface Separation

**Completed:** 2026-05-26

**Shipped:**

| File | Change |
|---|---|
| [`app/(tests)/tests/media-generation/media-review-panel.tsx`](../../../../../../../app/(tests)/tests/media-generation/media-review-panel.tsx) | Added the `alternate_art` review tab and delete/history routing support through the existing image-artifact path. |
| [`app/(tests)/tests/media-generation/media-review-panel.tsx`](../../../../../../../app/(tests)/tests/media-generation/media-review-panel.tsx) | Added a manifest-only Visual Compass panel summarizing source scoring coverage, vision-verified count, group-action coverage, light/time-of-day spread, ship-feature survival, demographic spread, and Phase 5 lint codes. |
| [`app/(tests)/tests/media-generation/media-review-panel.tsx`](../../../../../../../app/(tests)/tests/media-generation/media-review-panel.tsx) | Added role-family lanes for source hero clean, group action, theme detail, ship context, editorial alt, alternate art, audit references, final ads, and final channel deliverables. |
| [`app/(tests)/tests/media-generation/media-review-panel.tsx`](../../../../../../../app/(tests)/tests/media-generation/media-review-panel.tsx) | Added inline curation/governance strips for every visible asset showing eligibility role, priority, scoring source, approved/blocked context counts, anti-tag counts, suitability/tag preview, and applicable lint codes. |

**Exit criteria met:**

- Operators can see Phase 5 lint issues directly on the review page without calling the spend-bearing visual-compass POST route.
- Alternate art is no longer hidden in source-oriented tabs; it has a dedicated review tab and role lane.
- No generic `Other` bucket was introduced; all role families called out by the phase are visible.
- Type-check clean with `npx tsc --noEmit`.

**Goal:** Make `/tests/media-generation` and any review surface show source, final, reference, and alternate-art assets in clearly distinct lanes so that visual audit cannot miss a family the way it did with `designed_ad_artifacts` before.

**Findings covered:** UI side of 5, 6, 8, 11.

**Primary files:**

- `/tests/media-generation` page and its components (locate via grep at implementation time).
- [`lib/campaigns/media/asset-manifest-section.ts`](../../../../../../../lib/campaigns/media/asset-manifest-section.ts) (rendering helpers, if any).

**Deliverables:**

1. Introduce one review lane per role family:
   - Source — Hero Clean
   - Source — Group Action
   - Source — Theme Detail
   - Source — Ship Context
   - Source — Editorial Alt
   - Alternate Art
   - Reference (audit only)
   - Final — Ad Artifacts
   - Final — Channel Deliverables
2. Each lane shows the lint flags applicable to that lane (e.g., "rail/window over cap" appears on the source lanes).
3. Curation preference indicators (approved/blocked contexts, suitability/anti tags) render inline with each asset.
4. Add a manifest-level "campaign visual compass" panel summarizing: group action coverage, time-of-day spread, ship-feature survival, demographic spread.

**Exit criteria:**

- An operator can audit the wellness-and-nature-cruise campaign and identify every issue surfaced by phase 5 lint without leaving the page.
- No asset family is hidden behind a generic `Other` bucket.

**Risks:**

- UI churn risk during a campaign-in-flight. Mitigation: ship behind a feature flag if any active campaign is mid-review.

---

## Phase 7 — Live Visual Enforcement And Effects Reality Gap

**Status:** Opened 2026-05-26 after live QA failure.

**Goal:** Convert the structural revamp into visible output change. A campaign cannot be considered visually successful because prompt metadata says it is varied; the generated pixels must show variation in people, place, lighting, theme behavior, ship specificity, and treatment.

**Immediate fixes started:**

- Narrowed music/festival campaign detection so observation campaigns do not inherit stage, DJ, and crowd-energy requirements from broad `listening` or `open deck` terms.
- Corrected `inferArtisticTreatment()` so ship-material language such as `painted deck surfaces` no longer counts as watercolor/illustration.
- Wired manifest role migration and `lintVisualCompass()` into `media-orchestrator.ts` before final save/status update, so visual-compass blockers can mark a generation run `partial`.
- Explicitly stamped generated scene images as `source.group_action`.

**Remaining deliverables:**

1. Add a mandatory vision-scoring pass or retry loop for source images before a run can become `ready`.
2. Add a real effects stage for requested photo-filter treatments: grain, color wash, black-and-white, contrast grade, lighting effect, and other Photoshop-style variants. Prompt-only treatment is not enough.
3. Add pixel-level or vision-level acceptance checks for daylight dominance, repeated architecture, repeated demographic archetype, and missing visible theme behavior.
4. Regenerate `glass-observatory-winter-sea-watchers` from the brief stage after the classifier fix and compare against the failed run.

**Exit criteria:**

- The same live QA view that failed on 2026-05-26 shows visible variation without relying on metadata interpretation.
- `/media/visual-compass` and the saved manifest status agree; blocker findings cannot coexist with a `complete`/`ready` generation result.
- At least one generated source lane contains visibly non-daylight or stylized treatment when the brief asks for it.

---

## Phase 8 — Reference Pipeline Recovery ✓ Complete

**Completed:** 2026-05-26

**Why this phase exists:** A live brief + media batch after Phases 0–7 still produced bland, generic images. Diagnosis traced a chain of failures in the **ship-reference pipeline**: references discovered → partially rehosted → wrong URL preferred at lookup → silent fetch failure at generation → text-only output dressed up as a "scene image". The model wasn't ignoring references; the references were never reaching the model.

**Root-cause chain (all four failures compounded):**

1. **URL preference bug** in `assetRecordToShipReferenceCandidate` ([ship-reference-service.ts:669, pre-Phase 8](../../../../../../../lib/campaigns/media/ship-reference-service.ts)): the function returned `record.sourceImageUrl || record.url`, preferring the original third-party URL over the R2 CDN URL. Every successfully-rehosted reference was still fetched from its flaky source.
2. **Silent fallback** in `fetchUsableReferenceImage` ([stability-generator.ts, pre-Phase 8](../../../../../../../lib/campaigns/media/generators/stability-generator.ts)): returned `null` on any fetch failure; `generateSceneImages` then silently generated text-only.
3. **No size guard** in `fetchImageAsBase64` ([vision-evaluator.ts](../../../../../../../lib/campaigns/media/vision-evaluator.ts)): images > 5 MB hit the Anthropic API limit (`9156472 bytes > 5242880 bytes` in the live log), the candidate was discarded, and the heuristic fallback preserved the oversized URL forever.
4. **Fallback to external record** in `importCandidateAsAsset` ([ship-reference-service.ts](../../../../../../../lib/campaigns/media/ship-reference-service.ts)): when rehost failed for any reason (size, network, storage cap), the function stored only the third-party URL with no retry and no downscale.

**Shipped:**

| File | Change |
|---|---|
| [`lib/campaigns/media/ship-reference-service.ts`](../../../../../../../lib/campaigns/media/ship-reference-service.ts) | New `selectFetchableReferenceUrl(record)` helper that prefers `record.url` unless it is an `r2://pending:` placeholder. `assetRecordToShipReferenceCandidate` now uses it — fixes the URL preference bug. New `normalizeReferenceImageForStorage(buffer, mime)` downscales on import to 1920px long-edge JPEG q80; PNGs with alpha < 2 MB pass through. `importCandidateAsAsset` calls the normalizer before `storeAsset` so oversized originals can succeed in R2/DynamoDB instead of falling through to the external-record path. |
| [`lib/campaigns/media/vision-evaluator.ts`](../../../../../../../lib/campaigns/media/vision-evaluator.ts) | New `normalizeImageForVisionApi` resizes oversized references to 1920px long-edge JPEG q80 before base64 encoding. The 4 MB safety threshold leaves headroom under the 5 MB Anthropic limit. Wired into `fetchImageAsBase64` so the live "9.1 MB exceeds 5 MB" failure mode no longer downgrades the pool. |
| [`lib/campaigns/media/generators/stability-generator.ts`](../../../../../../../lib/campaigns/media/generators/stability-generator.ts) | New exported `ReferenceFetchError` class carrying the list of attempted URLs and the last error. `fetchUsableReferenceImage(primary, fallback?)` now throws this error instead of returning `null`; iterates primary + optional fallback; skips `r2://pending:` placeholders. New `SceneImageReferenceStatus` union (`reference_applied` / `no_reference_available` / `reference_fetch_failed`). `GeneratedSceneImage` carries `referenceStatus` + optional `referenceFetchError`. `generateSceneImages` catches `ReferenceFetchError` per-scene, logs loudly with `console.error`, still produces a text-only image so the batch can complete, and marks the result with `referenceStatus = 'reference_fetch_failed'`. |
| [`lib/campaigns/media/media-orchestrator.ts`](../../../../../../../lib/campaigns/media/media-orchestrator.ts) | When a scene image carries `referenceStatus === 'reference_fetch_failed'`, the orchestrator stamps the `reference_unavailable` tag on the saved AssetRecord and pushes a structured error into the `errors[]` array so the run is marked non-clean and the operator sees exactly which scenes lost their reference. |
| [`lib/campaigns/media/__tests__/reference-pipeline.phase8.test.ts`](../../../../../../../lib/campaigns/media/__tests__/reference-pipeline.phase8.test.ts) | New file. 9 tests: URL preference (with R2 win, placeholder fallback, missing sourceImageUrl), candidate-conversion correctness, contextUrl preservation, ReferenceFetchError carries attempted URL list. |

**Exit criteria met:**

- `record.url` (R2/storage) is preferred over `record.sourceImageUrl` (third-party) at every reference lookup. Regression test pinned.
- Vision evaluator no longer fails on > 5 MB images. They are downscaled first.
- Reference images are downscaled at import time so the rehost step succeeds for large sources instead of falling back to the third-party URL forever.
- When a reference still cannot be fetched at generation time, the failure is LOUD: console.error per scene, AssetRecord tagged `reference_unavailable`, error pushed to the orchestrator's `errors[]`.
- Type-check clean; 220+ tests across 12 suites pass.

**Notes:**

- `fetchUsableReferenceImage` accepts an optional fallback URL but the current caller only passes the primary. The infrastructure is in place for a future enhancement to pass `record.sourceImageUrl` as a true fallback when R2 itself is unavailable — that's not needed today because Fix #1 alone makes R2 the reliable primary.
- The orchestrator pushes the per-scene failure into `errors[]` rather than throwing. This means the campaign batch completes (operator gets partial output to triage) but the run cannot pass as clean — `visual-compass` and review UI will both see the `reference_unavailable` tag.
- This phase does NOT change Nano-Banana's behavior. It changes WHAT REACHES Nano-Banana. The expectation is that with real reference images actually arriving as conditioning input, generated scenes will show ship-specific architecture instead of generic deck/window imagery.

**Open follow-ups (carry forward to Phase 7's remaining deliverables):**

- A mandatory vision-scoring pass that verifies the generated scene actually preserved ship features from the reference (Phase 7 deliverable 1, plus the Phase 5 carry-over notes).
- Real post-generation effects/filters (Phase 7 deliverable 2). Phase 8 fixes the input pipeline; it does not address the prompt-only treatment problem.

---

## Cross-Phase Concerns

### Backwards compatibility

This is a structural overhaul, not a versioned API. The audit (and project policy) is explicit that we should not add compatibility shims when we can change the code. Migrations happen once, deterministically, at the manifest layer (phase 0).

### Sequencing constraint

Phase 0 must land first because phases 1–5 all read or write the new `assetRole`. Phases 1 and 2 can run in parallel after phase 0. Phase 3 depends on phases 1 and 2. Phase 4 depends on phase 3 (metadata fields shape curation behavior). Phase 5 depends on phases 2 and 3 (it reads `preservedFeaturesReported`, `themeLegibilityScore`, and `groupActionScore`). Phase 6 depends on phase 5 (it surfaces lint output).

### Test campaign

The wellness-and-nature-cruise campaign is the primary regression target. After each phase, re-run media generation for it and diff the manifest, the generated images, the lint output, and the ad-render pack. A phase is not done until that diff matches the phase's intent.

### Skill and agent docs

Once phases 0–4 are in, update [`05_SKILL_UPDATE_PLAN.md`](./05_SKILL_UPDATE_PLAN.md) and the campaign-generation skill so external agents inherit the new role vocabulary, the no-final-as-source rule, and the curation contract.

---

## Finding → Phase Coverage Matrix

| Audit Finding | Title | Phase |
|---|---|---:|
| 1 | Group action suppressed | 1 |
| 2 | Landing still rules too conservative | 1 |
| 3 | Theme legibility too field-local | 3 (rule), 5 (lint) |
| 4 | Ship references don't survive generation | 2 |
| 5 | Broad asset pools select wrong family | 0 (core), 4 (selector) |
| 6 | Designed ad artifacts need hard eligibility | 0 |
| 7 | Copy Forge can't see source quality | 3 |
| 8 | Watercolor/illustration needs alternate lane | 5 |
| 9 | Scene slots encourage repetition | 2 (taxonomy), 5 (lint) |
| 10 | Legacy video constraints in stills | 1 |
| 11 | Curation preferences inconsistent | 4 |

All 11 audit findings are covered. All 12 fix-path steps from the audit report map to one or more phases above.

---

## Definition Of Done For The Overhaul

The overhaul is complete when, against a fresh wellness-and-nature-cruise generation run:

- Every manifest asset carries a `sourceEligibilityRole` and the full source-quality metadata set.
- No `final.*` asset is reachable from any ad render path.
- Group-action scenes meet or exceed the recommended default scene mix from the audit report.
- Time-of-day distribution meets the recommended standard (audit report § Recommended Time-Of-Day Standard).
- Every `source.ship_context` asset reports preserved ship features.
- Curation preferences set in the UI behave identically across landing, ad render, and templated render paths.
- Visual compass lint reports zero findings on a clean run and reproduces operator-level complaints on an intentionally weak run.
- The `/tests/media-generation` review surface shows every role family in its own lane.
