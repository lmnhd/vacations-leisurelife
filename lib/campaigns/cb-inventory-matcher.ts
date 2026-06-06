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
import { getNicheAffinityScore, describeNicheAffinityMatch } from "./niche-affinity";
import { getShipClassAffinityScore, describeShipClassFit } from "./ship-classes";

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
  /** Cruise line vendor string from CB (e.g. "Royal Caribbean International"). Used
   *  by the Odysseus retail path to scope the search to the correct cruise line. */
  vendor?: string;
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
 * Scores a CB inventory item against a campaign. Returns 0–100.
 *
 * Philosophy (see 05_SMARTER_INVENTORY_MATCHING_PLAN): shipTarget is a SOFT
 * preference, never a lock. The real intelligence is niche fit — ship-CLASS
 * affinity (which distinguishes products within the ~95%-RCL fleet) plus
 * niche→line affinity — with exact ship name and season as boosts/tiebreakers.
 * No item is ever zeroed out for being a different ship; the best available
 * always wins.
 */
function scoreMatch(
  campaign: Campaign,
  item: CbGroupInventoryItem,
): number {
  let score = 0;

  const itemText = buildItemText(item);

  const requiredShipName = getSpecificShipName(campaign.shipTarget);
  const itemShipName = getSpecificShipName(item.shipName);

  // Exact ship match is a strong PREFERENCE, not a requirement. A different ship
  // is never disqualified — it just doesn't earn this boost and competes on
  // class/niche/season instead.
  if (requiredShipName && itemShipName && requiredShipName === itemShipName) {
    score += 50;
  }

  // Ship / cruise line name token overlap (soft)
  const shipTokens = tokenizeShipName(campaign.shipTarget);
  for (const token of shipTokens) {
    if (itemText.includes(token)) score += 10;
  }

  // ── Ship-class affinity (primary niche-fit signal) ───────────────────────
  // The dimension that actually differentiates ships for a niche. Capped, and
  // weighted comparably to the exact-ship boost so a class-appropriate ship can
  // out-rank an off-theme exact-name guess.
  score += getShipClassAffinityScore(campaign, item.shipName);

  // ── Niche-to-cruise-line affinity ────────────────────────────────────────
  score += getNicheAffinityScore(campaign, item.vendor);

  // Keyword overlap (destination/theme signals in itinerary text)
  const keywords = (campaign.targetingKeywords ?? []).map((k) => k.toLowerCase());
  for (const keyword of keywords) {
    if (itemText.includes(keyword)) score += 8;
  }

  // Destination text match
  const destTokens = (campaign.targetDestination ?? "")
    .toLowerCase()
    .split(/[\s,]+/)
    .filter((t) => t.length > 2);
  for (const token of destTokens) {
    if (itemText.includes(token)) score += 12;
  }

  // Date / month text overlap (season tiebreaker; getDatePreferenceScore does the
  // heavier date proximity work at ranking time)
  const dateTokens = campaign.targetDates
    .toLowerCase()
    .split(/[\s,]+/)
    .filter((t) => t.length > 2);
  for (const token of dateTokens) {
    if (itemText.includes(token)) score += 8;
  }

  // Agent-group soft preference: a row that exposes a personal link is far more
  // valuable (TC credit + group price advantage) than a House block. Best-effort —
  // most cached rows have no link, so this only nudges when CB surfaces one.
  if (item.personalLink?.trim()) {
    score += 15;
  }

  return Math.max(0, Math.min(score, 100));
}

// ─── Matcher ─────────────────────────────────────────────────────────────────

/** Score under this is matched anyway (never refused) but flagged low-confidence. */
const LOW_CONFIDENCE_SCORE = 30;

/**
 * Returns true if the inventory item is eligible to be matched at all — the only
 * HARD gate. An item must have a groupId and clear the launch-window minimum.
 * (Price-advantage holdback items without a parseable date are allowed through.)
 */
function isEligibleInventoryItem(campaign: Campaign, item: CbGroupInventoryItem): boolean {
  if (!item.groupId) return false;
  const assessment = getLaunchWindowAssessment({
    matchedSailDate: item.sailDate,
    targetDates: campaign.targetDates,
  });
  if (assessment.meetsMinimumLeadTime === null && item.priceAdvantageNumber <= 0) return false;
  if (assessment.meetsMinimumLeadTime === false) return false;
  return true;
}

/**
 * Finds the best-matching CB inventory item for a campaign.
 *
 * NEVER refuses when eligible inventory exists: shipTarget is a soft preference,
 * there is no minimum-score discard. Returns null ONLY when no launch-window-
 * eligible item exists at all. `matchScore` carries the confidence so weak picks
 * stay visible.
 */
export function matchGroupInventoryToCampaign(
  campaign: Campaign,
  inventory: CbGroupInventoryItem[],
): CbInventoryMatch | null {
  if (inventory.length === 0) return null;

  let bestItem: CbGroupInventoryItem | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  let bestDatePreferenceScore = Number.NEGATIVE_INFINITY;

  for (const item of inventory) {
    if (!isEligibleInventoryItem(campaign, item)) continue;

    const score = scoreMatch(campaign, item);
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

  if (!bestItem) {
    console.log(
      `[cb-inventory-matcher] No launch-window-eligible inventory for "${campaign.id}" (${inventory.length} item(s) scanned).`,
    );
    return null;
  }

  if (bestScore < LOW_CONFIDENCE_SCORE) {
    console.log(
      `[cb-inventory-matcher] ⚠️ Low-confidence match for "${campaign.id}" → "${bestItem.shipName}" (score: ${bestScore}). Best available; review.`,
    );
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

  const affinityDescription = describeNicheAffinityMatch(campaign, bestItem.vendor);
  const classDescription = describeShipClassFit(campaign, bestItem.shipName);
  console.log(
    `[cb-inventory-matcher] ✅ Matched "${campaign.id}" → "${bestItem.shipName}" (score: ${bestScore}, price: $${computedStartingPrice}, ${classDescription}, affinity: ${affinityDescription})`,
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
    vendor: bestItem.vendor || undefined,
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
  if (inventory.length === 0) return [];

  const scored: Array<{ item: CbGroupInventoryItem; score: number; dateScore: number }> = [];

  // Same rule as matchGroupInventoryToCampaign: launch-window eligibility is the
  // only hard gate. No minimum-score discard — rank everything eligible and take
  // the top N. shipTarget is a soft preference inside scoreMatch.
  for (const item of inventory) {
    if (!isEligibleInventoryItem(campaign, item)) continue;
    const score = scoreMatch(campaign, item);
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
      personalLink: item.personalLink ?? "",
      shipName: item.shipName,
      sailDate: item.sailDate,
      departurePort: item.departurePort,
      nights: item.nights,
      vendor: item.vendor || undefined,
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
