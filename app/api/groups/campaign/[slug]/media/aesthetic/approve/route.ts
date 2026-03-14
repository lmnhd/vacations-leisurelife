import { NextRequest, NextResponse } from "next/server";
import { getAestheticBrief, saveAestheticBrief } from "@/lib/campaigns/campaign-store";
import { assertAestheticBriefPassedRedTeam } from '@/lib/campaigns/aesthetic-red-team';

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ slug: string }> }
) {
    try {
        const { slug } = await params;

        const brief = await getAestheticBrief(slug);
        if (!brief) {
            return NextResponse.json({ error: "Brief not found" }, { status: 404 });
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
