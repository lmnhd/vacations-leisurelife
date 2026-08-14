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
      await this.executeTool(callId, toolId, args);
      return;
    }

    if (type === "error") {
      this.options.onJournal("realtime.error", { callId: this.options.callId });
    }
  }

  private async executeTool(
    toolCallId: string,
    toolId: string,
    argumentsJson: string
  ): Promise<void> {
    this.options.onJournal("tool.started", { callId: this.options.callId, toolId });

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
        this.sendToolResult(toolCallId, {
          transferred: false,
          reason: availability.reason,
          guidance:
            "Tell the caller honestly that you cannot transfer them right now, and offer a callback or the secure web continuation instead.",
        });
        return;
      }

      const result = await this.options.client.referCall(
        this.options.callId,
        availability.target
      );

      this.options.onJournal(result.ok ? "transfer.accepted" : "transfer.failed", {
        callId: this.options.callId,
        outcome: result.ok ? "accepted" : "failed",
      });

      this.sendToolResult(toolCallId, {
        // Deliberately "requested", not "completed": the API accepting a
        // refer is not proof the caller reached a person.
        transferRequested: result.ok,
        guidance: result.ok
          ? "The transfer request was accepted. Tell the caller you are connecting them now and stop talking."
          : "The transfer request failed. Say so plainly and offer a callback instead. Do not claim the transfer happened.",
      });
      return;
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
          payload: safeParseObject(argumentsJson),
        }),
      });
      const body = (await response.json()) as { data?: Record<string, unknown> };
      this.options.onJournal("tool.completed", {
        callId: this.options.callId,
        toolId,
        resultStatus: response.status,
      });
      this.sendToolResult(toolCallId, body.data ?? { error: "tool_failed" });
    } catch {
      this.options.onJournal("tool.error", { callId: this.options.callId, toolId });
      this.sendToolResult(toolCallId, {
        error: "tool_failed",
        guidance: "Tell the caller this lookup did not work. Do not invent a result.",
      });
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
    this.send({ type: "response.create" });
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
