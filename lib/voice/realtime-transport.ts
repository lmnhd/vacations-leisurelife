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
  const pendingCalls = new Map<string, { toolId: string; args: string; startedMs: number }>();

  channel.onopen = () => setState("connected");
  channel.onclose = () => setState("closed");
  channel.onerror = () => {
    setState("error");
    callbacks.onError("The voice control channel failed.");
  };
  channel.onmessage = (event: MessageEvent) => {
    handleServerEvent(String(event.data), channel, pendingCalls, callbacks);
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
  pendingCalls: Map<string, { toolId: string; args: string; startedMs: number }>,
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
    callbacks.onActivityChange("listening");
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
    if (pendingCalls.has(callId)) return;

    pendingCalls.set(callId, { toolId, args, startedMs: Date.now() });
    callbacks.onToolStarted?.(toolId, callId);

    void callbacks
      .onToolCall({ callId, toolId, argumentsJson: args })
      .then((resultJson) => {
        const pending = pendingCalls.get(callId);
        pendingCalls.delete(callId);
        if (pending) {
          callbacks.onToolFinished?.(toolId, callId, Date.now() - pending.startedMs);
        }
        if (channel.readyState !== "open") return;
        channel.send(
          JSON.stringify({
            type: "conversation.item.create",
            item: { type: "function_call_output", call_id: callId, output: resultJson },
          })
        );
        channel.send(JSON.stringify({ type: "response.create" }));
      })
      .catch(() => {
        pendingCalls.delete(callId);
        if (channel.readyState !== "open") return;
        channel.send(
          JSON.stringify({
            type: "conversation.item.create",
            item: {
              type: "function_call_output",
              call_id: callId,
              output: JSON.stringify({
                error: "tool_failed",
                guidance: "Tell the guest this lookup failed. Do not invent a result.",
              }),
            },
          })
        );
        channel.send(JSON.stringify({ type: "response.create" }));
      });
    return;
  }

  if (type === "error") {
    const errorObject = message["error"];
    const detail =
      errorObject && typeof errorObject === "object"
        ? stringField(errorObject as Record<string, unknown>, "message")
        : null;
    callbacks.onError(detail ?? "The voice service reported an error.");
  }
}

function stringField(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}
