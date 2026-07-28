/**
 * Operator custom email — send an ad-hoc, operator-authored message to the
 * guest on a booking draft, from the LLL-branded Klaviyo sender.
 *
 * Motivating use: on a call the guest asks for flight options to the port; the
 * Live Call Copilot finds them, the operator reads them out and then sends a
 * follow-up email with those options directly from the Operator Console.
 *
 * This is a bounded exception to the booking-assistant "templated email only"
 * rule (see OPERATOR_CUSTOM_EMAIL.md):
 * - operator-authenticated (route enforces the local operator context);
 * - redaction-checked — subject/body are rejected if they contain payment card
 *   numbers or restricted identity/proof content (redaction.ts);
 * - consent-gated on the guest's transactionalEmailConsent;
 * - journaled as `operator_custom_email_sent` with privacy-safe analytics only
 *   (lengths + delivery result + source), never the raw body.
 */

import { appendJournalObservation } from "./activity-journal";
import { createKlaviyoBookingNotificationTransport } from "./notifications";
import {
  assertNoRestrictedStructuredContent,
  redactConversationText,
} from "./redaction";
import { issueResumeToken } from "./resume-tokens";
import type { DraftStoreClients } from "./store";
import { requireActiveOperatorClaim, type OperatorServiceConfig } from "./operator-service";

const MAX_SUBJECT_LENGTH = 200;
const MAX_BODY_LENGTH = 8_000;

/** Where the composed content originated, for privacy-safe analytics only. */
export type CustomEmailSource = "operator_compose" | "copilot_draft" | "copilot_polished";

export interface SendCustomOperatorEmailInput {
  draftId: string;
  operatorSessionId: string;
  subject: string;
  body: string;
  source: CustomEmailSource;
  publicBaseUrl: string;
}

export interface SendCustomOperatorEmailResult {
  delivered: boolean;
  journalEventId: string;
}

function cleanBaseUrl(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

/**
 * Rejects payment/identity/proof content in operator-authored text. The
 * redaction classifier discards payment content and quarantines Tier-C identity
 * or proof content; either disposition means the text must not be emailed.
 */
/**
 * Apply the same restricted-content boundary before an email draft is sent or
 * passed to the email-polish model. This prevents a typed payment, identity,
 * or proof detail from being forwarded to either destination.
 */
export function assertCustomEmailTextSafe(label: string, value: string): void {
  const result = redactConversationText(value);
  if (result.disposition === "discarded" || result.disposition === "quarantined") {
    throw new Error(
      `The email ${label} contains payment, identity, or proof content that cannot be sent.`
    );
  }
}

export async function sendCustomOperatorEmail(
  clients: DraftStoreClients,
  config: OperatorServiceConfig,
  input: SendCustomOperatorEmailInput
): Promise<SendCustomOperatorEmailResult> {
  const subject = input.subject.trim();
  const body = input.body.trim();

  if (subject.length < 2 || subject.length > MAX_SUBJECT_LENGTH) {
    throw new Error(`Subject must be between 2 and ${MAX_SUBJECT_LENGTH} characters.`);
  }
  if (body.length < 2 || body.length > MAX_BODY_LENGTH) {
    throw new Error(`Message must be between 2 and ${MAX_BODY_LENGTH} characters.`);
  }

  // Fail closed on any restricted content, both as free text and structurally.
  assertCustomEmailTextSafe("subject", subject);
  assertCustomEmailTextSafe("message", body);
  assertNoRestrictedStructuredContent({ subject, body });

  const draft = await requireActiveOperatorClaim(clients, config, input.draftId, input.operatorSessionId);
  if (!draft.contact.email) {
    throw new Error("This guest has no saved email address.");
  }
  if (!draft.contact.transactionalEmailConsent) {
    throw new Error("This guest has not consented to transactional email.");
  }

  const nowIso = new Date().toISOString();
  const idempotencyKey = `custom-operator-email:${input.draftId}:${nowIso}`;

  // Issue a fresh secure resume link so the guest can return to their draft
  // from the email footer. The raw resume URL never contains PII or the call key.
  const token = await issueResumeToken(clients.dynamo, config, {
    draftId: input.draftId,
    personId: draft.metadata.personId,
    redirectDealId: draft.metadata.dealId,
    ttlSeconds: 30 * 24 * 60 * 60,
  });
  const base = cleanBaseUrl(input.publicBaseUrl);

  let delivered = false;
  try {
    const result = await createKlaviyoBookingNotificationTransport().send({
      kind: "custom_operator_message",
      email: draft.contact.email,
      subject,
      body,
      dealLabel: draft.dealSnapshot.dealAngle,
      resumeUrl: `${base}/api/booking-assistant/resume?token=${encodeURIComponent(token.token)}`,
      reminderControlsUrl: `${base}/deals/${encodeURIComponent(draft.metadata.dealId)}/book`,
      idempotencyKey,
    });
    delivered = result.accepted;
  } catch {
    delivered = false;
  }

  const journal = await appendJournalObservation(clients.dynamo, config.tableName, {
    draftId: input.draftId,
    eventType: "operator_custom_email_sent",
    actorType: "operator",
    occurredAtIso: nowIso,
    privacyClass: "operational",
    idempotencyKey: `custom-operator-email-event:${input.draftId}:${nowIso}`,
    payload: {
      operatorSessionId: input.operatorSessionId,
      // Privacy-safe only: lengths + delivery result + provenance. Never the body.
      subjectLength: subject.length,
      bodyLength: body.length,
      delivered,
      source: input.source,
    },
  });

  return { delivered, journalEventId: journal.journalEventId };
}
