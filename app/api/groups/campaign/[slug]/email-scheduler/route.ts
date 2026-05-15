/**
 * Per-Campaign Scheduler Trigger (operator-facing)
 *
 * POST /api/groups/campaign/[slug]/email-scheduler
 *   body: { dryRun?: boolean; today?: 'YYYY-MM-DD' }
 *
 * Runs the same sweep as the cron endpoint, scoped to one campaign. The
 * operator UI on `/tests/klaviyo-emails` uses this to validate the
 * schedule for a specific campaign without triggering a full-fleet run.
 *
 * Auth: relies on the existing internal-only routing for the /api/groups
 * surface. (Not exposed to public visitors.)
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCampaignBlueprint } from '@/lib/campaigns/campaign-store';
import { runCampaignEmailSchedule } from '@/lib/campaigns/email/email-scheduler';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
    dryRun: z.boolean().optional().default(false),
    today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).optional();

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ slug: string }> },
) {
    const { slug } = await params;
    if (!slug) {
        return NextResponse.json({ success: false, error: 'Campaign slug is required.' }, { status: 400 });
    }

    const campaign = await getCampaignBlueprint(slug);
    if (!campaign) {
        return NextResponse.json(
            { success: false, error: `No campaign found with slug: "${slug}".` },
            { status: 404 },
        );
    }

    let body: unknown = {};
    try {
        body = await request.json();
    } catch {
        body = {};
    }
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json(
            { success: false, error: 'Invalid request body.', issues: parsed.error.flatten() },
            { status: 400 },
        );
    }

    const { dryRun, today } = parsed.data ?? {};

    try {
        const result = await runCampaignEmailSchedule(slug, {
            dryRun,
            todayOverride: today,
        });
        return NextResponse.json({ success: true, result });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error(`[CampaignScheduler] failed for ${slug}:`, err);
        return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
}
