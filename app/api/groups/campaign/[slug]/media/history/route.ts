import { NextRequest, NextResponse } from 'next/server';
import { AssetTypeEnum } from '@/lib/campaigns/schema';
import { getOrphanedAssetsByType } from '@/lib/campaigns/media/media-store';
import { HISTORY_SUPPORTED_ASSET_TYPES } from '@/lib/campaigns/media/asset-manifest-section';

// ────────────────────────────────────────────────────────────────────────────
// GET /api/groups/campaign/[slug]/media/history?assetType={type}
//
// Returns asset records that exist in DynamoDB but are NOT referenced by the
// current manifest — i.e. previously generated assets orphaned by regeneration.
// Sorted newest-first. Excludes platform_crop (not restorable).
// ────────────────────────────────────────────────────────────────────────────

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ slug: string }> },
) {
    const { slug } = await params;
    const { searchParams } = new URL(request.url);
    const typeParam = searchParams.get('assetType');

    if (!typeParam) {
        return NextResponse.json(
            { error: 'Missing required query parameter: assetType', validTypes: HISTORY_SUPPORTED_ASSET_TYPES },
            { status: 400 },
        );
    }

    const parseResult = AssetTypeEnum.safeParse(typeParam);
    if (!parseResult.success) {
        return NextResponse.json(
            { error: `Invalid asset type: ${typeParam}`, validTypes: HISTORY_SUPPORTED_ASSET_TYPES },
            { status: 400 },
        );
    }

    if (parseResult.data === 'platform_crop') {
        return NextResponse.json(
            { error: 'platform_crop is not supported by the history endpoint.' },
            { status: 400 },
        );
    }

    try {
        const assets = await getOrphanedAssetsByType(slug, parseResult.data);
        return NextResponse.json({ assets, count: assets.length });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[media:history:GET]', err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
