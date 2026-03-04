import { NextRequest, NextResponse } from "next/server";
import { getCampaignBlueprint, saveAestheticBrief, getAestheticBrief } from "@/lib/campaigns/campaign-store";
import { generateAestheticBrief } from "@/lib/campaigns/aesthetic-engine";

export async function GET(
    req: NextRequest,
    { params }: { params: { slug: string } }
) {
    try {
        const brief = await getAestheticBrief(params.slug);
        if (!brief) {
            return NextResponse.json({ error: "Brief not found" }, { status: 404 });
        }
        return NextResponse.json(brief, { status: 200 });
    } catch (error: any) {
        return NextResponse.json({ error: "Failed to fetch brief", details: error.message }, { status: 500 });
    }
}

export async function POST(
    req: NextRequest,
    { params }: { params: { slug: string } }
) {
    try {
        const { slug } = params;

        const campaign = await getCampaignBlueprint(slug);
        if (!campaign) {
            return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
        }

        // Call the two-pass engine
        const brief = await generateAestheticBrief(campaign);

        // Persist to DynamoDB via our storage util
        await saveAestheticBrief(brief);

        return NextResponse.json(brief, { status: 200 });

    } catch (error: any) {
        console.error(`[Aesthetic Generation Error]:`, error);
        return NextResponse.json(
            { error: "Failed to generate aesthetic brief", details: error.message },
            { status: 500 }
        );
    }
}
