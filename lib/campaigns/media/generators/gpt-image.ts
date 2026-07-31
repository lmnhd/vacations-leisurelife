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
import { normalizeReferenceImage, type NormalizedReferenceImage } from './reference-image';

const REQUEST_TIMEOUT_MS = 120_000;
const EDITS_ENDPOINT = '/images/edits';

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

// ────────────────────────────────────────────────────────────────────────────
// Reference-conditioned generation (images/edits)
//
// Contract verified directly against the live API on 2026-07-30 — these are
// measured facts, not doc claims (same discipline as the dated `quality` enum
// note in media-pipeline-config.ts):
//
//   • Multiple references work. Repeat the `image[]` multipart field once per
//     reference; 1 part → 200 and 2 parts → 200.
//   • The response carries `b64_json` only. Unlike images/generations there is
//     no `url` variant to fall back on.
//   • `input_fidelity` is REJECTED for gpt-image-2:
//       400 invalid_input_fidelity_model — "The model 'gpt-image-2' does not
//       support the 'input_fidelity' parameter."
//     Never add it back for this model.
//   • Tiny inputs (a 4x4 PNG) fail as 400 invalid_image_file, so every
//     reference goes through normalizeReferenceImage first.
// ────────────────────────────────────────────────────────────────────────────

export type GptImageReferenceMode = 'new_variation' | 'edit_current';

export interface GptImageReferenceInput {
    buffer: Buffer;
    mimeType: string;
    /** Operator-facing label, used only for error messages. */
    label?: string;
}

export interface GptImageWithReferencesOptions extends GptImageOptions {
    prompt: string;
    /**
     * Ordered references. For `edit_current` the caller puts the image being
     * edited first — the API treats the leading part as the primary image.
     */
    references: GptImageReferenceInput[];
    mode: GptImageReferenceMode;
}

/**
 * Generate an image informed by one or more reference images.
 *
 * This is NOT pixel editing: gpt-image-2 produces a new composition informed by
 * the references. It makes no promise of exact layout, object, or brand
 * consistency, so callers must not present the output as supplier photography.
 *
 * @throws if the API key is missing, no reference survives normalization, or
 *         every attempt fails.
 */
export async function generateGptImage2WithReferences(
    opts: GptImageWithReferencesOptions,
): Promise<Buffer> {
    const aspect = opts.aspect ?? '1:1';
    const size = GPT_IMAGE_2_CONFIG.sizeForAspect[aspect] ?? GPT_IMAGE_2_CONFIG.sizeForAspect['1:1'];
    const quality = opts.quality ?? GPT_IMAGE_2_CONFIG.quality;

    // Normalize up front so an oversized or exotic source can't turn into an
    // opaque invalid_image_file after the retry loop has already burned time.
    const normalized: NormalizedReferenceImage[] = [];
    for (const reference of opts.references) {
        const usable = await normalizeReferenceImage(reference.buffer, reference.mimeType);
        if (usable) {
            normalized.push(usable);
        } else {
            console.warn('[gpt-image] dropping unusable reference', {
                label: reference.label,
                mimeType: reference.mimeType,
            });
        }
    }

    if (normalized.length === 0) {
        throw new Error(
            'gpt-image-2 reference generation requires at least one usable reference image; all supplied references failed normalization.',
        );
    }

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= GPT_IMAGE_2_CONFIG.maxAttempts; attempt += 1) {
        try {
            // Rebuilt per attempt: a FormData carrying Blob parts is not safely
            // reusable across retries.
            const form = new FormData();
            form.append('model', GPT_IMAGE_2_CONFIG.model);
            form.append('prompt', opts.prompt);
            form.append('size', size);
            form.append('quality', quality);
            form.append('n', '1');
            normalized.forEach((reference, index) => {
                const extension = reference.mimeType === 'image/png' ? 'png' : 'jpg';
                form.append(
                    'image[]',
                    new Blob([new Uint8Array(reference.buffer)], { type: reference.mimeType }),
                    `reference-${index}.${extension}`,
                );
            });

            const response = await fetchWithTimeout(
                `${GPT_IMAGE_2_CONFIG.apiBase}${EDITS_ENDPOINT}`,
                {
                    method: 'POST',
                    // No Content-Type header — fetch sets the multipart boundary.
                    headers: { Authorization: `Bearer ${getApiKey()}` },
                    body: form,
                },
                REQUEST_TIMEOUT_MS,
            );

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`gpt-image-2 edits error ${response.status}: ${errorText}`);
            }

            const payload = await response.json() as {
                data?: Array<{ b64_json?: string; url?: string }>;
            };
            const first = payload.data?.[0];
            if (first?.b64_json) {
                return Buffer.from(first.b64_json, 'base64');
            }
            // Defensive: the edits path returned only b64_json when probed, but
            // accept a url if the API ever adds one rather than failing hard.
            if (first?.url) {
                const imageRes = await fetchWithTimeout(first.url, {}, REQUEST_TIMEOUT_MS);
                if (!imageRes.ok) throw new Error(`gpt-image-2 image fetch failed: ${imageRes.status}`);
                return Buffer.from(await imageRes.arrayBuffer());
            }
            throw new Error('gpt-image-2 edits response contained no image data');
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            if (attempt === GPT_IMAGE_2_CONFIG.maxAttempts) break;
            await delay(GPT_IMAGE_2_CONFIG.retryDelayMs * attempt);
        }
    }

    throw lastError ?? new Error('gpt-image-2 reference generation failed');
}
