# Pass 1 Schema Task Guide

## Purpose

Stabilize Pass 1 brief generation so the worker can complete `generate_brief` without falling into long schema-repair and timeout loops.

This task is complete for week 2 and should now be treated as reference documentation unless a new regression appears.

---

## Final Verified State

The workflow stabilization pass established the following:

1. Pass 1 now uses lenient defaults across the generation schema
2. `skipRepair: true` prevents expensive repair loops in Pass 1
3. Pass 1 token budget was raised to 9000
4. the same lenient-generation pattern was extended across later pipeline stages where strict schemas had the same truncation behavior
5. both `drift-festival-icon-2026` and `bp-opendeck-icon-2027-7n-caribbean` now complete through the worker-backed flow

This means Pass 1 is no longer the active workflow blocker.

---

## Root Cause That Was Fixed

The repeated failure pattern was:

1. strict generation schema
2. insufficient output budget
3. truncation
4. validation failure
5. repair loop
6. timeout

The fix was applied systematically by:

1. making the generation schema lenient enough to accept incomplete-but-usable output
2. raising output budgets to avoid truncation
3. skipping repair where repair churn was more expensive than direct acceptance plus normalization

---

## Primary Files

Generation entry point:

1. `lib/campaigns/aesthetic-engine.ts`

Persisted schema source:

1. `lib/campaigns/schema.ts`

Structured-output and repair loop:

1. `lib/chat/llm-call.ts`

---

## Files And Patterns Used

Primary files involved:

1. `lib/campaigns/aesthetic-engine.ts`
2. `lib/chat/llm-call.ts`

Primary pattern used:

1. lenient defaults on generation schemas
2. higher `maxOutputTokens`
3. `skipRepair: true` on stages where repair loops were causing the actual failures

---

## Completed Changes

1. Pass 1 lenient generation contract
2. Pass 1 `skipRepair: true`
3. Pass 1 token budget raised to 9000
4. same anti-truncation strategy extended to Pass 2, refinement, anchors, landing stills, and production bible

---

## Outcome

Verified successful outcomes:

1. drift completed with persisted brief, `readiness=needs_review`, `blockerCount=0`
2. open-deck completed with persisted brief, `readiness=needs_review`, `blockerCount=0`
3. Pass 1 no longer blocks the pipeline

---

## Non-Goal Going Forward

Do not reopen this task unless one of these regresses:

1. Pass 1 timeouts return
2. repair loops reappear as a dominant cost center
3. later stage changes reintroduce truncation through stricter schemas or lower token budgets

---

## Done Signal

This task is complete for week 2. Treat it as solved reference material.

