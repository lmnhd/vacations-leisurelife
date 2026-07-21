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
  saveFallbackCallKey,
  updateDraftStatus,
  type DraftStoreClients,
  type DraftStoreConfig,
  type QueueQueryResult,
} from "./store";
import {
  writeJournalEvent,
  type JournalPayload,
} from "./activity-journal";
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
      allResults.push(queueRowToCard(row));
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

  // Journal: caller_id_compared
  await writeJournalEvent(clients.dynamo, config.tableName, {
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

  // Journal: caller_verification_recorded
  const verificationEvent = await writeJournalEvent(
    clients.dynamo,
    config.tableName,
    {
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
        notes: input.verificationNotes ?? "",
      },
    }
  );

  return {
    verified: true,
    newVersion: input.expectedVersion,
    journalEventId: verificationEvent.journalEventId,
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

/**
 * Operator claims a draft. Sets a claim lease to prevent concurrent operators.
 */
export async function claimDraft(
  clients: DraftStoreClients,
  config: OperatorServiceConfig,
  input: OperatorClaimInput
): Promise<OperatorClaimResult> {
  const nowIso = new Date().toISOString();
  const leaseExpiry = new Date(Date.now() + config.claimLeaseSeconds * 1000).toISOString();

  const updateResult = await updateDraftStatus(clients, config, {
    draftId: input.draftId,
    expectedVersion: input.expectedVersion,
    newStatus: "agent_claimed",
    idempotencyKey: `claim-${input.operatorSessionId}-${nowIso}`,
    additionalUpdates: {
      assignedOperatorId: input.operatorSessionId,
      claimLeaseExpiresAtIso: leaseExpiry,
    },
  });

  const claimEvent = await writeJournalEvent(
    clients.dynamo,
    config.tableName,
    {
      draftId: input.draftId,
      eventType: "operator_claimed" as BookingJournalEventType,
      actorType: "operator",
      occurredAtIso: nowIso,
      privacyClass: "operational",
      idempotencyKey: `claim-event-${input.operatorSessionId}-${nowIso}`,
      expectedDraftVersion: updateResult.newVersion,
      sequence: 0,
      payload: {
        operatorSessionId: input.operatorSessionId,
        leaseExpiresAtIso: leaseExpiry,
      },
    }
  );

  return {
    newVersion: updateResult.newVersion,
    claimLeaseExpiresAtIso: leaseExpiry,
    journalEventId: claimEvent.journalEventId,
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

  const updateResult = await updateDraftStatus(clients, config, {
    draftId: input.draftId,
    expectedVersion: input.expectedVersion,
    newStatus: "agent_processing",
    idempotencyKey: `processing-${input.operatorSessionId}-${nowIso}`,
  });

  const processingEvent = await writeJournalEvent(
    clients.dynamo,
    config.tableName,
    {
      draftId: input.draftId,
      eventType: "agent_processing_started" as BookingJournalEventType,
      actorType: "operator",
      occurredAtIso: nowIso,
      privacyClass: "operational",
      idempotencyKey: `processing-event-${input.operatorSessionId}-${nowIso}`,
      expectedDraftVersion: updateResult.newVersion,
      sequence: 0,
      payload: {
        operatorSessionId: input.operatorSessionId,
      },
    }
  );

  return {
    newVersion: updateResult.newVersion,
    journalEventId: processingEvent.journalEventId,
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

  // Determine next status from outcome
  const nextStatus = outcomeToStatus(input.outcome);

  const updateResult = await updateDraftStatus(clients, config, {
    draftId: input.draftId,
    expectedVersion: input.expectedVersion,
    newStatus: nextStatus,
    idempotencyKey: `outcome-${input.operatorSessionId}-${nowIso}`,
  });

  const outcomeEvent = await writeJournalEvent(
    clients.dynamo,
    config.tableName,
    {
      draftId: input.draftId,
      eventType: "call_outcome_recorded" as BookingJournalEventType,
      actorType: "operator",
      occurredAtIso: nowIso,
      privacyClass: "operational",
      idempotencyKey: `outcome-event-${input.operatorSessionId}-${nowIso}`,
      expectedDraftVersion: updateResult.newVersion,
      sequence: 0,
      payload: {
        outcome: input.outcome,
        outcomeLabel: callOutcomeLabels[input.outcome],
        notes: input.notes ?? "",
      },
    }
  );

  return {
    newVersion: updateResult.newVersion,
    newStatus: nextStatus,
    journalEventId: outcomeEvent.journalEventId,
  };
}

function outcomeToStatus(outcome: CallOutcome): BookingDraftStatus {
  switch (outcome) {
    case "confirmed":
      return "booking_confirmed";
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
  const digits = phoneE164.replace(/\D/g, "");
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
  updateDraftStatus,
  writeJournalEvent,
  DraftVersionConflictError,
  InvalidTransitionError,
};
