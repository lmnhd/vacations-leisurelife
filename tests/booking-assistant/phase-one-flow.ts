import assert from "node:assert/strict";

import {
  buildJourneyReplay,
  buildTaskList,
  emptyDraft,
  fallbackCallKey,
  isValidEmail,
  isValidPhone,
  nextTaskId,
  rateQualificationClaimsForTraveler,
  serviceRateSummary,
  type MockJournalEvent,
} from "../../app/(tests)/tests/deals-system/booking-assistant/booking-flow-model.ts";

function testDynamicTravelerTasks(): void {
  const draft = emptyDraft();
  draft.travelerCount = 3;
  draft.travelers = [
    { title: "", gender: "", firstName: "Ana", middleName: "", lastName: "", dob: "", age: "70" },
    { title: "", gender: "", firstName: "Ben", middleName: "", lastName: "", dob: "", age: "68" },
    { title: "", gender: "", firstName: "Cam", middleName: "", lastName: "", dob: "", age: "44" },
  ];

  const taskIds = buildTaskList(draft).map((task) => task.id);
  assert.equal(taskIds.includes("legal_identity_0"), true);
  assert.equal(taskIds.includes("legal_identity_1"), true);
  assert.equal(taskIds.includes("legal_identity_2"), true);
  assert.equal(taskIds.includes("legal_identity_3"), false);
  assert.equal(nextTaskId(draft), "first_name");
}

function testContactValidation(): void {
  assert.equal(isValidEmail("guest@example.com"), true);
  assert.equal(isValidEmail("guest @example.com"), false);
  assert.equal(isValidPhone("+1 (555) 201-7744"), true);
  assert.equal(isValidPhone("555-12"), false);
}

function testStableFallbackKey(): void {
  assert.equal(fallbackCallKey("mock-msc-summer"), "MAP");
  assert.equal(fallbackCallKey("draft-one"), fallbackCallKey("draft-one"));
  assert.equal(fallbackCallKey("draft-one").length, 3);
}

function testClaimsStayWithEachTraveler(): void {
  const draft = emptyDraft();
  draft.travelerCount = 3;
  draft.travelers = [
    { title: "", gender: "", firstName: "Ana", middleName: "", lastName: "", dob: "", age: "70" },
    { title: "", gender: "", firstName: "Ben", middleName: "", lastName: "", dob: "", age: "68" },
    { title: "", gender: "", firstName: "Cam", middleName: "", lastName: "", dob: "", age: "44" },
  ];
  draft.serviceRateInterest = "yes";
  draft.serviceRateClaims = [
    {
      travelerIndex: 0,
      category: "Retired military",
      proofReadiness: "available_later",
    },
    {
      travelerIndex: 2,
      category: "First responder - police, fire, or EMS",
      proofReadiness: "need_help",
    },
  ];

  const firstTravelerClaims = rateQualificationClaimsForTraveler(draft, 0);
  const secondTravelerClaims = rateQualificationClaimsForTraveler(draft, 1);
  const thirdTravelerClaims = rateQualificationClaimsForTraveler(draft, 2);

  assert.equal(firstTravelerClaims.length, 1);
  assert.equal(firstTravelerClaims[0].type, "military");
  assert.equal(firstTravelerClaims[0].proofReadiness, "available_later");
  assert.equal(secondTravelerClaims.length, 0);
  assert.equal(thirdTravelerClaims.length, 1);
  assert.equal(thirdTravelerClaims[0].type, "first_responder");
  assert.equal(serviceRateSummary(draft).includes("Ana"), true);
  assert.equal(serviceRateSummary(draft).includes("Cam"), true);
}

function testJourneyReplay(): void {
  const journal: MockJournalEvent[] = [
    {
      seq: 1,
      atIso: "2026-07-25T12:00:00.000Z",
      actor: "guest",
      eventType: "booking_assistant_opened",
      detail: "Opened",
    },
    {
      seq: 2,
      atIso: "2026-07-25T12:00:01.000Z",
      actor: "guest",
      eventType: "field_confirmed",
      detail: "First name confirmed",
      taskId: "first_name",
    },
    {
      seq: 3,
      atIso: "2026-07-25T12:00:02.000Z",
      actor: "system",
      eventType: "booking_packet_reviewed",
      detail: "Reviewed",
    },
  ];

  const replay = buildJourneyReplay(journal);
  assert.equal(replay[0].state, "completed");
  assert.equal(replay[1].state, "completed");
  assert.equal(replay[2].state, "active");
  assert.equal(replay[3].state, "not_started");
  assert.equal(replay[2].lastEventType, "booking_packet_reviewed");
}

function run(): void {
  testDynamicTravelerTasks();
  testContactValidation();
  testStableFallbackKey();
  testClaimsStayWithEachTraveler();
  testJourneyReplay();
  console.log("Booking Assistant Phase 1 flow tests passed.");
}

run();
