# Phase Result: Brief-Generation Maze Replacement

## What Changed

### Core Orchestration (`lib/campaigns/brief-engine/orchestrator.ts`)

- **Removed Trinity pipeline** (`runTrinitySession`, designer/builder/reviewer agents) from the primary generation path.
- **New `generateFullBriefBundle` internal helper** — calls `generateAestheticBrief` + `generateVisualPlanningFromBrief` + `lintProductionBuild` in one sequence, returning a fully assembled brief bundle including `productionBible`, `landingStillBible`, and lint results.
- **New one-strike flow in `createOrRefreshBrief`**:
  1. Generate full bundle
  2. Validate
  3. Auto-fix auto-fixable issues → re-validate
  4. If non-launch-window blockers still remain → one corrective reprompt (full regeneration with blocker context injected)
  5. Auto-fix + final validate
  6. Persist and return — stop regardless
- Added `correctiveRepromptUsed: boolean` to `BriefEngineResult`.
- `applyStructuredRevision` now uses `generateFullBriefBundle` with instruction context instead of Trinity for instruction-driven revisions.

### Generation Engine (`lib/campaigns/aesthetic-engine.ts`)

- `generateAestheticBrief` now accepts `options?: { correctionContext?: string }`.
- `correctionContext` is appended as a hard failure list into Pass 1 and Pass 2 system prompts when the corrective reprompt is triggered.

### UI (`app/(tests)/tests/brief-studio/page.tsx`)

- Added `correctiveRepromptUsed: boolean` to `BriefEngineResult` local interface.
- Added a violet banner displayed when `correctiveRepromptUsed` is true.

### Design Note

- `.github/DOCS/Implementation/BRIEF_STEP_REPLACEMENT.md` — design note covering entry point, route surface, generation sequence, one-strike rule, and agent API usage.

---

## Routes Removed or Shimmed

All deprecated routes now return **410 Gone** with a `replacement` field pointing to `/api/groups/campaign/{slug}/brief`.

| Route | Status |
|---|---|
| `POST /api/groups/campaign/[slug]/media/aesthetic` | **410** — use `/brief` POST |
| `POST /api/groups/campaign/[slug]/media/aesthetic/validate` | **410** |
| `POST /api/groups/campaign/[slug]/media/aesthetic/remediate` | **410** |
| `POST /api/groups/campaign/[slug]/media/aesthetic/revise` | **410** |
| `POST /api/groups/campaign/[slug]/media/aesthetic/trinity` | **410** |
| `POST /api/groups/campaign/[slug]/media/aesthetic/red-team` | **410** |
| `GET /api/groups/campaign/[slug]/media/aesthetic` | **retained** — fetch brief |
| `DELETE /api/groups/campaign/[slug]/media/aesthetic` | **retained** — delete brief |

### Retained Clean Routes (unchanged)

- `POST   /api/groups/campaign/[slug]/brief`
- `PATCH  /api/groups/campaign/[slug]/brief`
- `GET    /api/groups/campaign/[slug]/brief/readiness`
- `POST   /api/groups/campaign/[slug]/brief/approve`
- `GET    /api/groups/campaign/[slug]/brief/history`

---

## Final Shared Contract

### Generate / Refresh

```
POST /api/groups/campaign/{slug}/brief
Body: {} | { instructions?: string }

Response: BriefEngineResult {
  readiness: 'needs_review'
  brief: CampaignAestheticBrief
  issues: ValidationIssue[]
  summary: string
  warnings: string[]
  autoFixApplied: boolean
  fixedCodes: string[]
  correctiveRepromptUsed: boolean
}
```

### Get Readiness

```
GET /api/groups/campaign/{slug}/brief/readiness

Response: {
  readiness: 'drafting' | 'needs_review' | 'ready_for_media'
  brief: CampaignAestheticBrief | null
  issues: ValidationIssue[]
  summary: string
  campaignName: string | null
}
```

### Approve

```
POST /api/groups/campaign/{slug}/brief/approve

Response: { readiness: 'ready_for_media', brief: CampaignAestheticBrief, summary: string }
Throws 500 if blockers remain or launch window too short.
```

---

## Residual Risks

1. **Trinity test file** (`lib/campaigns/__tests__/trinity-pipeline.test.ts`) still exists and passes — Trinity library code is unchanged. If Trinity is removed entirely in a future cleanup, those tests must be removed too.
2. **`aesthetic-devising/page.tsx`** still calls the old `POST /media/aesthetic` route (now 410). The page will show an error on generate. Users should be directed to `/tests/brief-studio` instead. The page is still usable for Load/Delete.
3. **`applyStructuredRevision` instruction path** now regenerates the full bundle rather than doing a targeted single-round Trinity pass. This is heavier but consistent with the one-contract rule.
4. **Pre-existing TypeScript errors** in `tests/check-cb-matching.ts`, `app/(tests)/tests/media-generation/campaign-selector.tsx`, and `scripts/cb-inventory-scraper.ts` are unrelated to this phase and were present before.

---

## Verification Commands Run

```powershell
# Validation regression (2/2 pass)
npx tsx lib/campaigns/__tests__/brief-engine.validation.test.ts

# New orchestrator contract tests (6/6 pass)
npx tsx lib/campaigns/__tests__/brief-engine.orchestrator.test.ts

# TypeScript check — zero new errors in changed files
npx tsc --noEmit --project tsconfig.json 2>&1 | Select-String "brief-engine|aesthetic-engine|aesthetic/route|revise/route|validate/route|remediate/route|trinity/route|red-team/route|brief-studio"
```
