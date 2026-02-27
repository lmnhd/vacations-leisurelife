/**
 * Voice Session — Core Logic
 *
 * Creates an OpenAI Realtime API ephemeral session token.
 * The assembled system prompt is embedded as `instructions`
 * so the Realtime session has the same persona/rules as the chat pipeline.
 */

import { assembleSystemPrompt } from '@/lib/chat/prompt-assembler';
import { resolveContext } from '@/lib/chat/context-resolver';
import { buildRealtimeToolDefinitions } from '@/lib/voice/realtime-tools';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const REALTIME_MODEL = 'gpt-4o-realtime-preview-2024-12-17';
const DEFAULT_VOICE = 'alloy';
const DEFAULT_TEMPERATURE = 0.8;

const FALLBACK_VOICE_INSTRUCTIONS = [
    'You are LL Cruise Buddy, a knowledgeable cruise travel assistant.',
    'Speak conversationally and warmly — you are a knowledgeable friend, not a brochure.',
    'Keep every response to 2-3 sentences unless the user explicitly asks for more detail.',
    'Never use bullet points, markdown, numbered lists, or headers — speak in natural prose only.',
    "Avoid filler affirmations like 'Certainly!', 'Absolutely!', or 'Great question!'.",
    "When offering options, weave them naturally into speech: 'You could do X, or if you prefer, Y.'",
].join(' ');

const ALL_TOOL_IDS = [
    'perplexity_cruise_research',
    'cruise_brothers_knowledge',
    'excursion_finder',
    'cruise_brothers_scraper',
    'social_media_insights',
    'cruise_trend_analysis',
];

interface VoiceSessionRequestBody {
    sessionId?: string;
    userId?: string;
    voice?: string;
    temperature?: number;
    mode?: 'test';
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

    let resolvedTools: string[] = [];
    const isTestMode = body.mode === 'test';

    try {
        const context = await resolveContext({
            hasCruised: null,
            requestedSpecificCruise: false,
            incompleteProfile: true,
            discussesPastCruise: false,
        });

        // Test mode: unlock all tools + use stripped test prompt
        resolvedTools = isTestMode ? ALL_TOOL_IDS : context.availableTools;

        const assembled = await assembleSystemPrompt({
            channel: isTestMode ? 'voice_test' : 'voice',
            hasCruised: null,
            requestedSpecificCruise: false,
            incompleteProfile: true,
            discussesPastCruise: false,
            preResolvedContext: context,
        });
        instructions = assembled.systemPrompt;
        source = 'assembled';

        console.log(
            `🎤 [voice:session]        │ session_created\n` +
            `    mode: ${isTestMode ? 'TEST' : 'normal'}\n` +
            `    context: ${context.activeContextPath}\n` +
            `    tools: ${JSON.stringify(resolvedTools)}\n` +
            `    promptLength: ${instructions.length}\n` +
            `    promptSource: ${source}`
        );
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
            modalities: isTestMode ? ['text'] : ['text', 'audio'],
            ...(isTestMode ? {} : { input_audio_transcription: { model: 'whisper-1' } }),
            turn_detection: isTestMode ? null : { type: 'server_vad' },
            tools: buildRealtimeToolDefinitions(resolvedTools),
            tool_choice: 'auto',
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
