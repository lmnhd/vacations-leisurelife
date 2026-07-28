/**
 * Local operator service — the authenticated bridge between the localhost
 * operator console and the DynamoDB data layer.
 *
 * Per plan Section 17:
 * - Polls for call intents and ready-to-call drafts
 * - Verifies the caller before revealing the saved packet
 * - Lets the operator record outcomes while manually using Odysseus
 * - All actions are journaled
 * - PII is masked until caller verification is recorded
 * - Caller ID is never authentication
 */

import type { BookingDraftStatus } from "./contracts";
import {
  GetItemCommand,
  TransactWriteItemsCommand,
} from "@aws-sdk/client-dynamodb";
import {
  canTransitionBookingStatus,
  type BookingJournalEventType,
} from "./contracts";
import type { CallOutcome } from "./contracts";
import { callOutcomeLabels } from "./contracts";
import type { CallerIdState } from "./contracts";

import {
  computeCallKeyHmac,
  constantTimeHmacMatch,
  normalizeCallKeyInput,
  selectRandomCallKey,
  type CallKeyLookupResult,
} from "./fallback-call-key";
import {
  DraftVersionConflictError,
  InvalidTransitionError,
  getDraft,
  lookupDraftByCallKeyHmac,
  queryOperatorQueue,
  renewClaimLease,
  saveFallbackCallKey,
  updateDraftStatusWithJournal,
  type DraftStoreClients,
  type DraftStoreConfig,
  type QueueQueryResult,
} from "./store";
import {
  buildJournalEvent,
  writeJournalEvent,
  type JournalPayload,
} from "./activity-journal";
import { encryptJson } from "./encryption";
import {
  assertAllowedStructuredKeys,
  assertNoRestrictedStructuredContent,
} from "./redaction";
import { stopReminderProgram } from "./reminders";
import {
  emitBookingMilestone,
  emitBookingMilestoneForDraft,
} from "./deal-milestones";
import type {
  BookingDraft,
  BookingDraftMetadata,
  OperatorCallIntentDisplay,
  OperatorQueueCard,
} from "./types";

// ── Config ──────────────────────────────────────────────────────────────────

export interface OperatorServiceConfig extends DraftStoreConfig {
  /** Max seconds before a call-intent signal expires. */
  callIntentTtlSeconds: number;
  /** Max seconds for an operator claim lease. */
  claimLeaseSeconds: number;
}

// ── Queue: poll for ready-to-call and call-signal-pending drafts ────────────

export interface PollQueueInput {
  statuses: BookingDraftStatus[];
}

export async function pollOperatorQueue(
  clients: DraftStoreClients,
  config: OperatorServiceConfig,
  input: PollQueueInput
): Promise<OperatorQueueCard[]> {
  const allResults: OperatorQueueCard[] = [];

  for (const status of input.statuses) {
    const rows = await queryOperatorQueue(clients, config, status);
    for (const row of rows) {
      const card = queueRowToCard(row);
      // Enrich with contact info (masked) and deal summary
      try {
        const draft = await getDraft(clients, config, row.draftId);
        if (draft) {
          card.version = draft.metadata.version;
          card.firstName = draft.contact.firstName;
          card.dealSummary = `${draft.dealSnapshot.cruiseLine} ${draft.dealSnapshot.ship} — ${draft.dealSnapshot.sailingDateIso.slice(0, 10)}`;
          card.callKeyState = draft.fallbackCallKey?.state;
          card.assignedOperatorId = draft.metadata.assignedOperatorId;
          card.claimLeaseExpiresAtIso = draft.metadata.claimLeaseExpiresAtIso;
          card.activeCallAttemptId = draft.metadata.activeCallAttemptId;
          card.callIntentExpiresAtIso = draft.metadata.callIntentExpiresAtIso;
          if (draft.metadata.status === "human_requested") {
            const callback = await clients.dynamo.send(new GetItemCommand({
              TableName: config.tableName,
              Key: {
                PK: { S: `DRAFT#${row.draftId}` },
                SK: { S: "CALLBACK_ACTIVE" },
              },
              ProjectionExpression: "callbackWindowLabel",
            }));
            card.callbackWindowLabel = callback.Item?.callbackWindowLabel?.S;
          }
        }
      } catch {
        // Skip enrichment if draft can't be loaded
      }
      allResults.push(card);
    }
  }

  // Sort: urgent first, then by updatedAtIso descending
  allResults.sort((a, b) => {
    if (a.urgency !== b.urgency) {
      const urgencyOrder: Record<string, number> = { urgent: 0, normal: 1, informational: 2 };
      return (urgencyOrder[a.urgency] ?? 3) - (urgencyOrder[b.urgency] ?? 3);
    }
    return b.lastActivityIso.localeCompare(a.lastActivityIso);
  });

  return allResults;
}

function queueRowToCard(row: QueueQueryResult): OperatorQueueCard {
  return {
    bookingDraftId: row.draftId,
    version: 0,
    firstName: "",
    dealSummary: "",
    status: row.status,
    completionPct: 0,
    urgency: row.urgency,
    lastActivityIso: row.updatedAtIso,
    missingSections: [],
    channels: [],
  };
}

// ── Fallback key lookup ─────────────────────────────────────────────────────

export interface FallbackKeyLookupInput {
  rawKeyInput: string;
  operatorSessionId: string;
}

export type FallbackKeyLookupOutput =
  | {
      result: "match";
      draftId: string;
      maskedCallerSummary: string;
      dealSummary: string;
      version: number;
      status: BookingDraftStatus;
      packetVersion: number;
      keyVersion: number;
      issuedAtIso: string;
    }
  | { result: "no_match" }
  | { result: "invalid_key" };

/**
 * Authenticated operator fallback-key lookup.
 * Returns a masked summary only — never the raw key or full PII.
 */
export async function lookupByFallbackKey(
  clients: DraftStoreClients,
  config: OperatorServiceConfig,
  input: FallbackKeyLookupInput
): Promise<FallbackKeyLookupOutput> {
  const normalized = normalizeCallKeyInput(input.rawKeyInput);
  if (!normalized) {
    return { result: "invalid_key" };
  }

  const hmac = computeCallKeyHmac(normalized);
  const lookup = await lookupDraftByCallKeyHmac(clients, config, hmac);
  if (!lookup || lookup.state !== "active") {
    return { result: "no_match" };
  }

  const draft = await getDraft(clients, config, lookup.draftId);
  if (!draft) {
    return { result: "no_match" };
  }

  // Journal the lookup attempt
  await writeJournalEvent(clients.dynamo, config.tableName, {
    draftId: lookup.draftId,
    eventType: "fallback_call_key_lookup_attempted" as BookingJournalEventType,
    actorType: "operator",
    occurredAtIso: new Date().toISOString(),
    privacyClass: "operational",
    idempotencyKey: `lookup-${input.operatorSessionId}-${Date.now()}`,
    expectedDraftVersion: draft.metadata.version,
    sequence: draft.metadata.journalSequence + 1,
    payload: { operatorSessionId: input.operatorSessionId, matchFound: true },
  });

  const maskedCaller = maskPhone(draft.contact.phoneE164);
  const dealSummary = `${draft.metadata.dealId}`;

  // Journal the lookup result
  await writeJournalEvent(clients.dynamo, config.tableName, {
    draftId: lookup.draftId,
    eventType: "fallback_call_key_lookup_result" as BookingJournalEventType,
    actorType: "operator",
    occurredAtIso: new Date().toISOString(),
    privacyClass: "operational",
    idempotencyKey: `lookup-result-${input.operatorSessionId}-${Date.now()}`,
    expectedDraftVersion: draft.metadata.version,
    sequence: draft.metadata.journalSequence + 2,
    payload: { result: "match" },
  });

  return {
    result: "match",
    draftId: lookup.draftId,
    maskedCallerSummary: maskedCaller,
    dealSummary,
    version: draft.metadata.version,
    status: draft.metadata.status,
    packetVersion: draft.metadata.packetVersion,
    keyVersion: draft.fallbackCallKey?.keyVersion ?? 1,
    issuedAtIso: lookup.issuedAtIso,
  };
}

// ── Caller verification ─────────────────────────────────────────────────────

export interface CallerVerificationInput {
  draftId: string;
  expectedVersion: number;
  callerIdState: CallerIdState;
  operatorSessionId: string;
  verificationNotes?: string;
}

export interface AcknowledgeCallIntentInput {
  draftId: string;
  expectedVersion: number;
  operatorSessionId: string;
}

export interface AcknowledgeCallIntentResult {
  newVersion: number;
  journalEventId: string;
}

/** Pins the incoming call for this operator before claim/processing can begin. */
export async function acknowledgeCallIntent(
  clients: DraftStoreClients,
  config: OperatorServiceConfig,
  input: AcknowledgeCallIntentInput
): Promise<AcknowledgeCallIntentResult> {
  const nowIso = new Date().toISOString();
  const update = await updateDraftStatusWithJournal(clients, config, {
    draftId: input.draftId,
    expectedVersion: input.expectedVersion,
    newStatus: "calling_now",
    idempotencyKey: `acknowledge-${input.operatorSessionId}-${nowIso}`,
    journalEvent: {
      eventType: "operator_call_draft_pinned" as BookingJournalEventType,
      actorType: "operator",
      occurredAtIso: nowIso,
      privacyClass: "operational",
      idempotencyKey: `acknowledge-event-${input.operatorSessionId}-${nowIso}`,
      payload: { operatorSessionId: input.operatorSessionId, action: "call_intent_acknowledged" },
    },
  });
  return { newVersion: update.newVersion, journalEventId: update.journalEvent.journalEventId };
}

export interface CallerVerificationResult {
  verified: boolean;
  newVersion: number;
  journalEventId: string;
}

/**
 * Records caller verification. This gates packet reveal.
 * Caller ID is never authentication — the operator must positively verify
 * the caller through the approved procedure (Section 17.3).
 */
export async function recordCallerVerification(
  clients: DraftStoreClients,
  config: OperatorServiceConfig,
  input: CallerVerificationInput
): Promise<CallerVerificationResult> {
  const draft = await getDraft(clients, config, input.draftId);
  if (!draft) {
    throw new Error(`Draft not found: ${input.draftId}`);
  }

  const nowIso = new Date().toISOString();
  if (
    draft.metadata.status !== "calling_now" &&
    draft.metadata.status !== "agent_claimed"
  ) {
    throw new Error("Caller verification requires a calling-now or claimed callback draft");
  }
  if (draft.metadata.version !== input.expectedVersion) {
    throw new DraftVersionConflictError(input.expectedVersion, draft.metadata.version);
  }
  assertNoRestrictedStructuredContent(input.verificationNotes ?? "");
  const verificationExpiresAtIso = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const encryptedVerification = await encryptJson(clients.encryption, {
    callerIdState: input.callerIdState,
    verificationNotes: input.verificationNotes ?? "",
  });
  const callerIdEvent = buildJournalEvent({
    draftId: input.draftId,
    eventType: "caller_id_compared" as BookingJournalEventType,
    actorType: "operator",
    occurredAtIso: nowIso,
    privacyClass: "operational",
    idempotencyKey: `caller-id-${input.operatorSessionId}-${nowIso}`,
    expectedDraftVersion: input.expectedVersion,
    sequence: draft.metadata.journalSequence + 1,
    payload: { callerIdState: input.callerIdState },
  });
  const verificationEvent = buildJournalEvent({
      draftId: input.draftId,
      eventType: "caller_verification_recorded" as BookingJournalEventType,
      actorType: "operator",
      occurredAtIso: nowIso,
      privacyClass: "operational",
      idempotencyKey: `caller-verified-${input.operatorSessionId}-${nowIso}`,
      expectedDraftVersion: input.expectedVersion,
      sequence: draft.metadata.journalSequence + 2,
      payload: {
        operatorSessionId: input.operatorSessionId,
        callerIdState: input.callerIdState,
        verificationOutcome: "verified",
        hasNotes: Boolean(input.verificationNotes),
      },
    });
  await clients.dynamo.send(
    new TransactWriteItemsCommand({
      TransactItems: [
        {
          Update: {
            TableName: config.tableName,
            Key: { PK: { S: `DRAFT#${input.draftId}` }, SK: { S: "META" } },
            UpdateExpression: "SET journalSequence = :sequence, lastJournalEventAtIso = :now",
            ConditionExpression: "#version = :version AND journalSequence = :priorSequence AND #status = :callingNow",
            ExpressionAttributeNames: { "#version": "version", "#status": "status" },
            ExpressionAttributeValues: {
              ":version": { N: String(input.expectedVersion) },
              ":priorSequence": { N: String(draft.metadata.journalSequence) },
              ":sequence": { N: String(draft.metadata.journalSequence + 2) },
              ":now": { S: nowIso },
              ":callingNow": { S: "calling_now" },
            },
          },
        },
        {
          Put: {
            TableName: config.tableName,
            Item: callerIdEvent.item as never,
            ConditionExpression: "attribute_not_exists(PK)",
          },
        },
        {
          Put: {
            TableName: config.tableName,
            Item: verificationEvent.item as never,
            ConditionExpression: "attribute_not_exists(PK)",
          },
        },
        {
          Put: {
            TableName: config.tableName,
            Item: {
              PK: { S: `DRAFT#${input.draftId}` },
              SK: { S: `OPERATOR_VERIFICATION#${input.operatorSessionId}` },
              operatorSessionId: { S: input.operatorSessionId },
              verifiedDraftVersion: { N: String(input.expectedVersion) },
              verifiedAtIso: { S: nowIso },
              expiresAtIso: { S: verificationExpiresAtIso },
              ttlEpochSeconds: { N: String(Math.floor(Date.parse(verificationExpiresAtIso) / 1000)) },
              encryptedVerification: {
                M: {
                  ciphertext: { S: encryptedVerification.ciphertext },
                  iv: { S: encryptedVerification.iv },
                  tag: { S: encryptedVerification.tag },
                  encryptedDataKey: { S: encryptedVerification.encryptedDataKey },
                  kmsKeyArn: { S: encryptedVerification.kmsKeyArn },
                },
              },
            },
          },
        },
      ],
    })
  );

  return {
    verified: true,
    newVersion: input.expectedVersion,
    journalEventId: verificationEvent.record.journalEventId,
  };
}

// ── Reveal packet (only after verification) ────────────────────────────────

export interface RevealPacketInput {
  draftId: string;
  operatorSessionId: string;
}

export interface RevealedPacket {
  draft: BookingDraft;
  revealedAtIso: string;
  journalEventId: string;
}

/**
 * Reveals the full decrypted packet to the authenticated operator.
 * Caller must have already recorded verification — this function
 * journals the reveal for audit.
 */
export async function revealPacket(
  clients: DraftStoreClients,
  config: OperatorServiceConfig,
  input: RevealPacketInput
): Promise<RevealedPacket> {
  const draft = await getDraft(clients, config, input.draftId);
  if (!draft) {
    throw new Error(`Draft not found: ${input.draftId}`);
  }

  const leaseExpiresAt = draft.metadata.claimLeaseExpiresAtIso
    ? Date.parse(draft.metadata.claimLeaseExpiresAtIso)
    : Number.NaN;
  if (
    (draft.metadata.status !== "agent_claimed" && draft.metadata.status !== "agent_processing") ||
    draft.metadata.assignedOperatorId !== input.operatorSessionId ||
    !Number.isFinite(leaseExpiresAt) ||
    leaseExpiresAt <= Date.now()
  ) {
    throw new Error("Active operator claim is required before packet reveal");
  }

  const nowIso = new Date().toISOString();
  const revealEvent = await writeJournalEvent(
    clients.dynamo,
    config.tableName,
    {
      draftId: input.draftId,
      eventType: "operator_call_draft_pinned" as BookingJournalEventType,
      actorType: "operator",
      occurredAtIso: nowIso,
      privacyClass: "booking_pii",
      idempotencyKey: `reveal-${input.operatorSessionId}-${nowIso}`,
      expectedDraftVersion: draft.metadata.version,
      sequence: draft.metadata.journalSequence + 1,
      payload: {
        operatorSessionId: input.operatorSessionId,
        action: "packet_revealed",
      },
    }
  );

  return {
    draft,
    revealedAtIso: nowIso,
    journalEventId: revealEvent.journalEventId,
  };
}

// ── Operator claim ──────────────────────────────────────────────────────────

export interface OperatorClaimInput {
  draftId: string;
  expectedVersion: number;
  operatorSessionId: string;
}

export interface OperatorClaimResult {
  newVersion: number;
  claimLeaseExpiresAtIso: string;
  journalEventId: string;
}

export interface DismissDraftInput {
  draftId: string;
  expectedVersion: number;
  operatorSessionId: string;
  reason?: string;
}

export interface DismissDraftResult {
  newVersion: number;
  journalEventId: string;
}

/**
 * Removes an unwanted draft from the active operator queue without deleting the
 * packet or its audit history. This is intended for stale test drafts and
 * pre-call drafts an operator deliberately closes.
 *
 * Dismissal parks the draft in `abandoned`, NOT terminal `cancelled`: a guest
 * who was mid-flow when an operator cleaned up the queue can still resume it
 * (`abandoned → collecting`). A true terminal end (guest cancel / delete) uses
 * `cancelled` elsewhere.
 */
export async function dismissDraft(
  clients: DraftStoreClients,
  config: OperatorServiceConfig,
  input: DismissDraftInput
): Promise<DismissDraftResult> {
  const draft = await getDraft(clients, config, input.draftId);
  if (!draft) {
    throw new Error("Booking draft was not found");
  }

  if (draft.metadata.status === "booking_confirmed") {
    throw new Error("A confirmed booking cannot be dismissed from the queue");
  }

  if (draft.metadata.status === "agent_processing") {
    const claimLeaseExpiresAt = Date.parse(draft.metadata.claimLeaseExpiresAtIso ?? "");
    if (!Number.isFinite(claimLeaseExpiresAt) || claimLeaseExpiresAt > Date.now()) {
      throw new Error("An actively leased booking cannot be dismissed from the queue");
    }
  }

  const nowIso = new Date().toISOString();
  const updateResult = await updateDraftStatusWithJournal(clients, config, {
    draftId: input.draftId,
    expectedVersion: input.expectedVersion,
    newStatus: "abandoned",
    idempotencyKey: `dismiss-${input.operatorSessionId}-${nowIso}`,
    journalEvent: {
      eventType: "operator_draft_dismissed" as BookingJournalEventType,
      actorType: "operator",
      occurredAtIso: nowIso,
      privacyClass: "operational",
      idempotencyKey: `dismiss-event-${input.operatorSessionId}-${nowIso}`,
      payload: {
        operatorSessionId: input.operatorSessionId,
        reason: input.reason ?? "operator_queue_cleanup",
      },
    }
  });

  emitBookingMilestone({
    dealId: draft.metadata.dealId,
    eventType: "booking_cancelled",
    draftId: input.draftId,
    status: "abandoned",
  });
  await stopReminderProgram(clients.dynamo, config, input.draftId, "operator_dismissed");

  return {
    newVersion: updateResult.newVersion,
    journalEventId: updateResult.journalEvent.journalEventId,
  };
}

/**
 * Operator claims a draft. Sets a claim lease to prevent concurrent operators.
 */
export async function claimDraft(
  clients: DraftStoreClients,
  config: OperatorServiceConfig,
  input: OperatorClaimInput
): Promise<OperatorClaimResult> {
  const nowIso = new Date().toISOString();
  const currentDraft = await getDraft(clients, config, input.draftId);
  if (!currentDraft) throw new Error("Booking draft was not found");
  if (currentDraft.metadata.status !== "human_requested") {
    const verification = await clients.dynamo.send(
      new GetItemCommand({
        TableName: config.tableName,
        Key: {
          PK: { S: `DRAFT#${input.draftId}` },
          SK: { S: `OPERATOR_VERIFICATION#${input.operatorSessionId}` },
        },
      })
    );
    const verifiedDraftVersion = Number(
      (verification.Item?.verifiedDraftVersion as { N?: string })?.N ?? "0"
    );
    const verificationExpiresAtIso =
      (verification.Item?.expiresAtIso as { S?: string })?.S ?? "";
    if (
      verifiedDraftVersion !== input.expectedVersion ||
      Date.parse(verificationExpiresAtIso) <= Date.now()
    ) {
      throw new Error("Current caller verification is required before claiming this draft");
    }
  }
  const leaseExpiry = new Date(Date.now() + config.claimLeaseSeconds * 1000).toISOString();

  const updateResult = await updateDraftStatusWithJournal(clients, config, {
    draftId: input.draftId,
    expectedVersion: input.expectedVersion,
    newStatus: "agent_claimed",
    idempotencyKey: `claim-${input.operatorSessionId}-${nowIso}`,
    additionalUpdates: {
      assignedOperatorId: input.operatorSessionId,
      claimLeaseExpiresAtIso: leaseExpiry,
    },
    journalEvent: {
      eventType: "operator_claimed" as BookingJournalEventType,
      actorType: "operator",
      occurredAtIso: nowIso,
      privacyClass: "operational",
      idempotencyKey: `claim-event-${input.operatorSessionId}-${nowIso}`,
      payload: {
        operatorSessionId: input.operatorSessionId,
        leaseExpiresAtIso: leaseExpiry,
      },
    }
  });
  await stopReminderProgram(clients.dynamo, config, input.draftId, "operator_claimed");

  return {
    newVersion: updateResult.newVersion,
    claimLeaseExpiresAtIso: leaseExpiry,
    journalEventId: updateResult.journalEvent.journalEventId,
  };
}

// ── Start agent processing ──────────────────────────────────────────────────

export interface StartProcessingInput {
  draftId: string;
  expectedVersion: number;
  operatorSessionId: string;
}

export interface StartProcessingResult {
  newVersion: number;
  journalEventId: string;
}

export async function startAgentProcessing(
  clients: DraftStoreClients,
  config: OperatorServiceConfig,
  input: StartProcessingInput
): Promise<StartProcessingResult> {
  const nowIso = new Date().toISOString();
  await requireActiveOperatorClaim(clients, config, input.draftId, input.operatorSessionId);

  const updateResult = await updateDraftStatusWithJournal(clients, config, {
    draftId: input.draftId,
    expectedVersion: input.expectedVersion,
    newStatus: "agent_processing",
    idempotencyKey: `processing-${input.operatorSessionId}-${nowIso}`,
    journalEvent: {
      eventType: "agent_processing_started" as BookingJournalEventType,
      actorType: "operator",
      occurredAtIso: nowIso,
      privacyClass: "operational",
      idempotencyKey: `processing-event-${input.operatorSessionId}-${nowIso}`,
      payload: {
        operatorSessionId: input.operatorSessionId,
      },
    }
  });

  return {
    newVersion: updateResult.newVersion,
    journalEventId: updateResult.journalEvent.journalEventId,
  };
}

// ── Record call outcome ─────────────────────────────────────────────────────

export interface RecordOutcomeInput {
  draftId: string;
  expectedVersion: number;
  operatorSessionId: string;
  outcome: CallOutcome;
  notes?: string;
}

export interface RecordOutcomeResult {
  newVersion: number;
  newStatus: BookingDraftStatus;
  journalEventId: string;
}

export interface ReconcileBookingInput {
  draftId: string;
  expectedVersion: number;
  operatorSessionId: string;
  bookingReference: string;
  evidenceType: "cbat_trip" | "supplier_confirmation";
}

export interface ReconcileBookingResult {
  newVersion: number;
  newStatus: "booking_confirmed";
  journalEventId: string;
}

/**
 * Records the call outcome and transitions the draft to the appropriate
 * next status based on the outcome type.
 */
export async function recordCallOutcome(
  clients: DraftStoreClients,
  config: OperatorServiceConfig,
  input: RecordOutcomeInput
): Promise<RecordOutcomeResult> {
  const nowIso = new Date().toISOString();
  await requireActiveOperatorClaim(clients, config, input.draftId, input.operatorSessionId);
  assertAllowedStructuredKeys({ notes: input.notes });
  assertNoRestrictedStructuredContent(input.notes ?? "");
  const encryptedOutcome = await encryptJson(clients.encryption, {
    outcome: input.outcome,
    notes: input.notes ?? "",
  });

  // Determine next status from outcome
  const nextStatus = outcomeToStatus(input.outcome);

  const updateResult = await updateDraftStatusWithJournal(clients, config, {
    draftId: input.draftId,
    expectedVersion: input.expectedVersion,
    newStatus: nextStatus,
    idempotencyKey: `outcome-${input.operatorSessionId}-${nowIso}`,
    journalEvent: {
      eventType: "call_outcome_recorded" as BookingJournalEventType,
      actorType: "operator",
      occurredAtIso: nowIso,
      privacyClass: "operational",
      idempotencyKey: `outcome-event-${input.operatorSessionId}-${nowIso}`,
      payload: {
        outcome: input.outcome,
        outcomeLabel: callOutcomeLabels[input.outcome],
        hasNotes: Boolean(input.notes),
      },
    },
    extraPutItems: [
      {
        PK: { S: `DRAFT#${input.draftId}` },
        SK: { S: `OPERATOR_OUTCOME#${nowIso}` },
        outcome: { S: input.outcome },
        recordedAtIso: { S: nowIso },
        operatorSessionId: { S: input.operatorSessionId },
        encryptedOutcome: {
          M: {
            ciphertext: { S: encryptedOutcome.ciphertext },
            iv: { S: encryptedOutcome.iv },
            tag: { S: encryptedOutcome.tag },
            encryptedDataKey: { S: encryptedOutcome.encryptedDataKey },
            kmsKeyArn: { S: encryptedOutcome.kmsKeyArn },
          },
        },
      },
    ],
  });

  if (nextStatus === "booking_confirmed") {
    await stopReminderProgram(clients.dynamo, config, input.draftId, "booking_confirmed");
    emitBookingMilestoneForDraft(clients.dynamo, config.tableName, {
      eventType: "booking_confirmed",
      draftId: input.draftId,
      status: nextStatus,
    });
  }

  return {
    newVersion: updateResult.newVersion,
    newStatus: nextStatus,
    journalEventId: updateResult.journalEvent.journalEventId,
  };
}

/**
 * Confirms a booking only after the operator has reconciled an authoritative
 * booking reference. The reference is encrypted and never enters the journal.
 */
export async function reconcileBookingReference(
  clients: DraftStoreClients,
  config: OperatorServiceConfig,
  input: ReconcileBookingInput
): Promise<ReconcileBookingResult> {
  const draft = await requireActiveOperatorClaim(
    clients,
    config,
    input.draftId,
    input.operatorSessionId
  );
  if (draft.metadata.status !== "reconciliation_review") {
    throw new Error("Booking reconciliation requires reconciliation_review status");
  }
  const bookingReference = input.bookingReference.trim();
  if (bookingReference.length < 3 || bookingReference.length > 100) {
    throw new Error("A valid authoritative booking reference is required");
  }
  assertNoRestrictedStructuredContent(bookingReference);
  const nowIso = new Date().toISOString();
  const encryptedReconciliation = await encryptJson(clients.encryption, {
    bookingReference,
    evidenceType: input.evidenceType,
  });
  const updateResult = await updateDraftStatusWithJournal(clients, config, {
    draftId: input.draftId,
    expectedVersion: input.expectedVersion,
    newStatus: "booking_confirmed",
    idempotencyKey: `reconcile-${input.operatorSessionId}-${nowIso}`,
    journalEvent: {
      eventType: "reconciliation_completed",
      actorType: "reconciliation",
      occurredAtIso: nowIso,
      privacyClass: "operational",
      idempotencyKey: `reconcile-event-${input.operatorSessionId}-${nowIso}`,
      payload: {
        evidenceType: input.evidenceType,
        bookingReferencePresent: true,
      },
    },
    extraPutItems: [
      {
        PK: { S: `DRAFT#${input.draftId}` },
        SK: { S: "RECONCILIATION#BOOKING_REFERENCE" },
        recordedAtIso: { S: nowIso },
        operatorSessionId: { S: input.operatorSessionId },
        evidenceType: { S: input.evidenceType },
        encryptedReconciliation: {
          M: {
            ciphertext: { S: encryptedReconciliation.ciphertext },
            iv: { S: encryptedReconciliation.iv },
            tag: { S: encryptedReconciliation.tag },
            encryptedDataKey: { S: encryptedReconciliation.encryptedDataKey },
            kmsKeyArn: { S: encryptedReconciliation.kmsKeyArn },
          },
        },
      },
    ],
  });
  await stopReminderProgram(clients.dynamo, config, input.draftId, "booking_confirmed");
  emitBookingMilestoneForDraft(clients.dynamo, config.tableName, {
    eventType: "booking_confirmed",
    draftId: input.draftId,
    status: "booking_confirmed",
  });
  return {
    newVersion: updateResult.newVersion,
    newStatus: "booking_confirmed",
    journalEventId: updateResult.journalEvent.journalEventId,
  };
}

export async function requireActiveOperatorClaim(
  clients: DraftStoreClients,
  config: OperatorServiceConfig,
  draftId: string,
  operatorSessionId: string
): Promise<BookingDraft> {
  const draft = await getDraft(clients, config, draftId);
  if (!draft) throw new Error("Booking draft was not found");
  const leaseExpiresAt = Date.parse(draft.metadata.claimLeaseExpiresAtIso ?? "");
  if (
    draft.metadata.assignedOperatorId !== operatorSessionId ||
    !Number.isFinite(leaseExpiresAt) ||
    leaseExpiresAt <= Date.now() ||
    (
      draft.metadata.status !== "agent_claimed" &&
      draft.metadata.status !== "agent_processing" &&
      draft.metadata.status !== "reconciliation_review"
    )
  ) {
    throw new Error("An active operator claim is required");
  }
  await renewClaimLease(clients, config, draftId, operatorSessionId, config.claimLeaseSeconds);
  return draft;
}

export function outcomeToStatus(outcome: CallOutcome): BookingDraftStatus {
  switch (outcome) {
    case "confirmed":
      return "reconciliation_review";
    case "completed_pending_reconciliation":
      return "reconciliation_review";
    case "payment_failed":
      return "payment_failed";
    case "declined":
      return "needs_guest";
    case "needs_guest_decision":
      return "needs_guest";
    case "material_change":
      return "needs_guest";
    case "disconnected_call_back":
      return "ready_to_call_agent";
    case "no_call_received":
      return "ready_to_call_agent";
    default:
      return "needs_guest";
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Mask phone to show only last 4 digits. */
function maskPhone(phoneE164: string): string {
  let digits = "";
  for (const character of phoneE164) {
    if (character >= "0" && character <= "9") digits += character;
  }
  const last4 = digits.slice(-4);
  return `••• ••• ${last4 || "----"}`;
}

// ── Re-export key types and utilities for API routes ────────────────────────

export {
  canTransitionBookingStatus,
  callOutcomeLabels,
  computeCallKeyHmac,
  constantTimeHmacMatch,
  normalizeCallKeyInput,
  selectRandomCallKey,
  saveFallbackCallKey,
  getDraft,
  updateDraftStatusWithJournal,
  writeJournalEvent,
  DraftVersionConflictError,
  InvalidTransitionError,
};
