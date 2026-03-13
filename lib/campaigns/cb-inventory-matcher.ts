/**
 * CB Group Inventory Matcher — Pure data logic, no Playwright.
 *
 * Takes a Campaign and a list of scraped CbGroupInventoryItems and
 * finds the best matching CB group block using fuzzy text matching.
 *
 * Called by run-phase-b.ts after the scrape completes.
 */

import { Campaign } from './types';
import { CbGroupInventoryItem } from '../../scripts/cb-inventory-scraper';

const CB_AGENT_SIID = process.env.CB_AGENT_SIID ?? '1049337';
const THEME_FEE_MULTIPLIER = 1.15;
const SHIP_TOKEN_STOP_WORDS = new Set(['the', 'and', 'with', 'from', 'ship', 'cruise', 'line', 'class', 'of', 'sea', 'seas']);

export interface CbInventoryMatch {
    cbGroupId: string;
    cbPersonalLink: string;
    cbPriceAdvantage: number;
    rawGroupPrice: number;
    computedStartingPrice: number;   // rawGroupPrice × 1.15
    priceSource: string;
    matchedShipName: string;
    matchedSailDate: string;
    matchedDeparturePort?: string;
    matchedNights?: string;
    matchScore: number;              // 0–100 confidence of the match
}

function normalizeComparableText(value: string): string {
    return value
        .toLowerCase()
        .replace(/\([^)]*\)/g, ' ')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function stripCruiseLinePrefixes(value: string): string {
    return value
        .replace(/^(celebrity cruises?|celebrity)\s+/i, '')
        .replace(/^(royal caribbean(?: international)?)\s+/i, '')
        .replace(/^(norwegian cruise line|norwegian)\s+/i, '')
        .trim();
}

function getSpecificShipName(value?: string): string | null {
    if (!value) {
        return null;
    }

    const normalized = normalizeComparableText(stripCruiseLinePrefixes(value));
    if (!normalized || normalized.includes(' class')) {
        return null;
    }

    return normalized;
}

function tokenizeShipName(value?: string): string[] {
    if (!value) {
        return [];
    }

    return normalizeComparableText(stripCruiseLinePrefixes(value))
        .split(/\s+/)
        .filter(token => token.length > 2)
        .filter(token => !SHIP_TOKEN_STOP_WORDS.has(token));
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

/**
 * Scores a CB inventory item against a campaign using keyword overlap.
 * Returns 0–100.
 */
function scoreMatch(campaign: Campaign, item: CbGroupInventoryItem): number {
    let score = 0;

    const itemText = [item.shipName, item.vendor, item.departurePort ?? '', item.sailDate]
        .join(' ')
        .toLowerCase();

    const requiredShipName = getSpecificShipName(campaign.shipTarget);
    const itemShipName = getSpecificShipName(item.shipName);

    // When the campaign names a concrete vessel, do not match across sister ships.
    if (requiredShipName && itemShipName && requiredShipName !== itemShipName) {
        return 0;
    }

    if (requiredShipName && itemShipName && requiredShipName === itemShipName) {
        score += 60;
    }

    // Ship / cruise line name match
    const shipTokens = tokenizeShipName(campaign.shipTarget);
    for (const token of shipTokens) {
        if (itemText.includes(token)) score += 25;
    }

    // Date / month match
    const dateTokens = campaign.targetDates.toLowerCase().split(/[\s,]+/).filter(t => t.length > 2);
    for (const token of dateTokens) {
        if (itemText.includes(token)) score += 20;
    }

    // Keyword overlap (destination signals)
    const keywords = (campaign.targetingKeywords ?? []).map(k => k.toLowerCase());
    for (const keyword of keywords) {
        if (itemText.includes(keyword)) score += 10;
    }

    // Destination match
    const destTokens = (campaign.targetDestination ?? '').toLowerCase().split(/[\s,]+/).filter(t => t.length > 2);
    for (const token of destTokens) {
        if (itemText.includes(token)) score += 15;
    }

    if (campaign.targetDates.trim().length > 0 && !item.sailDate?.trim()) {
        score -= 10;
    }

    return Math.min(score, 100);
}

// ─── Matcher ─────────────────────────────────────────────────────────────────

/**
 * Finds the best-matching CB inventory item for a campaign.
 * Returns null if no item scores above the minimum threshold (30).
 */
export function matchGroupInventoryToCampaign(
    campaign: Campaign,
    inventory: CbGroupInventoryItem[]
): CbInventoryMatch | null {
    const MIN_MATCH_SCORE = 25;

    if (inventory.length === 0) return null;

    let bestItem: CbGroupInventoryItem | null = null;
    let bestScore = 0;

    for (const item of inventory) {
        // Only need a valid groupId — price absence is handled at result time
        if (!item.groupId) continue;

        const score = scoreMatch(campaign, item);
        if (score > bestScore) {
            bestScore = score;
            bestItem = item;
        }
    }

    if (!bestItem || bestScore < MIN_MATCH_SCORE) {
        console.log(`[cb-inventory-matcher] No match for "${campaign.id}" (best score: ${bestScore})`);
        return null;
    }

    // Use parsed price if available; fall back to a baseline derived from priceAdvantage discount value
    const rawPrice = bestItem.startingPriceNumber > 0
        ? bestItem.startingPriceNumber
        : bestItem.priceAdvantageNumber > 0
            ? bestItem.priceAdvantageNumber * 100  // priceAdvantage is % off — rough baseline
            : 0;
    const cbPersonalLink = `https://bookings.cbagenttools.com/swift/cruise/package/${bestItem.groupId}?siid=${CB_AGENT_SIID}`;
    const computedStartingPrice = Math.round(rawPrice * THEME_FEE_MULTIPLIER);

    console.log(`[cb-inventory-matcher] ✅ Matched "${campaign.id}" → "${bestItem.shipName}" (score: ${bestScore}, price: $${computedStartingPrice})`);

    return {
        cbGroupId: bestItem.groupId,
        cbPersonalLink,
        cbPriceAdvantage: bestItem.priceAdvantageNumber,
        rawGroupPrice: bestItem.startingPriceNumber,
        computedStartingPrice,
        priceSource: 'CB_GROUP_INVENTORY',
        matchedShipName: bestItem.shipName,
        matchedSailDate: bestItem.sailDate,
        matchedDeparturePort: bestItem.departurePort,
        matchedNights: bestItem.nights,
        matchScore: bestScore,
    };
}
