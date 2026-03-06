import { NextRequest, NextResponse } from 'next/server';
import { getAssetBinary } from '@/lib/campaigns/media/media-store';

// ────────────────────────────────────────────────────────────────────────────
// GET /api/groups/campaign/[slug]/media/asset-data/[assetId]
//
// Serves binary assets stored in DynamoDB (Phase 2C fallback when R2 is
// not yet provisioned).  Once R2 is configured, asset URLs will point
// directly to the CDN and this route will no longer be called.
// ────────────────────────────────────────────────────────────────────────────

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ slug: string; assetId: string }> }
) {
    const { slug, assetId } = await params;

    try {
        const stored = await getAssetBinary(slug, assetId);

        if (!stored) {
            return NextResponse.json(
                { error: `No binary found for asset ${assetId} in campaign ${slug}` },
                { status: 404 }
            );
        }

        const buffer = Buffer.from(stored.bufferBase64, 'base64');
        const binaryBody = new Uint8Array(buffer);

        return new NextResponse(binaryBody, {
            status: 200,
            headers: {
                'Content-Type': stored.mimeType,
                'Content-Length': buffer.length.toString(),
                // Cache aggressively — asset content is immutable per assetId
                'Cache-Control': 'public, max-age=31536000, immutable',
            },
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
