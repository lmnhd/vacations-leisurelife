/**
 * RCL Ship-Class Affinity
 *
 * The CB inventory matcher needs to rank ships *within* a single cruise line
 * (inventory is ~95% Royal Caribbean, so niche→line affinity barely
 * differentiates). Ship CLASS is the dimension that actually distinguishes
 * products for a niche — an intimate Radiance-class scenic sailing is a totally
 * different fit from a mega-resort Icon-class party ship.
 *
 * This is the same fleet knowledge already encoded in the discovery prompt
 * (`buildCbInventoryHardConstraintBlock` in app/api/groups/discovery/core-logic.ts),
 * lifted here so matching can use it as a scoring signal rather than relying on
 * rigid ship-name text overlap.
 */

import type { Campaign } from './types';

export type ShipClass = 'ICON_OASIS' | 'QUANTUM' | 'VOYAGER' | 'RADIANCE' | 'VISION' | 'UNKNOWN';

// Canonical ship name (lowercase, no cruise-line prefix) → class.
// Keep names normalized the same way getSpecificShipName produces them.
const SHIP_CLASS_BY_NAME: Record<string, ShipClass> = {
    // Icon + Oasis class — mega-resort
    'icon of the seas': 'ICON_OASIS',
    'star of the seas': 'ICON_OASIS',
    'utopia of the seas': 'ICON_OASIS',
    'wonder of the seas': 'ICON_OASIS',
    'oasis of the seas': 'ICON_OASIS',
    'allure of the seas': 'ICON_OASIS',
    'symphony of the seas': 'ICON_OASIS',
    'harmony of the seas': 'ICON_OASIS',
    // Quantum class — tech-forward smart ship
    'quantum of the seas': 'QUANTUM',
    'anthem of the seas': 'QUANTUM',
    'ovation of the seas': 'QUANTUM',
    'odyssey of the seas': 'QUANTUM',
    'spectrum of the seas': 'QUANTUM',
    // Voyager + Freedom class — active/entertainment
    'freedom of the seas': 'VOYAGER',
    'liberty of the seas': 'VOYAGER',
    'independence of the seas': 'VOYAGER',
    'voyager of the seas': 'VOYAGER',
    'explorer of the seas': 'VOYAGER',
    'adventure of the seas': 'VOYAGER',
    'navigator of the seas': 'VOYAGER',
    'mariner of the seas': 'VOYAGER',
    // Radiance class — intimate, scenic, glass panoramas
    'radiance of the seas': 'RADIANCE',
    'brilliance of the seas': 'RADIANCE',
    'jewel of the seas': 'RADIANCE',
    'serenade of the seas': 'RADIANCE',
    // Vision class — oldest/smallest, classic ocean-liner feel
    'vision of the seas': 'VISION',
    'enchantment of the seas': 'VISION',
    'grandeur of the seas': 'VISION',
    'rhapsody of the seas': 'VISION',
    'splendour of the seas': 'VISION',
};

/**
 * Niche-signal keywords that fit each ship class. Matching the campaign's
 * combined signal text against these awards class-fit points.
 */
const CLASS_AFFINITY_KEYWORDS: Record<Exclude<ShipClass, 'UNKNOWN'>, string[]> = {
    ICON_OASIS: [
        'family', 'kids', 'multigenerational', 'party', 'nightlife', 'music', 'festival',
        'entertainment', 'gaming', 'beach', 'tropical', 'high-energy', 'social', 'crowd',
        'broadway', 'waterpark', 'thrill',
    ],
    QUANTUM: [
        'tech', 'adventure', 'active', 'sport', 'esports', 'gaming', 'innovation', 'futurist',
        'sci-fi', 'science fiction', 'young', 'energetic', 'skydiving', 'bumper',
    ],
    VOYAGER: [
        'active', 'entertainment', 'fandom', 'pop culture', 'cosplay', 'sport', 'surf',
        'ice', 'climbing', 'accessible', 'social', 'games',
    ],
    RADIANCE: [
        'wine', 'culinary', 'food', 'art', 'arts', 'culture', 'literary', 'books', 'reading',
        'cottagecore', 'slow', 'scenic', 'photography', 'nature', 'cozy', 'craft', 'tea',
        'analog', 'maker', 'sketch', 'painting', 'fiber', 'knit', 'quiet', 'calm', 'alaska',
    ],
    VISION: [
        'retro', 'nostalgia', 'vintage', 'classic', 'lgbtq', 'tight-knit', 'intimate',
        'heritage', 'old-world', 'antique', 'collectors', 'analog', 'slow',
    ],
};

const CLASS_FIT_POINTS = 12; // per matched keyword; capped below
const CLASS_FIT_CAP = 40;    // primary-signal weight, comparable to niche-line affinity

function normalize(value?: string | null): string {
    return (value ?? '')
        .toLowerCase()
        .replace(/\([^)]*\)/g, ' ')
        .replace(/^(royal caribbean(?: international)?|celebrity cruises?|celebrity|norwegian cruise line|norwegian)\s+/i, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/** Resolves a raw ship name to its RCL class, or UNKNOWN. */
export function getShipClass(shipName?: string | null): ShipClass {
    const key = normalize(shipName);
    if (!key) return 'UNKNOWN';
    return SHIP_CLASS_BY_NAME[key] ?? 'UNKNOWN';
}

/** Combined lowercase niche-signal text for a campaign (mirrors niche-affinity). */
function campaignSignalText(campaign: Campaign): string {
    return [
        campaign.name ?? '',
        campaign.description ?? '',
        campaign.aesthetic ?? '',
        ...(campaign.targetingKeywords ?? []),
        ...(campaign.highlightEvents ?? []),
    ].join(' ').toLowerCase();
}

/**
 * Scores how well a ship's CLASS fits a campaign's niche. 0 when the class is
 * unknown or no signal keywords match. Capped so it acts as a strong-but-bounded
 * primary contributor to the overall match score.
 */
export function getShipClassAffinityScore(campaign: Campaign, shipName?: string | null): number {
    const shipClass = getShipClass(shipName);
    if (shipClass === 'UNKNOWN') return 0;
    const signal = campaignSignalText(campaign);
    if (!signal.trim()) return 0;

    const keywords = CLASS_AFFINITY_KEYWORDS[shipClass];
    let hits = 0;
    for (const kw of keywords) {
        if (signal.includes(kw)) hits += 1;
    }
    return Math.min(hits * CLASS_FIT_POINTS, CLASS_FIT_CAP);
}

/** Human-readable class-fit summary for debug logging. */
export function describeShipClassFit(campaign: Campaign, shipName?: string | null): string {
    const shipClass = getShipClass(shipName);
    if (shipClass === 'UNKNOWN') return 'class: unknown';
    const score = getShipClassAffinityScore(campaign, shipName);
    return `class: ${shipClass}(+${score})`;
}
