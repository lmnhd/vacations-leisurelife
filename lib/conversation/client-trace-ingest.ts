/**
 * Client trace ingest.
 *
 * Most of what a voice conversation actually DOES happens in the browser:
 * turn taking, partial and final transcripts, barge-in, mic permission,
 * reconnects, and the model deciding to call a tool. None of that reaches the
 * server on its own, which is why an early trace showed only session setup
 * plus bare tool start/complete pairs.
 *
 * This module lets the browser report those moments - under strict rules:
 *
 *  1. The event name must be in a fixed server-side vocabulary. A client
 *     cannot invent an event name.
 *  2. Details are numbers, booleans, and enum-ish short strings only, and
 *     still pass through the same allowlist sanitizer as server events.
 *  3. Nothing carrying content is accepted. Transcripts report a CHARACTER
 *     COUNT, never the words. Tool arguments report their KEY NAMES, never
 *     their values.
 *  4. Category and severity are decided here, not by the client.
 *
 * The result is a trace that shows the real rhythm of the conversation while
 * remaining safe to show a stranger on a portfolio page.
 */

import { emitTraceEvent, type TraceCategory, type TraceSeverity } from "./trace-events";
import type { ConversationChannel } from "./launch-envelope";

interface ClientEventSpec {
  category: TraceCategory;
  severity: TraceSeverity;
}

/**
 * The complete vocabulary of client-reportable events. Adding one is a
 * deliberate review decision, exactly like adding a detail key.
 */
const CLIENT_EVENT_VOCABULARY: Record<string, ClientEventSpec> = {
  // Transport lifecycle
  "transport.connecting": { category: "transport", severity: "info" },
  "transport.connected": { category: "transport", severity: "info" },
  "transport.reconnecting": { category: "transport", severity: "warning" },
  "transport.closed": { category: "transport", severity: "info" },
  "transport.failed": { category: "errors", severity: "error" },
  "transport.mic_requested": { category: "transport", severity: "info" },
  "transport.mic_granted": { category: "transport", severity: "info" },
  "transport.mic_denied": { category: "safety", severity: "warning" },

  // Turn taking - the rhythm of the conversation
  "turn.user_speech_started": { category: "state", severity: "info" },
  "turn.user_speech_stopped": { category: "state", severity: "info" },
  "turn.user_transcript_final": { category: "state", severity: "info" },
  "turn.assistant_response_started": { category: "state", severity: "info" },
  "turn.assistant_speaking": { category: "state", severity: "info" },
  "turn.assistant_response_done": { category: "state", severity: "info" },
  "turn.barge_in": { category: "state", severity: "notice" },
  "turn.user_text_submitted": { category: "state", severity: "info" },

  // Tool calls, from the model's side of the wire
  "tool.model_requested": { category: "tools", severity: "info" },
  "tool.result_returned": { category: "tools", severity: "info" },

  // Guest-facing confirmations
  "proposal.presented": { category: "state", severity: "notice" },
  "proposal.confirmed": { category: "state", severity: "notice" },
  "proposal.discarded": { category: "state", severity: "notice" },

  // Errors surfaced in the browser
  "client.error": { category: "errors", severity: "error" },
};

/** Detail values a client may send: numbers, booleans, or short enums. */
const MAX_CLIENT_STRING = 60;

export interface ClientTraceEventInput {
  event: string;
  detail?: Record<string, unknown>;
}

export interface ClientIngestResult {
  accepted: number;
  rejected: number;
}

export function ingestClientTraceEvents(
  conversationId: string,
  channel: ConversationChannel,
  events: ClientTraceEventInput[],
  context: { skillId?: string; skillVersion?: number }
): ClientIngestResult {
  let accepted = 0;
  let rejected = 0;

  for (const candidate of events) {
    const spec = CLIENT_EVENT_VOCABULARY[candidate.event];
    if (!spec) {
      rejected += 1;
      continue;
    }

    const detail = clampClientDetail(candidate.detail ?? {});

    emitTraceEvent(conversationId, {
      severity: spec.severity,
      category: spec.category,
      event: candidate.event,
      correlationId: conversationId,
      channel,
      skillId: context.skillId,
      skillVersion: context.skillVersion,
      detail,
    });
    accepted += 1;
  }

  return { accepted, rejected };
}

/**
 * Pre-clamps client values before they reach the shared sanitizer. Strings are
 * kept very short so a client cannot smuggle a transcript through a field that
 * happens to be on the allowlist.
 */
function clampClientDetail(raw: Record<string, unknown>): Record<string, unknown> {
  const clamped: Record<string, unknown> = {};
  for (const key of Object.keys(raw)) {
    const value = raw[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      clamped[key] = value;
      continue;
    }
    if (typeof value === "boolean") {
      clamped[key] = value;
      continue;
    }
    if (typeof value === "string") {
      clamped[key] = value.length > MAX_CLIENT_STRING ? value.slice(0, MAX_CLIENT_STRING) : value;
    }
    // Objects, arrays, and everything else are dropped entirely.
  }
  return clamped;
}

export function isKnownClientEvent(event: string): boolean {
  return Object.prototype.hasOwnProperty.call(CLIENT_EVENT_VOCABULARY, event);
}

export function listClientEventNames(): string[] {
  return Object.keys(CLIENT_EVENT_VOCABULARY);
}
