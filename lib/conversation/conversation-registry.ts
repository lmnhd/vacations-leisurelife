/**
 * Shared logical-conversation registry.
 *
 * Production uses the existing DynamoDB single-table store so a launch on one
 * Vercel instance is visible to tool and trace requests handled by another.
 * Local development and contract tests retain an in-memory adapter.
 */

import { randomUUID } from "node:crypto";
import { DeleteCommand, GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

import { chatDynamoDocumentClient } from "@/lib/chat/dynamo-client";
import type {
  ConversationChannel,
  ConversationLaunchEnvelope,
  ConversationMode,
} from "./launch-envelope";
import type { ToolAuthorizationLevel } from "./tool-policy";
import type { ShowcaseProfile } from "./showcase-fixtures";

export interface TransportSessionBinding {
  transportSessionId: string;
  channel: ConversationChannel;
  attachedAtIso: string;
}

export interface ConversationRecord {
  conversationId: string;
  createdAtIso: string;
  lastActivityAtIso: string;
  expiresAtMs: number;
  envelope: ConversationLaunchEnvelope;
  mode: ConversationMode;
  authorization: ToolAuthorizationLevel;
  skillId: string;
  skillVersion: number;
  snapshotId: string;
  snapshotVersion: number;
  allowedToolIds: string[];
  sessionProfile: "quality" | "fast";
  transports: TransportSessionBinding[];
  showcaseProfile?: ShowcaseProfile;
  bookingDraftId?: string;
  personId?: string;
  toolCallCount: number;
  turnCount: number;
}

export interface CreateConversationInput {
  envelope: ConversationLaunchEnvelope;
  authorization: ToolAuthorizationLevel;
  skillId: string;
  skillVersion: number;
  snapshotId: string;
  snapshotVersion: number;
  allowedToolIds: string[];
  sessionProfile: "quality" | "fast";
  showcaseProfile?: ShowcaseProfile;
  bookingDraftId?: string;
  personId?: string;
}

export interface ConversationUpdate {
  skillId?: string;
  skillVersion?: number;
  snapshotId?: string;
  snapshotVersion?: number;
  allowedToolIds?: string[];
  showcaseProfile?: ShowcaseProfile;
  bookingDraftId?: string;
  personId?: string;
  authorization?: ToolAuthorizationLevel;
}

const TABLE_NAME = process.env.VOICE_CONVERSATION_TABLE ?? "lll-shadow-campaigns";
const CONVERSATION_TTL_MS = 45 * 60 * 1000;
const STATE_SK = "STATE";

interface RegistryGlobalState {
  records: Map<string, ConversationRecord>;
  transportIndex: Map<string, string>;
}

const REGISTRY_GLOBAL_KEY = "__leisureLifeConversationRegistry__";

function usesSharedStore(): boolean {
  const configured = process.env.VOICE_CONVERSATION_STORE;
  if (configured === "memory") return false;
  if (configured === "dynamodb") return true;
  return Boolean(process.env.VERCEL || process.env.VERCEL_ENV);
}

function registry(): RegistryGlobalState {
  const holder = globalThis as unknown as Record<string, RegistryGlobalState | undefined>;
  let state = holder[REGISTRY_GLOBAL_KEY];
  if (!state) {
    state = { records: new Map(), transportIndex: new Map() };
    holder[REGISTRY_GLOBAL_KEY] = state;
  }
  return state;
}

function conversationPk(conversationId: string): string {
  return `VOICE_CONVERSATION#${conversationId}`;
}

function transportPk(transportSessionId: string): string {
  return `VOICE_TRANSPORT#${transportSessionId}`;
}

function ttlEpochSeconds(expiresAtMs: number): number {
  return Math.floor(expiresAtMs / 1000);
}

function pruneExpiredMemory(): void {
  const { records, transportIndex } = registry();
  const now = Date.now();
  for (const [id, record] of records.entries()) {
    if (record.expiresAtMs > now) continue;
    records.delete(id);
    for (const transport of record.transports) {
      transportIndex.delete(transport.transportSessionId);
    }
  }
}

function recordFromItem(item: Record<string, unknown> | undefined): ConversationRecord | null {
  if (!item || !item["conversationId"] || !item["envelope"]) return null;
  const {
    PK: _partitionKey,
    SK: _sortKey,
    entityType: _entityType,
    ttl: _ttl,
    ...recordFields
  } = item;
  const record = recordFields as unknown as ConversationRecord;
  return record.expiresAtMs > Date.now() ? record : null;
}

async function putSharedRecord(record: ConversationRecord): Promise<void> {
  await chatDynamoDocumentClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: conversationPk(record.conversationId),
        SK: STATE_SK,
        entityType: "voice_conversation",
        ttl: ttlEpochSeconds(record.expiresAtMs),
        ...record,
      },
    })
  );
}

export async function createConversation(
  input: CreateConversationInput
): Promise<ConversationRecord> {
  const nowIso = new Date().toISOString();
  const record: ConversationRecord = {
    conversationId: input.envelope.conversationId ?? `conv_${randomUUID()}`,
    createdAtIso: nowIso,
    lastActivityAtIso: nowIso,
    expiresAtMs: Date.now() + CONVERSATION_TTL_MS,
    envelope: input.envelope,
    mode: input.envelope.mode,
    authorization: input.authorization,
    skillId: input.skillId,
    skillVersion: input.skillVersion,
    snapshotId: input.snapshotId,
    snapshotVersion: input.snapshotVersion,
    allowedToolIds: input.allowedToolIds,
    sessionProfile: input.sessionProfile,
    transports: [],
    showcaseProfile: input.showcaseProfile,
    bookingDraftId: input.bookingDraftId,
    personId: input.personId,
    toolCallCount: 0,
    turnCount: 0,
  };

  if (usesSharedStore()) {
    await putSharedRecord(record);
  } else {
    pruneExpiredMemory();
    registry().records.set(record.conversationId, record);
  }
  return record;
}

export async function getConversation(
  conversationId: string
): Promise<ConversationRecord | null> {
  if (!usesSharedStore()) {
    pruneExpiredMemory();
    return registry().records.get(conversationId) ?? null;
  }

  const result = await chatDynamoDocumentClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: conversationPk(conversationId), SK: STATE_SK },
      ConsistentRead: true,
    })
  );
  return recordFromItem(result.Item);
}

export async function getConversationByTransport(
  transportSessionId: string
): Promise<ConversationRecord | null> {
  if (!usesSharedStore()) {
    pruneExpiredMemory();
    const conversationId = registry().transportIndex.get(transportSessionId);
    return conversationId ? registry().records.get(conversationId) ?? null : null;
  }

  const mapping = await chatDynamoDocumentClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: transportPk(transportSessionId), SK: STATE_SK },
      ConsistentRead: true,
    })
  );
  const conversationId = mapping.Item?.["conversationId"];
  return typeof conversationId === "string" ? getConversation(conversationId) : null;
}

export async function attachTransportSession(
  conversationId: string,
  transportSessionId: string,
  channel: ConversationChannel
): Promise<boolean> {
  const record = await getConversation(conversationId);
  if (!record) return false;

  const alreadyAttached = record.transports.some(
    (item) => item.transportSessionId === transportSessionId
  );
  if (!alreadyAttached) {
    record.transports.push({ transportSessionId, channel, attachedAtIso: new Date().toISOString() });
  }
  touch(record);

  if (usesSharedStore()) {
    const binding: TransportSessionBinding = {
      transportSessionId,
      channel,
      attachedAtIso: new Date().toISOString(),
    };
    if (!alreadyAttached) {
      const expiresAtMs = Date.now() + CONVERSATION_TTL_MS;
      await chatDynamoDocumentClient.send(
        new UpdateCommand({
          TableName: TABLE_NAME,
          Key: { PK: conversationPk(conversationId), SK: STATE_SK },
          UpdateExpression:
            "SET transports = list_append(if_not_exists(transports, :empty), :binding), lastActivityAtIso = :now, expiresAtMs = :expiresAtMs, #ttl = :ttl",
          ExpressionAttributeNames: { "#ttl": "ttl" },
          ExpressionAttributeValues: {
            ":empty": [],
            ":binding": [binding],
            ":now": binding.attachedAtIso,
            ":expiresAtMs": expiresAtMs,
            ":ttl": ttlEpochSeconds(expiresAtMs),
          },
          ConditionExpression: "attribute_exists(PK)",
        })
      );
    }
    await chatDynamoDocumentClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          PK: transportPk(transportSessionId),
          SK: STATE_SK,
          entityType: "voice_transport_binding",
          conversationId,
          channel,
          ttl: ttlEpochSeconds(record.expiresAtMs),
        },
      })
    );
  } else {
    registry().transportIndex.set(transportSessionId, conversationId);
  }
  return true;
}

export async function updateConversation(
  conversationId: string,
  update: ConversationUpdate
): Promise<ConversationRecord | null> {
  const record = await getConversation(conversationId);
  if (!record) return null;

  if (usesSharedStore()) {
    const expiresAtMs = Date.now() + CONVERSATION_TTL_MS;
    const names: Record<string, string> = { "#ttl": "ttl" };
    const values: Record<string, unknown> = {
      ":now": new Date().toISOString(),
      ":expiresAtMs": expiresAtMs,
      ":ttl": ttlEpochSeconds(expiresAtMs),
    };
    const assignments = [
      "lastActivityAtIso = :now",
      "expiresAtMs = :expiresAtMs",
      "#ttl = :ttl",
    ];
    for (const [field, value] of Object.entries(update)) {
      names[`#${field}`] = field;
      values[`:${field}`] = value;
      assignments.push(`#${field} = :${field}`);
    }
    const result = await chatDynamoDocumentClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: conversationPk(conversationId), SK: STATE_SK },
        UpdateExpression: `SET ${assignments.join(", ")}`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ConditionExpression: "attribute_exists(PK)",
        ReturnValues: "ALL_NEW",
      })
    );
    return recordFromItem(result.Attributes);
  }

  if (update.skillId !== undefined) record.skillId = update.skillId;
  if (update.skillVersion !== undefined) record.skillVersion = update.skillVersion;
  if (update.snapshotId !== undefined) record.snapshotId = update.snapshotId;
  if (update.snapshotVersion !== undefined) record.snapshotVersion = update.snapshotVersion;
  if (update.allowedToolIds !== undefined) record.allowedToolIds = update.allowedToolIds;
  if (update.showcaseProfile !== undefined) record.showcaseProfile = update.showcaseProfile;
  if (update.bookingDraftId !== undefined) record.bookingDraftId = update.bookingDraftId;
  if (update.personId !== undefined) record.personId = update.personId;
  if (update.authorization !== undefined) record.authorization = update.authorization;
  touch(record);
  return record;
}

export async function recordToolCall(conversationId: string): Promise<number> {
  if (!usesSharedStore()) {
    const record = await getConversation(conversationId);
    if (!record) return 0;
    record.toolCallCount += 1;
    touch(record);
    return record.toolCallCount;
  }

  const expiresAtMs = Date.now() + CONVERSATION_TTL_MS;
  const result = await chatDynamoDocumentClient.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: conversationPk(conversationId), SK: STATE_SK },
      UpdateExpression:
        "SET lastActivityAtIso = :now, expiresAtMs = :expiresAtMs, #ttl = :ttl ADD toolCallCount :one",
      ExpressionAttributeNames: { "#ttl": "ttl" },
      ExpressionAttributeValues: {
        ":now": new Date().toISOString(),
        ":expiresAtMs": expiresAtMs,
        ":ttl": ttlEpochSeconds(expiresAtMs),
        ":one": 1,
      },
      ConditionExpression: "attribute_exists(PK)",
      ReturnValues: "UPDATED_NEW",
    })
  );
  return typeof result.Attributes?.["toolCallCount"] === "number"
    ? result.Attributes["toolCallCount"]
    : 0;
}

export async function recordTurn(conversationId: string): Promise<number> {
  if (!usesSharedStore()) {
    const record = await getConversation(conversationId);
    if (!record) return 0;
    record.turnCount += 1;
    touch(record);
    return record.turnCount;
  }

  const expiresAtMs = Date.now() + CONVERSATION_TTL_MS;
  const result = await chatDynamoDocumentClient.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: conversationPk(conversationId), SK: STATE_SK },
      UpdateExpression:
        "SET lastActivityAtIso = :now, expiresAtMs = :expiresAtMs, #ttl = :ttl ADD turnCount :one",
      ExpressionAttributeNames: { "#ttl": "ttl" },
      ExpressionAttributeValues: {
        ":now": new Date().toISOString(),
        ":expiresAtMs": expiresAtMs,
        ":ttl": ttlEpochSeconds(expiresAtMs),
        ":one": 1,
      },
      ConditionExpression: "attribute_exists(PK)",
      ReturnValues: "UPDATED_NEW",
    })
  );
  return typeof result.Attributes?.["turnCount"] === "number"
    ? result.Attributes["turnCount"]
    : 0;
}

export async function endConversation(conversationId: string): Promise<void> {
  const record = await getConversation(conversationId);
  if (usesSharedStore()) {
    const deletes: Promise<unknown>[] = [
      chatDynamoDocumentClient.send(
        new DeleteCommand({
          TableName: TABLE_NAME,
          Key: { PK: conversationPk(conversationId), SK: STATE_SK },
        })
      ),
    ];
    for (const transport of record?.transports ?? []) {
      deletes.push(
        chatDynamoDocumentClient.send(
          new DeleteCommand({
            TableName: TABLE_NAME,
            Key: { PK: transportPk(transport.transportSessionId), SK: STATE_SK },
          })
        )
      );
    }
    await Promise.all(deletes);
    return;
  }

  const { records, transportIndex } = registry();
  for (const transport of record?.transports ?? []) {
    transportIndex.delete(transport.transportSessionId);
  }
  records.delete(conversationId);
}

function touch(record: ConversationRecord): void {
  record.lastActivityAtIso = new Date().toISOString();
  record.expiresAtMs = Date.now() + CONVERSATION_TTL_MS;
}
