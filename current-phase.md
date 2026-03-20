# Current Phase: Replace The Brief-Generation Maze With One Coherent Step

## Mission

Implement a replacement brief-generation step that sits between Discovery and Media Generation.

This replacement must preserve the final quality bar for campaign briefs, production bible output, landing still output, and media-readiness gating.

It must **not** preserve the current operator-heavy remediation maze.

## Non-Negotiable Constraints

1. Do not add more validate/remediate/revise/retry buttons.
2. Do not create separate orchestration paths for UI and agent callers.
3. Do not deepen the issue-ledger workflow.
4. Do not build recursive repair loops.
5. Use native structured outputs for the primary generation path.
6. Enforce a strict one-strike correction rule only.
7. Keep the implementation fast, explicit, and product-oriented.
8. Keep the process fully compatible with the agent API as a first-class caller, not as an afterthought or debug-only adapter.

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

## Hard Rules To Preserve

Preserve these deterministic gates from the current system:

- launch-window compliance
- hero slogan max 6 words
- explicit optionality language
- merch core item must be T-shirt first
- production artifacts must exist
- forbidden camera move prohibition
- cabin contradiction prohibition
- gangway choreography prohibition
- storyboard duration alignment
- required passenger-area safety sentence

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
- `lib/campaigns/aesthetic-validation-orchestrator.ts`
- `lib/campaigns/aesthetic-revision.ts`
- `lib/campaigns/aesthetic-red-team.ts`
- `lib/campaigns/media/media-orchestrator.ts`
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

## Verification

Add or update tests for:

1. valid campaign generates a passing brief bundle in one flow
2. one hard-rule failure triggers one corrective reprompt
3. second failure returns blockers and stops
4. approval cannot proceed when blockers remain
5. any retained legacy route behavior is intentionally covered
6. agent API invocation reaches the same orchestration path and returns the same readiness semantics as the UI path

Likely verification commands:

- `npx tsx lib/campaigns/__tests__/brief-engine.validation.test.ts`
- focused tests added for the new brief-step flow
- one representative end-to-end brief-step test

## Handoff Output Requirement

When done, write a `phase-result.md` file at the repo root containing:

- what changed
- which old routes were removed or shimmed
- the final shared contract
- residual risks
- exact verification commands run