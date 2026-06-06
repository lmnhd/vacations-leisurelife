import { NextRequest, NextResponse } from "next/server";
import { getAestheticBrief, deleteAestheticBrief, getCampaignBlueprint } from "@/lib/campaigns/campaign-store";
import { sanitizeAestheticBriefShipCopyForCampaign } from "@/lib/campaigns/ship-copy";
import { getAuthoritativeShipName } from "@/lib/campaigns/ship-context";

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ slug: string }> }
) {
    try {
        const { slug } = await params;
        const [brief, campaign] = await Promise.all([
            getAestheticBrief(slug),
            getCampaignBlueprint(slug).catch(() => null),
        ]);
        if (!brief) {
            return NextResponse.json({ error: "Brief not found" }, { status: 404 });
        }
        const responseBrief = campaign
            ? {
                ...sanitizeAestheticBriefShipCopyForCampaign(brief, campaign),
                shipName: getAuthoritativeShipName(campaign) ?? undefined,
            }
            : brief;
        return NextResponse.json(
            responseBrief,
            { status: 200 },
        );
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return NextResponse.json({ error: "Failed to fetch brief", details: message }, { status: 500 });
    }
}

// DEPRECATED: Use POST /api/groups/campaign/[slug]/brief instead.
// This route is retained for GET (fetch) and DELETE only.
export async function POST(
    _req: NextRequest,
    { params }: { params: Promise<{ slug: string }> }
) {
    const { slug } = await params;
    return NextResponse.json(
        {
            error: 'This route is deprecated.',
            details: `Use POST /api/groups/campaign/${slug}/brief to generate or refresh the brief bundle.`,
            replacement: `/api/groups/campaign/${slug}/brief`,
        },
        { status: 410 },
    );
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
