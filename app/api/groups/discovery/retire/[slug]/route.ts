import { NextRequest, NextResponse } from 'next/server';
import { getCampaignBlueprint, saveCampaignBlueprint } from '@/lib/campaigns/campaign-store';
import { applyManualDiscoveryRetirement, clearDiscoveryRetirement, isCampaignRetired } from '@/lib/campaigns/discovery-iteration';
import { dispatchEmailBroadcast } from '@/lib/campaigns/email/email-event-orchestrator';

/**
 * POST /api/groups/discovery/retire/[slug]
 * Body (optional): { reason?: string }
 *
 * Manually retires a discovery campaign. Retired campaigns remain in DynamoDB
 * (so they still feed deduplication exclusion into new discovery runs) but
 * the discovery UI hides them by default.
 */
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ slug: string }> },
) {
    try {
        const { slug } = await params;
        const body = await req.json().catch(() => ({})) as { reason?: string };
        const campaign = await getCampaignBlueprint(slug);

        if (!campaign) {
            return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
        }

        const reason = typeof body?.reason === 'string' ? body.reason : '';

        // Only fire the cancellation broadcast on the transition INTO retirement,
        // so re-retiring an already-retired campaign doesn't re-spam its leads.
        const wasRetired = isCampaignRetired(campaign);

        const updated = {
            ...applyManualDiscoveryRetirement(campaign, reason),
            updatedAt: new Date().toISOString(),
        };

        await saveCampaignBlueprint(updated);

        // Notify everyone who signed up that this campaign is closed. Fire-and-forget
        // and non-fatal: a failed broadcast must not block the retirement itself.
        // `operatorNote` carries the retirement reason into the cancellation email.
        if (!wasRetired) {
            const operatorNote = reason.trim() || undefined;
            void dispatchEmailBroadcast(
                slug,
                'campaign_expired',
                operatorNote ? { phase2: { operatorNote } } : {},
            ).catch((err) => {
                console.error(`[DiscoveryRetire] campaign_expired broadcast failed for ${slug}:`, err);
            });
        }

        return NextResponse.json({ success: true, campaign: updated }, { status: 200 });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[Discovery Retire Error]:', error);
        return NextResponse.json(
            { error: 'Failed to retire campaign', details: message },
            { status: 500 },
        );
    }
}

/**
 * DELETE /api/groups/discovery/retire/[slug]
 * Reverses a manual retirement, restoring the campaign to active state.
 */
export async function DELETE(
    _req: NextRequest,
    { params }: { params: Promise<{ slug: string }> },
) {
    try {
        const { slug } = await params;
        const campaign = await getCampaignBlueprint(slug);

        if (!campaign) {
            return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
        }

        const updated = {
            ...clearDiscoveryRetirement(campaign),
            updatedAt: new Date().toISOString(),
        };

        await saveCampaignBlueprint(updated);

        return NextResponse.json({ success: true, campaign: updated }, { status: 200 });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[Discovery Unretire Error]:', error);
        return NextResponse.json(
            { error: 'Failed to unretire campaign', details: message },
            { status: 500 },
        );
    }
}
