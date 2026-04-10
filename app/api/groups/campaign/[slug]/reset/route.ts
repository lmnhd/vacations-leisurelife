import { NextRequest, NextResponse } from 'next/server';
import { getCampaignBlueprint, saveCampaignBlueprint } from '@/lib/campaigns/campaign-store';
import { clearCampaignLeadEvents } from '@/lib/campaigns/conversion-store';
import { clearCampaignWaitlistEntries } from '@/lib/campaigns/waitlist-store';

export const dynamic = 'force-dynamic';

function resetCampaignStatus(status: string): 'DRAFT' | 'GATHERING_INTEREST' | 'THRESHOLD_MET' | 'CONVERTED' | 'EXPIRED' {
    if (status === 'DRAFT' || status === 'EXPIRED') {
        return status;
    }

    return 'GATHERING_INTEREST';
}

export async function POST(
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

    const [clearedLeads, clearedEvents] = await Promise.all([
        clearCampaignWaitlistEntries(slug),
        clearCampaignLeadEvents(slug),
    ]);

    const nextStatus = resetCampaignStatus(campaign.status);
    if (nextStatus !== campaign.status) {
        await saveCampaignBlueprint({
            ...campaign,
            status: nextStatus,
            updatedAt: new Date().toISOString(),
        });
    }

    return NextResponse.json({
        success: true,
        campaignSlug: slug,
        clearedLeads,
        clearedEvents,
        previousStatus: campaign.status,
        currentStatus: nextStatus,
    });
}