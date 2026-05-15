/**
 * Campaign Booking Change API — Phase 4
 *
 * POST /api/groups/campaign/[slug]/booking-change
 *   body: {
 *     severity: 'critical' | 'high' | 'medium' | 'low' | 'positive',
 *     changeType: string,
 *     previousValue: string,
 *     newValue: string,
 *     summary: string,
 *     actionRequired: boolean,
 *     actionDeadline?: string,
 *     supportContact?: string,
 *     operatorNote?: string,
 *     changeId?: string,        // optional — pass for retry idempotency
 *     dryRun?: boolean,
 *     convertedOnly?: boolean   // defaults true
 *   }
 *
 * Records a booking change against the campaign. For each converted lead:
 *   - dispatches `LLL Booking Change` with the per-change properties;
 *   - writes a `booking_change` ledger row (keyed by the same `changeId`);
 *   - if severity === 'critical' AND lead has phoneNumber, fires Twilio SMS.
 *
 * Returns aggregate counts so the operator UI can render delivery progress.
 *
 * GET /api/groups/campaign/[slug]/booking-change
 *   Returns every change recorded against this campaign with ack progress.
 *   Used by the booking-changes dashboard to render per-campaign change rows.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCampaignBlueprint } from '@/lib/campaigns/campaign-store';
import {
    listBookingChangesForCampaign,
    recordBookingChange,
} from '@/lib/campaigns/email/email-event-orchestrator';
import { BOOKING_CHANGE_SEVERITIES } from '@/lib/campaigns/email/email-event-types';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
    severity: z.enum(['critical', 'high', 'medium', 'low', 'positive']),
    changeType: z.string().trim().min(1).max(80),
    previousValue: z.string().trim().min(1).max(500),
    newValue: z.string().trim().min(1).max(500),
    summary: z.string().trim().min(1).max(240),
    actionRequired: z.boolean(),
    actionDeadline: z.string().trim().min(1).max(120).optional(),
    supportContact: z.string().trim().min(1).max(160).optional(),
    operatorNote: z.string().trim().max(500).optional(),
    changeId: z.string().trim().min(1).max(120).optional(),
    dryRun: z.boolean().optional().default(false),
    convertedOnly: z.boolean().optional().default(true),
});

export async function GET(
    _request: NextRequest,
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

    const changes = await listBookingChangesForCampaign(slug);
    return NextResponse.json({
        success: true,
        campaignSlug: slug,
        campaignName: campaign.name,
        supportedSeverities: BOOKING_CHANGE_SEVERITIES,
        changes,
    });
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
            { success: false, error: 'Invalid booking-change body.', issues: parsed.error.flatten() },
            { status: 400 },
        );
    }

    try {
        const result = await recordBookingChange({
            campaignSlug: slug,
            severity: parsed.data.severity,
            changeType: parsed.data.changeType,
            previousValue: parsed.data.previousValue,
            newValue: parsed.data.newValue,
            summary: parsed.data.summary,
            actionRequired: parsed.data.actionRequired,
            actionDeadline: parsed.data.actionDeadline,
            supportContact: parsed.data.supportContact,
            operatorNote: parsed.data.operatorNote,
            changeId: parsed.data.changeId,
            dryRun: parsed.data.dryRun,
            convertedOnly: parsed.data.convertedOnly,
        });
        return NextResponse.json({ success: true, result });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error(`[BookingChange] dispatch failed campaign=${slug}:`, err);
        return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
}
