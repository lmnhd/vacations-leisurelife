import { NextRequest, NextResponse } from 'next/server';
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import path from 'path';
import { scanAllCampaigns } from '@/lib/campaigns/campaign-store';
import { getLaunchWindowAssessment } from '@/lib/campaigns/launch-window';
import type { Campaign } from '@/lib/campaigns/types';

export const maxDuration = 60;

let phaseBRunning = false;
let phaseBChild: ChildProcessWithoutNullStreams | null = null;
let phaseBStartedAt: number | null = null;
let phaseBLastExit: { code: number | null; completedAt: string } | null = null;
let phaseBLastError: string | null = null;

const PHASE_B_WATCHDOG_MS = 12 * 60 * 1000;

function isCampaignRetired(campaign: Campaign): boolean {
    return !!campaign.discoveryIteration?.retiredAt
        || campaign.discoveryIteration?.recommendedNextAction === 'retire';
}

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
        const activeCampaigns = campaigns.filter((campaign) => !isCampaignRetired(campaign));
        const sortedCampaigns = [...activeCampaigns].sort((left, right) => left.name.localeCompare(right.name));
        const unmatchedCount = sortedCampaigns.filter(c => c.pricingStatus !== 'CB_MATCHED').length;
        const matchedCount = sortedCampaigns.filter(c => c.pricingStatus === 'CB_MATCHED').length;
        const retiredCount = campaigns.length - activeCampaigns.length;

        return NextResponse.json({
            running: phaseBRunning,
            startedAt: phaseBStartedAt ? new Date(phaseBStartedAt).toISOString() : null,
            lastExit: phaseBLastExit,
            lastError: phaseBLastError,
            unmatchedCount,
            matchedCount,
            activeCount: activeCampaigns.length,
            retiredCount,
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
    const body = await request.json().catch(() => ({})) as { slug?: string; slugs?: string[]; useCache?: boolean };
    const requestedSlugs = Array.isArray(body.slugs)
        ? body.slugs.filter((slug): slug is string => typeof slug === 'string' && slug.trim().length > 0)
        : [];
    const useCache = body.useCache === true;

    if (requestedSlugs.length > 0) {
        return triggerPhaseB(requestedSlugs, useCache);
    }

    return triggerPhaseB(body.slug ? [body.slug] : undefined, useCache);
}

// ─── Shared trigger logic ────────────────────────────────────────────────────

function triggerPhaseB(slugs?: string[], useCache = false): NextResponse {
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
    if (useCache) {
        args.push('--use-cache');
    }

    phaseBRunning = true;
    phaseBStartedAt = Date.now();
    phaseBLastExit = null;
    phaseBLastError = null;
    console.log(
        `[phase-b route] Spawning run-phase-b.ts${slugs && slugs.length > 0 ? ` for slugs: ${slugs.join(', ')}` : ' for all campaigns'}...`
    );

    const child = spawn('npx', args, {
        cwd: process.cwd(),
        stdio: 'pipe',
        shell: true,
    });
    phaseBChild = child;
    const watchdog = setTimeout(() => {
        if (!phaseBRunning || phaseBChild !== child) return;
        phaseBLastError = `Phase B exceeded ${Math.round(PHASE_B_WATCHDOG_MS / 60000)} minutes and was stopped.`;
        console.error(`[phase-b route] ${phaseBLastError}`);
        child.kill('SIGTERM');
        phaseBRunning = false;
        phaseBChild = null;
        phaseBStartedAt = null;
    }, PHASE_B_WATCHDOG_MS);

    child.stdout?.on('data', (data: Buffer) => {
        console.log(`[phase-b] ${data.toString().trim()}`);
    });

    child.stderr?.on('data', (data: Buffer) => {
        console.error(`[phase-b err] ${data.toString().trim()}`);
    });

    child.on('error', (error: Error) => {
        clearTimeout(watchdog);
        phaseBRunning = false;
        phaseBChild = null;
        phaseBStartedAt = null;
        phaseBLastError = error.message;
        console.error(`[phase-b route] Process error: ${error.message}`);
    });

    child.on('close', (code: number | null) => {
        clearTimeout(watchdog);
        phaseBRunning = false;
        phaseBChild = null;
        phaseBStartedAt = null;
        phaseBLastExit = { code, completedAt: new Date().toISOString() };
        console.log(`[phase-b route] Process exited with code ${code}`);
    });

    return NextResponse.json({
        success: true,
        message: `Phase B running in background. Poll GET /api/groups/discovery/phase-b for status.`,
        slugs: slugs ?? ['all'],
    });
}
