import { emitTraceEvent, type TraceCategory, type TraceSeverity } from "./trace-events";

const TELEPHONY_EVENTS = new Set([
  "call.accepted",
  "call.opening_requested",
  "call.duration_limit_reached",
  "call.hangup",
  "sideband.connected",
  "sideband.closed",
  "sideband.error",
  "tool.queued",
  "tool.batch_started",
  "tool.started",
  "tool.completed",
  "tool.error",
  "tool.result_returned",
  "tool.batch_completed",
  "transfer.unavailable",
  "transfer.accepted",
  "transfer.failed",
  "safety.emergency_language_detected",
  "realtime.error",
]);

export function ingestTelephonyTraceEvent(input: {
  conversationId: string;
  event: string;
  detail: Record<string, unknown>;
  skillId?: string;
  skillVersion?: number;
}): boolean {
  if (!TELEPHONY_EVENTS.has(input.event)) return false;
  emitTraceEvent(input.conversationId, {
    severity: severityForEvent(input.event),
    category: categoryForEvent(input.event),
    event: input.event,
    correlationId: input.conversationId,
    channel: "telephone",
    skillId: input.skillId,
    skillVersion: input.skillVersion,
    detail: input.detail,
  });
  return true;
}

function categoryForEvent(event: string): TraceCategory {
  if (event.startsWith("tool.")) return "tools";
  if (event.startsWith("safety.")) return "safety";
  if (event === "realtime.error" || event.endsWith(".error")) return "errors";
  return "transport";
}

function severityForEvent(event: string): TraceSeverity {
  if (event === "realtime.error" || event.endsWith(".error") || event.endsWith(".failed")) {
    return "error";
  }
  if (event.endsWith(".unavailable") || event === "call.duration_limit_reached") {
    return "warning";
  }
  return "info";
}
