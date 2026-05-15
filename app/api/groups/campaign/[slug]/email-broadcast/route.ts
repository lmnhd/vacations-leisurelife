/**
 * Campaign Email Broadcast API (Phase 2)
 *
 * POST /api/groups/campaign/[slug]/email-broadcast
 *   body: {
 *     stage: 'threshold_met' | 'manifest_requested' | 'manifest_reminder'
 *          | 'booking_link_ready' | 'campaign_expired',
 *     dryRun?: boolean,
 *     phase2?: { manifestDeadline?, manifestUrl?, adjacentCampaignsUrl?, operatorNote? },
 *     // Optional broadcast scoping. When omitted, defaults are stage-aware:
 *     //   - manifest_reminder defaults to only-pending manifests.
 *     filter?: { onlyPendingManifest?: boolean; onlyBookingMode?: 'GROUP_WAIT' | 'BOOK_NOW' }
 *   }
 *
 * Operator-triggered. Sends the same Klaviyo event to every (filtered) lead
 * on the campaign and returns an aggregate result. Per-lead failures are
 * caught and listed; one failed lead never blocks the rest.
 *
 * `threshold_met` and `campaign_expired` are also auto-fired by the waitlist
 * auto-promote path and the campaign PATCH endpoint respectively — calling
 * this endpoint for those stages is a re-send.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCampaignBlueprint } from '@/lib/campaigns/campaign-store';
import {
    dispatchEmailBroadcast,
    type BroadcastFilter,
} from '@/lib/campaigns/email/email-event-orchestrator';
import { PHASE_2_STAGES, type EmailEventStage } from '@/lib/campaigns/email/email-event-types';
import type { CampaignWaitlistEntry } from '@/lib/campaigns/types';

export const dynamic = 'force-dynamic';

const BroadcastStageSchema = z.enum([
    'threshold_met',
    'manifest_requested',
    'manifest_reminder',
    'booking_link_ready',
    'campaign_expired',
]);

const Phase2Schema = z.object({
    manifestDeadline: z.string().trim().min(1).optional(),
    manifestUrl: z.string().url().optional(),
    adjacentCampaignsUrl: z.string().url().optional(),
    operatorNote: z.string().trim().max(500).optional(),
}).optional();

const FilterSchema = z.object({
    onlyPendingManifest: z.boolean().optional(),
    onlyBookingMode: z.enum(['GROUP_WAIT', 'BOOK_NOW']).optional(),
}).optional();

const BodySchema = z.object({
    stage: BroadcastStageSchema,
    dryRun: z.boolean().optional().default(false),
    phase2: Phase2Schema,
    filter: FilterSchema,
});

function buildFilter(
    stage: EmailEventStage,
    filterInput: z.infer<typeof FilterSchema>,
): BroadcastFilter {
    // Stage-aware defaults applied when the operator omits a filter.
    const onlyPendingManifest =
        filterInput?.onlyPendingManifest ?? (stage === 'manifest_reminder');
    const onlyBookingMode = filterInput?.onlyBookingMode;

    if (!onlyPendingManifest && !onlyBookingMode) {
        return {};
    }

    return {
        shouldSend: (lead: CampaignWaitlistEntry) => {
            if (onlyPendingManifest && lead.manifestStatus === 'SUBMITTED') return false;
            if (onlyBookingMode && lead.bookingMode !== onlyBookingMode) return false;
            return true;
        },
    };
}

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

    const body = await request.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json(
            {
                success: false,
                error: 'Invalid broadcast request.',
                issues: parsed.error.flatten(),
                supportedStages: PHASE_2_STAGES,
            },
            { status: 400 },
        );
    }

    const { stage, dryRun, phase2, filter } = parsed.data;
    const broadcastFilter = buildFilter(stage as EmailEventStage, filter);

    try {
        const result = await dispatchEmailBroadcast(
            slug,
            stage as EmailEventStage,
            { dryRun, phase2 },
            broadcastFilter,
        );
        return NextResponse.json({ success: true, result });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error(`[EmailBroadcast] failed campaign=${slug} stage=${stage}:`, err);
        return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
}
