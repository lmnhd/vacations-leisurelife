// lib/ads/ad-format-context.ts
//
// Phase 4 (IMAGE_GEN_REVAMP_5-26): map each AdFormat to the ImageContext that
// represents how the operator curates assets for that surface.
//
// Curation lives in AssetCuration.{approvedContexts,blockedContexts,contextPriorities},
// and the contexts available are defined by ImageContextEnum in schema.ts. The
// render pack needs to ask: "when I'm rendering a meta_feed_square ad, which
// ImageContext should I check curation against?" — this file answers that.
//
// Today the available contexts cover the operator's primary curation surfaces
// (meta_ad_creative, instagram_cover). For the ad render pipeline we treat
// every ad format as carrying the meta_ad_creative curation intent unless a
// more specific context applies (e.g., the ig_square format aligns with the
// instagram_cover curation slot).

import type { ImageContext } from '@/lib/campaigns/schema';
import type { AdFormat } from './types';

/**
 * Return the ImageContext used to evaluate AssetCuration when rendering this
 * AdFormat. An operator who sets `blockedContexts: ["meta_ad_creative"]`
 * blocks the asset from every ad format that maps to that context.
 */
export function imageContextForAdFormat(format: AdFormat): ImageContext {
    switch (format) {
        case 'ig_square':
            return 'instagram_cover';
        // All other ad formats (meta feed, meta carousel, meta story/reel,
        // google display variants, story_reel, carousel, fb_google_display)
        // share the meta_ad_creative curation intent. Operators who want
        // finer-grained per-channel control can use suitabilityTags / antiTags.
        default:
            return 'meta_ad_creative';
    }
}
