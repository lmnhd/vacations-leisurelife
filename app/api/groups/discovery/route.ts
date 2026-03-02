import { NextResponse } from 'next/server';
import { runGroupDiscoveryPipeline } from './core-logic';

export const maxDuration = 300; // Allow 5 minutes for deep research and LLM processing

export async function GET() {
    try {
        console.log('[API] Starting GET /api/groups/discovery');
        const blueprints = await runGroupDiscoveryPipeline();

        return NextResponse.json({
            success: true,
            count: blueprints.length,
            blueprints,
        });
    } catch (error) {
        console.error('[API] Error in GET /api/groups/discovery:', error);

        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error occurred',
            },
            { status: 500 }
        );
    }
}
