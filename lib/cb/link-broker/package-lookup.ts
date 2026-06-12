/**
 * Odysseus package-lookup ranking (pure, dependency-free).
 *
 * Given the cruise facts on a LinkBrokerRequest and a set of Odysseus
 * `CruiseResult` candidates, scores and ranks them to resolve a package ID. It
 * auto-selects only when one candidate is confidently the match; otherwise it
 * returns ranked candidates + diagnostics so the broker can ask for operator
 * review instead of silently picking.
 *
 * Adapted from the proven proximity matching in scripts/run-phase-b.ts
 * (findMatchingOdysseusResult): date proximity dominates, a known-nights
 * mismatch is a soft penalty, ship-name and cruise-line agreement add boosts.
 *
 * No browser/network here — the operator-run search adapter lives in
 * odysseus-lookup.ts and feeds results into rankPackageCandidates().
 */

import type { CruiseResult } from "@/lib/services/odysseus/types";

import type { LinkBrokerCruiseFacts } from "./types";

/** Odysseus cruiseline.id -> human name. Mirrors lib/chat/tools/odysseus-search. */
export const CRUISE_LINE_NAMES: Record<number, string> = {
  1: "Carnival",
  2: "Norwegian",
  3: "Princess",
  4: "Celebrity",
  5: "Holland America",
  6: "Costa",
  7: "MSC",
  8: "Royal Caribbean",
  9: "Disney",
  10: "Cunard",
  11: "Regent",
  12: "Silversea",
  13: "Oceania",
  14: "Azamara",
  982: "MSC",
};

/** Default: a candidate's sail date may differ from the requested date by this many days. */
export const SAIL_DATE_TOLERANCE_DAYS = 3;

/**
 * Cabin pricing pulled from the Odysseus result's lowest price set. Values are the
 * per-cabin-category lead fares Odysseus returned (the Inside/Outside/Balcony/Suite
 * row in the package detail). Real data — never estimated.
 */
export interface PackageCabinPricing {
  inside?: number;
  outside?: number;
  balcony?: number;
  suite?: number;
  currencyCode: string;
  /** Lowest of the populated tiers, for a "from" price. */
  leadFare?: number;
}

/** Structured itinerary captured from the Odysseus result (not the day-by-day detail). */
export interface PackageItinerary {
  durationNights?: number;
  departurePortCode?: string;
  arrivalPortCode?: string;
  /** Ports-of-call as Odysseus returned them (human-readable string). */
  portsOfCall?: string;
  /** Normalized ports-of-call string, when present. */
  normalizedPortsOfCall?: string;
  /** Route map image path Odysseus provides, when present. */
  mapPath?: string;
}

export interface RankedPackageCandidate {
  packageId: string;
  cruiseCode: string;
  cruiseName: string;
  cruiseLine?: string;
  shipId?: number;
  sailDateIso: string;
  nights: number | null;
  departurePortCode?: string;
  portsOfCall?: string;
  /** Structured itinerary (departure/arrival/ports/map) from the Odysseus result. */
  itinerary?: PackageItinerary;
  /** Cabin-category lead fares from the Odysseus result. */
  cabinPricing?: PackageCabinPricing;
  /** 0..1 confidence this candidate is the requested cruise. */
  confidence: number;
  reasons: string[];
}

/** Map an Odysseus price set's items to cabin-category lead fares. Heuristic on name/code. */
export function extractCabinPricing(result: CruiseResult): PackageCabinPricing | undefined {
  // Prefer the result-level prices, else the cheapest package's prices.
  const priceSets =
    result.prices && result.prices.length > 0
      ? result.prices
      : (result.packages ?? []).flatMap((p) => p.prices ?? []);
  if (priceSets.length === 0) return undefined;

  const out: PackageCabinPricing = { currencyCode: priceSets[0].currencyCode || "USD" };
  const bucket = (label: string): "inside" | "outside" | "balcony" | "suite" | null => {
    const s = label.toLowerCase();
    if (s.includes("suite")) return "suite";
    if (s.includes("balcony") || s.includes("verandah") || s.includes("veranda")) return "balcony";
    if (s.includes("ocean") || s.includes("outside") || s.includes("oceanview")) return "outside";
    if (s.includes("inside") || s.includes("interior")) return "inside";
    return null;
  };

  for (const set of priceSets) {
    for (const item of set.items) {
      const key = bucket(`${item.name ?? ""} ${item.code ?? ""}`);
      if (!key) continue;
      // Keep the lowest fare seen per category.
      if (out[key] === undefined || item.value < (out[key] as number)) {
        out[key] = item.value;
      }
    }
  }

  const tiers = [out.inside, out.outside, out.balcony, out.suite].filter(
    (v): v is number => typeof v === "number"
  );
  if (tiers.length === 0) return undefined;
  out.leadFare = Math.min(...tiers);
  return out;
}

export interface PackageLookupResult {
  status: "confident_match" | "ambiguous" | "no_match";
  selected?: RankedPackageCandidate;
  candidates: RankedPackageCandidate[];
  diagnostics: string[];
}

export interface RankOptions {
  sailDateToleranceDays?: number;
  /** Min confidence to auto-select the top candidate. */
  confidenceThreshold?: number;
  /** Min lead the top candidate must have over the runner-up to auto-select. */
  minConfidenceMargin?: number;
  /**
   * Deal-system "always find a ship" mode. When true, candidates are never
   * excluded for being outside the sail-date tolerance, and the top-ranked
   * candidate is ALWAYS auto-selected (confident_match) whenever at least one
   * candidate with a usable package id exists — even if it's a low-confidence,
   * coin-flip pick. Never returns no_match/ambiguous when real candidates exist.
   * Group-campaign broker callers leave this off and keep strict behavior.
   */
  bestEffort?: boolean;
}

const DEFAULT_CONFIDENCE_THRESHOLD = 0.7;
const DEFAULT_CONFIDENCE_MARGIN = 0.15;

// ─── Normalizers (UTC-stable, mirrors run-phase-b) ──────────────────────────────

export function normalizeDateKey(rawDate?: string | null): string {
  const value = rawDate?.trim();
  if (!value) return "";
  const normalized = /^\d{4}-\d{2}-\d{2}/.test(value)
    ? `${value.slice(0, 10)}T12:00:00Z`
    : value;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return "";
  const yyyy = parsed.getUTCFullYear();
  const mm = String(parsed.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(parsed.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function daysBetweenDateKeys(a: string, b: string): number | null {
  const da = Date.parse(`${a}T12:00:00Z`);
  const db = Date.parse(`${b}T12:00:00Z`);
  if (Number.isNaN(da) || Number.isNaN(db)) return null;
  return Math.round(Math.abs(da - db) / (24 * 60 * 60 * 1000));
}

function resultStartDate(result: CruiseResult): string {
  return normalizeDateKey(result.packages?.[0]?.startDateTime);
}

function resultNightCount(result: CruiseResult): number | null {
  if (typeof result.itinerary?.duration === "number" && result.itinerary.duration > 0) {
    return result.itinerary.duration;
  }
  const pkg = result.packages?.[0]?.cruiseDuration;
  return typeof pkg === "number" && pkg > 0 ? pkg : null;
}

function resultPackageId(result: CruiseResult): string | undefined {
  const id = result.packages?.[0]?.id;
  return typeof id === "number" && id > 0 ? String(id) : undefined;
}

function cruiseLineName(result: CruiseResult): string | undefined {
  const id = result.ship?.cruiseline?.id;
  return id ? CRUISE_LINE_NAMES[id] ?? `Line ${id}` : undefined;
}

function norm(text: string | undefined): string {
  return (text ?? "").trim().toLowerCase();
}

// ─── Itinerary-type intelligence ────────────────────────────────────────────────
// The angle's destination is a CONCEPT ("Transatlantic", "Caribbean", "fjords",
// "repositioning / high-sea-day") — not a port code. To match it against a real
// sailing we have to read what the cruise actually IS from its name + ports, not
// just look for an exact substring. Without this, a genuine transatlantic crossing
// scores the same as a 4-night Bahamas hop, and date-proximity noise wins.

/** Continent bucket for a port code, coarse but enough to spot ocean crossings. */
function portContinent(code: string | undefined): string | undefined {
  const c = norm(code);
  if (!c) return undefined;
  // North America east coast / Caribbean embarkation hubs.
  if (["fll", "pef", "pev", "mia", "pce", "tpa", "nyc", "bos", "cpr", "bayonne", "sju", "nas"].some((p) => c.includes(p))) return "americas";
  if (["sfo", "lax", "sea", "van", "yvr", "hnl"].some((p) => c.includes(p))) return "americas-pacific";
  // Europe / UK / Mediterranean embarkation hubs.
  if (["sou", "lon", "dov", "har", "civ", "gen", "bcn", "sav", "mar", "lis", "fnc", "vgo", "lcg", "ath", "pir", "ven", "tri", "cph", "kie", "ams", "zbr"].some((p) => c.includes(p))) return "europe";
  // Asia / Oceania.
  if (["sin", "hkg", "syd", "auc", "inc", "tyo", "yok"].some((p) => c.includes(p))) return "asia-pacific";
  return undefined;
}

/**
 * Score how well a real sailing's itinerary matches the angle's destination concept.
 * Returns 0..0.45 plus human reasons. This is the signal that was missing — it lets
 * a "Transatlantic" angle actually find the transatlantic crossing in the pool.
 */
function scoreItineraryFit(
  destinationConcept: string,
  result: CruiseResult,
  nights: number | null
): { score: number; reasons: string[] } {
  const want = norm(destinationConcept);
  if (!want) return { score: 0, reasons: [] };

  const name = norm(result.name);
  const ports = `${norm(result.itinerary?.portsOfCalls)} ${norm(result.itinerary?.normalizedPortsOfCall)}`;
  const dep = result.itinerary?.departure?.code;
  const arr = result.itinerary?.arrival?.code;
  const depCont = portContinent(dep);
  const arrCont = portContinent(arr);
  const reasons: string[] = [];
  let score = 0;

  const isOceanCrossing =
    !!depCont && !!arrCont && depCont !== arrCont &&
    // a real crossing is long and one-way (different start/end port)
    norm(dep) !== norm(arr) && (nights === null || nights >= 6);

  // TRANSATLANTIC / OPEN-OCEAN / CROSSING angles.
  if (/transatlantic|crossing|open[- ]?ocean|repositioning|sea[- ]?day|high sea/.test(want)) {
    if (/transatlantic|crossing/.test(name)) {
      score += 0.45;
      reasons.push(`itinerary IS a crossing ("${result.name}")`);
    } else if (isOceanCrossing) {
      score += 0.4;
      reasons.push(`one-way ocean crossing (${dep}→${arr}, ${depCont}→${arrCont})`);
    } else if (/world|grand voyage|round world/.test(name) && (nights ?? 0) >= 14) {
      // World-voyage segments are sea-day-dense long ocean runs — strong fit for
      // "open-ocean / high-sea-day / repositioning" angles.
      score += 0.35;
      reasons.push(`long ocean / world voyage (${nights}n) — high sea-day density`);
    } else if ((nights ?? 0) >= 10 && ports.split("|").filter(Boolean).length <= 5) {
      // Long itinerary with few port stops = lots of sea days.
      score += 0.2;
      reasons.push(`${nights}n with few ports — sea-day heavy`);
    }
    return { score, reasons };
  }

  // REGION / NAMED-DESTINATION angles (Caribbean, Mediterranean, Alaska, fjords, etc.).
  // Pull the salient region words out of the concept and look for them in name/ports.
  const regionWords = want
    .split(/[^a-z]+/)
    .filter((w) => w.length >= 4 && !["from", "cruise", "sailing", "voyage", "during", "season"].includes(w));
  const hitName = regionWords.filter((w) => name.includes(w));
  const hitPorts = regionWords.filter((w) => ports.includes(w));
  if (hitName.length > 0) {
    score += 0.35;
    reasons.push(`itinerary name matches destination (${hitName.join(", ")})`);
  } else if (hitPorts.length > 0) {
    score += 0.2;
    reasons.push(`ports match destination (${hitPorts.join(", ")})`);
  }
  return { score, reasons };
}

// ─── Scoring ────────────────────────────────────────────────────────────────────

interface ScoredCandidate {
  candidate: RankedPackageCandidate;
  dayGap: number | null;
  withinTolerance: boolean;
}

function scoreOne(
  facts: LinkBrokerCruiseFacts,
  result: CruiseResult,
  toleranceDays: number
): ScoredCandidate | null {
  const packageId = resultPackageId(result);
  if (!packageId) return null;

  const reasons: string[] = [];
  let confidence = 0;

  // Date proximity (dominant signal).
  const expectedDate = normalizeDateKey(facts.sailDate);
  const resultDate = resultStartDate(result);
  const dayGap = expectedDate && resultDate ? daysBetweenDateKeys(expectedDate, resultDate) : null;
  let withinTolerance = true;
  if (expectedDate) {
    if (dayGap === null) {
      withinTolerance = false;
    } else if (dayGap === 0) {
      confidence += 0.5;
      reasons.push("exact sail date");
      withinTolerance = true;
    } else if (dayGap <= toleranceDays) {
      confidence += 0.5 - (dayGap / toleranceDays) * 0.25;
      reasons.push(`sail date within ${dayGap}d`);
      withinTolerance = true;
    } else {
      withinTolerance = false;
      reasons.push(`sail date off by ${dayGap}d`);
    }
  }

  // Nights.
  const expectedNights = facts.nights ?? null;
  const resultNights = resultNightCount(result);
  if (expectedNights !== null && resultNights !== null) {
    if (expectedNights === resultNights) {
      confidence += 0.2;
      reasons.push(`${resultNights} nights match`);
    } else {
      confidence -= 0.1;
      reasons.push(`nights differ (${resultNights} vs ${expectedNights})`);
    }
  }

  // Cruise line.
  const line = cruiseLineName(result);
  if (facts.cruiseLine && line) {
    if (norm(line).includes(norm(facts.cruiseLine)) || norm(facts.cruiseLine).includes(norm(line))) {
      confidence += 0.15;
      reasons.push(`cruise line matches (${line})`);
    } else {
      confidence -= 0.15;
      reasons.push(`cruise line differs (${line} vs ${facts.cruiseLine})`);
    }
  }

  // Ship name (the result `name`/`code` usually encodes ship/itinerary text).
  const haystack = `${norm(result.name)} ${norm(result.code)}`;
  if (facts.shipName && norm(facts.shipName) && haystack.includes(norm(facts.shipName))) {
    confidence += 0.2;
    reasons.push("ship name matches");
  }

  // Departure port.
  const depCode = result.itinerary?.departure?.code;
  if (facts.departurePort && depCode && norm(depCode).includes(norm(facts.departurePort))) {
    confidence += 0.1;
    reasons.push(`departure port matches (${depCode})`);
  }

  // Destination / itinerary-TYPE fit (the dominant signal for deal angles).
  // Reads what the cruise actually IS (crossing / region / sea-day-heavy) and
  // matches it against the angle's destination concept — so a "Transatlantic"
  // angle finds the real crossing instead of a date-closest Bahamas hop.
  const ports = result.itinerary?.normalizedPortsOfCall || result.itinerary?.portsOfCalls || "";
  const itinFit = scoreItineraryFit(facts.destination || facts.itineraryName || "", result, resultNights);
  if (itinFit.score > 0) {
    confidence += itinFit.score;
    reasons.push(...itinFit.reasons);
  } else if (norm(facts.destination || facts.itineraryName)) {
    reasons.push("itinerary does not match the destination concept");
  }

  confidence = Math.max(0, Math.min(1, confidence));

  return {
    candidate: {
      packageId,
      cruiseCode: result.code,
      cruiseName: result.name,
      cruiseLine: line,
      shipId: result.ship?.id,
      sailDateIso: resultDate,
      nights: resultNights,
      departurePortCode: depCode,
      portsOfCall: ports || undefined,
      itinerary: {
        durationNights: result.itinerary?.duration,
        departurePortCode: result.itinerary?.departure?.code,
        arrivalPortCode: result.itinerary?.arrival?.code,
        portsOfCall: result.itinerary?.portsOfCalls || undefined,
        normalizedPortsOfCall: result.itinerary?.normalizedPortsOfCall || undefined,
        mapPath: result.itinerary?.mapPath ?? undefined,
      },
      cabinPricing: extractCabinPricing(result),
      confidence,
      reasons,
    },
    dayGap,
    withinTolerance,
  };
}

/**
 * Ranks Odysseus candidates against the requested cruise facts.
 *
 * - confident_match: top candidate clears the confidence threshold AND leads the
 *   runner-up by the required margin -> safe to auto-select.
 * - ambiguous: candidates exist but none is confidently the one.
 * - no_match: nothing within date tolerance / no packages.
 */
export function rankPackageCandidates(
  facts: LinkBrokerCruiseFacts,
  results: CruiseResult[],
  options: RankOptions = {}
): PackageLookupResult {
  const tolerance = options.sailDateToleranceDays ?? SAIL_DATE_TOLERANCE_DAYS;
  const threshold = options.confidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD;
  const margin = options.minConfidenceMargin ?? DEFAULT_CONFIDENCE_MARGIN;
  const diagnostics: string[] = [];

  const scored = results
    .map((r) => scoreOne(facts, r, tolerance))
    .filter((s): s is ScoredCandidate => s !== null);

  const withoutPackage = results.length - scored.length;
  if (withoutPackage > 0) {
    diagnostics.push(`${withoutPackage} result(s) had no usable package ID and were dropped.`);
  }

  // If a sail date was given, require candidates within tolerance — UNLESS
  // bestEffort is on, in which case every scored candidate stays eligible so a
  // ship is always found (the ranking below still prefers the closest date).
  const haveDate = Boolean(normalizeDateKey(facts.sailDate));
  const eligible = haveDate && !options.bestEffort ? scored.filter((s) => s.withinTolerance) : scored;
  if (haveDate && !options.bestEffort && eligible.length < scored.length) {
    diagnostics.push(
      `${scored.length - eligible.length} candidate(s) outside the ${tolerance}-day sail-date tolerance were excluded.`
    );
  }

  // Ranking. bestEffort sorts by CONFIDENCE first (so a genuine itinerary-type
  // fit — e.g. the real transatlantic crossing — wins over a date-closer junk
  // sailing) and uses date proximity only to break near-ties. The angle's
  // requested date is a fabricated season-center, so it must never dominate a
  // real fit. Strict mode keeps the original confidence-only ordering.
  const byDayGap = new Map(eligible.map((s) => [s.candidate.packageId, s.dayGap]));
  const ranked = eligible
    .map((s) => s.candidate)
    .sort((a, b) => {
      if (Math.abs(a.confidence - b.confidence) > 0.02) {
        return b.confidence - a.confidence;
      }
      if (options.bestEffort && haveDate) {
        const ga = byDayGap.get(a.packageId);
        const gb = byDayGap.get(b.packageId);
        const na = ga === null || ga === undefined ? Number.POSITIVE_INFINITY : ga;
        const nb = gb === null || gb === undefined ? Number.POSITIVE_INFINITY : gb;
        if (na !== nb) return na - nb;
      }
      return b.confidence - a.confidence;
    });

  if (ranked.length === 0) {
    diagnostics.push("No candidates matched the requested cruise facts.");
    return { status: "no_match", candidates: [], diagnostics };
  }

  const top = ranked[0];
  const runnerUp = ranked[1];

  // bestEffort: a real package exists, so ALWAYS select the top one. CB has
  // thousands of sailings — we never bail to no_match/ambiguous here.
  if (options.bestEffort) {
    const gap = byDayGap.get(top.packageId);
    diagnostics.push(
      `Best-effort selected ${top.packageId} (confidence ${top.confidence.toFixed(2)}` +
        `${gap !== null && gap !== undefined ? `, ${gap}d from requested date` : ""}` +
        `${ranked.length > 1 ? `, closest of ${ranked.length} candidate(s)` : ", sole candidate"}).`
    );
    return { status: "confident_match", selected: top, candidates: ranked, diagnostics };
  }

  const clearsThreshold = top.confidence >= threshold;
  const clearsMargin = !runnerUp || top.confidence - runnerUp.confidence >= margin;

  if (clearsThreshold && clearsMargin) {
    diagnostics.push(
      `Auto-selected ${top.packageId} (confidence ${top.confidence.toFixed(2)}` +
        `${runnerUp ? `, +${(top.confidence - runnerUp.confidence).toFixed(2)} over runner-up` : ", sole candidate"}).`
    );
    return { status: "confident_match", selected: top, candidates: ranked, diagnostics };
  }

  diagnostics.push(
    `Top candidate confidence ${top.confidence.toFixed(2)} did not clear ` +
      `threshold ${threshold}${runnerUp ? ` / margin ${margin} over runner-up ${runnerUp.confidence.toFixed(2)}` : ""}; ` +
      `returning ${ranked.length} candidate(s) for operator review.`
  );
  return { status: "ambiguous", candidates: ranked, diagnostics };
}
