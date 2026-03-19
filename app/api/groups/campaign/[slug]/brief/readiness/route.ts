import { NextRequest, NextResponse } from 'next/server';
import { getReadiness } from '@/lib/campaigns/brief-engine/orchestrator';

// GET /api/groups/campaign/[slug]/brief/readiness
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ slug: string }> },
) {
    try {
        const { slug } = await params;
        const result = await getReadiness(slug);
        return NextResponse.json(result, { status: 200 });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[brief-engine:readiness]', error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
