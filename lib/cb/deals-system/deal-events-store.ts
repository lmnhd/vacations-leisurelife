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

import { PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
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
  lastActivityAtIso?: string;
  sourceBreakdown: DealSourceBreakdownEntry[];
}

function sessionKey(event: DealEvent): string {
  return event.attribution.sessionId ?? event.eventId;
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
    lastActivityAtIso,
    sourceBreakdown,
  };
}
