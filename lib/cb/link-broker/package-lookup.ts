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
  /** 0..1 confidence this candidate is the requested cruise. */
  confidence: number;
  reasons: string[];
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

  // Destination / itinerary keyword presence in ports-of-call text.
  const ports = result.itinerary?.normalizedPortsOfCall || result.itinerary?.portsOfCalls || "";
  const destNeedle = norm(facts.destination || facts.itineraryName);
  if (destNeedle && norm(ports).includes(destNeedle)) {
    confidence += 0.1;
    reasons.push("destination/itinerary keyword present");
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

  // If a sail date was given, require candidates within tolerance.
  const haveDate = Boolean(normalizeDateKey(facts.sailDate));
  const eligible = haveDate ? scored.filter((s) => s.withinTolerance) : scored;
  if (haveDate && eligible.length < scored.length) {
    diagnostics.push(
      `${scored.length - eligible.length} candidate(s) outside the ${tolerance}-day sail-date tolerance were excluded.`
    );
  }

  const ranked = eligible
    .map((s) => s.candidate)
    .sort((a, b) => b.confidence - a.confidence);

  if (ranked.length === 0) {
    diagnostics.push("No candidates matched the requested cruise facts.");
    return { status: "no_match", candidates: [], diagnostics };
  }

  const top = ranked[0];
  const runnerUp = ranked[1];
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
