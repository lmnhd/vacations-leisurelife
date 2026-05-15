/**
 * Email Scheduler Cron Endpoint
 *
 * GET  /api/cron/email-scheduler           — live sweep across every campaign.
 * GET  /api/cron/email-scheduler?dryRun=1  — same sweep but no Klaviyo calls.
 * GET  /api/cron/email-scheduler?today=YYYY-MM-DD — override "today" for testing.
 *
 * Designed to be hit by an external scheduler (Vercel cron, EventBridge,
 * GitHub Actions). Daily cadence is sufficient because the schedule policy
 * carries a 1-day grace window for each offset.
 *
 * Auth: require either `Authorization: Bearer <CRON_SECRET>` OR the Vercel
 * cron header `x-vercel-cron`. Unauthorized requests get a 401 so the
 * endpoint is safe to leave public-routed.
 */

import { NextRequest, NextResponse } from 'next/server';
import { runEmailScheduler } from '@/lib/campaigns/email/email-scheduler';

export const dynamic = 'force-dynamic';

function isAuthorized(request: NextRequest): boolean {
    const secret = process.env.CRON_SECRET?.trim();
    if (request.headers.get('x-vercel-cron') === '1') {
        // Vercel sets this on every cron invocation. Trust it.
        return true;
    }
    if (!secret) {
        // No secret configured — only Vercel cron works. Manual invocation
        // requires CRON_SECRET in env so we don't leave the endpoint open.
        return false;
    }
    const header = request.headers.get('authorization') ?? '';
    const match = /^Bearer\s+(.+)$/i.exec(header);
    return match?.[1] === secret;
}

export async function GET(request: NextRequest) {
    if (!isAuthorized(request)) {
        return NextResponse.json(
            { success: false, error: 'Unauthorized — supply CRON_SECRET via Authorization: Bearer header.' },
            { status: 401 },
        );
    }

    const dryRun = request.nextUrl.searchParams.get('dryRun') === '1'
        || request.nextUrl.searchParams.get('dryRun') === 'true';
    const todayOverride = request.nextUrl.searchParams.get('today') ?? undefined;

    try {
        const result = await runEmailScheduler({ dryRun, todayOverride });
        return NextResponse.json({ success: true, result });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error('[Cron/email-scheduler] failed:', err);
        return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
}
