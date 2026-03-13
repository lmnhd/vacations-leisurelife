import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import { scanAllCampaigns } from '@/lib/campaigns/campaign-store';

export const maxDuration = 300;

let phaseBRunning = false;

/**
 * GET /api/groups/discovery/phase-b
 * Dual-purpose:
 *   - If ?run=true → triggers Phase B immediately (OpenClaw scheduler pattern, matches Phase A)
 *   - If no query  → returns status of unmatched campaigns (polling / status check)
 *
 * Optional: ?slug=<campaign-id> to target a single campaign
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
    const { searchParams } = new URL(request.url);
    const shouldRun = searchParams.get('run') === 'true';
    const slug = searchParams.get('slug') ?? undefined;

    if (shouldRun) {
        return triggerPhaseB(slug);
    }

    // Status-only response
    try {
        const campaigns = await scanAllCampaigns();
        const sortedCampaigns = [...campaigns].sort((left, right) => left.name.localeCompare(right.name));
        const unmatchedCount = sortedCampaigns.filter(c => c.pricingStatus !== 'CB_MATCHED').length;
        const matchedCount = sortedCampaigns.filter(c => c.pricingStatus === 'CB_MATCHED').length;

        return NextResponse.json({
            running: phaseBRunning,
            unmatchedCount,
            matchedCount,
            campaigns: sortedCampaigns.map(c => ({
                slug: c.id,
                name: c.name,
                pricingStatus: c.pricingStatus ?? 'AI_ESTIMATE',
                shipTarget: c.shipTarget,
                matchedShipName: c.matchedShipName,
                matchedSailDate: c.matchedSailDate,
                startingPrice: c.startingPrice,
                priceSource: c.priceSource,
                cbPriceAdvantage: c.cbPriceAdvantage,
                cbagenttoolsBookingLink: c.cbagenttoolsBookingLink,
            })),
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

/**
 * POST /api/groups/discovery/phase-b
 * Body: { slug?: string }
 * Same as GET ?run=true but accepts body payload for slug targeting.
 * Preferred when calling from the test UI (allows body).
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
    const body = await request.json().catch(() => ({})) as { slug?: string };
    return triggerPhaseB(body.slug);
}

// ─── Shared trigger logic ────────────────────────────────────────────────────

function triggerPhaseB(slug?: string): NextResponse {
    if (phaseBRunning) {
        return NextResponse.json(
            { success: false, error: 'Phase B is already running. Try again after the current run completes.' },
            { status: 409 }
        );
    }

    const scriptPath = path.join(process.cwd(), 'scripts', 'run-phase-b.ts');
    const args = ['tsx', scriptPath];
    if (slug) args.push('--slug', slug);

    phaseBRunning = true;
    console.log(`[phase-b route] Spawning run-phase-b.ts${slug ? ` for slug: ${slug}` : ' for all campaigns'}...`);

    const child = spawn('npx', args, {
        cwd: process.cwd(),
        stdio: 'pipe',
        shell: true,
    });

    child.stdout?.on('data', (data: Buffer) => {
        console.log(`[phase-b] ${data.toString().trim()}`);
    });

    child.stderr?.on('data', (data: Buffer) => {
        console.error(`[phase-b err] ${data.toString().trim()}`);
    });

    child.on('close', (code: number | null) => {
        phaseBRunning = false;
        console.log(`[phase-b route] Process exited with code ${code}`);
    });

    return NextResponse.json({
        success: true,
        message: `Phase B running in background. Poll GET /api/groups/discovery/phase-b for status.`,
        slug: slug ?? 'all',
    });
}
