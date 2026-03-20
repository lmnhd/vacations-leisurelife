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

Primary targets:

- stronger niche signal in the still set
- higher campaign identity legibility
- better still-role coverage
- less composition repetition
- stronger translation from brief intent into `productionBible.avoidDirectives`, scene design, and still prompts

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

### Phase 3: Collapse The Route Surface

Reduce the public route surface so the happy path no longer depends on chained operator endpoints.

Preferred route categories:

- fetch brief-step state
- generate or regenerate brief step
- approve brief step

Agent API requirement for this phase:

- each retained route must be usable directly by an agent caller without requiring hidden UI context
- request and response contracts must be documented clearly enough for scripted use
- if a separate agent-facing endpoint is introduced, it must still call the same underlying orchestration service

Current likely deprecation or shim targets:

- `/media/aesthetic/validate`
- `/media/aesthetic/remediate`
- `/media/aesthetic/revise`
- `/media/aesthetic/trinity`
- `/media/aesthetic/red-team`

### Phase 4: Build The Replacement UI Step

Create a coherent page between Discovery and Media Generation.

The page must:

- present one generation action
- show clear readiness state
- show blockers clearly when generation stops
- avoid surfacing remediation internals as a control panel

The page must not introduce UI-only logic that diverges from what the agent API sees or does.

### Phase 5: Compatibility Cleanup

Make an explicit decision on legacy compatibility:

- shim old routes temporarily
- remove them immediately
- or add a limited adapter layer during migration

Document the choice before cleanup.

## File Investigation Checklist

Inspect these before coding:

- `lib/campaigns/aesthetic-engine.ts`
- `lib/campaigns/brief-engine/orchestrator.ts`
- `lib/campaigns/brief-engine/validation.ts`
- any helper that owns production-build recomputation or state resync
- `lib/campaigns/aesthetic-validation-orchestrator.ts`
- `lib/campaigns/aesthetic-revision.ts`
- `lib/campaigns/aesthetic-red-team.ts`
- `lib/campaigns/media/media-orchestrator.ts`
- `lib/campaigns/media/production-build-lint.ts`
- `lib/campaigns/schema.ts`
- `app/api/groups/campaign/[slug]/...`
- current aesthetic test pages and any page between discovery/media flow

## Acceptance Criteria

The phase is complete only when all of the following are true:

1. UI and agent callers share one underlying brief-step contract.
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

## Next Implementation And Process Steps

1. Reproduce the stale-state bug with at least one known campaign and record:
	- stored `productionBuildStatus`
	- stored blocking issue codes
	- recomputed lint verdict and issue codes from the same saved `landingStillBible`
2. Add one shared recomputation helper in the brief-engine path so there is exactly one source of truth for gate-time production-build evaluation.
3. Update `getReadiness()` and `approveForMedia()` to use that shared recomputation path and resync stale persisted lint state when drift is detected.
4. Add a regression test proving an old stored `fail` cannot keep a campaign blocked when the same saved still set now evaluates to `warn` or `pass`.
5. Only after stale-state drift is fixed, continue evaluating remaining blocked campaigns as genuine production-planning quality failures.
6. For the quality pass, compare representative campaigns before and after generation changes and separate:
	- stale-state false blocks
	- real generator-quality failures
7. In `phase-result.md`, report stale-state findings separately from generation-quality findings so verification does not conflate the two.
8. Update `phase-result.md` as part of the work, not as an afterthought. Record the current phase progress, including:
	- whether stale stored `productionBuildStatus` / `productionBuildLint` drift was reproduced
	- what shared recompute or resync path was added
	- which routes or shared service methods now use the recomputed result
	- whether representative blocked campaigns were false blocks or true quality failures under fresh lint recomputation
	- exact verification commands and campaign checks used to prove the result

## Handoff Output Requirement

When done, write a `phase-result.md` file at the repo root containing:

- what changed
- which old routes were removed or shimmed
- the final shared contract
- explicit progress on stale-state drift handling vs generation-quality improvements
- whether any previously blocked campaigns were cleared by recomputation/resync alone
- residual risks
- exact verification commands run