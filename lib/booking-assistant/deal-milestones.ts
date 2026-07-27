/**
 * Booking → Deal analytics milestone bridge.
 *
 * The Booking Activity Journal stays the system of record (per-draft,
 * PII-tiered, transactional). This module projects a handful of anonymousish
 * funnel milestones into the deal's existing activity events partition
 * (`lib/cb/deals-system/deal-events-store.ts`) so the operator dashboard's
 * charts, funnel, and leads list light up — without new tables or queries.
 *
 * Contract: every emission is fire-and-forget and rides `appendDealEvent`'s
 * swallow-on-error behavior. A milestone must NEVER fail or slow a booking
 * mutation; callers do not await these.
 */

import { GetItemCommand, type DynamoDBClient } from "@aws-sdk/client-dynamodb";

import { appendDealEvent } from "@/lib/cb/deals-system/deal-events-store";
import type { DealEventType } from "@/lib/cb/deals-system/deal-event-types";

export type BookingMilestoneType = Extract<
  DealEventType,
  | "booking_packet_saved"
  | "booking_review_ready"
  | "booking_call_requested"
  | "booking_confirmed"
  | "booking_cancelled"
>;

export interface BookingMilestoneInput {
  dealId: string;
  eventType: BookingMilestoneType;
  draftId: string;
  /** Guest email when known — powers the dashboard's booking-leads list. */
  email?: string;
  /** Guest first name when known; travels in metadata (never in the journal's place). */
  firstName?: string;
  status?: string;
}

/** Fire-and-forget: never await from a booking mutation path. */
export function emitBookingMilestone(input: BookingMilestoneInput): void {
  void appendDealEvent({
    dealId: input.dealId,
    eventType: input.eventType,
    email: input.email,
    attribution: { sourceChannel: "booking_portal" },
    metadata: {
      eventFamily: "booking_flow",
      draftId: input.draftId,
      ...(input.firstName ? { guestFirstName: input.firstName } : {}),
      ...(input.status ? { bookingStatus: input.status } : {}),
    },
  }).catch(() => {
    // appendDealEvent already swallows; this guards the promise chain itself.
  });
}

/**
 * Emit a milestone when the caller only holds a draftId (review-ready, call
 * signal, operator outcomes): resolves the dealId with a projected point-read
 * of the draft META record, then emits. Still fire-and-forget end to end.
 */
export function emitBookingMilestoneForDraft(
  dynamo: DynamoDBClient,
  tableName: string,
  input: Omit<BookingMilestoneInput, "dealId">
): void {
  void (async () => {
    const meta = await dynamo.send(
      new GetItemCommand({
        TableName: tableName,
        Key: { PK: { S: `DRAFT#${input.draftId}` }, SK: { S: "META" } },
        ProjectionExpression: "dealId",
      })
    );
    const dealId = meta.Item?.dealId?.S;
    if (!dealId) return;
    emitBookingMilestone({ ...input, dealId });
  })().catch(() => {
    // Analytics only — never disturb the booking flow.
  });
}
