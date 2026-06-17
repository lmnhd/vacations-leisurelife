/**
 * Shared deterministic seeding: turn a Sailing Angle Profile's prose
 * (destinationAndTimeOfYearHints / onboardAssetRequirements / title) into a
 * coarse cruise line + sail window. Used by Discovery (Step 1) to ground an
 * angle against real Odysseus inventory BEFORE it is accepted, and by Trip
 * Manifestation (Step 2) for promo prefiltering.
 *
 * Intentionally loose and permissive — it never narrows more than it can
 * justify. The AI passes downstream remain authoritative for the manifest's
 * cruise line / window; this is only a noise-reduction + search-seed heuristic.
 */

import { cruiseLineMatches } from "./promo-prefilter";
import type { SailingAngleProfile } from "./deal-discovery-types";
import type { DealManifestSailWindow } from "./deal-trip-manifest-types";

// Verified line names (see CRUISE_LINE_NAMES in package-lookup.ts) plus a couple
// of lines that exist in market but not in the current Odysseus vendor map.
export const KNOWN_CRUISE_LINES = [
  "Royal Caribbean",
  "Celebrity",
  "Carnival",
  "Norwegian",
  "Princess",
  "Holland America",
  "MSC",
  "Disney",
  "Costa",
  "Crystal",
  "Cunard",
  "Seabourn",
  "Regent Seven Seas",
  "Silversea",
  "Oceania",
  "Azamara",
  "Virgin Voyages",
];

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

const SEASONS: Record<string, [number, number]> = {
  "early spring": [3, 4], spring: [3, 5], "late spring": [5, 6],
  "early summer": [6, 7], summer: [6, 8], "late summer": [8, 9],
  "early autumn": [9, 10], autumn: [9, 11], fall: [9, 11], "late autumn": [11, 12],
  winter: [12, 2], "shoulder season": [4, 5],
};

function endOfMonthIso(year: number, month: number): string {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
}
function startOfMonthIso(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

/** Find the first known cruise line mentioned/matched in free text. */
export function seedCruiseLine(angleText: string): string | undefined {
  const lower = angleText.toLowerCase();
  return KNOWN_CRUISE_LINES.find((line) => cruiseLineMatches(line, lower) || lower.includes(line.toLowerCase()));
}

/** Parse a coarse sail window from timing hints. Permissive; returns undefined bounds if unsure. */
export function seedSailWindow(hints: string): DealManifestSailWindow {
  const lower = hints.toLowerCase();
  const yearMatch = lower.match(/\b(20\d{2})\b/);
  const year = yearMatch ? Number(yearMatch[1]) : new Date().getUTCFullYear() + 1;

  // Explicit month range or single month.
  const monthsFound = Object.keys(MONTHS).filter((m) => lower.includes(m));
  if (monthsFound.length > 0) {
    const nums = monthsFound.map((m) => MONTHS[m]).sort((a, b) => a - b);
    return {
      earliestIso: startOfMonthIso(year, nums[0]),
      latestIso: endOfMonthIso(year, nums[nums.length - 1]),
      rationale: `Seeded from month hint(s): ${monthsFound.join(", ")} ${year}.`,
    };
  }

  // Season phrase.
  const season = Object.keys(SEASONS).find((s) => lower.includes(s));
  if (season) {
    const [a, b] = SEASONS[season];
    if (a <= b) {
      return {
        earliestIso: startOfMonthIso(year, a),
        latestIso: endOfMonthIso(year, b),
        rationale: `Seeded from season hint "${season}" ${year}.`,
      };
    }
    // Wraps year-end (e.g. winter Dec–Feb).
    return {
      earliestIso: startOfMonthIso(year, a),
      latestIso: endOfMonthIso(year + 1, b),
      rationale: `Seeded from season hint "${season}" spanning ${year}-${year + 1}.`,
    };
  }

  return { rationale: "No parseable timing in the angle; promo sail-window filter not applied." };
}

/** Midpoint ISO date (YYYY-MM-DD) of a sail window, or undefined if unbounded. */
export function sailWindowCenterIso(window: DealManifestSailWindow): string | undefined {
  if (!window.earliestIso || !window.latestIso) return window.earliestIso ?? window.latestIso;
  const start = Date.parse(`${window.earliestIso}T00:00:00Z`);
  const end = Date.parse(`${window.latestIso}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) return window.earliestIso;
  const mid = new Date(start + (end - start) / 2);
  return mid.toISOString().slice(0, 10);
}

/** Days spanned by a sail window, for a search windowDays. Clamped to a sane range. */
export function sailWindowSpanDays(window: DealManifestSailWindow, fallback = 90): number {
  if (!window.earliestIso || !window.latestIso) return fallback;
  const start = Date.parse(`${window.earliestIso}T00:00:00Z`);
  const end = Date.parse(`${window.latestIso}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) return fallback;
  const days = Math.round((end - start) / 86_400_000 / 2);
  return Math.min(Math.max(days, 14), 150);
}

/** A broad inventory search profile derived from an angle profile's prose. */
export interface AngleInventorySearchSeed {
  /** Ranked cruise-line candidates to try in order (first match wins). */
  candidateLines: string[];
  /** Center-of-season sail date (YYYY-MM-DD), if parseable. */
  date?: string;
  /** Search window half-width in days. */
  windowDays: number;
  /** Broad destination/region text, for diagnostics (not sent to Odysseus). */
  destination: string;
}

/**
 * Build a broad Odysseus search seed from an angle's destination/timing hints
 * and onboard-asset requirements. Used by Discovery to ground an angle against
 * real inventory BEFORE it is accepted, and (with the same seed) re-derivable
 * by Step 2 for consistency.
 *
 * `candidateLines` tries the angle's best-fit line first, then falls back to
 * OTHER known lines mentioned anywhere in the angle's text — so a niche that
 * names multiple plausible lines (e.g. "Cunard, then Holland America") gets a
 * real shot at each before the angle is discarded.
 */
export function buildAngleSearchSeed(profile: SailingAngleProfile): AngleInventorySearchSeed {
  const seedText = `${profile.destinationAndTimeOfYearHints} ${profile.onboardAssetRequirements} ${profile.sailingAngleTitle}`;
  const lower = seedText.toLowerCase();

  const candidateLines = KNOWN_CRUISE_LINES.filter(
    (line) => cruiseLineMatches(line, lower) || lower.includes(line.toLowerCase())
  );
  const primary = seedCruiseLine(seedText);
  const ordered = primary
    ? [primary, ...candidateLines.filter((line) => line !== primary)]
    : candidateLines;

  const window = seedSailWindow(profile.destinationAndTimeOfYearHints);

  return {
    candidateLines: ordered,
    date: sailWindowCenterIso(window),
    windowDays: sailWindowSpanDays(window),
    destination: profile.destinationAndTimeOfYearHints,
  };
}
