import { NextRequest, NextResponse } from 'next/server';
import { getMediaManifest } from '@/lib/campaigns/media/media-store';

// ────────────────────────────────────────────────────────────────────────────
// GET /api/groups/campaign/[slug]/media/manifest
// Returns the CampaignMediaManifest for a campaign.
// 404 if no manifest has been generated.
// ────────────────────────────────────────────────────────────────────────────

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ slug: string }> }
) {
    const { slug } = await params;

    try {
        const manifest = await getMediaManifest(slug);

        if (!manifest) {
            return NextResponse.json(
                { error: `No media manifest found for campaign ${slug}` },
                { status: 404 }
            );
        }

        return NextResponse.json(manifest);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
