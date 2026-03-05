import { NextRequest, NextResponse } from 'next/server';
import { getAssetsByType } from '@/lib/campaigns/media/media-store';
import { AssetType, AssetTypeEnum } from '@/lib/campaigns/schema';

// ────────────────────────────────────────────────────────────────────────────
// GET /api/groups/campaign/[slug]/media/assets?type=hero_image
// Query assets by type. Returns AssetRecord[].
// ────────────────────────────────────────────────────────────────────────────

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ slug: string }> }
) {
    const { slug } = await params;
    const { searchParams } = new URL(request.url);
    const typeParam = searchParams.get('type');

    if (!typeParam) {
        return NextResponse.json(
            { error: 'Missing required query parameter: type' },
            { status: 400 }
        );
    }

    const parseResult = AssetTypeEnum.safeParse(typeParam);
    if (!parseResult.success) {
        return NextResponse.json(
            { error: `Invalid asset type: ${typeParam}`, validTypes: AssetTypeEnum.options },
            { status: 400 }
        );
    }

    try {
        const assets = await getAssetsByType(slug, parseResult.data);
        return NextResponse.json({ assets, count: assets.length });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
