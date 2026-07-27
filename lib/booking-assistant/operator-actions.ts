import { appendJournalObservation } from "./activity-journal";
import { confirmDraftField } from "./field-revisions";
import { getBookingFieldDefinition } from "./field-catalog";
import { requireActiveOperatorClaim, type OperatorServiceConfig } from "./operator-service";
import type { DraftStoreClients } from "./store";

export type OperatorDraftAction =
  | { action: "call_guest" }
  | { action: "email_guest" }
  | { action: "request_field"; fieldId: string }
  | { action: "correct_field"; fieldId: string; value: string; expectedVersion: number };

export async function performOperatorDraftAction(
  clients: DraftStoreClients,
  config: OperatorServiceConfig,
  input: {
    draftId: string;
    operatorSessionId: string;
    command: OperatorDraftAction;
  }
) {
  const draft = await requireActiveOperatorClaim(
    clients,
    config,
    input.draftId,
    input.operatorSessionId
  );
  const nowIso = new Date().toISOString();

  if (input.command.action === "correct_field") {
    const result = await confirmDraftField(clients.dynamo, clients.encryption, config, {
      draftId: input.draftId,
      personId: draft.metadata.personId,
      fieldId: input.command.fieldId,
      value: input.command.value,
      expectedVersion: input.command.expectedVersion,
      idempotencyKey: `operator-correction-${input.operatorSessionId}-${nowIso}`,
      actorType: "operator",
      actorId: input.operatorSessionId,
    });
    return { action: input.command.action, ...result };
  }

  if (input.command.action === "request_field") {
    if (!getBookingFieldDefinition(input.command.fieldId)) {
      throw new Error("Unknown Booking Assistant field");
    }
    await appendJournalObservation(clients.dynamo, config.tableName, {
      draftId: input.draftId,
      eventType: "operator_field_requested",
      actorType: "operator",
      occurredAtIso: nowIso,
      privacyClass: "operational",
      idempotencyKey: `field-request-${input.operatorSessionId}-${nowIso}`,
      payload: {
        operatorSessionId: input.operatorSessionId,
        fieldId: input.command.fieldId,
      },
    });
    return { action: input.command.action, fieldId: input.command.fieldId };
  }

  const href = input.command.action === "call_guest"
    ? `tel:${draft.contact.phoneE164}`
    : `mailto:${draft.contact.email}`;
  await appendJournalObservation(clients.dynamo, config.tableName, {
    draftId: input.draftId,
    eventType: "operator_contact_action_recorded",
    actorType: "operator",
    occurredAtIso: nowIso,
    privacyClass: "operational",
    idempotencyKey: `contact-action-${input.operatorSessionId}-${nowIso}`,
    payload: {
      operatorSessionId: input.operatorSessionId,
      channel: input.command.action === "call_guest" ? "phone" : "email",
    },
  });
  return { action: input.command.action, href };
}
