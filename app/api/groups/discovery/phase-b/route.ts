import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import { scanUnmatchedCampaigns } from '@/lib/campaigns/campaign-store';

let phaseBRunning = false;

/**
 * GET /api/groups/discovery/phase-b
 * Returns all campaigns that are unmatched (AI_ESTIMATE or no pricingStatus).
 * Used by the test page to poll status.
 */
export async function GET(): Promise<NextResponse> {
    try {
        const campaigns = await scanUnmatchedCampaigns();
        return NextResponse.json({
            running: phaseBRunning,
            unmatchedCount: campaigns.length,
            campaigns: campaigns.map(c => ({
                slug: c.id,
                name: c.name,
                pricingStatus: c.pricingStatus ?? 'AI_ESTIMATE',
                shipTarget: c.shipTarget,
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
 * Spawns run-phase-b.ts as a child process and returns immediately.
 * The caller should poll GET for status updates.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
    if (phaseBRunning) {
        return NextResponse.json({ error: 'Phase B is already running' }, { status: 409 });
    }

    const body = await request.json().catch(() => ({})) as { slug?: string };
    const scriptPath = path.join(process.cwd(), 'scripts', 'run-phase-b.ts');

    const args = ['tsx', scriptPath];
    if (body.slug) {
        args.push('--slug', body.slug);
    }

    phaseBRunning = true;
    console.log('[phase-b route] Spawning run-phase-b.ts...');

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
        status: 'started',
        slug: body.slug ?? 'all',
        message: 'Phase B running in background. Poll GET /api/groups/discovery/phase-b for status.',
    });
}
