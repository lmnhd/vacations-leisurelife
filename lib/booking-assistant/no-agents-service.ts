import type { DynamoDBClient } from "@aws-sdk/client-dynamodb";

import { sendAdminPushNotification } from "@/lib/pushover";

import { encryptJson } from "./encryption";
import { createKlaviyoBookingNotificationTransport } from "./notifications";
import { buildReminderProgram, serializeReminderProgram } from "./reminders";
import { issueResumeToken } from "./resume-tokens";
import {
  getDraft,
  updateDraftStatusWithJournal,
  type DraftStoreClients,
  type DraftStoreConfig,
} from "./store";

export type CallbackPreference = "as_soon_as_available" | "preferred_window";

export interface RequestBookingCallbackInput {
  draftId: string;
  expectedVersion: number;
  preference: CallbackPreference;
  windowStartIso?: string;
  windowEndIso?: string;
  timeZone: string;
  publicBaseUrl: string;
}

export interface NoAgentsChoiceResult {
  newVersion: number;
  notificationAccepted: boolean;
}

function cleanBaseUrl(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function validateCallbackWindow(input: RequestBookingCallbackInput): void {
  if (!input.timeZone || input.timeZone.length > 80) {
    throw new Error("A valid callback timezone is required");
  }
  if (input.preference === "preferred_window") {
    const start = Date.parse(input.windowStartIso ?? "");
    const end = Date.parse(input.windowEndIso ?? "");
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      start <= Date.now() ||
      end <= start
    ) {
      throw new Error("Choose a future callback time window");
    }
  }
}

function callbackWindowLabel(input: RequestBookingCallbackInput): string {
  if (input.preference === "as_soon_as_available") {
    return "As soon as an agent is available";
  }
  const start = new Date(input.windowStartIso as string);
  const end = new Date(input.windowEndIso as string);
  const date = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: input.timeZone,
  }).format(start);
  const time = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: input.timeZone,
  });
  return `${date}, ${time.format(start)}-${time.format(end)} (${input.timeZone})`;
}

async function sendResumeChoiceEmail(
  dynamo: DynamoDBClient,
  config: DraftStoreConfig,
  input: {
    draftId: string;
    personId: string;
    dealId: string;
    email: string;
    dealLabel: string;
    publicBaseUrl: string;
    kind: "callback_requested_receipt" | "no_agents_try_later_receipt";
    idempotencyKey: string;
    callbackWindowLabel?: string;
  }
): Promise<boolean> {
  const token = await issueResumeToken(dynamo, config, {
    draftId: input.draftId,
    personId: input.personId,
    redirectDealId: input.dealId,
    ttlSeconds: 30 * 24 * 60 * 60,
  });
  const base = cleanBaseUrl(input.publicBaseUrl);
  try {
    const result = await createKlaviyoBookingNotificationTransport().send({
      kind: input.kind,
      email: input.email,
      resumeUrl: `${base}/api/booking-assistant/resume?token=${encodeURIComponent(token.token)}`,
      reminderControlsUrl: `${base}/deals/${encodeURIComponent(input.dealId)}/book`,
      dealLabel: input.dealLabel,
      callbackWindowLabel: input.callbackWindowLabel,
      idempotencyKey: input.idempotencyKey,
    });
    return result.accepted;
  } catch {
    return false;
  }
}

export async function requestBookingCallback(
  clients: DraftStoreClients,
  config: DraftStoreConfig,
  input: RequestBookingCallbackInput
): Promise<NoAgentsChoiceResult> {
  validateCallbackWindow(input);
  const draft = await getDraft(clients, config, input.draftId);
  if (!draft) throw new Error("Booking draft was not found");
  if (
    draft.metadata.status !== "ready_to_call_agent" &&
    draft.metadata.status !== "human_requested"
  ) {
    throw new Error(`A callback cannot be requested while the draft is ${draft.metadata.status}`);
  }
  const nowIso = new Date().toISOString();
  const label = callbackWindowLabel(input);
  const encryptedCallback = await encryptJson(clients.encryption, {
    preference: input.preference,
    windowStartIso: input.windowStartIso,
    windowEndIso: input.windowEndIso,
    timeZone: input.timeZone,
    requestedAtIso: nowIso,
  });
  const updated = await updateDraftStatusWithJournal(clients, config, {
    draftId: input.draftId,
    expectedVersion: draft.metadata.version,
    newStatus: "human_requested",
    idempotencyKey: `callback-request:${input.draftId}:${draft.metadata.version}`,
    journalEvent: {
      eventType: "callback_requested",
      actorType: "guest",
      occurredAtIso: nowIso,
      privacyClass: "operational",
      idempotencyKey: `callback-request-event:${input.draftId}:${draft.metadata.version}`,
      payload: { preference: input.preference },
    },
    extraPutItems: [{
      PK: { S: `DRAFT#${input.draftId}` },
      SK: { S: "CALLBACK_ACTIVE" },
      requestedAtIso: { S: nowIso },
      callbackWindowLabel: { S: label },
      encryptedCallback: {
        M: {
          ciphertext: { S: encryptedCallback.ciphertext },
          iv: { S: encryptedCallback.iv },
          tag: { S: encryptedCallback.tag },
          encryptedDataKey: { S: encryptedCallback.encryptedDataKey },
          kmsKeyArn: { S: encryptedCallback.kmsKeyArn },
        },
      },
    }],
  });
  const notificationAccepted = await sendResumeChoiceEmail(clients.dynamo, config, {
    draftId: input.draftId,
    personId: draft.metadata.personId,
    dealId: draft.metadata.dealId,
    email: draft.contact.email,
    dealLabel: draft.dealSnapshot.dealAngle,
    publicBaseUrl: input.publicBaseUrl,
    kind: "callback_requested_receipt",
    callbackWindowLabel: label,
    idempotencyKey: `callback-receipt:${input.draftId}:${updated.newVersion}`,
  });
  const phoneEnding = draft.contact.phoneE164.slice(-4);
  const rawCallKey =
    draft.fallbackCallKey?.state === "active" &&
    draft.fallbackCallKey.encryptedRawValue
      ? await clients.encryption.decrypt(draft.fallbackCallKey.encryptedRawValue)
      : undefined;
  void sendAdminPushNotification(
    `CALLBACK REQUESTED\n${draft.dealSnapshot.ship} - ${draft.dealSnapshot.sailingDateIso.slice(0, 10)}\nRequested window: ${label}\nGuest phone ending ${phoneEnding}${rawCallKey ? `\nCall key: ${rawCallKey}` : ""}\nNext: Open Bookings, claim this callback request, and return the call.`,
    { title: `Booking Assistant callback - ${draft.dealSnapshot.ship}`, priority: "1" }
  ).catch(() => undefined);
  return { newVersion: updated.newVersion, notificationAccepted };
}

export async function chooseNoAgentsTryLater(
  clients: DraftStoreClients,
  config: DraftStoreConfig,
  input: {
    draftId: string;
    expectedVersion: number;
    publicBaseUrl: string;
  }
): Promise<NoAgentsChoiceResult> {
  const draft = await getDraft(clients, config, input.draftId);
  if (!draft) throw new Error("Booking draft was not found");
  if (draft.metadata.status !== "ready_to_call_agent") {
    throw new Error(`Try later is unavailable while the draft is ${draft.metadata.status}`);
  }
  const program = buildReminderProgram(input.draftId, "call_to_finalize_v1");
  const updated = await updateDraftStatusWithJournal(clients, config, {
    draftId: input.draftId,
    expectedVersion: draft.metadata.version,
    newStatus: "ready_to_call_agent",
    idempotencyKey: `no-agents-try-later:${input.draftId}:${draft.metadata.version}`,
    journalEvent: {
      eventType: "no_agents_try_later_selected",
      actorType: "guest",
      occurredAtIso: new Date().toISOString(),
      privacyClass: "operational",
      idempotencyKey: `no-agents-try-later-event:${input.draftId}:${draft.metadata.version}`,
      payload: { programType: "call_to_finalize_v1" },
    },
    extraPutItems: [serializeReminderProgram(program)],
  });
  const notificationAccepted = await sendResumeChoiceEmail(clients.dynamo, config, {
    draftId: input.draftId,
    personId: draft.metadata.personId,
    dealId: draft.metadata.dealId,
    email: draft.contact.email,
    dealLabel: draft.dealSnapshot.dealAngle,
    publicBaseUrl: input.publicBaseUrl,
    kind: "no_agents_try_later_receipt",
    idempotencyKey: `no-agents-receipt:${input.draftId}:${updated.newVersion}`,
  });
  return { newVersion: updated.newVersion, notificationAccepted };
}
