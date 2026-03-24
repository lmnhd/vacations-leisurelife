import { NextRequest, NextResponse } from 'next/server';
import {
    AgentWorkflowInputSchema,
    getAgentWorkflowDefinition,
    listAgentJobsForCampaign,
    submitAgentJob,
} from '@/lib/agent-api';

export async function GET(request: NextRequest) {
    try {
        const campaignSlug = request.nextUrl.searchParams.get('campaignSlug')?.trim();
        if (!campaignSlug) {
            return NextResponse.json({ error: 'campaignSlug is required' }, { status: 400 });
        }

        const jobs = await listAgentJobsForCampaign(campaignSlug);
        return NextResponse.json({ jobs }, { status: 200 });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to list agent jobs';
        console.error('[agent-api:jobs:GET]', error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const rawBody = await request.json().catch(() => ({}));
        const requestedBy = typeof rawBody?.requestedBy === 'string' && rawBody.requestedBy.trim().length > 0
            ? rawBody.requestedBy.trim()
            : 'agent_api';
        const runNow = rawBody?.runNow === true;

        const parsedInput = AgentWorkflowInputSchema.safeParse(rawBody?.input);
        if (!parsedInput.success) {
            return NextResponse.json(
                { error: 'Invalid workflow input', issues: parsedInput.error.issues },
                { status: 400 },
            );
        }

        const workflow = getAgentWorkflowDefinition(parsedInput.data.workflowId);
        if (runNow && workflow.availability !== 'implemented') {
            return NextResponse.json(
                { error: `Workflow ${workflow.workflowId} is registered but not executable yet.` },
                { status: 409 },
            );
        }

        const job = await submitAgentJob(parsedInput.data, requestedBy, { runNow });
        return NextResponse.json({ job }, { status: runNow ? 200 : 202 });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to submit agent job';
        console.error('[agent-api:jobs:POST]', error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
