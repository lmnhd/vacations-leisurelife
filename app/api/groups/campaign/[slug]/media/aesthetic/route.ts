import { NextRequest, NextResponse } from "next/server";
import { getCampaignBlueprint, saveAestheticBrief, getAestheticBrief, deleteAestheticBrief } from "@/lib/campaigns/campaign-store";
import { generateAestheticBrief } from "@/lib/campaigns/aesthetic-engine";

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

        const campaign = await getCampaignBlueprint(slug);
        if (!campaign) {
            return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
        }

        // Call the two-pass engine
        const brief = await generateAestheticBrief(campaign);

        // Persist to DynamoDB via our storage util
        await saveAestheticBrief(brief);

        return NextResponse.json(brief, { status: 200 });

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
