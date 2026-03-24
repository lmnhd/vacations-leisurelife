import { NextResponse } from 'next/server';
import { getAgentJob } from '@/lib/agent-api';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ campaignSlug: string; jobId: string }> },
) {
    try {
        const { campaignSlug, jobId } = await params;
        const job = await getAgentJob(campaignSlug, jobId);
        if (!job) {
            return NextResponse.json({ error: `Agent job not found: ${jobId}` }, { status: 404 });
        }

        return NextResponse.json({ job }, { status: 200 });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load agent job';
        console.error('[agent-api:job:GET]', error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
