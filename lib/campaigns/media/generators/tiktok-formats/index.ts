import type { CampaignAestheticBrief } from '../../../schema';
import {
    buildOrganicSeedShotPrompts,
    buildOrganicSeedOverlayCards,
    ORGANIC_SEED_TARGET_DURATION_SECONDS,
    ORGANIC_SEED_SHOTS,
} from './organic-seed';
import {
    buildPaidVariantShotPrompts,
    buildPaidVariantOverlayCards,
    PAID_VARIANT_TARGET_DURATION_SECONDS,
    PAID_VARIANT_SHOTS,
} from './paid-variant';
import type { Storyboard } from '../../../schema';
import type { TikTokOverlayCardSpec } from '../tiktok-overlay-cards';

export type TikTokFormatId = 'organic_seed' | 'paid_variant';

export interface TikTokFormatSpec {
    formatId: TikTokFormatId;
    targetDurationSeconds: number;
    shotCount: number;
    /** Distribution tag applied to the asset record — used by the lint gate and publishing adapter. */
    distributionTag: 'organic' | 'paid';
    buildShotPrompts: (brief: CampaignAestheticBrief) => string[];
    buildOverlayCards: (brief: CampaignAestheticBrief, storyboard?: Storyboard) => TikTokOverlayCardSpec[];
}

const ORGANIC_SEED_FORMAT: TikTokFormatSpec = {
    formatId: 'organic_seed',
    targetDurationSeconds: ORGANIC_SEED_TARGET_DURATION_SECONDS,
    shotCount: ORGANIC_SEED_SHOTS.length,
    distributionTag: 'organic',
    buildShotPrompts: buildOrganicSeedShotPrompts,
    buildOverlayCards: buildOrganicSeedOverlayCards,
};

const PAID_VARIANT_FORMAT: TikTokFormatSpec = {
    formatId: 'paid_variant',
    targetDurationSeconds: PAID_VARIANT_TARGET_DURATION_SECONDS,
    shotCount: PAID_VARIANT_SHOTS.length,
    distributionTag: 'paid',
    buildShotPrompts: buildPaidVariantShotPrompts,
    buildOverlayCards: buildPaidVariantOverlayCards,
};

const FORMAT_REGISTRY: Readonly<Record<TikTokFormatId, TikTokFormatSpec>> = {
    organic_seed: ORGANIC_SEED_FORMAT,
    paid_variant: PAID_VARIANT_FORMAT,
};

// ────────────────────────────────────────────────────────────────────────────
// Explicit deliverable-to-format map.
// Add a row here whenever a new storyboard deliverable ID is introduced.
// This is the single source of truth for format selection — do NOT use
// substring matching on deliverable IDs elsewhere in the codebase.
// ────────────────────────────────────────────────────────────────────────────

const DELIVERABLE_FORMAT_MAP: Readonly<Record<string, TikTokFormatId>> = {
    tiktok_organic_seed:     'organic_seed',
    tiktok_organic_seed_001: 'organic_seed',
    tiktok_organic_seed_002: 'organic_seed',
    tiktok_seed:             'organic_seed',   // legacy brief engine deliverable ID
    tiktok_paid:             'paid_variant',
    tiktok_paid_variant:     'paid_variant',
    tiktok_paid_variant_001: 'paid_variant',
};

export function getTikTokFormat(formatId: TikTokFormatId): TikTokFormatSpec {
    return FORMAT_REGISTRY[formatId];
}

/**
 * Resolve TikTok format from a storyboard deliverableId.
 *
 * Uses the explicit DELIVERABLE_FORMAT_MAP — no substring matching.
 * Falls back to organic_seed when the deliverableId is not in the map
 * and logs a warning so unknown IDs are visible without hard-failing generation.
 */
export function inferTikTokFormat(deliverableId: string): TikTokFormatSpec {
    const mapped = DELIVERABLE_FORMAT_MAP[deliverableId];
    if (mapped) {
        return FORMAT_REGISTRY[mapped];
    }

    console.warn(
        `[tiktok-formats] Unknown deliverableId "${deliverableId}" — falling back to organic_seed. ` +
        `Add it to DELIVERABLE_FORMAT_MAP in tiktok-formats/index.ts to silence this warning.`
    );
    return ORGANIC_SEED_FORMAT;
}

export { buildOrganicSeedShotPrompts, buildOrganicSeedOverlayCards, ORGANIC_SEED_TARGET_DURATION_SECONDS };
export { buildPaidVariantShotPrompts, buildPaidVariantOverlayCards, PAID_VARIANT_TARGET_DURATION_SECONDS };
