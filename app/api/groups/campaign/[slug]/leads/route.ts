import { NextRequest, NextResponse } from 'next/server';
import { getCampaignBlueprint } from '@/lib/campaigns/campaign-store';
import { listCampaignWaitlistEntries } from '@/lib/campaigns/waitlist-store';
import { computeFunnelSummary, listCampaignLeadEvents } from '@/lib/campaigns/conversion-store';
import type { CampaignLeadEvent, CampaignWaitlistEntry, LeadEventType } from '@/lib/campaigns/types';

export const dynamic = 'force-dynamic';

interface LeadDashboardRow extends CampaignWaitlistEntry {
    latestLifecycleStage: LeadEventType | null;
    latestEventAt: string | null;
}

function buildLatestEventMap(events: CampaignLeadEvent[]): Map<string, CampaignLeadEvent> {
    const latestByEmail = new Map<string, CampaignLeadEvent>();

    for (const event of events) {
        const current = latestByEmail.get(event.email);
        if (!current || event.occurredAt > current.occurredAt) {
            latestByEmail.set(event.email, event);
        }
    }

    return latestByEmail;
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
    const funnel = computeFunnelSummary(leads);
    const latestEvents = buildLatestEventMap(events);
    const dashboardLeads: LeadDashboardRow[] = leads.map((lead) => {
        const latestEvent = latestEvents.get(lead.email);

        return {
            ...lead,
            latestLifecycleStage: latestEvent?.eventType ?? null,
            latestEventAt: latestEvent?.occurredAt ?? null,
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
        leads: dashboardLeads,
    });
}
