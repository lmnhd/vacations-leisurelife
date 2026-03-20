# Brief Step Replacement — Design Note

## Goal

Replace the multi-button remediation maze (generate → red-team → revise → validate → remediate → approve) with a single coherent brief-generation step that is used identically by the UI and agent callers.

## Shared Entry Point

`lib/campaigns/brief-engine/orchestrator.ts` — `createOrRefreshBrief(slug, options?)`

Both the UI (`/tests/brief-studio`) and agent API (`POST /api/groups/campaign/[slug]/brief`) call this one function. No divergence.

## Generation Sequence (one orchestration call)

1. `generateAestheticBrief(campaign, options?)` — Pass 1 (core aesthetic + platform concepts + refinement)
2. `generateVisualPlanningFromBrief(campaign, brief)` — Pass 2 (production bible + landing still bible)
3. `lintProductionBuild(...)` — deterministic lint
4. `validateBrief(brief, campaign)` — hard-rule gate

## One-Strike Correction Rule

- After the first generation, apply auto-fixes for all auto-fixable issues.
- Re-validate.
- If non-auto-fixable blockers still remain, run one corrective reprompt: regenerate the full bundle with the blocker list injected into the prompt as hard correction context.
- Re-validate the reprompt output.
- If it still fails, return the blockers and stop. No further loops.

The `correctionContext` parameter on `generateAestheticBrief` carries the blocker list into Pass 1 and Pass 2 prompts.

## Readiness States (unchanged)

- `drafting` — no brief exists yet
- `needs_review` — brief exists, passes hard rules, awaiting approval
- `ready_for_media` — brief approved

Readiness is `needs_review` after successful generation. `ready_for_media` requires explicit `approveForMedia` call.

## Response Shape (`BriefEngineResult`)

```ts
{
  readiness: ReadinessState;
  brief: CampaignAestheticBrief | null;
  issues: ValidationIssue[];
  summary: string;
  warnings: string[];
  autoFixApplied: boolean;
  fixedCodes: string[];
  correctiveRepromptUsed: boolean;  // true if the one corrective reprompt was consumed
}
```

## Route Surface

### Retained (clean contract)

- `POST   /api/groups/campaign/[slug]/brief`           — generate or refresh
- `PATCH  /api/groups/campaign/[slug]/brief`           — apply field edits or instruction-based revision
- `GET    /api/groups/campaign/[slug]/brief/readiness`  — current readiness + issues
- `POST   /api/groups/campaign/[slug]/brief/approve`   — approve for media
- `GET    /api/groups/campaign/[slug]/brief/history`   — modification history
- `GET    /api/groups/campaign/[slug]/media/aesthetic` — fetch raw brief (backward compat)
- `DELETE /api/groups/campaign/[slug]/media/aesthetic` — delete brief (backward compat)

### Deprecated (shimmed to 410 Gone)

- `POST /api/groups/campaign/[slug]/media/aesthetic`         — shimmed, use `/brief` POST
- `POST /api/groups/campaign/[slug]/media/aesthetic/validate`
- `POST /api/groups/campaign/[slug]/media/aesthetic/remediate`
- `POST /api/groups/campaign/[slug]/media/aesthetic/revise`
- `POST /api/groups/campaign/[slug]/media/aesthetic/trinity`
- `POST /api/groups/campaign/[slug]/media/aesthetic/red-team`

## Approval

Approval (`approveForMedia`) remains an explicit terminal action. It re-validates before locking, and blocks if any hard-rule blockers remain. Launch window is also re-checked at approval time.

## Production Bible and Landing Still Bible

Both are generated in the same orchestration call (Pass 2). Validation requires both to exist. If they are missing, that is a blocker (`production_artifacts_missing`) that forces the corrective reprompt to regenerate them.

## Trinity Pipeline

Trinity (designer → builder → reviewer agent chain) is removed from the primary generation path. It was an iterative refinement layer that added latency without a clear quality gate contract. The new corrective reprompt mechanism replaces it for the correction case.

## Agent API Usage

```bash
# Generate or refresh brief
curl -X POST /api/groups/campaign/needle-drop-2026/brief

# Check readiness
curl /api/groups/campaign/needle-drop-2026/brief/readiness

# Approve
curl -X POST /api/groups/campaign/needle-drop-2026/brief/approve

# History
curl /api/groups/campaign/needle-drop-2026/brief/history
```

All routes accept and return JSON. No UI session state required. Agent callers can execute the full brief step using only these four endpoints.
