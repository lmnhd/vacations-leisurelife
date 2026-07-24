/**
 * Guest-facing draft operations core logic.
 * These run behind the BOOKING_ASSISTANT_ENABLED feature flag and
 * use the same encrypted DynamoDB store as the operator service.
 *
 * Unlike operator routes, guest routes do NOT assume the local operator
 * role — they use default AWS credentials with limited IAM scope.
 */

import type { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { KMSClient } from "@aws-sdk/client-kms";

import { createEncryptionHelper, type EncryptionHelper } from "@/lib/booking-assistant/encryption";
import {
  createDraft,
  getDraft,
  saveCabin,
  saveDecisions,
  saveFallbackCallKey,
  saveTravelers,
  updateDraftStatus,
  type DraftStoreClients,
  type DraftStoreConfig,
  type DraftSnapshot,
} from "@/lib/booking-assistant/store";
import {
  selectRandomCallKey,
} from "@/lib/booking-assistant/fallback-call-key";
import {
  writeJournalEvent,
} from "@/lib/booking-assistant/activity-journal";
import type { BookingDraftStatus } from "@/lib/booking-assistant/contracts";
import type { CabinRecord, ContactRecord, DealPriceSnapshot, DecisionsAndConsents, TravelerRecord } from "@/lib/booking-assistant/types";

export interface GuestStoreClients {
  dynamo: DynamoDBClient;
  encryption: EncryptionHelper;
}

export interface GuestStoreConfig extends DraftStoreConfig {}

export function createGuestStoreClients(
  dynamo: DynamoDBClient,
  kms: KMSClient,
  kmsKeyArn: string
): GuestStoreClients {
  const encryption = createEncryptionHelper(kms, kmsKeyArn);
  return { dynamo, encryption };
}

// ── Save draft ──────────────────────────────────────────────────────────────

export interface SaveDraftInput {
  draftId: string;
  personId: string;
  dealSnapshot: DealPriceSnapshot;
  contact: ContactRecord;
  travelers?: TravelerRecord[];
  cabin?: CabinRecord;
  decisions?: Partial<DecisionsAndConsents>;
  initialStatus: BookingDraftStatus;
  flowDefinitionVersion: number;
  bookingFlowVersion: number;
  completionMode: string;
  completionModeVersion: number;
}

export interface SaveDraftResult {
  draftId: string;
  version: number;
  createdAtIso: string;
  fallbackCallKey: {
    rawKey: string;
    normalizedKey: string;
    keyVersion: number;
  };
}

/**
 * Creates a new booking draft and issues a fallback call key.
 * Transactional: draft META + CONTACT + CALL_KEY + CALL_KEY_LOOKUP.
 */
export async function saveDraft(
  clients: GuestStoreClients,
  config: GuestStoreConfig,
  input: SaveDraftInput
): Promise<SaveDraftResult> {
  const draftResult = await createDraft(clients as DraftStoreClients, config, {
    draftId: input.draftId,
    personId: input.personId,
    dealSnapshot: input.dealSnapshot,
    contact: input.contact,
    initialStatus: input.initialStatus,
    flowDefinitionVersion: input.flowDefinitionVersion,
    bookingFlowVersion: input.bookingFlowVersion,
    completionMode: input.completionMode,
    completionModeVersion: input.completionModeVersion,
  });

  const callKey = selectRandomCallKey();

  if (input.decisions) {
    await saveDecisions(clients as DraftStoreClients, config, {
      draftId: input.draftId,
      expectedVersion: draftResult.version,
      decisions: {
        passengerDataReviewConfirmed: false,
        packetStorageConsent: false,
        ...input.decisions,
      },
    });
  }

  if (input.travelers && input.travelers.length > 0) {
    await saveTravelers(clients as DraftStoreClients, config, {
      draftId: input.draftId,
      expectedVersion: draftResult.version,
      travelers: input.travelers,
    });
  }

  if (input.cabin) {
    await saveCabin(clients as DraftStoreClients, config, {
      draftId: input.draftId,
      expectedVersion: draftResult.version,
      cabin: input.cabin,
    });
  }

  await saveFallbackCallKey(clients as DraftStoreClients, config, {
    draftId: input.draftId,
    expectedVersion: draftResult.version,
    rawKey: callKey.rawKey,
    lookupHmac: callKey.lookupHmac,
    keyVersion: callKey.keyVersion,
    packetVersion: 0,
  });

  await writeJournalEvent(clients.dynamo, config.tableName, {
    draftId: input.draftId,
    eventType: "fallback_call_key_issued" as never,
    actorType: "system",
    occurredAtIso: new Date().toISOString(),
    privacyClass: "operational",
    idempotencyKey: `key-issued-${input.draftId}-${Date.now()}`,
    expectedDraftVersion: draftResult.version,
    sequence: 1,
    payload: { keyVersion: callKey.keyVersion },
  });

  return {
    draftId: draftResult.draftId,
    version: draftResult.version,
    createdAtIso: draftResult.createdAtIso,
    fallbackCallKey: {
      rawKey: callKey.rawKey,
      normalizedKey: callKey.normalizedKey,
      keyVersion: callKey.keyVersion,
    },
  };
}

// ── Resume draft ────────────────────────────────────────────────────────────

export interface ResumeDraftResult {
  draft: DraftSnapshot;
}

export async function resumeDraft(
  clients: GuestStoreClients,
  config: GuestStoreConfig,
  draftId: string
): Promise<ResumeDraftResult | null> {
  const draft = await getDraft(clients as DraftStoreClients, config, draftId);
  if (!draft) return null;
  return { draft };
}

// ── Signal call intent ──────────────────────────────────────────────────────

export interface SignalCallIntentInput {
  draftId: string;
  expectedVersion: number;
}

export interface SignalCallIntentResult {
  newVersion: number;
  callAttemptId: string;
  signalExpiresAtIso: string;
}

/**
 * Transitions draft to call_signal_pending and journals the event.
 * The guest has tapped "Call agent to finalize" — this publishes
 * the call-intent signal for the operator console.
 */
export async function signalCallIntent(
  clients: GuestStoreClients,
  config: GuestStoreConfig,
  input: SignalCallIntentInput
): Promise<SignalCallIntentResult> {
  const nowIso = new Date().toISOString();
  const expiresAtIso = new Date(Date.now() + 120_000).toISOString();
  const callAttemptId = `call-${input.draftId}-${Date.now()}`;

  const updateResult = await updateDraftStatus(clients as DraftStoreClients, config, {
    draftId: input.draftId,
    expectedVersion: input.expectedVersion,
    newStatus: "call_signal_pending",
    idempotencyKey: `call-intent-${callAttemptId}`,
    additionalUpdates: {
      activeCallAttemptId: callAttemptId,
      callIntentExpiresAtIso: expiresAtIso,
      callKeyState: "active",
    },
  });

  await writeJournalEvent(clients.dynamo, config.tableName, {
    draftId: input.draftId,
    eventType: "call_intent_signal_published" as never,
    actorType: "guest",
    occurredAtIso: nowIso,
    privacyClass: "operational",
    idempotencyKey: `signal-${callAttemptId}`,
    expectedDraftVersion: updateResult.newVersion,
    sequence: 0,
    payload: {
      callAttemptId,
      expiresAtIso,
    },
  });

  return {
    newVersion: updateResult.newVersion,
    callAttemptId,
    signalExpiresAtIso: expiresAtIso,
  };
}

// ── Mark review ready ───────────────────────────────────────────────────────

export interface MarkReviewReadyInput {
  draftId: string;
  expectedVersion: number;
  travelers?: TravelerRecord[];
  cabin?: CabinRecord;
  decisions?: Partial<DecisionsAndConsents>;
}

export interface MarkReviewReadyResult {
  newVersion: number;
}

/**
 * Transitions draft to review_ready after the guest confirms all tasks.
 */
export async function markReviewReady(
  clients: GuestStoreClients,
  config: GuestStoreConfig,
  input: MarkReviewReadyInput
): Promise<MarkReviewReadyResult> {
  if (input.travelers && input.travelers.length > 0) {
    await saveTravelers(clients as DraftStoreClients, config, {
      draftId: input.draftId,
      expectedVersion: input.expectedVersion,
      travelers: input.travelers,
    });
  }

  if (input.cabin) {
    await saveCabin(clients as DraftStoreClients, config, {
      draftId: input.draftId,
      expectedVersion: input.expectedVersion,
      cabin: input.cabin,
    });
  }

  if (input.decisions) {
    await saveDecisions(clients as DraftStoreClients, config, {
      draftId: input.draftId,
      expectedVersion: input.expectedVersion,
      decisions: {
        passengerDataReviewConfirmed: false,
        packetStorageConsent: false,
        ...input.decisions,
      },
    });
  }

  const updateResult = await updateDraftStatus(clients as DraftStoreClients, config, {
    draftId: input.draftId,
    expectedVersion: input.expectedVersion,
    newStatus: "review_ready",
    idempotencyKey: `review-ready-${input.draftId}-${Date.now()}`,
  });

  await writeJournalEvent(clients.dynamo, config.tableName, {
    draftId: input.draftId,
    eventType: "booking_packet_reviewed" as never,
    actorType: "guest",
    occurredAtIso: new Date().toISOString(),
    privacyClass: "operational",
    idempotencyKey: `reviewed-${input.draftId}-${Date.now()}`,
    expectedDraftVersion: updateResult.newVersion,
    sequence: 0,
    payload: {},
  });

  return { newVersion: updateResult.newVersion };
}
