# Current Phase: Break Down Landing Still Failure Classes

## Mission

Keep the Editor's Room pipeline, but stop treating failed landing-still sets as one blended problem.

The next implementation phase must break the remaining failures into independent classes, fix them one at a time, and prove each fix against live diagnostics.

The immediate goal is to make `landingStillBible` generation debuggable and reliable by separating:

1. role coverage failures
2. generic fallback failures
3. niche legibility failures
4. anchor contract failures
5. whole-set collapse handling

## Why This Phase Exists

Recent live verification and direct diagnostic output established three things:

1. Approval/readiness gate correctness is still intact.
2. Stale stored production-build drift is still handled.
3. The remaining failures are now specific and separable, not evidence that the whole Editor's Room architecture should be discarded.

The latest report for `bp-tabletop-icon-2027-7n-caribbean` shows a narrow, actionable blocker profile:

1. `missing_role_coverage` is the primary blocker.
2. Two editorial stills are failing `slot_usage_mismatch` because their composition wording is being interpreted incorrectly.
3. Three stills still fall into generic fallback templates.
4. One still violates the anchor location contract.
5. Two stills claim niche carry-through but do not register as legible niche cues under lint.

That means the next implementation pass should stop making broad, multi-goal prompt changes.
The active problem is now deterministic decomposition and targeted remediation.

## Active Strategy

The execution target for this phase is not a new pipeline.

The execution target is a cleaner debugging and remediation loop around the existing Editor's Room pipeline.

Work each failure class independently.

Current priority order:

1. fix role coverage interpretation
2. fix explicit generic fallback generation patterns
3. fix niche cue legibility mismatch between still text and lint recognition
4. fix anchor contract drift where still text escapes the seeded location family
5. define the correct behavior when all 6 stills fail at once

The first concrete campaign target is `bp-tabletop-icon-2027-7n-caribbean`.

Do not try to fix stitch and sketchbook at the same time.
Use tabletop to close the role-coverage and composition-contract gap first.

The design goal for this phase is diagnostic elegance:

- one failure class per implementation pass
- one campaign used as the proving ground for that class
- direct still-by-still diagnostics
- no blended prompt tinkering
- no threshold weakening

## Product Target

Desired workflow:

1. Discovery selects a valid campaign.
2. User or agent API client triggers one brief-generation action through the shared contract.
3. System generates the core campaign brief and planning inputs.
4. A concept step generates community-native action anchors for the still set.
5. A visual-translation step generates `landingStillBible` from those anchors and slot requirements.
6. Deterministic diagnostics expose exactly which stills failed and why.
7. Engineering works one failure class at a time instead of mutating prompts globally.
8. If a campaign fails on one class only, the implementation target is narrowed to that class only.
9. If all 6 stills fail, the system is treated as a whole-set failure case, not as an isolated still-repair case.
10. If the result passes, the campaign moves to review or approval through one clear readiness state.

## Non-Negotiable Constraints

1. Do not add more validate/remediate/revise/retry buttons.
2. Do not create separate orchestration paths for UI and agent callers.
3. Do not deepen the issue-ledger workflow.
4. Do not build recursive repair loops.
5. Use native structured outputs for the primary generation path.
6. Enforce a strict one-correction-pass rule only for true subset failures.
7. Keep the implementation fast, explicit, and product-oriented.
8. Approval and readiness must continue matching downstream media-generation gating.
9. Do not regress the fixed stale-state resync behavior.
10. Do not weaken production-build lint thresholds to manufacture success.
11. Do not continue the add-more-negations/remove-some-negations prompt-balancing loop.
12. Do not treat a whole-set collapse as evidence that isolated repair should be broadened.
13. Do not work multiple failure classes in one code pass unless they share the same deterministic root cause.

## Scope Of Work

### Phase A: Make Failure Classes First-Class

Define and document the independent failure classes that remain in landing still generation.

Minimum design requirements:

- explicit per-still diagnostics for lint behavior
- explicit anchor-violation reporting from the same generation pass
- a clear mapping from blocker code to implementation target
- one proving campaign per failure class
- no mixing of unrelated fixes in one pass

### Phase B: Fix Tabletop Role Coverage First

Use `bp-tabletop-icon-2027-7n-caribbean` as the first proving case.

Current evidence says the main blocker is role coverage, not total campaign identity collapse.

Implementation target:

1. ensure editorial slots reliably produce lint-recognized editorial/wide compositions
2. eliminate the current `slot_usage_mismatch` on the two tabletop editorial stills
3. clear `missing_role_coverage` without weakening lint rules
4. preserve the passes already achieved on structural blockers and approval semantics

Minimum outputs:

- tabletop rerun with per-still diagnostics
- tabletop blocker count before and after
- proof that role coverage was fixed or clearly narrowed further
- exact remaining blocker codes after the role-coverage fix

### Phase C: Address Generic Fallback Patterns Separately

Once tabletop role coverage is fixed or no longer primary, address generic fallback generation as its own problem.

Primary signals:

1. `generic_fallback_template` flags on individual stills
2. `generic_fallback_overuse` on the lint report

Do not combine this work with niche-legibility fixes unless the evidence proves the same still text change resolves both.

### Phase D: Fix Niche Legibility Separately

The next independent class is the mismatch between declared niche carry-through and lint-recognized niche identity.

Primary signals:

1. still has `nicheCarryThrough`
2. still still receives `no_niche_cue`
3. campaign still fails `weak_niche_signal` or `identity_legibility_too_low`

This is a separate contract problem between still text generation and lint cue detection.

### Phase E: Define Whole-Set Failure Behavior

If all 6 stills fail, the system should no longer pretend the problem is a localized still-repair case.

This phase must define what happens next when the set is globally unsalvageable:

1. stop with blockers
2. full-set still regeneration with correction context
3. anchor regeneration plus still regeneration

Pick one path deliberately and test it.

## Relevant Files

- `lib/campaigns/brief-engine/orchestrator.ts`
- `lib/campaigns/editors-room.ts`
- `lib/campaigns/schema.ts`
- `lib/campaigns/media/production-build-lint.ts`
- `tests/phase-2c-diagnostic-breakdown.ts`

## Acceptance Criteria

The phase is complete only when all of the following are true:

1. UI and agent callers still share one underlying brief-step contract.
2. Native structured outputs remain in the main generation path.
3. Approval and readiness gate semantics remain unchanged.
4. Existing briefs cannot remain blocked solely because stale stored lint drifted from the current lint result.
5. `bp-tabletop-icon-2027-7n-caribbean` no longer fails on `missing_role_coverage`.
6. The tabletop editorial stills no longer fail `slot_usage_mismatch`.
7. Tabletop does not regress into new blocker codes while role coverage is being fixed.
8. Diagnostic output can show, per still, anchor violations and lint diagnostics from the same generation pass.
9. Generic fallback remediation is worked as a separate pass from role coverage.
10. Niche-legibility remediation is worked as a separate pass from generic fallback remediation.
11. Whole-set failure handling is explicitly defined and tested rather than silently skipped.

## Verification

Add or update tests for:

1. tabletop editorial slots produce lint-recognized editorial coverage
2. tabletop no longer fails `missing_role_coverage`
3. existing approval block when `productionBuildStatus = fail` still holds
4. stale-lint resync behavior still holds
5. anchor diagnostics remain accurate for location drift and slot mismatches
6. isolated still revision only applies to true subset failures
7. whole-set failure behavior follows the newly chosen explicit rule
8. the new diagnostic script can be run against representative campaigns and produce usable per-still output

Likely verification commands:

- `npx tsx lib/campaigns/__tests__/brief-engine.validation.test.ts`
- `npx tsx lib/campaigns/__tests__/anchor-compliance.test.ts`
- `npx tsx lib/campaigns/__tests__/brief-engine.orchestrator.test.ts`
- `npx tsx tests/phase-2c-diagnostic-breakdown.ts bp-tabletop-icon-2027-7n-caribbean`
- `npx tsx tests/phase-2c-direct-library.ts`

## Next Agent Instructions

### Objective

Implement the next narrow remediation pass against the existing Editor's Room pipeline.

The immediate objective is to fix tabletop role coverage without blending that work with the other failure classes.

### Do First

1. Read the latest findings in `phase-result.md` before making changes.
2. Assume approval/readiness gate correctness and stale-state resync are already handled unless a new regression proves otherwise.
3. Read the latest tabletop diagnostic report and treat it as the primary benchmark for this phase.
4. Run `tests/phase-2c-diagnostic-breakdown.ts` on tabletop before changing logic.

Representative campaigns:

- `bp-tabletop-icon-2027-7n-caribbean`
- `deck-sketchbook-society`
- `eastern-caribbean-stitch-sail-2026-09-19`

### Primary Implementation Target

Fix tabletop role coverage first.

Specific target from the latest report:

1. tabletop has 1 editorial still when it needs 2
2. two editorial stills are currently failing slot/composition interpretation
3. fix that first before working generic fallback or niche cue strength

Likely primary file:

- `lib/campaigns/editors-room.ts`

Secondary files only if required:

- `lib/campaigns/brief-engine/orchestrator.ts`
- `lib/campaigns/schema.ts`
- `lib/campaigns/media/production-build-lint.ts`
- tests for targeted tabletop regressions

### Do Not Do

1. Do not weaken production-build lint thresholds just to improve pass rate.
2. Do not reopen approval semantics or stale-state resync unless a failing regression proves it is broken.
3. Do not treat fixture-only test success as sufficient evidence.
4. Do not add button-maze remediation logic or new operator workflows.
5. Do not continue the prompt-negation balancing loop.
6. Do not work stitch or sketchbook blockers in the same code pass unless the tabletop fix clearly generalizes.
7. Do not claim success for generic fallback or niche legibility if the actual pass only fixed role coverage.
8. Do not regress campaigns that currently pass.

### Required Proof For Completion

Minimum proof:

1. Rerun tabletop diagnostics after the code change.
2. Show the before/after status of `missing_role_coverage`.
3. Show the before/after status of the two editorial tabletop stills.
4. Record whether generic fallback count changed, but treat that as secondary unless directly affected by the role-coverage fix.
5. State explicitly whether isolated-still revision was used, skipped, or not applicable.
6. If the tabletop blocker changes, name the new primary blocker class exactly.

### Required `phase-result.md` Update

Update `phase-result.md` as part of the work and add a new failure-class progress section containing:

- the exact tabletop blocker profile before the pass
- what was changed to address role coverage specifically
- tabletop before/after blocker counts
- whether the editorial still contract became stable
- whether generic fallback and niche-legibility remained unchanged, improved incidentally, or worsened
- whether the fix generalized to stitch or sketchbook if those were rerun
- residual blocker classes still remaining after the pass
- exact commands used for diagnostics, reruns, and verification