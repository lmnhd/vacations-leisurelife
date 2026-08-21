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
import { randomUUID } from "node:crypto";
import { PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { chatDynamoDocumentClient } from "@/lib/chat/dynamo-client";

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
  "toolCallId",
  "toolLabel",
  "allowed",
  "deniedCount",
  "allowedCount",
  "durationMs",
  "cacheHit",
  "resultStatus",
  "duplicateCount",
  "batchSize",
  "executor",
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
  "errorCode",
  "errorType",
  "errorParam",
  "eventId",
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
const TRACE_TTL_SECONDS = 60 * 60;
const TABLE_NAME = process.env.VOICE_CONVERSATION_TABLE ?? "lll-shadow-campaigns";
const pendingWrites = new Set<Promise<void>>();

function usesSharedStore(): boolean {
  const configured = process.env.VOICE_CONVERSATION_STORE;
  if (configured === "memory") return false;
  if (configured === "dynamodb") return true;
  return Boolean(process.env.VERCEL || process.env.VERCEL_ENV);
}

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
}

const TRACE_GLOBAL_KEY = "__leisureLifeTraceState__";

function traceState(): TraceGlobalState {
  const holder = globalThis as unknown as Record<string, TraceGlobalState | undefined>;
  let state = holder[TRACE_GLOBAL_KEY];
  if (!state) {
    state = { buffers: new Map<string, TraceEvent[]>() };
    holder[TRACE_GLOBAL_KEY] = state;
  }
  return state;
}

export function emitTraceEvent(conversationId: string, input: TraceEmitInput): TraceEvent | null {
  try {
    const state = traceState();
    const event: TraceEvent = {
      eventId: `trc_${randomUUID()}`,
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

    if (usesSharedStore()) {
      const write = chatDynamoDocumentClient
        .send(
          new PutCommand({
            TableName: TABLE_NAME,
            Item: {
              PK: `VOICE_TRACE#${conversationId}`,
              SK: `${event.occurredAtIso}#${event.eventId}`,
              entityType: "voice_trace_event",
              ttl: Math.floor(Date.now() / 1000) + TRACE_TTL_SECONDS,
              traceEvent: event,
            },
          })
        )
        .then(() => undefined)
        .catch(() => undefined);
      pendingWrites.add(write);
      void write.finally(() => pendingWrites.delete(write));
    }

    return event;
  } catch {
    // Trace collection must never break the conversation.
    return null;
  }
}

export async function flushTraceEvents(): Promise<void> {
  await Promise.all([...pendingWrites]);
}

export async function readTraceEvents(
  conversationId: string,
  sinceEventId?: string
): Promise<TraceEvent[]> {
  if (usesSharedStore()) {
    await flushTraceEvents();
    const result = await chatDynamoDocumentClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: "PK = :pk",
        ExpressionAttributeValues: { ":pk": `VOICE_TRACE#${conversationId}` },
        ScanIndexForward: false,
        Limit: MAX_EVENTS_PER_CONVERSATION,
      })
    );
    const cutoffMs = Date.now() - TRACE_TTL_SECONDS * 1000;
    const events = (result.Items ?? [])
      .map((item) => item["traceEvent"])
      .filter((item): item is TraceEvent => Boolean(item && typeof item === "object"))
      .filter((event) => Date.parse(event.occurredAtIso) >= cutoffMs)
      .reverse();
    if (!sinceEventId) return events;
    const index = events.findIndex((event) => event.eventId === sinceEventId);
    return index < 0 ? events : events.slice(index + 1);
  }

  const storedEvents = traceState().buffers.get(conversationId);
  if (!storedEvents) return [];
  const cutoffMs = Date.now() - TRACE_TTL_SECONDS * 1000;
  const events = storedEvents.filter((event) => Date.parse(event.occurredAtIso) >= cutoffMs);
  if (!sinceEventId) return [...events];
  const index = events.findIndex((event) => event.eventId === sinceEventId);
  if (index < 0) return [...events];
  return events.slice(index + 1);
}

export function clearTraceEvents(conversationId: string): void {
  traceState().buffers.delete(conversationId);
}
