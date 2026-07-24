/**
 * DynamoDB draft store with optimistic concurrency and envelope encryption.
 *
 * Per plan Section 12:
 * - Single table: lll-booking-assistant
 * - Conditional writes on version prevent overwrite
 * - Every mutation requires an idempotency key
 * - PII encrypted via KMS envelope encryption
 * - HMAC-normalized lookup keys, never raw PII as DynamoDB key
 * - GSI1: operator queue by status/urgency
 * - GSI2: drafts by person
 */

import type { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
  UpdateItemCommand,
  TransactWriteItemsCommand,
} from "@aws-sdk/client-dynamodb";

import type { BookingDraftStatus } from "./contracts";
import {
  canTransitionBookingStatus,
} from "./contracts";
import type { EncryptedBlob, EncryptionHelper } from "./encryption";
import { decryptJson, encryptJson } from "./encryption";
import type {
  BookingDraftMetadata,
  CallKeyLookupItem,
  CallKeyState,
  CabinRecord,
  ContactRecord,
  DecisionsAndConsents,
  DraftCallKeyItem,
  DraftCabinItem,
  DraftContactItem,
  DraftDecisionsItem,
  DraftMetaItem,
  DraftTravelerItem,
  DealPriceSnapshot,
  FallbackCallKeyRecord,
  JournalEventItem,
  TravelerRecord,
} from "./types";

export interface DraftStoreConfig {
  tableName: string;
  kmsKeyArn: string;
}

export interface DraftStoreClients {
  dynamo: DynamoDBClient;
  encryption: EncryptionHelper;
}

// ── PK/SK helpers ───────────────────────────────────────────────────────────

function draftPk(draftId: string): string {
  return `DRAFT#${draftId}`;
}

function travelerSk(travelerId: string): string {
  return `TRAVELER#${travelerId}`;
}

function cabinSk(cabinId: string): string {
  return `CABIN#${cabinId}`;
}

function callKeyLookupPk(hmac: string): string {
  return `CALLKEY#${hmac}`;
}

const PK = "PK";
const SK = "SK";
const GSI1PK = "GSI1PK";
const GSI1SK = "GSI1SK";
const GSI2PK = "GSI2PK";
const GSI2SK = "GSI2SK";

// ── Create draft ────────────────────────────────────────────────────────────

export interface CreateDraftInput {
  draftId: string;
  personId: string;
  dealSnapshot: DealPriceSnapshot;
  contact: ContactRecord;
  initialStatus: BookingDraftStatus;
  flowDefinitionVersion: number;
  bookingFlowVersion: number;
  completionMode: string;
  completionModeVersion: number;
}

export interface CreateDraftResult {
  draftId: string;
  version: number;
  createdAtIso: string;
}

/**
 * Creates a new draft with META + CONTACT items in a transaction.
 * Fails if a draft with the same ID already exists.
 */
export async function createDraft(
  clients: DraftStoreClients,
  config: DraftStoreConfig,
  input: CreateDraftInput
): Promise<CreateDraftResult> {
  const nowIso = new Date().toISOString();
  const pk = draftPk(input.draftId);

  const metaItem: DraftMetaItem = {
    pk,
    sk: "META",
    status: input.initialStatus,
    urgency: "informational",
    flowDefinitionVersion: input.flowDefinitionVersion,
    bookingFlowVersion: input.bookingFlowVersion,
    completionMode: input.completionMode,
    completionModeVersion: input.completionModeVersion,
    packetVersion: 0,
    version: 1,
    journalSequence: 0,
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
    lastGuestActivityAtIso: nowIso,
    lastMeaningfulGuestActivityAtIso: nowIso,
    dealId: input.dealSnapshot.dealId,
    packageId: input.dealSnapshot.packageId,
    personId: input.personId,
    gsi1pk: `STATUS#${input.initialStatus}`,
    gsi1sk: nowIso,
    gsi2pk: `PERSON#${input.personId}`,
    gsi2sk: nowIso,
  } as never;

  const encryptedContact = await encryptJson(clients.encryption, input.contact);

  const contactItem: DraftContactItem = {
    pk,
    sk: "CONTACT",
    encryptedContact,
    updatedAtIso: nowIso,
    version: 1,
  } as never;

  await clients.dynamo.send(
    new TransactWriteItemsCommand({
      TransactItems: [
        {
          Put: {
            TableName: config.tableName,
            Item: serializeMetaItem(metaItem) as never,
            ConditionExpression: "attribute_not_exists(PK)",
          },
        },
        {
          Put: {
            TableName: config.tableName,
            Item: serializeContactItem(contactItem) as never,
            ConditionExpression: "attribute_not_exists(PK)",
          },
        },
      ],
    })
  );

  return { draftId: input.draftId, version: 1, createdAtIso: nowIso };
}

// ── Save decisions (encrypted) ──────────────────────────────────────────────

export interface SaveDecisionsInput {
  draftId: string;
  expectedVersion: number;
  decisions: DecisionsAndConsents;
}

/**
 * Saves or replaces the encrypted DECISIONS item for a draft.
 * Uses PutItem with condition_not_exists for initial creation,
 * or PutItem unconditionally for updates (version is bumped in META).
 */
export async function saveDecisions(
  clients: DraftStoreClients,
  config: DraftStoreConfig,
  input: SaveDecisionsInput
): Promise<void> {
  const pk = draftPk(input.draftId);
  const nowIso = new Date().toISOString();
  const encryptedDecisions = await encryptJson(clients.encryption, input.decisions);

  const decisionsItem: DraftDecisionsItem = {
    pk,
    sk: "DECISIONS",
    encryptedDecisions,
    updatedAtIso: nowIso,
    version: input.expectedVersion,
  };

  await clients.dynamo.send(
    new PutItemCommand({
      TableName: config.tableName,
      Item: serializeDecisionsItem(decisionsItem) as never,
    })
  );
}

// ── Save travelers (encrypted) ──────────────────────────────────────────────

export interface SaveTravelersInput {
  draftId: string;
  expectedVersion: number;
  travelers: TravelerRecord[];
}

/**
 * Saves all traveler records for a draft as encrypted items.
 * Each traveler is stored as a separate DynamoDB item with SK = TRAVELER#{travelerId}.
 */
export async function saveTravelers(
  clients: DraftStoreClients,
  config: DraftStoreConfig,
  input: SaveTravelersInput
): Promise<void> {
  const pk = draftPk(input.draftId);
  const nowIso = new Date().toISOString();

  for (const traveler of input.travelers) {
    const encryptedTraveler = await encryptJson(clients.encryption, traveler);
    const item: DraftTravelerItem = {
      pk,
      sk: travelerSk(traveler.travelerId),
      travelerId: traveler.travelerId,
      isPrimary: traveler.isPrimary,
      encryptedTraveler,
      updatedAtIso: nowIso,
      version: input.expectedVersion,
    };

    await clients.dynamo.send(
      new PutItemCommand({
        TableName: config.tableName,
        Item: serializeTravelerItem(item) as never,
      })
    );
  }
}

// ── Save cabin (encrypted) ──────────────────────────────────────────────────

export interface SaveCabinInput {
  draftId: string;
  expectedVersion: number;
  cabin: CabinRecord;
}

/**
 * Saves a single cabin record for a draft as an encrypted item.
 */
export async function saveCabin(
  clients: DraftStoreClients,
  config: DraftStoreConfig,
  input: SaveCabinInput
): Promise<void> {
  const pk = draftPk(input.draftId);
  const nowIso = new Date().toISOString();
  const encryptedCabin = await encryptJson(clients.encryption, input.cabin);

  const item: DraftCabinItem = {
    pk,
    sk: cabinSk(input.cabin.cabinId),
    cabinId: input.cabin.cabinId,
    encryptedCabin,
    updatedAtIso: nowIso,
    version: input.expectedVersion,
  };

  await clients.dynamo.send(
    new PutItemCommand({
      TableName: config.tableName,
      Item: serializeCabinItem(item) as never,
    })
  );
}

// ── Get draft (metadata + contact, not encrypted sub-items by default) ──────

export interface DraftSnapshot {
  metadata: BookingDraftMetadata;
  dealSnapshot: DealPriceSnapshot;
  contact: ContactRecord;
  travelers: TravelerRecord[];
  cabins: CabinRecord[];
  decisions: DecisionsAndConsents;
  fallbackCallKey?: FallbackCallKeyRecord;
}

export async function getDraft(
  clients: DraftStoreClients,
  config: DraftStoreConfig,
  draftId: string
): Promise<DraftSnapshot | null> {
  const pk = draftPk(draftId);
  const result = await clients.dynamo.send(
    new QueryCommand({
      TableName: config.tableName,
      KeyConditionExpression: "PK = :pk",
      ExpressionAttributeValues: { ":pk": { S: pk } },
    })
  );

  if (!result.Items || result.Items.length === 0) return null;

  let metaItem: DraftMetaItem | null = null;
  let contactItem: DraftContactItem | null = null;
  let decisionsItem: DraftDecisionsItem | null = null;
  let callKeyItem: DraftCallKeyItem | null = null;
  const travelerItems: DraftTravelerItem[] = [];
  const cabinItems: DraftCabinItem[] = [];

  for (const item of result.Items) {
    const sk = (item[SK] as { S?: string })?.S ?? "";
    if (sk === "META") metaItem = parseMetaItem(item);
    else if (sk === "CONTACT") contactItem = parseContactItem(item);
    else if (sk === "DECISIONS") decisionsItem = parseDecisionsItem(item);
    else if (sk === "CALL_KEY") callKeyItem = parseCallKeyItem(item);
    else if (sk.startsWith("TRAVELER#")) travelerItems.push(parseTravelerItem(item));
    else if (sk.startsWith("CABIN#")) cabinItems.push(parseCabinItem(item));
  }

  if (!metaItem) return null;

  const contact: ContactRecord = contactItem
    ? await decryptJson<ContactRecord>(clients.encryption, contactItem.encryptedContact)
    : emptyContact();

  const travelers: TravelerRecord[] = [];
  for (const ti of travelerItems) {
    travelers.push(await decryptJson<TravelerRecord>(clients.encryption, ti.encryptedTraveler));
  }

  const cabins: CabinRecord[] = [];
  for (const ci of cabinItems) {
    cabins.push(await decryptJson<CabinRecord>(clients.encryption, ci.encryptedCabin));
  }

  const decisions: DecisionsAndConsents = decisionsItem
    ? await decryptJson<DecisionsAndConsents>(clients.encryption, decisionsItem.encryptedDecisions)
    : emptyDecisions();

  const fallbackCallKey: FallbackCallKeyRecord | undefined = callKeyItem
    ? {
        keyVersion: callKeyItem.keyVersion,
        state: callKeyItem.state,
        issuedAtIso: callKeyItem.issuedAtIso,
        packetVersion: callKeyItem.packetVersion,
        lookupHmac: callKeyItem.lookupHmac,
        encryptedRawValue: callKeyItem.encryptedRawValue,
        issuanceActor: "system",
        issuanceReason: "packet_saved",
      }
    : undefined;

  const metadata: BookingDraftMetadata = {
    bookingDraftId: draftId,
    personId: metaItem.personId,
    dealId: metaItem.dealId,
    packageId: metaItem.packageId,
    siid: "",
    status: metaItem.status,
    urgency: metaItem.urgency as BookingDraftMetadata["urgency"],
    flowDefinitionVersion: metaItem.flowDefinitionVersion,
    bookingFlowVersion: metaItem.bookingFlowVersion,
    completionMode: metaItem.completionMode,
    completionModeVersion: metaItem.completionModeVersion,
    packetVersion: metaItem.packetVersion,
    version: metaItem.version,
    createdAtIso: metaItem.createdAtIso,
    updatedAtIso: metaItem.updatedAtIso,
    lastGuestActivityAtIso: metaItem.lastGuestActivityAtIso,
    lastMeaningfulGuestActivityAtIso: metaItem.lastMeaningfulGuestActivityAtIso,
    journalSequence: metaItem.journalSequence,
    nextTaskId: metaItem.nextTaskId,
    resumeTaskId: metaItem.resumeTaskId,
    assignedOperatorId: metaItem.assignedOperatorId,
    claimLeaseExpiresAtIso: metaItem.claimLeaseExpiresAtIso,
    readyToCallAtIso: metaItem.readyToCallAtIso,
    callKeyState: metaItem.callKeyState,
    activeCallAttemptId: metaItem.activeCallAttemptId,
    callIntentExpiresAtIso: metaItem.callIntentExpiresAtIso,
  };

  return { metadata, dealSnapshot: emptyDealSnapshot(), contact, travelers, cabins, decisions, fallbackCallKey };
}

// ── Update draft status (with optimistic concurrency) ───────────────────────

export interface UpdateStatusInput {
  draftId: string;
  expectedVersion: number;
  newStatus: BookingDraftStatus;
  urgency?: BookingDraftMetadata["urgency"];
  idempotencyKey: string;
  additionalUpdates?: Partial<Pick<BookingDraftMetadata,
    "nextTaskId" | "resumeTaskId" | "assignedOperatorId" |
    "claimLeaseExpiresAtIso" | "readyToCallAtIso" |
    "activeCallAttemptId" | "callIntentExpiresAtIso" |
    "callKeyState" | "packetVersion"
  >>;
}

export interface UpdateStatusResult {
  newVersion: number;
  updatedAtIso: string;
}

/**
 * Conditionally update draft status with version check and state-machine guard.
 */
export async function updateDraftStatus(
  clients: DraftStoreClients,
  config: DraftStoreConfig,
  input: UpdateStatusInput
): Promise<UpdateStatusResult> {
  const pk = draftPk(input.draftId);
  const nowIso = new Date().toISOString();

  // First, read current status to validate transition
  const existing = await clients.dynamo.send(
    new GetItemCommand({
      TableName: config.tableName,
      Key: { PK: { S: pk }, SK: { S: "META" } },
      ProjectionExpression: "#status, #version",
      ExpressionAttributeNames: { "#status": "status", "#version": "version" },
    })
  );

  const currentStatus = (existing.Item?.status as { S?: string })?.S as BookingDraftStatus | undefined;
  const currentVersion = Number((existing.Item?.version as { N?: string })?.N ?? "0");

  if (!currentStatus || currentVersion !== input.expectedVersion) {
    throw new DraftVersionConflictError(input.expectedVersion, currentVersion);
  }

  if (!canTransitionBookingStatus(currentStatus, input.newStatus)) {
    throw new InvalidTransitionError(currentStatus, input.newStatus);
  }

  const gsi1pk = `STATUS#${input.newStatus}`;
  const newVersion = currentVersion + 1;

  const updateExprParts: string[] = [
    "SET #status = :status",
    "#version = :version",
    "updatedAtIso = :now",
    "GSI1PK = :gsi1pk",
    "GSI1SK = :now",
    "journalSequence = journalSequence",
  ];
  const exprAttrNames: Record<string, string> = {
    "#status": "status",
    "#version": "version",
  };
  const exprAttrValues: Record<string, unknown> = {
    ":status": { S: input.newStatus },
    ":version": { N: String(newVersion) },
    ":now": { S: nowIso },
    ":gsi1pk": { S: gsi1pk },
    ":expectedVersion": { N: String(input.expectedVersion) },
  };

  if (input.additionalUpdates) {
    for (const [key, value] of Object.entries(input.additionalUpdates)) {
      if (value !== undefined) {
        const attrName = `#${key}`;
        const attrValue = `:${key}`;
        exprAttrNames[attrName] = key;
        updateExprParts.push(`${attrName} = ${attrValue}`);
        if (typeof value === "number") {
          exprAttrValues[attrValue] = { N: String(value) };
        } else if (typeof value === "string") {
          exprAttrValues[attrValue] = { S: value };
        }
      }
    }
  }

  await clients.dynamo.send(
    new UpdateItemCommand({
      TableName: config.tableName,
      Key: { PK: { S: pk }, SK: { S: "META" } },
      UpdateExpression: updateExprParts.join(", "),
      ConditionExpression: "#version = :expectedVersion",
      ExpressionAttributeNames: exprAttrNames as never,
      ExpressionAttributeValues: exprAttrValues as never,
    })
  );

  return { newVersion, updatedAtIso: nowIso };
}

// ── Save fallback call key ──────────────────────────────────────────────────

export interface SaveCallKeyInput {
  draftId: string;
  expectedVersion: number;
  rawKey: string;
  lookupHmac: string;
  keyVersion: number;
  packetVersion: number;
  callDisclosureVersion?: string;
}

/**
 * Transactionally saves the fallback call key record and its lookup alias.
 */
export async function saveFallbackCallKey(
  clients: DraftStoreClients,
  config: DraftStoreConfig,
  input: SaveCallKeyInput
): Promise<void> {
  const pk = draftPk(input.draftId);
  const nowIso = new Date().toISOString();

  const encryptedRawValue = await clients.encryption.encrypt(input.rawKey);

  const callKeyItem: DraftCallKeyItem = {
    pk,
    sk: "CALL_KEY",
    keyVersion: input.keyVersion,
    state: "active",
    issuedAtIso: nowIso,
    packetVersion: input.packetVersion,
    lookupHmac: input.lookupHmac,
    encryptedRawValue,
    updatedAtIso: nowIso,
  };

  const lookupItem: CallKeyLookupItem = {
    pk: callKeyLookupPk(input.lookupHmac),
    sk: pk,
    draftId: input.draftId,
    state: "active",
    issuedAtIso: nowIso,
  };

  await clients.dynamo.send(
    new TransactWriteItemsCommand({
      TransactItems: [
        {
          Put: {
            TableName: config.tableName,
            Item: serializeCallKeyItem(callKeyItem) as never,
            ConditionExpression: "attribute_not_exists(PK)",
          },
        },
        {
          Put: {
            TableName: config.tableName,
            Item: serializeCallKeyLookupItem(lookupItem) as never,
            ConditionExpression: "attribute_not_exists(PK)",
          },
        },
      ],
    })
  );
}

// ── Lookup by fallback key HMAC ─────────────────────────────────────────────

export async function lookupDraftByCallKeyHmac(
  clients: DraftStoreClients,
  config: DraftStoreConfig,
  lookupHmac: string
): Promise<{ draftId: string; issuedAtIso: string; state: CallKeyState } | null> {
  const pk = callKeyLookupPk(lookupHmac);
  const result = await clients.dynamo.send(
    new QueryCommand({
      TableName: config.tableName,
      KeyConditionExpression: "PK = :pk",
      ExpressionAttributeValues: { ":pk": { S: pk } },
      Limit: 1,
    })
  );

  if (!result.Items || result.Items.length === 0) return null;

  const item = result.Items[0];
  const draftId = (item[SK] as { S?: string })?.S?.replace("DRAFT#", "") ?? "";
  const state = (item.state as { S?: string })?.S as CallKeyState | undefined;
  const issuedAtIso = (item.issuedAtIso as { S?: string })?.S ?? "";

  if (!draftId || !state) return null;
  return { draftId, issuedAtIso, state };
}

// ── Query operator queue (GSI1) ─────────────────────────────────────────────

export interface QueueQueryResult {
  draftId: string;
  status: BookingDraftStatus;
  urgency: string;
  updatedAtIso: string;
  personId: string;
}

/**
 * Query the operator queue by GSI1 (status#urgency -> updatedAtIso).
 * Pass statusPrefix to filter, e.g. "call_signal_pending" or "ready_to_call_agent".
 */
export async function queryOperatorQueue(
  clients: DraftStoreClients,
  config: DraftStoreConfig,
  statusPrefix: string
): Promise<QueueQueryResult[]> {
  const keysToQuery = [
    `STATUS#${statusPrefix}`,
    `STATUS#${statusPrefix}#URGENCY#informational`,
    `STATUS#${statusPrefix}#URGENCY#normal`,
    `STATUS#${statusPrefix}#URGENCY#urgent`,
  ];

  const seen = new Set<string>();
  const allRows: QueueQueryResult[] = [];

  for (const gsi1pk of keysToQuery) {
    const result = await clients.dynamo.send(
      new QueryCommand({
        TableName: config.tableName,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :pk",
        ExpressionAttributeValues: { ":pk": { S: gsi1pk } },
        ScanIndexForward: false,
        Limit: 20,
      })
    );

    for (const item of result.Items ?? []) {
      const draftId = ((item[PK] as { S?: string })?.S ?? "").replace("DRAFT#", "");
      if (seen.has(draftId)) continue;
      seen.add(draftId);
      allRows.push({
        draftId,
        status: (item.status as { S?: string })?.S as BookingDraftStatus,
        urgency: (item.urgency as { S?: string })?.S ?? "informational",
        updatedAtIso: (item[GSI1SK] as { S?: string })?.S ?? "",
        personId: (item.personId as { S?: string })?.S ?? "",
      });
    }
  }

  return allRows;
}

// ── Errors ──────────────────────────────────────────────────────────────────

export class DraftVersionConflictError extends Error {
  constructor(
    public readonly expectedVersion: number,
    public readonly actualVersion: number | undefined
  ) {
    super(`Draft version conflict: expected ${expectedVersion}, got ${actualVersion ?? "none"}`);
  }
}

export class InvalidTransitionError extends Error {
  constructor(
    public readonly from: BookingDraftStatus,
    public readonly to: BookingDraftStatus
  ) {
    super(`Invalid status transition: ${from} -> ${to}`);
  }
}

// ── Serialization helpers ───────────────────────────────────────────────────

function serializeMetaItem(item: DraftMetaItem): Record<string, unknown> {
  const s = (v: string): { S: string } | undefined =>
    v.length > 0 ? { S: v } : undefined;
  return {
    PK: { S: item.pk },
    SK: { S: item.sk },
    status: { S: item.status },
    urgency: { S: item.urgency },
    flowDefinitionVersion: { N: String(item.flowDefinitionVersion) },
    bookingFlowVersion: { N: String(item.bookingFlowVersion) },
    completionMode: { S: item.completionMode },
    completionModeVersion: { N: String(item.completionModeVersion) },
    packetVersion: { N: String(item.packetVersion) },
    version: { N: String(item.version) },
    journalSequence: { N: String(item.journalSequence) },
    createdAtIso: { S: item.createdAtIso },
    updatedAtIso: { S: item.updatedAtIso },
    lastGuestActivityAtIso: { S: item.lastGuestActivityAtIso },
    lastMeaningfulGuestActivityAtIso: { S: item.lastMeaningfulGuestActivityAtIso },
    ...(s(item.dealId) && { dealId: s(item.dealId) }),
    ...(s(item.packageId) && { packageId: s(item.packageId) }),
    personId: { S: item.personId },
    GSI1PK: { S: item.gsi1pk },
    GSI1SK: { S: item.gsi1sk },
    GSI2PK: { S: item.gsi2pk },
    GSI2SK: { S: item.gsi2sk },
    ...(item.nextTaskId && { nextTaskId: { S: item.nextTaskId } }),
    ...(item.resumeTaskId && { resumeTaskId: { S: item.resumeTaskId } }),
    ...(item.assignedOperatorId && { assignedOperatorId: { S: item.assignedOperatorId } }),
    ...(item.claimLeaseExpiresAtIso && { claimLeaseExpiresAtIso: { S: item.claimLeaseExpiresAtIso } }),
    ...(item.readyToCallAtIso && { readyToCallAtIso: { S: item.readyToCallAtIso } }),
    ...(item.callKeyState && { callKeyState: { S: item.callKeyState } }),
    ...(item.activeCallAttemptId && { activeCallAttemptId: { S: item.activeCallAttemptId } }),
    ...(item.callIntentExpiresAtIso && { callIntentExpiresAtIso: { S: item.callIntentExpiresAtIso } }),
  };
}

function parseMetaItem(item: Record<string, unknown>): DraftMetaItem {
  const s = (key: string): string => (item[key] as { S?: string })?.S ?? "";
  const n = (key: string): number => Number((item[key] as { N?: string })?.N ?? "0");
  return {
    pk: s("PK"),
    sk: "META",
    status: s("status") as BookingDraftStatus,
    urgency: s("urgency"),
    flowDefinitionVersion: n("flowDefinitionVersion"),
    bookingFlowVersion: n("bookingFlowVersion"),
    completionMode: s("completionMode"),
    completionModeVersion: n("completionModeVersion"),
    packetVersion: n("packetVersion"),
    version: n("version"),
    journalSequence: n("journalSequence"),
    createdAtIso: s("createdAtIso"),
    updatedAtIso: s("updatedAtIso"),
    lastGuestActivityAtIso: s("lastGuestActivityAtIso"),
    lastMeaningfulGuestActivityAtIso: s("lastMeaningfulGuestActivityAtIso"),
    dealId: s("dealId"),
    packageId: s("packageId"),
    personId: s("personId"),
    gsi1pk: s("GSI1PK"),
    gsi1sk: s("GSI1SK"),
    gsi2pk: s("GSI2PK"),
    gsi2sk: s("GSI2SK"),
    nextTaskId: s("nextTaskId") || undefined,
    resumeTaskId: s("resumeTaskId") || undefined,
    assignedOperatorId: s("assignedOperatorId") || undefined,
    claimLeaseExpiresAtIso: s("claimLeaseExpiresAtIso") || undefined,
    readyToCallAtIso: s("readyToCallAtIso") || undefined,
    callKeyState: (s("callKeyState") || undefined) as CallKeyState | undefined,
    activeCallAttemptId: s("activeCallAttemptId") || undefined,
    callIntentExpiresAtIso: s("callIntentExpiresAtIso") || undefined,
  };
}

function serializeContactItem(item: DraftContactItem): Record<string, unknown> {
  return {
    PK: { S: item.pk },
    SK: { S: item.sk },
    encryptedContact: serializeEncryptedBlob(item.encryptedContact),
    updatedAtIso: { S: item.updatedAtIso },
    version: { N: String(item.version) },
  };
}

function parseContactItem(item: Record<string, unknown>): DraftContactItem {
  return {
    pk: (item.PK as { S?: string })?.S ?? "",
    sk: "CONTACT",
    encryptedContact: parseEncryptedBlob(item.encryptedContact as Record<string, unknown>),
    updatedAtIso: (item.updatedAtIso as { S?: string })?.S ?? "",
    version: Number((item.version as { N?: string })?.N ?? "0"),
  };
}

function serializeTravelerItem(item: DraftTravelerItem): Record<string, unknown> {
  return {
    PK: { S: item.pk },
    SK: { S: item.sk },
    travelerId: { S: item.travelerId },
    isPrimary: { S: String(item.isPrimary) },
    encryptedTraveler: serializeEncryptedBlob(item.encryptedTraveler),
    updatedAtIso: { S: item.updatedAtIso },
    version: { N: String(item.version) },
  };
}

function parseTravelerItem(item: Record<string, unknown>): DraftTravelerItem {
  return {
    pk: (item.PK as { S?: string })?.S ?? "",
    sk: (item.SK as { S?: string })?.S ?? "",
    travelerId: (item.travelerId as { S?: string })?.S ?? "",
    isPrimary: (item.isPrimary as { S?: string })?.S === "true",
    encryptedTraveler: parseEncryptedBlob(item.encryptedTraveler as Record<string, unknown>),
    updatedAtIso: (item.updatedAtIso as { S?: string })?.S ?? "",
    version: Number((item.version as { N?: string })?.N ?? "0"),
  };
}

function serializeCabinItem(item: DraftCabinItem): Record<string, unknown> {
  return {
    PK: { S: item.pk },
    SK: { S: item.sk },
    cabinId: { S: item.cabinId },
    encryptedCabin: serializeEncryptedBlob(item.encryptedCabin),
    updatedAtIso: { S: item.updatedAtIso },
    version: { N: String(item.version) },
  };
}

function parseCabinItem(item: Record<string, unknown>): DraftCabinItem {
  return {
    pk: (item.PK as { S?: string })?.S ?? "",
    sk: (item.SK as { S?: string })?.S ?? "",
    cabinId: (item.cabinId as { S?: string })?.S ?? "",
    encryptedCabin: parseEncryptedBlob(item.encryptedCabin as Record<string, unknown>),
    updatedAtIso: (item.updatedAtIso as { S?: string })?.S ?? "",
    version: Number((item.version as { N?: string })?.N ?? "0"),
  };
}

function serializeDecisionsItem(item: DraftDecisionsItem): Record<string, unknown> {
  return {
    PK: { S: item.pk },
    SK: { S: item.sk },
    encryptedDecisions: serializeEncryptedBlob(item.encryptedDecisions),
    updatedAtIso: { S: item.updatedAtIso },
    version: { N: String(item.version) },
  };
}

function parseDecisionsItem(item: Record<string, unknown>): DraftDecisionsItem {
  return {
    pk: (item.PK as { S?: string })?.S ?? "",
    sk: "DECISIONS",
    encryptedDecisions: parseEncryptedBlob(item.encryptedDecisions as Record<string, unknown>),
    updatedAtIso: (item.updatedAtIso as { S?: string })?.S ?? "",
    version: Number((item.version as { N?: string })?.N ?? "0"),
  };
}

function serializeCallKeyItem(item: DraftCallKeyItem): Record<string, unknown> {
  return {
    PK: { S: item.pk },
    SK: { S: item.sk },
    keyVersion: { N: String(item.keyVersion) },
    state: { S: item.state },
    issuedAtIso: { S: item.issuedAtIso },
    packetVersion: { N: String(item.packetVersion) },
    lookupHmac: { S: item.lookupHmac },
    ...(item.encryptedRawValue && { encryptedRawValue: serializeEncryptedBlob(item.encryptedRawValue) }),
    updatedAtIso: { S: item.updatedAtIso },
  };
}

function parseCallKeyItem(item: Record<string, unknown>): DraftCallKeyItem {
  return {
    pk: (item.PK as { S?: string })?.S ?? "",
    sk: "CALL_KEY",
    keyVersion: Number((item.keyVersion as { N?: string })?.N ?? "0"),
    state: (item.state as { S?: string })?.S as CallKeyState,
    issuedAtIso: (item.issuedAtIso as { S?: string })?.S ?? "",
    packetVersion: Number((item.packetVersion as { N?: string })?.N ?? "0"),
    lookupHmac: (item.lookupHmac as { S?: string })?.S ?? "",
    encryptedRawValue: item.encryptedRawValue
      ? parseEncryptedBlob(item.encryptedRawValue as Record<string, unknown>)
      : undefined,
    updatedAtIso: (item.updatedAtIso as { S?: string })?.S ?? "",
  };
}

function serializeCallKeyLookupItem(item: CallKeyLookupItem): Record<string, unknown> {
  return {
    PK: { S: item.pk },
    SK: { S: item.sk },
    draftId: { S: item.draftId },
    state: { S: item.state },
    issuedAtIso: { S: item.issuedAtIso },
  };
}

function serializeEncryptedBlob(blob: EncryptedBlob): { M: Record<string, { S: string }> } {
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

function parseEncryptedBlob(raw: Record<string, unknown>): EncryptedBlob {
  const map = (raw.M ?? raw) as Record<string, unknown>;
  const s = (key: string): string => (map[key] as { S?: string })?.S ?? "";
  return {
    ciphertext: s("ciphertext"),
    iv: s("iv"),
    tag: s("tag"),
    encryptedDataKey: s("encryptedDataKey"),
    kmsKeyArn: s("kmsKeyArn"),
  };
}

function emptyContact(): ContactRecord {
  return {
    firstName: "",
    email: "",
    phoneE164: "",
    preferredChannel: "email",
    emailVerified: false,
    phoneVerified: false,
    transactionalEmailConsent: false,
    callbackConsent: false,
    smsConsent: false,
    marketingConsent: false,
  };
}

function emptyDecisions(): DecisionsAndConsents {
  return {
    passengerDataReviewConfirmed: false,
    packetStorageConsent: false,
  };
}

function emptyDealSnapshot(): DealPriceSnapshot {
  return {
    dealId: "",
    packageId: "",
    siid: "",
    cruiseLine: "",
    ship: "",
    sailingDateIso: "",
    nights: 0,
    departurePort: "",
    itineraryLabel: "",
    dealAngle: "",
    priceDisplay: "",
    currency: "USD",
    taxFeeBasis: "",
    priceCapturedAtIso: "",
    sourceBookingUrl: "",
    linkHealthState: "unknown",
  };
}
