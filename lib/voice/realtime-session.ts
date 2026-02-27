/**
 * Realtime Session — WebRTC lifecycle for OpenAI Realtime API (Browser Voice)
 *
 * Manages the RTCPeerConnection, data channel, and audio track
 * for direct browser-to-OpenAI Realtime API connection.
 *
 * Architecture: Browser mic → RTCPeerConnection → OpenAI Realtime
 *   - Audio track carries user speech (STT handled by OpenAI server-side)
 *   - Data channel "oai-events" carries control messages (transcripts, tool calls)
 *   - TTS audio comes back via the peer connection's remote audio track
 */

import { getToolThinkingLabel } from './realtime-tools';

export type RealtimeConnectionState = 'idle' | 'connecting' | 'connected' | 'error';

export interface RealtimeToolCall {
    callId: string;
    toolName: string;
    arguments: string;
}

export interface RealtimeVoiceEvent {
    type: string;
    detail: string;
    ts: string;
}

export interface RealtimeSessionCallbacks {
    onTranscriptComplete: (transcript: string, itemId: string) => void;
    onAgentTranscript?: (transcript: string) => void;
    onStateChange: (state: RealtimeConnectionState) => void;
    onError: (error: string) => void;
    onEvent?: (event: RealtimeVoiceEvent) => void;
}

export interface RealtimeSessionHandle {
    sendTtsText: (text: string) => void;
    injectUserMessage: (text: string) => void;
    sendInterrupt: () => void;
    close: () => void;
}

const OPENAI_REALTIME_BASE = 'https://api.openai.com/v1/realtime';
const REALTIME_MODEL = 'gpt-4o-realtime-preview-2024-12-17';

function ts(): string {
    return new Date().toISOString().slice(11, 23);
}

export async function createRealtimeSession(
    clientSecret: string,
    audioStream: MediaStream,
    callbacks: RealtimeSessionCallbacks,
    textOnly = false
): Promise<RealtimeSessionHandle> {
    callbacks.onStateChange('connecting');

    const pc = new RTCPeerConnection();

    // ── Inbound TTS audio from OpenAI (skipped in text-only mode) ──
    const audioElement = new Audio();
    audioElement.autoplay = true;
    if (!textOnly) {
        pc.ontrack = (event) => {
            audioElement.srcObject = event.streams[0];
        };
    }

    // ── Outbound microphone audio ──
    for (const track of audioStream.getTracks()) {
        pc.addTrack(track, audioStream);
    }

    // ── Data channel for Realtime events ──
    const dc = pc.createDataChannel('oai-events');

    dc.onopen = () => {
        callbacks.onStateChange('connected');
        callbacks.onEvent?.({ type: 'dc:open', detail: 'Data channel connected', ts: ts() });
    };

    dc.onclose = () => {
        callbacks.onStateChange('idle');
    };

    dc.onerror = (e) => {
        const msg = `Data channel error: ${String(e)}`;
        callbacks.onError(msg);
        callbacks.onEvent?.({ type: 'dc:error', detail: msg, ts: ts() });
        callbacks.onStateChange('error');
    };

    const pendingToolCalls = new Map<string, { name: string; argBuffer: string }>();

    dc.onmessage = (event: MessageEvent) => {
        handleDataChannelMessage(event.data as string, dc, pendingToolCalls, callbacks, textOnly);
    };

    // ── SDP offer / answer handshake ──
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const sdpResponse = await fetch(
        `${OPENAI_REALTIME_BASE}?model=${REALTIME_MODEL}`,
        {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${clientSecret}`,
                'Content-Type': 'application/sdp',
            },
            body: offer.sdp,
        }
    );

    if (!sdpResponse.ok) {
        const errorText = await sdpResponse.text();
        callbacks.onError(`OpenAI SDP error ${sdpResponse.status}: ${errorText}`);
        callbacks.onStateChange('error');
        pc.close();
        throw new Error(`SDP handshake failed: ${sdpResponse.status}`);
    }

    const answerSdp = await sdpResponse.text();
    await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });

    // ── Return control handle ──
    return {
        injectUserMessage: (text: string) => {
            if (dc.readyState !== 'open') return;
            dc.send(JSON.stringify({
                type: 'conversation.item.create',
                item: {
                    type: 'message',
                    role: 'user',
                    content: [{ type: 'input_text', text }],
                },
            }));
            dc.send(JSON.stringify({ type: 'response.create' }));
        },

        sendTtsText: (text: string) => {
            if (dc.readyState !== 'open') return;
            dc.send(
                JSON.stringify({
                    type: 'conversation.item.create',
                    item: {
                        type: 'message',
                        role: 'assistant',
                        content: [{ type: 'text', text }],
                    },
                })
            );
            dc.send(JSON.stringify({ type: 'response.create' }));
        },

        sendInterrupt: () => {
            if (dc.readyState !== 'open') return;
            dc.send(JSON.stringify({ type: 'response.cancel' }));
        },

        close: () => {
            dc.close();
            pc.close();
            audioElement.srcObject = null;
        },
    };
}

// ── Internal: parse data channel messages from OpenAI ──

function handleDataChannelMessage(
    raw: string,
    dc: RTCDataChannel,
    pendingToolCalls: Map<string, { name: string; argBuffer: string }>,
    callbacks: RealtimeSessionCallbacks,
    isTextOnly = false
): void {
    let message: Record<string, unknown>;
    try {
        message = JSON.parse(raw) as Record<string, unknown>;
    } catch {
        return;
    }

    const type = message['type'] as string | undefined;
    if (!type) return;

    // ── Function call: start buffering + speak acknowledgment ──
    if (type === 'response.function_call_arguments.start') {
        const callId = message['call_id'] as string | undefined;
        const name = message['name'] as string | undefined;
        if (callId && name) {
            pendingToolCalls.set(callId, { name, argBuffer: '' });
            if (!isTextOnly) speakThinkingLabel(dc, name);
            callbacks.onEvent?.({ type: 'tool:start', detail: `tool=${name} callId=${callId}`, ts: ts() });
        }
        return;
    }

    // ── Function call: accumulate argument delta ──
    if (type === 'response.function_call_arguments.delta') {
        const callId = message['call_id'] as string | undefined;
        const delta = (message['delta'] as string | undefined) ?? '';
        if (callId) {
            const pending = pendingToolCalls.get(callId);
            if (pending) pending.argBuffer += delta;
        }
        return;
    }

    // ── Function call: arguments complete — dispatch to server ──
    if (type === 'response.function_call_arguments.done') {
        const callId = message['call_id'] as string | undefined;
        if (!callId) return;
        const pending = pendingToolCalls.get(callId);
        if (!pending) return;
        pendingToolCalls.delete(callId);
        callbacks.onEvent?.({ type: 'tool:dispatch', detail: `tool=${pending.name} args=${pending.argBuffer.slice(0, 120)}`, ts: ts() });
        dispatchToolCall(dc, callId, pending.name, pending.argBuffer, callbacks);
        return;
    }

    // ── STT transcript complete ──
    if (type === 'conversation.item.input_audio_transcription.completed') {
        const transcript = (message['transcript'] as string | undefined)?.trim();
        const itemId = (message['item_id'] as string | undefined) ?? '';
        if (transcript) {
            callbacks.onEvent?.({ type: 'stt:complete', detail: `"${transcript.slice(0, 100)}"`, ts: ts() });
            callbacks.onTranscriptComplete(transcript, itemId);
        }
        return;
    }

    // ── Agent audio transcript complete (audio sessions) ──
    if (type === 'response.audio_transcript.done') {
        const transcript = (message['transcript'] as string | undefined)?.trim();
        if (transcript) {
            callbacks.onEvent?.({ type: 'agent:reply', detail: `"${transcript.slice(0, 100)}"`, ts: ts() });
            callbacks.onAgentTranscript?.(transcript);
        }
        return;
    }

    // ── Agent text response complete (text-only / test mode sessions) ──
    if (type === 'response.text.done') {
        const text = (message['text'] as string | undefined)?.trim();
        if (text) {
            callbacks.onEvent?.({ type: 'agent:reply', detail: `"${text.slice(0, 100)}"`, ts: ts() });
            callbacks.onAgentTranscript?.(text);
        }
    }
}

// ── Speak a short acknowledgment while the tool runs ──

function speakThinkingLabel(dc: RTCDataChannel, toolName: string): void {
    if (dc.readyState !== 'open') return;
    const label = getToolThinkingLabel(toolName);
    dc.send(JSON.stringify({
        type: 'conversation.item.create',
        item: {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'text', text: label }],
        },
    }));
    dc.send(JSON.stringify({ type: 'response.create' }));
}

// ── Dispatch tool call to server and return result to Realtime ──

async function dispatchToolCall(
    dc: RTCDataChannel,
    callId: string,
    toolName: string,
    rawArgs: string,
    callbacks: RealtimeSessionCallbacks
): Promise<void> {
    const startMs = Date.now();
    try {
        const response = await fetch('/api/voice/tool-dispatch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ toolId: toolName, payload: JSON.parse(rawArgs) }),
        });

        const durationMs = Date.now() - startMs;

        if (!response.ok) {
            const errDetail = `HTTP ${response.status} after ${durationMs}ms`;
            callbacks.onEvent?.({ type: 'tool:error', detail: `tool=${toolName} ${errDetail}`, ts: ts() });
            callbacks.onError(`Tool dispatch failed for ${toolName}: ${errDetail}`);
            return;
        }

        const resultText = JSON.stringify(await response.json() as Record<string, unknown>);
        callbacks.onEvent?.({ type: 'tool:result', detail: `tool=${toolName} ${durationMs}ms result=${resultText.slice(0, 120)}`, ts: ts() });

        if (dc.readyState !== 'open') return;

        // Send result back to Realtime so it can continue the response
        dc.send(JSON.stringify({
            type: 'conversation.item.create',
            item: {
                type: 'function_call_output',
                call_id: callId,
                output: resultText,
            },
        }));

        // Tell Realtime to resume generating its response
        dc.send(JSON.stringify({ type: 'response.create' }));
    } catch (err) {
        const errMsg = `Tool dispatch error for ${toolName}: ${String(err)}`;
        callbacks.onEvent?.({ type: 'tool:error', detail: errMsg, ts: ts() });
        callbacks.onError(errMsg);
    }
}
