import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCampaignBlueprint, saveCampaignBlueprint, scanAllCampaigns } from '@/lib/campaigns/campaign-store';
import { runDiscoveryRedTeamReview } from '@/lib/campaigns/discovery-red-team';
import { applyDiscoveryReviewIteration } from '@/lib/campaigns/discovery-iteration';
import type { Campaign } from '@/lib/campaigns/types';

const BulkDiscoveryRedTeamRequestSchema = z.object({
    slugs: z.array(z.string().min(1)).optional(),
});

type BulkDiscoveryRedTeamResult = {
    slug: string;
    name: string;
    outcome: 'passed' | 'warned' | 'blocked' | 'failed';
    message: string;
    campaign?: Campaign;
};

export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => ({}));
        const { slugs } = BulkDiscoveryRedTeamRequestSchema.parse(body);

        const allCampaigns = await scanAllCampaigns();
        const targetCampaigns = (slugs && slugs.length > 0)
            ? allCampaigns.filter((campaign) => slugs.includes(campaign.id))
            : allCampaigns;

        const results: BulkDiscoveryRedTeamResult[] = [];

        for (const campaignRef of targetCampaigns) {
            try {
                const campaign = await getCampaignBlueprint(campaignRef.id);
                if (!campaign) {
                    results.push({
                        slug: campaignRef.id,
                        name: campaignRef.name,
                        outcome: 'failed',
                        message: 'Campaign could not be reloaded from storage.',
                    });
                    continue;
                }

                const review = await runDiscoveryRedTeamReview(campaign);
                const updatedCampaign: Campaign = {
                    ...applyDiscoveryReviewIteration(campaign, review),
                    discoveryRedTeamReview: review,
                    updatedAt: new Date().toISOString(),
                };
                await saveCampaignBlueprint(updatedCampaign);

                results.push({
                    slug: campaign.id,
                    name: campaign.name,
                    outcome: review.verdict === 'pass' ? 'passed' : review.verdict === 'warn' ? 'warned' : 'blocked',
                    message: review.approvalRecommendation,
                    campaign: updatedCampaign,
                });
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : 'Unknown error';
                results.push({
                    slug: campaignRef.id,
                    name: campaignRef.name,
                    outcome: 'failed',
                    message,
                });
            }
        }

        const summary = {
            total: results.length,
            passed: results.filter((result) => result.outcome === 'passed').length,
            warned: results.filter((result) => result.outcome === 'warned').length,
            blocked: results.filter((result) => result.outcome === 'blocked').length,
            failed: results.filter((result) => result.outcome === 'failed').length,
        };

        return NextResponse.json({ success: true, summary, results }, { status: 200 });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[Bulk Discovery Red Team Error]:', error);
        return NextResponse.json(
            { error: 'Failed to run bulk discovery red-team review', details: message },
            { status: 500 },
        );
    }
}