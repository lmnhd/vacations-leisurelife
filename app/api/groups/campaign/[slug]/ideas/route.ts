import { NextRequest, NextResponse } from 'next/server';
import { getCampaignBlueprint } from '@/lib/campaigns/campaign-store';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ slug: string }> };

export async function GET(_req: NextRequest, context: RouteContext) {
    const { slug } = await context.params;

    const campaign = await getCampaignBlueprint(slug);
    if (!campaign) {
        return NextResponse.json({ success: false, error: `Campaign "${slug}" not found.` }, { status: 404 });
    }

    return NextResponse.json({
        success: true,
        ideas: campaign.guestIdeas ?? [],
    });
}
