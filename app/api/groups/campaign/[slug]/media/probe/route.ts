import { NextRequest, NextResponse } from 'next/server';
import { runProbeLoop } from '@/lib/campaigns/media/probe-engine';
import { saveProbeRunRecord, getLatestProbeRunRecord } from '@/lib/campaigns/media/media-store';

// ────────────────────────────────────────────────────────────────────────────
// POST /api/groups/campaign/[slug]/media/probe
// Generates one probe image per still spec, scores each with Claude vision,
// returns a ProbeRunRecord with aggregate verdict (approved / warn / blocked).
//
// GET /api/groups/campaign/[slug]/media/probe
// Returns the latest stored probe run record (404 if none exists).
// ────────────────────────────────────────────────────────────────────────────

export async function POST(
    _request: NextRequest,
    { params }: { params: Promise<{ slug: string }> },
) {
    const { slug } = await params;
    try {
        const record = await runProbeLoop(slug);
        await saveProbeRunRecord(slug, record);
        return NextResponse.json(record, { status: 200 });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[probe/route] Error running probe loop for ${slug}:`, message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ slug: string }> },
) {
    const { slug } = await params;
    try {
        const record = await getLatestProbeRunRecord(slug);
        if (!record) {
            return NextResponse.json({ error: 'No probe run found' }, { status: 404 });
        }
        return NextResponse.json(record, { status: 200 });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
