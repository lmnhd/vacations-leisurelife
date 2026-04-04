import { createHmac, timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { upsertCampaignWaitlistEntry } from '@/lib/campaigns/waitlist-store';

export const dynamic = 'force-dynamic';

const SIGNATURE_HEADER = 'x-tiktok-signature';

function verifyTikTokSignature(rawBody: string, signatureHeader: string | null): boolean {
    const secret = process.env.TIKTOK_LEAD_WEBHOOK_SECRET?.trim();
    if (!secret) {
        console.warn('[TikTok-Webhook] TIKTOK_LEAD_WEBHOOK_SECRET is not set — rejecting all requests');
        return false;
    }

    if (!signatureHeader) {
        return false;
    }

    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    const encoder = new TextEncoder();
    const expectedBytes = encoder.encode(expected);
    const receivedBytes = encoder.encode(signatureHeader);

    if (expectedBytes.length !== receivedBytes.length) {
        return false;
    }

    return timingSafeEqual(expectedBytes, receivedBytes);
}

const TikTokLeadFieldSchema = z.object({
    name: z.string(),
    value: z.string().optional(),
    string_value: z.string().optional(),
});

const TikTokLeadEventSchema = z.object({
    form_id: z.string().optional(),
    ad_id: z.string().optional(),
    campaign_id: z.string().optional(),
    lead_id: z.string().optional(),
    create_time: z.number().optional(),
    field_data: z.array(TikTokLeadFieldSchema).optional(),
    custom_questions: z.array(TikTokLeadFieldSchema).optional(),
    campaign_slug: z.string().optional(),
});

const TikTokWebhookPayloadSchema = z.object({
    type: z.string().optional(),
    data: TikTokLeadEventSchema.optional(),
    campaign_slug: z.string().optional(),
});

function extractField(
    fieldData: z.infer<typeof TikTokLeadFieldSchema>[],
    key: string,
): string | null {
    const entry = fieldData.find(
        (f) => f.name.toLowerCase() === key.toLowerCase(),
    );
    return entry?.value?.trim() || entry?.string_value?.trim() || null;
}

function buildAttributionNote(leadEvent: z.infer<typeof TikTokLeadEventSchema>): string {
    const parts: string[] = ['leadSource=tiktok_paid'];
    if (leadEvent.ad_id) parts.push(`tiktok_ad_id=${leadEvent.ad_id}`);
    if (leadEvent.form_id) parts.push(`tiktok_form_id=${leadEvent.form_id}`);
    if (leadEvent.campaign_id) parts.push(`tiktok_campaign_id=${leadEvent.campaign_id}`);
    if (leadEvent.lead_id) parts.push(`tiktok_lead_id=${leadEvent.lead_id}`);
    return parts.join(' | ');
}

export async function POST(request: NextRequest) {
    const rawBody = await request.text();
    const signatureHeader = request.headers.get(SIGNATURE_HEADER);

    if (!verifyTikTokSignature(rawBody, signatureHeader)) {
        console.warn('[TikTok-Webhook] Signature verification failed');
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let parsedBody: unknown;
    try {
        parsedBody = JSON.parse(rawBody);
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsed = TikTokWebhookPayloadSchema.safeParse(parsedBody);
    if (!parsed.success) {
        return NextResponse.json(
            { error: 'Unexpected webhook payload shape', issues: parsed.error.flatten() },
            { status: 400 },
        );
    }

    const leadEvent = parsed.data.data;
    if (!leadEvent) {
        return NextResponse.json({ received: true, note: 'No lead data in payload' });
    }

    const allFields = [
        ...(leadEvent.field_data ?? []),
        ...(leadEvent.custom_questions ?? []),
    ];

    const email = extractField(allFields, 'email');
    if (!email) {
        console.warn('[TikTok-Webhook] Lead event missing email — cannot write to waitlist');
        return NextResponse.json(
            { error: 'Lead submission is missing required field: email' },
            { status: 422 },
        );
    }

    const campaignSlug =
        leadEvent.campaign_slug
        ?? parsed.data.campaign_slug
        ?? extractField(allFields, 'campaign_slug')
        ?? request.nextUrl.searchParams.get('campaign_slug');

    if (!campaignSlug) {
        console.warn('[TikTok-Webhook] Lead event missing campaign_slug — cannot route to waitlist');
        return NextResponse.json(
            { error: 'campaign_slug is required to route the lead. Pass it in the webhook payload or as a query param.' },
            { status: 422 },
        );
    }

    const firstName = extractField(allFields, 'first_name') ?? extractField(allFields, 'full_name')?.split(' ')[0] ?? 'Unknown';
    const rawLastName = extractField(allFields, 'last_name') ?? extractField(allFields, 'full_name')?.split(' ').slice(1).join(' ');
    const lastName = rawLastName || '—';

    const rawPassengerCount = extractField(allFields, 'passenger_count');
    const passengerCount = rawPassengerCount ? Math.max(1, parseInt(rawPassengerCount, 10) || 1) : 1;

    const preferredCabinType = extractField(allFields, 'preferred_cabin') ?? 'Inside';

    const attributionNote = buildAttributionNote(leadEvent);

    try {
        await upsertCampaignWaitlistEntry({
            slug: campaignSlug,
            email,
            firstName,
            lastName,
            passengerCount,
            preferredCabinType,
            specialRequests: attributionNote,
            bookingMode: 'GROUP_WAIT',
        });

        console.log(`[TikTok-Webhook] Lead written to waitlist: campaign=${campaignSlug} email=${email}`);
        return NextResponse.json({ received: true });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error writing lead to waitlist';
        console.error('[TikTok-Webhook] Failed to write lead to waitlist:', error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
