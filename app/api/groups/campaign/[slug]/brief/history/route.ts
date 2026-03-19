import { NextRequest, NextResponse } from 'next/server';
import { getHistory } from '@/lib/campaigns/brief-engine/orchestrator';

// GET /api/groups/campaign/[slug]/brief/history
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ slug: string }> },
) {
    try {
        const { slug } = await params;
        const result = await getHistory(slug);
        return NextResponse.json(result, { status: 200 });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[brief-engine:history]', error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
