/**
 * Deep Cruise Search & Select (Deal Workflow Step 1A — inventory-first).
 *
 * The deal workflow no longer starts from a fabricated angle and then hunts for a
 * ship to fit it (that inversion is why "nothing in inventory matches this angle"
 * was structurally unavoidable). It starts from REAL, bookable Odysseus inventory:
 * a broad sweep pulls genuine sailings, this module scores each one by OBJECTIVE
 * deal-quality signals already present in the data — lead fare, sea-day density,
 * itinerary distinctiveness, group-rate availability, live-promo overlap — and
 * selects the top "excellent deals". Step 1B (niche-reformer) then re-forms a
 * niche to fit each winning cruise. The ship is the cause; the niche is the effect.
 *
 * This module is PURE and deterministic — no browser, no network, no AI. It scores
 * `RawSailing` records (parsed from the operator-run deep-search script's JSON) so
 * it can be unit-tested without a live Odysseus session. The browser sweep itself
 * lives in scripts/deep-cruise-search.ts.
 */

import {
  CRUISE_LINE_NAMES,
  extractCabinPricing,
  type PackageCabinPricing,
} from "@/lib/cb/link-broker/package-lookup";
import type { CruiseResult } from "@/lib/services/odysseus/types";

import { prefilterPromoRecords } from "./promo-prefilter";
import type { CbPromoIntelligenceRecord } from "./promo-intelligence-types";

// ─── Raw sweep input ──────────────────────────────────────────────────────────

/**
 * A real sailing returned by the deep-search sweep, plus the two facets the
 * search requests that aren't part of the base CruiseResult schema. The script
 * emits these; this module never invents them.
 */
export interface RawSailing {
  /** The Odysseus result, exactly as the search API returned it. */
  result: CruiseResult;
  /** Whether a headquarters or agency group rate is available (margin signal). */
  hasGroupRate?: boolean;
}

// ─── Selected deal (Step 1A output) ───────────────────────────────────────────

/** Per-signal contribution to the deal-quality score, for transparency. */
export interface DealQualitySignal {
  signal: "value" | "sea_day_density" | "itinerary_distinctiveness" | "line_prestige" | "group_rate" | "promo_overlap";
  /** Points this signal contributed (can be 0). */
  points: number;
  reason: string;
}

/**
 * A real Odysseus sailing selected as an "excellent deal". Every field is a fact
 * pulled from inventory — nothing fabricated. This is the unit Step 1A emits and
 * Step 1B (niche-reformer) consumes; its facts become the angle's groundedCandidate.
 */
export interface SelectedDeal {
  packageId: string;
  cruiseCode: string;
  cruiseName: string;
  cruiseLine?: string;
  shipId?: number;
  sailDateIso: string;
  nights: number | null;
  departurePortCode?: string;
  arrivalPortCode?: string;
  portsOfCall?: string;
  /**
   * Odysseus itinerary id — the key to fetch the real day-by-day schedule later
   * (GET /nitroapi/v2/cruise/itinerary/{id}). Threaded through discovery → grounded
   * candidate → manifest so resolution can capture the per-day ports/times instead
   * of leaving only the coarse ports string. See [[odysseus-itinerary-pricing-upstream]].
   */
  itineraryId?: number;
  cabinPricing?: PackageCabinPricing;
  /** Lowest populated cabin fare ("from" price), if any. */
  leadFare?: number;
  hasGroupRate: boolean;
  /** Live CB promos whose vendor + sail window could apply to this sailing. */
  applicablePromoIds: string[];
  /** 0..1 normalized deal-quality score. */
  qualityScore: number;
  /** Per-signal breakdown that produced qualityScore. */
  qualitySignals: DealQualitySignal[];
}

export interface DeepCruiseSelectionResult {
  /** The top-N selected deals, best-first. */
  selected: SelectedDeal[];
  /** Every scored deal, best-first (selected is the head slice). */
  ranked: SelectedDeal[];
  diagnostics: string[];
}

// ─── Scoring weights ──────────────────────────────────────────────────────────
// Max raw points per signal. qualityScore = sum / MAX_TOTAL_POINTS, clamped 0..1.
//
// The target customer is the ANTI-TYPICAL / elite traveler — NOT the bargain
// hunter on an overcrowded party ship. So itinerary distinctiveness and line
// prestige dominate; raw price ("value") is now a minor tiebreaker, and
// sea-day density / group-rate / promo-overlap are small sweeteners.
const POINTS = {
  value: 0.08,
  seaDayDensity: 0.15,
  distinctiveness: 0.35,
  linePrestige: 0.32,
  groupRate: 0.04,
  promoOverlap: 0.06,
} as const;
const MAX_TOTAL_POINTS =
  POINTS.value +
  POINTS.seaDayDensity +
  POINTS.distinctiveness +
  POINTS.linePrestige +
  POINTS.groupRate +
  POINTS.promoOverlap;

// Fare value is scored relative to a per-night reference band. A sailing priced
// at or below LOW_PPN earns full value points; at or above HIGH_PPN, none. This
// band is widened vs. a bargain-focused model — premium lines should not be
// penalized for charging a premium price.
const LOW_PRICE_PER_NIGHT = 80;
const HIGH_PRICE_PER_NIGHT = 600;

// ─── Line prestige tiers ──────────────────────────────────────────────────────
// Anti-typical / elite-leaning lines score highest; mainstream "party ship" mass-
// market lines score lowest. Unrecognized/unknown lines get a neutral mid score
// so they aren't penalized for missing data.
// Keys are the VERIFIED line names from CRUISE_LINE_NAMES (package-lookup.ts).
const LINE_PRESTIGE: Record<string, number> = {
  // Ultra-luxury / true anti-typical.
  "Regent Seven Seas": 1,
  Seabourn: 1,
  Silversea: 1,
  Crystal: 1,
  Cunard: 1,
  // Premium / upmarket, still meaningfully "anti-typical" vs. mass-market.
  Oceania: 0.9,
  Azamara: 0.9,
  Celebrity: 0.7,
  "Holland America": 0.65,
  Princess: 0.5,
  // Mass-market "party ship" lines — bargain-hunter crowds, the opposite of the target.
  Disney: 0.25,
  MSC: 0.15,
  Costa: 0.15,
  Norwegian: 0.15,
  "Royal Caribbean": 0.1,
  Carnival: 0,
};
const DEFAULT_LINE_PRESTIGE = 0.5;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function norm(text: string | undefined): string {
  return (text ?? "").trim().toLowerCase();
}

function isoDate(raw: string | undefined): string {
  const value = raw?.trim();
  if (!value) return "";
  const parsed = new Date(/^\d{4}-\d{2}-\d{2}/.test(value) ? `${value.slice(0, 10)}T12:00:00Z` : value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

function cruiseLineName(result: CruiseResult): string | undefined {
  const id = result.ship?.cruiseline?.id;
  return id ? CRUISE_LINE_NAMES[id] ?? `Line ${id}` : undefined;
}

function nightCount(result: CruiseResult): number | null {
  if (typeof result.itinerary?.duration === "number" && result.itinerary.duration > 0) {
    return result.itinerary.duration;
  }
  const pkg = result.packages?.[0]?.cruiseDuration;
  return typeof pkg === "number" && pkg > 0 ? pkg : null;
}

function packageId(result: CruiseResult): string | undefined {
  const id = result.packages?.[0]?.id;
  return typeof id === "number" && id > 0 ? String(id) : undefined;
}

/** Count distinct ports of call from the human/normalized ports string. */
function portCount(result: CruiseResult): number {
  const raw = result.itinerary?.normalizedPortsOfCall || result.itinerary?.portsOfCalls || "";
  if (!raw.trim()) return 0;
  return raw
    .split(/\s*[,>|]\s*/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0).length;
}

// ─── Per-signal scorers ───────────────────────────────────────────────────────

/** Value: lower per-night lead fare = stronger deal. Returns points + the lead fare used. */
function scoreValue(pricing: PackageCabinPricing | undefined, nights: number | null): { points: number; reason: string; leadFare?: number } {
  const leadFare = pricing?.leadFare;
  if (leadFare === undefined || !nights || nights <= 0) {
    return { points: 0, reason: "no lead fare available — value not scored", leadFare };
  }
  const perNight = leadFare / nights;
  if (perNight <= LOW_PRICE_PER_NIGHT) {
    return { points: POINTS.value, reason: `strong value at $${Math.round(perNight)}/night`, leadFare };
  }
  if (perNight >= HIGH_PRICE_PER_NIGHT) {
    return { points: 0, reason: `premium fare at $${Math.round(perNight)}/night — no value points`, leadFare };
  }
  // Linear between the band edges.
  const frac = (HIGH_PRICE_PER_NIGHT - perNight) / (HIGH_PRICE_PER_NIGHT - LOW_PRICE_PER_NIGHT);
  return { points: POINTS.value * frac, reason: `value at $${Math.round(perNight)}/night`, leadFare };
}

/** Sea-day density: long voyage with few ports = lots of restful sea days. */
function scoreSeaDayDensity(nights: number | null, ports: number): { points: number; reason: string } {
  if (!nights || nights <= 0) return { points: 0, reason: "unknown duration — sea-day density not scored" };
  // Sea days ≈ nights - ports (a port-per-day itinerary has ~0 sea days).
  const seaDays = Math.max(0, nights - ports);
  const ratio = seaDays / nights;
  if (ratio <= 0) return { points: 0, reason: `port-dense (${ports} ports / ${nights}n) — no sea-day points` };
  const points = POINTS.seaDayDensity * Math.min(1, ratio / 0.6); // 60%+ sea days = full points
  return { points, reason: `~${seaDays} sea day(s) over ${nights}n (${ports} ports)` };
}

/**
 * Itinerary distinctiveness: how INTRINSICALLY special this sailing is, regardless
 * of any angle. Ocean crossings, world voyages, fjords, and long unusual routes
 * are distinctive; a 4-night Bahamas hop is not. This is the deal-merit version of
 * the broker's itinerary-type intelligence, repurposed to score the sailing on its
 * own terms instead of fit-to-a-query.
 */
function scoreDistinctiveness(result: CruiseResult, nights: number | null, ports: number): { points: number; reason: string } {
  const name = norm(result.name);
  const dep = norm(result.itinerary?.departure?.code);
  const arr = norm(result.itinerary?.arrival?.code);
  const oneWay = dep && arr && dep !== arr;

  if (/transatlantic|transpacific|crossing/.test(name)) {
    return { points: POINTS.distinctiveness, reason: `ocean crossing ("${result.name}")` };
  }
  if (/world|grand voyage|round[- ]?world|world cruise/.test(name) && (nights ?? 0) >= 14) {
    return { points: POINTS.distinctiveness, reason: `world / grand voyage (${nights}n)` };
  }
  if (/fjord|norway|norwegian fjord|antarctic|arctic|greenland|iceland|galapagos|amazon/.test(name)) {
    return { points: POINTS.distinctiveness * 0.9, reason: `rare expedition-grade region ("${result.name}")` };
  }
  if (oneWay && (nights ?? 0) >= 10) {
    return { points: POINTS.distinctiveness * 0.75, reason: `long one-way repositioning (${dep}→${arr}, ${nights}n)` };
  }
  if ((nights ?? 0) >= 10 && ports <= 5) {
    return { points: POINTS.distinctiveness * 0.6, reason: `long itinerary, few ports (${nights}n / ${ports} ports)` };
  }
  if ((nights ?? 0) >= 7) {
    return { points: POINTS.distinctiveness * 0.3, reason: `week-plus itinerary (${nights}n)` };
  }
  return { points: 0, reason: `common short itinerary (${nights ?? "?"}n) — not distinctive` };
}

/**
 * Line prestige: how "anti-typical" / elite the cruise LINE itself is, independent
 * of this specific sailing. Mass-market party-ship lines (Carnival, RCL, MSC, ...)
 * score low; ultra-luxury and upmarket lines (Regent, Silversea, Cunard, Oceania,
 * Azamara, Celebrity, ...) score high. This is the signal that keeps the cheapest
 * mass-market line from dominating selection on price alone.
 */
function scoreLinePrestige(cruiseLine: string | undefined): { points: number; reason: string } {
  if (!cruiseLine) {
    return { points: POINTS.linePrestige * DEFAULT_LINE_PRESTIGE, reason: "unknown line — neutral prestige" };
  }
  const tier = LINE_PRESTIGE[cruiseLine] ?? DEFAULT_LINE_PRESTIGE;
  return { points: POINTS.linePrestige * tier, reason: `${cruiseLine} line-prestige tier ${tier.toFixed(2)}` };
}

// ─── Public scorer ────────────────────────────────────────────────────────────

export interface ScoreDealsOptions {
  /** Live CB promo intelligence records, for the promo-overlap signal. */
  promoRecords?: CbPromoIntelligenceRecord[];
  /** How many top deals to select. Default 5. */
  selectCount?: number;
  /** Minimum qualityScore to be eligible for selection. Default 0 (rank everything). */
  minQualityScore?: number;
  /**
   * Max selected deals from any single cruise line. Prevents one mass-market line
   * from filling every slot even when it scores well on a given sailing. Default 1
   * — favor variety across the 15+ "anti-typical" lines over repeats.
   */
  maxPerLine?: number;
}

/** Score one raw sailing into a SelectedDeal (or undefined if it has no usable package id). */
export function scoreSailing(
  raw: RawSailing,
  promoRecords: CbPromoIntelligenceRecord[]
): SelectedDeal | undefined {
  const { result } = raw;
  const pkgId = packageId(result);
  if (!pkgId) return undefined;

  const nights = nightCount(result);
  const ports = portCount(result);
  const cruiseLine = cruiseLineName(result);
  const cabinPricing = extractCabinPricing(result);
  const sailDateIso = isoDate(result.packages?.[0]?.startDateTime);

  const signals: DealQualitySignal[] = [];

  const value = scoreValue(cabinPricing, nights);
  signals.push({ signal: "value", points: value.points, reason: value.reason });

  const seaDay = scoreSeaDayDensity(nights, ports);
  signals.push({ signal: "sea_day_density", points: seaDay.points, reason: seaDay.reason });

  const distinct = scoreDistinctiveness(result, nights, ports);
  signals.push({ signal: "itinerary_distinctiveness", points: distinct.points, reason: distinct.reason });

  const prestige = scoreLinePrestige(cruiseLine);
  signals.push({ signal: "line_prestige", points: prestige.points, reason: prestige.reason });

  const hasGroupRate = raw.hasGroupRate === true;
  signals.push({
    signal: "group_rate",
    points: hasGroupRate ? POINTS.groupRate : 0,
    reason: hasGroupRate ? "group rate available" : "no group rate",
  });

  // Promo overlap: any live CB promo whose vendor + sail window could apply.
  const applicablePromoIds: string[] = [];
  if (promoRecords.length > 0 && cruiseLine && sailDateIso) {
    const { kept } = prefilterPromoRecords(promoRecords, {
      cruiseLine,
      sailWindow: { earliestIso: sailDateIso, latestIso: sailDateIso },
    });
    applicablePromoIds.push(...kept.map((p) => p.id));
  }
  const hasPromo = applicablePromoIds.length > 0;
  signals.push({
    signal: "promo_overlap",
    points: hasPromo ? POINTS.promoOverlap : 0,
    reason: hasPromo ? `${applicablePromoIds.length} live promo(s) may apply` : "no live promo overlap",
  });

  const rawPoints = signals.reduce((sum, s) => sum + s.points, 0);
  const qualityScore = Math.max(0, Math.min(1, rawPoints / MAX_TOTAL_POINTS));

  return {
    packageId: pkgId,
    cruiseCode: result.code,
    cruiseName: result.name,
    cruiseLine,
    shipId: result.ship?.id,
    sailDateIso,
    nights,
    departurePortCode: result.itinerary?.departure?.code,
    arrivalPortCode: result.itinerary?.arrival?.code,
    portsOfCall: result.itinerary?.normalizedPortsOfCall || result.itinerary?.portsOfCalls || undefined,
    itineraryId: result.itinerary?.id,
    cabinPricing,
    leadFare: value.leadFare,
    hasGroupRate,
    applicablePromoIds,
    qualityScore,
    qualitySignals: signals,
  };
}

/**
 * Score a full sweep of real sailings and select the top-N excellent deals.
 *
 * Deterministic: same input → same selection. De-duplicates by packageId (the
 * sweep can return the same sailing across overlapping date windows), keeping the
 * higher-scored instance.
 */
export function selectDealsFromSweep(
  sweep: RawSailing[],
  options: ScoreDealsOptions = {}
): DeepCruiseSelectionResult {
  const promoRecords = options.promoRecords ?? [];
  const selectCount = options.selectCount ?? 5;
  const minQualityScore = options.minQualityScore ?? 0;
  const diagnostics: string[] = [];

  const byId = new Map<string, SelectedDeal>();
  let scoredCount = 0;
  let noPackage = 0;
  for (const raw of sweep) {
    const deal = scoreSailing(raw, promoRecords);
    if (!deal) {
      noPackage += 1;
      continue;
    }
    scoredCount += 1;
    const existing = byId.get(deal.packageId);
    if (!existing || deal.qualityScore > existing.qualityScore) {
      byId.set(deal.packageId, deal);
    }
  }
  if (noPackage > 0) diagnostics.push(`${noPackage} sweep result(s) had no usable package id and were dropped.`);
  diagnostics.push(`${scoredCount} sailing(s) scored; ${byId.size} unique after de-dup.`);

  const ranked = [...byId.values()].sort((a, b) => b.qualityScore - a.qualityScore);
  const eligible = ranked.filter((d) => d.qualityScore >= minQualityScore);
  if (minQualityScore > 0) {
    diagnostics.push(`${eligible.length} of ${ranked.length} cleared minQualityScore ${minQualityScore}.`);
  }

  // Diversity cap: don't let one line (e.g. the cheapest mass-market line) fill
  // every slot. Walk the ranked list best-first, skipping a deal once its line
  // has hit maxPerLine — those skipped deals remain selectable in a later pass
  // if there aren't enough diverse candidates to fill selectCount.
  const maxPerLine = options.maxPerLine ?? 1;
  const selected: SelectedDeal[] = [];
  const perLineCount = new Map<string, number>();
  const skipped: SelectedDeal[] = [];
  for (const deal of eligible) {
    if (selected.length >= selectCount) break;
    const line = deal.cruiseLine ?? "Unknown";
    const count = perLineCount.get(line) ?? 0;
    if (count < maxPerLine) {
      selected.push(deal);
      perLineCount.set(line, count + 1);
    } else {
      skipped.push(deal);
    }
  }
  // Backfill with skipped (over-cap) deals if diversity alone couldn't fill selectCount.
  for (const deal of skipped) {
    if (selected.length >= selectCount) break;
    selected.push(deal);
  }

  diagnostics.push(
    selected.length > 0
      ? `Selected top ${selected.length} deal(s): ${selected.map((d) => `${d.cruiseName} (${d.qualityScore.toFixed(2)})`).join("; ")}.`
      : "No deals selected from this sweep."
  );

  return { selected, ranked, diagnostics };
}
