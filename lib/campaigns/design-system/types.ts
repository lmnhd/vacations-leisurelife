import type { AssetRecord, CampaignAestheticBrief, CampaignEnergyMode } from '../schema';

export type DesignedAdArtifactKind =
    // System 1 — Editorial Magazine
    | 'editorial_cover_ad'
    | 'quote_card'
    | 'itinerary_toc_card'
    | 'contributor_card'
    // System 2 — Travel Nostalgia
    | 'postcard_hero'
    | 'air_mail_social'
    | 'boarding_pass'
    | 'baggage_tag'
    // System 3 — Indie Zine
    | 'zine_cover'
    | 'scribble_social'
    | 'sticker_sheet'
    // System 4 — Modern Brand (base)
    | 'type_hook_card'
    | 'image_detail_ad';

export type DocumentaryDetailKind =
    | 'trust_photo'
    | 'artifact_still_life'
    | 'texture_plate'
    | 'human_glimpse'
    | 'motion_plate';

export type CampaignEnergyProfile = 'calm' | 'warm' | 'energetic' | 'premium' | 'subculture';

/**
 * The active Claude Design visual system for this campaign's artifact pack.
 * System 4 is always the structural foundation. The others are expressive flavors.
 *
 * system_4_modular     → Modern brand, type-driven, high-volume base (always rendered)
 * system_1_editorial   → Editorial magazine flavor (premium / intellectual niches)
 * system_2_nostalgia   → Travel nostalgia flavor (warm / sentimental / family niches)
 * system_3_zine        → Indie zine / liner notes flavor (subcultural / fandom niches)
 *
 * See: .github/DOCS/Implementation/GROUP_STRATEGY/CAMPAIGN_MEDIA/VISUAL_SYSTEMS.md
 */
export type VisualSystem =
    | 'system_4_modular'
    | 'system_1_editorial'
    | 'system_2_nostalgia'
    | 'system_3_zine';

export interface NicheTokens {
    headline: string;
    italicWord: string;
    subhead: string;
    vesselName: string;
    route: string;
    departure: string;
    issueLabel: string;
    sectionLabels: string[];
    quote: string;
    quoteCite: string;
    cta: string;
    accentHex: string;
    /** Active visual system for this campaign. System 4 is always the structural base. */
    system: VisualSystem;
    nicheVocabulary: string[];
    energyProfile: CampaignEnergyProfile;
    energyMode: CampaignEnergyMode;
    visualTempo: string;
    propSignals: string[];
    momentSignals: string[];
    antiMood: string[];
    alignmentSummary: string;
}

export interface DocumentaryDetailSpec {
    kind: DocumentaryDetailKind;
    assetId: string;
    fileName: string;
    prompt: string;
}

export interface DesignedAdRenderSpec {
    kind: DesignedAdArtifactKind;
    assetId: string;
    fileName: string;
    width: number;
    height: number;
    tags: string[];
    sourceImage?: AssetRecord;
}

export interface AdArtifactGenerationResult {
    documentaryDetails: AssetRecord[];
    designedAds: AssetRecord[];
    tokens: NicheTokens;
}

export type BriefLikeForTokens = Pick<CampaignAestheticBrief, 'themeName' | 'visual' | 'messaging' | 'socialConcepts' | 'merch'>;
