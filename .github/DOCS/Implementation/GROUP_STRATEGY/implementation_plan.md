# Aesthetic Pipeline Loop Fixes

Four changes to stop the revise → red-team oscillation loop.

**Status: COMPLETE** ✅

---

## 1. Scope Red Team to Brief-Only (Fix the Scope Leak)

**Status:** ✅ Implemented

**Changes Made:**
- Removed blueprint-owned fields from red-team prompt (`description`, `cruiseNativeMoments`, `nicheExpressionMode`, `implausibleLiteralizations`, `allowedThemeSignals`, `discouragedThemeSignals`, `communityFitRationale`, `optionalGatheringMoments`, `optionalityStyle`, `solitudeRisks`, `researchRationale`, `successLogic`, `vacationFitRationale`)
- Kept only context fields: `name`, `targetDates`, `targetDestination`, `shipTarget`, `audienceSignals`
- Added explicit scope directive: "SCOPE: Evaluate ONLY the aesthetic brief below. Campaign metadata is provided for context only — do NOT flag issues that live in campaign metadata fields."

**Files Modified:**
- `lib/campaigns/aesthetic-red-team.ts` - Removed metadata fields from prompt, added scope directive

---

## 2. Add Re-Review Mode (Fix Scope Creep)

**Status:** ✅ Implemented

**Changes Made:**
- Added `RedTeamOptions` interface with `priorRequiredFixes?: string[]`
- Modified `runAestheticRedTeamReview()` to accept options parameter
- Added re-review mode logic in system prompt that validates prior fixes first, only surfaces net-new blockers
- API route accepts `priorRequiredFixes` in POST body and forwards to review function

**Files Modified:**
- `lib/campaigns/aesthetic-red-team.ts` - Added `RedTeamOptions` interface, re-review prompt logic
- `app/api/groups/campaign/[slug]/media/aesthetic/red-team/route.ts` - Accepts `priorRequiredFixes` from body

---

## 3. Non-Improvement Cap (Fix Endless Loops)

**Status:** ✅ Implemented

**Changes Made:**
- Added `revisionCycleCount: z.number().default(0)` to `CampaignAestheticBriefSchema`
- Defined `MAX_NON_IMPROVING_CYCLES = 2` constant
- Implemented deadlock detection: after ≥2 cycles, throws `AestheticDeadlockResult` with structured message
- Revision function increments cycle count and saves to brief
- API route returns 409 status on deadlock for UI handling

**Files Modified:**
- `lib/campaigns/schema.ts` - Added `revisionCycleCount` field
- `lib/campaigns/aesthetic-revision.ts` - Deadlock detection logic, cycle incrementing
- `app/api/groups/campaign/[slug]/media/aesthetic/revise/route.ts` - Returns 409 on deadlock

---

## 4. Tighten Reviser Prompt (Fix Incomplete Sweeps)

**Status:** ✅ Implemented

**Changes Made:**
- Added 8-item mandatory sweep checklist to reviser system prompt:
  1. TIME STRINGS - No HH:MM format, use colloquial anchors
  2. QUEUE/DEVICE - No device handling in active queues
  3. VENUE NAMING - Generic labels unless approved
  4. AVATAR/TOOL - avatarRequired must be false, no HeyGen
  5. RAIL SAFETY - Specific safety language required
  6. MERCH DISCLAIMER - Include "Optional—no identifiers needed"
  7. PRIVACY - Include filming permission warnings
  8. FILMING PERMISSIONS - Hard gate for onboard capture approval

**Files Modified:**
- `lib/campaigns/aesthetic-revision.ts` - Added MANDATORY SWEEPS section to system prompt

---

## API Route Updates

**Status:** ✅ Implemented

Both routes updated to support the new parameters:
- `red-team/route.ts` - Accepts `priorRequiredFixes` in POST body
- `revise/route.ts` - Returns full `AestheticRevisionResult` including `priorRequiredFixes` and `revisionCycleCount`

---

## Remaining Work

### UI Updates (if needed)
The API routes return all necessary data for the UI to:
- Display `revisionCycleCount` to operators
- Handle 409 deadlock responses and show escalation UI
- Pass `priorRequiredFixes` to subsequent red-team calls for re-review mode

Check `app/(tests)/tests/aesthetic-devising/page.tsx` to ensure it handles:
- Deadlock 409 responses
- Cycle count display
- Re-review mode triggering

---

## Verification Checklist

- [x] `npm run build` passes with no type errors
- [ ] Manual test: revise → red-team cycle on test page
  - [ ] Re-review mode correctly scopes to prior fixes
  - [ ] Cycle counter increments
  - [ ] Deadlock fires after 2 non-improving cycles
- [ ] Operator review: verify no stale time strings or scope-leaked issues survive
