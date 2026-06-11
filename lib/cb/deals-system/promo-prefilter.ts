/**
 * Deterministic promo prefilter (pure, dependency-free).
 *
 * Before the Trip Manifestation agent correlates perks/discounts, this trims the
 * raw promo-intelligence records down to the ones that could plausibly apply to a
 * given cruise line + sail window. The point is efficiency: drop the obvious
 * non-matches (wrong vendor, sailing window that cannot overlap) so the AI prompt
 * only carries relevant data. It never decides applicability on its own — the AI
 * makes the final call over the survivors.
 *
 * Conservative by design: when a record's window can't be parsed, it is KEPT
 * (we can't prove non-overlap). Only clear mismatches are dropped.
 */

import type { CbPromoIntelligenceRecord } from "./promo-intelligence-types";

/** Normalize a cruise-line / vendor label for loose matching. */
export function normalizeCruiseLine(value: string): string {
  return value
    .toLowerCase()
    .replace(/cruise(s)?/g, "")
    .replace(/cruise line/g, "")
    .replace(/international/g, "")
    .replace(/lines?/g, "")
    .replace(/journeys/g, "")
    .replace(/[^a-z]/g, "")
    .trim();
}

/** True when a form cruise line and a promo vendor refer to the same line. */
export function cruiseLineMatches(formCruiseLine: string, promoVendor: string): boolean {
  const a = normalizeCruiseLine(formCruiseLine);
  const b = normalizeCruiseLine(promoVendor);
  if (!a || !b) return false;
  return a.includes(b) || b.includes(a);
}

function dateMs(value?: string): number | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : t;
}

/**
 * Whether a promo's sailing window can overlap the requested window. Returns true
 * when overlap is possible OR cannot be disproven (missing/unparseable bounds).
 */
function sailingWindowCanOverlap(
  promo: CbPromoIntelligenceRecord,
  window: { earliestIso?: string; latestIso?: string }
): boolean {
  const reqStart = dateMs(window.earliestIso);
  const reqEnd = dateMs(window.latestIso);
  if (reqStart === null && reqEnd === null) return true; // no window requested

  const promoStart = dateMs(promo.sailingWindow.startsOn);
  const promoEnd = dateMs(promo.sailingWindow.endsOn);
  if (promoStart === null && promoEnd === null) return true; // can't prove non-overlap

  // Treat missing bounds as open-ended on that side.
  const ps = promoStart ?? -Infinity;
  const pe = promoEnd ?? Infinity;
  const rs = reqStart ?? -Infinity;
  const re = reqEnd ?? Infinity;
  return ps <= re && pe >= rs;
}

export interface PromoPrefilterCriteria {
  cruiseLine?: string;
  sailWindow?: { earliestIso?: string; latestIso?: string };
}

export interface PromoPrefilterResult {
  kept: CbPromoIntelligenceRecord[];
  dropped: Array<{ id: string; vendor: string; reason: string }>;
  diagnostics: string[];
}

/**
 * Trim promo records to those that could apply to the given cruise line + window.
 * When no cruise line is given, vendor filtering is skipped (all vendors kept).
 */
export function prefilterPromoRecords(
  records: CbPromoIntelligenceRecord[],
  criteria: PromoPrefilterCriteria
): PromoPrefilterResult {
  const kept: CbPromoIntelligenceRecord[] = [];
  const dropped: PromoPrefilterResult["dropped"] = [];

  for (const promo of records) {
    if (criteria.cruiseLine && !cruiseLineMatches(criteria.cruiseLine, promo.vendor)) {
      dropped.push({
        id: promo.id,
        vendor: promo.vendor,
        reason: `vendor "${promo.vendor}" does not match cruise line "${criteria.cruiseLine}"`,
      });
      continue;
    }
    if (criteria.sailWindow && !sailingWindowCanOverlap(promo, criteria.sailWindow)) {
      dropped.push({
        id: promo.id,
        vendor: promo.vendor,
        reason: "sailing window cannot overlap the requested sail window",
      });
      continue;
    }
    kept.push(promo);
  }

  const diagnostics = [
    `${records.length} promo record(s) in; ${kept.length} kept, ${dropped.length} dropped.`,
    criteria.cruiseLine ? `Filtered by cruise line "${criteria.cruiseLine}".` : "No cruise-line filter applied.",
    criteria.sailWindow?.earliestIso || criteria.sailWindow?.latestIso
      ? `Filtered by sail window ${criteria.sailWindow.earliestIso ?? "?"}..${criteria.sailWindow.latestIso ?? "?"}.`
      : "No sail-window filter applied.",
  ];

  return { kept, dropped, diagnostics };
}
