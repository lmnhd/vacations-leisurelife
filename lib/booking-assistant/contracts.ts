/** Shared Booking Assistant pilot contracts. */

export const BOOKING_FLOW_ID = "deal_booking_completion" as const;
export const BOOKING_FLOW_VERSION = 1 as const;
export const BOOKING_CONTRACT_VERSION = 1 as const;

export const COMPLETION_MODE = "call_agent_to_finalize_v1" as const;
export type CompletionMode = typeof COMPLETION_MODE;

export const completionModeRegistry = {
  [COMPLETION_MODE]: {
    enabled: true,
    collectsCardData: false,
    createsSupplierSessionBeforeCall: false,
    operatorSurface: "local_only",
    finalAction: "call_agent_to_finalize",
  },
} as const satisfies Record<
  CompletionMode,
  {
    enabled: boolean;
    collectsCardData: boolean;
    createsSupplierSessionBeforeCall: boolean;
    operatorSurface: "local_only";
    finalAction: "call_agent_to_finalize";
  }
>;

export const bookingDraftStatuses = [
  "started",
  "collecting",
  "paused_by_guest",
  "needs_guest",
  "human_requested",
  "review_ready",
  "ready_to_call_agent",
  "call_signal_pending",
  "calling_now",
  "agent_claimed",
  "agent_processing",
  "payment_failed",
  "guest_completion_sent",
  "reconciliation_review",
  "booking_confirmed",
  "abandoned",
  "expired",
  "cancelled",
] as const;

export type BookingDraftStatus = (typeof bookingDraftStatuses)[number];

export const terminalBookingDraftStatuses = [
  "booking_confirmed",
  "cancelled",
] as const satisfies readonly BookingDraftStatus[];

export const bookingStatusTransitions = {
  started: ["collecting", "cancelled", "abandoned"],
  collecting: ["paused_by_guest", "needs_guest", "human_requested", "review_ready", "reconciliation_review", "cancelled", "abandoned"],
  paused_by_guest: ["collecting", "needs_guest", "human_requested", "review_ready", "reconciliation_review", "cancelled", "abandoned"],
  needs_guest: ["paused_by_guest", "collecting", "human_requested", "review_ready", "reconciliation_review"],
  // `abandoned` is the operator "dismiss from queue" target across active states:
  // it removes the draft from the active queue but keeps it guest-recoverable
  // (`abandoned → collecting`), unlike terminal `cancelled`.
  human_requested: ["human_requested", "agent_claimed", "collecting", "paused_by_guest", "review_ready", "cancelled", "abandoned"],
  review_ready: ["ready_to_call_agent", "call_signal_pending", "paused_by_guest", "needs_guest", "human_requested", "cancelled", "abandoned"],
  ready_to_call_agent: ["ready_to_call_agent", "call_signal_pending", "agent_claimed", "needs_guest", "human_requested", "cancelled", "abandoned"],
  call_signal_pending: ["calling_now", "ready_to_call_agent", "cancelled", "abandoned"],
  calling_now: ["agent_claimed", "ready_to_call_agent", "needs_guest", "cancelled", "abandoned"],
  agent_claimed: ["agent_processing", "needs_guest", "cancelled", "abandoned"],
  agent_processing: ["needs_guest", "payment_failed", "reconciliation_review", "booking_confirmed", "expired", "cancelled", "abandoned"],
  payment_failed: ["agent_processing", "needs_guest", "cancelled", "reconciliation_review"],
  guest_completion_sent: ["booking_confirmed", "reconciliation_review", "needs_guest", "agent_processing", "expired"],
  reconciliation_review: ["booking_confirmed", "needs_guest", "cancelled", "abandoned"],
  booking_confirmed: [],
  abandoned: ["collecting", "cancelled"],
  expired: ["collecting", "cancelled"],
  // Terminal (plan §9.1). Cancellation is a deliberate end / privacy exit and is
  // never silently revived — a returning guest starts a brand-new draft instead.
  // Reopen-to-continue flows go through `abandoned`/`expired`, not `cancelled`.
  cancelled: [],
} as const satisfies Record<BookingDraftStatus, readonly BookingDraftStatus[]>;

export function canTransitionBookingStatus(from: BookingDraftStatus, to: BookingDraftStatus): boolean {
  const allowed: readonly BookingDraftStatus[] = bookingStatusTransitions[from];
  return allowed.includes(to);
}

export type CallerIdState = "matched" | "different" | "blocked" | "unavailable";

export type CallOutcome =
  | "no_call_received"
  | "disconnected_call_back"
  | "needs_guest_decision"
  | "material_change"
  | "payment_failed"
  | "declined"
  | "completed_pending_reconciliation"
  | "confirmed";

export const callOutcomeLabels: Record<CallOutcome, string> = {
  no_call_received: "No call received",
  disconnected_call_back: "Disconnected - call back",
  needs_guest_decision: "Needs a guest decision",
  material_change: "Unavailable / material change",
  payment_failed: "Payment failed",
  declined: "Card declined",
  completed_pending_reconciliation: "Completed - pending reconciliation",
  confirmed: "Confirmed",
};

/** Privacy-safe signal delivered to the local operator console. */
export interface CallIntentSignal {
  contractVersion: typeof BOOKING_CONTRACT_VERSION;
  callAttemptId: string;
  draftId: string;
  packetVersion: number;
  publishedAtIso: string;
  expiresAtIso: string;
  maskedCallerSummary: string;
  dealSummary: string;
}

export interface OperatorCallAcknowledgement {
  contractVersion: typeof BOOKING_CONTRACT_VERSION;
  callAttemptId: string;
  draftId: string;
  acknowledgedAtIso: string;
  operatorSessionId: string;
  operatorSurface: "local_only";
}

export const bookingJournalEventTypes = [
  "booking_draft_started",
  "field_confirmed",
  "task_completed",
  "continue_later_armed",
  "resume_email_queued",
  "reminder_sent",
  "reminder_suppressed",
  "review_ready",
  "ready_to_call_agent",
  "conversation_turn_stored",
  "deletion_requested",
  "booking_packet_reviewed",
  "fallback_call_key_issued",
  "fallback_call_key_reused",
  "ready_to_call_presented",
  "call_disclosure_presented",
  "call_launch_requested",
  "call_intent_signal_published",
  "operator_call_draft_pinned",
  "call_later_selected",
  "human_help_requested",
  "no_agents_try_later_selected",
  "callback_requested",
  "call_intent_signal_expired",
  "fallback_call_key_lookup_attempted",
  "fallback_call_key_lookup_result",
  "caller_id_compared",
  "caller_verification_recorded",
  "operator_timeline_accessed",
  "operator_conversation_accessed",
  "operator_contact_action_recorded",
  "operator_custom_email_sent",
  "operator_field_requested",
  "operator_field_corrected",
  "operator_claimed",
  "agent_processing_started",
  "call_outcome_recorded",
  "operator_draft_dismissed",
  "guest_draft_reopened",
  "reconciliation_completed",
  "booking_confirmed",
] as const;

export type BookingJournalEventType = (typeof bookingJournalEventTypes)[number];

export interface BookingJournalEventEnvelope {
  contractVersion: typeof BOOKING_CONTRACT_VERSION;
  journalEventId: string;
  draftId: string;
  eventType: BookingJournalEventType;
  actorType: "guest" | "assistant" | "operator" | "system" | "reconciliation";
  occurredAtIso: string;
  privacyClass: "operational" | "booking_pii" | "highly_sensitive";
  idempotencyKey: string;
  expectedDraftVersion: number;
}

export const bookingFlowDefinition = {
  id: BOOKING_FLOW_ID,
  version: BOOKING_FLOW_VERSION,
  completionMode: COMPLETION_MODE,
  stages: [
    "contact_bootstrap",
    "trip_and_party",
    "traveler_details",
    "preferences_and_qualifications",
    "review",
    "save_packet",
    "ready_to_call_agent",
    "call_intent_handoff",
    "local_operator_processing",
    "reconciliation",
  ],
} as const;
