import { z } from 'zod';
import { AssetCurationSchema, ImageContextEnum } from '@/lib/campaigns/schema';
import { getActiveAssetRecord, updateAssetCuration } from '@/lib/campaigns/media/media-store';
import { normalizeAssetCuration } from '@/lib/campaigns/media/image-selection';

const AssetCurationPatchRequestSchema = z.object({
    assetId: z.string().min(1),
    approvalState: z.enum(['pending_review', 'auto_approved', 'human_approved', 'rejected', 'revision_required', 'hold']).optional(),
    globalPriority: z.number().int().min(0).max(100).optional(),
    contextPriorities: z.record(z.string(), z.number().int().min(0).max(100)).optional(),
    approvedContexts: z.array(ImageContextEnum).optional(),
    blockedContexts: z.array(ImageContextEnum).optional(),
    suitabilityTags: z.array(z.string()).optional(),
    antiTags: z.array(z.string()).optional(),
    downstreamLocked: z.boolean().optional(),
    curatorNotes: z.string().max(2000).optional(),
});

export async function handleGetAssetCuration(slug: string, assetId: string): Promise<{ status: number; data: unknown }> {
    const asset = await getActiveAssetRecord(slug, assetId);
    if (!asset) {
        return { status: 404, data: { error: `Asset not found: ${assetId}` } };
    }

    return {
        status: 200,
        data: {
            assetId: asset.assetId,
            curation: normalizeAssetCuration(asset),
        },
    };
}

export async function handlePatchAssetCuration(slug: string, body: unknown): Promise<{ status: number; data: unknown }> {
    const parsed = AssetCurationPatchRequestSchema.safeParse(body);
    if (!parsed.success) {
        return { status: 400, data: { error: 'Invalid request body', issues: parsed.error.issues } };
    }

    const existingAsset = await getActiveAssetRecord(slug, parsed.data.assetId);
    if (!existingAsset) {
        return { status: 404, data: { error: `Asset not found: ${parsed.data.assetId}` } };
    }

    const mergedCuration = AssetCurationSchema.parse({
        ...normalizeAssetCuration(existingAsset),
        ...parsed.data,
        updatedAt: new Date().toISOString(),
    });

    const updatedAsset = await updateAssetCuration(slug, existingAsset.assetId, mergedCuration);

    return {
        status: 200,
        data: {
            asset: updatedAsset,
        },
    };
}
