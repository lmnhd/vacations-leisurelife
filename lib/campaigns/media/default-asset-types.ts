import type { AssetType } from '../schema';

// The production "all media" bundle intentionally excludes the legacy narrated
// video family. Those deliverables now run only when explicitly requested.
export const PRODUCTION_ALL_MEDIA_ASSET_TYPES: readonly AssetType[] = [
    'ship_reference_image',
    'hero_image',
    'aesthetic_concept',
    'scene_image',
    'platform_crop',
    'documentary_detail_image',
    'designed_ad_artifact',
    'tiktok_seed_video',
    'ambient_narration',
    'hype_clip',
    'theme_music',
    'merch_design',
    'email_header',
    'ad_creative',
    'carousel_slide',
];

export const LEGACY_VIDEO_ASSET_TYPES: readonly AssetType[] = [
    'hero_explainer_video',
    'threshold_video',
    'countdown_video',
    'broll_clip',
];
