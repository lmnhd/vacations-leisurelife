import { NextRequest, NextResponse } from 'next/server';
import { runMediaGeneration, isGenerating, GenerationOptions, MediaReadinessError, ProductionBuildLintError } from '@/lib/campaigns/media/media-orchestrator';
import { resolveVideoModelPresetIdFromRequest } from '@/lib/campaigns/media/video-model-preference';
import { PRODUCTION_ALL_MEDIA_ASSET_TYPES } from '@/lib/campaigns/media/default-asset-types';
import { AssetType, AssetTypeEnum } from '@/lib/campaigns/schema';
import { AestheticBriefNotReadyError } from '@/lib/campaigns/aesthetic-red-team';

// ────────────────────────────────────────────────────────────────────────────
// POST /api/groups/campaign/[slug]/media/generate
// Triggers the full media generation pipeline for a campaign.
// Body (optional): { assetTypes?: AssetType[]; forceRegenerateAssetTypes?: AssetType[]; storyboardDeliverableIds?: string[] }
// Returns: GenerationResult with job summary and manifest.
// 409 if generation already in progress for this campaign.
// ────────────────────────────────────────────────────────────────────────────

interface GenerateRequestBody {
    assetTypes?: AssetType[];
    forceRegenerateAssetTypes?: AssetType[];
    themeMusicSource?: 'replicate' | 'default';
    sceneImageMode?: 'all' | 'missing_only';
    storyboardDeliverableIds?: string[];
    videoModelPresetId?: string;
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ slug: string }> }
) {
    const { slug } = await params;

    if (isGenerating(slug)) {
        return NextResponse.json(
            { error: `Media generation already in progress for ${slug}` },
            { status: 409 }
        );
    }

    let options: GenerationOptions = {
        assetTypes: [...PRODUCTION_ALL_MEDIA_ASSET_TYPES],
        videoModelPresetId: await resolveVideoModelPresetIdFromRequest(request),
    };

    try {
        const body = await request.json() as GenerateRequestBody;
        if (body.assetTypes && Array.isArray(body.assetTypes)) {
            // Validate each asset type
            const validTypes = body.assetTypes.filter(at => {
                const result = AssetTypeEnum.safeParse(at);
                return result.success;
            });
            if (validTypes.length > 0) {
                options.assetTypes = validTypes;
            }
        }
        if (body.forceRegenerateAssetTypes && Array.isArray(body.forceRegenerateAssetTypes)) {
            const validForceTypes = body.forceRegenerateAssetTypes.filter(at => {
                const result = AssetTypeEnum.safeParse(at);
                return result.success;
            });
            if (validForceTypes.length > 0) {
                options.forceRegenerateAssetTypes = validForceTypes;
            }
        }
        if (body.themeMusicSource === 'replicate' || body.themeMusicSource === 'default') {
            options.themeMusicSource = body.themeMusicSource;
        }
        if (body.sceneImageMode === 'all' || body.sceneImageMode === 'missing_only') {
            options.sceneImageMode = body.sceneImageMode;
        }
        if (body.storyboardDeliverableIds && Array.isArray(body.storyboardDeliverableIds)) {
            const validDeliverableIds = body.storyboardDeliverableIds
                .filter((deliverableId): deliverableId is string => typeof deliverableId === 'string')
                .map((deliverableId) => deliverableId.trim())
                .filter(Boolean);
            if (validDeliverableIds.length > 0) {
                options.storyboardDeliverableIds = validDeliverableIds;
            }
        }
        options.videoModelPresetId = await resolveVideoModelPresetIdFromRequest(request, body.videoModelPresetId);
    } catch {
        // No body or invalid JSON — run the curated production all-media bundle.
    }

    try {
        const result = await runMediaGeneration(slug, options);

        return NextResponse.json({
            message: `Media generation ${result.manifest.completionStatus} for ${slug}`,
            slug: result.slug,
            totalAssets: result.manifest.totalAssets,
            completionStatus: result.manifest.completionStatus,
            jobSummary: result.jobSummary,
        });
    } catch (err) {
        if (err instanceof AestheticBriefNotReadyError || err instanceof MediaReadinessError) {
            return NextResponse.json(
                { error: err.message, code: err.code },
                { status: 422 }
            );
        }
        if (err instanceof ProductionBuildLintError) {
            return NextResponse.json(
                { error: err.message, code: err.code },
                { status: 422 }
            );
        }
        const message = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
