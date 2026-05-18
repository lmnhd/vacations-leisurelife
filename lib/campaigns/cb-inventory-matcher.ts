/**
 * CB Group Inventory Matcher — Pure data logic, no Playwright.
 *
 * Takes a Campaign and a list of scraped CbGroupInventoryItems and
 * finds the best matching CB group block using fuzzy text matching.
 *
 * Called by run-phase-b.ts after the scrape completes.
 */

import type { Campaign, CampaignInventoryCandidate } from "./types";
import { CbGroupInventoryItem } from "./cb-inventory-types";
import { getLaunchWindowAssessment } from "./launch-window";

const CB_AGENT_SIID = process.env.CB_AGENT_SIID ?? "1049337";
const THEME_FEE_MULTIPLIER = 1.15;
const SHIP_TOKEN_STOP_WORDS = new Set([
  "the",
  "and",
  "with",
  "from",
  "ship",
  "cruise",
  "line",
  "class",
  "of",
  "sea",
  "seas",
]);
const SHIP_NAME_DELIMITER = /\s+[\-\u2013\u2014|:]\s+/;
const MONTH_ALIASES = new Map<string, number>([
  ["jan", 1],
  ["january", 1],
  ["feb", 2],
  ["february", 2],
  ["mar", 3],
  ["march", 3],
  ["apr", 4],
  ["april", 4],
  ["may", 5],
  ["jun", 6],
  ["june", 6],
  ["jul", 7],
  ["july", 7],
  ["aug", 8],
  ["august", 8],
  ["sep", 9],
  ["sept", 9],
  ["september", 9],
  ["oct", 10],
  ["october", 10],
  ["nov", 11],
  ["november", 11],
  ["dec", 12],
  ["december", 12],
]);

export interface CbInventoryMatch {
  cbGroupId: string;
  cbPersonalLink: string;
  cbPriceAdvantage: number;
  rawGroupPrice: number;
  computedStartingPrice: number; // rawGroupPrice × 1.15
  priceSource: string;
  matchedShipName: string;
  matchedSailDate: string;
  matchedDeparturePort?: string;
  matchedNights?: string;
  odysseusItinerarySummary?: string;
  odysseusPortsOfCall?: string;
  matchScore: number; // 0–100 confidence of the match
  odysseusRetailBookingLink: string | null;
}

function normalizeComparableText(value: string): string {
  return value
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripCruiseLinePrefixes(value: string): string {
  return value
    .replace(/^(celebrity cruises?|celebrity)\s+/i, "")
    .replace(/^(royal caribbean(?: international)?)\s+/i, "")
    .replace(/^(norwegian cruise line|norwegian)\s+/i, "")
    .trim();
}

function extractCanonicalShipFragment(value: string): string {
  const withoutParenthetical = value.replace(/\([^)]*\)/g, " ").trim();
  const firstSegment =
    withoutParenthetical.split(SHIP_NAME_DELIMITER)[0]?.trim() ??
    withoutParenthetical.trim();
  return firstSegment;
}

function getSpecificShipName(value?: string): string | null {
  if (!value) {
    return null;
  }

  const canonicalShipName = extractCanonicalShipFragment(value);
  const normalized = normalizeComparableText(
    stripCruiseLinePrefixes(canonicalShipName),
  );
  if (!normalized || normalized.includes(" class")) {
    return null;
  }

  return normalized;
}

function tokenizeShipName(value?: string): string[] {
  if (!value) {
    return [];
  }

  return normalizeComparableText(
    stripCruiseLinePrefixes(extractCanonicalShipFragment(value)),
  )
    .split(/\s+/)
    .filter((token) => token.length > 2)
    .filter((token) => !SHIP_TOKEN_STOP_WORDS.has(token));
}

function buildItemText(item: CbGroupInventoryItem): string {
  return [
    item.shipName,
    item.vendor,
    item.itinerary ?? "",
    item.departurePort ?? "",
    item.nights ?? "",
    item.sailDate,
  ]
    .map((value) => normalizeComparableText(value))
    .join(" ")
    .trim();
}

function parseTargetDateHints(value: string): {
  month?: number;
  year?: number;
} {
  const normalized = normalizeComparableText(value);
  const tokens = normalized.split(/\s+/);

  const month = tokens.find((token) => MONTH_ALIASES.has(token));
  const year = tokens.find((token) => /^20\d{2}$/.test(token));

  return {
    month: month ? MONTH_ALIASES.get(month) : undefined,
    year: year ? Number(year) : undefined,
  };
}

function parseSailDateHints(value?: string): { month?: number; year?: number } {
  if (!value) {
    return {};
  }

  return parseTargetDateHints(value);
}

function getDatePreferenceScore(
  campaign: Campaign,
  item: CbGroupInventoryItem,
): number {
  const targetDate = parseTargetDateHints(campaign.targetDates);
  const sailDate = parseSailDateHints(item.sailDate);
  let score = 0;

  if (targetDate.year && sailDate.year && targetDate.year === sailDate.year) {
    score += 20;
  }

  if (
    targetDate.month &&
    sailDate.month &&
    targetDate.month === sailDate.month
  ) {
    score += 25;
  }

  if (targetDate.year && sailDate.year) {
    score -= Math.abs(targetDate.year - sailDate.year) * 5;
  }

  if (targetDate.month && sailDate.month) {
    score -= Math.abs(targetDate.month - sailDate.month);
  }

  return score;
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

/**
 * Scores a CB inventory item against a campaign using keyword overlap.
 * Returns 0–100.
 */
function scoreMatch(
  campaign: Campaign,
  item: CbGroupInventoryItem,
  exactShipRequired: boolean,
): number {
  let score = 0;

  const itemText = buildItemText(item);

  const requiredShipName = getSpecificShipName(campaign.shipTarget);
  const itemShipName = getSpecificShipName(item.shipName);

  // When the campaign names a concrete vessel that EXISTS in inventory, do not match across sister ships.
  // If the required ship is not found in inventory at all, treat it as a soft preference (fallback to destination + dates).
  if (
    exactShipRequired &&
    requiredShipName &&
    itemShipName &&
    requiredShipName !== itemShipName
  ) {
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
  const dateTokens = campaign.targetDates
    .toLowerCase()
    .split(/[\s,]+/)
    .filter((t) => t.length > 2);
  for (const token of dateTokens) {
    if (itemText.includes(token)) score += 20;
  }

  // Keyword overlap (destination signals)
  const keywords = (campaign.targetingKeywords ?? []).map((k) =>
    k.toLowerCase(),
  );
  for (const keyword of keywords) {
    if (itemText.includes(keyword)) score += 10;
  }

  // Destination match
  const destTokens = (campaign.targetDestination ?? "")
    .toLowerCase()
    .split(/[\s,]+/)
    .filter((t) => t.length > 2);
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
  inventory: CbGroupInventoryItem[],
): CbInventoryMatch | null {
  const MIN_MATCH_SCORE = 25;

  if (inventory.length === 0) return null;

  const requiredShipName = getSpecificShipName(campaign.shipTarget);
  const exactShipCandidates = requiredShipName
    ? inventory.filter(
        (item) => getSpecificShipName(item.shipName) === requiredShipName,
      )
    : [];
  const leadTimeEligibleExactCandidates = exactShipCandidates.filter((item) => {
    const assessment = getLaunchWindowAssessment({
      matchedSailDate: item.sailDate,
      targetDates: campaign.targetDates,
    });
    return assessment.meetsMinimumLeadTime !== false;
  });

  // If campaign names a specific ship but NO inventory item has it, treat as soft preference (fallback to destination + dates).
  const exactShipRequired = exactShipCandidates.length > 0;

  let bestItem: CbGroupInventoryItem | null = null;
  let bestScore = 0;
  let bestDatePreferenceScore = Number.NEGATIVE_INFINITY;

  for (const item of inventory) {
    // Only need a valid groupId — price absence is handled at result time
    if (!item.groupId) continue;

    const leadTimeAssessment = getLaunchWindowAssessment({
      matchedSailDate: item.sailDate,
      targetDates: campaign.targetDates,
    });
    if (leadTimeAssessment.meetsMinimumLeadTime === false) {
      continue;
    }

    const score = scoreMatch(campaign, item, exactShipRequired);
    const datePreferenceScore = getDatePreferenceScore(campaign, item);

    if (
      score > bestScore ||
      (score === bestScore && datePreferenceScore > bestDatePreferenceScore)
    ) {
      bestScore = score;
      bestDatePreferenceScore = datePreferenceScore;
      bestItem = item;
    }
  }

  if (!bestItem || bestScore < MIN_MATCH_SCORE) {
    if (
      requiredShipName &&
      exactShipCandidates.length > 0 &&
      leadTimeEligibleExactCandidates.length === 0
    ) {
      console.log(
        `[cb-inventory-matcher] Exact ship inventory exists for "${campaign.id}", but all sailings are inside the minimum launch window`,
      );
    }
    if (requiredShipName && exactShipCandidates.length === 0) {
      console.log(
        `[cb-inventory-matcher] No exact-ship inventory for "${campaign.id}" (required ship: ${requiredShipName})`,
      );
    }
    console.log(
      `[cb-inventory-matcher] No match for "${campaign.id}" (best score: ${bestScore})`,
    );
    return null;
  }

  // Use parsed price if available; fall back to a baseline derived from priceAdvantage discount value
  const rawPrice =
    bestItem.startingPriceNumber > 0
      ? bestItem.startingPriceNumber
      : bestItem.priceAdvantageNumber > 0
        ? bestItem.priceAdvantageNumber * 100 // priceAdvantage is % off — rough baseline
        : 0;
  const cbPersonalLink = ""; // Will be populated by Phase B by scraping the group details page
  const computedStartingPrice = Math.round(rawPrice * THEME_FEE_MULTIPLIER);

  console.log(
    `[cb-inventory-matcher] ✅ Matched "${campaign.id}" → "${bestItem.shipName}" (score: ${bestScore}, price: $${computedStartingPrice})`,
  );

  return {
    cbGroupId: bestItem.groupId,
    cbPersonalLink,
    cbPriceAdvantage: bestItem.priceAdvantageNumber,
    rawGroupPrice: bestItem.startingPriceNumber,
    computedStartingPrice,
    priceSource: "CB_GROUP_INVENTORY",
    matchedShipName: bestItem.shipName,
    matchedSailDate: bestItem.sailDate,
    matchedDeparturePort: bestItem.departurePort,
    matchedNights: bestItem.nights,
    odysseusItinerarySummary: bestItem.itinerary?.trim() || undefined,
    matchScore: bestScore,
    odysseusRetailBookingLink: null,
  };
}

// ─── Ranked Candidates ────────────────────────────────────────────────────────

export const INVENTORY_POLICY = {
  MAX_AUTO_PRICE_DELTA_PERCENT: 10,
  MAX_AUTO_DATE_DELTA_DAYS: 0,
  REQUIRE_SAME_SHIP_FOR_AUTO_SWITCH: true,
  REQUIRE_SAME_PORT_FOR_AUTO_SWITCH: true,
} as const;

function parseSailDateMs(sailDate: string): number | null {
  const d = new Date(sailDate);
  return isNaN(d.getTime()) ? null : d.getTime();
}

function classifyPromiseDelta(
  candidate: { shipName: string; sailDate: string; departurePort?: string; startingPrice?: number },
  primary: { shipName: string; sailDate: string; departurePort?: string; startingPrice?: number },
): CampaignInventoryCandidate["promiseDelta"] {
  const normCandidate = normalizeComparableText(stripCruiseLinePrefixes(candidate.shipName));
  const normPrimary = normalizeComparableText(stripCruiseLinePrefixes(primary.shipName));

  if (normCandidate !== normPrimary) return "SHIP_OR_DATE_CHANGED";

  const candMs = parseSailDateMs(candidate.sailDate);
  const primMs = parseSailDateMs(primary.sailDate);

  if (candMs !== null && primMs !== null) {
    const daysDiff = Math.abs(candMs - primMs) / 86400000;
    if (daysDiff > INVENTORY_POLICY.MAX_AUTO_DATE_DELTA_DAYS) {
      return daysDiff <= 14 ? "AMENITIES_CHANGED" : "SHIP_OR_DATE_CHANGED";
    }
  } else if (candidate.sailDate !== primary.sailDate) {
    return "AMENITIES_CHANGED";
  }

  const normCandPort = normalizeComparableText(candidate.departurePort ?? "");
  const normPrimPort = normalizeComparableText(primary.departurePort ?? "");
  if (normCandPort && normPrimPort && normCandPort !== normPrimPort) {
    return "AMENITIES_CHANGED";
  }

  if (candidate.startingPrice && primary.startingPrice && primary.startingPrice > 0) {
    const deltaPct = (Math.abs(candidate.startingPrice - primary.startingPrice) / primary.startingPrice) * 100;
    if (deltaPct > INVENTORY_POLICY.MAX_AUTO_PRICE_DELTA_PERCENT) return "PRICE_ONLY";
  }

  return "NONE";
}

/**
 * Returns the top N CB inventory candidates for a campaign, ranked by match score.
 * Each candidate carries a promiseDelta (relative to rank 0) and starts UNVERIFIED.
 * Phase B should call validateBookingLink() on each before writing.
 */
export function rankGroupInventoryCandidates(
  campaign: Campaign,
  inventory: CbGroupInventoryItem[],
  topN = 3,
): CampaignInventoryCandidate[] {
  const MIN_MATCH_SCORE = 25;

  if (inventory.length === 0) return [];

  const requiredShipName = getSpecificShipName(campaign.shipTarget);
  const exactShipCandidates = requiredShipName
    ? inventory.filter((item) => getSpecificShipName(item.shipName) === requiredShipName)
    : [];
  const exactShipRequired = exactShipCandidates.length > 0;

  const scored: Array<{ item: CbGroupInventoryItem; score: number; dateScore: number }> = [];

  for (const item of inventory) {
    if (!item.groupId) continue;

    const assessment = getLaunchWindowAssessment({
      matchedSailDate: item.sailDate,
      targetDates: campaign.targetDates,
    });
    if (assessment.meetsMinimumLeadTime === false) continue;

    const score = scoreMatch(campaign, item, exactShipRequired);
    if (score < MIN_MATCH_SCORE) continue;

    scored.push({ item, score, dateScore: getDatePreferenceScore(campaign, item) });
  }

  scored.sort((a, b) => b.score - a.score || b.dateScore - a.dateScore);

  const top = scored.slice(0, topN);
  if (top.length === 0) return [];

  const primaryItem = top[0]!.item;
  const primaryPrice = Math.round((primaryItem.startingPriceNumber > 0 ? primaryItem.startingPriceNumber : 0) * THEME_FEE_MULTIPLIER);

  return top.map(({ item, score }, rank) => {
    const startingPrice = Math.round((item.startingPriceNumber > 0 ? item.startingPriceNumber : 0) * THEME_FEE_MULTIPLIER);
    return {
      rank,
      source: "CB_GROUP",
      groupId: item.groupId,
      personalLink: "",
      shipName: item.shipName,
      sailDate: item.sailDate,
      departurePort: item.departurePort,
      nights: item.nights,
      startingPrice,
      priceSource: "CB_GROUP_INVENTORY",
      matchScore: score,
      priceDeltaFromPrimary: rank === 0 ? undefined : startingPrice - primaryPrice,
      promiseDelta:
        rank === 0
          ? "NONE"
          : classifyPromiseDelta(
              { shipName: item.shipName, sailDate: item.sailDate, departurePort: item.departurePort, startingPrice },
              { shipName: primaryItem.shipName, sailDate: primaryItem.sailDate, departurePort: primaryItem.departurePort, startingPrice: primaryPrice },
            ),
      healthStatus: "UNVERIFIED",
    } satisfies CampaignInventoryCandidate;
  });
}
