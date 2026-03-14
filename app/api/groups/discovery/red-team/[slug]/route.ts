import { NextRequest, NextResponse } from 'next/server';
import { getCampaignBlueprint, saveCampaignBlueprint } from '@/lib/campaigns/campaign-store';
import { runDiscoveryRedTeamReview } from '@/lib/campaigns/discovery-red-team';
import { applyDiscoveryReviewIteration } from '@/lib/campaigns/discovery-iteration';

export async function POST(
    _req: NextRequest,
    { params }: { params: Promise<{ slug: string }> },
) {
    try {
        const { slug } = await params;
        const campaign = await getCampaignBlueprint(slug);

        if (!campaign) {
            return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
        }

        const review = await runDiscoveryRedTeamReview(campaign);
        const updatedCampaign = {
            ...applyDiscoveryReviewIteration(campaign, review),
            discoveryRedTeamReview: review,
            updatedAt: new Date().toISOString(),
        };

        await saveCampaignBlueprint(updatedCampaign);

        return NextResponse.json({ success: true, review, campaign: updatedCampaign }, { status: 200 });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[Discovery Red Team Error]:', error);
        return NextResponse.json(
            { error: 'Failed to run discovery review', details: message },
            { status: 500 },
        );
    }
}