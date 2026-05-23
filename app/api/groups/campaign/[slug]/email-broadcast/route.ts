/**
 * Campaign Email Broadcast API (Phase 2)
 *
 * POST /api/groups/campaign/[slug]/email-broadcast
 *   body: {
 *     stage: 'threshold_met' | 'booking_link_ready' | 'campaign_expired',
 *     dryRun?: boolean,
 *     phase2?: { adjacentCampaignsUrl?, operatorNote? },
 *     // Optional broadcast scoping.
 *     filter?: { onlyBookingMode?: 'GROUP_WAIT' | 'BOOK_NOW' }
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
import { BROADCAST_STAGES, type EmailEventStage } from '@/lib/campaigns/email/email-event-types';
import type { CampaignWaitlistEntry } from '@/lib/campaigns/types';

export const dynamic = 'force-dynamic';

// Derive from BROADCAST_STAGES so this gate cannot drift behind the operator
// UI when new broadcast-eligible stages ship. zod needs a non-empty tuple of literals.
const BroadcastStageSchema = z.enum(
    BROADCAST_STAGES as unknown as [EmailEventStage, ...EmailEventStage[]],
);

const Phase2Schema = z.object({
    adjacentCampaignsUrl: z.string().url().optional(),
    operatorNote: z.string().trim().max(500).optional(),
}).optional();

const FilterSchema = z.object({
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
    const onlyBookingMode = filterInput?.onlyBookingMode;

    if (!onlyBookingMode) {
        return {};
    }

    return {
        shouldSend: (lead: CampaignWaitlistEntry) => {
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
                supportedStages: BROADCAST_STAGES,
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
