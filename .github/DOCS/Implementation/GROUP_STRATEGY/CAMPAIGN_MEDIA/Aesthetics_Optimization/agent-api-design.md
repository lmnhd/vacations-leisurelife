# Global Agent API: Foundation Design

## Why This Exists

The project needs one internal Agent API for workers to create, run, and manage campaign workflows across:

1. brief generation
2. approval and review state
3. media generation
4. distribution
5. advertising and marketing operations

The immediate trigger is the aesthetics pipeline, but the design goal is larger than aesthetics.

The aesthetics workflow is the right starting point because it is the most stateful, expensive, and failure-sensitive campaign workflow currently in the repo.

## Core Position

The Agent API should not be treated as a long-running synchronous HTTP function.

The correct model is:

1. shared library workflows remain the source of truth
2. workers execute those workflows directly when running locally
3. HTTP routes act as a control plane and review surface
4. job state is persisted independently of any single request lifecycle

In other words:

- bypass transport for execution when the worker is local
- keep transport for control, visibility, and manual triggering

## Phase 1 Foundation Implemented

The repo now has a first-pass Agent API foundation under:

- `lib/agent-api/schema.ts`
- `lib/agent-api/workflow-registry.ts`
- `lib/agent-api/store.ts`
- `lib/agent-api/runner.ts`

### What This Foundation Does

1. defines a single workflow-id contract for worker jobs
2. defines a durable job record shape for campaign-scoped agent runs
3. persists agent jobs in the same DynamoDB table family used by campaign distribution state
4. provides a direct-runner path for the current brief workflows

### Workflows Defined

Current registry:

1. `campaign_brief_generate` — implemented
2. `campaign_brief_approve` — implemented
3. `campaign_distribution_plan` — planned
4. `campaign_distribution_dispatch` — planned
5. `campaign_media_generate` — planned
6. `campaign_marketing_dispatch` — planned

The important point is that the system now has a shared workflow namespace rather than one-off route names.

## Design Principles

### 1. Shared Workflow Core

Workers must call the same library workflows the app uses.
Do not fork the business logic into separate agent-only code paths.

### 2. Campaign-Scoped Job Records

Agent jobs are stored under the campaign partition so a worker run is visible alongside the rest of the campaign lifecycle.

### 3. Worker-First Execution

Direct execution is the default for long-running internal work.
HTTP is still useful, but mainly for:

1. enqueueing
2. loading status
3. operator review
4. manual retries

### 4. Explicit Workflow Availability

The registry marks workflows as `implemented` or `planned`.
That is intentional.
It prevents the system from pretending every surface is executable before the orchestration layer is actually shared.

### 5. Stop-Before-Media Control

The brief workflows explicitly stop before media generation.
That keeps the “campaign design” stage separable from the “asset spend” stage.

## How The New Foundation Maps To Existing Code

### Already Shared And Executable

These are now valid direct-worker workflows:

1. `createOrRefreshBrief()`
2. `getReadiness()`
3. `approveForMedia()`

These are the right starting point because they already:

1. persist to DynamoDB-backed campaign storage
2. use canonical validation and readiness semantics
3. match downstream media gating

### Not Yet Shared Enough For Direct Worker Execution

Distribution currently has strong route logic, but not yet one clean worker-facing orchestrator equivalent to the brief engine.

That is why distribution workflows are registered as `planned`, not yet `implemented` in the direct runner.

## Prototype Surface Now Available

The repo now has a first usable prototype for the brief stage.

### Control-Plane Routes

Implemented routes:

1. `GET /api/agent/workflows`
2. `GET /api/agent/jobs?campaignSlug={slug}`
3. `POST /api/agent/jobs`
4. `GET /api/agent/jobs/{campaignSlug}/{jobId}`

The `POST /api/agent/jobs` route accepts:

1. `requestedBy` — operator or worker label
2. `runNow` — whether to execute immediately in-process
3. `input` — the typed workflow payload

Current practical use:

1. enqueue or run `campaign_brief_generate`
2. enqueue or run `campaign_brief_approve`
3. inspect persisted job history per campaign

### Local Worker Prototype

For direct local testing without relying on a long-lived HTTP request, the repo now includes:

- `scripts/agent-api-brief-prototype.ts`

This script:

1. creates a `campaign_brief_generate` agent job
2. runs it directly through the shared runner
3. confirms whether the brief was persisted
4. optionally runs `campaign_brief_approve` when the brief is clean

Example invocation shape:

1. `npx tsx --env-file=.env.local scripts/agent-api-brief-prototype.ts some-campaign-slug`
2. `npx tsx --env-file=.env.local scripts/agent-api-brief-prototype.ts --approve-clean some-campaign-slug`
3. `npx tsx --env-file=.env.local scripts/agent-api-brief-prototype.ts --requested-by openclaw --instructions "Focus on premium editorial clarity" slug-a slug-b`

This is the first working prototype for agent-tested campaign aesthetic brief creation.

## Recommended Next Steps

### Phase 2: Background Execution / Retry Model

The current control plane can already create, list, and inspect jobs.

The next step is to separate enqueueing from execution so a worker can:

1. poll queued jobs
2. claim a job
3. persist heartbeat and progress
4. retry or recover from interrupted runs

### Phase 3: Shared Distribution Orchestrator

Extract the core logic from:

- `app/api/groups/campaign/[slug]/media/distribute/route.ts`

into a worker-safe library orchestrator so:

1. distribution planning
2. distribution dispatch

can be executed through the same Agent API runner model as brief workflows.

### Phase 4: Media Workflow Registration

Register the media-generation orchestrator behind the same workflow system once the execution unit is stable and spend-gated.

### Phase 5: Marketing / Advertising Runtime

Move real-time advertising and marketing actions into workflow ids, not ad hoc route actions.

Examples:

1. `campaign_marketing_dispatch`
2. `campaign_marketing_refresh`
3. `campaign_ad_budget_reconcile`

## The Target Architecture

### Presentation Layer

Next.js pages and dashboards for:

1. review
2. approvals
3. manual retry
4. visibility into campaign state and job history

### Control Plane

Lightweight Agent API routes for:

1. creating jobs
2. listing jobs
3. reading job status
4. stopping or retrying jobs later

### Execution Layer

Local or remote workers that:

1. pull jobs
2. execute shared library workflows directly
3. persist intermediate and final job state

### Campaign State Layer

Campaign briefs, manifests, schedules, execution records, and agent jobs all live in storage as durable state.

## Practical Guidance

If you are operating campaigns locally through an agent like Open Claw:

1. use the direct Agent API runner for the heavy work
2. use HTTP only for control and visibility where useful
3. do not block a request waiting for a full AI workflow to finish
4. treat job persistence as a first-class requirement, not a debugging convenience

## Current Scope Boundary

This foundation begins the Agent API.
It does not yet claim that the entire campaign lifecycle is worker-ready.

What is real now:

1. workflow ids
2. shared job schemas
3. Dynamo-backed agent job records
4. direct-worker brief execution and approval

What still needs to be built:

1. agent job control-plane routes
2. distribution orchestrator extraction
3. media workflow registration and execution
4. broader marketing workflow integration