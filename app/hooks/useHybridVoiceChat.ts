/**
 * useHybridVoiceChat
 *
 * Hybrid voice architecture:
 *   - OpenAI Realtime API handles STT ONLY (Whisper transcript)
 *   - All reasoning goes through the standard /api/chat text pipeline
 *   - TTS playback via OpenAI REST Audio API (/api/voice/tts) — not the Realtime model
 *
 * Flow per user turn:
 *   1. Browser mic → Realtime WebRTC → Whisper STT transcript
 *   2. Transcript → POST /api/chat (channel: voice_hybrid) → gpt-4o reasoning + tools
 *   3. Reply text → POST /api/voice/tts → mp3 audio → AudioContext playback
 */

'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';

import {
    createRealtimeSession,
    type RealtimeConnectionState,
    type RealtimeSessionHandle,
    type RealtimeVoiceEvent,
} from '@/lib/voice/realtime-session';
import type { ChatResponse } from '@/lib/chat/types';

// Strip markdown code blocks, JSON blobs, and formatting — Realtime TTS needs clean prose only
function stripForVoice(text: string): string {
    return text
        .replace(/```[\s\S]*?```/g, '')   // remove fenced code blocks (including JSON)
        .replace(/`[^`]+`/g, '')          // remove inline code
        .replace(/\[.*?\]\(.*?\)/g, '')   // remove markdown links
        .replace(/^#{1,6}\s+/gm, '')      // remove heading markers
        .replace(/\*\*(.+?)\*\*/g, '$1') // unwrap bold
        .replace(/\*(.+?)\*/g, '$1')     // unwrap italic
        .replace(/^\s*[-*]\s+/gm, '')    // remove bullet points
        .replace(/\n{3,}/g, '\n\n')      // collapse excessive newlines
        .trim();
}

// Fetch TTS audio from REST endpoint and play via AudioContext
async function playTtsAudio(
    text: string,
    voice: string,
    audioCtxRef: React.MutableRefObject<AudioContext | null>,
    audioSourceRef: React.MutableRefObject<AudioBufferSourceNode | null>
): Promise<void> {
    // Stop any currently playing audio
    audioSourceRef.current?.stop();
    audioSourceRef.current = null;

    const res = await fetch('/api/voice/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice }),
    });

    if (!res.ok || !res.body) {
        console.error('[TTS] REST TTS request failed:', res.status);
        return;
    }

    const arrayBuffer = await res.arrayBuffer();

    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        audioCtxRef.current = new AudioContext();
    }
    const ctx = audioCtxRef.current;

    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);
    audioSourceRef.current = source;
    source.start();
}

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
    testTts: (text: string) => Promise<void>;
}

export function useHybridVoiceChat(options: UseHybridVoiceChatOptions): UseHybridVoiceChatReturn {
    const [connectionState, setConnectionState] = useState<RealtimeConnectionState>('idle');
    const [isProcessing, setIsProcessing] = useState(false);

    const sessionRef = useRef<RealtimeSessionHandle | null>(null);
    const processingRef = useRef(false); // prevent concurrent pipeline calls
    const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
    const audioCtxRef = useRef<AudioContext | null>(null);
    const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pendingTranscriptRef = useRef<string>('');

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
                    channel: 'voice_hybrid',
                    model: 'gpt-5.2',  // matches MODEL_MAIN in llm-call.ts
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

            if (data.reply) {
                const ttsText = stripForVoice(data.reply);
                options.onEvent?.({ type: 'tts:send', detail: `sending ${ttsText.length} chars to REST TTS`, ts: new Date().toISOString().slice(11,23) });
                await playTtsAudio(ttsText, options.voice ?? 'alloy', audioCtxRef, audioSourceRef);
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
                    sessionRef.current?.cancelAutoResponse();
                    options.onTranscriptComplete?.(transcript);
                    // Debounce: accumulate rapid short bursts into one pipeline call
                    pendingTranscriptRef.current = pendingTranscriptRef.current
                        ? `${pendingTranscriptRef.current} ${transcript}`
                        : transcript;
                    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
                    debounceTimerRef.current = setTimeout(() => {
                        const combined = pendingTranscriptRef.current;
                        pendingTranscriptRef.current = '';
                        debounceTimerRef.current = null;
                        void runPipeline(combined);
                    }, 1500);
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
        // Stop any active REST TTS playback
        audioSourceRef.current?.stop();
        audioSourceRef.current = null;
    }, []);

    const testTts = useCallback(async (text: string) => {
        await playTtsAudio(text, options.voice ?? 'alloy', audioCtxRef, audioSourceRef);
    }, [options.voice]);

    // Clean up AudioContext on unmount
    useEffect(() => {
        return () => {
            audioSourceRef.current?.stop();
            void audioCtxRef.current?.close();
        };
    }, []);

    return { connectionState, isProcessing, startVoiceChat, stopVoiceChat, interruptCurrentSpeech, testTts };
}
