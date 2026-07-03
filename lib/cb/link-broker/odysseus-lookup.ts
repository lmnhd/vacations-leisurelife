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
import type { DayByDayItinerary, PackagePageSummary } from "@/lib/services/odysseus/types";

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

    if (ranked.selected) {
      try {
        const summary = await engine.fetchPackagePageSummary(
          ranked.selected.packageId,
          process.env.CB_AGENT_SIID ?? "1049337"
        );
        if (summary?.shipName) {
          ranked.selected.shipName = summary.shipName;
          if (summary.cruiseLine) ranked.selected.cruiseLine = summary.cruiseLine;
          const match = ranked.candidates.find((c) => c.packageId === ranked.selected!.packageId);
          if (match) {
            match.shipName = summary.shipName;
            if (summary.cruiseLine) match.cruiseLine = summary.cruiseLine;
          }
          ranked.diagnostics.push(
            `Captured package-page ship identity for ${ranked.selected.packageId}: ${summary.cruiseLine ? `${summary.cruiseLine}: ` : ""}${summary.shipName}.`
          );
        } else {
          ranked.diagnostics.push(
            `Package page did not expose a ship identity for ${ranked.selected.packageId}; kept search result identity.`
          );
        }
      } catch (err) {
        ranked.diagnostics.push(
          `Package-page ship identity fetch failed for ${ranked.selected.packageId}: ${err instanceof Error ? err.message : String(err)}.`
        );
      }
    }

    // Enrich the SELECTED candidate with the real day-by-day itinerary. The search
    // API only gives a coarse ports-of-call string; the per-day schedule (port
    // names, arrival/departure times, sea days) lives at a separate endpoint keyed
    // by itinerary id. Fetch it once for the chosen sailing only. Best-effort: a
    // failure leaves the coarse data intact (we never fabricate a schedule).
    const itineraryId = ranked.selected?.itinerary?.itineraryId;
    if (ranked.selected && itineraryId) {
      try {
        const { normalizeItineraryDetail } = await import("@/lib/services/odysseus/types");
        const detail = await engine.fetchItineraryDetail(itineraryId);
        const dayByDay = normalizeItineraryDetail(detail);
        if (dayByDay) {
          ranked.selected.itinerary = { ...ranked.selected.itinerary, dayByDay };
          // Keep the candidates[] entry in sync (same object identity is not
          // guaranteed across the array, so patch by packageId).
          const match = ranked.candidates.find((c) => c.packageId === ranked.selected!.packageId);
          if (match) match.itinerary = { ...match.itinerary, dayByDay };
          ranked.diagnostics.push(
            `Captured day-by-day itinerary (${dayByDay.days.length} day node(s)) for ${ranked.selected.packageId}.`
          );
        } else {
          ranked.diagnostics.push(
            `Itinerary detail unavailable for ${ranked.selected.packageId}; kept coarse ports only.`
          );
        }
      } catch (err) {
        ranked.diagnostics.push(
          `Itinerary detail fetch failed for ${ranked.selected.packageId}: ${err instanceof Error ? err.message : String(err)}.`
        );
      }
    }

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

/**
 * Fetch + normalize the real day-by-day itinerary for one Odysseus itinerary id,
 * driving its own authenticated session. Operator-run and read-only: it only reads
 * /nitroapi/v2/cruise/itinerary/{id}; it never books or holds.
 *
 * This is the SHARED capture used by both resolution paths — the auto-selected
 * candidate inside `lookupOdysseusPackages`, and the operator-picked candidate in
 * the ambiguous resolve flow — so neither path can silently skip enrichment.
 *
 * Best-effort by contract: returns null (never throws) on any failure or when the
 * detail endpoint has no usable schedule, so callers keep the coarse ports intact
 * and never fabricate a schedule.
 */
export async function captureDayByDayItinerary(
  itineraryId: number | string
): Promise<DayByDayItinerary | null> {
  let releaseSession: (() => Promise<void>) | undefined;
  try {
    const { getOdysseusSession, releaseOdysseusSession } = await import(
      "@/lib/services/odysseus/OdysseusSessionManager"
    );
    releaseSession = releaseOdysseusSession;
    const { normalizeItineraryDetail } = await import("@/lib/services/odysseus/types");

    const engine = await getOdysseusSession();
    const detail = await engine.fetchItineraryDetail(itineraryId);
    return normalizeItineraryDetail(detail);
  } catch {
    if (releaseSession) {
      try {
        await releaseSession();
      } catch {
        /* ignore */
      }
    }
    return null;
  }
}

export interface PackagePageTruth {
  summary: PackagePageSummary;
  /** Present when the page exposed an itinerary id AND the detail fetch succeeded. */
  dayByDay?: DayByDayItinerary;
  diagnostics: string[];
}

/**
 * Capture a sailing's facts straight off its own CB Swift package page, keyed
 * by the STABLE packageId in the deal's booking URL — identity, live cabin
 * pricing, and the full day-by-day schedule (via the itinerary id the page's
 * API payload exposes).
 *
 * This is the preferred data path over `lookupOdysseusPackages`: the search
 * index re-ranks, re-windows, and sometimes cannot re-find a sailing it
 * previously returned (close-in departures, partial category sell-outs),
 * while the package page keeps working for as long as the sailing is
 * bookable — it is the exact page a guest lands on from the deal's CTA.
 *
 * Operator-run and read-only: navigates the package page + reads
 * /nitroapi/v2/cruise/itinerary/{id}; never books, holds, or submits.
 * Returns null only when the package page itself yields nothing (gone/renamed
 * package); a missing day-by-day alone still returns the summary so callers
 * can keep whatever truth was recoverable.
 */
export async function capturePackagePageTruth(
  packageId: string,
  siid?: string
): Promise<PackagePageTruth | null> {
  const diagnostics: string[] = [];
  let releaseSession: (() => Promise<void>) | undefined;
  try {
    const { getOdysseusSession, releaseOdysseusSession } = await import(
      "@/lib/services/odysseus/OdysseusSessionManager"
    );
    releaseSession = releaseOdysseusSession;
    const { normalizeItineraryDetail } = await import("@/lib/services/odysseus/types");

    const engine = await getOdysseusSession();
    const summary = await engine.fetchPackagePageSummary(packageId, siid);
    if (!summary) {
      diagnostics.push(`Package page yielded no summary for ${packageId}.`);
      return null;
    }
    diagnostics.push(
      `Package page summary for ${packageId}: ${summary.shipName ?? summary.title ?? "?"}, sail ${summary.sailDateIso ?? "?"}.`
    );

    if (!summary.itineraryId) {
      diagnostics.push(`Package page payload carried no itinerary id; day-by-day not captured.`);
      return { summary, diagnostics };
    }

    const detail = await engine.fetchItineraryDetail(summary.itineraryId);
    const dayByDay = normalizeItineraryDetail(detail);
    if (dayByDay) {
      diagnostics.push(`Captured ${dayByDay.days.length} day node(s) via itinerary ${summary.itineraryId}.`);
    } else {
      diagnostics.push(`Itinerary detail ${summary.itineraryId} returned no usable schedule.`);
    }
    return { summary, dayByDay: dayByDay ?? undefined, diagnostics };
  } catch (error) {
    if (releaseSession) {
      try {
        await releaseSession();
      } catch {
        /* ignore */
      }
    }
    diagnostics.push(
      `Package page capture failed for ${packageId}: ${error instanceof Error ? error.message : String(error)}.`
    );
    return null;
  }
}
