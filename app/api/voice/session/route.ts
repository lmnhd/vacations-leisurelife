/**
 * Voice Session API — Route Handler
 *
 * Creates an OpenAI Realtime API ephemeral session token so the browser
 * can establish a direct WebRTC connection without exposing the API key.
 *
 * The assembled system prompt (from the existing pipeline prompt-assembler)
 * is embedded in the session configuration as `instructions`.
 */

import { NextResponse } from 'next/server';
import { handleVoiceSessionRequest } from './core-logic';

export async function POST(request: Request) {
    const body = await request.json();
    const { status, data } = await handleVoiceSessionRequest(body);
    return NextResponse.json(data, { status });
}
