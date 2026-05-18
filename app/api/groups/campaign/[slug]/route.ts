import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCampaignBlueprint, deleteCampaignBlueprint, saveCampaignBlueprint } from '@/lib/campaigns/campaign-store';
import { getLaunchWindowAssessment } from '@/lib/campaigns/launch-window';
import { VisualFlavorEnum } from '@/lib/campaigns/schema';
import { dispatchEmailBroadcast } from '@/lib/campaigns/email/email-event-orchestrator';

const CampaignPatchSchema = z.object({
    status: z.enum(['DRAFT', 'GATHERING_INTEREST', 'THRESHOLD_MET', 'CONVERTED', 'EXPIRED']).optional(),
    /**
     * Set to a VisualFlavor to lock that flavor as the campaign's manual override.
     * Set to `null` to clear the override and return to auto-selection.
     */
    manualVisualFlavor: z.union([VisualFlavorEnum, z.null()]).optional(),
    /**
     * Guest-facing activity invitations for the idea board.
     * Replace the discovery-pipeline optionalGatheringMoments with invitation-register copy
     * (action-forward, from the guest's POV) without re-running the full brief pipeline.
     * See: GUEST_PORTAL_REDESIGN.md §9 for copy format guidance.
     */
    optionalGatheringMoments: z.array(z.string().min(1).max(300)).min(1).max(10).optional(),
    /**
     * Phase 3 fields — setting these from null/empty triggers a broadcast to
     * every converted lead on the campaign:
     *   finalItineraryUrl   → `LLL Final Itinerary Published`
     *   tourConductorName   → `LLL Tour Conductor Announced`
     */
    finalItineraryUrl: z.union([z.string().url(), z.null()]).optional(),
    tourConductorName: z.union([z.string().trim().min(1).max(120), z.null()]).optional(),
    tourConductorBio: z.union([z.string().trim().max(1000), z.null()]).optional(),
}).refine(
    (value) =>
        value.status !== undefined
        || value.manualVisualFlavor !== undefined
        || value.optionalGatheringMoments !== undefined
        || value.finalItineraryUrl !== undefined
        || value.tourConductorName !== undefined
        || value.tourConductorBio !== undefined,
    { message: 'Patch must include at least one updatable field.' },
);

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
            matchedDeparturePort: campaign.matchedDeparturePort ?? null,
            matchedNights: campaign.matchedNights ?? null,
            odysseusItinerarySummary: campaign.odysseusItinerarySummary ?? null,
            odysseusPortsOfCall: campaign.odysseusPortsOfCall ?? null,
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
            researchDossier: campaign.researchDossier ?? null,
            researchDossierGeneratedAt: campaign.researchDossierGeneratedAt ?? null,
            optionalGatheringMoments: campaign.optionalGatheringMoments ?? [],
            optionalityStyle: campaign.optionalityStyle ?? null,
            solitudeRisks: campaign.solitudeRisks ?? [],
            discoveryRedTeamReview: campaign.discoveryRedTeamReview ?? null,
            discoveryIteration: campaign.discoveryIteration ?? null,
            cbagenttoolsGroupId: campaign.cbagenttoolsGroupId ?? null,
            cbagenttoolsBookingLink: campaign.cbagenttoolsBookingLink ?? null,
            manualVisualFlavor: campaign.manualVisualFlavor ?? null,
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

    const parsed = CampaignPatchSchema.safeParse(rawBody);
    if (!parsed.success) {
        return NextResponse.json(
            { success: false, error: 'Invalid patch payload.', issues: parsed.error.issues },
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

    const patch = parsed.data;
    const messages: string[] = [];
    const updatedCampaign = { ...campaign };

    if (patch.status !== undefined) {
        if (campaign.status === patch.status) {
            messages.push(`Campaign already in status ${campaign.status}.`);
        } else {
            updatedCampaign.status = patch.status;
            messages.push(`Status updated from ${campaign.status} to ${patch.status}.`);
        }
    }

    if (patch.manualVisualFlavor !== undefined) {
        if (patch.manualVisualFlavor === null) {
            delete updatedCampaign.manualVisualFlavor;
            messages.push('Cleared manualVisualFlavor; reverting to auto-selection.');
        } else {
            updatedCampaign.manualVisualFlavor = patch.manualVisualFlavor;
            messages.push(`manualVisualFlavor locked to "${patch.manualVisualFlavor}".`);
        }
    }

    if (patch.optionalGatheringMoments !== undefined) {
        updatedCampaign.optionalGatheringMoments = patch.optionalGatheringMoments;
        messages.push(`optionalGatheringMoments updated (${patch.optionalGatheringMoments.length} items).`);
    }

    // Phase 3 — capture before/after for itinerary / TC fields so we can decide
    // whether the change is the kind that should trigger a broadcast.
    const finalItineraryUrlChanged = patch.finalItineraryUrl !== undefined
        && (patch.finalItineraryUrl ?? null) !== (campaign.finalItineraryUrl ?? null);
    const finalItineraryBecamePopulated = patch.finalItineraryUrl !== undefined
        && !!patch.finalItineraryUrl
        && !campaign.finalItineraryUrl;
    if (patch.finalItineraryUrl !== undefined) {
        if (patch.finalItineraryUrl === null) {
            delete updatedCampaign.finalItineraryUrl;
            messages.push('Cleared finalItineraryUrl.');
        } else {
            updatedCampaign.finalItineraryUrl = patch.finalItineraryUrl;
            messages.push('finalItineraryUrl updated.');
        }
    }

    const tourConductorBecameNamed = patch.tourConductorName !== undefined
        && !!patch.tourConductorName
        && !campaign.tourConductorName;
    if (patch.tourConductorName !== undefined) {
        if (patch.tourConductorName === null) {
            delete updatedCampaign.tourConductorName;
            messages.push('Cleared tourConductorName.');
        } else {
            updatedCampaign.tourConductorName = patch.tourConductorName;
            messages.push(`Tour Conductor set to "${patch.tourConductorName}".`);
        }
    }
    if (patch.tourConductorBio !== undefined) {
        if (patch.tourConductorBio === null || patch.tourConductorBio === '') {
            delete updatedCampaign.tourConductorBio;
        } else {
            updatedCampaign.tourConductorBio = patch.tourConductorBio;
        }
        messages.push('Tour Conductor bio updated.');
    }

    const isUnchanged = updatedCampaign.status === campaign.status
        && updatedCampaign.manualVisualFlavor === campaign.manualVisualFlavor
        && JSON.stringify(updatedCampaign.optionalGatheringMoments) === JSON.stringify(campaign.optionalGatheringMoments)
        && !finalItineraryUrlChanged
        && updatedCampaign.tourConductorName === campaign.tourConductorName
        && updatedCampaign.tourConductorBio === campaign.tourConductorBio;

    if (isUnchanged) {
        return NextResponse.json({
            success: true,
            campaign,
            message: messages.join(' ') || 'No changes applied.',
        });
    }

    updatedCampaign.updatedAt = new Date().toISOString();
    await saveCampaignBlueprint(updatedCampaign);

    // Phase 2 — broadcast lifecycle email on status transitions.
    // Non-fatal: failures are logged but do not block the PATCH response.
    if (patch.status !== undefined && patch.status !== campaign.status) {
        if (patch.status === 'EXPIRED') {
            void dispatchEmailBroadcast(slug, 'campaign_expired').catch((err) => {
                console.error(`[CampaignPATCH] campaign_expired broadcast failed for ${slug}:`, err);
            });
        } else if (patch.status === 'THRESHOLD_MET') {
            // Auto-promote-from-waitlist already fires this; only emit here for
            // manual operator transitions (e.g. moving DRAFT → THRESHOLD_MET).
            void dispatchEmailBroadcast(slug, 'threshold_met').catch((err) => {
                console.error(`[CampaignPATCH] threshold_met broadcast failed for ${slug}:`, err);
            });
        }
    }

    // Phase 3 — broadcast Final Itinerary / Tour Conductor on first-population.
    // Targets only converted leads (filter applied inside the broadcast helper).
    if (finalItineraryBecamePopulated) {
        void dispatchEmailBroadcast(
            slug,
            'final_itinerary_published',
            {},
            { shouldSend: (lead) => lead.converted === true },
        ).catch((err) => {
            console.error(`[CampaignPATCH] final_itinerary_published broadcast failed for ${slug}:`, err);
        });
    }
    if (tourConductorBecameNamed) {
        void dispatchEmailBroadcast(
            slug,
            'tour_conductor_announced',
            {},
            { shouldSend: (lead) => lead.converted === true },
        ).catch((err) => {
            console.error(`[CampaignPATCH] tour_conductor_announced broadcast failed for ${slug}:`, err);
        });
    }

    return NextResponse.json({
        success: true,
        campaign: updatedCampaign,
        message: messages.join(' '),
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
