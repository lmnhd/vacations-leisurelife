import { NextRequest, NextResponse } from 'next/server';
import { runGroupDiscoveryPipeline } from './core-logic';
import { scanAllCampaigns } from '@/lib/campaigns/campaign-store';

export const maxDuration = 60;

/**
 * In-process lock: prevents concurrent discovery runs from the OpenClaw scheduler
 * or any other caller. Safe for single-instance local dev environments.
 */
let isRunning = false;

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const respin = searchParams.get('respin') === 'true';

    // ?load=true — return existing campaigns without running Phase A
    if (searchParams.get('load') === 'true') {
        const campaigns = await scanAllCampaigns();
        const campaignRefs = campaigns.map(c => ({
            id: c.id,
            name: c.name,
            pricingStatus: c.pricingStatus ?? null,
            aestheticBriefStatus: c.aestheticBriefStatus ?? null,
            shipTarget: c.shipTarget ?? null,
            targetDates: c.targetDates ?? null,
            fetchUrl: `/api/groups/campaign/${c.id}`,
        }));
        return NextResponse.json({ success: true, campaigns: campaignRefs, skippedCount: 0 });
    }

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
        const result = await runGroupDiscoveryPipeline({ respin });
        const { campaigns, skippedCount, sonarResearch } = result;

        const completedAt = new Date().toISOString();
        const campaignRefs = campaigns.map(c => ({
            id: c.id,
            name: c.name,
            fetchUrl: `/api/groups/campaign/${c.id}`,
        }));

        return NextResponse.json({
            success: true,
            message: `${respin ? 'Discovery re-spin' : 'Discovery pipeline'} completed at ${completedAt}. ${campaigns.length} blueprint(s) generated (${skippedCount} skipped — already existed). Fetch individual campaigns using the URLs in 'campaigns'. Results are also viewable at /tests/groups/discovery.`,
            count: campaigns.length,
            skippedCount,
            respin,
            campaigns: campaignRefs,
            sonarResearch,
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
