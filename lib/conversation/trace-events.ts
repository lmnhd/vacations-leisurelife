/**
 * Sanitized trace event contract for the hidden portfolio trace window.
 *
 * This is a typed projection of the canonical server event stream. It is NOT
 * a browser console and NOT raw provider traffic. Emitting and rendering
 * traces is non-blocking: a trace failure must never affect the conversation.
 *
 * Never allowed in a trace detail: prompts, chain-of-thought, unrestricted
 * transcripts, raw provider payloads, PII, credentials, payment content,
 * supplier secrets, or operator-only data. `sanitizeDetail` enforces an
 * allowlist so a careless caller cannot leak by accident.
 */

import type { ConversationChannel } from "./launch-envelope";

export type TraceCategory =
  | "context"
  | "skill"
  | "tools"
  | "state"
  | "transport"
  | "safety"
  | "errors";

export type TraceSeverity = "info" | "notice" | "warning" | "error";

export interface TraceEvent {
  eventId: string;
  occurredAtIso: string;
  severity: TraceSeverity;
  category: TraceCategory;
  /** Short stable event name, e.g. "context.snapshot_built". */
  event: string;
  /** Correlates events belonging to one logical operation. */
  correlationId: string;
  channel: ConversationChannel;
  skillId?: string;
  skillVersion?: number;
  /** Allowlisted scalar details only. */
  detail: Record<string, string | number | boolean>;
}

/**
 * Keys permitted in a trace detail object. Anything else is dropped.
 * Deliberately conservative: adding a key here is a review decision.
 */
const ALLOWED_DETAIL_KEYS: string[] = [
  // identity / lifecycle
  "conversationId",
  "transportSessionId",
  "mode",
  "source",
  "channel",
  "sessionProfile",
  "modelLabel",
  "reason",
  "outcome",
  "resumed",
  // context
  "snapshotId",
  "snapshotVersion",
  "subjectType",
  "snapshotChars",
  "sectionCount",
  "includedSections",
  "droppedSections",
  "provenanceCount",
  "evidenceGapCount",
  "freshnessCount",
  // skill
  "skillId",
  "skillVersion",
  "previousSkillId",
  "requestedSkillId",
  "approved",
  "hintOverridden",
  // tools
  "toolId",
  "toolLabel",
  "allowed",
  "deniedCount",
  "allowedCount",
  "durationMs",
  "cacheHit",
  "resultStatus",
  // state / booking
  "taskId",
  "previousTaskId",
  "field",
  "draftVersion",
  "confirmed",
  // transport
  "connectionState",
  "reconnectAttempt",
  "callId",
  "transferTarget",
  "latencyMs",
  // turn taking / conversation shape.
  // These describe the SHAPE of a turn (who spoke, how long, how many
  // characters), never its content. `turnChars` is a length, not text.
  "role",
  "turnNumber",
  "turnChars",
  "activity",
  "previousActivity",
  "final",
  "interruptedResponse",
  "micState",
  "textFallbackUsed",
  // tool arguments, described structurally only
  "argumentKeys",
  "argumentCount",
  "resultChars",
  // safety
  "classification",
  "action",
  "tier",
];

/** Values are clamped so a long string cannot smuggle content into a trace. */
const MAX_DETAIL_STRING = 120;

export function sanitizeDetail(
  raw: Record<string, unknown>
): Record<string, string | number | boolean> {
  const clean: Record<string, string | number | boolean> = {};
  for (const key of Object.keys(raw)) {
    if (!ALLOWED_DETAIL_KEYS.includes(key)) continue;
    const value = raw[key];
    if (typeof value === "number" || typeof value === "boolean") {
      clean[key] = value;
      continue;
    }
    if (typeof value === "string") {
      clean[key] = value.length > MAX_DETAIL_STRING ? value.slice(0, MAX_DETAIL_STRING) : value;
    }
  }
  return clean;
}

export interface TraceEmitInput {
  severity: TraceSeverity;
  category: TraceCategory;
  event: string;
  correlationId: string;
  channel: ConversationChannel;
  skillId?: string;
  skillVersion?: number;
  detail?: Record<string, unknown>;
}

const MAX_EVENTS_PER_CONVERSATION = 400;

/**
 * In-memory ring buffer per conversation. Traces are demo-scale observability,
 * intentionally ephemeral: they never become a second data store.
 *
 * Pinned to globalThis on purpose. Next.js evaluates route handlers in
 * separate module registries (and re-evaluates them on hot reload), so a
 * plain module-level Map is NOT shared between, say, the launch route and the
 * trace-read route - each would get its own empty copy and every read would
 * return nothing. A single global keyed store gives all handlers in the
 * process one buffer.
 */
interface TraceGlobalState {
  buffers: Map<string, TraceEvent[]>;
  sequence: number;
}

const TRACE_GLOBAL_KEY = "__leisureLifeTraceState__";

function traceState(): TraceGlobalState {
  const holder = globalThis as unknown as Record<string, TraceGlobalState | undefined>;
  let state = holder[TRACE_GLOBAL_KEY];
  if (!state) {
    state = { buffers: new Map<string, TraceEvent[]>(), sequence: 0 };
    holder[TRACE_GLOBAL_KEY] = state;
  }
  return state;
}

export function emitTraceEvent(conversationId: string, input: TraceEmitInput): TraceEvent | null {
  try {
    const state = traceState();
    state.sequence += 1;
    const event: TraceEvent = {
      eventId: `trc_${Date.now().toString(36)}_${state.sequence.toString(36)}`,
      occurredAtIso: new Date().toISOString(),
      severity: input.severity,
      category: input.category,
      event: input.event,
      correlationId: input.correlationId,
      channel: input.channel,
      skillId: input.skillId,
      skillVersion: input.skillVersion,
      detail: sanitizeDetail(input.detail ?? {}),
    };

    const existing = state.buffers.get(conversationId);
    if (existing) {
      existing.push(event);
      if (existing.length > MAX_EVENTS_PER_CONVERSATION) {
        existing.splice(0, existing.length - MAX_EVENTS_PER_CONVERSATION);
      }
    } else {
      state.buffers.set(conversationId, [event]);
    }

    return event;
  } catch {
    // Trace collection must never break the conversation.
    return null;
  }
}

export function readTraceEvents(conversationId: string, sinceEventId?: string): TraceEvent[] {
  const events = traceState().buffers.get(conversationId);
  if (!events) return [];
  if (!sinceEventId) return [...events];
  const index = events.findIndex((event) => event.eventId === sinceEventId);
  if (index < 0) return [...events];
  return events.slice(index + 1);
}

export function clearTraceEvents(conversationId: string): void {
  traceState().buffers.delete(conversationId);
}
