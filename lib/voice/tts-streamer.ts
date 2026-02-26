/**
 * TTS Streamer — cleanText → OpenAI Realtime TTS
 *
 * Receives the pipeline's cleanText reply and sends it to the
 * OpenAI Realtime API data channel for speech synthesis.
 *
 * The Realtime session speaks the text aloud while the Hero Chat canvas
 * simultaneously animates the same text as the HeroHeadline.
 * These run in parallel — voice is the audio layer on the visual canvas.
 */

import type { RealtimeSessionHandle } from './realtime-session';

export function speakReply(
    handle: RealtimeSessionHandle,
    cleanText: string
): void {
    if (!cleanText.trim()) return;
    handle.sendTtsText(cleanText);
}

export function interruptSpeech(handle: RealtimeSessionHandle): void {
    handle.sendInterrupt();
}
