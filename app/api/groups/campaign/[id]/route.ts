import { NextRequest, NextResponse } from 'next/server';
import { getCampaignBlueprint, deleteCampaignBlueprint } from '@/lib/campaigns/campaign-store';

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    if (!id) {
        return NextResponse.json(
            { success: false, error: 'Campaign ID is required.' },
            { status: 400 }
        );
    }

    const campaign = await getCampaignBlueprint(id);

    if (!campaign) {
        return NextResponse.json(
            { success: false, error: `No campaign found with id: "${id}"` },
            { status: 404 }
        );
    }

    // AI-readable flat structure with descriptive field labels
    return NextResponse.json({
        success: true,
        campaign: {
            id: campaign.id,
            name: campaign.name,
            description: campaign.description,
            aesthetic: campaign.aesthetic ?? null,
            status: campaign.status,
            targetDates: campaign.targetDates,
            targetDestination: campaign.targetDestination ?? null,
            shipTarget: campaign.shipTarget ?? null,
            highlightEvents: campaign.highlightEvents ?? [],
            targetingKeywords: campaign.targetingKeywords ?? [],
            startingPrice: campaign.startingPrice ?? null,
            priceSource: campaign.priceSource ?? null,
            pricingStatus: campaign.pricingStatus ?? null,
            minCabinsRequired: campaign.minCabinsRequired,
            cbagenttoolsGroupId: campaign.cbagenttoolsGroupId ?? null,
            cbagenttoolsBookingLink: campaign.cbagenttoolsBookingLink ?? null,
            createdAt: campaign.createdAt,
            updatedAt: campaign.updatedAt,
        },
    });
}

export async function DELETE(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    if (!id) return NextResponse.json({ success: false, error: 'ID required' }, { status: 400 });
    await deleteCampaignBlueprint(id);
    return NextResponse.json({ success: true, deleted: id });
}
