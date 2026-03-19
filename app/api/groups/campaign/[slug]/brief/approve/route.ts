import { NextRequest, NextResponse } from 'next/server';
import { approveForMedia } from '@/lib/campaigns/brief-engine/orchestrator';

// POST /api/groups/campaign/[slug]/brief/approve
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ slug: string }> },
) {
    try {
        const { slug } = await params;
        const result = await approveForMedia(slug);
        return NextResponse.json(result, { status: 200 });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        const status = message.includes('Cannot approve') || message.includes('Launch window') ? 409 : 500;
        console.error('[brief-engine:approve]', error);
        return NextResponse.json({ error: message }, { status });
    }
}
