/**
 * Manual Booking Reconciliation API
 *
 * Backup path for marking a lead as `converted` when an automated inbound
 * email parser is NOT yet wired (or when CB does not actually email agent
 * confirmations for group bookings — pending confirmation from Cruise
 * Brothers). The operator checks the CB Agent Tools dashboard daily, copies
 * the booking reference, and submits via the `/tests/manual-booking-entry`
 * page which POSTs here.
 *
 * Endpoints:
 *
 *   GET  /api/groups/campaign/[slug]/manual-booking?list=leads
 *     Returns every lead on the campaign with their current booking-
 *     reconciliation state so the operator can see who still needs entry.
 *
 *   POST /api/groups/campaign/[slug]/manual-booking
 *     body: { email, bookingReference, bookingConfirmedAt,
 *             bookingAmount?, bookingNotes?, bookingEnteredBy? }
 *     Marks the lead as converted, stamps booking metadata. Idempotent —
 *     subsequent calls update the metadata without re-writing the ledger.
 *     Phase 3 will additionally fire `LLL Booking Confirmed` from here on
 *     the first flip; until Phase 3 ships, this endpoint only writes the
 *     `converted` ledger entry.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCampaignBlueprint } from '@/lib/campaigns/campaign-store';
import {
    listCampaignWaitlistEntries,
    markLeadAsBooked,
} from '@/lib/campaigns/waitlist-store';
import { appendLeadEvent } from '@/lib/campaigns/conversion-store';
import { dispatchEmailEvent } from '@/lib/campaigns/email/email-event-orchestrator';
import type { LeadAttribution } from '@/lib/campaigns/types';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
    email: z.string().email(),
    bookingReference: z.string().trim().min(1).max(120),
    bookingConfirmedAt: z.string().trim().min(1), // accepts YYYY-MM-DD or full ISO
    bookingAmount: z.number().nonnegative().optional(),
    bookingNotes: z.string().trim().max(1000).optional(),
    bookingEnteredBy: z.string().trim().max(120).optional(),
});

function buildAttribution(campaignSlug: string): LeadAttribution {
    return {
        sourceChannel: 'internal',
        provider: 'manual-booking-entry',
        providerCampaignId: campaignSlug,
    };
}

function normalizeBookingConfirmedAt(input: string): string {
    // Accept YYYY-MM-DD (date-only) or full ISO. Date-only inputs are anchored
    // at noon UTC to avoid timezone-boundary drift when rendered as a date.
    if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
        return `${input}T12:00:00.000Z`;
    }
    const parsed = new Date(input);
    if (Number.isNaN(parsed.getTime())) {
        throw new Error(`Invalid bookingConfirmedAt: "${input}". Use YYYY-MM-DD or full ISO.`);
    }
    return parsed.toISOString();
}

export async function GET(
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

    if (request.nextUrl.searchParams.get('list') !== 'leads') {
        return NextResponse.json(
            { success: false, error: 'Pass ?list=leads to enumerate reconciliation candidates.' },
            { status: 400 },
        );
    }

    const entries = await listCampaignWaitlistEntries(slug);

    return NextResponse.json({
        success: true,
        campaignSlug: slug,
        campaignName: campaign.name,
        leads: entries
            .slice()
            .sort((a, b) => {
                // Unbooked first (operator's working set), then most-recent bookings.
                if (a.converted !== b.converted) return a.converted ? 1 : -1;
                return (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '');
            })
            .map((e) => ({
                email: e.email,
                firstName: e.firstName,
                lastName: e.lastName,
                passengerCount: e.passengerCount,
                preferredCabinType: e.preferredCabinType,
                bookingMode: e.bookingMode ?? null,
                manifestStatus: e.manifestStatus ?? 'PENDING',
                converted: e.converted === true,
                bookingReference: e.bookingReference ?? null,
                bookingConfirmedAt: e.bookingConfirmedAt ?? null,
                bookingAmount: e.bookingAmount ?? null,
                bookingNotes: e.bookingNotes ?? null,
                bookingEnteredBy: e.bookingEnteredBy ?? null,
                createdAt: e.createdAt,
                updatedAt: e.updatedAt,
            })),
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
            { success: false, error: 'Invalid request body.', issues: parsed.error.flatten() },
            { status: 400 },
        );
    }

    let bookingConfirmedAt: string;
    try {
        bookingConfirmedAt = normalizeBookingConfirmedAt(parsed.data.bookingConfirmedAt);
    } catch (err) {
        return NextResponse.json(
            { success: false, error: err instanceof Error ? err.message : 'Invalid bookingConfirmedAt.' },
            { status: 400 },
        );
    }

    try {
        const { entry, convertedNow } = await markLeadAsBooked({
            slug,
            email: parsed.data.email,
            bookingReference: parsed.data.bookingReference,
            bookingConfirmedAt,
            bookingAmount: parsed.data.bookingAmount,
            bookingNotes: parsed.data.bookingNotes,
            bookingEnteredBy: parsed.data.bookingEnteredBy,
        });

        let bookingConfirmedEmailFired = false;
        if (convertedNow) {
            // First reconciliation for this lead — write the canonical
            // `converted` ledger event so the conversion dashboards see it.
            await appendLeadEvent({
                campaignSlug: slug,
                email: entry.email,
                eventType: 'converted',
                attribution: buildAttribution(slug),
                notes: `Manual booking reconciliation — ref=${entry.bookingReference}`,
                metadata: {
                    bookingReference: entry.bookingReference ?? '',
                    bookingConfirmedAt: entry.bookingConfirmedAt ?? '',
                    enteredBy: entry.bookingEnteredBy ?? 'unknown',
                    source: 'manual-booking-entry',
                },
            });

            // Phase 3 — fire `LLL Booking Confirmed` on the initial flip.
            // Failure is non-fatal: the booking is already saved + ledgered,
            // so a Klaviyo blip should not surface as a 500 to the operator.
            try {
                await dispatchEmailEvent(slug, entry.email, 'booking_confirmed');
                bookingConfirmedEmailFired = true;
            } catch (err) {
                console.error(
                    `[ManualBooking] booking_confirmed email dispatch failed for ${entry.email}:`,
                    err,
                );
            }
        }

        return NextResponse.json({
            success: true,
            convertedNow,
            bookingConfirmedEmailFired,
            entry: {
                email: entry.email,
                firstName: entry.firstName,
                lastName: entry.lastName,
                converted: entry.converted,
                bookingReference: entry.bookingReference,
                bookingConfirmedAt: entry.bookingConfirmedAt,
                bookingAmount: entry.bookingAmount,
                bookingNotes: entry.bookingNotes,
                bookingEnteredBy: entry.bookingEnteredBy,
                updatedAt: entry.updatedAt,
            },
            advisory: convertedNow
                ? bookingConfirmedEmailFired
                    ? 'Lead marked converted, `converted` ledger event written, and `LLL Booking Confirmed` email fired via Klaviyo.'
                    : 'Lead marked converted and `converted` ledger event written. The `LLL Booking Confirmed` email dispatch failed — check server logs and consider firing manually from /tests/klaviyo-emails.'
                : 'Booking metadata updated. Lead was already converted; no new ledger event written.',
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error(`[ManualBooking] failed campaign=${slug} email=${parsed.data.email}:`, err);
        const status = message.includes('Lead not found') ? 404 : 500;
        return NextResponse.json({ success: false, error: message }, { status });
    }
}
