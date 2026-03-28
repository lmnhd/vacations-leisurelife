import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCampaignBlueprint, deleteCampaignBlueprint, saveCampaignBlueprint } from '@/lib/campaigns/campaign-store';
import { getLaunchWindowAssessment } from '@/lib/campaigns/launch-window';

const CampaignStatusPatchSchema = z.object({
    status: z.enum(['DRAFT', 'GATHERING_INTEREST', 'THRESHOLD_MET', 'CONVERTED', 'EXPIRED']),
});

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

export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ slug: string }> }
) {
    const { slug } = await params;

    if (!slug) {
        return NextResponse.json(
            { success: false, error: 'Campaign slug is required.' },
            { status: 400 }
        );
    }

    let rawBody: unknown = {};
    try {
        rawBody = await req.json();
    } catch {
        rawBody = {};
    }

    const parsed = CampaignStatusPatchSchema.safeParse(rawBody);
    if (!parsed.success) {
        return NextResponse.json(
            { success: false, error: 'Invalid status payload.', issues: parsed.error.issues },
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

    if (campaign.status === parsed.data.status) {
        return NextResponse.json({
            success: true,
            campaign,
            message: `Campaign already in status ${campaign.status}.`,
        });
    }

    const updatedCampaign = {
        ...campaign,
        status: parsed.data.status,
        updatedAt: new Date().toISOString(),
    };

    await saveCampaignBlueprint(updatedCampaign);

    return NextResponse.json({
        success: true,
        campaign: updatedCampaign,
        message: `Campaign status updated from ${campaign.status} to ${updatedCampaign.status}.`,
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
