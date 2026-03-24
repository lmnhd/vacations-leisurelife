# Failure Diagnostics Task Guide

## Purpose

Make failed worker-backed brief runs leave behind diagnostics that the polling route and Brief Studio can actually read.

This task exists because live job failures are now happening in the worker, but the current diagnostics path is still partially process-local.

---

## Verified Current State

Live verification already proved the following:

1. worker-backed jobs can now move from `queued` to `running`
2. failed jobs persist `status`, `summary`, and `error` back to DynamoDB
3. worker logs contain useful Pass 1 schema-failure detail
4. `GET /api/groups/campaign/[slug]/brief?jobId=...` can still return `failureDiagnostics: null`

That mismatch matters because the most actionable failure detail currently lives in the worker terminal, not in the durable job payload that the UI can poll.

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

## Current Gap

The route currently does this on failed jobs:

1. load the job from DynamoDB
2. if the job failed, call `getBriefJobDiagnostics(slug)`
3. return that diagnostics object to the UI

The problem is that `getBriefJobDiagnostics(slug)` reads from an in-memory `Map` inside `lib/campaigns/brief-engine/orchestrator.ts`.

That means:

1. diagnostics written by the worker live in the worker process memory
2. the Next.js route reads its own server-process memory instead
3. the route can miss the worker-generated failure details even though the job itself is persisted correctly

---

## Required Changes

### 1. Persist diagnostics with the job or alongside the job

The failure diagnostic payload must be durable and cross-process visible.

Acceptable directions:

1. add `failureDiagnostics` to the persisted `AgentJobRecord`
2. or persist diagnostics in the same store under a durable campaign/job key that both worker and route can read

The main requirement is that the worker writes it and the route reads the same stored data.

### 2. Stop relying on process-local diagnostics for worker-backed jobs

The in-memory map may still be useful for same-process debugging, but it cannot be the canonical source for worker failures.

For worker-backed brief generation:

1. canonical diagnostics must be stored durably
2. polling responses must be built from that durable data

### 3. Attach meaningful failure payloads, not only a final error string

The stored diagnostics should include enough detail to debug without re-running a paid generation.

At minimum capture:

1. campaign slug
2. failed timestamp
3. top-level error message
4. timing snapshot
5. recent Pass 1 attempt or schema-repair context when available

### 4. Keep the route thin

Do not move heavy generation logic back into the route.

The route should remain:

1. enqueue client
2. job-status reader
3. diagnostics reader

---

## Non-Goals

This task should not expand into:

1. fixing Pass 1 schema generation itself
2. redesigning Brief Studio layout
3. adding a new execution surface

It is strictly about making failure state durable and inspectable.

---

## Acceptance Criteria

This task is complete only when all of the following are true:

1. a worker-generated failed brief job returns non-null `failureDiagnostics` from the polling route
2. the diagnostics reflect the same failure context seen by the worker, not an empty route-local fallback
3. Brief Studio can display actionable failure detail after the browser refreshes or reconnects
4. engineers can inspect the last failed job without reopening worker logs

---

## Suggested Execution Order

1. extend the persisted agent job schema to hold failure diagnostics or add a companion stored record
2. write diagnostics from the worker execution path when `createOrRefreshBrief` fails or exits incompletely
3. update the route to read durable diagnostics instead of only calling the process-local map
4. keep the existing UI contract stable if possible so Brief Studio needs minimal change
5. verify with one failed worker-backed run before touching any campaign-specific tuning

---

## Done Signal

If a failed worker-backed run surfaces the same diagnostic detail through the polling API that is visible in the worker logs, this task is complete.