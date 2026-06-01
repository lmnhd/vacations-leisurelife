import type { AssetType } from '../schema';

// ────────────────────────────────────────────────────────────────────────────
// assetType → manifest section mapping
//
// Used by the history/restore route and any future code that needs to place
// an AssetRecord into the correct CampaignMediaManifest slot.
// platform_crop is intentionally excluded — its sub-format routing (ImageFormat
// key) requires caller-supplied context that this static map cannot provide.
// ────────────────────────────────────────────────────────────────────────────

export type ManifestAssetSection =
    | 'shipReferences'
    | 'hero'
    | 'flyerImages'
    | 'aestheticConcepts'
    | 'sceneImages'
    | 'documentaryDetails'
    | 'alternateArt'
    | 'designedAdArtifacts'
    | 'tiktokSeed'
    | 'heroExplainer'
    | 'thresholdAnnouncement'
    | 'countdown'
    | 'broll'
    | 'ambientNarration'
    | 'hypeClip'
    | 'themeMusic'
    | 'designs'
    | 'mockups';

const ASSET_TYPE_TO_SECTION: Partial<Record<AssetType, ManifestAssetSection>> = {
    ship_reference_image:      'shipReferences',
    hero_image:                'hero',
    flyer_image:               'flyerImages',
    aesthetic_concept:         'aestheticConcepts',
    scene_image:               'sceneImages',
    documentary_detail_image:  'documentaryDetails',
    alternate_art:             'alternateArt',
    designed_ad_artifact:      'designedAdArtifacts',
    tiktok_seed_video:         'tiktokSeed',
    hero_explainer_video:      'heroExplainer',
    threshold_video:           'thresholdAnnouncement',
    countdown_video:           'countdown',
    broll_clip:                'broll',
    ambient_narration:         'ambientNarration',
    hype_clip:                 'hypeClip',
    theme_music:               'themeMusic',
    merch_design:              'designs',
};

export function assetTypeToManifestSection(assetType: AssetType): ManifestAssetSection | null {
    return ASSET_TYPE_TO_SECTION[assetType] ?? null;
}

/** Asset types supported by the history/restore flow (excludes platform_crop). */
export const HISTORY_SUPPORTED_ASSET_TYPES = Object.keys(ASSET_TYPE_TO_SECTION) as AssetType[];

/** Per-tab primary asset types used by the history panel to scope its fetch. */
export const TAB_HISTORY_ASSET_TYPES: Record<string, AssetType[]> = {
    references:   ['ship_reference_image'],
    designed_ads: ['designed_ad_artifact'],
    documentary_details: ['documentary_detail_image'],
    alternate_art: ['alternate_art'],
    heroes:       ['hero_image', 'aesthetic_concept'],
    flyers:       ['flyer_image'],
    scenes:       ['scene_image'],
    video:        ['tiktok_seed_video', 'hero_explainer_video', 'threshold_video', 'countdown_video', 'broll_clip'],
    audio:        ['ambient_narration', 'hype_clip', 'theme_music'],
    merch:        ['merch_design'],
};
