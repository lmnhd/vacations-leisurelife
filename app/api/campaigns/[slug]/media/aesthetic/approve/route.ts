import { NextRequest, NextResponse } from "next/server";
import { getAestheticBrief, saveAestheticBrief } from "@/lib/campaigns/campaign-store";
import { CampaignAestheticBriefSchema } from "@/lib/campaigns/schema";

export async function POST(
    req: NextRequest,
    { params }: { params: { slug: string } }
) {
    try {
        const { slug } = params;

        // Body could contain the fully user-edited brief
        const body = await req.json();

        // Validate with Zod before saving
        const parseResult = CampaignAestheticBriefSchema.safeParse(body);
        if (!parseResult.success) {
            return NextResponse.json(
                { error: "Invalid brief schema", details: parseResult.error.format() },
                { status: 400 }
            );
        }

        const brief = parseResult.data;

        // Ensure the slug matches the URL
        if (brief.slug !== slug) {
            return NextResponse.json({ error: "Slug mismatch" }, { status: 400 });
        }

        // Mark it as approved
        brief.humanReviewStatus = 'approved';

        // Save directly back to DynamoDB
        await saveAestheticBrief(brief);

        return NextResponse.json({ success: true, brief }, { status: 200 });

    } catch (error: any) {
        console.error(`[Aesthetic Approval Error]:`, error);
        return NextResponse.json(
            { error: "Failed to approve aesthetic brief", details: error.message },
            { status: 500 }
        );
    }
}
