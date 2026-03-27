# Bible Separation Plan

## Purpose

Separate the two expensive downstream artifact stages from the core brief-generation path:

1. landingStillBible
2. productionBible

The goal is to reduce wasted tokens, isolate failures, make retries cheaper, and stop one slow artifact stage from forcing a full end-to-end rerun.

---

## Recommendation

Yes, both artifacts should be separated operationally.

Recommended target state:

1. core brief generation produces the persisted aesthetic brief and anchor set
2. landingStillBible is generated as its own artifact step
3. productionBible is generated as its own artifact step from validated stills
4. production-build lint is recomputed after each artifact step instead of forcing a full bundle rerun

This keeps the dependency chain honest:

1. productionBible depends on landingStillBible
2. landingStillBible depends on anchors and the persisted aesthetic brief
3. neither artifact should force Pass 1, Pass 2, or refinement to rerun unless those upstream inputs actually changed

---

## Implementation Status

Verified on March 26, 2026:

1. the branch now has isolated orchestrator operations for landing still regeneration, production bible regeneration, and lint-only resync
2. landing-still regeneration now invalidates downstream state by clearing `productionBible`, clearing stored production lint, and downgrading approval state to `revised` or `pending`
3. lint-only resync now refuses to run unless both `landingStillBible` and `productionBible` exist, which prevents stale stills and stale bible combinations from being re-certified
4. a direct sync smoke check of the `production-lint` route verified the route contract without starting a dev server
5. a full sync artifact sequence was run against `bp-opendeck-icon-2027-7n-caribbean`:
	- `landing-stills` regeneration returned `200` and cleared `productionBible` plus stored lint
	- immediate lint resync failed as expected because the production bible was missing
	- isolated production-bible regeneration returned `422` with persisted lint state, proving the downstream artifact was rebuilt independently
	- final lint resync returned `200` and confirmed the rebuilt artifact state
6. a real queued async job for `campaign_production_lint_resync` was submitted, claimed by the worker, completed, and successfully polled back through the route
7. after the deterministic `music_deck_activity` classifier fix in `production-build-lint.ts`, `bp-opendeck-icon-2027-7n-caribbean` now lands in `warn` instead of `fail` with no blocking issues and the warning `3 stills share composition family "music_deck_activity" — all have explicit niche cues so this is thematic consistency, not generic collapse.`

This closes the main stale-artifact hole in the original separation refactor and proves that the separated artifact workflow is operational in both sync and async modes.

Current interpretation:

1. the separation itself is no longer the blocker
2. the open-deck campaign is no longer failing on the old repeated-composition false positive
3. remaining week-2 work is now about regression confirmation, control-campaign validation, and optional client/UI cleanup around the new artifact routes

---

## Current State

Today the main bundle in `lib/campaigns/brief-engine/orchestrator.ts` still does this in one pass:

1. generateAestheticBrief
2. generateActionAnchors
3. generateLandingStillBible
4. repair or regenerate stills if needed
5. generateProductionBibleFromStills
6. compute final production lint

The good news is the codebase already has partial separation support:

1. there is already a dedicated client path for production bible regeneration in `lib/campaigns/aesthetic-workflow-client.ts`
2. revision flows already preserve `landingStillBible` and `productionBible` outside the core revision payload
3. validation already treats production artifacts as their own concern in `lib/campaigns/brief-engine/validation.ts`
4. the production bible generator already accepts `landingStillBible` as input directly, which is the right dependency boundary

So this is not a greenfield redesign. It is mostly finishing a separation the repo already hints at.

---

## Why Separate Both

### 1. Cost control

If productionBible fails, rerunning the whole bundle wastes spend on:

1. Pass 1
2. Pass 2
3. refinement
4. anchors
5. landing still generation

That is the wrong retry boundary.

### 2. Faster diagnosis

When one artifact fails, the team should know whether the problem is:

1. core brief quality
2. anchor quality
3. still generation
4. production bible generation
5. lint-only validation

Right now those concerns are still too bundled together.

### 3. Cleaner workflow semantics

The system already behaves like these are separate artifacts conceptually.

The code should match that reality.

### 4. Better user control

Users should be able to:

1. regenerate only stills
2. regenerate only the production bible
3. rerun lint without regenerating either

That is more truthful and cheaper than a monolithic regenerate flow.

---

## Target Architecture

### Artifact layers

#### Layer 1: Core brief

Produces:

1. aesthetic brief
2. communityExpression
3. messaging
4. merch
5. audio
6. social and video concepts

Optional output:

1. action anchors

#### Layer 2: Landing Still Bible

Inputs:

1. persisted brief
2. action anchors
3. campaign metadata

Produces:

1. `landingStillBible`
2. still-level lint and anchor-compliance data

#### Layer 3: Production Bible

Inputs:

1. persisted brief
2. validated `landingStillBible`
3. campaign metadata

Produces:

1. `productionBible`
2. production-build lint updates

#### Layer 4: Lint recompute only

Inputs:

1. persisted brief
2. persisted `landingStillBible`
3. persisted `productionBible`

Produces:

1. fresh `productionBuildLint`
2. fresh `productionBuildStatus`

---

## Separation Plan

## Phase 1: Make separation explicit in the orchestrator

Goal:

Stop treating both artifacts as inseparable parts of one bundle.

Changes:

1. split `generateFullBriefBundle` into smaller internal stages
2. create explicit internal helpers such as:
	- `generateCoreBriefBundle`
	- `generateLandingStillArtifact`
	- `generateProductionBibleArtifact`
	- `recomputeProductionLint`
3. keep the current end-to-end bundle as a compatibility wrapper initially, but have it call the smaller helpers in sequence

Outcome:

1. existing flows keep working
2. new isolated artifact flows can be added without duplicating generation logic

---

## Phase 2: Separate landingStillBible operationally

Goal:

Make landing still generation independently callable and persistable.

Why landingStillBible first:

1. it is the heavier hotspot before production bible
2. it already has repair/regeneration behavior and its own compliance gates
3. productionBible depends on it directly

Changes:

1. add an explicit landing-still regeneration API path and worker workflow
2. persist anchors separately if needed so still generation does not require full brief regeneration
3. run anchor compliance and still lint inside this isolated step
4. persist `landingStillBible` and refresh `productionBuildLint` after save

Desired behavior:

1. if still generation fails, only the still step retries
2. Pass 1 and refinement do not rerun

---

## Phase 3: Separate productionBible operationally

Goal:

Make production bible generation an isolated artifact refresh from saved stills.

Changes:

1. use or harden the existing dedicated production-bible endpoint/client path
2. ensure the server path reads the persisted `landingStillBible` directly
3. generate only `productionBible`
4. recompute `productionBuildLint` after save
5. return both the updated brief and the new lint report

Desired behavior:

1. if production bible fails, stills are preserved
2. if avoidDirectives or storyboard arrays fail, only production bible is retried
3. core brief generation is not rerun

---

## Phase 4: Add lint-only recompute

Goal:

Support a cheap “validate current artifacts” action without paying for new generation.

Changes:

1. expose a server path that reads persisted brief artifacts
2. reruns `lintProductionBuild`
3. resyncs `productionBuildStatus` and `productionBuildEvaluatedAt`

Desired behavior:

1. deterministic carry-through fixes can be validated without another LLM call
2. rule changes can be re-evaluated cheaply

---

## API And Workflow Changes

Recommended worker workflows:

1. `campaign_brief_generate_core`
2. `campaign_landing_stills_generate`
3. `campaign_production_bible_generate`
4. `campaign_production_lint_resync`

Recommended route split:

1. keep current brief route focused on brief-generation semantics
2. add or harden dedicated artifact routes under media or aesthetic endpoints
3. avoid one route that silently regenerates all artifacts when only one is stale

Recommended UI behavior:

1. show artifact-specific status
2. show which artifact is stale
3. allow users to rerun only the failed or stale artifact

---

## Validation And Approval Impact

Current validation requires both `landingStillBible` and `productionBible`.

That is fine for approval, but not ideal for generation-state semantics.

Recommended state model:

1. `drafting` while core brief is incomplete
2. `needs_review` when core brief exists but production artifacts are stale or incomplete
3. `ready_for_media` only when both artifacts exist and production lint passes or warns within policy

This preserves approval safety while still allowing partial progress to be saved honestly.

---

## Deterministic Follow-Ups Worth Doing With Separation

Once production bible is separate, these fixes become easier and cheaper:

1. deterministic avoidList to avoidDirectives carry-through
2. deterministic enforcement that storyboard `shotSequence` is non-empty
3. deterministic backfill or coercion for weakly formed storyboard arrays

These are exactly the kinds of problems that should not require a full brief rerun.

---

## Risks

### 1. State drift

Risk:

1. core brief changes after stills or production bible were generated

Mitigation:

1. track artifact freshness against a brief revision or generatedAt fingerprint
2. mark downstream artifacts stale when upstream inputs change

### 2. More workflow states

Risk:

1. UI and worker status logic becomes more complex

Mitigation:

1. keep artifact state explicit instead of implicit
2. prefer a small number of named artifact workflows over one overloaded regenerate path

### 3. False sense of completeness

Risk:

1. a user sees a saved brief and assumes media is ready when artifacts are stale

Mitigation:

1. show artifact freshness and production-build status clearly
2. keep approval gated on both artifacts and lint verdict

---

## Recommended Order Of Implementation

1. refactor orchestrator internals into separable helper stages
2. separate `landingStillBible` generation into its own workflow and persistence path
3. harden the existing production-bible-only path so it truly regenerates only from saved stills
4. add lint-only resync
5. add artifact freshness markers and UI status

This order follows the real dependency chain and gives the biggest cost-control win first.

---

## Success Criteria

This separation is successful when all of the following are true:

1. production bible failure no longer triggers Pass 1, Pass 2, refinement, anchor, or still reruns
2. landing still failure no longer triggers Pass 1 or refinement reruns
3. users can rerun only the stale artifact they need
4. production-build lint can be recomputed without paying for new generation
5. approval still requires both artifacts plus acceptable lint status

Current status against these criteria:

1. criteria 1 through 5 are now satisfied at the backend/orchestrator level
2. remaining work is not proof-of-architecture work; it is follow-through work on coverage, route ergonomics, and broader campaign regression confidence

---

## Decision

Proceed with separation.

Best practical interpretation:

1. split `landingStillBible` and `productionBible` into independent artifact workflows
2. treat the separation proof as complete for week 2 backend goals
3. keep any remaining content-quality or control-campaign work separate from the separation milestone

Separation reduces waste.

Schema remediation fixes correctness.

Both were needed, and week 2 has now shown they solve different problems.

Immediate next steps:

1. re-confirm the current saved state of `drift-festival-icon-2026` as the control campaign after the recent week-2 fixes
2. decide whether to spend time on shared client helpers and UI affordances for `landing-stills` and `production-lint`, knowing that those are productization tasks rather than backend proof tasks
3. run one additional campaign regression only if broader confidence is needed beyond the already verified open-deck sync and async tests
