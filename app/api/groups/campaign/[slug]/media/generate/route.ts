import { NextRequest, NextResponse } from 'next/server';
import { runMediaGeneration, isGenerating, GenerationOptions } from '@/lib/campaigns/media/media-orchestrator';
import { AssetType, AssetTypeEnum } from '@/lib/campaigns/schema';

// ────────────────────────────────────────────────────────────────────────────
// POST /api/groups/campaign/[slug]/media/generate
// Triggers the full media generation pipeline for a campaign.
// Body (optional): { assetTypes?: AssetType[] }
// Returns: GenerationResult with job summary and manifest.
// 409 if generation already in progress for this campaign.
// ────────────────────────────────────────────────────────────────────────────

interface GenerateRequestBody {
    assetTypes?: AssetType[];
    themeMusicSource?: 'replicate' | 'default';
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

    let options: GenerationOptions = {};

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
        if (body.themeMusicSource === 'replicate' || body.themeMusicSource === 'default') {
            options.themeMusicSource = body.themeMusicSource;
        }
    } catch {
        // No body or invalid JSON — run everything
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
        const message = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
