# Current Phase: Replace The Brief-Generation Maze With One Coherent Step

## Mission

Implement a replacement brief-generation step that sits between Discovery and Media Generation.

This replacement must preserve the final quality bar for campaign briefs, production bible output, landing still output, and media-readiness gating.

It must **not** preserve the current operator-heavy remediation maze.

## Critical Bug Confirmed In This Phase

The current implementation has a confirmed gating bug:

- campaigns can be approved even when `productionBuildStatus = fail`
- approved campaigns can report `ready_for_media` even when production-build lint has already failed
- downstream media generation then blocks correctly, which means upstream readiness and downstream spend gating disagree

This bug has already been reproduced across multiple campaigns and must be treated as in-scope for this phase.

Confirmed pattern:

- structural brief validation passes
- production build lint fails
- `approveForMedia()` still succeeds
- `getReadiness()` still returns `ready_for_media`

That state is invalid and must be eliminated.

## Status Update: Approval Gate Bug Is Now Fixed

The production-build approval/readiness mismatch has now been fixed.

That means the next active problem is no longer the approval gate itself.
The next confirmed bottleneck is production-planning quality:

- `productionBible` strength
- `landingStillBible` strength
- production-build lint failure rate

Observed pattern after the gate fix:

- structural brief validation often passes
- approval is now correctly blocked when `productionBuildStatus = fail`
- many campaigns still fail production-build lint because the generated visual-planning bundle is too weak

So the next phase must focus on improving the production-planning bundle, not on reopening approval semantics.

## Status Update: Stored Production-Build Lint Can Be Stale

There is now a second confirmed correctness issue that must be handled before treating remaining failed campaigns as pure generator-quality misses.

Confirmed pattern:

- a stored brief still carries `productionBuildStatus = fail`
- the saved `productionBuildLint` report still contains old blocking issue codes
- recomputing lint against the same saved `landingStillBible` under current rules yields `warn` or otherwise clears blockers
- readiness and approval still trust the stale persisted fail state and keep the campaign blocked

This means some campaigns can now be falsely blocked by drift between:

- the current lint implementation
- the saved `productionBuildLint` snapshot
- the saved `productionBuildStatus`

The next implementation pass must eliminate this stale-state mismatch.

Do not assume every remaining blocked campaign is evidence that prompt quality is still too weak.
First prove that the block survives fresh lint recomputation.

## Status Update: Phase 2A Is Complete

Phase 2A has now been completed.

Confirmed outcome:

- gate-time production-build lint is recomputed from the saved still set
- stale stored `productionBuildStatus` and `productionBuildLint` can be resynced
- readiness and approval no longer rely only on stale persisted fail state
- at least one representative campaign was confirmed to be a false block cleared by recomputation logic

That means the next active implementation target is now fully Phase 2B:

- improve fresh production-planning output quality
- reduce production-build blocker frequency on newly generated campaigns
- specifically reduce `weak_niche_signal`, identity-legibility misses, and still-role coverage failures

Do not spend the next pass reopening the stale-state fix unless a new regression is found.

## Status Update: Phase 2B Implementation Is Complete

The Phase 2B prompt and generation changes have now been implemented.

Confirmed implementation status:

- contradictory niche-suppression guidance was removed from the authoritative system prompt
- `buildLintComplianceBlock(...)` now accepts campaign-specific belonging signals and supplies scanner-recognizable niche vocabulary
- a dedicated `LANDING STILL NICHE COMPLIANCE` system-prompt section now states the machine-enforced blocker rule and per-still workflow
- a dedicated `LANDING STILL ROLE SCAFFOLD` system-prompt section now enforces slot order and role distribution during generation
- regression suites continue to pass after these changes

That means the remaining open work in this phase is no longer implementation-first.
The remaining open work is verification-first:

- prove AC 12 on fresh campaign generations
- measure whether production-build blocker frequency actually improved on real outputs
- record before/after results in `phase-result.md`

Do not spend the next pass inventing more prompt changes unless live verification shows the current implementation still fails materially.

## Status Update: Step 3 Verification Shows Material Improvement

Fresh live verification has now shown a strong improvement on the representative three-campaign sample.

Confirmed latest outcome:

- structural blockers: `0` across the full sample
- production-build blockers: reduced to `2` total
- campaigns reaching `ready_for_media`: `2/3`
- both passing campaigns were approved successfully through the shared contract

This means the current prompt and orchestration changes are producing real quality gains on fresh outputs.
The remaining open issue is now narrow rather than systemic:

- `deck-sketchbook-society-2026` still fails with `weak_niche_signal` and `identity_legibility_too_low`

The next pass, if any, should be targeted and evidence-driven:

- do not reopen structural validation or stale-state work
- do not rewrite the whole prompt system again
- focus only on campaign archetypes that still under-express niche identity in live output
- keep using the same representative live sample when measuring further changes

## Status Update: Phase 2C Is The Execution Target

The next pass is now a targeted execution pass, not another broad verification cycle.

Confirmed remaining pattern from the latest live sample and follow-up review:

- the remaining failure is concentrated in art/creative campaign archetypes
- the issue is not broad structural failure and not stale-state drift
- the key problem is generic composition-family clustering that weakens campaign identity even when some niche vocabulary is present

Execution focus for the next agent:

- break generic cruise fallback patterns in still generation
- make niche-specific actions and interactions carry the scene
- preserve the current `2/3` live success rate while pushing the remaining representative campaign over the line

Treat this as Phase 2C: a narrow generator-quality correction for the remaining archetype, not a rewrite of the overall system.

## Non-Negotiable Constraints

1. Do not add more validate/remediate/revise/retry buttons.
2. Do not create separate orchestration paths for UI and agent callers.
3. Do not deepen the issue-ledger workflow.
4. Do not build recursive repair loops.
5. Use native structured outputs for the primary generation path.
6. Enforce a strict one-strike correction rule only.
7. Keep the implementation fast, explicit, and product-oriented.
8. Keep the process fully compatible with the agent API as a first-class caller, not as an afterthought or debug-only adapter.
9. Approval and readiness must enforce the same production-build gating semantics as downstream media generation.
10. Do not regress the fixed production-build approval gate while improving production-planning quality.
11. Do not let readiness or approval trust stale persisted production-build status when the current saved still set now evaluates differently under the active lint rules.

## Product Target

Desired workflow:

1. Discovery selects a valid campaign.
2. User or agent API client triggers one brief-generation action.
3. System generates the full brief bundle in one structured pass.
4. Hard deterministic checks run immediately.
5. If the result fails, the system gets one automated corrective reprompt.
6. If it fails again, the system stops and returns clear blockers.
7. If it passes, the campaign moves to review or approval through one clear readiness state.

Agent API compatibility requirement:

- the same orchestration contract must be callable by both the UI flow and agent-driven automation
- the agent API must be suitable for rapid iteration, troubleshooting, and scripted testing
- the agent API must not rely on UI-only state or button sequencing
- the UI must be treated as one client of the shared contract, not the source of truth

## Required Outcome

The replacement must produce or preserve:

- CampaignAestheticBrief
- productionBible
- landingStillBible
- a single trustworthy readiness signal for downstream media generation

That readiness signal must include production-build lint outcome and must not mark a campaign media-ready when spend-gated media generation would still reject it.

The immediate product objective inside that constraint is to raise the pass rate of the production-planning bundle so valid campaigns can actually clear the restored gate.

## Hard Rules To Preserve

Preserve these deterministic gates from the current system:

- launch-window compliance
- hero slogan max 6 words
- explicit optionality language
- merch core item must be T-shirt first
- production artifacts must exist
- production-build lint must not be failed at approval time or media-ready time
- forbidden camera move prohibition
- cabin contradiction prohibition
- gangway choreography prohibition
- storyboard duration alignment
- required passenger-area safety sentence

Preserve the fixed gate and improve the inputs that feed it.
The goal is not to weaken lint or bypass it.

## Scope Of Work

### Phase 1: Lock The New Contract

Write a short design note that defines:

- the new shared service entry point
- the reduced route surface
- the agent API shape over that same shared contract
- the readiness states
- whether approval remains human-driven or becomes a simpler terminal action
- whether productionBible and landingStillBible are generated in the same pass or via tightly bounded follow-on generation inside the same orchestration call

Deliverable:

- a short design note in the repo under `.github/` or `.github/DOCS/`

### Phase 2: Implement One Shared Orchestration Entry Point

Build one service contract used by both UI and agent callers.

Minimum inputs:

- campaign slug
- optional generation instructions
- caller-safe request shape for agent-driven invocation without UI session assumptions

Minimum outputs:

- brief bundle
- readiness state
- pass/fail gate result
- blocker list if generation fails
- whether the one corrective reprompt was used
- response shape stable enough for automation and repeatable agent testing

Likely code areas:

- `lib/campaigns/brief-engine/`
- `lib/campaigns/aesthetic-engine.ts`
- `lib/campaigns/schema.ts`

Mandatory fix inside this phase:

- update brief approval logic so `productionBuildStatus = fail` blocks approval
- update readiness logic so approved briefs with failed production build do **not** return `ready_for_media`
- align brief-step readiness semantics with the spend-gated checks already enforced in `lib/campaigns/media/media-orchestrator.ts`

This is not optional cleanup. It is a confirmed correctness bug.

### Phase 2A: Eliminate Stale Production-Build Status Drift

Before interpreting remaining failures as generation-quality problems, remove false blocks caused by stale stored lint results.

Primary targets:

- one shared way to recompute production-build lint from the current saved `landingStillBible`
- readiness and approval semantics that cannot be trapped by an outdated `productionBuildStatus`
- a clear persistence decision: either recompute on every gate check, or recompute and resave whenever gate checks or fetches detect drift
- safe handling for existing briefs created before the latest lint and prompt changes

Minimum implementation expectations:

- create or use one shared helper that derives the current production-build lint report from the saved brief data
- ensure `getReadiness()` and `approveForMedia()` rely on current lint semantics, not only on stale stored fields
- if drift is detected, resync `productionBuildLint` and `productionBuildStatus` to the recomputed result in one explicit place
- add a targeted backfill or on-read repair path for older briefs that still carry obsolete fail states

Important constraints:

- do not weaken the gate
- do not bypass lint to get campaigns approved
- do not duplicate lint logic across multiple call sites
- do not treat this as a UI bug; the fix belongs in the shared orchestration/service path

### Phase 2B: Improve Production-Planning Bundle Quality

After stale-state drift is eliminated, the next required work is to improve the generated production-planning bundle so campaigns stop failing production-build lint for real content reasons.

Baseline measured status from the pre-improvement fresh runs:

- structural blockers across the current 3-campaign sample: `0`
- production-build blockers across the same sample: `5`
- fresh campaigns reaching `ready_for_media`: `0/3`
- dominant blocker pattern: `weak_niche_signal`
- recurring secondary patterns: identity-legibility misses and still-role coverage gaps

This means the current bottleneck is now clearly the still-generation layer, not structural brief formation and not stale stored gate state.

Implementation status update:

- the main Phase 2B prompt changes are now in place
- fixture and regression coverage pass
- live campaign verification showed material improvement
- one remaining archetype still needs targeted Phase 2C correction

Primary targets:

- stronger niche signal in the still set
- higher campaign identity legibility
- better still-role coverage
- less composition repetition
- stronger translation from brief intent into `productionBible.avoidDirectives`, scene design, and still prompts
- stronger niche-specific action so scenes are built around community behavior rather than generic cruise poses
- lower reuse of generic composition families such as rail-couple and wide-deck fallback patterns

This work should focus on the generation layer that produces:

- `productionBible`
- `landingStillBible`
- `productionBuildLint`

Likely implementation areas for this sub-phase:

- `lib/campaigns/brief-engine/orchestrator.ts`
- shared helpers that compute or resync production-build lint state
- `lib/campaigns/aesthetic-engine.ts`
- any visual-planning generation helpers used to create `productionBible` and `landingStillBible`
- `lib/campaigns/media/production-build-lint*`

Important constraint:

- improve generator quality first
- do **not** relax the lint thresholds just to make the tests pass unless there is a separately justified false-positive case
- success must be demonstrated on fresh campaign generations, not only fixture-level tests
- do **not** regress the two representative campaigns that now pass

### Phase 3: Collapse The Route Surface

Reduce the public route surface so the happy path no longer depends on chained operator endpoints.

Preferred route categories:

- fetch brief-step state
- generate or regenerate brief step

Phase 3 route-surface cleanup is not the active execution target in this pass.

Agent API requirement for this phase:

- keep using the same shared orchestration path and route surface for regeneration and readiness checks
- do not introduce a special-case verification or agent-only generation path

### Primary Execution Target

Make a focused prompt/generation update in the visual-planning path, then regenerate the representative sample through the shared brief-step flow and measure:

- structural blocker count
- production-build blocker count
- ready-for-media rate
- blocker-code frequency, especially:
	- `weak_niche_signal`
	- `identity_legibility_too_low`
	- `repeated_composition_family`

Use the existing shared route or orchestration flow. Do not create a special execution path.

### Code Changes Are In Scope

Live verification has already shown broad improvement. Code changes are now justified, but only in a narrow area:

- `lib/campaigns/aesthetic-engine.ts`
- tightly related visual-planning helpers if required
- production-build quality regression tests if new focused coverage is warranted

Do not turn this into broader route cleanup, UI work, or orchestration redesign.

4. Do not claim the targeted fix works solely from prompt edits or fixture tests.
5. Do not skip before/after comparison against both the recorded baseline and the current `2/3` success sample.
## File Investigation Checklist

Inspect these before coding:
The next agent must show fresh-run improvement, not only code inspection.
- `lib/campaigns/aesthetic-engine.ts`
- `lib/campaigns/brief-engine/orchestrator.ts`
- `lib/campaigns/brief-engine/validation.ts`
- any helper that owns production-build recomputation or state resync
- `lib/campaigns/aesthetic-validation-orchestrator.ts`
- `lib/campaigns/aesthetic-revision.ts`
- `lib/campaigns/aesthetic-red-team.ts`
5. State explicitly whether AC 12 is satisfied or still open.
- `lib/campaigns/media/media-orchestrator.ts`
- `lib/campaigns/media/production-build-lint.ts`
- `lib/campaigns/schema.ts`
- `app/api/groups/campaign/[slug]/...`
- current aesthetic test pages and any page between discovery/media flow
- that the current pass was live verification of the already-implemented Phase 2B changes
## Acceptance Criteria

The phase is complete only when all of the following are true:

1. UI and agent callers share one underlying brief-step contract.

If the targeted rerun clears the remaining representative failure without regressing the two current successes, mark AC 12 as satisfied.
If the rerun still fails, describe the remaining blocker patterns precisely and keep the next change tightly scoped to those patterns.
2. The happy path no longer requires validate/remediate/revise loop choreography.
3. Native structured outputs are used in the main generation path.
4. Failure handling uses one corrective reprompt at most, then stops.
5. Downstream media generation reads one reliable readiness signal.
6. The old button-maze flow is removed, hidden, or clearly deprecated.
7. The agent API can execute the same process directly with no UI dependency.
8. A campaign with `productionBuildStatus = fail` cannot be approved.
9. A campaign with `productionBuildStatus = fail` cannot report `ready_for_media`.
10. Brief-step approval/readiness semantics match downstream spend-gated media checks.
11. Existing briefs cannot remain blocked solely because stale stored `productionBuildStatus` or `productionBuildLint` drifted from the current lint result for the same saved still set.
12. Newly generated campaigns show materially improved production-build lint performance.
13. The main recurring lint failures are reduced, especially weak niche signal and identity-legibility failures.

## Verification

Add or update tests for:

1. valid campaign generates a passing brief bundle in one flow
2. one hard-rule failure triggers one corrective reprompt
3. second failure returns blockers and stops
4. approval cannot proceed when blockers remain
5. any retained legacy route behavior is intentionally covered
6. agent API invocation reaches the same orchestration path and returns the same readiness semantics as the UI path
7. approval is blocked when `productionBuildStatus = fail`
8. readiness is downgraded from `ready_for_media` when `productionBuildStatus = fail`
9. parity test: brief-step gating matches the spend-gated branch in `media-orchestrator`
10. stale-lint regression: a brief with stored `productionBuildStatus = fail` but recomputed current lint of `warn` or `pass` is resynced and no longer falsely blocked
11. representative campaigns show improved production-build lint outcomes after production-planning generation changes
12. repeated failures such as `weak_niche_signal`, `identity_legibility_too_low`, and still-role coverage gaps are explicitly tested where practical

Likely verification commands:

- `npx tsx lib/campaigns/__tests__/brief-engine.validation.test.ts`
- focused tests added for the new brief-step flow
- one representative end-to-end brief-step test
- targeted regression covering approved brief + failed production build
- targeted regression covering stale stored fail status vs recomputed current lint
- targeted production-build quality regression tests against representative campaigns or fixtures

## Next Agent Instructions

The next agent should treat Phase 2A and Phase 2B as complete and execute only the targeted Phase 2C production-quality pass.

### Objective

Improve fresh `landingStillBible` and related visual-planning output so the remaining art/creative campaign archetype stops failing production-build lint for content reasons.

### Do First

1. Read the latest findings in `phase-result.md` before making changes.
2. Assume stale-state false blocks are already handled unless a new regression is discovered.
3. Use the current fresh-run sample as the baseline quality benchmark:
	- `bp-tabletop-icon-2027`
	- `deck-sketchbook-society`
	- `eastern-caribbean-stitch-sail-2026-09-19`
	- current verified status: `0` structural blockers, `2` production-build blockers, `2/3` ready for media

### Primary Implementation Target

Concentrate on prompt and generation quality in the visual-planning path, especially:

- explicit niche cues in `imagePrompt` and `subjectAction`
- campaign identity legibility across multiple stills, not just one
- stronger role distribution across hero, editorial/concept, and intimate coverage
- less generic fallback composition reuse
- stronger mapping from brief identity into still-level scene/action wording
- replacing generic rail/deck fallback scenes with niche-specific actions and interaction patterns
- breaking composition-family clustering in art/creative campaigns

Likely primary file:

- `lib/campaigns/aesthetic-engine.ts`

Secondary files only if required:

- tightly related visual-planning helpers
- tests for production-build quality regressions

### Do Not Do

1. Do not weaken production-build lint thresholds just to improve pass rate.
2. Do not reopen approval semantics or stale-state resync unless a new failing regression proves it is broken.
3. Do not treat fixture-only test success as sufficient evidence.
4. Do not add button-maze remediation logic or new operator workflows.
5. Do not broaden this into a whole-system prompt rewrite.
6. Do not regress the two representative campaigns that currently pass.

### Required Proof For Completion

The next agent must show fresh-run improvement, not only code inspection.

Minimum proof:

1. Regenerate representative campaigns after the prompt/generation changes.
2. Record structural blockers, production-build blockers, and ready-for-media rate before and after.
3. Show whether blocker frequency improves on the same representative sample.
4. Call out which blocker codes were reduced and which persisted.
5. State explicitly whether `deck-sketchbook-society-2026` still fails and whether the two currently passing campaigns stayed green.

### Required `phase-result.md` Update

Update `phase-result.md` as part of the work and add a new Phase 2C progress section containing:

- what prompt or generation changes were made
- which representative campaigns were rerun
- before/after blocker counts for the sample
- whether `weak_niche_signal`, identity-legibility failures, and role-coverage failures improved
- whether generic composition-family clustering was reduced
- residual production-build blocker patterns that still remain
- exact commands used for reruns and verification

## Handoff Output Requirement

When done, write a `phase-result.md` file at the repo root containing:

- what changed
- which old routes were removed or shimmed
- the final shared contract
- explicit progress on stale-state drift handling vs generation-quality improvements
- whether any previously blocked campaigns were cleared by recomputation/resync alone
- residual risks
- exact verification commands run