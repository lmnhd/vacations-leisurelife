import { NextResponse } from 'next/server';
import { listAgentWorkflowDefinitions } from '@/lib/agent-api';

export async function GET() {
    try {
        return NextResponse.json({ workflows: listAgentWorkflowDefinitions() }, { status: 200 });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load agent workflows';
        console.error('[agent-api:workflows]', error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
