const INTERACTIONS_BASE = 'https://generativelanguage.googleapis.com/v1beta/interactions';

type InteractionStatus = 'in_progress' | 'completed' | 'failed';

type InteractionOutput = {
    text?: string;
    type?: string;
};

type Interaction = {
    id: string;
    status: InteractionStatus;
    outputs?: InteractionOutput[];
    error?: string;
};

export async function callGeminiDeepResearch(prompt: string, attempt = 1): Promise<string> {
    const MAX_ATTEMPTS = 3;
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

    if (!apiKey) {
        throw new Error('GOOGLE_GENERATIVE_AI_API_KEY is not set');
    }

    try {
        console.log(`[callGeminiDeepResearch] Starting (attempt ${attempt}/${MAX_ATTEMPTS})...`);

        const createRes = await fetch(`${INTERACTIONS_BASE}?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                input: prompt,
                agent: 'deep-research-preview-04-2026',
                background: true,
                store: true,
            }),
        });

        if (!createRes.ok) {
            const errorBody = await createRes.text();
            throw new Error(`Gemini Deep Research create failed (${createRes.status}): ${errorBody}`);
        }

        const interaction = (await createRes.json()) as Interaction;
        console.log(`[callGeminiDeepResearch] Interaction started: ${interaction.id}`);

        while (true) {
            await new Promise(resolve => setTimeout(resolve, 10000));

            const pollRes = await fetch(`${INTERACTIONS_BASE}/${interaction.id}?key=${apiKey}`);

            if (!pollRes.ok) {
                const errorBody = await pollRes.text();
                throw new Error(`Gemini Deep Research poll failed (${pollRes.status}): ${errorBody}`);
            }

            const result = (await pollRes.json()) as Interaction;

            if (result.status === 'completed') {
                const outputs = result.outputs ?? [];
                const text = outputs[outputs.length - 1]?.text;
                if (!text || !text.trim()) {
                    throw new Error('Gemini Deep Research returned empty output.');
                }
                console.log(`[callGeminiDeepResearch] Completed.`);
                return text.trim();
            }

            if (result.status === 'failed') {
                throw new Error(`Gemini Deep Research failed: ${result.error ?? 'unknown error'}`);
            }

            console.log(`[callGeminiDeepResearch] Status: ${result.status} — polling again in 10s...`);
        }
    } catch (error) {
        const isRetryable = error instanceof Error && (
            error.message.includes('ECONNREFUSED') ||
            error.message.includes('fetch failed') ||
            error.message.includes('timeout') ||
            error.message.includes('network') ||
            error.name === 'AbortError'
        );

        if (isRetryable && attempt < MAX_ATTEMPTS) {
            const delayMs = attempt * 5000;
            console.warn(`[callGeminiDeepResearch] Retryable error on attempt ${attempt}: ${error instanceof Error ? error.message : 'unknown'}. Retrying in ${delayMs / 1000}s...`);
            await new Promise(resolve => setTimeout(resolve, delayMs));
            return callGeminiDeepResearch(prompt, attempt + 1);
        }

        throw error;
    }
}
