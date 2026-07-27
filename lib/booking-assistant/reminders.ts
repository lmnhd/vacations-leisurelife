import {
  GetItemCommand,
  QueryCommand,
  TransactWriteItemsCommand,
  UpdateItemCommand,
  type DynamoDBClient,
} from "@aws-sdk/client-dynamodb";
import { randomUUID } from "node:crypto";

import type { BookingDraftStatus } from "./contracts";
import type { DraftStoreConfig } from "./store";

export type ReminderProgramType = "continue_later_v1" | "call_to_finalize_v1";
export type ReminderProgramState = "active" | "claimed" | "stopped" | "completed";

export interface ReminderProgram {
  draftId: string;
  programId: string;
  programType: ReminderProgramType;
  state: ReminderProgramState;
  generation: number;
  maximumGenerations: number;
  startedAtIso: string;
  nextSendAtIso: string;
  lastSentAtIso?: string;
  lastMeaningfulActivityAtIso: string;
  claimId?: string;
  claimExpiresAtIso?: string;
}

export const REMINDER_INTERVAL_MS = 72 * 60 * 60 * 1000;
export const REMINDER_MAX_GENERATIONS = 10;
export const REMINDER_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const TERMINAL_STATUSES: readonly BookingDraftStatus[] = [
  "booking_confirmed",
  "cancelled",
  "expired",
];

function parseProgram(item: Record<string, unknown>): ReminderProgram {
  const s = (key: string): string => (item[key] as { S?: string })?.S ?? "";
  const n = (key: string): number => Number((item[key] as { N?: string })?.N ?? "0");
  return {
    draftId: s("draftId"),
    programId: s("programId"),
    programType: s("programType") as ReminderProgramType,
    state: s("state") as ReminderProgramState,
    generation: n("generation"),
    maximumGenerations: n("maximumGenerations"),
    startedAtIso: s("startedAtIso"),
    nextSendAtIso: s("nextSendAtIso"),
    lastSentAtIso: s("lastSentAtIso") || undefined,
    lastMeaningfulActivityAtIso: s("lastMeaningfulActivityAtIso"),
    claimId: s("claimId") || undefined,
    claimExpiresAtIso: s("claimExpiresAtIso") || undefined,
  };
}

export function serializeReminderProgram(program: ReminderProgram): Record<string, unknown> {
  return {
    PK: { S: `DRAFT#${program.draftId}` },
    SK: { S: "REMINDER_ACTIVE" },
    draftId: { S: program.draftId },
    programId: { S: program.programId },
    programType: { S: program.programType },
    state: { S: program.state },
    generation: { N: String(program.generation) },
    maximumGenerations: { N: String(program.maximumGenerations) },
    startedAtIso: { S: program.startedAtIso },
    nextSendAtIso: { S: program.nextSendAtIso },
    lastMeaningfulActivityAtIso: { S: program.lastMeaningfulActivityAtIso },
    ...(program.lastSentAtIso ? { lastSentAtIso: { S: program.lastSentAtIso } } : {}),
    ...(program.claimId ? { claimId: { S: program.claimId } } : {}),
    ...(program.claimExpiresAtIso ? { claimExpiresAtIso: { S: program.claimExpiresAtIso } } : {}),
    GSI1PK: { S: "REMINDER#DUE" },
    GSI1SK: { S: program.nextSendAtIso },
  };
}

export function buildReminderProgram(
  draftId: string,
  programType: ReminderProgramType,
  now = new Date()
): ReminderProgram {
  const nowIso = now.toISOString();
  return {
    draftId,
    programId: randomUUID(),
    programType,
    state: "active",
    generation: 0,
    maximumGenerations: REMINDER_MAX_GENERATIONS,
    startedAtIso: nowIso,
    nextSendAtIso: new Date(now.getTime() + REMINDER_INTERVAL_MS).toISOString(),
    lastMeaningfulActivityAtIso: nowIso,
  };
}

export async function putExclusiveReminderProgram(
  dynamo: DynamoDBClient,
  config: DraftStoreConfig,
  program: ReminderProgram
): Promise<void> {
  await dynamo.send(
    new TransactWriteItemsCommand({
      TransactItems: [
        {
          Put: {
            TableName: config.tableName,
            Item: serializeReminderProgram(program) as never,
          },
        },
      ],
    })
  );
}

export async function getReminderProgram(
  dynamo: DynamoDBClient,
  config: DraftStoreConfig,
  draftId: string
): Promise<ReminderProgram | null> {
  const result = await dynamo.send(
    new GetItemCommand({
      TableName: config.tableName,
      Key: {
        PK: { S: `DRAFT#${draftId}` },
        SK: { S: "REMINDER_ACTIVE" },
      },
    })
  );
  return result.Item ? parseProgram(result.Item as Record<string, unknown>) : null;
}

export async function stopReminderProgram(
  dynamo: DynamoDBClient,
  config: DraftStoreConfig,
  draftId: string,
  reason: string
): Promise<void> {
  await dynamo.send(
    new UpdateItemCommand({
      TableName: config.tableName,
      Key: { PK: { S: `DRAFT#${draftId}` }, SK: { S: "REMINDER_ACTIVE" } },
      UpdateExpression: "SET #state = :stopped, stoppedAtIso = :now, stopReason = :reason REMOVE GSI1PK, GSI1SK",
      ExpressionAttributeNames: { "#state": "state" },
      ExpressionAttributeValues: {
        ":stopped": { S: "stopped" },
        ":now": { S: new Date().toISOString() },
        ":reason": { S: reason.slice(0, 120) },
      },
    })
  );
}

export async function deferReminderProgram(
  dynamo: DynamoDBClient,
  config: DraftStoreConfig,
  program: ReminderProgram,
  claimId: string,
  nextSendAtIso: string
): Promise<void> {
  await dynamo.send(new UpdateItemCommand({
    TableName: config.tableName,
    Key: { PK: { S: `DRAFT#${program.draftId}` }, SK: { S: "REMINDER_ACTIVE" } },
    UpdateExpression: "SET #state = :active, nextSendAtIso = :nextSendAtIso, GSI1PK = :gsi1pk, GSI1SK = :nextSendAtIso REMOVE claimId, claimExpiresAtIso",
    ConditionExpression: "programId = :programId AND claimId = :claimId",
    ExpressionAttributeNames: { "#state": "state" },
    ExpressionAttributeValues: {
      ":active": { S: "active" },
      ":nextSendAtIso": { S: nextSendAtIso },
      ":gsi1pk": { S: "REMINDER#DUE" },
      ":programId": { S: program.programId },
      ":claimId": { S: claimId },
    },
  }));
}

export function reminderSuppressionReason(
  program: ReminderProgram,
  draftStatus: BookingDraftStatus,
  now = new Date()
): string | null {
  if (program.state !== "active" && program.state !== "claimed") return "program_not_active";
  if (TERMINAL_STATUSES.includes(draftStatus)) return "draft_terminal";
  if (program.generation >= program.maximumGenerations) return "generation_ceiling";
  if (now.getTime() - Date.parse(program.startedAtIso) >= REMINDER_MAX_AGE_MS) return "program_age_ceiling";
  if (
    program.programType === "continue_later_v1" &&
    draftStatus !== "paused_by_guest" &&
    draftStatus !== "collecting"
  ) {
    return "wrong_lifecycle";
  }
  if (
    program.programType === "call_to_finalize_v1" &&
    draftStatus !== "ready_to_call_agent"
  ) {
    return "wrong_lifecycle";
  }
  return null;
}

export async function listDueReminderPrograms(
  dynamo: DynamoDBClient,
  config: DraftStoreConfig,
  nowIso: string,
  limit = 25
): Promise<ReminderProgram[]> {
  const result = await dynamo.send(
    new QueryCommand({
      TableName: config.tableName,
      IndexName: "GSI1",
      KeyConditionExpression: "GSI1PK = :pk AND GSI1SK <= :now",
      ExpressionAttributeValues: {
        ":pk": { S: "REMINDER#DUE" },
        ":now": { S: nowIso },
      },
      Limit: Math.min(Math.max(limit, 1), 100),
    })
  );
  return (result.Items ?? []).map((item) => parseProgram(item as Record<string, unknown>));
}

export async function claimReminderProgram(
  dynamo: DynamoDBClient,
  config: DraftStoreConfig,
  program: ReminderProgram,
  now = new Date()
): Promise<string> {
  const claimId = randomUUID();
  const claimExpiresAtIso = new Date(now.getTime() + 5 * 60 * 1000).toISOString();
  await dynamo.send(
    new UpdateItemCommand({
      TableName: config.tableName,
      Key: { PK: { S: `DRAFT#${program.draftId}` }, SK: { S: "REMINDER_ACTIVE" } },
      UpdateExpression: "SET #state = :claimed, claimId = :claimId, claimExpiresAtIso = :claimExpiresAtIso",
      ConditionExpression: "programId = :programId AND nextSendAtIso = :nextSendAtIso AND (#state = :active OR (#state = :claimed AND claimExpiresAtIso < :now))",
      ExpressionAttributeNames: { "#state": "state" },
      ExpressionAttributeValues: {
        ":active": { S: "active" },
        ":claimed": { S: "claimed" },
        ":now": { S: now.toISOString() },
        ":claimId": { S: claimId },
        ":claimExpiresAtIso": { S: claimExpiresAtIso },
        ":programId": { S: program.programId },
        ":nextSendAtIso": { S: program.nextSendAtIso },
      },
    })
  );
  return claimId;
}

export async function completeReminderSend(
  dynamo: DynamoDBClient,
  config: DraftStoreConfig,
  program: ReminderProgram,
  claimId: string,
  sentAt = new Date()
): Promise<void> {
  const generation = program.generation + 1;
  const complete =
    generation >= program.maximumGenerations ||
    sentAt.getTime() - Date.parse(program.startedAtIso) >= REMINDER_MAX_AGE_MS;
  const nextSendAtIso = new Date(sentAt.getTime() + REMINDER_INTERVAL_MS).toISOString();
  await dynamo.send(
    new UpdateItemCommand({
      TableName: config.tableName,
      Key: { PK: { S: `DRAFT#${program.draftId}` }, SK: { S: "REMINDER_ACTIVE" } },
      UpdateExpression: complete
        ? "SET #state = :completed, generation = :generation, lastSentAtIso = :sentAt REMOVE GSI1PK, GSI1SK, claimId, claimExpiresAtIso"
        : "SET #state = :active, generation = :generation, lastSentAtIso = :sentAt, nextSendAtIso = :nextSendAtIso, GSI1SK = :nextSendAtIso REMOVE claimId, claimExpiresAtIso",
      ConditionExpression: "programId = :programId AND claimId = :claimId AND #state = :claimed",
      ExpressionAttributeNames: { "#state": "state" },
      ExpressionAttributeValues: {
        ":active": { S: "active" },
        ":claimed": { S: "claimed" },
        ":completed": { S: "completed" },
        ":generation": { N: String(generation) },
        ":sentAt": { S: sentAt.toISOString() },
        ":nextSendAtIso": { S: nextSendAtIso },
        ":programId": { S: program.programId },
        ":claimId": { S: claimId },
      },
    })
  );
}

export async function releaseReminderClaim(
  dynamo: DynamoDBClient,
  config: DraftStoreConfig,
  program: ReminderProgram,
  claimId: string
): Promise<void> {
  await dynamo.send(
    new UpdateItemCommand({
      TableName: config.tableName,
      Key: { PK: { S: `DRAFT#${program.draftId}` }, SK: { S: "REMINDER_ACTIVE" } },
      UpdateExpression: "SET #state = :active REMOVE claimId, claimExpiresAtIso",
      ConditionExpression: "programId = :programId AND claimId = :claimId AND #state = :claimed",
      ExpressionAttributeNames: { "#state": "state" },
      ExpressionAttributeValues: {
        ":active": { S: "active" },
        ":claimed": { S: "claimed" },
        ":programId": { S: program.programId },
        ":claimId": { S: claimId },
      },
    })
  );
}
