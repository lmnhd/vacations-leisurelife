import type { Campaign } from './types';

export function getAuthoritativeShipName(campaign: Campaign | null | undefined): string | null {
    const matchedShipName = campaign?.matchedShipName?.trim();
    if (matchedShipName) {
        return matchedShipName;
    }

    const shipTarget = campaign?.shipTarget?.trim();
    if (shipTarget) {
        return shipTarget;
    }

    return null;
}

export function getAuthoritativeShipNameOrFallback(
    campaign: Campaign | null | undefined,
    fallback: string,
): string {
    return getAuthoritativeShipName(campaign) ?? fallback;
}
