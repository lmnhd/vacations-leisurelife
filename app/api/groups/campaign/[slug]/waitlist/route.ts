import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCampaignBlueprint, saveCampaignBlueprint } from '@/lib/campaigns/campaign-store';
import { getPublicGroupCabinTarget, getPublicThresholdPercent } from '@/lib/campaigns/threshold-policy';
import { getCampaignWaitlistSummary, upsertCampaignWaitlistEntry, listCampaignWaitlistEntries } from '@/lib/campaigns/waitlist-store';
import { appendLeadEvent } from '@/lib/campaigns/conversion-store';
import { normalizeAttribution } from '@/lib/campaigns/lead-attribution';
import { sendWaitlistConfirmation, sendThresholdSms } from '@/lib/campaigns/nurture-orchestrator';

export const dynamic = 'force-dynamic';

const AttributionSchema = z.object({
    sourceChannel: z.string().trim().optional(),
    provider: z.string().trim().optional(),
    providerDraftType: z.string().trim().optional(),
    providerCampaignId: z.string().trim().optional(),
    providerAdGroupId: z.string().trim().optional(),
    providerAdId: z.string().trim().optional(),
    providerLeadId: z.string().trim().optional(),
    landingPath: z.string().trim().optional(),
    referrer: z.string().trim().optional(),
    utmSource: z.string().trim().optional(),
    utmMedium: z.string().trim().optional(),
    utmCampaign: z.string().trim().optional(),
    utmContent: z.string().trim().optional(),
    utmTerm: z.string().trim().optional(),
    sessionId: z.string().trim().optional(),
}).optional();

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
    attribution: AttributionSchema,
    /** Optional phone for SMS nurture. Accepted as-is; normalized before storage in the orchestrator. */
    phoneNumber: z.string().trim().max(20).optional(),
    smsConsent: z.boolean().optional(),
});

type WaitlistNextStep = {
    kind: 'wait_for_threshold' | 'booking_link_ready' | 'retail_booking_ready' | 'campaign_closed';
    title: string;
    detail: string;
    bookingLink: string | null;
};

function buildNextStep(
    status: 'DRAFT' | 'GATHERING_INTEREST' | 'THRESHOLD_MET' | 'CONVERTED' | 'EXPIRED',
    bookingMode: 'GROUP_WAIT' | 'BOOK_NOW',
    bookingLink?: string,
    odysseusRetailBookingLink?: string,
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

    if (status === 'GATHERING_INTEREST' && bookingMode === 'BOOK_NOW' && odysseusRetailBookingLink) {
        return {
            kind: 'retail_booking_ready',
            title: 'Book as an Independent Traveler',
            detail: 'You chose the early booking path. The group is still forming, but you can book the exact same cruise right now using the live retail inventory. Please note: booking independently means you will not be officially part of the group block and may not receive group-specific amenities or locked-in group pricing. If you prefer the full group experience, you can change your path above to join the waitlist instead.',
            bookingLink: odysseusRetailBookingLink,
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

    if (parsed.data.phoneNumber && !parsed.data.smsConsent) {
        return NextResponse.json({
            success: false,
            error: 'SMS consent is required before we can save a phone number for threshold alerts.',
        }, { status: 400 });
    }

    if (campaign.status === 'EXPIRED') {
        return NextResponse.json({ success: false, error: 'This campaign has expired and is not accepting new entries.' }, { status: 409 });
    }

    const attribution = normalizeAttribution(parsed.data.attribution ?? {});

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
        attribution,
        sourceChannel: attribution.sourceChannel,
        phoneNumber: parsed.data.phoneNumber || undefined,
    });

    await appendLeadEvent({
        campaignSlug: slug,
        email: entry.email,
        eventType: 'waitlist_submitted',
        attribution,
        notes: `bookingMode=${parsed.data.bookingMode} passengers=${parsed.data.passengerCount}`,
    });

    const summary = await getCampaignWaitlistSummary(slug);
    const requiredCabins = getPublicGroupCabinTarget(campaign);
    const shouldAutoPromote = !previewCaller
        && campaign.status === 'GATHERING_INTEREST'
        && summary.totalEntries >= requiredCabins;

    const effectiveStatus = shouldAutoPromote ? 'THRESHOLD_MET' : campaign.status;

    if (shouldAutoPromote) {
        await saveCampaignBlueprint({
            ...campaign,
            status: effectiveStatus,
            updatedAt: new Date().toISOString(),
        });

        await appendLeadEvent({
            campaignSlug: slug,
            email: entry.email,
            eventType: 'threshold_met',
            attribution,
            notes: `Auto-promoted after entry ${summary.totalEntries} of ${requiredCabins} required`,
        });

        // Fire threshold SMS for all leads with phone numbers — non-fatal
        void listCampaignWaitlistEntries(slug).then((allLeads) => {
            const leadsWithPhone = allLeads.filter((l) => !!l.phoneNumber);
            for (const lead of leadsWithPhone) {
                void sendThresholdSms(slug, lead.email).catch((err) => {
                    console.error(`[Waitlist] threshold SMS failed for ${lead.email}:`, err);
                });
            }
        }).catch((err) => {
            console.error('[Waitlist] Failed to load leads for threshold SMS:', err);
        });
    }

    // Fire waitlist confirmation email — non-fatal to the signup response
    if (!previewCaller) {
        void sendWaitlistConfirmation(slug, entry.email).catch((err) => {
            console.error(`[Waitlist] Confirmation email failed for ${entry.email}:`, err);
        });
    }

    const nextStep = buildNextStep(effectiveStatus, parsed.data.bookingMode, campaign.cbagenttoolsBookingLink, campaign.odysseusRetailBookingLink);

    return NextResponse.json({
        success: true,
        campaign: {
            slug,
            status: effectiveStatus,
            autoPromotedToThreshold: shouldAutoPromote,
        },
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
