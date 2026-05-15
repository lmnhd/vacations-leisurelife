/**
 * Pending Booking Changes (cross-campaign) — Phase 4 follow-up dashboard
 *
 * GET /api/booking-changes/pending
 *   query:
 *     ?severity=critical|high|medium|low|positive  (optional filter)
 *     ?onlyOpen=1                                  (default — only changes with pending acks)
 *
 * Aggregates `booking_change` ledger rows across all campaigns into a single
 * follow-up worklist. Defaults to surfacing only changes that still have at
 * least one recipient awaiting operator acknowledgment.
 *
 * This is the read side of the manual follow-up dashboard requested in
 * plan §10.4 ("Manual follow-up dashboard list"). The write side lives on
 * `/api/groups/campaign/[slug]/booking-change/[changeId]/ack`.
 */

import { NextRequest, NextResponse } from 'next/server';
import { scanAllCampaigns } from '@/lib/campaigns/campaign-store';
import {
    listBookingChangesForCampaign,
    type PendingBookingChange,
} from '@/lib/campaigns/email/email-event-orchestrator';
import { BOOKING_CHANGE_SEVERITIES } from '@/lib/campaigns/email/email-event-types';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const severityFilter = request.nextUrl.searchParams.get('severity');
    const onlyOpenRaw = request.nextUrl.searchParams.get('onlyOpen');
    const onlyOpen = onlyOpenRaw === null || onlyOpenRaw === '1' || onlyOpenRaw === 'true';

    if (severityFilter && !(BOOKING_CHANGE_SEVERITIES as readonly string[]).includes(severityFilter)) {
        return NextResponse.json(
            { success: false, error: `Invalid severity "${severityFilter}".` },
            { status: 400 },
        );
    }

    let campaigns: Array<{ id: string; name: string }> = [];
    try {
        const all = await scanAllCampaigns();
        campaigns = all.map((c) => ({ id: c.id, name: c.name }));
    } catch (err) {
        console.error('[BookingChanges.pending] scanAllCampaigns failed:', err);
        return NextResponse.json(
            { success: false, error: err instanceof Error ? err.message : 'Failed to load campaigns.' },
            { status: 500 },
        );
    }

    type Enriched = PendingBookingChange & { campaignName: string };
    const all: Enriched[] = [];

    for (const c of campaigns) {
        try {
            const changes = await listBookingChangesForCampaign(c.id);
            for (const change of changes) {
                all.push({ ...change, campaignName: c.name });
            }
        } catch (err) {
            console.error(`[BookingChanges.pending] failed for ${c.id}:`, err);
            // Non-fatal per campaign — continue.
        }
    }

    const filtered = all.filter((c) => {
        if (severityFilter && c.severity !== severityFilter) return false;
        if (onlyOpen && c.pendingAckCount === 0) return false;
        return true;
    });

    // Sort: most-recent first, then critical-pending first within the same date.
    filtered.sort((a, b) => {
        const dateCmp = b.occurredAt.localeCompare(a.occurredAt);
        if (dateCmp !== 0) return dateCmp;
        if (a.severity === 'critical' && b.severity !== 'critical') return -1;
        if (b.severity === 'critical' && a.severity !== 'critical') return 1;
        return 0;
    });

    return NextResponse.json({
        success: true,
        filter: { severity: severityFilter ?? null, onlyOpen },
        totalCampaignsScanned: campaigns.length,
        changes: filtered,
    });
}
