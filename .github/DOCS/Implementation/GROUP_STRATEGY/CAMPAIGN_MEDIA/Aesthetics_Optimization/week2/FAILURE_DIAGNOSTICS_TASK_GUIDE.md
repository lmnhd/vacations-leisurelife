# Failure Diagnostics Task Guide

## Purpose

Make failed worker-backed brief runs leave behind diagnostics that the polling route and Brief Studio can actually read.

This task remains substantially improved, but it should not be treated as the current primary blocker.

---

## Current Verified State

The workflow stabilization pass established the following:

1. `failureDiagnostics` is now durable at the job-record level
2. the route reads persisted diagnostics from the job record instead of route-local process memory
3. failed-step finalization is truthful, so step state and job state do not contradict each other
4. diagnostics are no longer dependent on the original worker process remaining alive

This means worker-backed failure observability is not the active blocker right now. The active blocker has shifted back to remaining schema-contract failures.

---

## Primary Files

Worker/job execution:

1. `lib/agent-api/runner.ts`
2. `lib/agent-api/schema.ts`
3. `lib/agent-api/store.ts`

Failure capture today:

1. `lib/campaigns/brief-engine/orchestrator.ts`

Polling route and UI:

1. `app/api/groups/campaign/[slug]/brief/route.ts`
2. `app/(tests)/tests/brief-studio/page.tsx`

---

## Root Cause That Was Fixed

The previous gap was:

1. diagnostics could live only in process-local memory
2. polling could miss the true worker-side failure context
3. failed jobs could expose stale step state

The fix was:

1. persist diagnostics on the agent job record
2. read those diagnostics directly from the stored job in the route
3. finalize failed steps truthfully in the runner

---

## Completed Changes

1. `failureDiagnostics` added to the persisted agent job shape
2. worker failure path writes durable diagnostics
3. route returns persisted diagnostics from the job record
4. step-level failure state is truthful on terminal failure

---

## Outcome

Week 2 observability goals are now satisfied:

1. failed runs can be inspected without reopening worker logs
2. Brief Studio polling is no longer dependent on process-local failure state
3. the worker boundary no longer hides the last real failure context

---

## Non-Goal Going Forward

Do not reopen this task unless one of these regresses:

1. persisted `failureDiagnostics` disappears from failed jobs
2. route polling falls back to process-local diagnostics again
3. failed-step state becomes stale or contradictory again

---

## Done Signal

Treat this as stable unless a regression appears. The next agent should prioritize schema remediation before revisiting diagnostics.

