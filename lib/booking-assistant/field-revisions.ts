import {
  QueryCommand,
  TransactWriteItemsCommand,
  type DynamoDBClient,
} from "@aws-sdk/client-dynamodb";

import { buildJournalEvent } from "./activity-journal";
import type { EncryptionHelper, EncryptedBlob } from "./encryption";
import { decryptJson, encryptJson } from "./encryption";
import {
  getBookingFieldDefinition,
  validateBookingFieldValue,
  type BookingFieldPrivacy,
} from "./field-catalog";
import { requireBookingEventDefinition } from "./event-registry";
import { projectJournalEventIfConfigured } from "./analytics-projector";
import type { DraftStoreConfig } from "./store";
import { assertAllowedStructuredKeys, assertNoRestrictedStructuredContent } from "./redaction";

export interface ConfirmedFieldRevision {
  fieldId: string;
  taskId: string;
  privacy: BookingFieldPrivacy;
  revision: number;
  confirmedAtIso: string;
  value: unknown;
}

export interface ConfirmFieldInput {
  draftId: string;
  personId: string;
  fieldId: string;
  value: unknown;
  expectedVersion: number;
  idempotencyKey: string;
  nextTaskId?: string;
  completionPct?: number;
  actorType?: "guest" | "operator";
  actorId?: string;
}

export interface ConfirmFieldResult {
  newVersion: number;
  revision: number;
  confirmedAtIso: string;
}

function encryptedBlobValue(blob: EncryptedBlob): { M: Record<string, { S: string }> } {
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

function parseEncryptedBlob(value: unknown): EncryptedBlob {
  const raw = value as { M?: Record<string, { S?: string }> };
  const map = raw.M ?? {};
  return {
    ciphertext: map.ciphertext?.S ?? "",
    iv: map.iv?.S ?? "",
    tag: map.tag?.S ?? "",
    encryptedDataKey: map.encryptedDataKey?.S ?? "",
    kmsKeyArn: map.kmsKeyArn?.S ?? "",
  };
}

function fieldSk(fieldId: string, revision: number): string {
  return `FIELD#${fieldId}#REV#${String(revision).padStart(10, "0")}`;
}

export async function confirmDraftField(
  dynamo: DynamoDBClient,
  encryption: EncryptionHelper,
  config: DraftStoreConfig,
  input: ConfirmFieldInput
): Promise<ConfirmFieldResult> {
  const definition = getBookingFieldDefinition(input.fieldId);
  if (!definition) throw new Error(`Unknown Booking Assistant field: ${input.fieldId}`);
  const validationError = validateBookingFieldValue(definition, input.value);
  if (validationError) throw new Error(validationError);
  assertAllowedStructuredKeys(input.value);
  assertNoRestrictedStructuredContent(input.value);
  const actorType = input.actorType ?? "guest";
  if (actorType === "operator" && definition.privacy !== "tier_a") {
    throw new Error("Protected guest fields must be requested from the guest, not corrected by an operator");
  }
  const eventType = actorType === "operator" ? "operator_field_corrected" : "field_confirmed";
  requireBookingEventDefinition(eventType);

  const revision = input.expectedVersion + 1;
  const confirmedAtIso = new Date().toISOString();
  const encryptedValue = await encryptJson(encryption, { value: input.value });
  const journal = buildJournalEvent({
    draftId: input.draftId,
    eventType,
    actorType,
    occurredAtIso: confirmedAtIso,
    privacyClass: "operational",
    idempotencyKey: input.idempotencyKey,
    expectedDraftVersion: input.expectedVersion,
    sequence: revision,
    payload: {
      taskId: definition.taskId,
      fieldId: input.fieldId,
      fieldPrivacy: definition.privacy,
      nextTaskId: input.nextTaskId ?? "",
      completionPct: input.completionPct ?? 0,
      guestConfirmationRequired: false,
      ...(input.actorId ? { actorId: input.actorId } : {}),
    },
  });
  const pk = `DRAFT#${input.draftId}`;
  const updateParts = [
    "#version = :newVersion",
    "journalSequence = :sequence",
    "updatedAtIso = :now",
    "lastGuestActivityAtIso = :now",
    "lastMeaningfulGuestActivityAtIso = :now",
    "lastJournalEventAtIso = :now",
  ];
  if (input.nextTaskId) updateParts.push("nextTaskId = :nextTaskId");

  await dynamo.send(
    new TransactWriteItemsCommand({
      TransactItems: [
        {
          Update: {
            TableName: config.tableName,
            Key: { PK: { S: pk }, SK: { S: "META" } },
            UpdateExpression: `SET ${updateParts.join(", ")}`,
            ConditionExpression: "#version = :expectedVersion AND personId = :personId",
            ExpressionAttributeNames: { "#version": "version" },
            ExpressionAttributeValues: {
              ":expectedVersion": { N: String(input.expectedVersion) },
              ":newVersion": { N: String(revision) },
              ":sequence": { N: String(revision) },
              ":personId": { S: input.personId },
              ":now": { S: confirmedAtIso },
              ...(input.nextTaskId ? { ":nextTaskId": { S: input.nextTaskId } } : {}),
            },
          },
        },
        {
          Put: {
            TableName: config.tableName,
            Item: {
              PK: { S: pk },
              SK: { S: fieldSk(input.fieldId, revision) },
              fieldId: { S: input.fieldId },
              taskId: { S: definition.taskId },
              privacy: { S: definition.privacy },
              revision: { N: String(revision) },
              confirmedAtIso: { S: confirmedAtIso },
              encryptedValue: encryptedBlobValue(encryptedValue),
              ...(input.actorId ? { actorId: { S: input.actorId } } : {}),
            } as never,
            ConditionExpression: "attribute_not_exists(PK)",
          },
        },
        {
          Put: {
            TableName: config.tableName,
            Item: journal.item as never,
            ConditionExpression: "attribute_not_exists(PK)",
          },
        },
      ],
    })
  );
  await projectJournalEventIfConfigured(dynamo, config, journal.record);

  return { newVersion: revision, revision, confirmedAtIso };
}

export async function loadConfirmedFields(
  dynamo: DynamoDBClient,
  encryption: EncryptionHelper,
  config: DraftStoreConfig,
  draftId: string
): Promise<Record<string, ConfirmedFieldRevision>> {
  const result = await dynamo.send(
    new QueryCommand({
      TableName: config.tableName,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
      ExpressionAttributeValues: {
        ":pk": { S: `DRAFT#${draftId}` },
        ":prefix": { S: "FIELD#" },
      },
    })
  );
  const latest = new Map<string, Record<string, unknown>>();
  for (const item of result.Items ?? []) {
    const fieldId = (item.fieldId as { S?: string })?.S ?? "";
    const revision = Number((item.revision as { N?: string })?.N ?? "0");
    const prior = latest.get(fieldId);
    const priorRevision = Number((prior?.revision as { N?: string } | undefined)?.N ?? "0");
    if (fieldId && revision > priorRevision) latest.set(fieldId, item);
  }

  const fields: Record<string, ConfirmedFieldRevision> = {};
  for (const [fieldId, item] of latest) {
    const decrypted = await decryptJson<{ value: unknown }>(
      encryption,
      parseEncryptedBlob(item.encryptedValue)
    );
    fields[fieldId] = {
      fieldId,
      taskId: (item.taskId as { S?: string })?.S ?? "",
      privacy: ((item.privacy as { S?: string })?.S ?? "tier_c") as BookingFieldPrivacy,
      revision: Number((item.revision as { N?: string })?.N ?? "0"),
      confirmedAtIso: (item.confirmedAtIso as { S?: string })?.S ?? "",
      value: decrypted.value,
    };
  }
  return fields;
}
