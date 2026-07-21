/**
 * Append-only Booking Activity Journal writer.
 *
 * Per plan Section 10.8 and 12.1:
 * - Every event uses a versioned envelope
 * - Events are append-only (corrections supersede, never rewrite)
 * - Journal sequence is monotonic within a draft
 * - State-changing mutations and their journal result commit transactionally
 * - Failed journal writes fail the mutation
 */

import type { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  PutItemCommand,
  QueryCommand,
} from "@aws-sdk/client-dynamodb";

import {
  BOOKING_CONTRACT_VERSION,
  type BookingJournalEventType,
} from "./contracts";

/** Privacy-safe payload (no Tier B/C/D values). */
export interface JournalPayload {
  [key: string]: unknown;
}

export interface JournalEventInput {
  draftId: string;
  eventType: BookingJournalEventType;
  actorType: "guest" | "assistant" | "operator" | "system" | "reconciliation";
  occurredAtIso: string;
  privacyClass: "operational" | "booking_pii" | "highly_sensitive";
  idempotencyKey: string;
  expectedDraftVersion: number;
  sequence: number;
  payload: JournalPayload;
}

export interface JournalEventRecord extends JournalEventInput {
  contractVersion: typeof BOOKING_CONTRACT_VERSION;
  journalEventId: string;
  receivedAtIso: string;
}

function generateEventId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function skForEvent(occurredAtIso: string, eventId: string): string {
  return `EVENT#${occurredAtIso}#${eventId}`;
}

/**
 * Write a single journal event. This is the atomic unit — callers
 * must ensure this succeeds before considering a state mutation complete.
 */
export async function writeJournalEvent(
  dynamo: DynamoDBClient,
  tableName: string,
  input: JournalEventInput
): Promise<JournalEventRecord> {
  const journalEventId = generateEventId();
  const receivedAtIso = new Date().toISOString();
  const pk = `DRAFT#${input.draftId}`;
  const sk = skForEvent(input.occurredAtIso, journalEventId);

  const item: Record<string, { S?: string; N?: string; M?: Record<string, { S?: string; N?: string }> }> = {
    pk: { S: pk },
    sk: { S: sk },
    journalEventId: { S: journalEventId },
    contractVersion: { N: String(BOOKING_CONTRACT_VERSION) },
    eventType: { S: input.eventType },
    actorType: { S: input.actorType },
    occurredAtIso: { S: input.occurredAtIso },
    receivedAtIso: { S: receivedAtIso },
    privacyClass: { S: input.privacyClass },
    idempotencyKey: { S: input.idempotencyKey },
    expectedDraftVersion: { N: String(input.expectedDraftVersion) },
    sequence: { N: String(input.sequence) },
    payload: { M: serializePayload(input.payload) },
  };

  await dynamo.send(
    new PutItemCommand({
      TableName: tableName,
      Item: item as never,
    })
  );

  return {
    ...input,
    contractVersion: BOOKING_CONTRACT_VERSION,
    journalEventId,
    receivedAtIso,
  };
}

/** Query journal events for a draft, ordered by SK (chronological). */
export async function queryJournalEvents(
  dynamo: DynamoDBClient,
  tableName: string,
  draftId: string,
  opts?: { limit?: number; lastEvaluatedKey?: Record<string, unknown> }
): Promise<{ events: JournalEventRecord[]; lastEvaluatedKey?: Record<string, unknown> }> {
  const pk = `DRAFT#${draftId}`;
  const result = await dynamo.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
      ExpressionAttributeValues: {
        ":pk": { S: pk },
        ":prefix": { S: "EVENT#" },
      },
      Limit: opts?.limit ?? 50,
      ExclusiveStartKey: opts?.lastEvaluatedKey as never,
      ScanIndexForward: true,
    })
  );

  const events: JournalEventRecord[] = (result.Items ?? []).map(parseJournalItem);
  return {
    events,
    lastEvaluatedKey: result.LastEvaluatedKey as Record<string, unknown> | undefined,
  };
}

function serializePayload(payload: JournalPayload): Record<string, { S?: string; N?: string }> {
  const out: Record<string, { S?: string; N?: string }> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (typeof value === "string") {
      out[key] = { S: value };
    } else if (typeof value === "number") {
      out[key] = { N: String(value) };
    } else if (typeof value === "boolean") {
      out[key] = { S: String(value) };
    } else if (value !== null && value !== undefined) {
      out[key] = { S: JSON.stringify(value) };
    }
  }
  return out;
}

function parseJournalItem(item: Record<string, unknown>): JournalEventRecord {
  const get = (key: string): string => {
    const val = item[key] as { S?: string; N?: string } | undefined;
    return val?.S ?? val?.N ?? "";
  };
  return {
    draftId: get("pk").replace("DRAFT#", ""),
    eventType: get("eventType") as BookingJournalEventType,
    actorType: get("actorType") as JournalEventInput["actorType"],
    occurredAtIso: get("occurredAtIso"),
    privacyClass: get("privacyClass") as JournalEventInput["privacyClass"],
    idempotencyKey: get("idempotencyKey"),
    expectedDraftVersion: Number(get("expectedDraftVersion")),
    sequence: Number(get("sequence")),
    payload: {},
    contractVersion: Number(get("contractVersion")) as typeof BOOKING_CONTRACT_VERSION,
    journalEventId: get("journalEventId"),
    receivedAtIso: get("receivedAtIso"),
  };
}
