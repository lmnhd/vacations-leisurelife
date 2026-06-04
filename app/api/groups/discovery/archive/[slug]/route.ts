import { NextRequest, NextResponse } from 'next/server';
import { getCampaignBlueprint, saveCampaignBlueprint } from '@/lib/campaigns/campaign-store';
import { applyCampaignArchive, clearCampaignArchive } from '@/lib/campaigns/discovery-iteration';

/**
 * POST /api/groups/discovery/archive/[slug]
 *
 * Archives a campaign. Archived campaigns are EXCLUDED from the model's dedup
 * feedback (so it may surface adjacent ideas again) and hidden from the default
 * discovery view, but the record is kept in DynamoDB. Non-destructive and
 * reversible. A campaign auto-leaves archived when its status advances past DRAFT.
 *
 * Distinct from retire (which hides the campaign but KEEPS feeding dedup).
 */
export async function POST(
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
            ...applyCampaignArchive(campaign),
            updatedAt: new Date().toISOString(),
        };
        await saveCampaignBlueprint(updated);

        return NextResponse.json({ success: true, campaign: updated }, { status: 200 });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[Discovery Archive Error]:', error);
        return NextResponse.json(
            { error: 'Failed to archive campaign', details: message },
            { status: 500 },
        );
    }
}

/**
 * DELETE /api/groups/discovery/archive/[slug]
 * Reverses an archive, restoring the campaign to the dedup pool and default view.
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
            ...clearCampaignArchive(campaign),
            updatedAt: new Date().toISOString(),
        };
        await saveCampaignBlueprint(updated);

        return NextResponse.json({ success: true, campaign: updated }, { status: 200 });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[Discovery Unarchive Error]:', error);
        return NextResponse.json(
            { error: 'Failed to unarchive campaign', details: message },
            { status: 500 },
        );
    }
}
