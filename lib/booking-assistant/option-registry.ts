import type { BookingDraftStatus } from "./contracts";

export interface BookingOptionDefinition {
  actionId: string;
  label: string;
  statuses: readonly BookingDraftStatus[];
  requiresContact: boolean;
}

export const BOOKING_OPTION_REGISTRY_VERSION = 1;
export const BOOKING_OPTION_REGISTRY: readonly BookingOptionDefinition[] = [
  {
    actionId: "continue_later",
    label: "Continue later",
    statuses: ["collecting", "review_ready"],
    requiresContact: true,
  },
  {
    actionId: "ask_question",
    label: "Ask a question",
    statuses: ["collecting", "review_ready", "ready_to_call_agent"],
    requiresContact: false,
  },
  {
    actionId: "get_human_help",
    label: "Get help now",
    statuses: ["collecting", "review_ready", "ready_to_call_agent"],
    requiresContact: true,
  },
  {
    actionId: "stop_reminders",
    label: "Stop reminders",
    statuses: ["paused_by_guest", "ready_to_call_agent"],
    requiresContact: true,
  },
  {
    actionId: "cancel_delete",
    label: "Cancel and delete",
    statuses: ["collecting", "paused_by_guest", "review_ready", "ready_to_call_agent"],
    requiresContact: true,
  },
];

export function availableBookingOptions(
  status: BookingDraftStatus,
  hasContact: boolean
): readonly BookingOptionDefinition[] {
  return BOOKING_OPTION_REGISTRY.filter(
    (option) => option.statuses.includes(status) && (!option.requiresContact || hasContact)
  );
}
