import { NextRequest, NextResponse } from 'next/server';
import { resyncProductionLint } from '@/lib/campaigns/brief-engine/orchestrator';
import { submitAgentJob } from '@/lib/agent-api/runner';
import { getAgentJob } from '@/lib/agent-api/store';

// GET /api/groups/campaign/[slug]/brief/production-lint?jobId=<id>
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
        }, { status: 200 });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[production-lint:GET]', error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

// POST /api/groups/campaign/[slug]/brief/production-lint
// Reruns lint rules against persisted artifacts. No LLM calls.
// Supports sync mode (immediate) or async via job queue.
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ slug: string }> },
) {
    try {
        const { slug } = await params;
        const body = await req.json().catch(() => ({})) as { sync?: boolean };

        if (body.sync) {
            const result = await resyncProductionLint(slug);
            return NextResponse.json(result, { status: 200 });
        }

        const job = await submitAgentJob(
            {
                workflowId: 'campaign_production_lint_resync',
                campaignSlug: slug,
            },
            'brief-studio-ui',
            { runNow: false },
        );

        return NextResponse.json({ jobId: job.jobId, status: job.status }, { status: 202 });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[production-lint:POST]', error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
