# Week 2 Workflow Issues

## Purpose

This document isolates workflow, transport, orchestration, and schema/runtime problems from campaign-quality problems.

These issues must be treated as system reliability work, not prompt-tuning work.

---

## Current Status

The worker-backed brief flow has now been validated far enough to separate solved transport problems from active execution problems.

Verified current state:

1. the brief route now enqueues work and returns quickly
2. Brief Studio polls job status instead of waiting on one long request
3. queued jobs are now being consumed by the worker
4. live worker-backed jobs reach `generate_brief`
5. the active failure now happens inside Pass 1

The remaining workflow blockers are:

1. Pass 1 schema brittleness still causes structured-output repair churn and `pass1-timeout`
2. worker failure diagnostics must remain durable and route-readable under failure

This means campaign tuning is still downstream. The system first needs stable Pass 1 generation and truthful failure observability.

---

## Workflow Issue 1: Pass 1 is consuming the wall-clock budget

### Evidence

Additional timing hooks were added so the route can expose partial timing snapshots on timeout.

The result from both live runs was still:

1. `passLabel: initial`
2. `totalElapsedMs: null`
3. `stages: []`

That rules out anchor generation, still generation, repair, and production-bible work as the first bottleneck.

### Meaning

The stall is inside the earliest aesthetic generation path, before the first completed pass-level timing callback fires.

In practical terms, the system is likely burning time inside Pass 1 itself through one or more of these:

1. structured output latency
2. schema-invalid output and retry overhead
3. fallback model churn
4. very large response generation with repeated repair loops

### Required Fix

1. Instrument Pass 1 at the attempt level, not only the pass level.
2. Record per-attempt duration, model used, finish reason, validation outcome, and fallback transitions.
3. Cap total Pass 1 time independently from the overall route budget.

### Acceptance Criteria

1. Logs show where Pass 1 time is spent.
2. A single failed attempt cannot silently consume most of the request lifetime.
3. The team can answer whether the bottleneck is provider latency, schema failure, or retry churn.

---

## Workflow Issue 2: Structured schema/runtime mismatch is causing retry spirals

### Evidence

Existing analysis in `.github/WORK2.txt` shows repeated schema failures caused by omitted nested fields and incorrect array shapes.

Observed failure patterns include:

1. large required nested sections omitted entirely
2. array-of-object fields returned as string arrays
3. repair and fallback loops cascading into route-level timeout

Concrete failing families already called out in `WORK2.txt` include:

1. `visual.colorPalette` missing nested keys such as secondary, accent, and background
2. `visual.typographyDirection` missing nested keys such as headlineStyle and suggestedFonts
3. `messaging` missing required fields such as heroSlogan, ctaVariants, and toneKeywords
4. `merch.coreItem` and `merch.practicalItem` missing required product and prompt fields
5. `merch.nicheSpecificItems` returned as strings when the schema expects objects

### Meaning

This is not a campaign-briefing problem. It is a structured-output contract problem between the runtime schema and the model.

### Required Fix

1. Flatten the schema used for live model generation.
2. Remove generation-time reliance on nested defaults and optional fallbacks where they weaken strict structured output.
3. Normalize missing fallback behavior after generation in TypeScript instead of expecting the model to honor nested defaults correctly.
4. Make object-array expectations explicit in the schema descriptions for known failure fields.
5. Audit the pass-1 schema for `.default()` and `.optional()` usage that should be moved out of the live model contract.
6. Treat post-generation normalization as the place for fallback population, not the structured-output schema itself.

### Acceptance Criteria

1. Pass 1 returns valid structured payloads without repeated repair churn.
2. Missing nested branches stop dominating validation failures.
3. Retry volume drops enough that the route or worker remains bounded.

---

## Workflow Issue 3: Failure diagnostics must survive the worker boundary

### Evidence

The worker can now execute jobs, and the job record can now persist `failureDiagnostics` durably.

That closes the earlier process-local observability gap where the route and worker could disagree about failure state.

The remaining requirement is runtime confirmation that the persisted diagnostics exposed to polling match the real worker-visible failure details.

### Meaning

The issue is no longer architectural uncertainty about where diagnostics should live.

The issue is making sure the worker-backed failure payload remains truthful, durable, and useful enough to prevent blind paid reruns.

### Required Fix

1. keep worker failure diagnostics attached to the durable job record
2. verify that polling surfaces the stored diagnostics instead of route-local memory
3. confirm failed-job detail is still readable after refresh or reconnect

### Acceptance Criteria

1. a failed worker-backed job returns non-null `failureDiagnostics`
2. the diagnostics reflect the same failure context seen by the worker
3. the UI can inspect the latest failure without reopening worker logs

---

## Workflow Issue 4: Brief Studio job UX needs live verification and polish, not a ground-up redesign

### Evidence

Brief Studio now appears to:

1. enqueue regeneration through POST
2. poll job state through GET
3. render active job steps and failed-job diagnostics

### Meaning

The core client-side architectural shift has already happened.

The remaining concern is whether the job UX is robust in real use:

1. does polling stay reliable through real worker failures
2. are terminal states clear enough
3. is recovery obvious after failed or blocked jobs

### Required Fix

1. Verify the polling flow against real regeneration runs.
2. Confirm that queued, running, failed, blocked, and completed states are understandable in the UI.
3. Refine recovery behavior only where the live reruns expose gaps.

### Acceptance Criteria

1. Users can leave and return without losing job visibility.
2. Regeneration status is observable without relying on an open tab.
3. Paid generation actions are bounded and inspectable.

---

## Workflow Issue 5: Execution should remain on the headless worker path

### Evidence

`WORK2.txt` explicitly recommends keeping long-running generation loops inside the direct TypeScript/Node worker path instead of the Next.js API route.

This is now implemented:

1. POST enqueues work via the agent runner
2. GET returns job state
3. Brief Studio polls that state and renders failure diagnostics

### Meaning

This is more specific than a generic async-job recommendation.

The execution target should be the headless worker path, with the HTTP route acting as a thin launcher or status client rather than the place where full generation lives.

That target is now the active implementation. The remaining work is keeping Pass 1 stable and keeping worker-side failure state inspectable.

### Required Fix

1. Verify that the worker-backed path is the active path used by Brief Studio.
2. Confirm that heavy generation no longer depends on route lifetime.
3. If worker execution still stalls, use persisted diagnostics to fix Pass 1 and schema churn there rather than reverting to route-bound execution.

### Acceptance Criteria

1. A five-minute route limit no longer constrains full generation.
2. Long-running generation can finish without being tied to a browser request.
3. The worker path becomes the canonical execution path for expensive brief regeneration.

---

## Workflow Issue 6: Observability should survive failure, not only success

### Current Improvement

Recent work now gives the system:

1. attempt-level Pass 1 timing hooks
2. durable job-level failure diagnostics
3. a polling route that can return persisted diagnostics directly from the job record

### Remaining Gap

The next step is not inventing more observability from scratch. It is verifying that the new diagnostics stay accurate under real failed runs and still leave enough detail to inspect Pass 1 behavior without rerunning blindly.

### Required Fix

1. Emit attempt-level Pass 1 telemetry.
2. Persist failure metadata for the most recent regeneration attempt.
3. Store enough state to inspect failure without rerunning a paid generation.

### Acceptance Criteria

1. A failed run leaves behind actionable diagnostics.
2. The next engineer can inspect the failure without repeating a 300-second request blindly.

---

## Workflow Priority

These priorities now mirror the post-queue-fix order in `overall-schedule.md`:

1. **Stabilize the Pass 1 generation contract.**
2. **Keep worker failure diagnostics durable and truthful.**
3. Re-run the worker-backed route with live verification campaigns.
4. Refine observability and Brief Studio recovery only where reruns expose real gaps.
5. Move to campaign tuning only after workflow reliability is proven.

Until these are done, campaign tuning work should be treated as secondary.