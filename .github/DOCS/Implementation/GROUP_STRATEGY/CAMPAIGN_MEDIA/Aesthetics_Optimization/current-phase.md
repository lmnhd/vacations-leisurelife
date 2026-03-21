# Current Phase: Replace Monolithic Prompting With An Editor's Room

## Mission

Replace the current monolithic visual-planning prompt with a small-team generation pipeline for the aesthetic brief.

The new system must improve `landingStillBible` and `productionBible` quality through workflow structure, not through repeated prompt-negation balancing.

It must preserve one shared orchestration contract, one trustworthy readiness signal, and the already-fixed approval/readiness gate semantics.

## Why This Phase Exists

Recent live verification established three things:

1. Approval and readiness gate correctness have already been fixed.
2. Stale stored production-build status drift has already been handled.
3. Dense prompt balancing for still generation does not generalize reliably and can regress live quality.

That means the next implementation pass should stop trying to perfect a single giant prompt.
The active problem is now architectural: how to build better bibles with a cleaner generation topology.

## Active Strategy

The new execution target is an `Editor's Room` pipeline.

Instead of asking one LLM call to simultaneously act as niche strategist, visual director, schema formatter, and compliance checker, the system should use a short sequence of specialized steps:

1. Generate community-native action anchors.
2. Generate `landingStillBible` from those locked anchors plus slot requirements.
3. Generate `productionBible` from the campaign brief and the validated still set.
4. Run deterministic lint and structural validation.
5. If specific stills fail, revise only those stills once with issue-specific inputs.
6. Recompute lint and either pass, stop with blockers, or return revision-used status.

The design goal is blissful elegance:

- positive prompts
- smaller schemas per step
- deterministic critique
- isolated still repair
- no recursive remediation maze

## Product Target

Desired workflow:

1. Discovery selects a valid campaign.
2. User or agent API client triggers one brief-generation action through the shared contract.
3. System generates the core campaign brief and planning inputs.
4. A concept step generates a small set of community-native action anchors for the still set.
5. A visual-translation step generates `landingStillBible` from those anchors and slot requirements.
6. A production-synthesis step generates `productionBible` from the brief and the validated still set.
7. Hard deterministic checks run immediately.
8. If specific stills fail, the system gets one isolated corrective revision pass on only those failing stills.
9. If the revision still fails, the system stops and returns clear blockers.
10. If the result passes, the campaign moves to review or approval through one clear readiness state.

## Non-Negotiable Constraints

1. Do not add more validate/remediate/revise/retry buttons.
2. Do not create separate orchestration paths for UI and agent callers.
3. Do not deepen the issue-ledger workflow.
4. Do not build recursive repair loops.
5. Use native structured outputs for the primary generation path.
6. Enforce a strict one-correction-pass rule only.
7. Keep the implementation fast, explicit, and product-oriented.
8. Approval and readiness must continue matching downstream media-generation gating.
9. Do not regress the fixed stale-state resync behavior.
10. Do not weaken production-build lint thresholds to manufacture success.
11. Do not continue the add-more-negations/remove-some-negations prompt-balancing loop.

## Scope Of Work

### Phase A: Lock The New Generation Topology

Define the new shared orchestration shape for the Editor's Room model.

Minimum design requirements:

- one shared service entry point for UI and agent callers
- intermediate artifact for action anchors
- still-only revision input format for isolated repairs
- clear ownership of `landingStillBible` versus `productionBible`
- one consistent readiness result after validation and lint

### Phase B: Build The Shared Editor's Room Pipeline

Implement one orchestration path with these steps:

1. generate core brief and planning context
2. generate action anchors
3. generate `landingStillBible`
4. lint and structurally validate the still set
5. if needed, regenerate only failing stills once
6. regenerate or synthesize `productionBible` from the validated still set
7. recompute final lint and readiness state

Minimum outputs:

- full brief bundle
- `landingStillBible`
- `productionBible`
- readiness state
- pass/fail gate result
- blocker list if generation fails
- whether isolated still revision was used

### Phase C: Preserve Shared Contract Discipline

Keep the same shared route/API surface philosophy:

- UI and agent callers use the same orchestration service
- no agent-only shortcut route
- no UI-only hidden sequencing
- no return to operator-button choreography

### Phase D: Make The Bibles First-Class

The bibles are the primary target of this phase.

`landingStillBible` should be treated as the main creative artifact that carries identity, variety, and slot coverage.

`productionBible` should be treated as a downstream synthesis artifact derived from:

- campaign brief
- validated still set
- deterministic production constraints

Do not continue treating both as co-equal freeform blobs emitted from one overloaded prompt.

## Relevant Files

- `lib/campaigns/brief-engine/orchestrator.ts`
- `lib/campaigns/aesthetic-engine.ts`
- `lib/campaigns/schema.ts`
- tightly related visual-planning helpers
- `lib/campaigns/media/production-build-lint.ts`

## Acceptance Criteria

The phase is complete only when all of the following are true:

1. UI and agent callers still share one underlying brief-step contract.
2. The happy path no longer depends on monolithic prompt balancing.
3. Native structured outputs remain in the main generation path.
4. Failure handling uses one isolated corrective pass at most, then stops.
5. Downstream media generation still reads one reliable readiness signal.
6. A campaign with `productionBuildStatus = fail` cannot be approved.
7. A campaign with `productionBuildStatus = fail` cannot report `ready_for_media`.
8. Existing briefs cannot remain blocked solely because stale stored lint drifted from the current lint result.
9. Newly generated campaigns show materially improved production-build lint performance on the representative sample.
10. The main recurring lint failures are reduced, especially `weak_niche_signal`, `identity_legibility_too_low`, and `repeated_composition_family`.
11. The isolated-still revision path repairs specific failures without destabilizing previously good stills.

## Verification

Add or update tests for:

1. valid campaign generates a passing brief bundle through the new multi-step flow
2. one hard-rule failure triggers one isolated corrective pass
3. second failure returns blockers and stops
4. approval cannot proceed when blockers remain
5. agent API invocation reaches the same orchestration path as the UI path
6. approval is blocked when `productionBuildStatus = fail`
7. readiness is downgraded from `ready_for_media` when `productionBuildStatus = fail`
8. stale-lint resync behavior still holds
9. action-anchor generation produces schema-valid intermediate output
10. isolated still revision only touches targeted stills
11. representative campaigns show improved live production-build outcomes after the architecture change

Likely verification commands:

- `npx tsx lib/campaigns/__tests__/brief-engine.validation.test.ts`
- focused tests for the new orchestration flow
- targeted regression for approval + failed production build
- targeted regression for stale stored fail status vs recomputed current lint
- targeted production-build quality regression tests against representative campaigns or fixtures

## Next Agent Instructions

### Objective

Implement the Editor's Room pipeline for aesthetic brief generation with special attention on `landingStillBible` and `productionBible`.

### Do First

1. Read the latest findings in `phase-result.md` before making changes.
2. Assume approval/readiness gate correctness and stale-state resync are already handled unless a new regression proves otherwise.
3. Use the latest representative live results in `phase-result.md` as the benchmark to beat.

Representative campaigns:

- `bp-tabletop-icon-2027`
- `deck-sketchbook-society`
- `eastern-caribbean-stitch-sail-2026-09-19`

### Primary Implementation Target

Replace the monolithic visual-planning generation pattern with a short pipeline of specialized steps:

1. Generate community-native action anchors first.
2. Generate `landingStillBible` from those anchors plus slot requirements.
3. Run deterministic lint and structural validation.
4. If specific stills fail, regenerate only those stills once with issue-specific revision input.
5. Generate or synthesize `productionBible` from the brief and validated still set.
6. Return the final readiness and blocker state.

Likely primary file:

- `lib/campaigns/brief-engine/orchestrator.ts`

Secondary files only if required:

- `lib/campaigns/aesthetic-engine.ts`
- `lib/campaigns/schema.ts`
- tightly related visual-planning helpers
- tests for production-build quality regressions

### Do Not Do

1. Do not weaken production-build lint thresholds just to improve pass rate.
2. Do not reopen approval semantics or stale-state resync unless a failing regression proves it is broken.
3. Do not treat fixture-only test success as sufficient evidence.
4. Do not add button-maze remediation logic or new operator workflows.
5. Do not continue the prompt-negation balancing loop.
6. Do not regenerate the full still set when only one or two stills failed unless the whole set is unsalvageable.
7. Do not regress campaigns that currently pass.

### Required Proof For Completion

Minimum proof:

1. Regenerate representative campaigns after the pipeline change.
2. Record structural blockers, production-build blockers, and ready-for-media rate before and after.
3. Show whether blocker frequency improves on the same representative sample.
4. Call out which blocker codes were reduced and which persisted.
5. State explicitly whether currently passing campaigns stayed green.
6. State explicitly whether isolated-still revision was exercised and what it repaired.

### Required `phase-result.md` Update

Update `phase-result.md` as part of the work and add a new architecture-progress section containing:

- what orchestration and generation-step changes were made
- what intermediate artifacts were introduced, especially action anchors and still-only revision inputs
- which representative campaigns were rerun
- before/after blocker counts for the sample
- whether `weak_niche_signal`, `identity_legibility_too_low`, role-coverage failures, and `repeated_composition_family` improved
- whether the bibles became more stable under live reruns
- residual production-build blocker patterns that still remain
- exact commands used for reruns and verification