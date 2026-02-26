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

export type RealtimeConnectionState = 'idle' | 'connecting' | 'connected' | 'error';

export interface RealtimeSessionCallbacks {
    onTranscriptComplete: (transcript: string, itemId: string) => void;
    onStateChange: (state: RealtimeConnectionState) => void;
    onError: (error: string) => void;
}

export interface RealtimeSessionHandle {
    sendTtsText: (text: string) => void;
    sendInterrupt: () => void;
    close: () => void;
}

const OPENAI_REALTIME_BASE = 'https://api.openai.com/v1/realtime';
const REALTIME_MODEL = 'gpt-4o-realtime-preview-2024-12-17';

export async function createRealtimeSession(
    clientSecret: string,
    audioStream: MediaStream,
    callbacks: RealtimeSessionCallbacks
): Promise<RealtimeSessionHandle> {
    callbacks.onStateChange('connecting');

    const pc = new RTCPeerConnection();

    // ── Inbound TTS audio from OpenAI ──
    const audioElement = new Audio();
    audioElement.autoplay = true;
    pc.ontrack = (event) => {
        audioElement.srcObject = event.streams[0];
    };

    // ── Outbound microphone audio ──
    for (const track of audioStream.getTracks()) {
        pc.addTrack(track, audioStream);
    }

    // ── Data channel for Realtime events ──
    const dc = pc.createDataChannel('oai-events');

    dc.onopen = () => {
        callbacks.onStateChange('connected');
    };

    dc.onclose = () => {
        callbacks.onStateChange('idle');
    };

    dc.onerror = (e) => {
        callbacks.onError(`Data channel error: ${String(e)}`);
        callbacks.onStateChange('error');
    };

    dc.onmessage = (event: MessageEvent) => {
        handleDataChannelMessage(event.data as string, callbacks);
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
    callbacks: RealtimeSessionCallbacks
): void {
    let message: Record<string, unknown>;
    try {
        message = JSON.parse(raw) as Record<string, unknown>;
    } catch {
        return;
    }

    const type = message['type'] as string | undefined;
    if (!type) return;

    if (type === 'conversation.item.input_audio_transcription.completed') {
        const transcript = (message['transcript'] as string | undefined)?.trim();
        const itemId = (message['item_id'] as string | undefined) ?? '';
        if (transcript) {
            callbacks.onTranscriptComplete(transcript, itemId);
        }
    }
}
