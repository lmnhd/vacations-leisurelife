/**
 * Hybrid Voice Session — Core Logic
 *
 * Creates a minimal OpenAI Realtime API ephemeral token for STT + TTS ONLY.
 * No tools, no agent reasoning — the Realtime model is used purely as an
 * audio I/O layer. All reasoning goes through the standard text chat pipeline.
 *
 * Flow:
 *   Browser mic → Realtime STT → transcript → /api/chat → reply text → Realtime TTS → speaker
 */

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const REALTIME_MODEL = 'gpt-4o-realtime-preview-2024-12-17';

interface HybridSessionRequestBody {
    voice?: string;
}

interface HybridSessionResponseData {
    clientSecret?: string;
    expiresAt?: number;
    error?: string;
}

// Minimal instructions — the Realtime model should only speak the text we send it,
// never reason or generate its own responses.
const STT_TTS_ONLY_INSTRUCTIONS = [
    'You are a voice relay. Your only job is to speak the text provided to you verbatim.',
    'Never generate your own responses. Never ask questions. Never add commentary.',
    'Speak only what is given to you via the conversation.',
].join(' ');

export async function handleHybridSessionRequest(
    body: Record<string, unknown>
): Promise<{ status: number; data: HybridSessionResponseData }> {
    if (!OPENAI_API_KEY) {
        return { status: 500, data: { error: 'OPENAI_API_KEY not configured' } };
    }

    const voice = (body.voice as string | undefined) ?? 'alloy';

    const openAiResponse = await fetch('https://api.openai.com/v1/realtime/sessions', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: REALTIME_MODEL,
            voice,
            instructions: STT_TTS_ONLY_INSTRUCTIONS,
            modalities: ['text', 'audio'],
            input_audio_transcription: { model: 'whisper-1' },
            turn_detection: {
                type: 'server_vad',
                silence_duration_ms: 700,
                prefix_padding_ms: 300,
                threshold: 0.5,
            },
            // No tools registered — reasoning is handled by /api/chat pipeline
        }),
    });

    if (!openAiResponse.ok) {
        const errorText = await openAiResponse.text();
        console.error('[HybridSession] OpenAI error:', errorText);
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

    console.log('[HybridSession] STT+TTS-only session created — no tools, no agent reasoning');

    return {
        status: 200,
        data: { clientSecret, expiresAt: session.expires_at },
    };
}
