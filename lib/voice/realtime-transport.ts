/**
 * Realtime transport (browser WebRTC) - current GA contract.
 *
 *   POST /v1/realtime/calls   with Content-Type: application/sdp
 *   Authorization: Bearer <ephemeral client secret minted server-side>
 *
 * This is a typed transport wrapper, not a component: no React, no business
 * logic, no prompt or tool decisions. Everything it needs (instructions,
 * tools, model) was resolved on the server before the client secret existed.
 *
 * Deviation note: the OpenAI Agents SDK (`@openai/agents/realtime`) is the
 * preferred surface, but every version supporting this GA contract requires
 * zod v4 and crashes at import against this repo's zod v3. See the canonical
 * plan, section 2.2. This wrapper implements the same contract directly and
 * can be swapped for the SDK once the workspace moves to zod 4.
 */

export type RealtimeTransportState =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "closed"
  | "error";

export type SpeechActivity = "listening" | "thinking" | "speaking" | "interrupted";

export interface RealtimeTranscriptEvent {
  role: "user" | "assistant";
  text: string;
  /** Partial text is provisional and will be replaced by the final version. */
  final: boolean;
  itemId: string;
}

export interface RealtimeToolInvocation {
  callId: string;
  toolId: string;
  argumentsJson: string;
}

export interface RealtimeTransportCallbacks {
  onStateChange: (state: RealtimeTransportState) => void;
  onActivityChange: (activity: SpeechActivity) => void;
  onTranscript: (event: RealtimeTranscriptEvent) => void;
  onToolCall: (invocation: RealtimeToolInvocation) => Promise<string>;
  onToolStarted?: (toolId: string, callId: string) => void;
  onToolFinished?: (toolId: string, callId: string, durationMs: number) => void;
  onError: (message: string) => void;
  onRealtimeError?: (detail: RealtimeErrorDetail) => void;
}

export interface RealtimeErrorDetail {
  code: string;
  type: string;
  param: string;
  eventId: string;
}

export interface RealtimeTransportHandle {
  sendUserText: (text: string) => void;
  interrupt: () => void;
  close: () => void;
  getState: () => RealtimeTransportState;
}

const REALTIME_CALLS_URL = "https://api.openai.com/v1/realtime/calls";

export interface RealtimeTransportOptions {
  clientSecret: string;
  audioStream: MediaStream;
  callbacks: RealtimeTransportCallbacks;
  /** Audio playback element; created if omitted. */
  audioElement?: HTMLAudioElement;
}

export async function connectRealtimeTransport(
  options: RealtimeTransportOptions
): Promise<RealtimeTransportHandle> {
  const { clientSecret, audioStream, callbacks } = options;

  let state: RealtimeTransportState = "connecting";
  const setState = (next: RealtimeTransportState): void => {
    if (state === next) return;
    state = next;
    callbacks.onStateChange(next);
  };
  setState("connecting");

  const peer = new RTCPeerConnection();
  const audio = options.audioElement ?? new Audio();
  audio.autoplay = true;

  peer.ontrack = (event) => {
    const stream = event.streams[0];
    if (stream) audio.srcObject = stream;
  };

  for (const track of audioStream.getTracks()) {
    peer.addTrack(track, audioStream);
  }

  peer.onconnectionstatechange = () => {
    if (peer.connectionState === "failed") {
      setState("error");
      callbacks.onError("The voice connection dropped.");
    } else if (peer.connectionState === "disconnected") {
      setState("reconnecting");
    } else if (peer.connectionState === "connected" && state === "reconnecting") {
      setState("connected");
    }
  };

  const channel = peer.createDataChannel("oai-events");
  const toolBatch: ToolBatchState = { pending: new Map(), flushing: false };

  channel.onopen = () => setState("connected");
  channel.onclose = () => setState("closed");
  channel.onerror = () => {
    setState("error");
    callbacks.onError("The voice control channel failed.");
  };
  channel.onmessage = (event: MessageEvent) => {
    handleServerEvent(String(event.data), channel, toolBatch, callbacks);
  };

  const offer = await peer.createOffer();
  await peer.setLocalDescription(offer);

  const response = await fetch(REALTIME_CALLS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${clientSecret}`,
      "Content-Type": "application/sdp",
    },
    body: offer.sdp ?? "",
  });

  if (!response.ok) {
    peer.close();
    setState("error");
    callbacks.onError(`Voice connection refused (${response.status}).`);
    throw new Error(`realtime_sdp_failed_${response.status}`);
  }

  const answerSdp = await response.text();
  await peer.setRemoteDescription({ type: "answer", sdp: answerSdp });

  return {
    sendUserText: (text: string) => {
      if (channel.readyState !== "open") return;
      channel.send(
        JSON.stringify({
          type: "conversation.item.create",
          item: {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text }],
          },
        })
      );
      channel.send(JSON.stringify({ type: "response.create" }));
      callbacks.onActivityChange("thinking");
    },

    interrupt: () => {
      if (channel.readyState !== "open") return;
      channel.send(JSON.stringify({ type: "response.cancel" }));
      callbacks.onActivityChange("interrupted");
    },

    close: () => {
      try {
        if (channel.readyState === "open") channel.close();
      } finally {
        peer.close();
        audio.srcObject = null;
        setState("closed");
      }
    },

    getState: () => state,
  };
}

function handleServerEvent(
  raw: string,
  channel: RTCDataChannel,
  toolBatch: ToolBatchState,
  callbacks: RealtimeTransportCallbacks
): void {
  let message: Record<string, unknown>;
  try {
    message = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return;
  }

  const type = typeof message["type"] === "string" ? (message["type"] as string) : "";
  if (!type) return;

  // ── Turn taking ─────────────────────────────────────────────────────────
  if (type === "input_audio_buffer.speech_started") {
    callbacks.onActivityChange("listening");
    return;
  }
  if (type === "input_audio_buffer.speech_stopped") {
    callbacks.onActivityChange("thinking");
    return;
  }
  if (type === "response.created") {
    callbacks.onActivityChange("thinking");
    return;
  }
  if (type === "response.output_audio.delta" || type === "response.audio.delta") {
    callbacks.onActivityChange("speaking");
    return;
  }
  if (type === "response.done") {
    if (toolBatch.pending.size > 0) {
      callbacks.onActivityChange("thinking");
      void flushToolBatch(channel, toolBatch, callbacks);
    } else {
      callbacks.onActivityChange("listening");
    }
    return;
  }

  // ── Guest speech transcription ──────────────────────────────────────────
  if (type === "conversation.item.input_audio_transcription.delta") {
    const delta = stringField(message, "delta");
    if (delta) {
      callbacks.onTranscript({
        role: "user",
        text: delta,
        final: false,
        itemId: stringField(message, "item_id") ?? "",
      });
    }
    return;
  }
  if (type === "conversation.item.input_audio_transcription.completed") {
    const transcript = stringField(message, "transcript");
    if (transcript) {
      callbacks.onTranscript({
        role: "user",
        text: transcript,
        final: true,
        itemId: stringField(message, "item_id") ?? "",
      });
    }
    return;
  }

  // ── Assistant speech transcription ──────────────────────────────────────
  if (type === "response.output_audio_transcript.delta" || type === "response.audio_transcript.delta") {
    const delta = stringField(message, "delta");
    if (delta) {
      callbacks.onTranscript({
        role: "assistant",
        text: delta,
        final: false,
        itemId: stringField(message, "item_id") ?? "",
      });
    }
    return;
  }
  if (type === "response.output_audio_transcript.done" || type === "response.audio_transcript.done") {
    const transcript = stringField(message, "transcript");
    if (transcript) {
      callbacks.onTranscript({
        role: "assistant",
        text: transcript,
        final: true,
        itemId: stringField(message, "item_id") ?? "",
      });
    }
    return;
  }

  // ── Function tool calls ─────────────────────────────────────────────────
  if (type === "response.function_call_arguments.done") {
    const callId = stringField(message, "call_id");
    const toolId = stringField(message, "name");
    const args = stringField(message, "arguments") ?? "{}";
    if (!callId || !toolId) return;
    if (toolBatch.pending.has(callId)) return;

    toolBatch.pending.set(callId, { toolId, args, startedMs: Date.now() });
    callbacks.onToolStarted?.(toolId, callId);
    return;
  }

  if (type === "error") {
    const errorObject = message["error"];
    const errorRecord =
      errorObject && typeof errorObject === "object"
        ? errorObject as Record<string, unknown>
        : {};
    callbacks.onRealtimeError?.({
      code: stringField(errorRecord, "code") ?? "unknown",
      type: stringField(errorRecord, "type") ?? "unknown",
      param: stringField(errorRecord, "param") ?? "none",
      eventId: stringField(message, "event_id") ?? "none",
    });
    callbacks.onError(
      stringField(errorRecord, "message") ?? "The voice service reported an error."
    );
  }
}

interface PendingToolCall {
  toolId: string;
  args: string;
  startedMs: number;
}

interface ToolBatchState {
  pending: Map<string, PendingToolCall>;
  flushing: boolean;
}

async function flushToolBatch(
  channel: RTCDataChannel,
  state: ToolBatchState,
  callbacks: RealtimeTransportCallbacks
): Promise<void> {
  if (state.flushing || state.pending.size === 0) return;
  state.flushing = true;
  try {
    const calls = [...state.pending.entries()];
    for (const [callId] of calls) state.pending.delete(callId);

    const results = new Map<string, Promise<string>>();
    for (const [callId, call] of calls) {
      const key = canonicalToolInvocationKey(call.toolId, call.args);
      if (!results.has(key)) {
        results.set(
          key,
          callbacks
            .onToolCall({ callId, toolId: call.toolId, argumentsJson: call.args })
            .catch(() =>
              JSON.stringify({
                error: "tool_failed",
                guidance: "Tell the guest this lookup failed. Do not invent a result.",
              })
            )
        );
      }
    }

    for (const [callId, call] of calls) {
      const result = await results.get(canonicalToolInvocationKey(call.toolId, call.args));
      callbacks.onToolFinished?.(call.toolId, callId, Date.now() - call.startedMs);
      if (channel.readyState !== "open") continue;
      channel.send(
        JSON.stringify({
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: callId,
            output: result ?? JSON.stringify({ error: "tool_failed" }),
          },
        })
      );
    }

    if (channel.readyState === "open") {
      channel.send(JSON.stringify({ type: "response.create" }));
    }
  } finally {
    state.flushing = false;
  }
}

export function canonicalToolInvocationKey(toolId: string, argumentsJson: string): string {
  let payload: unknown = argumentsJson;
  try {
    payload = JSON.parse(argumentsJson) as unknown;
  } catch {
    payload = argumentsJson;
  }
  return `${toolId}:${JSON.stringify(sortJsonValue(payload))}`;
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (!value || typeof value !== "object") return value;
  const source = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(source).sort()) sorted[key] = sortJsonValue(source[key]);
  return sorted;
}

function stringField(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}
