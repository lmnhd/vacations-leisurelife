# Session Summary — July 24, 2026

## Objective

Debug why guest information (traveler details, cabin preferences, insurance decisions) was not appearing in the operator's `GuestInfoPanel` after a guest completed the booking flow and submitted review.

## Root Causes Identified

### 1. GSI1PK Format Mismatch (Primary Blocker)

**File:** `lib/booking-assistant/store.ts`

The DynamoDB GSI1 partition key was written with a `#URGENCY#` suffix but queried without it:

- **Written:** `STATUS#collecting#URGENCY#informational`
- **Queried:** `STATUS#collecting`

Since DynamoDB GSI queries use exact match on partition keys, no draft was ever visible in the operator queue. This affected every status (`collecting`, `review_ready`, `ready_to_call_agent`, `call_signal_pending`).

**Fix:** Removed `#URGENCY#informational` suffix from GSI1PK in both `createDraft` (line 134) and `updateDraftStatus` (line 453). New format: `STATUS#{status}`.

### 2. Invalid State Transition: `review_ready` → `call_signal_pending`

**File:** `lib/booking-assistant/contracts.ts`

The state machine did not allow transitioning directly from `review_ready` to `call_signal_pending`. When a guest submitted review (`markReviewReady` → server status `review_ready`) and then tapped "Call agent" (`signalCallIntent` → tries `call_signal_pending`), the server rejected the transition silently. The draft got stuck at `review_ready`.

**Fix:** Added `call_signal_pending` to the allowed transitions from `review_ready` in `bookingStatusTransitions`.

### 3. Queue Blind Spot: `review_ready` Not Polled

**File:** `app/api/booking-assistant/queue/route.ts`

The operator queue only polled `call_signal_pending` and `ready_to_call_agent`. Drafts stuck at `review_ready` were invisible even if the transition failed.

**Fix:** Added `review_ready` to `validStatuses` array.

### 4. Legacy Draft Compatibility

**File:** `lib/booking-assistant/store.ts`

Drafts created before the GSI1PK fix still had the old `#URGENCY#` suffix and would never appear in the queue even after the fix.

**Fix:** Updated `queryOperatorQueue` to query both old and new GSI1PK formats, deduplicating results by `draftId`. This ensures existing drafts in DynamoDB are found without requiring guests to re-submit.

## Changes Made

### `lib/booking-assistant/contracts.ts`
- Added `call_signal_pending` to allowed transitions from `review_ready`

### `lib/booking-assistant/store.ts`
- `createDraft`: GSI1PK changed from `STATUS#{status}#URGENCY#informational` to `STATUS#{status}`
- `updateDraftStatus`: GSI1PK changed from `STATUS#{status}#URGENCY#{urgency}` to `STATUS#{status}`
- `queryOperatorQueue`: Now queries both old and new GSI1PK formats with deduplication

### `app/api/booking-assistant/queue/route.ts`
- Added `review_ready` to `validStatuses` array

### `app/(tests)/tests/booking-assistant-operator/page.tsx`
- Added `handleQuickSend` handler that creates a full draft (travelers, cabin, decisions) and transitions through `collecting` → `review_ready` → `call_signal_pending` in one click
- Added "Quick Send Full Packet" button to the Guest Flow Simulator section

## Commits

| Commit | Description |
|--------|-------------|
| `cac664d6` | Allow `review_ready` → `call_signal_pending` transition and add `review_ready` to queue |
| `0471bc5e` | Fix GSI1PK format mismatch — remove `#URGENCY#` suffix |
| `d82ece20` | Add Quick Send Full Packet button to operator console guest simulator |
| `22734eab` | Include legacy booking drafts in operator queue (backward compatibility) |

## Data Flow (Working)

1. Guest completes booking flow → `submitReview()` calls `apiMarkReviewReady()` with travelers, cabin, decisions
2. Server persists encrypted traveler/cabin/decision items to DynamoDB
3. Server transitions draft to `review_ready` (GSI1PK: `STATUS#review_ready`)
4. Guest taps "Call agent" → `launchCall()` calls `apiSignalCallIntent()`
5. Server transitions draft to `call_signal_pending` (GSI1PK: `STATUS#call_signal_pending`)
6. Operator console polls queue → finds draft via GSI1 query
7. Operator looks up by fallback key → verifies caller → reveals full packet
8. `GuestInfoPanel` displays travelers, cabin, contact, decisions (including insurance)

## Key Files

- `lib/booking-assistant/store.ts` — DynamoDB operations, GSI1PK format, queue queries
- `lib/booking-assistant/contracts.ts` — State machine transitions
- `lib/booking-assistant/guest-service.ts` — Guest-facing service (saveDraft, markReviewReady, signalCallIntent)
- `lib/booking-assistant/operator-service.ts` — Operator service (pollOperatorQueue, revealPacket)
- `lib/booking-assistant/types.ts` — Canonical types (TravelerRecord, CabinRecord, DecisionsAndConsents)
- `app/api/booking-assistant/queue/route.ts` — Queue API route
- `app/api/booking-assistant/guest/save/route.ts` — Guest save API route
- `app/api/booking-assistant/guest/review-ready/route.ts` — Review-ready API route
- `app/api/booking-assistant/guest/signal/route.ts` — Signal call intent API route
- `app/(tests)/tests/deals-system/booking-assistant/booking-flow-experience.tsx` — Guest UI
- `app/(tests)/tests/deals-system/booking-assistant/guest-api-client.ts` — Guest API client
- `app/(tests)/tests/booking-assistant-operator/page.tsx` — Operator console UI
- `app/(tests)/tests/booking-assistant-operator/guest-info-panel.tsx` — Guest info display

## What's Next

- Verify the full end-to-end flow: refresh operator console → poll queue → existing draft appears → lookup by key → verify → reveal → confirm all guest info visible
- If the existing draft still doesn't appear, a fresh walk-through may be needed to create a draft with the corrected GSI1PK format
- The Quick Send button on the operator console provides a shortcut for testing without re-entering data
