import { NextRequest, NextResponse } from 'next/server';
import { getCampaignBlueprint, deleteCampaignBlueprint } from '@/lib/campaigns/campaign-store';
import { getLaunchWindowAssessment } from '@/lib/campaigns/launch-window';

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ slug: string }> }
) {
    const { slug } = await params;

    if (!slug) {
        return NextResponse.json(
            { success: false, error: 'Campaign slug is required.' },
            { status: 400 }
        );
    }

    const campaign = await getCampaignBlueprint(slug);

    if (!campaign) {
        return NextResponse.json(
            { success: false, error: `No campaign found with slug: "${slug}"` },
            { status: 404 }
        );
    }

    // AI-readable flat structure with descriptive field labels
    return NextResponse.json({
        success: true,
        campaign: {
            ...getLaunchWindowAssessment({ matchedSailDate: campaign.matchedSailDate, targetDates: campaign.targetDates }),
            id: campaign.id,
            name: campaign.name,
            description: campaign.description,
            aesthetic: campaign.aesthetic ?? null,
            status: campaign.status,
            targetDates: campaign.targetDates,
            targetDestination: campaign.targetDestination ?? null,
            shipTarget: campaign.shipTarget ?? null,
            matchedShipName: campaign.matchedShipName ?? null,
            matchedSailDate: campaign.matchedSailDate ?? null,
            highlightEvents: campaign.highlightEvents ?? [],
            targetingKeywords: campaign.targetingKeywords ?? [],
            startingPrice: campaign.startingPrice ?? null,
            priceSource: campaign.priceSource ?? null,
            pricingStatus: campaign.pricingStatus ?? null,
            minCabinsRequired: campaign.minCabinsRequired,
            researchRationale: campaign.researchRationale ?? null,
            successLogic: campaign.successLogic ?? null,
            audienceSignals: campaign.audienceSignals ?? [],
            vacationFitRationale: campaign.vacationFitRationale ?? null,
            cruiseNativeMoments: campaign.cruiseNativeMoments ?? [],
            nicheExpressionMode: campaign.nicheExpressionMode ?? null,
            implausibleLiteralizations: campaign.implausibleLiteralizations ?? [],
            allowedThemeSignals: campaign.allowedThemeSignals ?? [],
            discouragedThemeSignals: campaign.discouragedThemeSignals ?? [],
            communityFitRationale: campaign.communityFitRationale ?? null,
            optionalGatheringMoments: campaign.optionalGatheringMoments ?? [],
            optionalityStyle: campaign.optionalityStyle ?? null,
            solitudeRisks: campaign.solitudeRisks ?? [],
            discoveryRedTeamReview: campaign.discoveryRedTeamReview ?? null,
            discoveryIteration: campaign.discoveryIteration ?? null,
            cbagenttoolsGroupId: campaign.cbagenttoolsGroupId ?? null,
            cbagenttoolsBookingLink: campaign.cbagenttoolsBookingLink ?? null,
            createdAt: campaign.createdAt,
            updatedAt: campaign.updatedAt,
        },
    });
}

export async function DELETE(
    _req: NextRequest,
    { params }: { params: Promise<{ slug: string }> }
) {
    const { slug } = await params;
    if (!slug) return NextResponse.json({ success: false, error: 'Slug required' }, { status: 400 });
    await deleteCampaignBlueprint(slug);
    return NextResponse.json({ success: true, deleted: slug });
}
