// lib/campaigns/media/ad-pack-adapter.ts
//
// Translates a campaign-native (Campaign + CampaignAestheticBrief + manifest)
// record set into the workflow-agnostic NormalizedAdInput shape that
// lib/ads/ consumes. Keeps the reusable ad engine clean of campaign domain
// types per Section 5 of MASTER_PLAN.md.

import type { CampaignAestheticBrief, CampaignMediaManifest } from '../schema';
import type { Campaign } from '../types';
import { listTemplateLayouts } from '@/lib/ads/template-registry';
import type {
    AdFormat,
    AvailableImageInventory,
    CopyForgeBriefSlice,
    CopyForgeCampaignSlice,
    CopyForgeDossierSlice,
    NormalizedAdInput,
} from '@/lib/ads/types';
import { normalizeCampaignResearchDossier } from '../schema';

function nicheSignalsFromBrief(brief: CampaignAestheticBrief, campaign: Campaign): string[] {
    const blueprint = brief.identityBlueprint;
    return [
        ...(blueprint?.evidenceOfBelonging ?? []),
        ...(blueprint?.imageBehavior ?? []),
        ...(campaign.allowedThemeSignals ?? []),
    ].filter((s): s is string => typeof s === 'string' && s.trim().length > 0);
}

function buildBriefSlice(brief: CampaignAestheticBrief, campaign: Campaign): CopyForgeBriefSlice {
    return {
        heroSlogan: brief.messaging.heroSlogan,
        subSlogan: brief.messaging.subSlogan,
        elevatorPitch: brief.messaging.elevatorPitch,
        avoidDirectives: [
            ...(brief.productionBible?.avoidDirectives ?? []),
            ...(brief.visual.avoidList ?? []),
        ],
        propFamilies: [
            ...(brief.identityBlueprint?.propFamilies ?? []),
            ...(brief.visual.plausibilityFramework?.allowedProps ?? []),
        ],
        nicheSignals: nicheSignalsFromBrief(brief, campaign),
        emotionalPromise: brief.identityBlueprint?.emotionalPromise ?? '',
        energyMode: brief.identityBlueprint?.energyMode ?? '',
        toneKeywords: brief.messaging.toneKeywords ?? [],
        cruiseNativeMoments: [
            ...(campaign.cruiseNativeMoments ?? []),
            ...(brief.visual.plausibilityFramework?.cruiseNativeMoments ?? []),
            ...(brief.visual.plausibilityFramework?.nicheEnhancedMoments ?? []),
        ],
    };
}

function buildCampaignSlice(campaign: Campaign): CopyForgeCampaignSlice {
    return {
        name: campaign.name,
        vessel: campaign.matchedShipName ?? campaign.shipTarget ?? '',
        route: campaign.odysseusPortsOfCall ?? campaign.targetDestination ?? '',
        departure: campaign.matchedSailDate ?? campaign.targetDates ?? '',
        theme: campaign.aesthetic ?? campaign.description ?? '',
    };
}

function buildDossierSlice(brief: CampaignAestheticBrief, campaign: Campaign): CopyForgeDossierSlice | null {
    const dossier =
        normalizeCampaignResearchDossier(brief.campaignResearchDossier) ??
        normalizeCampaignResearchDossier(campaign.researchDossier);
    if (!dossier) return null;
    return {
        audienceRoutineInsights: dossier.nicheResearch.audienceRoutineInsights ?? [],
        specificExamples: dossier.nicheResearch.specificExamples ?? [],
        allowedSignals: dossier.nicheResearch.allowedSignals ?? [],
        discouragedSignals: dossier.nicheResearch.discouragedSignals ?? [],
    };
}

function buildAvailableImages(manifest: CampaignMediaManifest | null): AvailableImageInventory {
    if (!manifest) {
        return { scene_image: 0, ship_reference: 0, hero: 0, aesthetic_concept: 0, still: 0, merch: 0 };
    }
    return {
        scene_image: manifest.images.sceneImages?.length ?? 0,
        ship_reference: manifest.images.shipReferences?.length ?? 0,
        hero: manifest.images.hero?.length ?? 0,
        aesthetic_concept: manifest.images.aestheticConcepts?.length ?? 0,
        // P1: still + merch pools have no first-class manifest section yet.
        // documentaryDetails is the closest existing "still"-shaped pool.
        still: manifest.images.documentaryDetails?.length ?? 0,
        merch: manifest.merch?.designs?.length ?? 0,
    };
}

export interface BuildCampaignAdInputArgs {
    brief: CampaignAestheticBrief;
    campaign: Campaign;
    manifest: CampaignMediaManifest | null;
    formats: AdFormat[];
}

/**
 * Translate the campaign domain triple (brief + campaign + manifest) into a
 * workflow-agnostic NormalizedAdInput.
 *
 * Throws if no templates are registered for (group_campaign, visualFlavor).
 */
export function buildCampaignAdInput(args: BuildCampaignAdInputArgs): NormalizedAdInput {
    const preferredVisualFlavor =
        args.campaign.manualVisualFlavor ??
        args.brief.identityBlueprint?.visualFlavor ??
        'travel_nostalgia';

    let visualFlavor = preferredVisualFlavor;
    let templateLayouts = listTemplateLayouts('group_campaign', visualFlavor);

    const hasRequestedTemplate = args.formats.some((format) => templateLayouts[format]);
    if (!hasRequestedTemplate && visualFlavor !== 'travel_nostalgia') {
        visualFlavor = 'travel_nostalgia';
        templateLayouts = listTemplateLayouts('group_campaign', visualFlavor);
    }

    return {
        workflow: 'group_campaign',
        slug: args.brief.slug,
        visualFlavor,
        formats: args.formats,
        brief: buildBriefSlice(args.brief, args.campaign),
        campaign: buildCampaignSlice(args.campaign),
        dossier: buildDossierSlice(args.brief, args.campaign),
        templateLayouts,
        availableImages: buildAvailableImages(args.manifest),
    };
}
