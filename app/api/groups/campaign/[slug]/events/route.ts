import { NextRequest, NextResponse } from 'next/server';
import { getCampaignBlueprint } from '@/lib/campaigns/campaign-store';
import { listCampaignLeadEvents, listLeadEvents } from '@/lib/campaigns/conversion-store';

export const dynamic = 'force-dynamic';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ slug: string }> },
) {
    const { slug } = await params;
    if (!slug) {
        return NextResponse.json({ success: false, error: 'Campaign slug is required.' }, { status: 400 });
    }

    const campaign = await getCampaignBlueprint(slug);
    if (!campaign) {
        return NextResponse.json({ success: false, error: `No campaign found with slug: "${slug}".` }, { status: 404 });
    }

    const email = request.nextUrl.searchParams.get('email');

    const events = email
        ? await listLeadEvents(slug, email)
        : await listCampaignLeadEvents(slug);

    return NextResponse.json({
        success: true,
        campaignSlug: slug,
        email: email ?? null,
        events,
    });
}
