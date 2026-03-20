import { NextRequest, NextResponse } from "next/server";
import { getAestheticBrief, deleteAestheticBrief } from "@/lib/campaigns/campaign-store";

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
