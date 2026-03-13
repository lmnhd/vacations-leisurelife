import { NextRequest, NextResponse } from "next/server";
import { getCampaignBlueprint, getAestheticBrief, saveAestheticBrief } from "@/lib/campaigns/campaign-store";
import { generateVisualPlanningFromBrief } from "@/lib/campaigns/aesthetic-engine";

// Production Bible generation can take 2-4 minutes — raise the timeout ceiling.
export const maxDuration = 300;

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

        const updatedBrief = {
            ...brief,
            landingStillBible: visualPlanning.landingStillBible,
            productionBible: visualPlanning.productionBible,
        };
        await saveAestheticBrief(updatedBrief);

        return NextResponse.json({ brief: updatedBrief }, { status: 200 });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error";
        console.error("[Production Bible Generation Error]:", error);
        return NextResponse.json(
            { error: "Failed to generate production bible", details: message },
            { status: 500 }
        );
    }
}
