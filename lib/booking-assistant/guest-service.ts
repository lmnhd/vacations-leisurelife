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
import { sendAdminPushNotification } from "@/lib/pushover";

import {
  createEncryptionHelper,
  encryptJson,
  type EncryptionHelper,
} from "@/lib/booking-assistant/encryption";
import {
  cabinSk,
  createDraftWithArtifacts,
  getDraft,
  updateDraftStatusWithJournal,
  serializeCabinItem,
  serializeDecisionsItem,
  serializeTravelerItem,
  travelerSk,
  type DraftStoreClients,
  type DraftStoreConfig,
  type DraftSnapshot,
} from "@/lib/booking-assistant/store";
import {
  normalizeCallKeyInput,
  selectRandomCallKey,
} from "@/lib/booking-assistant/fallback-call-key";
import {
  emitBookingMilestone,
  emitBookingMilestoneForDraft,
} from "@/lib/booking-assistant/deal-milestones";
import {
  BOOKING_GUEST_SESSION_COOKIE,
  createGuestSessionCookieValue,
  parseGuestSessionCookieValue,
  type GuestSessionCookiePayload,
} from "@/lib/booking-assistant/resume-tokens";
import type { BookingDraftStatus } from "@/lib/booking-assistant/contracts";
import type { BookingDraft, CabinRecord, ContactRecord, DealPriceSnapshot, DecisionsAndConsents, TravelerRecord } from "@/lib/booking-assistant/types";
import {
  assertAllowedStructuredKeys,
  assertNoRestrictedStructuredContent,
} from "@/lib/booking-assistant/redaction";
import {
  availabilityConditionCheck,
  getAgentAvailability,
} from "@/lib/booking-assistant/agent-availability";

export const GUEST_SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

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
  const protectedGuestInput = {
    contact: input.contact,
    travelers: input.travelers,
    cabin: input.cabin,
    decisions: input.decisions,
  };
  assertAllowedStructuredKeys(protectedGuestInput);
  assertNoRestrictedStructuredContent(protectedGuestInput);
  const callKey = selectRandomCallKey();

  const draftResult = await createDraftWithArtifacts(clients as DraftStoreClients, config, {
    draftId: input.draftId,
    personId: input.personId,
    dealSnapshot: input.dealSnapshot,
    contact: input.contact,
    decisions: input.decisions
      ? {
          passengerDataReviewConfirmed: false,
          packetStorageConsent: false,
          ...input.decisions,
        }
      : undefined,
    travelers: input.travelers,
    cabin: input.cabin,
    fallbackCallKey: {
      rawKey: callKey.rawKey,
      lookupHmac: callKey.lookupHmac,
      keyVersion: callKey.keyVersion,
      packetVersion: 0,
    },
    initialStatus: input.initialStatus,
    flowDefinitionVersion: input.flowDefinitionVersion,
    bookingFlowVersion: input.bookingFlowVersion,
    completionMode: input.completionMode,
    completionModeVersion: input.completionModeVersion,
    journalEvent: {
      eventType: "fallback_call_key_issued" as never,
      actorType: "system",
      occurredAtIso: new Date().toISOString(),
      privacyClass: "operational",
      idempotencyKey: `key-issued-${input.draftId}-${Date.now()}`,
      payload: { keyVersion: callKey.keyVersion },
    },
  });

  // Dashboard analytics projection — fire-and-forget, never awaited.
  emitBookingMilestone({
    dealId: input.dealSnapshot.dealId,
    eventType: "booking_packet_saved",
    draftId: input.draftId,
    email: input.contact.email,
    firstName: input.contact.firstName,
    status: input.initialStatus,
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

type GuestReopenReason =
  | "resume_session"
  | "continue_later"
  | "review_ready"
  | "call_signal";

const GUEST_REOPENABLE_STATUSES: readonly BookingDraftStatus[] = [
  "cancelled",
  "abandoned",
  "expired",
] as const;

async function reopenGuestOwnedDraftIfNeeded(
  clients: GuestStoreClients,
  config: GuestStoreConfig,
  draft: DraftSnapshot,
  reason: GuestReopenReason
): Promise<DraftSnapshot> {
  if (!GUEST_REOPENABLE_STATUSES.includes(draft.metadata.status)) {
    return draft;
  }

  await updateDraftStatusWithJournal(clients as DraftStoreClients, config, {
    draftId: draft.metadata.bookingDraftId,
    expectedVersion: draft.metadata.version,
    newStatus: "collecting",
    idempotencyKey: `guest-reopen:${reason}:${draft.metadata.bookingDraftId}:${draft.metadata.version}`,
    journalEvent: {
      eventType: "guest_draft_reopened",
      actorType: "guest",
      occurredAtIso: new Date().toISOString(),
      privacyClass: "operational",
      idempotencyKey: `guest-reopen-event:${reason}:${draft.metadata.bookingDraftId}:${draft.metadata.version}`,
      payload: {
        reason,
        priorStatus: draft.metadata.status,
      },
    },
    additionalUpdates: {
      resumeTaskId: draft.metadata.resumeTaskId ?? draft.metadata.nextTaskId,
      nextTaskId: draft.metadata.nextTaskId ?? draft.metadata.resumeTaskId,
    },
  });

  const refreshed = await getDraft(clients as DraftStoreClients, config, draft.metadata.bookingDraftId);
  if (!refreshed) {
    throw new Error("Booking draft was not found after reopening");
  }
  return refreshed;
}

export function createGuestSessionForDraft(draftId: string, personId: string): {
  cookieName: typeof BOOKING_GUEST_SESSION_COOKIE;
  cookieValue: string;
  expiresAtIso: string;
} {
  const issuedAtIso = new Date().toISOString();
  const expiresAtIso = new Date(Date.now() + GUEST_SESSION_TTL_SECONDS * 1000).toISOString();
  const payload: GuestSessionCookiePayload = {
    draftId,
    personId,
    issuedAtIso,
    expiresAtIso,
  };
  return {
    cookieName: BOOKING_GUEST_SESSION_COOKIE,
    cookieValue: createGuestSessionCookieValue(payload),
    expiresAtIso,
  };
}

export async function resumeDraft(
  clients: GuestStoreClients,
  config: GuestStoreConfig,
  draftId: string,
  guestSessionCookieValue: string | undefined
): Promise<ResumeDraftResult | null> {
  if (!guestSessionCookieValue) {
    throw new Error("Guest session is required before resuming a draft");
  }
  const session = parseGuestSessionCookieValue(guestSessionCookieValue);
  if (!session || session.draftId !== draftId) {
    throw new Error("Guest session is not authorized for this draft");
  }
  const draft = await getDraft(clients as DraftStoreClients, config, draftId);
  if (!draft) return null;
  if (draft.metadata.personId !== session.personId) {
    throw new Error("Guest session does not match the draft owner");
  }
  const activeDraft = await reopenGuestOwnedDraftIfNeeded(
    clients,
    config,
    draft,
    "resume_session"
  );
  return { draft: activeDraft };
}

export async function ensureGuestDraftIsActive(
  clients: GuestStoreClients,
  config: GuestStoreConfig,
  draftId: string,
  personId: string,
  reason: GuestReopenReason
): Promise<DraftSnapshot> {
  const draft = await getDraft(clients as DraftStoreClients, config, draftId);
  if (!draft) {
    throw new Error("Booking draft was not found");
  }
  if (draft.metadata.personId !== personId) {
    throw new Error("Guest session does not match the draft owner");
  }
  return reopenGuestOwnedDraftIfNeeded(clients, config, draft, reason);
}

// ── Signal call intent ──────────────────────────────────────────────────────

export interface SignalCallIntentInput {
  draftId: string;
  expectedVersion: number;
}

export interface SignalCallIntentResult {
  outcome: "call_signaled" | "no_agents";
  newVersion: number;
  callAttemptId?: string;
  signalExpiresAtIso?: string;
}

export interface RequestHumanHelpInput {
  draftId: string;
  expectedVersion: number;
  taskId?: string;
}

export interface RequestHumanHelpResult {
  newVersion: number;
}

export interface OperatorHandoffPushContent {
  title: string;
  message: string;
}

export function buildOperatorHandoffPushContent(
  draft: Pick<BookingDraft, "metadata" | "dealSnapshot" | "contact">,
  rawCallKey?: string
): OperatorHandoffPushContent {
  const sailingDate = formatHandoffDate(draft.dealSnapshot.sailingDateIso);
  const phoneEnding = lastPhoneDigits(draft.contact.phoneE164, 4);
  const ship = draft.dealSnapshot.ship || draft.dealSnapshot.cruiseLine || "Cruise booking";
  const callKey = rawCallKey ? normalizeCallKeyInput(rawCallKey) : null;
  const lines = [
    "LIVE CALL WAITING",
    `${ship} - ${sailingDate}`,
    `Deal ${draft.metadata.dealId}${phoneEnding ? ` - Guest phone ending ${phoneEnding}` : ""}`,
    ...(callKey ? [`Call key: ${callKey}`] : []),
    "Next: Open Bookings, select this draft, and pin the call.",
  ];
  return {
    title: `Booking Assistant live call - ${ship}`,
    message: lines.join("\n"),
  };
}

export function buildHumanHelpPushContent(
  draft: Pick<BookingDraft, "metadata" | "dealSnapshot" | "contact">,
  taskTitle?: string,
  rawCallKey?: string
): OperatorHandoffPushContent {
  const sailingDate = formatHandoffDate(draft.dealSnapshot.sailingDateIso);
  const phoneEnding = lastPhoneDigits(draft.contact.phoneE164, 4);
  const ship = draft.dealSnapshot.ship || draft.dealSnapshot.cruiseLine || "Cruise booking";
  const callKey = rawCallKey ? normalizeCallKeyInput(rawCallKey) : null;
  const lines = [
    "GUEST REQUESTED HELP",
    `${ship} - ${sailingDate}`,
    `Deal ${draft.metadata.dealId}${phoneEnding ? ` - Guest phone ending ${phoneEnding}` : ""}`,
    ...(taskTitle ? [`Current step: ${taskTitle}`] : []),
    ...(callKey ? [`Call key: ${callKey}`] : []),
    "Next: Open Bookings, claim this help request, and call the guest back.",
  ];
  return {
    title: `Booking Assistant help request - ${ship}`,
    message: lines.join("\n"),
  };
}

function formatHandoffDate(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "Sailing date unavailable";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(timestamp));
}

function lastPhoneDigits(value: string, count: number): string {
  let digits = "";
  for (const character of value) {
    if (character >= "0" && character <= "9") digits += character;
  }
  return digits.slice(Math.max(0, digits.length - count));
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
  const currentDraft = await getDraft(
    clients as DraftStoreClients,
    config,
    input.draftId
  );
  if (!currentDraft) {
    throw new Error("Booking draft was not found");
  }

  const availability = await getAgentAvailability(clients.dynamo, config);
  if (availability.mode === "no_agents") {
    return {
      outcome: "no_agents",
      newVersion: currentDraft.metadata.version,
    };
  }

  if (
    currentDraft.metadata.status === "call_signal_pending" ||
    currentDraft.metadata.status === "calling_now"
  ) {
    return {
      outcome: "call_signaled",
      newVersion: currentDraft.metadata.version,
      callAttemptId:
        currentDraft.metadata.activeCallAttemptId ??
        `call-${input.draftId}-existing`,
      signalExpiresAtIso:
        currentDraft.metadata.callIntentExpiresAtIso ??
        new Date(Date.now() + 120_000).toISOString(),
    };
  }

  if (
    currentDraft.metadata.status !== "review_ready" &&
    currentDraft.metadata.status !== "ready_to_call_agent"
  ) {
    throw new Error(
      `This booking cannot alert the agent while its status is ${currentDraft.metadata.status}`
    );
  }

  const nowIso = new Date().toISOString();
  const expiresAtIso = new Date(Date.now() + 120_000).toISOString();
  const callAttemptId = `call-${input.draftId}-${Date.now()}`;

  let updateResult;
  try {
    updateResult = await updateDraftStatusWithJournal(clients as DraftStoreClients, config, {
      draftId: input.draftId,
      // The server read above is authoritative. Per-answer saves and resume
      // reconciliation can legitimately advance beyond the client's last
      // rendered version before the guest taps the call button.
      expectedVersion: currentDraft.metadata.version,
      newStatus: "call_signal_pending",
      idempotencyKey: `call-intent-${callAttemptId}`,
      additionalUpdates: {
        activeCallAttemptId: callAttemptId,
        callIntentExpiresAtIso: expiresAtIso,
        callKeyState: "active",
      },
      journalEvent: {
        eventType: "call_intent_signal_published" as never,
        actorType: "guest",
        occurredAtIso: nowIso,
        privacyClass: "operational",
        idempotencyKey: `signal-${callAttemptId}`,
        payload: {
          callAttemptId,
          expiresAtIso,
        },
      },
      extraTransactItems: [
        availabilityConditionCheck(config.tableName, nowIso),
      ],
    });
  } catch (error) {
    const availabilityAfterFailure = await getAgentAvailability(clients.dynamo, config);
    if (availabilityAfterFailure.mode === "no_agents") {
      return {
        outcome: "no_agents",
        newVersion: currentDraft.metadata.version,
      };
    }
    throw error;
  }

  emitBookingMilestoneForDraft(clients.dynamo, config.tableName, {
    eventType: "booking_call_requested",
    draftId: input.draftId,
    status: "call_signal_pending",
  });
  void getDraft(clients as DraftStoreClients, config, input.draftId).then(async (draft) => {
    const rawCallKey =
      draft?.fallbackCallKey?.state === "active" && draft.fallbackCallKey.encryptedRawValue
        ? await clients.encryption.decrypt(draft.fallbackCallKey.encryptedRawValue)
        : undefined;
    const content = draft
      ? buildOperatorHandoffPushContent(draft, rawCallKey)
      : {
          title: "Booking Assistant live call",
          message: "LIVE CALL WAITING\nNext: Open Bookings and pin the newest draft.",
        };
    return sendAdminPushNotification(content.message, {
      title: content.title,
      priority: "1",
    });
  }).catch((error: unknown) => {
    console.warn(
      "[booking-assistant] Optional Pushover handoff notification was not delivered:",
      error instanceof Error ? error.message : "unknown error"
    );
  });

  return {
    outcome: "call_signaled",
    newVersion: updateResult.newVersion,
    callAttemptId,
    signalExpiresAtIso: expiresAtIso,
  };
}

export async function requestHumanHelp(
  clients: GuestStoreClients,
  config: GuestStoreConfig,
  input: RequestHumanHelpInput
): Promise<RequestHumanHelpResult> {
  const currentDraft = await getDraft(clients as DraftStoreClients, config, input.draftId);
  if (!currentDraft) {
    throw new Error("Booking draft was not found");
  }
  if (
    currentDraft.metadata.status !== "collecting" &&
    currentDraft.metadata.status !== "review_ready" &&
    currentDraft.metadata.status !== "ready_to_call_agent" &&
    currentDraft.metadata.status !== "human_requested"
  ) {
    throw new Error(
      `Human help is unavailable while the draft is ${currentDraft.metadata.status}`
    );
  }

  if (currentDraft.metadata.status === "human_requested") {
    return { newVersion: currentDraft.metadata.version };
  }

  const nowIso = new Date().toISOString();
  const updateResult = await updateDraftStatusWithJournal(clients as DraftStoreClients, config, {
    draftId: input.draftId,
    expectedVersion: currentDraft.metadata.version,
    newStatus: "human_requested",
    idempotencyKey: `human-help:${input.draftId}:${currentDraft.metadata.version}`,
    journalEvent: {
      eventType: "human_help_requested" as never,
      actorType: "guest",
      occurredAtIso: nowIso,
      privacyClass: "operational",
      idempotencyKey: `human-help-event:${input.draftId}:${currentDraft.metadata.version}`,
      payload: {
        taskId: input.taskId ?? "",
        requestType: "call_me",
      },
    },
  });

  const rawCallKey =
    currentDraft.fallbackCallKey?.state === "active" &&
    currentDraft.fallbackCallKey.encryptedRawValue
      ? await clients.encryption.decrypt(currentDraft.fallbackCallKey.encryptedRawValue)
      : undefined;
  const content = buildHumanHelpPushContent(currentDraft, input.taskId, rawCallKey);
  void sendAdminPushNotification(content.message, {
    title: content.title,
    priority: "1",
  }).catch(() => undefined);

  return { newVersion: updateResult.newVersion };
}

// ── Cancel call intent ───────────────────────────────────────────────────────

export interface CancelCallIntentInput {
  draftId: string;
  expectedVersion: number;
}

export interface CancelCallIntentResult {
  newVersion: number;
}

/**
 * Guest-initiated escape hatch from call_signal_pending/calling_now back to
 * ready_to_call_agent — the same end state as the operator's expire action,
 * but guest-triggered so the "Cancel and go back" button in the flow doesn't
 * just reset local UI state and leave the server's version/status stranded
 * (which would 500 the guest's *next* real signalCallIntent on a version
 * conflict — a client-only reset is not a safe substitute for this call).
 */
export async function cancelCallIntent(
  clients: GuestStoreClients,
  config: GuestStoreConfig,
  input: CancelCallIntentInput
): Promise<CancelCallIntentResult> {
  // additionalUpdates only SETs — DynamoDB rejects empty-string attribute
  // values, so activeCallAttemptId/callIntentExpiresAtIso are left as-is
  // (stale, harmless) rather than cleared. They're only ever read alongside
  // status === call_signal_pending/calling_now, which this transition exits.
  const updateResult = await updateDraftStatusWithJournal(clients as DraftStoreClients, config, {
    draftId: input.draftId,
    expectedVersion: input.expectedVersion,
    newStatus: "ready_to_call_agent",
    idempotencyKey: `call-cancel-${input.draftId}-${Date.now()}`,
    journalEvent: {
      eventType: "call_later_selected" as never,
      actorType: "guest",
      occurredAtIso: new Date().toISOString(),
      privacyClass: "operational",
      idempotencyKey: `signal-cancel-${input.draftId}-${Date.now()}`,
      payload: { reason: "guest_cancelled_stuck_signal" },
    },
  });

  return { newVersion: updateResult.newVersion };
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
  const protectedGuestInput = {
    travelers: input.travelers,
    cabin: input.cabin,
    decisions: input.decisions,
  };
  assertAllowedStructuredKeys(protectedGuestInput);
  assertNoRestrictedStructuredContent(protectedGuestInput);
  const nowIso = new Date().toISOString();
  const extraPutItems: Array<Record<string, unknown>> = [];
  const pk = `DRAFT#${input.draftId}`;

  for (const traveler of input.travelers ?? []) {
    extraPutItems.push(
      serializeTravelerItem({
        pk,
        sk: travelerSk(traveler.travelerId),
        travelerId: traveler.travelerId,
        isPrimary: traveler.isPrimary,
        encryptedTraveler: await encryptJson(clients.encryption, traveler),
        updatedAtIso: nowIso,
        version: input.expectedVersion,
      })
    );
  }

  if (input.cabin) {
    extraPutItems.push(
      serializeCabinItem({
        pk,
        sk: cabinSk(input.cabin.cabinId),
        cabinId: input.cabin.cabinId,
        encryptedCabin: await encryptJson(clients.encryption, input.cabin),
        updatedAtIso: nowIso,
        version: input.expectedVersion,
      })
    );
  }

  if (input.decisions) {
    extraPutItems.push(
      serializeDecisionsItem({
        pk,
        sk: "DECISIONS",
        encryptedDecisions: await encryptJson(clients.encryption, {
          passengerDataReviewConfirmed: false,
          packetStorageConsent: false,
          ...input.decisions,
        }),
        updatedAtIso: nowIso,
        version: input.expectedVersion,
      })
    );
  }

  const updateResult = await updateDraftStatusWithJournal(clients as DraftStoreClients, config, {
    draftId: input.draftId,
    expectedVersion: input.expectedVersion,
    newStatus: "review_ready",
    idempotencyKey: `review-ready-${input.draftId}-${Date.now()}`,
    journalEvent: {
      eventType: "booking_packet_reviewed" as never,
      actorType: "guest",
      occurredAtIso: nowIso,
      privacyClass: "operational",
      idempotencyKey: `reviewed-${input.draftId}-${Date.now()}`,
      payload: {},
    },
    extraPutItems,
  });

  emitBookingMilestoneForDraft(clients.dynamo, config.tableName, {
    eventType: "booking_review_ready",
    draftId: input.draftId,
    status: "review_ready",
  });

  return { newVersion: updateResult.newVersion };
}
