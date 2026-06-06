import { NextRequest, NextResponse } from 'next/server';
import { getCampaignLandingBySlug } from '@/lib/campaigns/landing/view-model';
import { isCampaignRetired } from '@/lib/campaigns/discovery-iteration';

export const dynamic = 'force-dynamic';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ slug: string }> },
) {
    const { slug } = await params;
    const preview = request.nextUrl.searchParams.get('preview') === '1';

    if (!slug) {
        return NextResponse.json({ success: false, error: 'Campaign slug is required.' }, { status: 400 });
    }

    const result = await getCampaignLandingBySlug(slug, { includeDraftPreview: preview });
    if (!result) {
        return NextResponse.json({ success: false, error: `No public landing data found for "${slug}".` }, { status: 404 });
    }

    // Retired campaigns are not public. Operators can still inspect via ?preview=1.
    if (!preview && isCampaignRetired(result.campaign)) {
        return NextResponse.json({ success: false, error: `No public landing data found for "${slug}".` }, { status: 404 });
    }

    return NextResponse.json({
        success: true,
        landing: result.landing,
        campaignStatus: result.campaign.status,
        preview,
    });
}