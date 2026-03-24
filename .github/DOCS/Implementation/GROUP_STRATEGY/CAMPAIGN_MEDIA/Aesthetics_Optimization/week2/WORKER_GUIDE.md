# Agent Worker Guide

The agent worker is a **separate process** that polls DynamoDB for `queued` agent jobs, claims them, and executes the registered workflow (e.g. brief generation).

## Why It Exists

The brief route (`POST /api/groups/campaign/[slug]/brief`) enqueues jobs with status `queued` and returns immediately with a `jobId`. The Brief Studio UI then polls `GET ?jobId=` for status updates. **Nothing executes the job unless the worker is running.**

## How To Start

Open a **second PowerShell terminal** (separate from the dev server) and run:

```powershell
npm run agent:worker
```

This starts a long-running poll loop (default 5s interval). It will:
1. Scan DynamoDB for jobs with `status = queued`
2. Atomically claim the oldest job
3. Execute the workflow (e.g. `createOrRefreshBrief`)
4. Persist step progress and terminal status back to DynamoDB
5. Sleep and repeat

## CLI Flags

| Flag | Default | Description |
|---|---|---|
| `--once` | (continuous) | Process one batch then exit |
| `--poll-ms <ms>` | `5000` | Milliseconds between poll cycles |
| `--max-jobs <n>` | unlimited | Stop after processing N jobs |
| `--batch-size <n>` | `10` | Max queued jobs to scan per cycle |
| `--worker-id <id>` | `local_agent_worker` | Worker identifier for claim tracking |

Example one-shot run:
```powershell
npm run agent:worker -- --once
```

## Architecture

```
Brief Studio UI
  ├── POST /brief → enqueues job (status: queued)
  └── GET /brief?jobId= → polls status

Agent Worker (separate process)
  └── polls DynamoDB → claims job → runs workflow → saves result
```

The worker and dev server are independent processes. Neither depends on the other to start.
