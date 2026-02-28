/**
 * TTS Core Logic — calls OpenAI Audio REST API and streams audio back.
 * Used by hybrid voice: Realtime API handles STT only, this handles TTS.
 */

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

interface TtsRequestBody {
    text?: string;
    voice?: string;
}

export async function handleTtsRequest(body: TtsRequestBody): Promise<Response> {
    if (!OPENAI_API_KEY) {
        return new Response(JSON.stringify({ error: 'OPENAI_API_KEY not configured' }), { status: 500 });
    }

    const text = body.text?.trim();
    if (!text) {
        return new Response(JSON.stringify({ error: 'text is required' }), { status: 400 });
    }

    const voice = body.voice ?? 'alloy';

    const openAiResponse = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: 'tts-1',
            input: text,
            voice,
            response_format: 'mp3',
        }),
    });

    if (!openAiResponse.ok) {
        const errorText = await openAiResponse.text();
        console.error('[TTS] OpenAI error:', errorText);
        return new Response(JSON.stringify({ error: `TTS error: ${openAiResponse.status}` }), { status: openAiResponse.status });
    }

    return new Response(openAiResponse.body, {
        status: 200,
        headers: {
            'Content-Type': 'audio/mpeg',
            'Transfer-Encoding': 'chunked',
        },
    });
}
