import { NextRequest, NextResponse } from "next/server";
import { getAestheticBrief, getCampaignBlueprint, saveAestheticBrief } from "@/lib/campaigns/campaign-store";
import { assertAestheticBriefPassedRedTeam } from '@/lib/campaigns/aesthetic-red-team';
import { getLaunchWindowAssessment, MINIMUM_CAMPAIGN_LEAD_DAYS } from '@/lib/campaigns/launch-window';

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ slug: string }> }
) {
    try {
        const { slug } = await params;

        const [brief, campaign] = await Promise.all([getAestheticBrief(slug), getCampaignBlueprint(slug)]);
        if (!brief || !campaign) {
            return NextResponse.json({ error: "Brief not found" }, { status: 404 });
        }

        const launchWindow = getLaunchWindowAssessment({
            matchedSailDate: campaign.matchedSailDate,
            targetDates: campaign.targetDates,
        });

        if (launchWindow.meetsMinimumLeadTime === false) {
            return NextResponse.json(
                {
                    error: 'Launch window too short for approval',
                    details: `This sailing is ${launchWindow.daysUntilSail} days away. Minimum required lead time is ${MINIMUM_CAMPAIGN_LEAD_DAYS} days.`,
                },
                { status: 409 },
            );
        }

        try {
            assertAestheticBriefPassedRedTeam(brief, slug);
        } catch (gateError) {
            const message = gateError instanceof Error ? gateError.message : 'Red-team gate failed';
            return NextResponse.json({ error: 'Red-team gate failed', details: message }, { status: 409 });
        }

        const approvedBrief = {
            ...brief,
            humanReviewStatus: 'approved' as const,
        };

        await saveAestheticBrief(approvedBrief);

        return NextResponse.json({ success: true, brief: approvedBrief }, { status: 200 });

    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error";
        console.error(`[Aesthetic Approval Error]:`, error);
        return NextResponse.json(
            { error: "Failed to approve aesthetic brief", details: message },
            { status: 500 }
        );
    }
}
