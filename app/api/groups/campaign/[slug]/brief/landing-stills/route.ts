import { NextRequest, NextResponse } from 'next/server';
import { regenerateLandingStills } from '@/lib/campaigns/brief-engine/orchestrator';
import { submitAgentJob } from '@/lib/agent-api/runner';
import { getAgentJob } from '@/lib/agent-api/store';

// GET /api/groups/campaign/[slug]/brief/landing-stills?jobId=<id>
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
        console.error('[landing-stills:GET]', error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

// POST /api/groups/campaign/[slug]/brief/landing-stills
// Enqueues async landing-stills regeneration. Returns 202 + { jobId }.
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ slug: string }> },
) {
    try {
        const { slug } = await params;
        const body = await req.json().catch(() => ({})) as { instructions?: string; sync?: boolean };

        if (body.sync) {
            const result = await regenerateLandingStills(slug, { instructions: body.instructions });
            return NextResponse.json(result, { status: 200 });
        }

        const job = await submitAgentJob(
            {
                workflowId: 'campaign_landing_stills_generate',
                campaignSlug: slug,
                ...(body.instructions ? { instructions: body.instructions } : {}),
            },
            'brief-studio-ui',
            { runNow: false },
        );

        return NextResponse.json({ jobId: job.jobId, status: job.status }, { status: 202 });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[landing-stills:POST]', error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
