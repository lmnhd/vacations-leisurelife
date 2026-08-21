/**
 * Sideband call session: the server-side WebSocket attached to an accepted
 * SIP call. It executes tools, applies safety rules, enforces the call
 * ceiling, and performs transfers.
 *
 * The audio never passes through here - OpenAI Realtime SIP carries it. This
 * process only exchanges control events.
 */

import WebSocket from "ws";

import {
  detectsEmergencyLanguage,
  EMERGENCY_RESPONSE_TEXT,
  resolveTransferTarget,
  isWithinBusinessHours,
  type BusinessHoursConfig,
} from "./call-policy.js";
import type { RealtimeSipClient } from "./realtime-sip-client.js";
import { buildCallOpeningResponse } from "./call-opening.js";

export interface CallSessionOptions {
  callId: string;
  conversationId: string;
  client: RealtimeSipClient;
  /** Base URL of the Next.js app that owns tool execution. */
  appUrl: string;
  transferNumber?: string;
  businessHours: BusinessHoursConfig;
  maxCallSeconds: number;
  /** Mandatory AI disclosure and first question spoken when the call connects. */
  openingText: string;
  onJournal: (event: string, detail: Record<string, string | number | boolean>) => void;
  onClosed: (callId: string) => void;
}

export class CallSession {
  private socket: WebSocket | null = null;
  private durationTimer: NodeJS.Timeout | null = null;
  private keepAliveTimer: NodeJS.Timeout | null = null;
  private closed = false;
  private readonly pendingToolCalls = new Map<string, PendingToolCall>();
  private flushingTools = false;

  constructor(private readonly options: CallSessionOptions) {}

  start(): void {
    const socket = new WebSocket(this.options.client.sidebandUrl(this.options.callId), {
      headers: this.options.client.authorizationHeader(),
    });
    this.socket = socket;

    socket.on("open", () => {
      this.options.onJournal("sideband.connected", { callId: this.options.callId });
      this.send(buildCallOpeningResponse(this.options.openingText));
      this.options.onJournal("call.opening_requested", { callId: this.options.callId });
      this.keepAliveTimer = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) socket.ping();
      }, 25_000);
    });

    socket.on("message", (raw: WebSocket.RawData) => {
      void this.handleEvent(String(raw));
    });

    socket.on("error", () => {
      this.options.onJournal("sideband.error", { callId: this.options.callId });
    });

    socket.on("close", () => {
      this.options.onJournal("sideband.closed", { callId: this.options.callId });
      this.cleanup();
    });

    // Hard ceiling: wrap up rather than letting a call run indefinitely.
    this.durationTimer = setTimeout(() => {
      this.options.onJournal("call.duration_limit_reached", {
        callId: this.options.callId,
        durationMs: this.options.maxCallSeconds * 1000,
      });
      this.speak(
        "I need to wrap up this call now. You can call back any time, or continue online where I sent you."
      );
      setTimeout(() => void this.hangup("duration_limit"), 8_000);
    }, this.options.maxCallSeconds * 1000);
  }

  private async handleEvent(raw: string): Promise<void> {
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return;
    }

    const type = typeof message["type"] === "string" ? message["type"] : "";

    // Emergency language takes priority over every other behavior.
    if (type === "conversation.item.input_audio_transcription.completed") {
      const transcript =
        typeof message["transcript"] === "string" ? message["transcript"] : "";
      if (transcript && detectsEmergencyLanguage(transcript)) {
        this.options.onJournal("safety.emergency_language_detected", {
          callId: this.options.callId,
        });
        this.speak(EMERGENCY_RESPONSE_TEXT);
      }
      return;
    }

    if (type === "response.function_call_arguments.done") {
      const callId = typeof message["call_id"] === "string" ? message["call_id"] : null;
      const toolId = typeof message["name"] === "string" ? message["name"] : null;
      const args = typeof message["arguments"] === "string" ? message["arguments"] : "{}";
      if (!callId || !toolId) return;
      if (!this.pendingToolCalls.has(callId)) {
        this.pendingToolCalls.set(callId, { toolId, argumentsJson: args, startedMs: Date.now() });
        this.options.onJournal("tool.queued", {
          callId: this.options.callId,
          toolId,
          toolCallId: callId,
        });
      }
      return;
    }

    if (type === "response.done" && this.pendingToolCalls.size > 0) {
      await this.flushToolCalls();
      return;
    }

    if (type === "error") {
      const error = objectField(message, "error");
      this.options.onJournal("realtime.error", {
        callId: this.options.callId,
        errorCode: stringField(error, "code") ?? "unknown",
        errorType: stringField(error, "type") ?? "unknown",
        errorParam: stringField(error, "param") ?? "none",
        eventId: stringField(message, "event_id") ?? "none",
      });
    }
  }

  private async flushToolCalls(): Promise<void> {
    if (this.flushingTools || this.pendingToolCalls.size === 0) return;
    this.flushingTools = true;
    const calls = [...this.pendingToolCalls.entries()];
    for (const [toolCallId] of calls) this.pendingToolCalls.delete(toolCallId);

    try {
      const uniqueResults = new Map<string, Record<string, unknown>>();
      const firstCallByKey = new Map<string, string>();
      for (const [toolCallId, call] of calls) {
        const key = canonicalToolInvocationKey(call.toolId, call.argumentsJson);
        if (!firstCallByKey.has(key)) firstCallByKey.set(key, toolCallId);
      }

      this.options.onJournal("tool.batch_started", {
        callId: this.options.callId,
        batchSize: calls.length,
        duplicateCount: calls.length - firstCallByKey.size,
      });

      for (const [key, toolCallId] of firstCallByKey.entries()) {
        const call = this.pendingCallFromBatch(calls, toolCallId);
        if (!call) continue;
        uniqueResults.set(
          key,
          await this.executeTool(toolCallId, call.toolId, call.argumentsJson)
        );
      }

      for (const [toolCallId, call] of calls) {
        const key = canonicalToolInvocationKey(call.toolId, call.argumentsJson);
        this.sendToolResult(toolCallId, uniqueResults.get(key) ?? { error: "tool_failed" });
        this.options.onJournal("tool.result_returned", {
          callId: this.options.callId,
          toolId: call.toolId,
          toolCallId,
          durationMs: Date.now() - call.startedMs,
        });
      }
      this.send({ type: "response.create" });
      this.options.onJournal("tool.batch_completed", {
        callId: this.options.callId,
        batchSize: calls.length,
      });
    } finally {
      this.flushingTools = false;
    }
  }

  private pendingCallFromBatch(
    calls: Array<[string, PendingToolCall]>,
    toolCallId: string
  ): PendingToolCall | null {
    return calls.find(([candidateId]) => candidateId === toolCallId)?.[1] ?? null;
  }

  private async executeTool(
    toolCallId: string,
    toolId: string,
    argumentsJson: string
  ): Promise<Record<string, unknown>> {
    this.options.onJournal("tool.started", {
      callId: this.options.callId,
      toolId,
      toolCallId,
    });

    // The phone transfer tool is executed by this service, not the app: it is
    // a SIP operation on this specific call.
    if (toolId === "transfer_phone_call") {
      const availability = resolveTransferTarget(
        this.options.transferNumber,
        isWithinBusinessHours(this.options.businessHours)
      );

      if (!availability.available) {
        this.options.onJournal("transfer.unavailable", {
          callId: this.options.callId,
          reason: availability.reason,
        });
        return {
          transferred: false,
          reason: availability.reason,
          guidance:
            "Tell the caller honestly that you cannot transfer them right now, and offer a callback or the secure web continuation instead.",
        };
      }

      const result = await this.options.client.referCall(
        this.options.callId,
        availability.target
      );

      this.options.onJournal(result.ok ? "transfer.accepted" : "transfer.failed", {
        callId: this.options.callId,
        outcome: result.ok ? "accepted" : "failed",
      });

      return {
        // Deliberately "requested", not "completed": the API accepting a
        // refer is not proof the caller reached a person.
        transferRequested: result.ok,
        guidance: result.ok
          ? "The transfer request was accepted. Tell the caller you are connecting them now and stop talking."
          : "The transfer request failed. Say so plainly and offer a callback instead. Do not claim the transfer happened.",
      };
    }

    // Every other tool runs in the Next.js app against the same conversation
    // runtime the browser uses, so business logic exists in exactly one place.
    try {
      const response = await fetch(`${this.options.appUrl}/api/conversation/tool`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: this.options.conversationId,
          toolId,
          toolCallId,
          payload: safeParseObject(argumentsJson),
        }),
      });
      const body = (await response.json()) as { data?: Record<string, unknown> };
      this.options.onJournal("tool.completed", {
        callId: this.options.callId,
        toolId,
        toolCallId,
        resultStatus: response.status,
      });
      return body.data ?? { error: "tool_failed" };
    } catch {
      this.options.onJournal("tool.error", {
        callId: this.options.callId,
        toolId,
        toolCallId,
      });
      return {
        error: "tool_failed",
        guidance: "Tell the caller this lookup did not work. Do not invent a result.",
      };
    }
  }

  private sendToolResult(toolCallId: string, data: Record<string, unknown>): void {
    this.send({
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: toolCallId,
        output: JSON.stringify(data),
      },
    });
  }

  /** Makes the agent say a specific line, used for safety interventions. */
  speak(text: string): void {
    this.send(buildCallOpeningResponse(text));
  }

  async hangup(reason: string): Promise<void> {
    this.options.onJournal("call.hangup", { callId: this.options.callId, reason });
    await this.options.client.hangupCall(this.options.callId);
    this.cleanup();
  }

  private send(payload: unknown): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(payload));
    }
  }

  /** Graceful shutdown path used when Render recycles the instance. */
  async shutdown(): Promise<void> {
    if (this.closed) return;
    this.speak(
      "I need to end this call for a moment. Please call back and we can pick up right where we left off."
    );
    await new Promise((resolve) => setTimeout(resolve, 3_000));
    await this.hangup("service_shutdown");
  }

  private cleanup(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.durationTimer) clearTimeout(this.durationTimer);
    if (this.keepAliveTimer) clearInterval(this.keepAliveTimer);
    if (this.socket && this.socket.readyState === WebSocket.OPEN) this.socket.close();
    this.socket = null;
    this.options.onClosed(this.options.callId);
  }
}

interface PendingToolCall {
  toolId: string;
  argumentsJson: string;
  startedMs: number;
}

function safeParseObject(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // fall through
  }
  return {};
}

export function canonicalToolInvocationKey(toolId: string, argumentsJson: string): string {
  return `${toolId}:${JSON.stringify(sortJsonValue(safeParseUnknown(argumentsJson)))}`;
}

function safeParseUnknown(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (!value || typeof value !== "object") return value;
  const source = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(source).sort()) sorted[key] = sortJsonValue(source[key]);
  return sorted;
}

function objectField(source: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = source[key];
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringField(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}
