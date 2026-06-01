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

export async function callGeminiDeepResearch(prompt: string, attempt = 1, existingInteractionId?: string): Promise<string> {
    const MAX_ATTEMPTS = 3;
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

    if (!apiKey) {
        throw new Error('GOOGLE_GENERATIVE_AI_API_KEY is not set');
    }

    let interactionId = existingInteractionId;

    try {
        if (!interactionId) {
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
            interactionId = interaction.id;
            console.log(`[callGeminiDeepResearch] Interaction started: ${interactionId}`);
        } else {
            console.log(`[callGeminiDeepResearch] Resuming existing interaction ${interactionId} (attempt ${attempt}/${MAX_ATTEMPTS})...`);
        }

        const MAX_POLL_MS = 20 * 60 * 1000;
        const pollStart = Date.now();

        while (true) {
            await new Promise(resolve => setTimeout(resolve, 10000));

            const elapsed = Date.now() - pollStart;
            if (elapsed > MAX_POLL_MS) {
                throw new Error(`Gemini Deep Research timed out after ${Math.round(elapsed / 60000)}min. Interaction ID: ${interactionId}`);
            }

            const pollRes = await fetch(`${INTERACTIONS_BASE}/${interactionId}?key=${apiKey}`);

            if (!pollRes.ok) {
                const errorBody = await pollRes.text();
                throw new Error(`Gemini Deep Research poll failed (${pollRes.status}): ${errorBody}`);
            }

            const result = (await pollRes.json()) as Interaction;

            if (result.status === 'completed') {
                const outputs = result.outputs ?? [];
                const text = outputs.filter(o => o.text?.trim()).pop()?.text;
                if (!text || !text.trim()) {
                    console.warn(`[callGeminiDeepResearch] Completed but no text output found. Output types: ${outputs.map(o => o.type ?? 'unknown').join(', ')}`);
                    throw new Error('Gemini Deep Research returned empty output (retryable).');
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
            error.message.includes('empty output (retryable)') ||
            error.name === 'AbortError'
        );

        if (isRetryable && attempt < MAX_ATTEMPTS) {
            const delayMs = attempt * 5000;
            console.warn(`[callGeminiDeepResearch] Retryable error on attempt ${attempt}: ${error instanceof Error ? error.message : 'unknown'}. Retrying in ${delayMs / 1000}s...`);
            await new Promise(resolve => setTimeout(resolve, delayMs));
            return callGeminiDeepResearch(prompt, attempt + 1, interactionId ?? undefined);
        }

        throw error;
    }
}
