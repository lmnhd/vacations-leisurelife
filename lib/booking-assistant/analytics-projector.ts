import { getBookingEventDefinition } from "./event-registry";
import type { JournalEventRecord } from "./activity-journal";
import { createHmac } from "node:crypto";
import { PutItemCommand, type DynamoDBClient } from "@aws-sdk/client-dynamodb";
import type { DraftStoreConfig } from "./store";

export interface BookingAnalyticsProjection {
  eventId: string;
  eventType: string;
  eventVersion: number;
  occurredAtIso: string;
  actorType: string;
  draftAnonymousId: string;
  sequence: number;
  dimensions: Record<string, string | number | boolean>;
}

function safeDimension(value: unknown): string | number | boolean | null {
  if (typeof value === "string") return value.slice(0, 120);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean") return value;
  return null;
}

export function projectJournalEvent(
  event: JournalEventRecord,
  draftAnonymousId: string
): BookingAnalyticsProjection | null {
  const definition = getBookingEventDefinition(event.eventType);
  if (!definition) return null;
  const dimensions: Record<string, string | number | boolean> = {};
  for (const key of definition.analyticsFields) {
    const value = safeDimension(event.payload[key]);
    if (value !== null) dimensions[key] = value;
  }
  return {
    eventId: event.journalEventId,
    eventType: event.eventType,
    eventVersion: definition.version,
    occurredAtIso: event.occurredAtIso,
    actorType: event.actorType,
    draftAnonymousId,
    sequence: event.sequence,
    dimensions,
  };
}

export function createAnalyticsAnonymousId(draftId: string, secret: string): string {
  if (secret.length < 32) throw new Error("Analytics projection secret must contain at least 32 characters");
  return createHmac("sha256", secret).update(draftId).digest("hex");
}

export async function writeAnalyticsProjection(
  dynamo: DynamoDBClient,
  config: DraftStoreConfig,
  projection: BookingAnalyticsProjection
): Promise<void> {
  const dimensions: Record<string, { S?: string; N?: string }> = {};
  for (const [key, value] of Object.entries(projection.dimensions)) {
    dimensions[key] = typeof value === "number" ? { N: String(value) } : { S: String(value) };
  }
  await dynamo.send(
    new PutItemCommand({
      TableName: config.tableName,
      Item: {
        PK: { S: `ANALYTICS#${projection.draftAnonymousId}` },
        SK: { S: `EVENT#${projection.occurredAtIso}#${projection.eventId}` },
        eventId: { S: projection.eventId },
        eventType: { S: projection.eventType },
        eventVersion: { N: String(projection.eventVersion) },
        occurredAtIso: { S: projection.occurredAtIso },
        actorType: { S: projection.actorType },
        sequence: { N: String(projection.sequence) },
        ...(Object.keys(dimensions).length > 0 ? { dimensions: { M: dimensions } } : {}),
      } as never,
      ConditionExpression: "attribute_not_exists(PK)",
    })
  );
}

export async function projectJournalEventIfConfigured(
  dynamo: DynamoDBClient,
  config: DraftStoreConfig,
  event: JournalEventRecord
): Promise<boolean> {
  const secret = process.env.BOOKING_ASSISTANT_ANALYTICS_HMAC_SECRET?.trim();
  if (!secret) return false;
  const anonymousId = createAnalyticsAnonymousId(event.draftId, secret);
  const projection = projectJournalEvent(event, anonymousId);
  if (!projection) return false;
  try {
    await writeAnalyticsProjection(dynamo, config, projection);
    return true;
  } catch {
    return false;
  }
}
