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

---

## Workflow Issue 1: `/brief` route cannot complete within the server deadline

### Evidence

The live route `app/api/groups/campaign/[slug]/brief/route.ts` timed out for both test campaigns at the hard five-minute server deadline.

The timeout response now includes partial timing snapshots, and both campaigns returned an `initial` pass with no completed stages.

### Meaning

The failure occurs before the route finishes even the first completed outer generation stage.

The current synchronous HTTP model is not reliable enough for the full regeneration pipeline.

### Required Fix

1. Stop treating full brief regeneration as a normal blocking HTTP request.
2. Move long-running generation into a worker or async job flow.
3. Make the route return a job identifier and pollable status instead of waiting for full completion.

### Acceptance Criteria

1. Regeneration never leaves the client hanging indefinitely.
2. Every run resolves to a persisted success state or an explicit failure state.
3. A timed-out browser request does not mean lost observability.

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

## Workflow Issue 4: UI state recovery is still tied too tightly to a long request

### Evidence

The Brief Studio client now has timeout handling and clearer copy, but the end-to-end user experience still depends on a single expensive request path.

### Meaning

Even with better client messaging, the underlying architecture still asks the page to wait on a server path that is currently too heavy.

### Required Fix

1. Shift Brief Studio from request-waiting to job-tracking.
2. Show queued, running, failed, and completed states explicitly.
3. Preserve the ability to reload saved state independently from job execution.

### Acceptance Criteria

1. Users can leave and return without losing job visibility.
2. Regeneration status is observable without relying on an open tab.
3. Paid generation actions are bounded and inspectable.

---

## Workflow Issue 5: Execution should move to the headless worker path

### Evidence

`WORK2.txt` explicitly recommends keeping long-running generation loops inside the direct TypeScript/Node worker path instead of the Next.js API route.

### Meaning

This is more specific than a generic async-job recommendation.

The execution target should be the headless worker path, with the HTTP route acting as a thin launcher or status client rather than the place where full generation lives.

### Required Fix

1. Keep the heavy generation pipeline in the headless worker runtime.
2. Use the route only to enqueue, inspect, or retrieve results.
3. Ensure retry loops and schema-repair loops no longer depend on route lifetime.

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

1. Fix Pass 1 observability and bounding.
2. Fix schema/runtime mismatch driving repair churn.
3. Move canonical execution to the headless worker path.
4. Expose async job status through the route and Brief Studio.
5. Upgrade Brief Studio to track jobs instead of blocking on the request.

Until these are done, campaign tuning work should be treated as secondary.