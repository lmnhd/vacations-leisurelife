/**
 * Acknowledge a Booking Change for a Lead — Phase 4
 *
 * POST /api/groups/campaign/[slug]/booking-change/[changeId]/ack
 *   body: { email: string, acknowledgedBy?: string, note?: string }
 *
 * Operator-only. Records that the operator has confirmed the named lead is
 * aware of the change. Plan §13 open decision #5 (guest-clickable
 * acknowledgment link) is deferred — operator-driven acks are the v1 path.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { acknowledgeBookingChange } from '@/lib/campaigns/email/email-event-orchestrator';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
    email: z.string().email(),
    acknowledgedBy: z.string().trim().min(1).max(120).optional(),
    note: z.string().trim().max(500).optional(),
});

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ slug: string; changeId: string }> },
) {
    const { slug, changeId } = await params;
    if (!slug || !changeId) {
        return NextResponse.json(
            { success: false, error: 'Campaign slug and changeId are required.' },
            { status: 400 },
        );
    }

    const body = await request.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json(
            { success: false, error: 'Invalid ack body.', issues: parsed.error.flatten() },
            { status: 400 },
        );
    }

    try {
        await acknowledgeBookingChange({
            campaignSlug: slug,
            email: parsed.data.email,
            changeId,
            acknowledgedBy: parsed.data.acknowledgedBy,
            note: parsed.data.note,
        });
        return NextResponse.json({
            success: true,
            campaignSlug: slug,
            changeId,
            email: parsed.data.email,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error(`[BookingChange.ack] failed campaign=${slug} change=${changeId}:`, err);
        return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
}
