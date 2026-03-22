# Current Phase: Whole-Set Anchor Reliability

## Mission

Keep the Editor's Room pipeline, keep reference-grounded still generation, and stop losing valid campaigns to true anchor drift and anchor-contract instability.

The next implementation phase must make `landingStillBible` generation obey its anchor contract more reliably, especially on:

1. `anchor_location_mismatch`
2. `duplicate_location_family`
3. residual `slot_usage_mismatch` caused by contract wording drift

The immediate goal is not another semantic-quality pass.
The immediate goal is to make anchor-seeded still generation stay where it was told to stay.

## Why This Phase Exists

Recent implementation work already solved or materially improved the earlier semantic classes:

1. reference-grounded generation is in place
2. shot-intent underlayer is in place
3. stitch no longer fails on generic fallback or weak niche signal in the latest diagnostic output
4. lint blockers for stitch are now `0`

The latest verified diagnostic output for `eastern-caribbean-stitch-sail-2026-09-19` now shows:

1. `Anchor violations: 0`
2. `Lint blockers: 0`
3. `Explicit cue stills: 6/6`
4. `No-cue stills: 0/6`
5. `Generic fallback stills: 0/6`

That means the stitch proving target for anchor-contract reliability is complete enough.

The remaining failures are therefore no longer centered on stitch.
They are centered on the harder whole-set reliability case, especially:

1. declared anchor location family
2. generated still location/composition phrasing
3. deterministic anchor-compliance interpretation
4. what the system does when a whole set collapses at once

The current remaining issue class is whole-set anchor instability, not semantic quality.

## Core Diagnosis

The system is now strong enough semantically that anchor-contract issues are exposed clearly.

Current failure modes:

1. the model drifts from the anchor's declared location family even when the scene remains semantically plausible
2. location-family inference can still classify a generated phrase into the wrong family when wording is ambiguous
3. editorial slots can still trigger `slot_usage_mismatch` when composition language is technically compliant but not phrased in the exact contract-friendly way the validator expects
4. repair behavior must preserve uniqueness and contract fidelity across the whole batch, not only per still

The stitch proving target is no longer the blocker.

That means the next pass must move to the harder campaign where anchor reliability still collapses under broader set pressure.

## Active Strategy

The execution target for this phase is a tighter anchor contract across generation, repair, and deterministic validation.

Priority order:

1. rerun and characterize `deck-sketchbook-society-2026` under the current fixed pipeline
2. isolate whether the remaining failure is anchor drift, duplicate families, or whole-set collapse handling
3. define the explicit behavior for 6/6 failing still sets
4. keep stitch and tabletop stable while moving to the harder whole-set case

The design goal for this phase is contract reliability:

- anchors remain the source of truth
- shot-intent remains aligned to the same anchor
- validator rules stay deterministic
- no threshold weakening
- no new retry maze

## Product Target

Desired workflow:

1. discovery selects a valid campaign
2. shared brief generation path builds brief, anchors, and reference-grounded stills
3. each still remains within its anchor's declared location family
4. each still expresses composition in a validator-recognizable way for its slot role
5. deterministic diagnostics expose only real drift, not wording artifacts
6. subset repair, when applicable, preserves both anchor family and inter-still uniqueness
7. readiness and approval remain governed by the same downstream gate

## Non-Negotiable Constraints

1. do not add more validate/remediate/revise/retry buttons
2. do not create separate orchestration paths for UI and agent callers
3. do not deepen the issue-ledger workflow
4. do not build recursive repair loops
5. keep native structured outputs in the primary generation path
6. keep deterministic lint and anchor compliance as the final gatekeepers
7. keep the one-correction-pass rule for subset repair
8. do not weaken production-build lint thresholds to manufacture success
9. do not weaken anchor-compliance rules just to improve pass rate
10. do not reopen solved semantic classes unless a regression proves they broke
11. do not add a critic pass for this phase unless contract-focused fixes fail first

## Scope Of Work

### Phase A: Re-Benchmark Sketchbook Under The Fixed Contract Layer

Use the current pipeline after the stitch fixes and capture the real remaining failure profile for `deck-sketchbook-society-2026`.

Implementation targets:

1. rerun diagnostics on sketchbook before changing logic
2. separate anchor violations from lint blockers clearly
3. identify whether failures are localized or truly 6/6 whole-set

### Phase B: Define Whole-Set Failure Behavior Explicitly

If all 6 stills fail, the system should not pretend the problem is localized repair.

Choose and implement one explicit behavior:

1. stop with blockers
2. regenerate the full still set with correction context
3. regenerate anchors plus stills

Do not leave this as implicit fallthrough behavior.

### Phase C: Preserve Partial-Repair Discipline

Keep subset repair strict.

Implementation targets:

1. partial failures still use subset repair only
2. full-set collapse must take the newly chosen whole-set path
3. stitch and tabletop must not regress

## Relevant Files

- `lib/campaigns/editors-room.ts`
- `lib/campaigns/brief-engine/orchestrator.ts`
- `lib/campaigns/schema.ts`
- `lib/campaigns/media/production-build-lint.ts`
- `tests/phase-2c-diagnostic-breakdown.ts`

Likely additional files to inspect before changes:

- `lib/campaigns/__tests__/anchor-compliance.test.ts`
- `lib/campaigns/__tests__/production-build-quality.test.ts`
- `lib/campaigns/reference-packs.ts`

## Acceptance Criteria

The phase is complete only when all of the following are true:

1. UI and agent callers still share one underlying brief-step contract
2. native structured outputs remain in the main generation path
3. approval and readiness gate semantics remain unchanged
4. existing briefs cannot remain blocked solely because stale stored lint drifted from the current lint result
5. stitch remains at `0` anchor violations and `0` lint blockers
6. tabletop does not regress on role coverage or semantic quality
7. sketchbook failure mode is explicitly characterized from the current pipeline, not inferred from stale runs
8. full-set failure handling is explicitly defined and tested
9. diagnostic output can still show, per still, anchor violations and lint diagnostics from the same generation pass
10. repair remains subset-only and preserves inter-still uniqueness

## Verification

Add or update tests for:

1. existing stitch anchor-reliability regressions remain green
2. full-set failure behavior follows the newly chosen explicit rule
3. existing approval block when `productionBuildStatus = fail` still holds
4. stale-lint resync behavior still holds
5. anchor diagnostics remain accurate for real location drift and slot mismatches
6. isolated still revision only applies to true subset failures
7. representative diagnostics clearly distinguish sketchbook whole-set collapse from localized failure
8. stitch and tabletop remain stable after the whole-set behavior change

Likely verification commands:

- `npx tsx lib/campaigns/__tests__/anchor-compliance.test.ts`
- `npx tsx lib/campaigns/__tests__/brief-engine.orchestrator.test.ts`
- `npx tsx lib/campaigns/__tests__/brief-engine.validation.test.ts`
- `npx tsx lib/campaigns/__tests__/reference-packs.test.ts`
- `npx tsx lib/campaigns/__tests__/production-build-quality.test.ts`
- `npx tsx tests/phase-2c-diagnostic-breakdown.ts eastern-caribbean-stitch-sail-2026-09-19`
- `npx tsx tests/phase-2c-diagnostic-breakdown.ts deck-sketchbook-society-2026`
- `npx tsx tests/phase-2c-direct-library.ts`

## Next Agent Instructions

### Objective

Implement the next narrow remediation pass against the existing Editor's Room pipeline.

The immediate objective is to define and harden whole-set failure behavior without reopening already-solved stitch semantic and anchor-contract work.

### Do First

1. read the latest findings in `phase-result.md` before making changes
2. assume approval/readiness correctness, stale-state resync, reference grounding, and slotRole-aware lint are already handled unless a new regression proves otherwise
3. run `tests/phase-2c-diagnostic-breakdown.ts deck-sketchbook-society-2026` before changing logic
4. confirm stitch remains green so the next pass does not regress it

Representative campaigns:

- `eastern-caribbean-stitch-sail-2026-09-19`
- `bp-tabletop-icon-2027-7n-caribbean`
- `deck-sketchbook-society-2026`

### Primary Implementation Target

Fix explicit whole-set behavior first.

Specific target for the next pass:

1. characterize sketchbook under the current fixed pipeline
2. choose the correct explicit path for 6/6 failure
3. implement that path without regressing stitch or tabletop

Likely primary files:

- `lib/campaigns/editors-room.ts`
- `lib/campaigns/schema.ts`
- `lib/campaigns/media/production-build-lint.ts`

Secondary files only if required:

- `lib/campaigns/brief-engine/orchestrator.ts`
- `tests/phase-2c-diagnostic-breakdown.ts`
- targeted tests

### Do Not Do

1. do not weaken production-build lint thresholds just to improve pass rate
2. do not weaken anchor-compliance rules broadly just to make current examples pass
3. do not reopen approval semantics or stale-state resync unless a failing regression proves they are broken
4. do not treat fixture-only test success as sufficient evidence
5. do not add a critic pass until contract-focused fixes are tested first
6. do not return to generic-fallback or niche-signal work unless the fix directly regresses them
7. do not regress campaigns that currently pass or partially pass

### Required Proof For Completion

Minimum proof:

1. rerun sketchbook diagnostics after the code change
2. state the exact whole-set behavior now chosen for 6/6 failures
3. show whether stitch and tabletop stayed stable
4. show that lint blockers and anchor diagnostics still report accurately
5. state explicitly whether isolated-still revision was used, skipped, or replaced by the chosen whole-set path
6. if a residual blocker remains, name the exact failure class

### Required `phase-result.md` Update

Update `phase-result.md` as part of the work and add a new section containing:

- the exact sketchbook failure profile before the pass
- the explicit whole-set behavior chosen in this phase
- before and after failure counts
- whether stitch stayed at `0 / 0`
- whether tabletop regressed, stayed stable, or improved incidentally
- whether sketchbook improved or merely became more explicitly classified
- exact commands used for diagnostics, reruns, and verification
