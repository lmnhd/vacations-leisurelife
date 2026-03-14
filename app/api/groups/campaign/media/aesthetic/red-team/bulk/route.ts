import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
    getAestheticBrief,
    getCampaignBlueprint,
    saveAestheticBrief,
    scanAllCampaigns,
} from '@/lib/campaigns/campaign-store';
import { runAestheticRedTeamReview } from '@/lib/campaigns/aesthetic-red-team';

const BulkRedTeamRequestSchema = z.object({
    slugs: z.array(z.string().min(1)).optional(),
});

type BulkRedTeamResult = {
    slug: string;
    name: string;
    outcome: 'passed' | 'warned' | 'blocked' | 'skipped' | 'failed';
    message: string;
};

export async function POST(req: NextRequest) {
    try {
        const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
        const { slugs } = BulkRedTeamRequestSchema.parse(body);

        const allCampaigns = await scanAllCampaigns();
        const targetCampaigns = (slugs && slugs.length > 0)
            ? allCampaigns.filter((campaign) => slugs.includes(campaign.id))
            : allCampaigns;

        const results: BulkRedTeamResult[] = [];

        for (const campaign of targetCampaigns) {
            const brief = await getAestheticBrief(campaign.id).catch(() => null);

            if (!brief) {
                results.push({
                    slug: campaign.id,
                    name: campaign.name,
                    outcome: 'skipped',
                    message: 'Skipped because no aesthetic brief exists yet.',
                });
                continue;
            }

            try {
                const review = await runAestheticRedTeamReview(campaign, brief);
                const updatedBrief = {
                    ...brief,
                    redTeamReview: review,
                    humanReviewStatus: review.verdict === 'pass' ? brief.humanReviewStatus : 'revised' as const,
                };

                await saveAestheticBrief(updatedBrief);

                results.push({
                    slug: campaign.id,
                    name: campaign.name,
                    outcome: review.verdict === 'pass' ? 'passed' : review.verdict === 'warn' ? 'warned' : 'blocked',
                    message: review.approvalRecommendation,
                });
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : 'Unknown error';
                results.push({
                    slug: campaign.id,
                    name: campaign.name,
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
            skipped: results.filter((result) => result.outcome === 'skipped').length,
            failed: results.filter((result) => result.outcome === 'failed').length,
        };

        return NextResponse.json({ success: true, summary, results }, { status: 200 });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[Bulk Aesthetic Red Team Error]:', error);
        return NextResponse.json(
            { error: 'Failed to run bulk red-team review', details: message },
            { status: 500 },
        );
    }
}