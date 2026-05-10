import { NextRequest, NextResponse } from 'next/server';
import { generateDiscoveryBlueprints } from '../core-logic';

export const maxDuration = 60;

let isRunning = false;

/**
 * POST — Stage 2: run GPT-5 blueprint generation against the latest cached
 * Gemini research. Use POST /api/groups/discovery/research first if no cache
 * exists.
 *
 * Body: { respin?: boolean }
 * - respin: feed prior-campaign feedback into the GPT prompt for differentiation
 *
 * Calling this endpoint multiple times against the same research will produce
 * additional blueprints (with idempotency on slug — duplicates are skipped).
 * This is the iterative "add more campaigns without re-paying for Gemini" path.
 */
export async function POST(request: NextRequest) {
    const body = await request.json().catch(() => ({})) as { respin?: boolean };
    const respin = body.respin === true;

    if (isRunning) {
        return NextResponse.json(
            {
                success: false,
                error: 'Blueprint generation is already running. Try again after the current run completes.',
            },
            { status: 409 },
        );
    }

    isRunning = true;
    console.log(`[API] POST /api/groups/discovery/generate (respin=${respin})`);

    try {
        const result = await generateDiscoveryBlueprints({ respin });
        const completedAt = new Date().toISOString();
        const campaignRefs = result.campaigns.map((c) => ({
            id: c.id,
            name: c.name,
            fetchUrl: `/api/groups/campaign/${c.id}`,
        }));
        return NextResponse.json({
            success: true,
            message: `Blueprint generation completed at ${completedAt}. ${result.campaigns.length} blueprint(s) generated (${result.skippedCount} skipped — already existed).`,
            count: result.campaigns.length,
            skippedCount: result.skippedCount,
            respin,
            campaigns: campaignRefs,
            sonarResearch: result.sonarResearch,
        });
    } catch (error) {
        console.error('[API] Error in POST /api/groups/discovery/generate:', error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        // Hint at the likely cause when no research is cached
        const hintsAtMissingResearch = message.includes('No cached discovery research');
        return NextResponse.json(
            {
                success: false,
                error: message,
                hint: hintsAtMissingResearch
                    ? 'Run POST /api/groups/discovery/research first to populate the cache.'
                    : undefined,
            },
            { status: hintsAtMissingResearch ? 412 : 500 },
        );
    } finally {
        isRunning = false;
    }
}
