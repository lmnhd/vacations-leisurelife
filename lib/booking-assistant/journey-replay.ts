import type { JournalEventRecord } from "./activity-journal";

export interface JourneyReplayStep {
  sequence: number;
  occurredAtIso: string;
  actorType: JournalEventRecord["actorType"];
  eventType: JournalEventRecord["eventType"];
  label: string;
  detail?: string;
}

const eventLabels: Partial<Record<JournalEventRecord["eventType"], string>> = {
  booking_draft_started: "Booking assistant started",
  field_confirmed: "Answer confirmed",
  task_completed: "Task completed",
  continue_later_armed: "Continue-later email requested",
  resume_email_queued: "Resume email queued",
  review_ready: "Packet ready for review",
  ready_to_call_agent: "Packet ready for an agent",
  call_launch_requested: "Guest requested the call handoff",
  call_intent_signal_published: "Call intent sent to the operator",
  operator_call_draft_pinned: "Operator pinned the call",
  caller_verification_recorded: "Caller verification recorded",
  operator_claimed: "Operator claimed the draft",
  agent_processing_started: "Operator began processing",
  operator_field_requested: "Operator requested guest information",
  operator_field_corrected: "Operator corrected a field",
  call_outcome_recorded: "Call outcome recorded",
  reconciliation_completed: "Booking reference reconciled",
  booking_confirmed: "Booking confirmed",
};

export function buildJourneyReplay(events: JournalEventRecord[]): JourneyReplayStep[] {
  return [...events]
    .sort((left, right) => left.sequence - right.sequence)
    .filter((event) => event.eventType !== "operator_timeline_accessed")
    .filter((event) => event.eventType !== "operator_conversation_accessed")
    .map((event) => ({
      sequence: event.sequence,
      occurredAtIso: event.occurredAtIso,
      actorType: event.actorType,
      eventType: event.eventType,
      label: eventLabels[event.eventType] ?? humanizeEventType(event.eventType),
      detail: safeDetail(event),
    }));
}

function humanizeEventType(value: string): string {
  const words = value.split("_").filter(Boolean);
  if (words.length === 0) return value;
  const phrase = words.join(" ");
  return `${phrase.charAt(0).toUpperCase()}${phrase.slice(1)}`;
}

function safeDetail(event: JournalEventRecord): string | undefined {
  const fromStatus = valueAsString(event.payload.fromStatus);
  const toStatus = valueAsString(event.payload.toStatus);
  if (fromStatus && toStatus) return `${fromStatus} to ${toStatus}`;
  const outcomeLabel = valueAsString(event.payload.outcomeLabel);
  if (outcomeLabel) return outcomeLabel;
  const taskId = valueAsString(event.payload.taskId);
  if (taskId) return taskId;
  return undefined;
}

function valueAsString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
