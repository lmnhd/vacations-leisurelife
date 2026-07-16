/**
 * One-call package resolution (Deal Workflow Step 2 — Trip Manifestation).
 *
 * Wraps the live Odysseus lookup + (when a real candidate is known) the link
 * broker's booking-link build into a SINGLE server-side operation, so a freshly
 * manifested trip is resolved to one real cruise — ship, sail date, itinerary,
 * cabin pricing, AND booking link — before it is considered usable. Nothing
 * downstream (ad copy, funnel synthesis) should ever see a manifest without a
 * `resolvedPackage`.
 *
 * Not exported from the barrel: this module shells out via `node:child_process`
 * (the live Odysseus session is operator-run Playwright) and must never be
 * pulled into a client bundle. Only API routes import it directly.
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";

import { resolveBestBookingLink } from "@/lib/cb/link-broker";
import { scrapeLiveBookingPagePricing } from "@/lib/cb/link-broker/browser-validate";
import type { PackageLookupResult, RankedPackageCandidate } from "@/lib/cb/link-broker/package-lookup";

import { applyResolvedPackage, DEFAULT_DEAL_AGENT_SIID, parseRankedCandidate } from "./deal-package-resolver";
import { resolveInitialCabinPricing } from "./deal-pricing-hydration";
import type { DealManifestLookupQuery, DealTripManifest } from "./deal-trip-manifest-types";
import type { LinkHealthStatus } from "./link-broker-types";

const execAsync = promisify(exec);

function quoteShell(value: string): string {
  return `"${value.replace(/(["^&|<>%])/g, "^$1")}"`;
}

export interface RunOdysseusLookupOutput {
  ok: boolean;
  result?: PackageLookupResult;
  error?: string;
  command: string;
  diagnostics: string[];
  durationMs: number;
}

/**
 * Run the live Odysseus package lookup via the npm script (operator-run).
 *
 * `bestEffort` (default true): the deal workflow's Step 2 resolution always
 * wants a ship, so best-effort never bails to no_match/ambiguous when CB
 * returns any sailing — it picks the closest real package (coin-flip if
 * needed). Discovery's grounding check passes `bestEffort: false` so it only
 * accepts a STRICT confident_match (confidence >= threshold) — a low-confidence
 * pick must never ground an angle.
 */
export async function runOdysseusLookup(
  query: DealManifestLookupQuery,
  options: { bestEffort?: boolean } = {}
): Promise<RunOdysseusLookupOutput> {
  const args: string[] = [];
  if (query.line) args.push("--line", quoteShell(query.line));
  if (query.ship) args.push("--ship", quoteShell(query.ship));
  if (query.date) args.push("--date", quoteShell(query.date));
  if (query.nights) args.push("--nights", String(query.nights));
  if (query.destination) args.push("--destination", quoteShell(query.destination));
  if (query.port) args.push("--port", quoteShell(query.port));
  if (query.windowDays) args.push("--window", String(query.windowDays));
  if (options.bestEffort ?? true) {
    args.push("--best-effort");
  }

  const command = `npm run lookup-odysseus-package -- ${args.join(" ")}`;
  const startedAt = Date.now();

  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: process.cwd(),
      timeout: 300_000,
      maxBuffer: 1024 * 1024 * 8,
      windowsHide: true,
    });

    const diagnostics: string[] = [];
    if (stderr) diagnostics.push(stderr.slice(0, 2000));
    diagnostics.push(`Script exit 0 | ${Date.now() - startedAt}ms`);

    return { ok: true, result: parseLookupStdout(stdout), command, diagnostics, durationMs: Date.now() - startedAt };
  } catch (error) {
    const failure = error as { code?: number | string; stdout?: string; stderr?: string; message?: string };
    return {
      ok: false,
      error: failure.message ?? String(error),
      command,
      diagnostics: [failure.stderr ?? "", `Script exit ${String(failure.code ?? 1)}`],
      durationMs: Date.now() - startedAt,
    };
  }
}

/**
 * Parse the npm run lookup-odysseus-package stdout.
 *
 * Prefers the machine-readable JSON block emitted by the script (preserves
 * full candidate data: itinerary, cabin pricing, cruise line, ports). Falls
 * back to legacy regex parsing for backward compat / older script runs.
 */
function parseLookupStdout(stdout: string): PackageLookupResult {
  // --- JSON-first parse ------------------------------------------------------
  const jsonMatch = stdout.match(/---ODYSSEUS_LOOKUP_RESULT_JSON---\n([\s\S]*?)\n---END_JSON---/);
  if (jsonMatch) {
    try {
      const payload = JSON.parse(jsonMatch[1]) as unknown;
      if (typeof payload === "object" && payload !== null) {
        const p = payload as Record<string, unknown>;
        const parseCandidates = (arr: unknown): RankedPackageCandidate[] => {
          if (!Array.isArray(arr)) return [];
          return arr
            .filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null)
            .map((x) => parseRankedCandidateFromScript(x))
            .filter((c): c is RankedPackageCandidate => c !== undefined);
        };
        const candidates = parseCandidates(p.candidates);
        const selectedRaw =
          typeof p.selected === "object" && p.selected !== null
            ? parseRankedCandidateFromScript(p.selected as Record<string, unknown>)
            : undefined;
        const selected = selectedRaw && candidates.find((c) => c.packageId === selectedRaw.packageId)
          ? selectedRaw
          : candidates[0];
        const diagnostics = Array.isArray(p.diagnostics) ? p.diagnostics.map((d) => String(d)) : [];
        return {
          status: selected ? "confident_match" : candidates.length > 0 ? "ambiguous" : "no_match",
          selected,
          candidates,
          diagnostics,
        };
      }
    } catch {
      /* JSON parse failed — fall through to regex fallback */
    }
  }

  // --- Legacy regex fallback (older script runs without JSON block) ----------
  const lines = stdout.split("\n");
  const candidates: RankedPackageCandidate[] = [];
  let selected: RankedPackageCandidate | undefined;
  const diagnostics: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const selectedPkg = line.match(/Selected:\s+package\s+(\d+)\s+\|\s+(.+)/);
    if (selectedPkg) {
      selected = {
        packageId: selectedPkg[1],
        cruiseCode: "",
        cruiseName: selectedPkg[2].trim(),
        sailDateIso: "",
        confidence: 1,
        nights: null,
        reasons: ["script-selected"],
      };
      continue;
    }

    // "  [0.95] pkg 12345 | Cruise Name | 2026-11-08 7n"
    const candidateMatch = line.match(/^\s*\[([\d.]+)\]\s+pkg\s+(\d+)\s+\|\s+(.+?)\s+\|\s+(.+)$/);
    if (candidateMatch) {
      const confidence = Number(candidateMatch[1]);
      const packageId = candidateMatch[2];
      const cruiseName = candidateMatch[3].trim();
      const tail = candidateMatch[4].trim();

      const dateMatch = tail.match(/^(\d{4}-\d{2}-\d{2})(?:\s+(\d+)n)?/);
      const sailDateIso = dateMatch ? dateMatch[1] : "";
      const nights = dateMatch && dateMatch[2] ? Number(dateMatch[2]) : null;

      candidates.push({
        packageId,
        cruiseCode: "",
        cruiseName,
        sailDateIso,
        confidence: Number.isFinite(confidence) ? confidence : 0,
        nights,
        reasons: ["ranked by proximity"],
      });
    }
  }

  if (selected && candidates.length > 0) {
    const matched = candidates.find((c) => c.packageId === selected!.packageId);
    if (matched) selected = matched;
  }

  return {
    status: selected ? "confident_match" : candidates.length > 0 ? "ambiguous" : "no_match",
    selected,
    candidates: candidates.slice(0, 12),
    diagnostics,
  };
}

/** Parse a single candidate object from the script's JSON block. */
function parseRankedCandidateFromScript(x: Record<string, unknown>): RankedPackageCandidate | undefined {
  if (typeof x.packageId !== "string" || !x.packageId) return undefined;
  if (typeof x.cruiseName !== "string" || !x.cruiseName) return undefined;
  if (typeof x.sailDateIso !== "string" || !x.sailDateIso) return undefined;

  const itin = typeof x.itinerary === "object" && x.itinerary !== null ? (x.itinerary as Record<string, unknown>) : {};
  const pricing = typeof x.cabinPricing === "object" && x.cabinPricing !== null ? (x.cabinPricing as Record<string, unknown>) : null;

  return {
    packageId: x.packageId,
    cruiseCode: typeof x.cruiseCode === "string" ? x.cruiseCode : "",
    cruiseName: x.cruiseName,
    cruiseLine: typeof x.cruiseLine === "string" ? x.cruiseLine : undefined,
    shipName: typeof x.shipName === "string" ? x.shipName : undefined,
    sailDateIso: x.sailDateIso,
    nights: typeof x.nights === "number" ? x.nights : null,
    departurePortCode: typeof x.departurePortCode === "string" ? x.departurePortCode : undefined,
    portsOfCall: typeof x.portsOfCall === "string" ? x.portsOfCall : undefined,
    confidence: typeof x.confidence === "number" ? x.confidence : 0,
    reasons: Array.isArray(x.reasons) ? x.reasons.map((r) => String(r)) : [],
    itinerary: {
      durationNights: typeof itin.durationNights === "number" ? itin.durationNights : undefined,
      departurePortCode: typeof itin.departurePortCode === "string" ? itin.departurePortCode : undefined,
      arrivalPortCode: typeof itin.arrivalPortCode === "string" ? itin.arrivalPortCode : undefined,
      portsOfCall: typeof itin.portsOfCall === "string" ? itin.portsOfCall : undefined,
      normalizedPortsOfCall: typeof itin.normalizedPortsOfCall === "string" ? itin.normalizedPortsOfCall : undefined,
      mapPath: typeof itin.mapPath === "string" ? itin.mapPath : undefined,
    },
    cabinPricing: pricing
      ? {
          inside: typeof pricing.inside === "number" ? pricing.inside : undefined,
          outside: typeof pricing.outside === "number" ? pricing.outside : undefined,
          balcony: typeof pricing.balcony === "number" ? pricing.balcony : undefined,
          suite: typeof pricing.suite === "number" ? pricing.suite : undefined,
          currencyCode: typeof pricing.currencyCode === "string" ? pricing.currencyCode : "USD",
          leadFare: typeof pricing.leadFare === "number" ? pricing.leadFare : undefined,
        }
      : undefined,
  };
}

export interface ResolveCandidateOutput {
  manifest: DealTripManifest;
  diagnostics: string[];
}

/**
 * Build a booking link for an already-chosen candidate via the link broker, and
 * stamp the full resolution (ship, dates, itinerary, pricing, booking link) onto
 * the manifest. Used both for the auto-resolve (confident match) and the operator
 * candidate pick (ambiguous) paths — always the SAME final shape.
 */
export async function resolveCandidateOntoManifest(
  manifest: DealTripManifest,
  candidateInput: unknown,
  siidInput?: string
): Promise<ResolveCandidateOutput> {
  const candidate = parseRankedCandidate(candidateInput);
  if (!candidate) {
    throw new Error("candidate is required and must carry packageId, cruiseName, sailDateIso, confidence.");
  }

  const siid = siidInput ?? process.env.CB_AGENT_SIID ?? DEFAULT_DEAL_AGENT_SIID;
  const diagnostics: string[] = [];

  let bookingUrl: string | undefined;
  let bookingLinkClass: string | undefined;
  let linkHealth: { status: LinkHealthStatus; failureReason: string } | undefined;

  try {
    const brokerOut = await resolveBestBookingLink(
      {
        intent: "build_from_package_id",
        cruise: {
          packageId: candidate.packageId,
          cruiseLine: candidate.cruiseLine,
          shipName: candidate.shipName ?? candidate.cruiseName,
          sailDate: candidate.sailDateIso,
          nights: candidate.nights ?? undefined,
        },
        agent: { siid },
      },
      { useCache: true }
    );

    if (brokerOut.url) {
      bookingUrl = brokerOut.url;
      bookingLinkClass = brokerOut.linkClass;
      diagnostics.push(...brokerOut.warnings, `broker status: ${brokerOut.status}, linkClass: ${brokerOut.linkClass}`);
    } else {
      diagnostics.push(`broker produced no URL: ${brokerOut.status}`);
    }
    if (brokerOut.health) {
      linkHealth = { status: brokerOut.health.status, failureReason: brokerOut.health.failureReason ?? "" };
    }
  } catch (brokerError) {
    diagnostics.push(`broker error: ${brokerError instanceof Error ? brokerError.message : String(brokerError)}`);
  }

  // Capture the REAL day-by-day itinerary for the operator-picked candidate. The
  // ambiguous-resolve path hands back un-enriched ranked candidates (the auto-select
  // enrichment in odysseus-lookup only ran for ranked.selected), so without this the
  // resolved package keeps only the coarse ports string and the public page can show
  // nothing but a deduped port list. Best-effort: a failure leaves coarse data intact.
  const itineraryId = candidate.itinerary?.itineraryId;
  if (itineraryId && !candidate.itinerary?.dayByDay) {
    try {
      const { captureDayByDayItinerary } = await import("@/lib/cb/link-broker/odysseus-lookup");
      const dayByDay = await captureDayByDayItinerary(itineraryId);
      if (dayByDay) {
        candidate.itinerary = { ...candidate.itinerary, dayByDay };
        diagnostics.push(`Captured day-by-day itinerary (${dayByDay.days.length} day node(s)) for ${candidate.packageId}.`);
      } else {
        diagnostics.push(`Itinerary detail unavailable for ${candidate.packageId}; kept coarse ports only.`);
      }
    } catch (err) {
      diagnostics.push(
        `Itinerary detail capture failed for ${candidate.packageId}: ${err instanceof Error ? err.message : String(err)}.`
      );
    }
  } else if (!itineraryId) {
    // The search result carried no itinerary id — recover it from the package
    // page itself, which is keyed by the stable packageId and stays consistent
    // even when the search index no longer surfaces the sailing. This closes
    // the silent gap where a healthy-looking deal shipped without its calendar.
    try {
      const { capturePackagePageTruth } = await import("@/lib/cb/link-broker/odysseus-lookup");
      const truth = await capturePackagePageTruth(candidate.packageId, siid);
      diagnostics.push(...(truth?.diagnostics ?? []));
      if (truth?.dayByDay) {
        candidate.itinerary = {
          ...candidate.itinerary,
          itineraryId: truth.summary.itineraryId,
          dayByDay: truth.dayByDay,
        };
        diagnostics.push(
          `Recovered day-by-day itinerary (${truth.dayByDay.days.length} day node(s)) for ${candidate.packageId} via its package page.`
        );
      } else {
        diagnostics.push(
          `No itinerary id on picked candidate ${candidate.packageId} and the package page yielded no schedule; kept coarse ports only.`
        );
      }
    } catch (err) {
      diagnostics.push(
        `Package-page itinerary recovery failed for ${candidate.packageId}: ${err instanceof Error ? err.message : String(err)}.`
      );
    }
  }

  if (!candidate.shipName) {
    let releaseSession: (() => Promise<void>) | undefined;
    try {
      const { getOdysseusSession, releaseOdysseusSession } = await import("@/lib/services/odysseus/OdysseusSessionManager");
      releaseSession = releaseOdysseusSession;
      const engine = await getOdysseusSession();
      const summary = await engine.fetchPackagePageSummary(candidate.packageId, siid);
      if (summary?.shipName) {
        candidate.shipName = summary.shipName;
        if (summary.cruiseLine) candidate.cruiseLine = summary.cruiseLine;
        diagnostics.push(
          `Captured package-page ship identity for ${candidate.packageId}: ${summary.cruiseLine ? `${summary.cruiseLine}: ` : ""}${summary.shipName}.`
        );
      } else {
        diagnostics.push(`Package page did not expose a ship identity for ${candidate.packageId}; kept search result identity.`);
      }
    } catch (err) {
      diagnostics.push(
        `Package-page ship identity fetch failed for ${candidate.packageId}: ${err instanceof Error ? err.message : String(err)}.`
      );
    } finally {
      if (releaseSession) {
        await releaseSession().catch(() => undefined);
      }
    }
  }

  const pricingHydration = await resolveInitialCabinPricing(
    candidate.cabinPricing,
    bookingUrl,
    (url) => scrapeLiveBookingPagePricing(url)
  );
  diagnostics.push(pricingHydration.note);
  if (pricingHydration.status === "hydrated" && pricingHydration.pricing) {
    candidate.cabinPricing = pricingHydration.pricing;
  }

  const updatedManifest = applyResolvedPackage(manifest, {
    candidate,
    siid,
    bookingUrl,
    bookingLinkClass,
    linkHealth: linkHealth ? { status: linkHealth.status, failureReason: linkHealth.failureReason } : undefined,
    lookupDiagnostics: diagnostics,
  });

  return { manifest: updatedManifest, diagnostics };
}
