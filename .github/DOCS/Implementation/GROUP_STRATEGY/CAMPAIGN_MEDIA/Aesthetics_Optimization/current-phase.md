# Current Phase: Reference-Grounded Still Generation

## Mission

Keep the Editor's Room pipeline and the failure-class mindset, but stop asking the still generator to invent niche-native imagery from scratch on every run.

The next implementation phase should add a concrete grounding layer ahead of `landingStillBible` generation so the model is biased toward known-good niche imagery and away from known-toxic generic cruise patterns.

This phase turns three brainstorm ideas into one executable plan:

1. Golden Reference Injection is the primary implementation
2. a single critic pass is the optional secondary reinforcement
3. a compact structured shot underlayer is the contract that keeps the prose honest

## Why This Phase Exists

Recent work already proved several things:

1. the Editor's Room architecture is the correct base direction
2. approval and readiness gate correctness are intact
3. stale stored production-build drift is already handled
4. prompt-negation balancing is not the durable path

Recent live evidence also changed the tactical picture:

1. tabletop improved from a hard production fail to a narrower `warn` / `needs_review` state and hit the immediate target
2. stitch still behaves primarily like a generic-fallback and weak-niche-signal failure
3. sketchbook still behaves like an anchor-contract and whole-set stability problem

That means the next best move is not another role-coverage micro-fix.
The next best move is to ground generation with explicit examples so the model stops snapping back to default cruise-lifestyle imagery.

## Core Diagnosis

The remaining failures are not all the same, but two of them share a common upstream cause:

1. `generic_fallback_overuse`
2. `weak_niche_signal`
3. `identity_legibility_too_low`

These happen when the model knows the slot contract but still reaches for its safest latent image prior.

In practice that means:

1. slot metadata is present but the prose still sounds stock
2. declared niche carry-through exists but the scene does not read as community-native
3. anchor compliance can still pass while the actual visual language remains generic

This is why more negative wording is not enough.
The generator needs positive reference gravity, not more prose prohibitions.

## Active Strategy

The execution target for this phase is not a new orchestration system.

The execution target is a reference-grounded generation layer added inside the existing Editor's Room pipeline.

Priority order for this phase:

1. add curated pre-shot reference packs
2. inject those references into still generation and subset repair
3. require a small structured shot contract per still
4. only add one critic pass if reference grounding alone does not clear the target failure class

This keeps the current architectural rules intact:

- one shared path for UI and agent callers
- native structured outputs remain primary
- deterministic lint stays the final judge
- no recursive revision maze
- no threshold weakening

## Concrete Implementation Proposal

### Proposal Summary

Add a new reference-grounding step before `generateLandingStillBible` and `repairFailingStills`.

That step will retrieve a small curated pack of:

1. two known-good example patterns for the campaign's niche family and slot role
2. one explicitly toxic generic pattern to avoid
3. a compact shot-intent contract the generator must fill before writing prose

The generator will still return normal structured still objects, but those stills will now be built from a stronger semantic scaffold.

### What Gets Added

#### 1. Pre-Shot Reference Pack

Create a curated in-repo reference source, not a vector database in the first pass.

Use a static TypeScript or JSON-backed module with entries keyed by niche family and slot role.

Minimum shape:

1. `referencePackId`
2. `nicheFamily`
3. `slotRole`
4. `winningExamples[]`
5. `toxicExamples[]`
6. `requiredNicheSignals[]`
7. `bannedFallbackPatterns[]`
8. `cameraIntentHints[]`
9. `locationFamilyHints[]`

The first pack only needs enough coverage for representative campaigns:

1. tabletop
2. stitch
3. sketchbook

Do not wait for a universal corpus before implementing the mechanism.

#### 2. Shot Intent Underlayer

Do not replace prose with a full DSL yet.

Instead, add a compact structured underlayer that sits underneath each still spec and guides the prose.

Minimum fields per still:

1. `shotIntent`
2. `cameraDistance`
3. `framingMode`
4. `heroSubject`
5. `nicheCue`
6. `antiFallbackNote`
7. `locationFamily`

These fields should be generated alongside the existing still content and then reflected in the prose description.

The goal is not syntax purity.
The goal is to give lint-relevant semantics a stable home that is more explicit than freeform wording.

#### 3. Golden Reference Injection In Prompts

Update the still-generation prompt inputs so each slot receives:

1. the locked anchor
2. the slot contract
3. two winning reference examples from the same niche family / slot role
4. one toxic fallback example labeled as forbidden
5. the required shot-intent fields that must be satisfied

This is the main implementation for the phase.

It should be applied in:

1. `generateLandingStillBible`
2. `repairFailingStills`

The repair pass should reuse the same reference pack but only for the failing slots.

#### 4. Single Critic Pass Only If Needed

Do not introduce an open-ended generator-critic loop.

If reference injection alone does not clear the target failure class, add one constrained critic pass between still generation and deterministic lint.

That critic is allowed to do exactly one job:

1. score each still for generic fallback risk
2. score each still for niche legibility
3. score each still for role-readability
4. explain failures in terse structured fields

If used, the critic may trigger one whole-set editorial rewrite before deterministic lint.

It may not:

1. recurse
2. replace deterministic lint
3. create a second repair system
4. override anchor compliance

Critic status for this phase: optional, not required for the first implementation pass.

## Product Target

Desired workflow for this phase:

1. discovery selects a valid campaign
2. shared brief generation path builds the core campaign brief and anchors
3. system retrieves a niche-specific pre-shot reference pack for each slot
4. system generates stills using anchor plus slot contract plus reference pack plus shot-intent contract
5. deterministic diagnostics expose exactly which stills failed and why
6. subset repair, if applicable, reuses the same reference grounding for only the failing stills
7. approval and readiness remain governed by the same downstream media gate

## Non-Negotiable Constraints

1. do not add more validate/remediate/revise/retry buttons
2. do not create separate orchestration paths for UI and agent callers
3. do not deepen the issue-ledger workflow
4. do not build recursive repair loops
5. use native structured outputs for the primary generation path
6. keep deterministic lint as the final gate
7. keep the one-correction-pass rule for subset repair
8. do not weaken production-build lint thresholds to manufacture success
9. do not return to prompt-negation balancing as the main strategy
10. do not introduce a vector database in the first pass
11. do not replace the prose brief with a full DSL in this phase
12. do not let the critic become a second orchestration tree

## Scope Of Work

### Phase A: Add Reference Pack Infrastructure

Implement a small curated reference library for representative niches.

Minimum outputs:

1. reference-pack type definitions
2. static source file with initial packs for tabletop, stitch, and sketchbook
3. helper that maps campaign context plus slot role to the correct reference bundle

### Phase B: Inject References Into Still Generation

Wire the reference pack into `generateLandingStillBible`.

Minimum outputs:

1. prompt/context update that includes two winning examples and one toxic example
2. required shot-intent underlayer fields in the structured output
3. audit fields showing which reference pack or example IDs were used

Primary proving target:

1. `eastern-caribbean-stitch-sail-2026-09-19`

Reason:

1. stitch is currently the cleanest benchmark for generic fallback and weak niche signal
2. tabletop already improved enough that it is no longer the best architecture discriminator

### Phase C: Reuse References In Subset Repair

Wire the same grounding into `repairFailingStills`.

Minimum outputs:

1. failing stills receive the same niche-family reference discipline
2. repair prompt explicitly reuses slot contract plus reference pack plus failing issue codes
3. passing stills remain untouched

### Phase D: Decide Whether A Critic Pass Is Still Necessary

Only if Phase B and Phase C still leave the representative campaign failing on semantic quality classes, add one critic pass.

Primary trigger conditions:

1. `generic_fallback_overuse` remains the lead blocker after reference injection
2. `weak_niche_signal` remains the lead blocker after reference injection
3. the still text reads semantically generic even though anchor and slot contracts pass

If those conditions are not true, do not add the critic.

## Relevant Files

- `lib/campaigns/editors-room.ts`
- `lib/campaigns/brief-engine/orchestrator.ts`
- `lib/campaigns/schema.ts`
- `lib/campaigns/media/production-build-lint.ts`
- `tests/phase-2c-diagnostic-breakdown.ts`

Likely new files:

- `lib/campaigns/reference-packs.ts`
- `lib/campaigns/reference-pack-types.ts`

## Acceptance Criteria

The phase is complete only when all of the following are true:

1. UI and agent callers still share one underlying brief-step contract
2. native structured outputs remain in the main generation path
3. approval and readiness gate semantics remain unchanged
4. existing briefs cannot remain blocked solely because stale stored lint drifted from the current lint result
5. the new reference pack is used during still generation and subset repair
6. the structured still output includes the new shot-intent underlayer fields or an equivalent compact contract
7. the representative generic-fallback proving campaign improves without threshold weakening
8. diagnostic output can show, per still, anchor violations and lint diagnostics from the same generation pass
9. tabletop does not regress while this phase targets generic fallback and niche signal
10. the first implementation pass can improve stitch or another chosen proving campaign without introducing a second orchestration maze

## Verification

Add or update tests for:

1. reference packs resolve by niche family and slot role
2. still generation prompt inputs include the expected winning and toxic examples
3. shot-intent underlayer fields are present in generation output
4. existing approval block when `productionBuildStatus = fail` still holds
5. stale-lint resync behavior still holds
6. anchor diagnostics remain accurate for location drift and slot mismatches
7. isolated still revision only applies to true subset failures
8. representative diagnostics clearly show whether generic fallback and niche-signal counts improved

Likely verification commands:

- `npx tsx lib/campaigns/__tests__/brief-engine.validation.test.ts`
- `npx tsx lib/campaigns/__tests__/anchor-compliance.test.ts`
- `npx tsx lib/campaigns/__tests__/brief-engine.orchestrator.test.ts`
- `npx tsx lib/campaigns/__tests__/production-build-quality.test.ts`
- `npx tsx tests/phase-2c-diagnostic-breakdown.ts eastern-caribbean-stitch-sail-2026-09-19`
- `npx tsx tests/phase-2c-direct-library.ts`

## Next Agent Instructions

### Objective

Implement the first concrete reference-grounding pass inside the existing Editor's Room pipeline.

The immediate objective is to reduce generic fallback and improve niche legibility without changing approval semantics, lint thresholds, or orchestration topology.

### Do First

1. read the latest findings in `phase-result.md` before making changes
2. assume approval/readiness correctness and stale-state resync are already handled unless a new regression proves otherwise
3. read `work1.md` and `work2.md` for rationale, but implement the concrete plan from this file rather than reopening abstract brainstorming
4. run the diagnostic script on stitch before changing logic

Representative campaigns:

- `bp-tabletop-icon-2027-7n-caribbean`
- `deck-sketchbook-society-2026`
- `eastern-caribbean-stitch-sail-2026-09-19`

### Primary Implementation Target

Implement Golden Reference Injection first.

Specific target for the first pass:

1. add a small static reference pack mechanism
2. wire it into `generateLandingStillBible`
3. require the compact shot-intent underlayer in output
4. reuse the same mechanism in `repairFailingStills` if time allows

Likely primary file:

- `lib/campaigns/editors-room.ts`

Secondary files if required:

- `lib/campaigns/reference-packs.ts`
- `lib/campaigns/reference-pack-types.ts`
- `lib/campaigns/schema.ts`
- `lib/campaigns/brief-engine/orchestrator.ts`
- targeted tests

### Do Not Do

1. do not weaken production-build lint thresholds just to improve pass rate
2. do not reopen approval semantics or stale-state resync unless a failing regression proves it is broken
3. do not treat fixture-only test success as sufficient evidence
4. do not add button-maze remediation logic or new operator workflows
5. do not return to the negation-balancing loop
6. do not build a vector store first
7. do not replace the entire still contract with a full DSL in this pass
8. do not add a critic pass unless reference grounding has already been tested and proved insufficient
9. do not regress campaigns that currently pass or partially pass

### Required Proof For Completion

Minimum proof:

1. rerun representative diagnostics after the code change
2. show before and after generic fallback counts for the proving campaign
3. show before and after niche-cue counts for the proving campaign
4. state whether reference grounding changed role coverage incidentally or not at all
5. state explicitly whether isolated-still revision was used, skipped, or not applicable
6. if the primary blocker changes, name the new blocker class exactly

### Required `phase-result.md` Update

Update `phase-result.md` as part of the work and add a new section containing:

- the exact proving-campaign blocker profile before the pass
- the reference-pack mechanism added in this phase
- what fields were added to the shot-intent underlayer
- whether the initial pass used only reference grounding or also used a critic
- before and after generic fallback counts
- before and after niche-legibility counts
- whether tabletop regressed, stayed stable, or improved incidentally
- whether sketchbook changed if rerun
- exact commands used for diagnostics, reruns, and verification