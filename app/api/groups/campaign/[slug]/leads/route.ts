import { NextRequest, NextResponse } from 'next/server';
import { getCampaignBlueprint } from '@/lib/campaigns/campaign-store';
import { listCampaignWaitlistEntries } from '@/lib/campaigns/waitlist-store';
import { computeFunnelSummary, computeLandingTrafficSummary, listCampaignLeadEvents } from '@/lib/campaigns/conversion-store';
import type { CampaignLeadEvent, CampaignWaitlistEntry, LeadEventType } from '@/lib/campaigns/types';

export const dynamic = 'force-dynamic';

interface LeadDashboardRow extends CampaignWaitlistEntry {
    latestLifecycleStage: LeadEventType | null;
    latestEventAt: string | null;
    latestEmailStage: string | null;
    latestEmailAt: string | null;
    verifiedAt: string | null;
}

function emailKey(email: string): string {
    return email.trim().toLowerCase();
}

function buildLatestEventMap(events: CampaignLeadEvent[]): Map<string, CampaignLeadEvent> {
    const latestByEmail = new Map<string, CampaignLeadEvent>();

    for (const event of events) {
        if (event.email === 'anonymous') continue;

        const key = emailKey(event.email);
        const current = latestByEmail.get(key);
        if (!current || event.occurredAt > current.occurredAt) {
            latestByEmail.set(key, event);
        }
    }

    return latestByEmail;
}

function buildEventsByEmail(events: CampaignLeadEvent[]): Map<string, CampaignLeadEvent[]> {
    const eventsByEmail = new Map<string, CampaignLeadEvent[]>();

    for (const event of events) {
        if (event.email === 'anonymous') continue;

        const key = emailKey(event.email);
        const bucket = eventsByEmail.get(key) ?? [];
        bucket.push(event);
        eventsByEmail.set(key, bucket);
    }

    return eventsByEmail;
}

function getLatestMatchingEvent(
    events: CampaignLeadEvent[],
    predicate: (event: CampaignLeadEvent) => boolean,
): CampaignLeadEvent | null {
    let latestEvent: CampaignLeadEvent | null = null;

    for (const event of events) {
        if (!predicate(event)) continue;
        if (!latestEvent || event.occurredAt > latestEvent.occurredAt) {
            latestEvent = event;
        }
    }

    return latestEvent;
}

function isEmailWorkflowEvent(event: CampaignLeadEvent): boolean {
    if (!event.metadata?.stage) return false;

    return (
        event.eventType === 'nurture_queued' ||
        event.eventType === 'nurture_sent' ||
        event.eventType === 'threshold_met_notified' ||
        event.eventType === 'booking_link_sent' ||
        event.eventType === 'lead_error'
    );
}

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
        return NextResponse.json({ success: false, error: `No campaign found with slug: "${slug}".` }, { status: 404 });
    }

    const [leads, events] = await Promise.all([
        listCampaignWaitlistEntries(slug),
        listCampaignLeadEvents(slug),
    ]);
    // The leads table itself shows every signup (verified or not) — operators
    // need visibility into everyone who's signed up. But the funnel counts and
    // TC Pulse copy are verified-only, so unverified burner-email signups don't
    // inflate the number quoted back to guests.
    const verifiedLeads = leads.filter((entry) => entry.emailVerified === true);
    const funnel = computeFunnelSummary(verifiedLeads);
    const traffic = computeLandingTrafficSummary(events, verifiedLeads);
    const latestEvents = buildLatestEventMap(events);
    const eventsByEmail = buildEventsByEmail(events);
    const dashboardLeads: LeadDashboardRow[] = leads.map((lead) => {
        const key = emailKey(lead.email);
        const leadEvents = eventsByEmail.get(key) ?? [];
        const latestEvent = latestEvents.get(key);
        const latestEmailEvent = getLatestMatchingEvent(leadEvents, isEmailWorkflowEvent);
        const verifiedEvent = getLatestMatchingEvent(leadEvents, (event) => event.eventType === 'email_verified');

        return {
            ...lead,
            latestLifecycleStage: latestEvent?.eventType ?? null,
            latestEventAt: latestEvent?.occurredAt ?? null,
            latestEmailStage: latestEmailEvent?.metadata?.stage ?? null,
            latestEmailAt: latestEmailEvent?.occurredAt ?? null,
            verifiedAt: verifiedEvent?.occurredAt ?? null,
        };
    });

    return NextResponse.json({
        success: true,
        campaign: {
            slug: campaign.id,
            name: campaign.name,
            status: campaign.status,
            minCabinsRequired: campaign.minCabinsRequired,
        },
        funnel,
        traffic,
        leads: dashboardLeads,
    });
}
