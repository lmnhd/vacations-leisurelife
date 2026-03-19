import { NextRequest, NextResponse } from 'next/server';
import { createOrRefreshBrief, applyStructuredRevision } from '@/lib/campaigns/brief-engine/orchestrator';
import type { RevisionInput } from '@/lib/campaigns/brief-engine/orchestrator';

// POST /api/groups/campaign/[slug]/brief — create_or_refresh_brief
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ slug: string }> },
) {
    try {
        const { slug } = await params;
        const body = await req.json().catch(() => ({})) as { instructions?: string };
        const result = await createOrRefreshBrief(slug, { instructions: body.instructions });
        return NextResponse.json(result, { status: 200 });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[brief-engine:POST]', error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

// PATCH /api/groups/campaign/[slug]/brief — apply_structured_revision
export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ slug: string }> },
) {
    try {
        const { slug } = await params;
        const body = await req.json() as RevisionInput;
        const result = await applyStructuredRevision(slug, body);
        return NextResponse.json(result, { status: 200 });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[brief-engine:PATCH]', error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
