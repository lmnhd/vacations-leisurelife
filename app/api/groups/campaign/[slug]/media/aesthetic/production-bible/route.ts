import { NextRequest, NextResponse } from "next/server";
import { getCampaignBlueprint, getAestheticBrief, saveAestheticBrief } from "@/lib/campaigns/campaign-store";
import { generateVisualPlanningFromBrief } from "@/lib/campaigns/aesthetic-engine";
import { lintProductionBuild } from "@/lib/campaigns/media/production-build-lint";

// Keep hobby-plan deployments valid; production access is blocked by middleware unless explicitly enabled.
export const maxDuration = 60;

export async function POST(
    _req: NextRequest,
    { params }: { params: Promise<{ slug: string }> }
) {
    try {
        const { slug } = await params;

        const [campaign, brief] = await Promise.all([
            getCampaignBlueprint(slug),
            getAestheticBrief(slug),
        ]);

        if (!campaign) {
            return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
        }
        if (!brief) {
            return NextResponse.json(
                { error: "No aesthetic brief found — generate the brief first" },
                { status: 404 }
            );
        }

        const visualPlanning = await generateVisualPlanningFromBrief(campaign, brief);

        const lintReport = lintProductionBuild({
            landingStillBible: visualPlanning.landingStillBible,
            productionBible: visualPlanning.productionBible,
            themeName: campaign.name,
            nicheKeywords: campaign.targetingKeywords ?? [],
        });

        const nextHumanReviewStatus = brief.humanReviewStatus === 'approved' || brief.humanReviewStatus === 'revised'
            ? 'revised' as const
            : 'pending' as const;

        const updatedBrief = {
            ...brief,
            landingStillBible: visualPlanning.landingStillBible,
            productionBible: visualPlanning.productionBible,
            productionBuildLint: lintReport,
            productionBuildStatus: lintReport.verdict,
            productionBuildEvaluatedAt: lintReport.evaluatedAt,
            humanReviewStatus: nextHumanReviewStatus,
            redTeamReview: undefined,
        };

        await saveAestheticBrief(updatedBrief);

        if (lintReport.verdict === 'fail') {
            return NextResponse.json(
                {
                    error: "Production build failed pre-spend quality checks — do not proceed to image generation.",
                    lintVerdict: lintReport.verdict,
                    blockingIssues: lintReport.blockingIssues,
                    warnings: lintReport.warnings,
                    scoreSummary: lintReport.scoreSummary,
                    approvalReset: nextHumanReviewStatus === 'revised',
                    brief: updatedBrief,
                },
                { status: 422 }
            );
        }

        return NextResponse.json(
            {
                brief: updatedBrief,
                lintVerdict: lintReport.verdict,
                lintReport,
                approvalReset: nextHumanReviewStatus === 'revised',
            },
            { status: 200 }
        );
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error";
        console.error("[Production Bible Generation Error]:", error);
        return NextResponse.json(
            { error: "Failed to generate production bible", details: message },
            { status: 500 }
        );
    }
}
