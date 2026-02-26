/**
 * Voice Session — Core Logic
 *
 * Creates an OpenAI Realtime API ephemeral session token.
 * The assembled system prompt is embedded as `instructions`
 * so the Realtime session has the same persona/rules as the chat pipeline.
 */

import { assembleSystemPrompt } from '@/lib/chat/prompt-assembler';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const REALTIME_MODEL = 'gpt-4o-realtime-preview-2024-12-17';
const DEFAULT_VOICE = 'alloy';
const DEFAULT_TEMPERATURE = 0.8;

const FALLBACK_VOICE_INSTRUCTIONS =
    'You are a helpful cruise travel assistant. Keep all responses concise and natural for voice conversation. Avoid lists or markdown formatting.';

interface VoiceSessionRequestBody {
    sessionId?: string;
    userId?: string;
    voice?: string;
    temperature?: number;
}

interface VoiceSessionResponseData {
    clientSecret?: string;
    expiresAt?: number;
    source?: 'assembled' | 'fallback';
    error?: string;
}

export async function handleVoiceSessionRequest(
    body: VoiceSessionRequestBody
): Promise<{ status: number; data: VoiceSessionResponseData }> {
    if (!OPENAI_API_KEY) {
        return { status: 500, data: { error: 'OPENAI_API_KEY not configured' } };
    }

    const voice = body.voice ?? DEFAULT_VOICE;
    const temperature = body.temperature ?? DEFAULT_TEMPERATURE;

    // ── Assemble system prompt dynamically (same pipeline assembler as chat) ──
    let instructions: string;
    let source: 'assembled' | 'fallback';

    try {
        const assembled = await assembleSystemPrompt({
            channel: 'voice',
            hasCruised: null,
            requestedSpecificCruise: false,
            incompleteProfile: true,
            discussesPastCruise: false,
        });
        instructions = assembled.systemPrompt;
        source = 'assembled';
    } catch (err) {
        console.error('[VoiceSession] assembleSystemPrompt failed, using fallback:', err);
        instructions = FALLBACK_VOICE_INSTRUCTIONS;
        source = 'fallback';
    }

    // ── Create ephemeral token via OpenAI Realtime Sessions API ──
    const openAiResponse = await fetch('https://api.openai.com/v1/realtime/sessions', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: REALTIME_MODEL,
            voice,
            temperature,
            instructions,
            input_audio_transcription: { model: 'whisper-1' },
            turn_detection: { type: 'server_vad' },
        }),
    });

    if (!openAiResponse.ok) {
        const errorText = await openAiResponse.text();
        console.error('[VoiceSession] OpenAI error:', errorText);
        return {
            status: openAiResponse.status,
            data: { error: `OpenAI Realtime session error: ${openAiResponse.status}` },
        };
    }

    const session = await openAiResponse.json() as {
        client_secret?: { value?: string };
        expires_at?: number;
    };

    const clientSecret = session.client_secret?.value;
    if (!clientSecret) {
        return { status: 500, data: { error: 'No client_secret returned from OpenAI' } };
    }

    return {
        status: 200,
        data: {
            clientSecret,
            expiresAt: session.expires_at,
            source,
        },
    };
}
