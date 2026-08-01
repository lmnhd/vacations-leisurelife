/**
 * DynamoDB-backed activity event store for published Deals — the Deals-side
 * analog of `lib/campaigns/conversion-store.ts` (`appendLeadEvent` /
 * `listCampaignLeadEvents`). Rides the existing `lll-deals-system` table; events
 * live under a per-deal events partition next to the deal's METADATA record:
 *
 *   PK = DEAL#${dealId}#EVENTS
 *   SK = EVENT#${occurredAt}#${eventId}
 *
 * Writes are best-effort: a missing table (table not yet provisioned) or any
 * Dynamo error is swallowed so analytics can never disturb the public Deal
 * experience — exactly the contract the campaign page-view beacon follows.
 */

import { BatchWriteCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "crypto";

import { chatDynamoDocumentClient } from "@/lib/chat/dynamo-client";
import type { LeadAttribution } from "@/lib/campaigns/types";

import type { DealEvent, DealEventType } from "./deal-event-types";

const TABLE_NAME = process.env.DEALS_SYSTEM_TABLE_NAME ?? "lll-deals-system";

function eventsPartition(dealId: string): string {
  return `DEAL#${dealId}#EVENTS`;
}

function isMissingTableError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "ResourceNotFoundException" ||
      error.message.includes("Requested resource not found"))
  );
}

export interface AppendDealEventInput {
  dealId: string;
  eventType: DealEventType;
  attribution: LeadAttribution;
  /** Visitor email when known; anonymous reach/engagement events omit it. */
  email?: string;
  notes?: string;
  metadata?: Record<string, string>;
}

/**
 * Append a Deal activity event. Best-effort: returns the event on success,
 * `null` if the write was swallowed (missing table / Dynamo error). Callers on
 * the public path should ignore the result.
 */
export async function appendDealEvent(input: AppendDealEventInput): Promise<DealEvent | null> {
  const eventId = randomUUID();
  const occurredAt = new Date().toISOString();

  const event: DealEvent = {
    PK: eventsPartition(input.dealId),
    SK: `EVENT#${occurredAt}#${eventId}`,
    eventId,
    dealId: input.dealId,
    email: input.email?.trim().toLowerCase() || "anonymous",
    eventType: input.eventType,
    occurredAt,
    attribution: input.attribution,
    notes: input.notes,
    metadata: input.metadata,
  };

  try {
    await chatDynamoDocumentClient.send(
      new PutCommand({ TableName: TABLE_NAME, Item: event })
    );
    return event;
  } catch (error) {
    if (!isMissingTableError(error)) {
      console.error(`[deal-events-store] Failed to append ${input.eventType} for ${input.dealId}:`, error);
    }
    return null;
  }
}

/** Query the full activity timeline for one deal, oldest-first. */
export async function listDealEvents(dealId: string): Promise<DealEvent[]> {
  try {
    const response = await chatDynamoDocumentClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
        ExpressionAttributeValues: {
          ":pk": eventsPartition(dealId),
          ":prefix": "EVENT#",
        },
        ScanIndexForward: true,
      })
    );
    return (response.Items as DealEvent[] | undefined) ?? [];
  } catch (error) {
    if (isMissingTableError(error)) {
      return [];
    }
    console.error(`[deal-events-store] Failed to list events for ${dealId}:`, error);
    return [];
  }
}

/**
 * Delete every activity event for one deal (its whole events partition).
 *
 * Used only by the operator's purge action — the analytics timeline is the one
 * part of a deal that is never re-derivable from upstream, so nothing else in
 * the app may call this. Returns the number of events removed. Unlike the
 * best-effort writers above, failures propagate: a purge that silently left
 * events behind would be reported to the operator as a completed delete.
 */
export async function deleteDealEvents(dealId: string): Promise<number> {
  const events = await listDealEvents(dealId);
  if (events.length === 0) return 0;

  // BatchWriteItem caps at 25 items per call.
  let deleted = 0;
  for (let index = 0; index < events.length; index += 25) {
    const chunk = events.slice(index, index + 25);
    let unprocessed: Record<string, unknown[]> | undefined = {
      [TABLE_NAME]: chunk.map((event) => ({
        DeleteRequest: { Key: { PK: event.PK, SK: event.SK } },
      })),
    };

    // BatchWrite can partially succeed; retry whatever Dynamo hands back.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const items = unprocessed?.[TABLE_NAME];
      if (!items || items.length === 0) break;
      const response = await chatDynamoDocumentClient.send(
        new BatchWriteCommand({ RequestItems: unprocessed as never })
      );
      unprocessed = response.UnprocessedItems as Record<string, unknown[]> | undefined;
      if (!unprocessed?.[TABLE_NAME]?.length) break;
      await new Promise((resolve) => setTimeout(resolve, 150 * 2 ** attempt));
    }

    if (unprocessed?.[TABLE_NAME]?.length) {
      throw new Error(
        `Failed to delete ${unprocessed[TABLE_NAME].length} activity events for ${dealId}.`
      );
    }
    deleted += chunk.length;
  }

  return deleted;
}

// ─── Aggregation ─────────────────────────────────────────────────────────────

export interface DealSourceBreakdownEntry {
  sourceChannel: string;
  provider: string;
  providerCampaignId?: string;
  providerAdId?: string;
  views: number;
  uniqueSessions: number;
}

export interface DealActivitySummary {
  dealId: string;
  totalViews: number;
  uniqueSessions: number;
  engagedViews: number;
  bookNowClicks: number;
  linkRequests: number;
  linkEmailsSent: number;
  callbackRequests: number;
  /** Any contact action (link request or callback request). */
  totalActions: number;
  /** totalActions ÷ uniqueSessions, 0 when no sessions. */
  viewToActionRate: number;
  bookingPortalEntries: number;
  /** Guests who left for the direct Cruise Brothers booking page. */
  bookingSelfServeExits: number;
  bookingsConfirmed: number;
  lastActivityAtIso?: string;
  sourceBreakdown: DealSourceBreakdownEntry[];
}

function sessionKey(event: DealEvent): string {
  return event.attribution.sessionId ?? event.eventId;
}

/** One UTC calendar day of a deal's activity, for the over-time charts. */
export interface DealDailyActivityBucket {
  /** UTC calendar day, `YYYY-MM-DD`. */
  dateIso: string;
  views: number;
  uniqueSessions: number;
  engagedViews: number;
  bookNowClicks: number;
  linkRequests: number;
  linkEmailsSent: number;
  callbackRequests: number;
  /** Contact actions (link request or callback request), matching the summary. */
  totalActions: number;
  /** Booking portal sessions started that day. */
  bookingPortalEntries: number;
  /** Guests who took the direct-booking exit instead of the assisted flow. */
  bookingSelfServeExits: number;
  /** Bookings the operator confirmed that day. */
  bookingsConfirmed: number;
}

function emptyDailyBucket(dateIso: string): DealDailyActivityBucket {
  return {
    dateIso,
    views: 0,
    uniqueSessions: 0,
    engagedViews: 0,
    bookNowClicks: 0,
    linkRequests: 0,
    linkEmailsSent: 0,
    callbackRequests: 0,
    totalActions: 0,
    bookingPortalEntries: 0,
    bookingSelfServeExits: 0,
    bookingsConfirmed: 0,
  };
}

function utcDayIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Cap on gap-fill so a corrupt ancient timestamp can't explode the series. */
const MAX_DAILY_BUCKETS = 730;

/**
 * Bucket a deal's events into UTC calendar days, oldest-first, with zero-filled
 * gaps from the first event day through today — so a time axis built from the
 * result shows quiet days as real zeros instead of silently skipping them.
 */
export function computeDealDailyActivity(events: DealEvent[]): DealDailyActivityBucket[] {
  const byDay = new Map<string, DealDailyActivityBucket & { sessionIds: Set<string> }>();

  for (const event of events) {
    const day = event.occurredAt.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;

    let bucket = byDay.get(day);
    if (!bucket) {
      bucket = { ...emptyDailyBucket(day), sessionIds: new Set<string>() };
      byDay.set(day, bucket);
    }

    switch (event.eventType) {
      case "deal_page_view":
        bucket.views += 1;
        bucket.sessionIds.add(sessionKey(event));
        break;
      case "deal_engaged":
        bucket.engagedViews += 1;
        break;
      case "book_now_click":
        bucket.bookNowClicks += 1;
        break;
      case "link_requested":
        bucket.linkRequests += 1;
        bucket.totalActions += 1;
        break;
      case "link_email_sent":
        bucket.linkEmailsSent += 1;
        break;
      case "callback_requested":
        bucket.callbackRequests += 1;
        bucket.totalActions += 1;
        break;
      case "booking_portal_entered":
        bucket.bookingPortalEntries += 1;
        break;
      case "booking_self_serve_opened":
        bucket.bookingSelfServeExits += 1;
        break;
      case "booking_confirmed":
        bucket.bookingsConfirmed += 1;
        break;
      default:
        break;
    }
  }

  if (byDay.size === 0) return [];

  const days = Array.from(byDay.keys()).sort();
  const today = new Date();
  const start = new Date(`${days[0]}T00:00:00.000Z`);
  const filled: DealDailyActivityBucket[] = [];

  for (
    let cursor = start, i = 0;
    utcDayIso(cursor) <= utcDayIso(today) && i < MAX_DAILY_BUCKETS;
    cursor = new Date(cursor.getTime() + 86_400_000), i += 1
  ) {
    const day = utcDayIso(cursor);
    const bucket = byDay.get(day);
    filled.push(
      bucket
        ? (({ sessionIds, ...rest }) => ({ ...rest, uniqueSessions: sessionIds.size }))(bucket)
        : emptyDailyBucket(day)
    );
  }

  return filled;
}

/**
 * The most recent `n` UTC days (today inclusive) as a fixed-length window,
 * zero-filled where the deal has no bucket — the card sparkline's shape.
 */
export function lastNDailyBuckets(
  buckets: DealDailyActivityBucket[],
  n: number
): DealDailyActivityBucket[] {
  const byDay = new Map(buckets.map((bucket) => [bucket.dateIso, bucket]));
  const out: DealDailyActivityBucket[] = [];
  const todayMs = Date.now();
  for (let i = n - 1; i >= 0; i -= 1) {
    const day = utcDayIso(new Date(todayMs - i * 86_400_000));
    out.push(byDay.get(day) ?? emptyDailyBucket(day));
  }
  return out;
}

/**
 * Roll a deal's events into operator-facing reach + action metrics. Mirrors
 * `computeLandingTrafficSummary` / `computeFunnelSummary` in spirit: views and
 * unique sessions from the view stream, contact actions from the action stream,
 * and a source breakdown for ad attribution.
 */
export function computeDealActivitySummary(dealId: string, events: DealEvent[]): DealActivitySummary {
  const viewEvents = events.filter((event) => event.eventType === "deal_page_view");
  const allSessions = new Set<string>();
  const sourceMap = new Map<string, DealSourceBreakdownEntry & { sessionIds: Set<string> }>();

  for (const event of viewEvents) {
    const session = sessionKey(event);
    allSessions.add(session);

    const channel = event.attribution.sourceChannel ?? "direct";
    const provider = event.attribution.provider ?? "direct";
    const providerCampaignId = event.attribution.providerCampaignId;
    const providerAdId = event.attribution.providerAdId;
    const key = [channel, provider, providerCampaignId ?? "", providerAdId ?? ""].join("::");
    const existing = sourceMap.get(key);

    if (existing) {
      existing.views += 1;
      existing.sessionIds.add(session);
    } else {
      sourceMap.set(key, {
        sourceChannel: channel,
        provider,
        providerCampaignId,
        providerAdId,
        views: 1,
        uniqueSessions: 1,
        sessionIds: new Set([session]),
      });
    }
  }

  const count = (type: DealEventType) => events.filter((event) => event.eventType === type).length;
  const linkRequests = count("link_requested");
  const callbackRequests = count("callback_requested");
  const uniqueSessions = allSessions.size;
  const totalActions = linkRequests + callbackRequests;
  const lastActivityAtIso = events.length > 0 ? events[events.length - 1].occurredAt : undefined;

  const sourceBreakdown: DealSourceBreakdownEntry[] = Array.from(sourceMap.values())
    .map(({ sessionIds, ...entry }) => ({ ...entry, uniqueSessions: sessionIds.size }))
    .sort((a, b) => b.views - a.views);

  return {
    dealId,
    totalViews: viewEvents.length,
    uniqueSessions,
    engagedViews: count("deal_engaged"),
    bookNowClicks: count("book_now_click"),
    linkRequests,
    linkEmailsSent: count("link_email_sent"),
    callbackRequests,
    totalActions,
    viewToActionRate: uniqueSessions > 0 ? totalActions / uniqueSessions : 0,
    bookingPortalEntries: count("booking_portal_entered"),
    bookingSelfServeExits: count("booking_self_serve_opened"),
    bookingsConfirmed: count("booking_confirmed"),
    lastActivityAtIso,
    sourceBreakdown,
  };
}

// ─── Booking portal funnel + leads ───────────────────────────────────────────

export const BOOKING_FUNNEL_STAGES = [
  { key: "entered", label: "Entered portal", eventType: "booking_portal_entered" },
  { key: "contact", label: "Contact captured", eventType: "booking_contact_captured" },
  { key: "saved", label: "Packet saved", eventType: "booking_packet_saved" },
  { key: "review", label: "Review ready", eventType: "booking_review_ready" },
  { key: "call", label: "Call requested", eventType: "booking_call_requested" },
  { key: "confirmed", label: "Booked", eventType: "booking_confirmed" },
] as const;

export type BookingFunnelStageKey = (typeof BOOKING_FUNNEL_STAGES)[number]["key"];

export interface DealBookingFunnelStage {
  key: BookingFunnelStageKey;
  label: string;
  /** Distinct guests/sessions that reached the stage (not raw event count). */
  count: number;
}

/**
 * Distinct-count funnel over the booking milestone events. Each stage counts
 * unique identities — sessions for the entry beacon, emails for contact
 * capture, draft ids for draft-backed stages — so a guest who bounces through
 * `review_ready` twice still counts once.
 */
export function computeDealBookingFunnel(events: DealEvent[]): DealBookingFunnelStage[] {
  const identities = new Map<BookingFunnelStageKey, Set<string>>(
    BOOKING_FUNNEL_STAGES.map((stage) => [stage.key, new Set<string>()])
  );

  for (const event of events) {
    const stage = BOOKING_FUNNEL_STAGES.find((s) => s.eventType === event.eventType);
    if (!stage) continue;
    const identity =
      stage.key === "entered"
        ? sessionKey(event)
        : stage.key === "contact"
          ? event.email
          : (event.metadata?.draftId ?? event.eventId);
    identities.get(stage.key)?.add(identity);
  }

  return BOOKING_FUNNEL_STAGES.map((stage) => ({
    key: stage.key,
    label: stage.label,
    count: identities.get(stage.key)?.size ?? 0,
  }));
}

const LEAD_STAGE_RANK: Record<BookingFunnelStageKey, number> = {
  entered: 0,
  contact: 1,
  saved: 2,
  review: 3,
  call: 4,
  confirmed: 5,
};

export interface DealBookingLead {
  email: string;
  firstName?: string;
  /** Present once the guest's draft was persisted server-side. */
  draftId?: string;
  furthestStage: BookingFunnelStageKey;
  furthestStageLabel: string;
  firstSeenAtIso: string;
  lastSeenAtIso: string;
  confirmed: boolean;
}

/**
 * Identified booking-portal guests — including partial leads who confirmed
 * name+email in the flow but never completed a save. Keyed by email; draft
 * milestone events (which carry only a draftId) join through the
 * `booking_packet_saved` event that carries both.
 */
export function computeDealBookingLeads(events: DealEvent[]): DealBookingLead[] {
  const byEmail = new Map<string, DealBookingLead>();
  const draftToEmail = new Map<string, string>();

  const touch = (email: string, event: DealEvent, stage: BookingFunnelStageKey) => {
    const existing = byEmail.get(email);
    const firstName = event.metadata?.guestFirstName;
    const draftId = event.metadata?.draftId;
    if (!existing) {
      byEmail.set(email, {
        email,
        firstName,
        draftId,
        furthestStage: stage,
        furthestStageLabel: BOOKING_FUNNEL_STAGES.find((s) => s.key === stage)?.label ?? stage,
        firstSeenAtIso: event.occurredAt,
        lastSeenAtIso: event.occurredAt,
        confirmed: stage === "confirmed",
      });
      return;
    }
    existing.firstName = existing.firstName ?? firstName;
    existing.draftId = existing.draftId ?? draftId;
    if (event.occurredAt < existing.firstSeenAtIso) existing.firstSeenAtIso = event.occurredAt;
    if (event.occurredAt > existing.lastSeenAtIso) existing.lastSeenAtIso = event.occurredAt;
    if (LEAD_STAGE_RANK[stage] > LEAD_STAGE_RANK[existing.furthestStage]) {
      existing.furthestStage = stage;
      existing.furthestStageLabel =
        BOOKING_FUNNEL_STAGES.find((s) => s.key === stage)?.label ?? stage;
    }
    if (stage === "confirmed") existing.confirmed = true;
  };

  for (const event of events) {
    const stage = BOOKING_FUNNEL_STAGES.find((s) => s.eventType === event.eventType)?.key;
    if (!stage || stage === "entered") continue;

    const draftId = event.metadata?.draftId;
    let email = event.email !== "anonymous" ? event.email : undefined;
    if (email && draftId) draftToEmail.set(draftId, email);
    if (!email && draftId) email = draftToEmail.get(draftId);
    if (!email) continue;

    touch(email, event, stage);
  }

  return Array.from(byEmail.values()).sort((a, b) =>
    b.lastSeenAtIso.localeCompare(a.lastSeenAtIso)
  );
}
