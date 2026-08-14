import { z } from 'zod/v3';
import { getAestheticBrief, getCampaignBlueprint } from '@/lib/campaigns/campaign-store';
import type { AssetRecord, SourceQualityMetadata } from '@/lib/campaigns/schema';
import {
    getMediaManifest,
    updateAssetRecord,
} from '@/lib/campaigns/media/media-store';
import { collectPhotoRealSourceAssets, lintVisualCompass } from '@/lib/campaigns/media/visual-compass-lint';
import {
    applyVisionVerifiedSourceQuality,
    computeSourceQualityForAsset,
} from '@/lib/campaigns/media/source-quality';
import { evaluateAssetVisualCompass } from '@/lib/campaigns/media/visual-compass-vision';

const VisualCompassPostSchema = z.object({
    assetIds: z.array(z.string().min(1)).optional(),
    maxAssets: z.number().int().min(1).max(25).default(8),
    dryRun: z.boolean().default(false),
});

function buildFallbackSourceQuality(asset: AssetRecord, brief: Awaited<ReturnType<typeof getAestheticBrief>>): SourceQualityMetadata {
    return asset.sourceQuality ?? computeSourceQualityForAsset({
        assetId: asset.assetId,
        promptUsed: asset.promptUsed,
        tags: asset.tags,
        brief,
        roleHint: asset.eligibilityRole,
    });
}

export async function handleGetVisualCompass(slug: string): Promise<{ status: number; data: unknown }> {
    const manifest = await getMediaManifest(slug);
    if (!manifest) {
        return { status: 404, data: { error: `No media manifest found for campaign ${slug}` } };
    }

    return {
        status: 200,
        data: {
            lint: lintVisualCompass(manifest),
        },
    };
}

export async function handlePostVisualCompass(slug: string, body: unknown): Promise<{ status: number; data: unknown }> {
    const parsed = VisualCompassPostSchema.safeParse(body);
    if (!parsed.success) {
        return { status: 400, data: { error: 'Invalid request body', issues: parsed.error.issues } };
    }

    const [campaign, brief, manifest] = await Promise.all([
        getCampaignBlueprint(slug),
        getAestheticBrief(slug),
        getMediaManifest(slug),
    ]);

    if (!campaign) return { status: 404, data: { error: `Campaign not found: ${slug}` } };
    if (!manifest) return { status: 404, data: { error: `No media manifest found for campaign ${slug}` } };

    const requestedIds = parsed.data.assetIds ? new Set(parsed.data.assetIds) : null;
    const sourceAssets = collectPhotoRealSourceAssets(manifest)
        .filter((asset) => !requestedIds || requestedIds.has(asset.assetId))
        .slice(0, parsed.data.maxAssets);

    const evaluated: Array<{
        assetId: string;
        sourceQuality: SourceQualityMetadata;
        preservedFeaturesReported?: string[];
        aiReasoning: string;
        persisted: boolean;
    }> = [];
    const failures: Array<{ assetId: string; error: string }> = [];

    for (const asset of sourceAssets) {
        try {
            const expectedFeatures = asset.preservedFeaturesReported ?? [];
            const result = await evaluateAssetVisualCompass(asset, {
                campaignName: campaign.name,
                themeName: brief?.themeName,
                expectedFeatures,
            });
            const sourceQuality = applyVisionVerifiedSourceQuality(
                buildFallbackSourceQuality(asset, brief),
                result,
            );
            const preservedFeaturesReported = expectedFeatures.length > 0
                ? result.preservedFeaturesReported ?? []
                : asset.preservedFeaturesReported;
            const updatedAsset: AssetRecord = {
                ...asset,
                sourceQuality,
                ...(preservedFeaturesReported !== undefined ? { preservedFeaturesReported } : {}),
            };

            if (!parsed.data.dryRun) {
                await updateAssetRecord(slug, updatedAsset);
            }

            evaluated.push({
                assetId: asset.assetId,
                sourceQuality,
                preservedFeaturesReported,
                aiReasoning: result.aiReasoning,
                persisted: !parsed.data.dryRun,
            });
        } catch (err) {
            failures.push({
                assetId: asset.assetId,
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }

    const nextManifest = parsed.data.dryRun ? manifest : await getMediaManifest(slug);

    return {
        status: failures.length > 0 && evaluated.length === 0 ? 502 : 200,
        data: {
            dryRun: parsed.data.dryRun,
            evaluatedCount: evaluated.length,
            failureCount: failures.length,
            evaluated,
            failures,
            lint: lintVisualCompass(nextManifest ?? manifest),
        },
    };
}
