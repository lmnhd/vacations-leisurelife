import type { AssetRecord, CampaignAestheticBrief } from '../../schema';
import type { Campaign } from '../../types';
import { DESIGNED_MEDIA_CONFIG, getMediaImageGeneratorService } from '../media-pipeline-config';
import { storeAsset } from '../storage-client';
import { saveAssetRecord } from '../media-store';
import { generateImageFromPrompt } from './stability-generator';
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

export async function generateDesignedAdArtifactPack(
    slug: string,
    brief: CampaignAestheticBrief,
    campaign: Campaign | null,
): Promise<AdArtifactGenerationResult> {
    const tokens = extractNicheTokens(brief, campaign);
    const detailSpecs = buildDocumentaryDetailSpecs(
        brief,
        campaign,
        tokens,
        DESIGNED_MEDIA_CONFIG.documentaryDetailBudget,
    );

    const documentaryDetails: AssetRecord[] = [];
    const sourceBuffers = new Map<string, Buffer>();
    for (const spec of detailSpecs) {
        const buffer = await generateImageFromPrompt(spec.prompt);
        const record = await storeGeneratedRecord(slug, {
            assetId: spec.assetId,
            assetType: 'documentary_detail_image',
            generator: getMediaImageGeneratorService(),
            promptUsed: spec.prompt,
            buffer,
            fileName: spec.fileName,
            mimeType: 'image/png',
            tags: ['documentary_detail', spec.kind, 'image_module'],
            dimensions: { width: 1920, height: 1080 },
        });
        documentaryDetails.push(record);
        sourceBuffers.set(record.assetId, buffer);
    }

    const designedAds: AssetRecord[] = [];
    const adFormatBias = brief.identityBlueprint?.adFormatBias ?? [];
    for (const spec of buildDesignedAdRenderSpecs(tokens, adFormatBias, documentaryDetails)) {
        let sourceBuffer: Buffer | undefined;
        if (spec.sourceImage) {
            sourceBuffer = sourceBuffers.get(spec.sourceImage.assetId);
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

    return { documentaryDetails, designedAds, tokens };
}
