# Week 2 Workflow Issues

## Purpose

This document isolates workflow, transport, orchestration, and schema/runtime problems from campaign-quality problems.

These issues must be treated as system reliability work, not prompt-tuning work.

---

## Current Status

Two live HTTP regeneration tests were run through the real brief route:

1. `drift-festival-icon-2026`
2. `bp-opendeck-icon-2027-7n-caribbean`

Both failed with the same result:

1. HTTP `504`
2. server deadline reached at `300s`
3. no completed timing stage returned before timeout

This means the current primary blocker is workflow reliability, not campaign content quality.

Since that test run, the transport layer has changed materially:

1. `app/api/groups/campaign/[slug]/brief/route.ts` now enqueues regeneration work to the agent worker path instead of waiting synchronously for full completion
2. the same route now exposes job-status polling through `GET ?jobId=`
3. Brief Studio now polls job status and renders persisted failure diagnostics

This means the original synchronous-route blocker has been addressed architecturally, but it still needs live validation.

Live verification has now been performed against that new flow.

Observed result:

1. POST returns quickly with a job identifier
2. GET polling works
3. both campaigns remain stuck in `queued`
4. no worker step transitions to `running`
5. no failure diagnostics are produced because execution never starts

This means the next primary blocker is not route timeout. It is missing or non-consuming worker execution.

---

## Workflow Issue 1: Queued brief jobs are not being consumed by the worker path

### Evidence

The new worker-backed route was tested live on:

1. `drift-festival-icon-2026`
2. `bp-opendeck-icon-2027-7n-caribbean`

For both campaigns:

1. POST returned a job ID quickly
2. polling worked
3. job status remained `queued`
4. all steps stayed `pending`
5. no transition to `running` occurred

### Meaning

The route and UI are no longer the immediate blocker.

The execution blocker is that the worker-backed flow is not actually consuming queued jobs.

Until queued jobs start running, regeneration reliability is still unproven.

### Required Fix

1. Identify why queued jobs are not being picked up.
2. Verify whether the worker process is missing, disabled, or not consuming this workflow type.
3. Ensure queued brief jobs transition from `queued` to `running`.
4. Only after queue consumption works, rerun the control and problem campaigns.

### Acceptance Criteria

1. A queued brief job transitions to `running` without manual database intervention.
2. Every run resolves to a persisted success state or an explicit failure state.
3. Failed jobs retain actionable diagnostics.

---

## Workflow Issue 2: Pass 1 is consuming the wall-clock budget

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

## Workflow Issue 3: Structured schema/runtime mismatch is causing retry spirals

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

## Workflow Issue 5: Execution should move to the headless worker path

### Evidence

`WORK2.txt` explicitly recommends keeping long-running generation loops inside the direct TypeScript/Node worker path instead of the Next.js API route.

This is now partially implemented:

1. POST enqueues work via the agent runner
2. GET returns job state
3. Brief Studio polls that state and renders failure diagnostics

### Meaning

This is more specific than a generic async-job recommendation.

The execution target should be the headless worker path, with the HTTP route acting as a thin launcher or status client rather than the place where full generation lives.

That target now appears to be the active implementation direction. The remaining work is verification and any cleanup needed if the worker still fails inside Pass 1.

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

Recent instrumentation work now exposes partial timing snapshots on timeout.

### Remaining Gap

The current snapshot proves only that no named stage completed before timeout. That is useful, but still too coarse for the next fix.

### Required Fix

1. Emit attempt-level Pass 1 telemetry.
2. Persist failure metadata for the most recent regeneration attempt.
3. Store enough state to inspect failure without rerunning a paid generation.

### Acceptance Criteria

1. A failed run leaves behind actionable diagnostics.
2. The next engineer can inspect the failure without repeating a 300-second request blindly.

---

## Workflow Priority

1. Fix worker consumption so queued jobs actually execute.
2. Re-run the worker-backed route with live verification campaigns.
3. Fix Pass 1 observability and bounding where worker diagnostics still point to churn.
4. Fix schema/runtime mismatch driving repair churn.
5. Refine worker diagnostics and Brief Studio recovery UX if reruns expose gaps.

Until these are done, campaign tuning work should be treated as secondary.