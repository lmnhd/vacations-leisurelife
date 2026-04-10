import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCampaignBlueprint } from '@/lib/campaigns/campaign-store';
import { dispatchNurtureStage } from '@/lib/campaigns/nurture-orchestrator';
import type { NurtureStage } from '@/lib/campaigns/nurture-orchestrator';

export const dynamic = 'force-dynamic';

const NurtureStageSchema = z.enum([
    'waitlist_confirmation',
    'nurture_day3',
    'nurture_day7',
    'threshold_sms',
]);

const NurtureRequestSchema = z.object({
    email: z.string().email(),
    stage: NurtureStageSchema,
    /**
     * When true, records a `nurture_queued` event but does not call the provider.
     * Use for testing the wiring without live sends.
     */
    dryRun: z.boolean().optional().default(false),
});

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
        return NextResponse.json({ success: false, error: `No campaign found with slug: "${slug}".` }, { status: 404 });
    }

    const body = await request.json();
    const parsed = NurtureRequestSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json(
            { success: false, error: 'Invalid nurture request.', issues: parsed.error.flatten() },
            { status: 400 },
        );
    }

    const { email, stage, dryRun } = parsed.data;

    try {
        await dispatchNurtureStage(slug, email, stage as NurtureStage, { dryRun });
        return NextResponse.json({
            success: true,
            campaignSlug: slug,
            email,
            stage,
            dryRun,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error(`[Nurture] dispatch failed campaign=${slug} email=${email} stage=${stage}:`, err);
        return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
}
