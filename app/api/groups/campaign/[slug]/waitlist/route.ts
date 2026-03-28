import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCampaignBlueprint } from '@/lib/campaigns/campaign-store';
import { getPublicGroupCabinTarget, getPublicThresholdPercent } from '@/lib/campaigns/threshold-policy';
import { getCampaignWaitlistSummary, upsertCampaignWaitlistEntry } from '@/lib/campaigns/waitlist-store';

export const dynamic = 'force-dynamic';

const WaitlistRequestSchema = z.object({
    firstName: z.string().trim().min(1),
    lastName: z.string().trim().min(1),
    email: z.string().email(),
    passengerCount: z.number().int().min(1).max(4),
    preferredCabinType: z.string().trim().min(1),
    specialRequests: z.string().trim().max(500).optional(),
    proposedEvents: z.string().trim().max(500).optional(),
    bookingMode: z.enum(['GROUP_WAIT', 'BOOK_NOW']),
    caller: z.enum(['human', 'agent', 'preview']).optional(),
});

type WaitlistNextStep = {
    kind: 'wait_for_threshold' | 'booking_link_ready' | 'campaign_closed';
    title: string;
    detail: string;
    bookingLink: string | null;
};

function buildNextStep(
    status: 'DRAFT' | 'GATHERING_INTEREST' | 'THRESHOLD_MET' | 'CONVERTED' | 'EXPIRED',
    bookingMode: 'GROUP_WAIT' | 'BOOK_NOW',
    bookingLink?: string,
): WaitlistNextStep {
    if (status === 'EXPIRED') {
        return {
            kind: 'campaign_closed',
            title: 'This campaign is closed.',
            detail: 'New entries are paused because the campaign window has expired.',
            bookingLink: null,
        };
    }

    if ((status === 'THRESHOLD_MET' || status === 'CONVERTED') && bookingMode === 'BOOK_NOW' && bookingLink) {
        return {
            kind: 'booking_link_ready',
            title: 'Booking is ready for this sailing.',
            detail: 'The group threshold has been met, so you can move directly to the live booking path now.',
            bookingLink,
        };
    }

    return {
        kind: 'wait_for_threshold',
        title: bookingMode === 'BOOK_NOW' ? 'Your booking intent is saved.' : 'You are on the group wait path.',
        detail: bookingMode === 'BOOK_NOW'
            ? 'We recorded stronger purchase intent for this campaign and will move you into the next booking step as the trip status advances.'
            : 'Your entry now counts toward the threshold that unlocks the next booking stage.',
        bookingLink: bookingLink ?? null,
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

    const body = await request.json();
    const parsed = WaitlistRequestSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ success: false, error: 'Invalid waitlist payload.', issues: parsed.error.flatten() }, { status: 400 });
    }

    const campaign = await getCampaignBlueprint(slug);
    if (!campaign) {
        return NextResponse.json({ success: false, error: `No campaign found with slug: "${slug}".` }, { status: 404 });
    }

    const previewCaller = parsed.data.caller === 'preview';
    if (campaign.status === 'DRAFT' && !previewCaller) {
        return NextResponse.json({ success: false, error: 'This campaign is not accepting public interest yet.' }, { status: 409 });
    }

    if (campaign.status === 'EXPIRED') {
        return NextResponse.json({ success: false, error: 'This campaign has expired and is not accepting new entries.' }, { status: 409 });
    }

    const entry = await upsertCampaignWaitlistEntry({
        slug,
        email: parsed.data.email,
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        passengerCount: parsed.data.passengerCount,
        preferredCabinType: parsed.data.preferredCabinType,
        specialRequests: parsed.data.specialRequests,
        proposedEvents: parsed.data.proposedEvents,
        bookingMode: parsed.data.bookingMode,
    });

    const summary = await getCampaignWaitlistSummary(slug);
    const requiredCabins = getPublicGroupCabinTarget(campaign);
    const nextStep = buildNextStep(campaign.status, parsed.data.bookingMode, campaign.cbagenttoolsBookingLink);

    return NextResponse.json({
        success: true,
        waitlist: {
            email: entry.email,
            bookingMode: entry.bookingMode,
            manifestStatus: entry.manifestStatus,
        },
        progress: {
            joinedEntries: summary.totalEntries,
            joinedPassengers: summary.totalPassengers,
            requiredCabins,
            percentOfThreshold: getPublicThresholdPercent(requiredCabins, summary.totalEntries),
        },
        nextStep,
    });
}