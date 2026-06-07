import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCampaignBlueprint } from '@/lib/campaigns/campaign-store';
import { appendLeadEvent } from '@/lib/campaigns/conversion-store';
import { isCampaignRetired } from '@/lib/campaigns/discovery-iteration';
import { normalizeAttribution } from '@/lib/campaigns/lead-attribution';

export const dynamic = 'force-dynamic';

const AttributionSchema = z.object({
    sourceChannel: z.string().trim().optional(),
    provider: z.string().trim().optional(),
    providerDraftType: z.string().trim().optional(),
    providerCampaignId: z.string().trim().optional(),
    providerAdGroupId: z.string().trim().optional(),
    providerAdId: z.string().trim().optional(),
    providerLeadId: z.string().trim().optional(),
    landingPath: z.string().trim().optional(),
    referrer: z.string().trim().optional(),
    utmSource: z.string().trim().optional(),
    utmMedium: z.string().trim().optional(),
    utmCampaign: z.string().trim().optional(),
    utmContent: z.string().trim().optional(),
    utmTerm: z.string().trim().optional(),
    sessionId: z.string().trim().optional(),
});

const PageViewSchema = z.object({
    attribution: AttributionSchema,
    metadata: z.record(z.string().trim(), z.string().trim()).optional(),
    // Which landing signal this is. 'landing_page_view' = raw per-session reach;
    // 'landing_engaged' = one-time-per-browser qualified view (pop-up dismissed / first load).
    eventType: z.enum(['landing_page_view', 'landing_engaged']).optional(),
});

function truncate(value: string | null, maxLength: number): string | undefined {
    const trimmed = value?.trim();
    if (!trimmed) {
        return undefined;
    }
    return trimmed.slice(0, maxLength);
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ slug: string }> },
) {
    const { slug } = await params;
    if (!slug) {
        return NextResponse.json({ success: false, error: 'Campaign slug is required.' }, { status: 400 });
    }

    const body = await request.json().catch(() => null);
    const parsed = PageViewSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({
            success: false,
            error: 'Invalid page-view payload.',
            issues: parsed.error.flatten(),
        }, { status: 400 });
    }

    const campaign = await getCampaignBlueprint(slug);
    if (!campaign) {
        return NextResponse.json({ success: false, error: `No campaign found with slug: "${slug}".` }, { status: 404 });
    }

    if (campaign.status === 'DRAFT' || campaign.status === 'EXPIRED' || isCampaignRetired(campaign)) {
        return NextResponse.json({ success: true, tracked: false, reason: 'campaign_not_public' });
    }

    const attribution = normalizeAttribution(parsed.data.attribution);
    const userAgent = truncate(request.headers.get('user-agent'), 180);
    const metadata = {
        ...(parsed.data.metadata ?? {}),
        eventFamily: 'landing_traffic',
        ...(userAgent ? { userAgent } : {}),
    };

    const eventType = parsed.data.eventType ?? 'landing_page_view';
    const notes = eventType === 'landing_engaged'
        ? 'Anonymous one-time landing engagement.'
        : 'Anonymous landing page view.';

    const event = await appendLeadEvent({
        campaignSlug: slug,
        email: 'anonymous',
        eventType,
        attribution,
        notes,
        metadata,
    });

    return NextResponse.json({
        success: true,
        tracked: true,
        eventId: event.eventId,
    });
}
