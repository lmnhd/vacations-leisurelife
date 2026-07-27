import assert from "node:assert/strict";

import {
  createAnalyticsAnonymousId,
  projectJournalEvent,
} from "../lib/booking-assistant/analytics-projector.ts";
import type { JournalEventRecord } from "../lib/booking-assistant/activity-journal.ts";
import { bookingJournalEventTypes } from "../lib/booking-assistant/contracts.ts";
import { getBookingEventDefinition } from "../lib/booking-assistant/event-registry.ts";

function run(): void {
  const projection = projectJournalEvent({
    draftId: "private-draft-id",
    eventType: "field_confirmed",
    actorType: "guest",
    occurredAtIso: "2026-07-26T12:00:00.000Z",
    privacyClass: "operational",
    idempotencyKey: "event-1",
    expectedDraftVersion: 2,
    sequence: 2,
    payload: {
      taskId: "email",
      fieldId: "contact.email",
      fieldPrivacy: "tier_b",
      email: "guest@example.com",
      rawText: "private answer",
    },
    contractVersion: 1,
    journalEventId: "journal-1",
    receivedAtIso: "2026-07-26T12:00:01.000Z",
  } as JournalEventRecord, "anon-1");
  assert.ok(projection);
  assert.deepEqual(projection?.dimensions, {
    taskId: "email",
    fieldId: "contact.email",
    fieldPrivacy: "tier_b",
  });
  assert.equal(JSON.stringify(projection).includes("guest@example.com"), false);
  assert.equal(JSON.stringify(projection).includes("private answer"), false);
  const anonymousId = createAnalyticsAnonymousId(
    "private-draft-id",
    "test-analytics-secret-containing-at-least-thirty-two-characters"
  );
  assert.equal(anonymousId.includes("private-draft-id"), false);
  assert.equal(anonymousId.length, 64);
  for (const eventType of bookingJournalEventTypes) {
    assert.ok(getBookingEventDefinition(eventType), `Missing event registry entry for ${eventType}`);
  }
  console.log("Booking Assistant analytics projector tests passed.");
}

run();
