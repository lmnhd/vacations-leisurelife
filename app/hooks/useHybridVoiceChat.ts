/**
 * useHybridVoiceChat
 *
 * Hybrid voice architecture:
 *   - OpenAI Realtime API handles ONLY audio I/O (STT + TTS)
 *   - All reasoning goes through the standard /api/chat text pipeline
 *   - The Realtime model never reasons or calls tools
 *
 * Flow per user turn:
 *   1. Browser mic audio → Realtime WebRTC → STT transcript
 *   2. Transcript text → POST /api/chat (channel: 'voice')
 *   3. Reply text → inject into Realtime as assistant message → TTS playback
 */

'use client';

import { useCallback, useRef, useState } from 'react';
import {
    createRealtimeSession,
    type RealtimeConnectionState,
    type RealtimeSessionHandle,
    type RealtimeVoiceEvent,
} from '@/lib/voice/realtime-session';
import type { ChatResponse } from '@/lib/chat/types';

export interface UseHybridVoiceChatOptions {
    sessionId: string;
    userId?: string;
    voice?: string;
    startingContext?: string;
    onTranscriptComplete?: (transcript: string) => void;
    onAgentTranscript?: (transcript: string) => void;
    onPipelineResult?: (result: ChatResponse) => void;
    onEvent?: (event: RealtimeVoiceEvent) => void;
    onError?: (error: string) => void;
}

export interface UseHybridVoiceChatReturn {
    connectionState: RealtimeConnectionState;
    isProcessing: boolean;
    startVoiceChat: () => Promise<void>;
    stopVoiceChat: () => void;
    interruptCurrentSpeech: () => void;
}

export function useHybridVoiceChat(options: UseHybridVoiceChatOptions): UseHybridVoiceChatReturn {
    const [connectionState, setConnectionState] = useState<RealtimeConnectionState>('idle');
    const [isProcessing, setIsProcessing] = useState(false);

    const sessionRef = useRef<RealtimeSessionHandle | null>(null);
    const processingRef = useRef(false); // prevent concurrent pipeline calls

    const runPipeline = useCallback(async (transcript: string) => {
        if (processingRef.current) return; // drop if already processing
        processingRef.current = true;
        setIsProcessing(true);

        try {
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: transcript,
                    sessionId: options.sessionId,
                    userId: options.userId,
                    channel: 'text',  // hybrid: reasoning is text-pipeline, I/O is voice separately
                    ...(options.startingContext ? { startingContext: options.startingContext } : {}),
                }),
            });

            if (!res.ok) {
                options.onError?.(`Pipeline HTTP ${res.status} — ${res.statusText}`);
                return;
            }

            const data = await res.json() as ChatResponse;
            options.onPipelineResult?.(data);

            if (data.error) {
                options.onError?.(`Pipeline error: ${data.error}`);
                return;
            }

            if (data.reply && sessionRef.current) {
                options.onAgentTranscript?.(data.reply);
                sessionRef.current.sendTtsText(data.reply);
            }
        } catch (err) {
            options.onError?.(`Hybrid pipeline error: ${String(err)}`);
        } finally {
            processingRef.current = false;
            setIsProcessing(false);
        }
    }, [options]);

    const startVoiceChat = useCallback(async () => {
        if (connectionState !== 'idle' && connectionState !== 'error') return;

        // Acquire mic
        let micStream: MediaStream;
        try {
            micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch {
            options.onError?.('Microphone access denied');
            return;
        }

        // Fetch hybrid session token (STT+TTS only — no tools)
        const tokenRes = await fetch('/api/voice/hybrid-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ voice: options.voice ?? 'alloy' }),
        });

        const tokenData = await tokenRes.json() as { clientSecret?: string; error?: string };
        if (!tokenRes.ok || !tokenData.clientSecret) {
            options.onError?.(tokenData.error ?? 'Failed to get hybrid session token');
            return;
        }

        const session = await createRealtimeSession(
            tokenData.clientSecret,
            micStream,
            {
                onStateChange: setConnectionState,
                onError: (err) => options.onError?.(err),
                onEvent: (event) => options.onEvent?.(event),
                onTranscriptComplete: (transcript) => {
                    // Cancel the Realtime model's self-generated reply immediately —
                    // the pipeline response will be injected via sendTtsText instead.
                    sessionRef.current?.cancelAutoResponse();
                    options.onTranscriptComplete?.(transcript);
                    void runPipeline(transcript);
                },
                // onAgentTranscript suppressed in hybrid mode via hybridMode flag below
            },
            false,       // textOnly
            true         // hybridMode — suppresses response.audio_transcript.done echo
        );

        sessionRef.current = session;
    }, [connectionState, options, runPipeline]);

    const stopVoiceChat = useCallback(() => {
        sessionRef.current?.close();
        sessionRef.current = null;
    }, []);

    const interruptCurrentSpeech = useCallback(() => {
        sessionRef.current?.sendInterrupt();
    }, []);

    return { connectionState, isProcessing, startVoiceChat, stopVoiceChat, interruptCurrentSpeech };
}
