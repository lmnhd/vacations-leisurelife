import type { AssetRecord, CampaignAestheticBrief, GeneratorService } from '../../schema';
import type { Campaign } from '../../types';
import { DESIGNED_MEDIA_CONFIG } from '../media-pipeline-config';
import { storeAsset } from '../storage-client';
import { getMediaManifest, saveAssetRecord } from '../media-store';
import { generateImageFromPrompt } from './stability-generator';
import { getActiveImageBackends } from './image-backends';
import { generateGptImage2 } from './gpt-image';
import { PRIMARY_IMAGE_BACKEND_ID } from './image-backend-meta';
import { extractNicheTokens } from '../../design-system/niche-tokens';
import { buildDocumentaryDetailSpecs } from '../../design-system/documentary-prompts';
import { buildDesignedAdRenderSpecs, renderDesignedAdArtifact } from '../../design-system/ad-templates';
import type { AdArtifactGenerationResult } from '../../design-system/types';

function makeRecord(input: {
    assetId: string;
    assetType: AssetRecord['assetType'];
    url: string;
    generator: AssetRecord['generator'];
    promptUsed: string;
    buffer: Buffer;
    mimeType: string;
    tags: string[];
    dimensions?: { width: number; height: number };
    sourceImageUrl?: string;
    variantGroupId?: string;
}): AssetRecord {
    return {
        assetId: input.assetId,
        assetType: input.assetType,
        url: input.url,
        generator: input.generator,
        promptUsed: input.promptUsed,
        fileSizeBytes: input.buffer.length,
        mimeType: input.mimeType,
        tags: input.tags,
        createdAt: new Date().toISOString(),
        reviewStatus: 'needs_review',
        version: 1,
        active: true,
        ...(input.dimensions ? { dimensions: input.dimensions } : {}),
        ...(input.sourceImageUrl ? { sourceImageUrl: input.sourceImageUrl } : {}),
        ...(input.variantGroupId ? { variantGroupId: input.variantGroupId } : {}),
    };
}

async function storeGeneratedRecord(
    slug: string,
    input: Omit<Parameters<typeof makeRecord>[0], 'url'> & { fileName: string },
): Promise<AssetRecord> {
    const url = await storeAsset(slug, input.assetId, input.fileName, input.buffer, input.mimeType);
    const record = makeRecord({ ...input, url });
    await saveAssetRecord(slug, record);
    return record;
}

// MULTI_MODEL_IMAGES (Phase F): produce one buffer per active backend for a
// documentary-detail prompt. Documentary details are text-to-image only, so
// every backend (Gemini via generateImageFromPrompt, gpt-image-2 text-only)
// runs the same prompt. Failures are isolated per backend.
async function generateDocumentaryDetailVariants(
    prompt: string,
    models?: GeneratorService[],
): Promise<{
    variants: Array<{ generator: GeneratorService; buffer: Buffer }>;
    errors: string[];
}> {
    const backends = getActiveImageBackends(models);
    const variants: Array<{ generator: GeneratorService; buffer: Buffer }> = [];
    const errors: string[] = [];
    for (const backend of backends) {
        try {
            const buffer = backend.id === 'gemini3_flash'
                ? await generateImageFromPrompt(prompt)
                : await generateGptImage2(prompt, { aspect: '16:9' });
            variants.push({ generator: backend.id, buffer });
        } catch (err) {
            errors.push(`[${backend.id}] ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    return { variants, errors };
}

export async function generateDesignedAdArtifactPack(
    slug: string,
    brief: CampaignAestheticBrief,
    campaign: Campaign | null,
    options: { includeDesignedAds?: boolean; models?: GeneratorService[] } = {},
): Promise<AdArtifactGenerationResult> {
    const existingManifest = await getMediaManifest(slug);
    const tokens = extractNicheTokens(brief, campaign);
    const detailSpecs = buildDocumentaryDetailSpecs(
        brief,
        campaign,
        tokens,
        DESIGNED_MEDIA_CONFIG.documentaryDetailBudget,
    );

    // documentaryDetails returns ALL model-versions (each variant record). The
    // designed-ad source set, however, must use exactly ONE canonical version
    // per logical detail, so we track the primary record/buffer separately and
    // feed only those into buildDesignedAdRenderSpecs below.
    const documentaryDetails: AssetRecord[] = [];
    const canonicalDetails: AssetRecord[] = [];
    const sourceBuffers = new Map<string, Buffer>();
    for (const spec of detailSpecs) {
        const variantGroupId = spec.assetId;
        const { variants, errors } = await generateDocumentaryDetailVariants(spec.prompt, options.models);
        if (errors.length > 0) {
            console.warn(`[ad-artifact-generator] documentary detail ${variantGroupId} backend warnings: ${errors.join(' | ')}`);
        }
        for (const variant of variants) {
            const isPrimary = variant.generator === PRIMARY_IMAGE_BACKEND_ID;
            // Suffix multi-model variant ids/paths; keep the legacy id when a
            // single backend runs so existing assets and bindings are stable.
            const isMultiModel = variants.length > 1;
            const assetId = isMultiModel ? `${variantGroupId}__${variant.generator}` : spec.assetId;
            const fileName = isMultiModel
                ? spec.fileName.replace(/(\.[a-z0-9]+)$/i, `__${variant.generator}$1`)
                : spec.fileName;
            const record = await storeGeneratedRecord(slug, {
                assetId,
                assetType: 'documentary_detail_image',
                generator: variant.generator,
                promptUsed: spec.prompt,
                buffer: variant.buffer,
                fileName,
                mimeType: 'image/png',
                tags: ['documentary_detail', spec.kind, 'image_module'],
                dimensions: { width: 1920, height: 1080 },
                ...(isMultiModel ? { variantGroupId } : {}),
            });
            documentaryDetails.push(record);
            // Only the canonical (primary, or sole) variant seeds designed ads.
            if (isPrimary || variants.length === 1) {
                canonicalDetails.push(record);
                sourceBuffers.set(record.assetId, variant.buffer);
            }
        }
    }

    const designedAds: AssetRecord[] = [];
    if (options.includeDesignedAds !== false) {
        const adFormatBias = brief.identityBlueprint?.adFormatBias ?? [];
        const trustImages = (existingManifest?.images.shipReferences ?? []).filter((record) => record.active && !!record.url);
        for (const spec of buildDesignedAdRenderSpecs(tokens, adFormatBias, canonicalDetails, trustImages)) {
            let sourceBuffer: Buffer | undefined;
            if (spec.sourceImage) {
                sourceBuffer = sourceBuffers.get(spec.sourceImage.assetId);
                if (!sourceBuffer && spec.sourceImage.url) {
                    const response = await fetch(spec.sourceImage.url);
                    if (response.ok) {
                        sourceBuffer = Buffer.from(await response.arrayBuffer());
                        sourceBuffers.set(spec.sourceImage.assetId, sourceBuffer);
                    }
                }
            }

            const buffer = await renderDesignedAdArtifact(spec, tokens, sourceBuffer);
            const record = await storeGeneratedRecord(slug, {
                assetId: spec.assetId,
                assetType: 'designed_ad_artifact',
                generator: 'sharp',
                promptUsed: `Rendered ${spec.kind} from deterministic designed-media template. Source image: ${spec.sourceImage?.assetId ?? 'none'}`,
                buffer,
                fileName: spec.fileName,
                mimeType: 'image/png',
                tags: [...spec.tags, tokens.system],
                dimensions: { width: spec.width, height: spec.height },
                sourceImageUrl: spec.sourceImage?.url,
            });
            designedAds.push(record);
        }
    }

    return { documentaryDetails, designedAds, tokens };
}

export async function generateLegacyPremiumDisplayAd(
    slug: string,
    brief: CampaignAestheticBrief,
    campaign: Campaign | null,
    sourceImages: readonly AssetRecord[],
    trustImages: readonly AssetRecord[] = [],
): Promise<AssetRecord[]> {
    const tokens = extractNicheTokens(brief, campaign);
    const spec = buildDesignedAdRenderSpecs(
        tokens,
        ['image_detail'],
        sourceImages,
        trustImages,
        brief,
    ).find((candidate) => candidate.kind === 'image_detail_ad');

    if (!spec) {
        return [];
    }

    let sourceBuffer: Buffer | undefined;
    if (spec.sourceImage?.url) {
        const response = await fetch(spec.sourceImage.url);
        if (response.ok) {
            sourceBuffer = Buffer.from(await response.arrayBuffer());
        }
    }

    const buffer = await renderDesignedAdArtifact(spec, tokens, sourceBuffer);
    const record = await storeGeneratedRecord(slug, {
        assetId: spec.assetId,
        assetType: 'designed_ad_artifact',
        generator: 'sharp',
        promptUsed: `Rendered preserved legacy premium display template (${spec.kind}). Source image: ${spec.sourceImage?.assetId ?? 'none'}`,
        buffer,
        fileName: spec.fileName,
        mimeType: 'image/png',
        tags: [...spec.tags, tokens.system, 'legacy_premium_display', 'preserved_template'],
        dimensions: { width: spec.width, height: spec.height },
        sourceImageUrl: spec.sourceImage?.url,
    });

    return [record];
}
