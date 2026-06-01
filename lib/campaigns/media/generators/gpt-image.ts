// lib/campaigns/media/generators/gpt-image.ts
//
// OpenAI gpt-image-2 image generation. Raw fetch (house pattern — same as the
// voice/TTS clients) so we control response handling and retries without an SDK
// dependency. Returns a PNG/raw image Buffer, matching the Nano-Banana flow.
//
// The response is tolerant of BOTH shapes the API may return:
//   • { data: [{ b64_json }] }  (preferred — decode directly)
//   • { data: [{ url }] }       (fallback — fetch the URL → Buffer)
// gpt-image-1 always returned b64; gpt-image-2's response_format handling is
// still being confirmed, so we accept either.

import { GPT_IMAGE_2_CONFIG } from '../media-pipeline-config';

const REQUEST_TIMEOUT_MS = 120_000;

export type GptImageAspect = '1:1' | '16:9' | '9:16';

function getApiKey(): string {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error('OPENAI_API_KEY not set in environment');
    return key;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...init, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

interface GptImageOptions {
    aspect?: GptImageAspect;
    quality?: string;
}

/**
 * Generate a single image with gpt-image-2. Returns the raw image Buffer.
 * @throws if the API key is missing or every attempt fails.
 */
export async function generateGptImage2(prompt: string, opts: GptImageOptions = {}): Promise<Buffer> {
    const aspect = opts.aspect ?? '1:1';
    const size = GPT_IMAGE_2_CONFIG.sizeForAspect[aspect] ?? GPT_IMAGE_2_CONFIG.sizeForAspect['1:1'];
    const quality = opts.quality ?? GPT_IMAGE_2_CONFIG.quality;

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= GPT_IMAGE_2_CONFIG.maxAttempts; attempt += 1) {
        try {
            const response = await fetchWithTimeout(
                `${GPT_IMAGE_2_CONFIG.apiBase}${GPT_IMAGE_2_CONFIG.endpoint}`,
                {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${getApiKey()}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        model: GPT_IMAGE_2_CONFIG.model,
                        prompt,
                        size,
                        quality,
                        n: 1,
                    }),
                },
                REQUEST_TIMEOUT_MS,
            );

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`gpt-image-2 error ${response.status}: ${errorText}`);
            }

            const payload = await response.json() as {
                data?: Array<{ b64_json?: string; url?: string }>;
            };
            const first = payload.data?.[0];
            if (first?.b64_json) {
                return Buffer.from(first.b64_json, 'base64');
            }
            if (first?.url) {
                const imageRes = await fetchWithTimeout(first.url, {}, REQUEST_TIMEOUT_MS);
                if (!imageRes.ok) throw new Error(`gpt-image-2 image fetch failed: ${imageRes.status}`);
                return Buffer.from(await imageRes.arrayBuffer());
            }
            throw new Error('gpt-image-2 response contained no image data');
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            if (attempt === GPT_IMAGE_2_CONFIG.maxAttempts) break;
            await delay(GPT_IMAGE_2_CONFIG.retryDelayMs * attempt);
        }
    }

    throw lastError ?? new Error('gpt-image-2 generation failed');
}
