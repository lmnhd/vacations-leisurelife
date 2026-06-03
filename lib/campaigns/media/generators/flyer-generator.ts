// lib/campaigns/media/generators/flyer-generator.ts
//
// Server-side flyer-image generation. Builds prompts via the pure ./flyer-prompt
// model and runs them through the shared Nano-Banana image call. Generated at
// 1:1 so a flyer covers the square single-image ad formats cleanly
// (landscape/portrait center-crop acceptably).
//
// Two entry points:
//   • generateFlyerRenditions — full control, returns buffers + the exact prompt
//     used per rendition. Used by the /tests/flyer-lab sandbox endpoint.
//   • generateFlyerImages — pipeline adapter returning GeneratedImage[] for the
//     orchestrator to upload + record.
//
// NOTE: this module imposes no default negations/axes. Callers pass what they
// want (the sandbox seeds DEFAULT_FLYER_* and lets the operator tune them).

import type { GeneratorService } from '@/lib/campaigns/schema';
import { type GeneratedImage } from './stability-generator';
import { buildFlyerPrompt } from './flyer-prompt';
import { getActiveImageBackends, generateVariants } from './image-backends';

export interface GenerateFlyerOptions {
    /** Number of renditions. Defaults to axes.length (or 1 if no axes). */
    count?: number;
    /** Optional base prompt template. Use {slug} where the campaign slug should appear. */
    basePromptTemplate?: string;
    /** Enabled brief-anchor texts. */
    anchors?: string[];
    /** Optional ultra-specific niche detail to bias the image stronger. */
    nicheHint?: string;
    /** Optional callout texts for in-image text boxes. */
    talkingPoints?: string[];
    /** Per-rendition variation axes. Empty ⇒ no rendition direction (slug-only). */
    axes?: string[];
    /** Negation rule texts. Empty ⇒ no "Avoid:" clause. */
    negations?: string[];
    /** Free-text steering note applied to every rendition (on-the-fly regen). */
    steer?: string;
    /** Active image models. Omitted/empty ⇒ primary backend only (single-model). */
    models?: GeneratorService[];
}

export interface FlyerRendition {
    axis: string | null;
    prompt: string;
    variants: Array<{
        generator: GeneratorService;
        buffer: Buffer;
    }>;
}

export interface GenerateFlyerRenditionsResult {
    renditions: FlyerRendition[];
    /** Per-backend failures (one model failing never sinks the others). */
    warnings: string[];
}

export async function generateFlyerRenditions(
    slug: string,
    opts: GenerateFlyerOptions = {},
): Promise<GenerateFlyerRenditionsResult> {
    const axes = opts.axes ?? [];
    const negations = opts.negations ?? [];
    const anchors = opts.anchors ?? [];
    const count = opts.count ?? (axes.length || 1);
    const backends = getActiveImageBackends(opts.models);

    const results: FlyerRendition[] = [];
    const warnings: string[] = [];
    if (backends.length === 0) {
        warnings.push('No requested image model is available in this environment.');
    }
    for (let i = 0; i < count; i += 1) {
        const axis = axes.length ? axes[i % axes.length] : null;
        const prompt = buildFlyerPrompt(slug, {
            basePromptTemplate: opts.basePromptTemplate,
            anchors,
            nicheHint: opts.nicheHint,
            talkingPoints: opts.talkingPoints,
            axis: axis ?? undefined,
            negations,
            steer: opts.steer,
        });
        const variantGroupId = `rendition_${String(i + 1).padStart(3, '0')}`;
        const { variants, errors } = await generateVariants(prompt, { aspect: '1:1' }, backends);
        warnings.push(...errors.map((e) => `${variantGroupId}: ${e}`));
        results.push({
            axis,
            prompt,
            variants: variants.map((v) => ({
                generator: v.generator,
                buffer: v.buffer,
            })),
        });
    }
    return { renditions: results, warnings };
}

/** A flyer image plus the model that produced it and its variant group. */
export interface FlyerGeneratedImage extends GeneratedImage {
    generator: GeneratorService;
    variantGroupId: string;
}

export interface GenerateFlyerImagesResult {
    images: FlyerGeneratedImage[];
    /** Per-backend failures (one model failing never sinks the others). */
    warnings: string[];
}

/**
 * Pipeline adapter — MULTI-MODEL. For each rendition (axis) it sends the SAME
 * prompt to every active backend and emits one image per (axis × backend). All
 * model-versions of a rendition share `variantGroupId = flyer_NNN`; assetIds and
 * R2 paths are suffixed with the generator so they never collide. With one active
 * backend this is identical to the old single-model output (single-member groups).
 */
export async function generateFlyerImages(
    slug: string,
    opts: GenerateFlyerOptions = {},
): Promise<GenerateFlyerImagesResult> {
    const axes = opts.axes ?? [];
    const negations = opts.negations ?? [];
    const anchors = opts.anchors ?? [];
    const count = opts.count ?? (axes.length || 1);
    const backends = getActiveImageBackends(opts.models);

    const images: FlyerGeneratedImage[] = [];
    const warnings: string[] = [];

    for (let i = 0; i < count; i += 1) {
        const axis = axes.length ? axes[i % axes.length] : null;
        const prompt = buildFlyerPrompt(slug, {
            basePromptTemplate: opts.basePromptTemplate,
            anchors,
            nicheHint: opts.nicheHint,
            talkingPoints: opts.talkingPoints,
            axis: axis ?? undefined,
            negations,
            steer: opts.steer,
        });
        const variantGroupId = `flyer_${String(i + 1).padStart(3, '0')}`;
        const { variants, errors } = await generateVariants(prompt, { aspect: '1:1' }, backends);
        warnings.push(...errors.map((e) => `${variantGroupId}: ${e}`));
        for (const v of variants) {
            images.push({
                buffer: v.buffer,
                prompt,
                filterId: null,
                assetId: `${variantGroupId}__${v.generator}`,
                fileName: `flyers/${variantGroupId}__${v.generator}.png`,
                generator: v.generator,
                variantGroupId,
            });
        }
    }

    return { images, warnings };
}
