# Agentic API Live Test: Existing Blueprints To Media-Ready

## Purpose

Use this runbook when you want a real agent to process `10+` already-existing campaign blueprints through the live brief pipeline, store the results in DynamoDB, and stop before any image or media generation.

This is the correct path when the goal is:

1. start from persisted campaign blueprints
2. generate or refresh briefs through the real agent-facing API
3. persist those briefs in DynamoDB
4. approve only the campaigns that are actually clean
5. stop at `ready_for_media`

This is not the diagnostic path.
Do not use the Phase 2C diagnostic scripts for this job.

## Real API Surface

Use these retained endpoints only:

1. `GET /api/groups/discovery?load=true`
2. `POST /api/groups/campaign/{slug}/brief`
3. `GET /api/groups/campaign/{slug}/brief/readiness`
4. `POST /api/groups/campaign/{slug}/brief/approve`
5. `GET /api/groups/campaign/{slug}/media/aesthetic`

Do not use deprecated `POST /media/aesthetic` generation routes.
Do not call image-generation or media-generation endpoints.

## Preconditions

1. The app server is already running.
2. The agent has network access to the local app.
3. Existing campaign blueprints already exist in storage.
4. The goal is brief persistence and approval only, not image generation.

## Definition Of Success

A campaign counts as successfully processed only when all of the following are true:

1. `POST /brief` returns a valid brief-generation result
2. `GET /brief/readiness` reflects the stored outcome
3. `GET /media/aesthetic` returns a persisted brief from storage
4. if the campaign is clean, `POST /brief/approve` succeeds
5. final readiness is `ready_for_media`

If blockers remain, the campaign still counts as processed, but not complete.
In that case the correct terminal state is `needs_review`, not forced approval.

## Required Per-Campaign Flow

For each campaign slug:

1. Read baseline readiness:

```http
GET /api/groups/campaign/{slug}/brief/readiness
```

2. Generate or refresh the brief:

```http
POST /api/groups/campaign/{slug}/brief
Content-Type: application/json

{}
```

Optional instruction-driven pass:

```http
POST /api/groups/campaign/{slug}/brief
Content-Type: application/json

{
  "instructions": "Preserve ship-first plausibility, strong niche legibility, and community-native participation."
}
```

3. Recheck stored readiness:

```http
GET /api/groups/campaign/{slug}/brief/readiness
```

4. Confirm persistence in DynamoDB-backed storage:

```http
GET /api/groups/campaign/{slug}/media/aesthetic
```

5. Approve only if the campaign is actually clean:

```http
POST /api/groups/campaign/{slug}/brief/approve
```

6. Stop there.
Do not call any media or image generation route after approval.

## Approval Rule

Approval is allowed only when the brief is already clean.

A campaign is approval-eligible when:

1. structural blockers are zero
2. production build status is not `fail`
3. readiness is consistent with a clean brief

If approval returns `409`, record the failure and continue to the next campaign.
Do not try to force it through.

## Minimum Output The Agent Must Record

For each campaign, record:

1. slug
2. baseline readiness
3. generation result summary
4. `autoFixApplied`
5. `fixedCodes`
6. `correctiveRepromptUsed`
7. blocker count after generation
8. stored readiness after generation
9. whether the persisted brief exists
10. approval result
11. final readiness

## Recommended Campaign Selection

Start with `10` to `15` existing campaigns from:

```http
GET /api/groups/discovery?load=true
```

Choose a mixed sample:

1. campaigns already known to be stable
2. campaigns with broader venue phrasing
3. campaigns with atmospheric or scenic compositions
4. campaigns without reference packs

Do not limit the run to only the proving trio.

## Agent Instructions To Paste

Use the block below as the operating brief for the agent.

```md
Process at least 10 existing campaign blueprints through the live agent API and stop before media generation.

Rules:
1. Use only the retained brief endpoints.
2. Start from campaigns already in storage.
3. Persist the brief to storage by calling POST /api/groups/campaign/{slug}/brief.
4. After each generation, verify storage through GET /api/groups/campaign/{slug}/media/aesthetic.
5. Check readiness through GET /api/groups/campaign/{slug}/brief/readiness.
6. Approve only clean campaigns through POST /api/groups/campaign/{slug}/brief/approve.
7. Do not call any media or image generation route.
8. Do not use diagnostic scripts as proof of persistence.
9. Record per-campaign results: baseline readiness, generation outcome, blocker counts, persistence confirmed yes/no, approval result, final readiness.
10. Continue through the full batch even if some campaigns fail approval.

Per-campaign sequence:
1. GET /api/groups/campaign/{slug}/brief/readiness
2. POST /api/groups/campaign/{slug}/brief
3. GET /api/groups/campaign/{slug}/brief/readiness
4. GET /api/groups/campaign/{slug}/media/aesthetic
5. If clean, POST /api/groups/campaign/{slug}/brief/approve
6. Record final state and move on

Success condition:
- the agent finishes the full batch
- every campaign has a persisted brief in storage after processing
- clean campaigns end at ready_for_media
- blocked campaigns end at needs_review with explicit reasons recorded
```

## PowerShell Example

If you want a simple operator-side loop, this is the shape to use against a running local server:

```powershell
$base = "http://localhost:3000"
$slugs = @(
  "bp-tabletop-icon-2027-7n-caribbean",
  "eastern-caribbean-stitch-sail-2026-09-19",
  "deck-sketchbook-society-2026"
)

foreach ($slug in $slugs) {
  Write-Host "=== $slug ==="

  $baseline = Invoke-RestMethod -Method GET -Uri "$base/api/groups/campaign/$slug/brief/readiness"
  $generated = Invoke-RestMethod -Method POST -Uri "$base/api/groups/campaign/$slug/brief" -ContentType "application/json" -Body "{}"
  $readiness = Invoke-RestMethod -Method GET -Uri "$base/api/groups/campaign/$slug/brief/readiness"
  $stored = Invoke-RestMethod -Method GET -Uri "$base/api/groups/campaign/$slug/media/aesthetic"

  $canApprove = $true
  if ($readiness.issues) {
    $blockers = @($readiness.issues | Where-Object { $_.severity -eq "blocker" })
    if ($blockers.Count -gt 0) { $canApprove = $false }
  }
  if ($stored.productionBuildStatus -eq "fail") { $canApprove = $false }

  if ($canApprove) {
    try {
      $approval = Invoke-RestMethod -Method POST -Uri "$base/api/groups/campaign/$slug/brief/approve"
      Write-Host "APPROVED: $($approval.readiness)"
    } catch {
      Write-Host "APPROVAL FAILED: $($_.Exception.Message)"
    }
  } else {
    Write-Host "SKIPPED APPROVAL: blockers remain"
  }
}
```

## Stop Condition

Stop the run when:

1. all chosen campaigns have been processed through the live API
2. each campaign has either:
   `ready_for_media`
   or
   `needs_review` with explicit blockers recorded
3. no image or media generation route has been called

## Relevant Files

- `app/api/groups/campaign/[slug]/brief/route.ts`
- `app/api/groups/campaign/[slug]/brief/readiness/route.ts`
- `app/api/groups/campaign/[slug]/brief/approve/route.ts`
- `lib/campaigns/brief-engine/orchestrator.ts`
- `tests/direct-library-step3.ts`