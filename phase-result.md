# Phase Result: Replace The Brief-Generation Maze With One Coherent Step

## All Acceptance Criteria Met

| # | Criterion | Status |
|---|---|---|
| 1 | UI and agent callers share one underlying brief-step contract | ✅ |
| 2 | Happy path no longer requires validate/remediate/revise loop choreography | ✅ |
| 3 | Native structured outputs used in main generation path | ✅ |
| 4 | Failure handling uses one corrective reprompt at most, then stops | ✅ |
| 5 | Downstream media generation reads one reliable readiness signal | ✅ |
| 6 | Old button-maze flow removed, hidden, or clearly deprecated | ✅ |
| 7 | Agent API can execute the same process with no UI dependency | ✅ |
| 8 | Campaign with `productionBuildStatus = fail` cannot be approved | ✅ |
| 9 | Campaign with `productionBuildStatus = fail` cannot report `ready_for_media` | ✅ |
| 10 | Brief-step approval/readiness semantics match downstream spend-gated media checks | ✅ |

---

## What Changed

### Phase 1 — Design Note
- `@.github/DOCS/Implementation/BRIEF_STEP_REPLACEMENT.md` — defines shared entry point, route surface, generation sequence, one-strike correction rule, readiness states, response shape, and agent API usage.

### Phase 2 — Shared Orchestration Entry Point

**`lib/campaigns/aesthetic-engine.ts`**
- `generateAestheticBrief` now accepts `options?: { correctionContext?: string }`.
- `correctionContext` is appended as a hard-failure list into Pass 1 and Pass 2 system prompts when the corrective reprompt fires.

**`lib/campaigns/brief-engine/orchestrator.ts`**
- Removed Trinity pipeline (`runTrinitySession`, designer/builder/reviewer agents) from the primary path.
- New internal `generateFullBriefBundle`: calls `generateAestheticBrief` + `generateVisualPlanningFromBrief` + `lintProductionBuild` in one sequence.
- New one-strike flow in `createOrRefreshBrief`:
  1. Generate full bundle
  2. Validate → auto-fix → re-validate
  3. If non-launch-window blockers remain → one corrective reprompt with blocker context
  4. Final auto-fix + validate → stop regardless
- Added `correctiveRepromptUsed: boolean` to `BriefEngineResult`.
- `applyStructuredRevision` uses `generateFullBriefBundle` for instruction-driven revisions instead of Trinity.

**Confirmed gating bug fixed (AC 8, 9, 10):**

`computeReadiness` — for approved briefs, added production build lint gate before returning `ready_for_media`:
- `productionBuildStatus` missing or `landingStillBible` missing → `needs_review`
- `productionBuildStatus === 'fail'` → `needs_review`

`approveForMedia` — added production build lint gate after structural validation, before persisting approval:
- `productionBuildStatus` missing or `landingStillBible` missing → throws
- `productionBuildStatus === 'fail'` → throws

Both gates explicitly mirror the spend-gated semantics in `media-orchestrator.ts` lines 322–336.

### Phase 3 — Route Surface Collapsed

All deprecated routes return **410 Gone** with a `replacement` field pointing to `/api/groups/campaign/{slug}/brief`.

| Route | Status |
|---|---|
| `POST /api/groups/campaign/[slug]/media/aesthetic` | **410** |
| `POST /api/groups/campaign/[slug]/media/aesthetic/validate` | **410** |
| `POST /api/groups/campaign/[slug]/media/aesthetic/remediate` | **410** |
| `POST /api/groups/campaign/[slug]/media/aesthetic/revise` | **410** |
| `POST /api/groups/campaign/[slug]/media/aesthetic/trinity` | **410** |
| `POST /api/groups/campaign/[slug]/media/aesthetic/red-team` | **410** |
| `GET /api/groups/campaign/[slug]/media/aesthetic` | **retained** |
| `DELETE /api/groups/campaign/[slug]/media/aesthetic` | **retained** |

### Phase 4 — Replacement UI Step

- `app/(tests)/tests/brief-studio/page.tsx` — updated with `correctiveRepromptUsed` field + violet banner when corrective reprompt fires.
- `app/(tests)/tests/aesthetic-devising/page.tsx` — deprecation banner added at top, links to `/tests/brief-studio`. Generate button is non-functional (route 410).

### Phase 5 — Compatibility

410 shims with `replacement` pointer on all deprecated POST routes. Documented in design note.

---

## Final Shared Contract

### Generate / Refresh
```
POST /api/groups/campaign/{slug}/brief
Body: {} | { instructions?: string }

Response: {
  readiness: 'needs_review'
  brief: CampaignAestheticBrief        ← includes productionBible + landingStillBible
  issues: ValidationIssue[]
  summary: string
  warnings: string[]
  autoFixApplied: boolean
  fixedCodes: string[]
  correctiveRepromptUsed: boolean
}
```

### Structured Revision
```
PATCH /api/groups/campaign/{slug}/brief
Body: { instructions?: string; fieldEdits?: Partial<CampaignAestheticBrief> }
Response: same shape as POST
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
Throws if: structural blockers remain | productionBuildStatus = fail | productionBuildStatus missing | landingStillBible missing | launch window too short
Response: { readiness: 'ready_for_media', brief: CampaignAestheticBrief, summary: string }
```

---

## Tests — 19/19 Pass

```
npx tsx lib/campaigns/__tests__/brief-engine.orchestrator.test.ts   → 17/17
npx tsx lib/campaigns/__tests__/brief-engine.validation.test.ts     → 2/2
```

Test coverage maps to acceptance criteria:

| Test group | Criteria covered |
|---|---|
| Correction context + one-strike contract | AC 2, 4 |
| BriefEngineResult shape | AC 1, 7 |
| launch_window excluded from corrective reprompt | AC 4 |
| Approval blocked when blockers remain | AC 2 |
| Approval blocked when `productionBuildStatus = fail` | AC 8 |
| Approval blocked when `productionBuildStatus` missing | AC 8 |
| Readiness downgraded when `productionBuildStatus = fail` | AC 9 |
| Parity: brief-engine gate === media-orchestrator gate (3 cases) | AC 10 |
| Validation regression: avoidDirectives + auto-fix | AC 3, 4 |

---

## Residual Risks

1. **Campaigns already approved with `productionBuildStatus = fail`** are persisted in DynamoDB. On next `getReadiness` call they auto-downgrade to `needs_review`. No migration needed; they require a fresh `createOrRefreshBrief` before re-approval.
2. **`productionBuildStatus = 'warn'`** is not a hard block — intentional, matches media-orchestrator behavior.
3. **`aesthetic-devising` test page** still calls deprecated routes for Generate/Validate/Remediate. Those now return 410. Load and Delete remain functional. Users should use `/tests/brief-studio`.
4. **Pre-existing TypeScript errors** in `tests/check-cb-matching.ts` (`.readiness` on `CampaignAestheticBrief`) and `app/(tests)/tests/media-generation/campaign-selector.tsx` are unrelated to this phase.
5. **Trinity library code** (`lib/campaigns/brief-engine/trinity/`) is not deleted — it is unreferenced from the primary path but the test file still passes. Safe to remove in a future cleanup pass.

---

## Verification Commands

```powershell
# Unit tests
npx tsx lib/campaigns/__tests__/brief-engine.orchestrator.test.ts
npx tsx lib/campaigns/__tests__/brief-engine.validation.test.ts

# TypeScript — zero new errors in changed files
npx tsc --noEmit --project tsconfig.json 2>&1 | Select-String "brief-engine|aesthetic-engine|aesthetic/route|revise/route|validate/route|remediate/route|trinity/route|red-team/route|brief-studio"
```
