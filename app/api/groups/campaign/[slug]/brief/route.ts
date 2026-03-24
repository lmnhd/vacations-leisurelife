import { NextRequest, NextResponse } from 'next/server';
import { createOrRefreshBrief, applyStructuredRevision, getBriefTimingSnapshot } from '@/lib/campaigns/brief-engine/orchestrator';
import type { RevisionInput } from '@/lib/campaigns/brief-engine/orchestrator';

// Hard server-side timeout for brief generation (ms).
// Brief generation is a multi-stage LLM pipeline; 5 minutes is the outer wall.
const BRIEF_GENERATION_TIMEOUT_MS = 5 * 60 * 1000;

// POST /api/groups/campaign/[slug]/brief — create_or_refresh_brief
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ slug: string }> },
) {
    let slug = 'unknown';
    try {
        ({ slug } = await params);
        const body = await req.json().catch(() => ({})) as { instructions?: string };

        const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(
                () => reject(new Error(`[brief-engine:timeout] Brief generation for "${slug}" exceeded ${BRIEF_GENERATION_TIMEOUT_MS / 1000}s server deadline. The pipeline may have stalled on a heavy LLM stage. Try again — if this recurs, check server logs for the last completed stage.`)),
                BRIEF_GENERATION_TIMEOUT_MS,
            );
        });

        const result = await Promise.race([
            createOrRefreshBrief(slug, { instructions: body.instructions }),
            timeoutPromise,
        ]);

        return NextResponse.json(result, { status: 200 });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        const isTimeout = message.includes('[brief-engine:timeout]');
        const timings = isTimeout ? getBriefTimingSnapshot(slug) : [];
        console.error('[brief-engine:POST]', error);
        return NextResponse.json({ error: message, timings }, { status: isTimeout ? 504 : 500 });
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
