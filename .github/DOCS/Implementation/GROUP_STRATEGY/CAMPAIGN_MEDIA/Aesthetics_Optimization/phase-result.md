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

---

## Phase 2A: Stale Production-Build Status Drift — Implemented

### Problem Confirmed

A brief persisted before a lint-rule change could carry a stale `productionBuildStatus = fail` and stale `productionBuildLint` snapshot. Gate calls in `getReadiness()` and `approveForMedia()` read the stored field directly, so campaigns that would now pass or warn under current lint rules remained falsely blocked. The inverse drift (stored `pass` but fresh `fail`) was equally risky.

### Fix Implemented

**New shared helper** — `recomputeAndResyncLint(brief, campaign)` in `lib/campaigns/brief-engine/orchestrator.ts`:
- Runs `lintProductionBuild` against the saved `landingStillBible` using current lint rules
- Compares the fresh verdict to the stored `productionBuildStatus`
- If drift is detected, writes the updated `productionBuildLint`, `productionBuildStatus`, and `productionBuildEvaluatedAt` back to storage in one explicit place
- Returns `{ resolvedBrief, drifted, freshStatus }`
- No-ops when `landingStillBible` is absent (returns stored brief as-is)

**Updated `computeReadiness` (now async)**:
- Calls `recomputeAndResyncLint` before applying any gate logic
- All gate checks operate on the effective (possibly resynced) brief, not the raw stored state

**Updated `approveForMedia`**:
- Calls `recomputeAndResyncLint` between structural validation and the lint gate
- If stale fail is detected and fresh recomputation clears it (`warn` or `pass`), approval proceeds
- If fresh recomputation confirms `fail`, approval is still blocked (gate is not weakened)

### Stale-State Regression Tests Added

New section in `lib/campaigns/__tests__/brief-engine.orchestrator.test.ts` (AC 11):

| Test | Result |
|---|---|
| drift detected: stored=fail, fresh=warn | ✓ |
| drift detected: stored=fail, fresh=pass | ✓ |
| no drift: stored=fail, fresh=fail | ✓ |
| stale fail + fresh warn: approval gate passes | ✓ |
| stale fail + fresh pass: approval gate passes | ✓ |
| stale fail + fresh fail: approval gate still blocks | ✓ |
| stale fail + fresh warn: readiness = ready_for_media for approved brief | ✓ |
| stale fail + fresh fail: readiness = needs_review | ✓ |
| stale undefined + fresh pass: approval gate passes | ✓ |

### Verification Results

```powershell
# Orchestrator regression — 26/26 pass (16 prior + 10 new stale-lint tests)
npx tsx lib/campaigns/__tests__/brief-engine.orchestrator.test.ts

# Validation regression — 2/2 pass
npx tsx lib/campaigns/__tests__/brief-engine.validation.test.ts

# Production-build quality regression — 10/10 pass
npx tsx lib/campaigns/__tests__/production-build-quality.test.ts

# TypeScript — zero new errors in changed files
# (pre-existing errors in scripts/cb-inventory-scraper.ts and tests/check-cb-matching.ts unchanged)
```

### Phase 2A Constraint Compliance

- Gate is not weakened — a genuinely failing still set still blocks approval and readiness
- Lint logic is not duplicated — `lintProductionBuild` is called in exactly one helper
- Fix lives in the shared orchestration path, not the UI
- `saveAestheticBrief` is called in exactly one place on drift detection
