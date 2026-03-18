import { NextRequest, NextResponse } from "next/server";
import { getCampaignBlueprint, saveAestheticBrief, getAestheticBrief, deleteAestheticBrief } from "@/lib/campaigns/campaign-store";
import { generateAestheticBrief, generateVisualPlanningFromBrief } from "@/lib/campaigns/aesthetic-engine";
import { lintProductionBuild } from "@/lib/campaigns/media/production-build-lint";

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ slug: string }> }
) {
    try {
        const { slug } = await params;
        const brief = await getAestheticBrief(slug);
        if (!brief) {
            return NextResponse.json({ error: "Brief not found" }, { status: 404 });
        }
        return NextResponse.json(brief, { status: 200 });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return NextResponse.json({ error: "Failed to fetch brief", details: message }, { status: 500 });
    }
}

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ slug: string }> }
) {
    try {
        const { slug } = await params;
        console.log(`[aesthetic-route] POST requested for ${slug}`);

        const campaign = await getCampaignBlueprint(slug);
        if (!campaign) {
            return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
        }

        const brief = await generateAestheticBrief(campaign);
        const visualPlanning = await generateVisualPlanningFromBrief(campaign, brief);
        const lintReport = lintProductionBuild({
            landingStillBible: visualPlanning.landingStillBible,
            productionBible: visualPlanning.productionBible,
            themeName: campaign.name,
            nicheKeywords: campaign.targetingKeywords ?? [],
        });

        const completedBrief = {
            ...brief,
            landingStillBible: visualPlanning.landingStillBible,
            productionBible: visualPlanning.productionBible,
            productionBuildLint: lintReport,
            productionBuildStatus: lintReport.verdict,
            productionBuildEvaluatedAt: lintReport.evaluatedAt,
            redTeamReview: undefined,
        };

        await saveAestheticBrief(completedBrief);

        console.log(`[aesthetic-route] POST completed for ${slug}`);

        return NextResponse.json(
            {
                ...completedBrief,
                lintVerdict: lintReport.verdict,
                lintReport,
            },
            { status: 200 },
        );

    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error";
        console.error(`[Aesthetic Generation Error]:`, error);
        return NextResponse.json(
            { error: "Failed to generate aesthetic brief", details: message },
            { status: 500 }
        );
    }
}

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ slug: string }> }
) {
    try {
        const { slug } = await params;
        await deleteAestheticBrief(slug);
        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error";
        console.error(`[Aesthetic Delete Error]:`, error);
        return NextResponse.json({ error: "Failed to delete aesthetic brief", details: message }, { status: 500 });
    }
}
