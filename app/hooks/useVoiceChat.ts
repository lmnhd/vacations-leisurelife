'use client';

/**
 * useVoiceChat — WebRTC voice lifecycle hook for Hero Chat
 *
 * Architecture:
 *   Mic toggle ON → acquire mic → fetch ephemeral token → RTCPeerConnection → OpenAI Realtime
 *   User speaks → STT (server-side VAD) → onTranscriptComplete → caller invokes sendText()
 *   Pipeline returns cleanText → speakReply() → TTS plays while HeroHeadline animates
 *
 * IMPORTANT: This hook does NOT replace the Hero Chat canvas.
 * Voice is a pure audio layer on top of the existing visual experience.
 * The canvas (HeroHeadline, mood backgrounds, images) remains unchanged.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { acquireMicrophone } from '@/lib/voice/audio-adapter';
import {
    createRealtimeSession,
    type RealtimeConnectionState,
    type RealtimeSessionHandle,
    type RealtimeVoiceEvent,
} from '@/lib/voice/realtime-session';
import { speakReply, interruptSpeech } from '@/lib/voice/tts-streamer';

export type { RealtimeConnectionState, RealtimeVoiceEvent };

interface UseVoiceChatOptions {
    sessionId: string;
    userId: string;
    startingContext?: string;
    mode?: 'dev' | 'test';
    onTranscriptComplete: (transcript: string) => void;
    onAgentTranscript?: (transcript: string) => void;
    onEvent?: (event: RealtimeVoiceEvent) => void;
    onSpeakReply: (cleanText: string) => void;
}

interface UseVoiceChatReturn {
    connectionState: RealtimeConnectionState;
    startVoiceChat: () => Promise<void>;
    stopVoiceChat: () => void;
    speakText: (cleanText: string) => void;
    interruptCurrentSpeech: () => void;
}

export function useVoiceChat(options: UseVoiceChatOptions): UseVoiceChatReturn {
    const [connectionState, setConnectionState] = useState<RealtimeConnectionState>('idle');

    const sessionHandleRef = useRef<RealtimeSessionHandle | null>(null);
    const micHandleRef = useRef<{ stop: () => void } | null>(null);

    // ── Keep latest callbacks in a ref to avoid stale closures ──
    const optionsRef = useRef(options);
    useEffect(() => {
        optionsRef.current = options;
    });

    const stopVoiceChat = useCallback(() => {
        sessionHandleRef.current?.close();
        sessionHandleRef.current = null;

        micHandleRef.current?.stop();
        micHandleRef.current = null;

        setConnectionState('idle');
    }, []);

    const startVoiceChat = useCallback(async () => {
        if (connectionState !== 'idle') return;

        try {
            setConnectionState('connecting');

            // ── Step 1: Fetch ephemeral token from our server ──
            const { sessionId, userId, startingContext, mode } = optionsRef.current;
            const tokenResponse = await fetch('/api/voice/session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId,
                    userId,
                    ...(mode ? { mode } : {}),
                    ...(startingContext ? { startingContext } : {}),
                }),
            });

            if (!tokenResponse.ok) {
                const errorPayload = await tokenResponse.json() as { error?: string };
                throw new Error(errorPayload.error ?? `Session error: ${tokenResponse.status}`);
            }

            const tokenData = await tokenResponse.json() as {
                clientSecret: string;
                expiresAt?: number;
                source?: string;
            };

            // ── Step 2: Acquire microphone ──
            const micHandle = await acquireMicrophone();
            micHandleRef.current = micHandle;

            // ── Step 3: Establish WebRTC session with OpenAI Realtime ──
            const handle = await createRealtimeSession(
                tokenData.clientSecret,
                micHandle.stream,
                {
                    onTranscriptComplete: (transcript: string, _itemId: string) => {
                        optionsRef.current.onTranscriptComplete(transcript);
                    },
                    onAgentTranscript: (transcript: string) => {
                        optionsRef.current.onAgentTranscript?.(transcript);
                    },
                    onEvent: (event: RealtimeVoiceEvent) => {
                        optionsRef.current.onEvent?.(event);
                    },
                    onStateChange: (state: RealtimeConnectionState) => {
                        setConnectionState(state);
                        if (state === 'idle' || state === 'error') {
                            micHandleRef.current?.stop();
                            micHandleRef.current = null;
                            sessionHandleRef.current = null;
                        }
                    },
                    onError: (error: string) => {
                        console.error('[useVoiceChat] Realtime error:', error);
                    },
                }
            );

            sessionHandleRef.current = handle;
        } catch (err) {
            console.error('[useVoiceChat] startVoiceChat failed:', err);
            micHandleRef.current?.stop();
            micHandleRef.current = null;
            sessionHandleRef.current = null;
            setConnectionState('error');
        }
    }, [connectionState]);

    const speakText = useCallback((cleanText: string) => {
        if (sessionHandleRef.current) {
            speakReply(sessionHandleRef.current, cleanText);
        }
    }, []);

    const interruptCurrentSpeech = useCallback(() => {
        if (sessionHandleRef.current) {
            interruptSpeech(sessionHandleRef.current);
        }
    }, []);

    return {
        connectionState,
        startVoiceChat,
        stopVoiceChat,
        speakText,
        interruptCurrentSpeech,
    };
}
