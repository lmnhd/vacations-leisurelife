# Pass 1 Schema Task Guide

## Purpose

Stabilize Pass 1 brief generation so the worker can complete `generate_brief` without falling into long schema-repair and timeout loops.

This task is now the top workflow priority because queued jobs are already being consumed successfully.

---

## Verified Current State

Live worker-backed runs have already established the following:

1. brief jobs enqueue successfully
2. polling works
3. the worker now claims queued jobs and moves them to `running`
4. both `drift-festival-icon-2026` and `bp-opendeck-icon-2027-7n-caribbean` fail inside `generate_brief`
5. the visible terminal error is `[aesthetic-engine:pass1-timeout] Attempt 1 ... exceeded 90s`
6. worker logs show schema-repair failures before timeout churn finishes

This means the current blocker is no longer queue execution. It is the Pass 1 generation contract itself.

---

## Failure Families Already Confirmed

The current failures are concentrated in a small set of nested required branches:

1. `visual.colorPalette`
2. `visual.typographyDirection`
3. `messaging`
4. `merch.coreItem`
5. `merch.practicalItem`
6. `merch.nicheSpecificItems`

Observed failure shapes:

1. required nested branches omitted entirely
2. nested object keys omitted inside otherwise present branches
3. object-array fields returned as string arrays
4. repair attempts repeat until the per-attempt timeout is hit

---

## Primary Files

Generation entry point:

1. `lib/campaigns/aesthetic-engine.ts`

Persisted schema source:

1. `lib/campaigns/schema.ts`

Structured-output and repair loop:

1. `lib/chat/llm-call.ts`

---

## Root Cause Direction

The likely root cause matches the existing workspace pattern already captured in `patterns.md` and the findings in `.github/WORK2.txt`:

1. Pass 1 is still using a large nested schema derived from the full campaign brief shape
2. strict structured output is brittle when the live schema contains deep nesting plus fallback-oriented defaults or optional branches
3. the model omits branches, repair is attempted, repair still fails, and the attempt burns most of the wall-clock budget

The fix should target the generation-time schema, not campaign-specific prompt polish.

---

## Required Changes

### 1. Separate generation-time schema from persisted schema

Do not use the persisted campaign brief schema as the Pass 1 contract with only an `omit(...)` wrapper.

Instead:

1. define a dedicated Pass 1 generation schema for only the fields the model must return in the first call
2. keep that schema flatter and more explicit than the persisted brief schema
3. treat the persisted full schema as the post-normalization destination, not the direct LLM contract

### 2. Remove fallback-oriented complexity from the live Pass 1 contract

For the schema sent to the model:

1. avoid nested `.default()` behavior as a generation crutch
2. avoid `.optional()` on fields that are actually required for a valid Pass 1 result
3. move fallback population into TypeScript normalization after the model returns

### 3. Make object-array expectations impossible to misread

For `merch.nicheSpecificItems` and similar fields:

1. keep the array item shape explicit
2. use descriptions that state it must be an array of objects, not strings
3. ensure repair prompts reinforce the same contract

### 4. Normalize after validation, not inside the live contract

The existing normalization path in `lib/campaigns/aesthetic-engine.ts` is the right direction.

Extend that approach so:

1. missing fallback values are injected after a valid minimal Pass 1 object is produced
2. normalization upgrades the result into the richer internal brief shape
3. normalization does not mask fundamentally invalid raw model output

### 5. Keep Pass 1 bounded while changes are landing

While adjusting the schema:

1. preserve the current per-attempt timeout guard
2. keep attempt-level timing hooks intact
3. avoid adding new retry loops until the schema contract is simpler

---

## Non-Goals

This task should not drift into:

1. music/festival prompt tuning
2. Brief Studio UX redesign
3. route/worker transport changes
4. campaign-specific aesthetic polish

Those are downstream tasks once Pass 1 returns valid structured output reliably.

---

## Acceptance Criteria

This task is complete only when all of the following are true:

1. Pass 1 returns a valid structured object without repeated schema-repair spirals on the control campaign
2. `drift-festival-icon-2026` can complete `generate_brief` through the worker-backed flow inside bounded runtime
3. nested missing-branch failures no longer dominate the logs for `visual`, `messaging`, and `merch`
4. `merch.nicheSpecificItems` no longer flips between object-array schema and string-array output
5. fallback/default population happens in TypeScript normalization rather than relying on the structured-output schema to infer it

---

## Suggested Execution Order

1. define a dedicated Pass 1 schema in `lib/campaigns/aesthetic-engine.ts` or alongside it
2. copy only the first-pass fields that are genuinely needed before Pass 2 and refinement
3. flatten the most failure-prone nested sections where practical
4. shift fallback population into normalization helpers
5. keep the persisted full brief shape unchanged unless a clean separation requires a narrow supporting refactor
6. rerun the control campaign after the schema contract is simplified

---

## Done Signal

If the worker reaches a terminal result for `drift-festival-icon-2026` without a Pass 1 timeout and without large schema-repair churn, this task has likely removed the current primary blocker.