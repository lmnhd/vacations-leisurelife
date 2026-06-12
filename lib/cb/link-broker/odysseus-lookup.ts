/**
 * Operator-run Odysseus package lookup.
 *
 * Resolves cruise facts (line/ship/date/nights/destination/port) into a ranked
 * set of Odysseus package candidates by driving a live authenticated Odysseus
 * session and feeding its results into the pure ranker in package-lookup.ts.
 *
 * The session manager and Odysseus engine are imported dynamically so importing
 * the broker does not pull Playwright / the engine into the Next runtime bundle.
 * This is operator-run (PHASE_0 rule 4) and read-only: it searches; it never
 * books, holds, or submits anything.
 */

import {
  CRUISE_LINE_NAMES,
  rankPackageCandidates,
  type PackageLookupResult,
  type RankOptions,
} from "./package-lookup";
import type { LinkBrokerCruiseFacts, LinkBrokerTravelerSetup } from "./types";

/** name -> vendorId, derived from CRUISE_LINE_NAMES (first id wins). */
const VENDOR_ID_BY_NAME: Record<string, number> = (() => {
  const map: Record<string, number> = {};
  for (const [id, name] of Object.entries(CRUISE_LINE_NAMES)) {
    const key = name.toLowerCase();
    if (!(key in map)) map[key] = Number(id);
  }
  return map;
})();

/** Resolves a cruise-line name to an Odysseus vendorId, when recognized. */
export function resolveVendorId(cruiseLine: string | undefined): number | undefined {
  if (!cruiseLine) return undefined;
  const needle = cruiseLine.trim().toLowerCase();
  if (VENDOR_ID_BY_NAME[needle]) return VENDOR_ID_BY_NAME[needle];
  // Partial match (e.g. "Royal Caribbean International" -> "royal caribbean").
  for (const [name, id] of Object.entries(VENDOR_ID_BY_NAME)) {
    if (needle.includes(name) || name.includes(needle)) return id;
  }
  return undefined;
}

function toMmDdYyyy(iso: string): string | undefined {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return undefined;
  return `${m[2]}/${m[3]}/${m[1]}`;
}

function shiftDays(mmddyyyy: string, days: number): string | undefined {
  const m = mmddyyyy.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return undefined;
  const d = new Date(Date.UTC(Number(m[3]), Number(m[1]) - 1, Number(m[2])));
  d.setUTCDate(d.getUTCDate() + days);
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${mm}/${dd}/${d.getUTCFullYear()}`;
}

export interface OdysseusLookupOptions extends RankOptions {
  travelerSetup?: LinkBrokerTravelerSetup;
  /** Days each side of the sail date to widen the search window. Default 7. */
  searchWindowDays?: number;
}

/**
 * Searches Odysseus for the requested cruise and ranks the candidates.
 *
 * Centers the date window on the requested sail date (±searchWindowDays) so the
 * API returns the target sailing, scopes by vendor when the cruise line is
 * recognized, then ranks. Returns a PackageLookupResult the broker can act on.
 *
 * Robustness: the session manager / engine import and search are ALL wrapped in
 * one try/catch, so a module-load, login, or Playwright failure degrades to a
 * graceful no_match diagnostic instead of crashing the operator script (which
 * surfaced upstream as a hard "Command failed").
 *
 * bestEffort (deal system): when the scoped vendor search returns ZERO sailings,
 * retry once without the vendor filter (same date window) so a ship is still
 * found whenever CB has anything sailing in the window.
 */
export async function lookupOdysseusPackages(
  facts: LinkBrokerCruiseFacts,
  options: OdysseusLookupOptions = {}
): Promise<PackageLookupResult> {
  const windowDays = options.searchWindowDays ?? 7;
  const sailMmDdYyyy = facts.sailDate ? toMmDdYyyy(facts.sailDate) : undefined;
  const startDate = sailMmDdYyyy ? shiftDays(sailMmDdYyyy, -windowDays) : undefined;
  const endDate = sailMmDdYyyy ? shiftDays(sailMmDdYyyy, windowDays) : undefined;
  const vendorId = resolveVendorId(facts.cruiseLine);

  const passengers = options.travelerSetup?.passengerCount ?? 2;
  const guestAges =
    options.travelerSetup?.ages && options.travelerSetup.ages.length > 0
      ? options.travelerSetup.ages
      : Array.from({ length: passengers }, () => 35);

  let releaseSession: (() => Promise<void>) | undefined;

  try {
    const { getOdysseusSession, releaseOdysseusSession } = await import(
      "@/lib/services/odysseus/OdysseusSessionManager"
    );
    releaseSession = releaseOdysseusSession;

    const engine = await getOdysseusSession();
    const baseSearch = {
      passengers,
      guestAges,
      ...(startDate && endDate ? { startDate, endDate } : {}),
      ...(options.travelerSetup?.state ? { guestStateResidence: options.travelerSetup.state } : {}),
    };

    let results = await engine.searchCruises({
      ...baseSearch,
      ...(vendorId ? { vendorId } : {}),
    });
    const searchNotes: string[] = [
      `Odysseus search: vendor=${vendorId ?? "any"}, window=${startDate ?? "none"}..${endDate ?? "none"}, ` +
        `returned ${results.length} result(s).`,
    ];

    // bestEffort widening: scoped vendor search came back empty — drop the
    // vendor filter and search any line in the same window so we still find a ship.
    if (results.length === 0 && options.bestEffort && vendorId) {
      results = await engine.searchCruises(baseSearch);
      searchNotes.push(
        `Best-effort widened search (dropped vendor filter): returned ${results.length} result(s).`
      );
    }

    const ranked = rankPackageCandidates(facts, results, options);
    ranked.diagnostics.unshift(...searchNotes);
    return ranked;
  } catch (error) {
    // Release a broken session so the next call cold-starts cleanly.
    if (releaseSession) {
      try {
        await releaseSession();
      } catch {
        /* ignore */
      }
    }
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: "no_match",
      candidates: [],
      diagnostics: [`Odysseus lookup failed: ${message}`],
    };
  }
}
