/**
 * Transcript Handler — STT transcript → /api/chat pipeline
 *
 * Converts a completed speech-to-text transcript from the OpenAI Realtime API
 * into a chat pipeline call. The pipeline processes it identically to a typed
 * message with channel: 'voice', returning cleanText for TTS playback.
 */

import type { ChatResponse } from '@/lib/chat/types';

interface TranscriptHandlerOptions {
    sessionId: string;
    userId: string;
}

interface PipelineResult {
    reply: string;
    display?: ChatResponse['display'];
}

export async function sendTranscriptToPipeline(
    transcript: string,
    options: TranscriptHandlerOptions
): Promise<PipelineResult> {
    const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            message: transcript,
            sessionId: options.sessionId,
            channel: 'voice',
            userId: options.userId,
        }),
    });

    if (!response.ok) {
        const errorPayload = await response.json() as { error?: string };
        throw new Error(errorPayload.error ?? `Chat API error: ${response.status}`);
    }

    const payload = await response.json() as ChatResponse;
    return {
        reply: payload.reply,
        display: payload.display,
    };
}
