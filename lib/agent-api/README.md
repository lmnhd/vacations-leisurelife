# Agent API

This directory is the internal workflow layer for agent-driven campaign operations.

If you are a human operator or developer, start here:

1. Agent usage guide: [AGENT.md](AGENT.md)
2. Higher-level architecture note: [agent-api-design.md](../../.github/DOCS/Implementation/GROUP_STRATEGY/CAMPAIGN_MEDIA/Aesthetics_Optimization/agent-api-design.md)
3. Example control-plane request: [examples/campaign-brief-generate.request.json](examples/campaign-brief-generate.request.json)

## What Exists Today

Implemented now:

1. typed workflow schemas
2. workflow registry
3. Dynamo-backed job storage
4. direct execution for brief generation and brief approval
5. HTTP routes for create/list/get workflow jobs
6. local worker polling for queued jobs

## Human Quick Start

Create a queued job over HTTP:

```json
POST /api/agent/jobs
{
  "requestedBy": "operator",
  "runNow": false,
  "input": {
    "workflowId": "campaign_brief_generate",
    "campaignSlug": "film-and-zine-afloat-2026",
    "stopBeforeMedia": true,
    "instructions": "Focus on premium editorial clarity"
  }
}
```

Run queued jobs locally with the prototype worker:

```powershell
npm run agent:worker -- --once --worker-id openclaw
```

Run the direct brief prototype without queueing:

```powershell
npm run agent:brief-prototype -- film-and-zine-afloat-2026
```