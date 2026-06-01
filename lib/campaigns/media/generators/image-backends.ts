// lib/campaigns/media/generators/image-backends.ts
//
// Image-backend registry — the seam that makes multi-model generation possible
// without disturbing the single-model flow. Each backend exposes a uniform
// generate(prompt, { aspect }) → Buffer. Today: Gemini (Nano-Banana, primary)
// and OpenAI gpt-image-2. Add a model later by registering one more object.
//
// `generateVariants` runs a prompt across N backends SEQUENTIALLY (respects
// gpt-image-2's low rate limit) with per-backend error isolation: one model
// failing never sinks the others.

import type { GeneratorService } from '@/lib/campaigns/schema';
import { NANO_BANANA_CONFIG } from '../media-pipeline-config';
import { generateNanoBananaImage } from './stability-generator';
import { generateGptImage2, type GptImageAspect } from './gpt-image';

export type ImageAspect = GptImageAspect; // '1:1' | '16:9' | '9:16'

export interface ImageBackend {
    id: GeneratorService;
    label: string;
    /** True when the backend's API key/env is present. */
    isAvailable(): boolean;
    generate(prompt: string, opts: { aspect: ImageAspect }): Promise<Buffer>;
}

// ── Gemini / Nano-Banana (primary) ────────────────────────────────────────────
// NOTE: Nano-Banana's typed config only carries '16:9' and '1:1'. '9:16' is
// collapsed to '1:1' for now (the flyer pilot is 1:1 only); broaden when a 9:16
// section goes multi-model.
const geminiBackend: ImageBackend = {
    id: 'gemini3_flash',
    label: 'Gemini 3 Flash',
    isAvailable: () => Boolean(process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY),
    generate: (prompt, { aspect }) =>
        generateNanoBananaImage(
            prompt,
            aspect === '16:9' ? NANO_BANANA_CONFIG.heroAspectRatio : NANO_BANANA_CONFIG.conceptAspectRatio,
            NANO_BANANA_CONFIG.heroImageSize,
        ),
};

// ── OpenAI gpt-image-2 ────────────────────────────────────────────────────────
const gptImage2Backend: ImageBackend = {
    id: 'gpt_image_2',
    label: 'GPT Image 2',
    isAvailable: () => Boolean(process.env.OPENAI_API_KEY),
    generate: (prompt, { aspect }) => generateGptImage2(prompt, { aspect }),
};

// Registry order = priority. The first entry is the default "primary"/canonical
// backend when no model-version selection is saved.
export const IMAGE_BACKENDS: readonly ImageBackend[] = [geminiBackend, gptImage2Backend];

export function getImageBackend(id: GeneratorService): ImageBackend | undefined {
    return IMAGE_BACKENDS.find((b) => b.id === id);
}

export function getPrimaryImageBackend(): ImageBackend {
    return IMAGE_BACKENDS[0];
}

/**
 * Resolve the backends to actually generate with.
 * @param requestedIds optional explicit set (e.g. from flyerControls.models).
 *        When omitted, defaults to the primary backend only — preserving the
 *        single-model flow. Always filtered to available (key present) backends,
 *        in registry/priority order.
 */
export function getActiveImageBackends(requestedIds?: GeneratorService[]): ImageBackend[] {
    const wanted = requestedIds && requestedIds.length > 0
        ? new Set(requestedIds)
        : new Set<GeneratorService>([getPrimaryImageBackend().id]);
    const active = IMAGE_BACKENDS.filter((b) => wanted.has(b.id) && b.isAvailable());
    // Never return an empty set — fall back to the primary if it's available.
    if (active.length === 0 && getPrimaryImageBackend().isAvailable()) {
        return [getPrimaryImageBackend()];
    }
    return active;
}

export interface ImageVariant {
    generator: GeneratorService;
    buffer: Buffer;
}

export interface GenerateVariantsResult {
    variants: ImageVariant[];
    errors: string[];
}

/**
 * Run one prompt across the given backends, sequentially, isolating failures.
 * Returns every successful variant plus a list of per-backend error strings.
 */
export async function generateVariants(
    prompt: string,
    opts: { aspect: ImageAspect },
    backends: ImageBackend[],
): Promise<GenerateVariantsResult> {
    const variants: ImageVariant[] = [];
    const errors: string[] = [];
    for (const backend of backends) {
        try {
            const buffer = await backend.generate(prompt, opts);
            variants.push({ generator: backend.id, buffer });
        } catch (err) {
            errors.push(`[${backend.id}] ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    return { variants, errors };
}
