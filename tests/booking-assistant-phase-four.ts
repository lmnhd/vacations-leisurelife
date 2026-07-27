import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import type { JournalEventRecord } from "../lib/booking-assistant/activity-journal.ts";
import { canTransitionBookingStatus } from "../lib/booking-assistant/contracts.ts";
import { buildJourneyReplay } from "../lib/booking-assistant/journey-replay.ts";
import { outcomeToStatus } from "../lib/booking-assistant/operator-service.ts";
import { buildOperatorHandoffPushContent } from "../lib/booking-assistant/guest-service.ts";

function event(
  sequence: number,
  eventType: JournalEventRecord["eventType"],
  payload: JournalEventRecord["payload"] = {}
): JournalEventRecord {
  return {
    contractVersion: 1,
    journalEventId: `event-${sequence}`,
    draftId: "draft-phase-four",
    eventType,
    actorType: "operator",
    occurredAtIso: `2026-07-26T12:00:0${sequence}.000Z`,
    receivedAtIso: `2026-07-26T12:00:0${sequence}.000Z`,
    privacyClass: "operational",
    idempotencyKey: `idempotency-${sequence}`,
    expectedDraftVersion: 4,
    sequence,
    payload,
  };
}

function run(): void {
  const push = buildOperatorHandoffPushContent({
    metadata: {
      bookingDraftId: "draft-long-internal-identifier",
      personId: "person-1",
      dealId: "1576786",
      packageId: "1576786",
      siid: "1049337",
      status: "call_signal_pending",
      urgency: "urgent",
      flowDefinitionVersion: 1,
      bookingFlowVersion: 1,
      completionMode: "call_agent_to_finalize_v1",
      completionModeVersion: 1,
      packetVersion: 1,
      createdAtIso: "2026-07-26T03:00:00.000Z",
      updatedAtIso: "2026-07-26T03:00:00.000Z",
      lastGuestActivityAtIso: "2026-07-26T03:00:00.000Z",
      lastMeaningfulGuestActivityAtIso: "2026-07-26T03:00:00.000Z",
      journalSequence: 1,
      version: 1,
    },
    dealSnapshot: {
      dealId: "1576786",
      packageId: "1576786",
      siid: "1049337",
      cruiseLine: "Royal Caribbean",
      ship: "Allure of the Seas",
      sailingDateIso: "2027-02-08",
      nights: 6,
      departurePort: "Miami",
      itineraryLabel: "Caribbean",
      dealAngle: "Balcony value",
      priceDisplay: "$999",
      currency: "USD",
      taxFeeBasis: "per person",
      priceCapturedAtIso: "2026-07-26T03:00:00.000Z",
      sourceBookingUrl: "https://example.com",
      linkHealthState: "healthy",
    },
    contact: {
      firstName: "Private",
      email: "private@example.com",
      phoneE164: "+19049303575",
      preferredChannel: "phone",
      emailVerified: false,
      phoneVerified: false,
      transactionalEmailConsent: true,
      callbackConsent: true,
      smsConsent: false,
      marketingConsent: false,
    },
  }, "MAP");
  assert.equal(push.title, "Booking Assistant live call - Allure of the Seas");
  assert.equal(push.message.includes("LIVE CALL WAITING"), true);
  assert.equal(push.message.includes("Allure of the Seas - Feb 8, 2027"), true);
  assert.equal(push.message.includes("Deal 1576786 - Guest phone ending 3575"), true);
  assert.equal(push.message.includes("Call key: MAP"), true);
  assert.equal(push.message.includes("draft-long-internal-identifier"), false);
  assert.equal(push.message.includes("private@example.com"), false);

  const replay = buildJourneyReplay([
    event(3, "operator_timeline_accessed"),
    event(2, "caller_verification_recorded"),
    event(1, "call_launch_requested"),
  ]);
  assert.deepEqual(
    replay.map((step) => step.eventType),
    ["call_launch_requested", "caller_verification_recorded"]
  );

  assert.equal(outcomeToStatus("confirmed"), "reconciliation_review");
  assert.equal(outcomeToStatus("completed_pending_reconciliation"), "reconciliation_review");
  assert.equal(outcomeToStatus("payment_failed"), "payment_failed");
  assert.equal(
    canTransitionBookingStatus("agent_processing", "cancelled"),
    true,
    "An expired processing claim needs an audited cancellation path"
  );
  assert.equal(
    canTransitionBookingStatus("cancelled", "collecting"),
    true,
    "A guest-owned draft dismissed from the queue must be recoverable when the guest resumes"
  );

  const dashboard = readFileSync(
    "app/(tests)/tests/deals-system/dashboard-view.tsx",
    "utf8"
  );
  assert.equal(dashboard.includes('id: "bookings"'), true);
  assert.equal(dashboard.includes("<BookingAssistantOperatorWorkspace embedded />"), true);

  const queueRoute = readFileSync("app/api/booking-assistant/queue/route.ts", "utf8");
  for (const requiredStatus of [
    "calling_now",
    "agent_claimed",
    "agent_processing",
    "reconciliation_review",
  ]) {
    assert.equal(queueRoute.includes(`"${requiredStatus}"`), true);
  }

  const reconcileRoute = readFileSync(
    "app/api/booking-assistant/reconcile/route.ts",
    "utf8"
  );
  assert.equal(reconcileRoute.includes("createOperatorRouteContext"), true);
  assert.equal(reconcileRoute.includes("bookingReference"), true);

  const guestResumeRoute = readFileSync(
    "app/api/booking-assistant/guest/resume/[draftId]/route.ts",
    "utf8"
  );
  assert.equal(
    guestResumeRoute.includes("result: { draft: result.draft }"),
    true,
    "Guest resume response must match the client ApiResult contract"
  );

  const guestFlow = readFileSync(
    "app/(tests)/tests/deals-system/booking-assistant/booking-flow-experience.tsx",
    "utf8"
  );
  assert.equal(
    guestFlow.includes("window.location.href = `tel:${configuredAgentPhone}`"),
    true,
    "Successful handoff persistence must launch the configured phone number"
  );
  assert.equal(
    guestFlow.includes('apiRequestHumanHelp(serverDraftId, serverDraftVersionRef.current, taskId)'),
    true,
    "Get help now must call the real guest help route before showing the help screen"
  );
  assert.equal(
    guestFlow.includes('{isPrototype ? "(Simulated.) " : ""}'),
    true,
    "Production help screen copy must stop claiming the alert is simulated"
  );

  const guestService = readFileSync("lib/booking-assistant/guest-service.ts", "utf8");
  assert.equal(guestService.includes("void getDraft("), true);
  assert.equal(guestService.includes("return sendAdminPushNotification("), true);
  assert.equal(
    guestService.includes("Optional Pushover handoff notification was not delivered"),
    true
  );
  assert.equal(
    guestService.includes("expectedVersion: currentDraft.metadata.version"),
    true,
    "Call signaling must reconcile harmless client-version drift against the authorized server draft"
  );
  assert.equal(
    guestService.includes('currentDraft.metadata.status === "call_signal_pending"'),
    true,
    "Repeating an already-persisted call signal must be idempotent"
  );
  assert.equal(
    guestFlow.includes('prev.status === "call_signal_pending"'),
    true,
    "A rejected signal must restore the guest call button instead of leaving the screen stuck"
  );

  const operatorWorkspace = readFileSync(
    "app/(tests)/tests/booking-assistant-operator/page.tsx",
    "utf8"
  );
  assert.equal(
    operatorWorkspace.includes("Ignored stale detail"),
    true,
    "An older detail response must not overwrite a completed pin or verification"
  );
  assert.equal(
    operatorWorkspace.includes("data.result.currentState.version < currentVersion"),
    true
  );
  assert.equal(
    operatorWorkspace.includes("wouldRegressActiveCallStatus("),
    true,
    "A detail refresh must not move an active call backward in its lifecycle"
  );
  assert.equal(
    operatorWorkspace.includes("activeDraftStatus === 'call_signal_pending' && !verified"),
    true,
    "A verified call must not expose the acknowledge action again"
  );
  assert.equal(
    operatorWorkspace.includes(
      "activeDraftStatus === 'call_signal_pending' ||"
    ),
    true,
    "The checklist must survive a transient stale call-signal status after verification"
  );
  assert.equal(operatorWorkspace.includes("Close stale draft"), true);
  assert.equal(
    operatorWorkspace.includes("expired_processing_claim_cleanup"),
    true
  );

  const operatorService = readFileSync(
    "lib/booking-assistant/operator-service.ts",
    "utf8"
  );
  assert.equal(
    operatorService.includes("An actively leased booking cannot be dismissed"),
    true,
    "Active processing work must remain protected from dismissal"
  );

  console.log("Booking Assistant Phase 4 tests passed.");
}

run();
