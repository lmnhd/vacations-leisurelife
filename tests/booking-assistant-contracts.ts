import assert from "node:assert/strict";

import {
  BOOKING_CONTRACT_VERSION,
  BOOKING_FLOW_ID,
  COMPLETION_MODE,
  bookingDraftStatuses,
  bookingFlowDefinition,
  bookingJournalEventTypes,
  bookingStatusTransitions,
  canTransitionBookingStatus,
  completionModeRegistry,
  terminalBookingDraftStatuses,
} from "../lib/booking-assistant/contracts.ts";

function run(): void {
  assert.equal(bookingFlowDefinition.id, BOOKING_FLOW_ID);
  assert.equal(bookingFlowDefinition.completionMode, COMPLETION_MODE);
  assert.equal(completionModeRegistry[COMPLETION_MODE].collectsCardData, false);
  assert.equal(completionModeRegistry[COMPLETION_MODE].operatorSurface, "local_only");
  assert.equal(BOOKING_CONTRACT_VERSION, 1);

  assert.equal(canTransitionBookingStatus("review_ready", "ready_to_call_agent"), true);
  assert.equal(canTransitionBookingStatus("ready_to_call_agent", "call_signal_pending"), true);
  assert.equal(canTransitionBookingStatus("call_signal_pending", "calling_now"), true);
  assert.equal(canTransitionBookingStatus("calling_now", "booking_confirmed"), false);
  assert.equal(canTransitionBookingStatus("booking_confirmed", "collecting"), false);

  // A guest who re-submits review after it already succeeded (e.g. by going Back
  // into the flow) lands on an already-advanced draft. Re-running the review
  // transition from ready_to_call_agent is illegal, which is why the review-ready
  // route must treat these states as an idempotent success instead of attempting
  // the transition. Neither of these may become "valid" without revisiting that
  // guard (app/api/booking-assistant/guest/review-ready/route.ts).
  assert.equal(canTransitionBookingStatus("ready_to_call_agent", "review_ready"), false);
  assert.equal(canTransitionBookingStatus("review_ready", "review_ready"), false);

  for (const status of bookingDraftStatuses) {
    assert.ok(status in bookingStatusTransitions, `Missing transition contract for ${status}`);
  }

  for (const status of terminalBookingDraftStatuses) {
    assert.equal(bookingStatusTransitions[status].length, 0, `${status} must be terminal`);
  }

  const requiredCallEvents = [
    "booking_packet_reviewed",
    "call_launch_requested",
    "operator_call_draft_pinned",
    "caller_verification_recorded",
    "agent_processing_started",
    "call_outcome_recorded",
    "booking_confirmed",
  ] as const;

  for (const eventType of requiredCallEvents) {
    assert.equal(bookingJournalEventTypes.includes(eventType), true, `Missing ${eventType}`);
  }

  console.log("Booking Assistant contract checks passed.");
}

run();
