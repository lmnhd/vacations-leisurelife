# Phase Result: Production Build Lint Gating Fix

## Bug Fixed

**Confirmed gating bug eliminated:**
- `approveForMedia()` previously succeeded even when `productionBuildStatus = fail`
- `computeReadiness()` previously returned `ready_for_media` for approved briefs with failed production builds
- Downstream `runMediaGeneration()` in `media-orchestrator.ts` correctly blocked on `productionBuildStatus = fail`, creating a disagreement between upstream approval and downstream spend-gating

Both upstream functions now enforce the same gating semantics as `media-orchestrator.ts`.

---

## What Changed

### `lib/campaigns/brief-engine/orchestrator.ts`

**`computeReadiness` (lines 88–102):**

Added production build lint gate for approved briefs. After structural validation passes, two new checks run before returning `ready_for_media`:

1. If `productionBuildStatus` is missing/undefined OR `landingStillBible` is missing → return `needs_review` (not evaluated yet)
2. If `productionBuildStatus === 'fail'` → return `needs_review` (downstream would reject)

**`approveForMedia` (lines 309–323):**

Added production build lint gate after structural validation, before writing the approved state. Two new checks throw before approval is persisted:

1. If `productionBuildStatus` is missing OR `landingStillBible` is missing → throws `Cannot approve: production build has not been evaluated`
2. If `productionBuildStatus === 'fail'` → throws `Cannot approve: production build lint failed`

Both gates explicitly document that they must match `media-orchestrator.ts` spend-gated semantics.

---

## Alignment With Media Orchestrator

`media-orchestrator.ts` (lines 322–336) gates on:
- `brief.productionBuildStatus === 'fail'` → `ProductionBuildLintError`
- `!brief.landingStillBible || !brief.productionBuildStatus` → `ProductionBuildLintError`

The brief-engine now enforces the same two conditions at approval time and readiness time. A campaign that would be rejected by `runMediaGeneration` cannot reach `ready_for_media` upstream.

---

## Routes Unchanged

No route changes in this fix. The bug was entirely in the orchestrator service layer.

---

## Tests

All 19 tests pass:

```
Brief Engine Orchestrator Contract Tests (6/6)
Production Build Lint Gating Regression (11/11)
Brief Engine Validation Regression (2/2)
```

New tests added to `lib/campaigns/__tests__/brief-engine.orchestrator.test.ts`:

| Test | Criterion |
|---|---|
| `approveForMedia blocks when productionBuildStatus is fail` | AC 7 |
| `approveForMedia blocks when productionBuildStatus is missing` | AC 7 |
| `approveForMedia blocks when landingStillBible is missing` | AC 7 |
| `approveForMedia passes when productionBuildStatus is pass` | AC 7 |
| `approveForMedia passes when productionBuildStatus is warn` | AC 7 |
| `computeReadiness returns needs_review for approved brief with fail` | AC 8 |
| `computeReadiness returns needs_review for approved brief with missing` | AC 8 |
| `computeReadiness returns ready_for_media for approved brief with pass` | AC 8 |
| `parity: both gates block on fail` | AC 9 |
| `parity: both gates block when missing` | AC 9 |
| `parity: both gates pass on pass` | AC 9 |

---

## Residual Risks

1. Campaigns that were previously approved with `productionBuildStatus = fail` are already persisted in DynamoDB with `humanReviewStatus = 'approved'`. On next `getReadiness` call they will be downgraded to `needs_review` automatically — no migration needed. They will need a full regeneration before they can be re-approved.
2. `productionBuildStatus = 'warn'` is not a hard block (matches media-orchestrator behavior — warn is advisory only).
3. Pre-existing TypeScript errors in `tests/check-cb-matching.ts` are unrelated to this fix.

---

## Verification Commands

```powershell
npx tsx lib/campaigns/__tests__/brief-engine.orchestrator.test.ts
# → 17/17 pass

npx tsx lib/campaigns/__tests__/brief-engine.validation.test.ts
# → 2/2 pass

npx tsc --noEmit --project tsconfig.json 2>&1 | Select-String "brief-engine/orchestrator"
# → no output (zero new errors)
```
