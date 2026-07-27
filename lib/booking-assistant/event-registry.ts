export type EventPrivacyClass = "public_metadata" | "protected_metadata" | "protected_content";

export interface BookingEventDefinition {
  eventType: string;
  version: 1;
  owner: "guest" | "assistant" | "operator" | "system" | "email";
  privacyClass: EventPrivacyClass;
  analyticsFields: readonly string[];
}

const DEFINITIONS: readonly BookingEventDefinition[] = [
  { eventType: "booking_draft_started", version: 1, owner: "system", privacyClass: "protected_metadata", analyticsFields: ["dealId", "flowVersion"] },
  { eventType: "field_confirmed", version: 1, owner: "guest", privacyClass: "protected_metadata", analyticsFields: ["taskId", "fieldId", "fieldPrivacy"] },
  { eventType: "task_completed", version: 1, owner: "system", privacyClass: "protected_metadata", analyticsFields: ["taskId", "nextTaskId", "completionPct"] },
  { eventType: "continue_later_armed", version: 1, owner: "guest", privacyClass: "protected_metadata", analyticsFields: ["taskId", "programType", "scheduledWindow"] },
  { eventType: "resume_email_queued", version: 1, owner: "email", privacyClass: "protected_metadata", analyticsFields: ["messageKind", "programType"] },
  { eventType: "reminder_sent", version: 1, owner: "email", privacyClass: "protected_metadata", analyticsFields: ["programType", "generation", "scheduledWindow"] },
  { eventType: "reminder_suppressed", version: 1, owner: "system", privacyClass: "protected_metadata", analyticsFields: ["programType", "reason"] },
  { eventType: "review_ready", version: 1, owner: "guest", privacyClass: "protected_metadata", analyticsFields: ["completionPct"] },
  { eventType: "ready_to_call_agent", version: 1, owner: "system", privacyClass: "protected_metadata", analyticsFields: ["completionMode"] },
  { eventType: "call_launch_requested", version: 1, owner: "guest", privacyClass: "protected_metadata", analyticsFields: ["attemptState"] },
  { eventType: "call_signal_acknowledged", version: 1, owner: "operator", privacyClass: "protected_metadata", analyticsFields: ["attemptState"] },
  { eventType: "conversation_turn_stored", version: 1, owner: "system", privacyClass: "protected_metadata", analyticsFields: ["channel", "role", "taskId", "redactionDisposition"] },
  { eventType: "deletion_requested", version: 1, owner: "guest", privacyClass: "protected_metadata", analyticsFields: ["scope"] },
  { eventType: "booking_packet_reviewed", version: 1, owner: "guest", privacyClass: "protected_metadata", analyticsFields: ["completionPct"] },
  { eventType: "fallback_call_key_issued", version: 1, owner: "system", privacyClass: "protected_metadata", analyticsFields: ["keyVersion"] },
  { eventType: "fallback_call_key_reused", version: 1, owner: "system", privacyClass: "protected_metadata", analyticsFields: ["keyVersion"] },
  { eventType: "ready_to_call_presented", version: 1, owner: "assistant", privacyClass: "protected_metadata", analyticsFields: ["completionMode"] },
  { eventType: "call_disclosure_presented", version: 1, owner: "assistant", privacyClass: "protected_metadata", analyticsFields: ["disclosureVersion"] },
  { eventType: "call_intent_signal_published", version: 1, owner: "system", privacyClass: "protected_metadata", analyticsFields: ["attemptState"] },
  { eventType: "operator_call_draft_pinned", version: 1, owner: "operator", privacyClass: "protected_metadata", analyticsFields: ["attemptState"] },
  { eventType: "call_later_selected", version: 1, owner: "guest", privacyClass: "protected_metadata", analyticsFields: ["programType"] },
  { eventType: "human_help_requested", version: 1, owner: "guest", privacyClass: "protected_metadata", analyticsFields: ["taskId", "requestType"] },
  { eventType: "no_agents_try_later_selected", version: 1, owner: "guest", privacyClass: "protected_metadata", analyticsFields: ["programType"] },
  { eventType: "callback_requested", version: 1, owner: "guest", privacyClass: "protected_metadata", analyticsFields: ["preference"] },
  { eventType: "call_intent_signal_expired", version: 1, owner: "system", privacyClass: "protected_metadata", analyticsFields: ["reason"] },
  { eventType: "fallback_call_key_lookup_attempted", version: 1, owner: "operator", privacyClass: "protected_metadata", analyticsFields: ["outcome"] },
  { eventType: "fallback_call_key_lookup_result", version: 1, owner: "operator", privacyClass: "protected_metadata", analyticsFields: ["outcome"] },
  { eventType: "caller_id_compared", version: 1, owner: "operator", privacyClass: "protected_metadata", analyticsFields: ["callerIdState"] },
  { eventType: "caller_verification_recorded", version: 1, owner: "operator", privacyClass: "protected_metadata", analyticsFields: ["verificationOutcome"] },
  { eventType: "operator_timeline_accessed", version: 1, owner: "operator", privacyClass: "protected_metadata", analyticsFields: ["surface"] },
  { eventType: "operator_conversation_accessed", version: 1, owner: "operator", privacyClass: "protected_metadata", analyticsFields: ["surface"] },
  { eventType: "operator_contact_action_recorded", version: 1, owner: "operator", privacyClass: "protected_metadata", analyticsFields: ["action"] },
  { eventType: "operator_field_requested", version: 1, owner: "operator", privacyClass: "protected_metadata", analyticsFields: ["fieldId", "taskId"] },
  { eventType: "operator_field_corrected", version: 1, owner: "operator", privacyClass: "protected_metadata", analyticsFields: ["fieldId", "taskId", "guestConfirmationRequired"] },
  { eventType: "operator_claimed", version: 1, owner: "operator", privacyClass: "protected_metadata", analyticsFields: ["queueWaitSeconds"] },
  { eventType: "agent_processing_started", version: 1, owner: "operator", privacyClass: "protected_metadata", analyticsFields: ["completionMode"] },
  { eventType: "call_outcome_recorded", version: 1, owner: "operator", privacyClass: "protected_metadata", analyticsFields: ["outcome"] },
  { eventType: "operator_draft_dismissed", version: 1, owner: "operator", privacyClass: "protected_metadata", analyticsFields: ["reason"] },
  { eventType: "guest_draft_reopened", version: 1, owner: "guest", privacyClass: "protected_metadata", analyticsFields: ["reason", "priorStatus"] },
  { eventType: "reconciliation_completed", version: 1, owner: "operator", privacyClass: "protected_metadata", analyticsFields: ["outcome"] },
  { eventType: "booking_confirmed", version: 1, owner: "operator", privacyClass: "protected_metadata", analyticsFields: ["completionMode"] },
];

export const BOOKING_EVENT_REGISTRY_VERSION = 1;

export function getBookingEventDefinition(eventType: string): BookingEventDefinition | null {
  return DEFINITIONS.find((definition) => definition.eventType === eventType) ?? null;
}

export function requireBookingEventDefinition(eventType: string): BookingEventDefinition {
  const definition = getBookingEventDefinition(eventType);
  if (!definition) throw new Error(`Unregistered Booking Activity Journal event: ${eventType}`);
  return definition;
}
