import type { Campaign } from './types';

export const PUBLIC_GROUP_CABIN_TARGET = 8;

export function getPublicGroupCabinTarget(_campaign: Pick<Campaign, 'minCabinsRequired'>): number {
    return PUBLIC_GROUP_CABIN_TARGET;
}

export function getPublicThresholdPercent(targetCabins: number, joinedEntries: number): number {
    if (targetCabins <= 0) {
        return 100;
    }

    return Math.max(0, Math.min(100, Math.round((joinedEntries / targetCabins) * 100)));
}