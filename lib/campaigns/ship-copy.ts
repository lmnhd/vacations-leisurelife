import type { CampaignAestheticBrief } from './schema';
import type { Campaign } from './types';
import type { AdCopySet } from '@/lib/ads/types';
import { getAuthoritativeShipName } from './ship-context';
import {
    findMentionedKnownShips,
    normalizeSpecificShipName,
    replaceMentionedKnownShips,
} from './ship-names';

export function sanitizeShipCopyForCampaign(
    value: string,
    campaign: Campaign | null | undefined,
): string {
    return replaceMentionedKnownShips(value, getAuthoritativeShipName(campaign));
}

export function sanitizeShipCopy(
    value: string,
    canonicalShipName?: string | null,
): string {
    return replaceMentionedKnownShips(value, canonicalShipName);
}

export function findStaleShipMentionsForCampaign(
    value: string,
    campaign: Campaign | null | undefined,
): string[] {
    const canonical = normalizeSpecificShipName(getAuthoritativeShipName(campaign));
    return findMentionedKnownShips(value).filter((shipName) => shipName !== canonical);
}

function sanitizeShipNamesInValue<T>(value: T, canonicalShipName?: string | null): T {
    if (typeof value === 'string') {
        return sanitizeShipCopy(value, canonicalShipName) as T;
    }

    if (Array.isArray(value)) {
        return value.map((item) => sanitizeShipNamesInValue(item, canonicalShipName)) as T;
    }

    if (value && typeof value === 'object') {
        const proto = Object.getPrototypeOf(value);
        if (proto !== Object.prototype && proto !== null) {
            return value;
        }

        return Object.fromEntries(
            Object.entries(value).map(([key, entry]) => [
                key,
                sanitizeShipNamesInValue(entry, canonicalShipName),
            ]),
        ) as T;
    }

    return value;
}

export function sanitizeAestheticBriefShipCopy(
    brief: CampaignAestheticBrief,
    canonicalShipName?: string | null,
): CampaignAestheticBrief {
    return sanitizeShipNamesInValue(brief, canonicalShipName);
}

export function sanitizeAestheticBriefShipCopyForCampaign(
    brief: CampaignAestheticBrief,
    campaign: Campaign | null | undefined,
): CampaignAestheticBrief {
    return sanitizeAestheticBriefShipCopy(brief, getAuthoritativeShipName(campaign));
}

export function sanitizeAdCopySetShipCopy(
    copySet: AdCopySet,
    canonicalShipName?: string | null,
): AdCopySet {
    return sanitizeShipNamesInValue(copySet, canonicalShipName);
}

export function sanitizeAdCopySetShipCopyForCampaign(
    copySet: AdCopySet,
    campaign: Campaign | null | undefined,
): AdCopySet {
    return sanitizeAdCopySetShipCopy(copySet, getAuthoritativeShipName(campaign));
}
