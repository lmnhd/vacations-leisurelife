# Current Phase: Anchor-Contract Reliability

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

The latest direct diagnostic output for `eastern-caribbean-stitch-sail-2026-09-19` tightens the picture:

1. `Anchor violations: 3`
2. `Lint blockers: 0`
3. `Explicit cue stills: 6/6`
4. `No-cue stills: 0/6`
5. `Generic fallback stills: 0/6`

The remaining failures are therefore not primarily about niche signal or generic fallback anymore.
They are about contract fidelity between:

1. declared anchor location family
2. generated still location/composition phrasing
3. deterministic anchor-compliance interpretation

The current remaining issue class is now real anchor drift, not lint blindness.

## Core Diagnosis

The system is now strong enough semantically that anchor-contract issues are exposed clearly.

Current failure modes:

1. the model drifts from the anchor's declared location family even when the scene remains semantically plausible
2. location-family inference can still classify a generated phrase into the wrong family when wording is ambiguous
3. editorial slots can still trigger `slot_usage_mismatch` when composition language is technically compliant but not phrased in the exact contract-friendly way the validator expects
4. repair behavior must preserve uniqueness and contract fidelity across the whole batch, not only per still

The stitch diagnostic output is the clearest current benchmark:

1. slot-3 and slot-4 are semantically correct and lint-clean, but still receive `slot_usage_mismatch`
2. slot-6 is semantically correct and lint-clean, but still receives `anchor_location_mismatch` because balcony/rail phrasing is still drifting across the contract boundary

That means the next pass must improve anchor obedience and validator alignment, not semantic richness.

## Active Strategy

The execution target for this phase is a tighter anchor contract across generation, repair, and deterministic validation.

Priority order:

1. reduce true location-family drift in first-pass still generation
2. reduce validator false negatives on contract-compliant editorial-wide phrasing
3. strengthen repair instructions so repaired stills preserve both anchor location and slot contract simultaneously
4. keep semantic gains from reference grounding intact while tightening contract obedience

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

### Phase A: Tighten Location-Family Obedience In Generation

Focus on true first-pass drift.

Implementation targets:

1. strengthen prompt wording so location family is treated as a hard scene boundary, not a soft suggestion
2. make the shot-intent underlayer reinforce the same location family explicitly
3. ensure each still's self-check verifies that location wording stays inside the anchor family

Primary proving target:

1. `eastern-caribbean-stitch-sail-2026-09-19`

Specific benchmark from latest diagnostic:

1. slot-6 must stop drifting from `balcony` into `rail`

### Phase B: Align Editorial Composition Contract With Validator

Address residual `slot_usage_mismatch` where the still is semantically editorial/wide but the anchor validator still rejects the wording.

Current benchmark from latest stitch diagnostic:

1. slot-3: `medium_wide two_shot in a cozy library nook...`
2. slot-4: `medium_wide environmental portrait... open, airy Solarium context...`
3. both are lint-clean and role-correct
4. both still fail anchor-compliance slot interpretation

Implementation target:

1. decide whether the validator should explicitly accept `medium_wide` as satisfying `wide or medium`
2. if not, normalize or canonicalize composition language before anchor validation so the contract is expressed in accepted vocabulary
3. preserve the existing slotRole-aware lint behavior

This phase should prefer contract normalization or validator precision over broad heuristic weakening.

### Phase C: Strengthen Repair Discipline Around Anchor Fidelity

Ensure subset repair cannot reintroduce location drift or intra-batch duplication.

Implementation targets:

1. repaired stills must explicitly restate anchor family and slot contract in their self-check
2. repair prompt must forbid family drift relative to both anchor metadata and already-accepted stills
3. repaired stills must remain unique across the repair batch

### Phase D: Re-Test Sketchbook As The Hard Case

Only after stitch anchor drift is reduced should sketchbook be rerun as the harder anchor-contract / whole-set case.

Reason:

1. stitch is the cleanest proving ground because semantic blockers are already cleared
2. sketchbook still collapses earlier and is a worse first benchmark for this narrower pass

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
5. stitch or another chosen proving campaign remains at `0` lint blockers while anchor violations are reduced
6. latest stitch diagnostic no longer shows balcony-to-rail drift on slot-6
7. latest stitch diagnostic no longer shows the current editorial `slot_usage_mismatch` wording failures on slot-3 and slot-4, or those failures are explicitly narrowed to a deterministic validator gap with a committed rule choice
8. tabletop does not regress on role coverage or semantic quality while this phase targets anchor fidelity
9. diagnostic output can still show, per still, anchor violations and lint diagnostics from the same generation pass
10. repair remains subset-only and preserves inter-still uniqueness

## Verification

Add or update tests for:

1. balcony-authored still text with nearby railing language still resolves correctly to `balcony` when appropriate
2. first-pass generation instructions preserve declared location family more reliably
3. `medium_wide` editorial phrasing either passes contract validation or is normalized deterministically before validation
4. existing approval block when `productionBuildStatus = fail` still holds
5. stale-lint resync behavior still holds
6. anchor diagnostics remain accurate for real location drift and slot mismatches
7. isolated still revision only applies to true subset failures
8. representative diagnostics clearly show reduced anchor violations without reintroducing generic fallback or weak niche signal

Likely verification commands:

- `npx tsx lib/campaigns/__tests__/anchor-compliance.test.ts`
- `npx tsx lib/campaigns/__tests__/brief-engine.orchestrator.test.ts`
- `npx tsx lib/campaigns/__tests__/brief-engine.validation.test.ts`
- `npx tsx lib/campaigns/__tests__/reference-packs.test.ts`
- `npx tsx lib/campaigns/__tests__/production-build-quality.test.ts`
- `npx tsx tests/phase-2c-diagnostic-breakdown.ts eastern-caribbean-stitch-sail-2026-09-19`
- `npx tsx tests/phase-2c-direct-library.ts`

## Next Agent Instructions

### Objective

Implement the next narrow remediation pass against the existing Editor's Room pipeline.

The immediate objective is to reduce true anchor drift and residual anchor-contract wording failures without reopening already-solved semantic quality work.

### Do First

1. read the latest findings in `phase-result.md` before making changes
2. assume approval/readiness correctness, stale-state resync, reference grounding, and slotRole-aware lint are already handled unless a new regression proves otherwise
3. run `tests/phase-2c-diagnostic-breakdown.ts eastern-caribbean-stitch-sail-2026-09-19` before changing logic
4. inspect the exact code paths that classify location family and evaluate editorial-wide slot usage

Representative campaigns:

- `eastern-caribbean-stitch-sail-2026-09-19`
- `bp-tabletop-icon-2027-7n-caribbean`
- `deck-sketchbook-society-2026`

### Primary Implementation Target

Fix stitch anchor-contract reliability first.

Specific target from the latest diagnostic:

1. slot-6 must stop failing `anchor_location_mismatch` for `balcony`
2. slot-3 and slot-4 must stop failing `slot_usage_mismatch` when they are already lint-clean editorial stills
3. no semantic regressions may be introduced while fixing those contract failures

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

1. rerun stitch diagnostics after the code change
2. show before and after anchor violation counts
3. show before and after status of slot-3, slot-4, and slot-6 individually
4. show that lint blockers remain `0` or name any regression exactly
5. state explicitly whether isolated-still revision was used, skipped, or not applicable
6. if a residual blocker remains, name the exact failure class

### Required `phase-result.md` Update

Update `phase-result.md` as part of the work and add a new section containing:

- the exact stitch anchor-violation profile before the pass
- what was changed to reduce location drift specifically
- what was changed to resolve or narrow the editorial `slot_usage_mismatch` wording issue
- before and after anchor violation counts
- whether lint blockers stayed at `0`
- whether tabletop regressed, stayed stable, or improved incidentally
- whether sketchbook changed if rerun
- exact commands used for diagnostics, reruns, and verification
