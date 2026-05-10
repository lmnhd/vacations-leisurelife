import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import { scanAllCampaigns } from '@/lib/campaigns/campaign-store';
import { getLaunchWindowAssessment } from '@/lib/campaigns/launch-window';

export const maxDuration = 60;

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
    const slugs = searchParams.getAll('slug');

    if (shouldRun) {
        return triggerPhaseB(slugs.length > 0 ? slugs : slug ? [slug] : undefined);
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
                ...getLaunchWindowAssessment({ matchedSailDate: c.matchedSailDate, targetDates: c.targetDates }),
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
                // Inventory health & ranked candidates (new — populated by ranked Phase B)
                activeBookingMode: c.activeBookingMode ?? null,
                inventoryHealth: c.inventoryHealth ?? null,
                inventoryLastCheckedAt: c.inventoryLastCheckedAt ?? null,
                inventoryCandidates: c.inventoryCandidates ?? null,
            })),
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

/**
 * POST /api/groups/discovery/phase-b
 * Body: { slug?: string, slugs?: string[] }
 * Same as GET ?run=true but accepts body payload for slug targeting.
 * Preferred when calling from the test UI (allows body).
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
    const body = await request.json().catch(() => ({})) as { slug?: string; slugs?: string[] };
    const requestedSlugs = Array.isArray(body.slugs)
        ? body.slugs.filter((slug): slug is string => typeof slug === 'string' && slug.trim().length > 0)
        : [];

    if (requestedSlugs.length > 0) {
        return triggerPhaseB(requestedSlugs);
    }

    return triggerPhaseB(body.slug ? [body.slug] : undefined);
}

// ─── Shared trigger logic ────────────────────────────────────────────────────

function triggerPhaseB(slugs?: string[]): NextResponse {
    if (phaseBRunning) {
        return NextResponse.json(
            { success: false, error: 'Phase B is already running. Try again after the current run completes.' },
            { status: 409 }
        );
    }

    const scriptPath = path.join(process.cwd(), 'scripts', 'run-phase-b.ts');
    const args = ['tsx', scriptPath];
    for (const slug of slugs ?? []) {
        args.push('--slug', slug);
    }

    phaseBRunning = true;
    console.log(
        `[phase-b route] Spawning run-phase-b.ts${slugs && slugs.length > 0 ? ` for slugs: ${slugs.join(', ')}` : ' for all campaigns'}...`
    );

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
        slugs: slugs ?? ['all'],
    });
}
