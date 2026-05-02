import type { CampaignAestheticBrief } from '../../../schema';
import {
    buildOrganicSeedShotPrompts,
    ORGANIC_SEED_TARGET_DURATION_SECONDS,
    ORGANIC_SEED_SHOTS,
} from './organic-seed';
import {
    buildPaidVariantShotPrompts,
    PAID_VARIANT_TARGET_DURATION_SECONDS,
    PAID_VARIANT_SHOTS,
} from './paid-variant';

export type TikTokFormatId = 'organic_seed' | 'paid_variant';

export interface TikTokFormatSpec {
    formatId: TikTokFormatId;
    targetDurationSeconds: number;
    shotCount: number;
    distributionTag: string;
    buildShotPrompts: (brief: CampaignAestheticBrief) => string[];
}

const ORGANIC_SEED_FORMAT: TikTokFormatSpec = {
    formatId: 'organic_seed',
    targetDurationSeconds: ORGANIC_SEED_TARGET_DURATION_SECONDS,
    shotCount: ORGANIC_SEED_SHOTS.length,
    distributionTag: 'organic',
    buildShotPrompts: buildOrganicSeedShotPrompts,
};

const PAID_VARIANT_FORMAT: TikTokFormatSpec = {
    formatId: 'paid_variant',
    targetDurationSeconds: PAID_VARIANT_TARGET_DURATION_SECONDS,
    shotCount: PAID_VARIANT_SHOTS.length,
    distributionTag: 'paid',
    buildShotPrompts: buildPaidVariantShotPrompts,
};

const FORMAT_REGISTRY: Readonly<Record<TikTokFormatId, TikTokFormatSpec>> = {
    organic_seed: ORGANIC_SEED_FORMAT,
    paid_variant: PAID_VARIANT_FORMAT,
};

export function getTikTokFormat(formatId: TikTokFormatId): TikTokFormatSpec {
    return FORMAT_REGISTRY[formatId];
}

/** Infer format from a storyboard deliverable ID — falls back to organic_seed. */
export function inferTikTokFormat(deliverableId: string): TikTokFormatSpec {
    if (deliverableId.includes('paid')) return PAID_VARIANT_FORMAT;
    return ORGANIC_SEED_FORMAT;
}

export { buildOrganicSeedShotPrompts, ORGANIC_SEED_TARGET_DURATION_SECONDS };
export { buildPaidVariantShotPrompts, PAID_VARIANT_TARGET_DURATION_SECONDS };
