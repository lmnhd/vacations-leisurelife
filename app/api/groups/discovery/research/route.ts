import { NextRequest, NextResponse } from 'next/server';
import { runDiscoveryResearch, getDiscoveryResearchCacheStatus } from '../core-logic';

export const maxDuration = 60;

let isRunning = false;

/**
 * GET — return current research cache status (without running research).
 * Use this to show cache freshness in the UI.
 */
export async function GET() {
    const status = getDiscoveryResearchCacheStatus();
    return NextResponse.json({ success: true, cache: status });
}

/**
 * POST — run Stage 1: Gemini Deep Research Steps 1+2 only.
 * Body: { force?: boolean, respin?: boolean }
 * - force: bypass same-day cache and call Gemini fresh
 * - respin: inject prior-campaign feedback into the prompts
 *
 * After this completes, call POST /api/groups/discovery/generate to produce
 * blueprints from the cached research. You can call /generate multiple times
 * against the same research without paying for Gemini again.
 */
export async function POST(request: NextRequest) {
    const body = await request.json().catch(() => ({})) as { force?: boolean; respin?: boolean };
    const force = body.force === true;
    const respin = body.respin === true;

    if (isRunning) {
        return NextResponse.json(
            {
                success: false,
                error: 'Discovery research is already running. Try again after the current run completes.',
            },
            { status: 409 },
        );
    }

    isRunning = true;
    console.log(`[API] POST /api/groups/discovery/research (force=${force}, respin=${respin})`);

    try {
        const result = await runDiscoveryResearch({ force, respin });
        const cacheStatus = getDiscoveryResearchCacheStatus();
        return NextResponse.json({
            success: true,
            message: `Research complete (${result.psychographicFromCache ? 'psychographic from cache' : 'psychographic fresh'}, ${result.aestheticFromCache ? 'aesthetic from cache' : 'aesthetic fresh'}). Cached at ${result.cachedAt}. Run POST /api/groups/discovery/generate next to produce blueprints.`,
            research: {
                psychographic: result.psychographicData,
                aesthetic: result.aestheticData,
                psychographicFromCache: result.psychographicFromCache,
                aestheticFromCache: result.aestheticFromCache,
            },
            cache: cacheStatus,
        });
    } catch (error) {
        console.error('[API] Error in POST /api/groups/discovery/research:', error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 },
        );
    } finally {
        isRunning = false;
    }
}
