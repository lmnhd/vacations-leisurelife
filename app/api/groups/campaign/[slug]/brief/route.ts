import { NextRequest, NextResponse } from 'next/server';
import { applyStructuredRevision } from '@/lib/campaigns/brief-engine/orchestrator';
import type { RevisionInput } from '@/lib/campaigns/brief-engine/orchestrator';
import { submitAgentJob } from '@/lib/agent-api/runner';
import { getAgentJob } from '@/lib/agent-api/store';

// GET /api/groups/campaign/[slug]/brief?jobId=<id>
// Returns agent job status + any persisted failure diagnostics.
export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ slug: string }> },
) {
    try {
        const { slug } = await params;
        const url = new URL(_req.url);
        const jobId = url.searchParams.get('jobId');

        if (!jobId) {
            return NextResponse.json({ error: 'Missing jobId query parameter' }, { status: 400 });
        }

        const job = await getAgentJob(slug, jobId);
        if (!job) {
            return NextResponse.json({ error: `Job not found: ${jobId}` }, { status: 404 });
        }

        // Attach persisted failure diagnostics from the worker execution
        const failureDiagnostics = (job.status === 'failed') ? (job.failureDiagnostics ?? null) : null;

        return NextResponse.json({
            jobId: job.jobId,
            status: job.status,
            campaignSlug: job.campaignSlug,
            steps: job.steps,
            summary: job.summary,
            error: job.error,
            createdAt: job.createdAt,
            startedAt: job.startedAt,
            completedAt: job.completedAt,
            failureDiagnostics,
        }, { status: 200 });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[brief-engine:GET]', error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

// POST /api/groups/campaign/[slug]/brief — enqueue async brief generation
// Returns 202 + { jobId } immediately. Client polls GET ?jobId= for status.
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ slug: string }> },
) {
    try {
        const { slug } = await params;
        const body = await req.json().catch(() => ({})) as { instructions?: string };

        const job = await submitAgentJob(
            {
                workflowId: 'campaign_brief_generate',
                campaignSlug: slug,
                stopBeforeMedia: true,
                ...(body.instructions ? { instructions: body.instructions } : {}),
            },
            'brief-studio-ui',
            { runNow: true },
        );

        return NextResponse.json({ jobId: job.jobId, status: job.status }, { status: 202 });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[brief-engine:POST]', error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

// PATCH /api/groups/campaign/[slug]/brief — apply_structured_revision (stays synchronous)
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
