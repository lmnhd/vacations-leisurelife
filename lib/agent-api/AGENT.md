# Agent API Guide

This folder contains the internal worker-facing Agent API for campaign operations.

Use this guide when you are an agent or worker that needs to create, run, inspect, or extend campaign workflow jobs.

## What This API Is For

The Agent API gives the repo one shared workflow system for campaign work that is too stateful or long-running to treat as a normal synchronous HTTP request.

Current focus:

1. campaign brief generation
2. campaign brief approval

Planned later:

1. distribution planning
2. distribution dispatch
3. media generation
4. marketing dispatch

## Core Rule

Do not duplicate business logic in agent-only code.

Agents should:

1. create typed workflow jobs through the Agent API
2. execute shared library orchestration directly when running as a local worker
3. use HTTP routes only as a control plane for create, list, and inspect operations

## Files In This Folder

1. `schema.ts`
   Defines workflow ids, job status enums, execution surfaces, job summaries, step records, and workflow input contracts.

2. `workflow-registry.ts`
   Defines the canonical workflow registry and marks each workflow as `implemented` or `planned`.

3. `store.ts`
   Persists and loads agent job records from DynamoDB.

4. `runner.ts`
   Creates queued jobs and executes implemented workflows directly.

5. `index.ts`
   Re-exports the public Agent API surface.

## Current Executable Workflows

### `campaign_brief_generate`

Purpose:

1. generate or refresh a campaign brief
2. persist the brief
3. load canonical readiness
4. confirm persisted brief existence
5. stop before media generation

Input shape:

```ts
{
  workflowId: 'campaign_brief_generate';
  campaignSlug: string;
  instructions?: string;
  stopBeforeMedia: true;
}
```

Execution path:

1. `createOrRefreshBrief()`
2. `getReadiness()`
3. `getAestheticBrief()`

Terminal job outcomes:

1. `completed`
   The brief persisted and no blockers remain.
2. `blocked`
   The brief persisted but readiness still contains blockers.
3. `failed`
   Execution failed or persistence confirmation failed.

### `campaign_brief_approve`

Purpose:

1. approve a persisted campaign brief for downstream media
2. recompute readiness after approval

Input shape:

```ts
{
  workflowId: 'campaign_brief_approve';
  campaignSlug: string;
}
```

Execution path:

1. `approveForMedia()`
2. `getReadiness()`

Expected use:

Run this only after a persisted brief is clean enough to pass approval gates.

## Registered But Not Yet Executable

These workflow ids are valid in the schema and registry, but the direct runner does not execute them yet:

1. `campaign_distribution_plan`
2. `campaign_distribution_dispatch`
3. `campaign_media_generate`
4. `campaign_marketing_dispatch`

If you try to run one of these through `runAgentJob()`, the job will fail with an explicit "registered but not yet executable" error.

## Status Model

Job status values:

1. `queued`
2. `running`
3. `completed`
4. `failed`
5. `blocked`
6. `cancelled`

Step status values:

1. `pending`
2. `running`
3. `completed`
4. `failed`
5. `blocked`
6. `skipped`

Interpretation:

1. `blocked` means the workflow ran far enough to produce durable state, but the campaign still has gating issues.
2. `failed` means execution itself failed or required durable state was not confirmed.
3. `completed` means the workflow finished successfully for its current scope.

## Execution Surfaces

Supported surfaces in the model:

1. `local_worker`
2. `http_api`

Current reality:

1. jobs created by `runner.ts` are marked `local_worker`
2. HTTP routes are a control plane over the same Agent API concepts
3. heavy work should still happen in shared library code, not inside route-specific business logic
4. queued jobs can now be claimed and executed by the local worker loop

## Control-Plane Routes

The current HTTP control surface is:

1. `GET /api/agent/workflows`
2. `GET /api/agent/jobs?campaignSlug={slug}`
3. `POST /api/agent/jobs`
4. `GET /api/agent/jobs/{campaignSlug}/{jobId}`

Practical notes:

1. `POST /api/agent/jobs` validates `input` with `AgentWorkflowInputSchema`
2. `POST /api/agent/jobs` accepts `runNow: true` for immediate in-process execution
3. `POST /api/agent/jobs` rejects immediate execution for workflows that are only `planned`
4. `POST /api/agent/jobs` with `runNow: false` is the queue-friendly path for worker pickup

## Direct Worker Usage

Preferred direct runner calls:

```ts
import { createAgentJob, runAgentJob, submitAgentJob } from '@/lib/agent-api';

const job = await createAgentJob({
  workflowId: 'campaign_brief_generate',
  campaignSlug: 'film-and-zine-afloat-2026',
  stopBeforeMedia: true,
  instructions: 'Focus on premium editorial clarity',
}, 'openclaw');

const result = await runAgentJob(job);
```

Single-call submission:

```ts
const result = await submitAgentJob({
  workflowId: 'campaign_brief_generate',
  campaignSlug: 'film-and-zine-afloat-2026',
  stopBeforeMedia: true,
}, 'openclaw', { runNow: true });
```

## Local Prototype Runner

The repo includes a direct worker prototype script:

1. `scripts/agent-api-brief-prototype.ts`

It can:

1. create and run brief-generation jobs
2. report readiness and blocker counts
3. confirm persisted brief existence
4. optionally run approval when the brief is clean

Example:

```powershell
npm run agent:brief-prototype -- --requested-by openclaw --instructions "Focus on premium editorial clarity" some-campaign-slug
```

## Queue Worker Prototype

The repo also includes a local queue worker:

1. `scripts/agent-api-worker.ts`

Its job is to:

1. scan for queued agent jobs
2. attempt conditional claim on each candidate
3. execute the first successfully claimed job
4. continue polling when run in loop mode

Example one-shot execution:

```powershell
npm run agent:worker -- --once --worker-id openclaw
```

Example loop mode:

```powershell
npm run agent:worker -- --worker-id openclaw --poll-ms 5000
```

Prototype limitation:

This queue worker uses a table scan to find queued jobs because the current table shape does not expose a dedicated queue index yet.

## Storage Model

Agent jobs are stored in DynamoDB in the `lll-shadow-campaigns` table.

Keys:

1. `PK = CAMPAIGN#{campaignSlug}`
2. `SK = AGENT#JOB#{jobId}`

This means agent job history is campaign-scoped and can be listed alongside other campaign lifecycle state.

## How To Add A New Executable Workflow

When promoting a workflow from concept to execution, do the work in this order:

1. Add or finalize the typed input shape in `schema.ts`
2. Register the workflow in `workflow-registry.ts`
3. Mark it `planned` until the shared orchestrator is real
4. Extract or reuse a worker-safe shared orchestrator outside of route code
5. Add the execution branch in `runner.ts`
6. Return a durable summary with readiness or other relevant counters
7. Only then change availability from `planned` to `implemented`

## Guardrails

1. Keep the Agent API as a thin workflow shell over shared orchestration.
2. Do not fork approval or brief semantics away from the canonical brief engine.
3. Do not mark a workflow `implemented` until `runAgentJob()` can execute it end to end.
4. Use `blocked` for campaign-gated outcomes, not `failed`.
5. Preserve the stop-before-media boundary for brief workflows.

## Current Limitation

This API is a working prototype for the brief stage, not the full campaign lifecycle.

What is real now:

1. typed workflow contracts
2. durable job records
3. job create/list/get APIs
4. direct-worker brief generation
5. direct-worker brief approval

What is not real yet:

1. background queue claiming
2. worker heartbeat or retry orchestration
3. executable distribution workflows
4. executable media workflows
5. executable marketing workflows