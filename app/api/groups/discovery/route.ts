import { NextResponse } from 'next/server';
import { runGroupDiscoveryPipeline } from './core-logic';

export const maxDuration = 300; // Allow 5 minutes for deep research and LLM processing

/**
 * In-process lock: prevents concurrent discovery runs from the OpenClaw scheduler
 * or any other caller. Safe for single-instance local dev environments.
 */
let isRunning = false;

export async function GET() {
    if (isRunning) {
        console.warn('[API] Discovery pipeline is already in progress — rejecting concurrent request.');
        return NextResponse.json(
            {
                success: false,
                error: 'Discovery pipeline is already running. Try again after the current run completes.',
            },
            { status: 409 }
        );
    }

    isRunning = true;
    console.log('[API] Starting GET /api/groups/discovery');

    try {
        const { campaigns, skippedCount } = await runGroupDiscoveryPipeline();

        const completedAt = new Date().toISOString();
        const campaignRefs = campaigns.map(c => ({
            id: c.id,
            name: c.name,
            fetchUrl: `/api/groups/campaign/${c.id}`,
        }));

        return NextResponse.json({
            success: true,
            message: `Discovery pipeline completed at ${completedAt}. ${campaigns.length} blueprint(s) generated (${skippedCount} skipped — already existed). Fetch individual campaigns using the URLs in 'campaigns'. Results are also viewable at /tests/groups/discovery.`,
            count: campaigns.length,
            skippedCount,
            campaigns: campaignRefs,
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
    } finally {
        isRunning = false;
        console.log('[API] Discovery pipeline lock released.');
    }
}
