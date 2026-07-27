import {
  PutItemCommand,
  QueryCommand,
  type DynamoDBClient,
} from "@aws-sdk/client-dynamodb";
import { randomUUID } from "node:crypto";

import type { EncryptionHelper, EncryptedBlob } from "./encryption";
import { decryptJson, encryptJson } from "./encryption";
import { redactConversationText, type RedactionDisposition } from "./redaction";
import type { DraftStoreConfig } from "./store";

export interface ConversationTurnInput {
  draftId: string;
  interactionSessionId: string;
  activeTaskId: string;
  channel: "text" | "voice" | "form" | "email" | "operator_summary";
  role: "guest" | "assistant" | "operator";
  text: string;
  occurredAtIso?: string;
}

export interface StoredConversationTurn {
  turnId: string;
  interactionSessionId: string;
  activeTaskId: string;
  channel: ConversationTurnInput["channel"];
  role: ConversationTurnInput["role"];
  text: string;
  occurredAtIso: string;
  redactionDisposition: RedactionDisposition;
  classifierVersion: string;
}

export interface ConversationStoreResult {
  stored: boolean;
  disposition: RedactionDisposition;
  turnId?: string;
}

function blobValue(blob: EncryptedBlob): { M: Record<string, { S: string }> } {
  return {
    M: {
      ciphertext: { S: blob.ciphertext },
      iv: { S: blob.iv },
      tag: { S: blob.tag },
      encryptedDataKey: { S: blob.encryptedDataKey },
      kmsKeyArn: { S: blob.kmsKeyArn },
    },
  };
}

function readBlob(value: unknown): EncryptedBlob {
  const map = (value as { M?: Record<string, { S?: string }> }).M ?? {};
  return {
    ciphertext: map.ciphertext?.S ?? "",
    iv: map.iv?.S ?? "",
    tag: map.tag?.S ?? "",
    encryptedDataKey: map.encryptedDataKey?.S ?? "",
    kmsKeyArn: map.kmsKeyArn?.S ?? "",
  };
}

export async function storeConversationTurn(
  dynamo: DynamoDBClient,
  encryption: EncryptionHelper,
  config: DraftStoreConfig,
  input: ConversationTurnInput
): Promise<ConversationStoreResult> {
  const redaction = redactConversationText(input.text);
  if (redaction.disposition === "discarded") {
    return { stored: false, disposition: "discarded" };
  }
  const turnId = randomUUID();
  const occurredAtIso = input.occurredAtIso ?? new Date().toISOString();
  const content = redaction.sanitizedText ?? "[QUARANTINED]";
  const encryptedContent = await encryptJson(encryption, { text: content });
  await dynamo.send(
    new PutItemCommand({
      TableName: config.tableName,
      Item: {
        PK: { S: `DRAFT#${input.draftId}` },
        SK: { S: `CONVERSATION#${occurredAtIso}#${turnId}` },
        turnId: { S: turnId },
        interactionSessionId: { S: input.interactionSessionId },
        activeTaskId: { S: input.activeTaskId },
        channel: { S: input.channel },
        role: { S: input.role },
        occurredAtIso: { S: occurredAtIso },
        redactionDisposition: { S: redaction.disposition },
        classifierVersion: { S: redaction.classifierVersion },
        encryptedContent: blobValue(encryptedContent),
      } as never,
      ConditionExpression: "attribute_not_exists(PK)",
    })
  );
  return { stored: true, disposition: redaction.disposition, turnId };
}

export async function loadConversationTurns(
  dynamo: DynamoDBClient,
  encryption: EncryptionHelper,
  config: DraftStoreConfig,
  draftId: string,
  limit = 100
): Promise<StoredConversationTurn[]> {
  const result = await dynamo.send(
    new QueryCommand({
      TableName: config.tableName,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
      ExpressionAttributeValues: {
        ":pk": { S: `DRAFT#${draftId}` },
        ":prefix": { S: "CONVERSATION#" },
      },
      Limit: Math.min(Math.max(limit, 1), 200),
      ScanIndexForward: true,
    })
  );
  const turns: StoredConversationTurn[] = [];
  for (const item of result.Items ?? []) {
    const decrypted = await decryptJson<{ text: string }>(
      encryption,
      readBlob(item.encryptedContent)
    );
    turns.push({
      turnId: (item.turnId as { S?: string })?.S ?? "",
      interactionSessionId: (item.interactionSessionId as { S?: string })?.S ?? "",
      activeTaskId: (item.activeTaskId as { S?: string })?.S ?? "",
      channel: ((item.channel as { S?: string })?.S ?? "text") as StoredConversationTurn["channel"],
      role: ((item.role as { S?: string })?.S ?? "guest") as StoredConversationTurn["role"],
      text: decrypted.text,
      occurredAtIso: (item.occurredAtIso as { S?: string })?.S ?? "",
      redactionDisposition: ((item.redactionDisposition as { S?: string })?.S ?? "accepted") as RedactionDisposition,
      classifierVersion: (item.classifierVersion as { S?: string })?.S ?? "",
    });
  }
  return turns;
}
