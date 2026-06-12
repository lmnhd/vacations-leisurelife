/**
 * Deal Package Resolver (used by Trip Manifestation — Deal Workflow Step 2).
 *
 * Pure helpers for the resolution round-trip: turn a manifest's lookupQuery into
 * LinkBrokerCruiseFacts for the live Odysseus lookup, and stamp the chosen
 * candidate (+ the broker's booking link) back onto the manifest as
 * `resolvedPackage`.
 *
 * No browser, no AI, no fs here — the API route owns the live lookup and the
 * cache write. Every resolved field traces back to a real Odysseus candidate,
 * never the model.
 */

import type { RankedPackageCandidate } from "@/lib/cb/link-broker/package-lookup";

import type { LinkBrokerCruiseFacts, LinkBrokerHealth } from "./link-broker-types";
import type {
  DealManifestAssembleDraft,
  DealManifestResolvedPackage,
  DealTripManifest,
} from "./deal-trip-manifest-types";

/** Default agent SIID used when CB_AGENT_SIID is not configured. */
export const DEFAULT_DEAL_AGENT_SIID = "1049337";

/**
 * Project a manifest's lookupQuery into the cruise facts the live Package
 * Lookup consumes. Pure — exactly the values the operator would have typed.
 */
export function manifestLookupFacts(manifest: DealTripManifest): LinkBrokerCruiseFacts {
  const q = manifest.lookupQuery;
  return {
    cruiseLine: q.line,
    shipName: q.ship,
    sailDate: q.date,
    nights: q.nights,
    destination: q.destination,
    departurePort: q.port,
  };
}

export interface ApplyResolvedPackageInput {
  candidate: RankedPackageCandidate;
  siid: string;
  bookingUrl?: string;
  bookingLinkClass?: string;
  linkHealth?: LinkBrokerHealth;
  lookupDiagnostics?: string[];
  resolvedAtIso?: string;
}

/**
 * Stamp an operator-selected lookup candidate (+ broker link output) onto the
 * manifest as `resolvedPackage`. Pure — returns a new manifest.
 */
export function applyResolvedPackage(
  manifest: DealTripManifest,
  input: ApplyResolvedPackageInput
): DealTripManifest {
  const c = input.candidate;
  const resolvedPackage: DealManifestResolvedPackage = {
    resolvedAtIso: input.resolvedAtIso ?? new Date().toISOString(),
    source: "operator_package_lookup",
    packageId: c.packageId,
    cruiseName: c.cruiseName,
    cruiseLine: c.cruiseLine,
    shipName: c.cruiseName,
    sailDateIso: c.sailDateIso,
    nights: c.nights ?? undefined,
    departurePortCode: c.departurePortCode,
    confidence: c.confidence,
    reasons: c.reasons,
    siid: input.siid,
    bookingUrl: input.bookingUrl,
    bookingLinkClass: input.bookingLinkClass,
    linkHealth: input.linkHealth,
    cabinPricing: c.cabinPricing,
    itinerary: c.itinerary,
    lookupDiagnostics: input.lookupDiagnostics ?? [],
  };
  return { ...manifest, resolvedPackage };
}

/** Parse and structurally validate a candidate payload posted back by the lab UI. */
export function parseRankedCandidate(value: unknown): RankedPackageCandidate | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const v = value as Record<string, unknown>;
  if (typeof v.packageId !== "string" || !v.packageId) return undefined;
  if (typeof v.cruiseName !== "string" || !v.cruiseName) return undefined;
  if (typeof v.sailDateIso !== "string" || !v.sailDateIso) return undefined;
  if (typeof v.confidence !== "number") return undefined;
  return {
    packageId: v.packageId,
    cruiseCode: typeof v.cruiseCode === "string" ? v.cruiseCode : "",
    cruiseName: v.cruiseName,
    cruiseLine: typeof v.cruiseLine === "string" ? v.cruiseLine : undefined,
    shipId: typeof v.shipId === "number" ? v.shipId : undefined,
    sailDateIso: v.sailDateIso,
    nights: typeof v.nights === "number" ? v.nights : null,
    departurePortCode:
      typeof v.departurePortCode === "string" ? v.departurePortCode : undefined,
    portsOfCall: typeof v.portsOfCall === "string" ? v.portsOfCall : undefined,
    itinerary: parseItinerary(v.itinerary),
    cabinPricing: parseCabinPricing(v.cabinPricing),
    confidence: v.confidence,
    reasons: Array.isArray(v.reasons) ? v.reasons.map((r) => String(r)) : [],
  };
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function parseItinerary(value: unknown): RankedPackageCandidate["itinerary"] {
  if (typeof value !== "object" || value === null) return undefined;
  const v = value as Record<string, unknown>;
  return {
    durationNights: num(v.durationNights),
    departurePortCode: str(v.departurePortCode),
    arrivalPortCode: str(v.arrivalPortCode),
    portsOfCall: str(v.portsOfCall),
    normalizedPortsOfCall: str(v.normalizedPortsOfCall),
    mapPath: str(v.mapPath),
  };
}

function parseCabinPricing(value: unknown): RankedPackageCandidate["cabinPricing"] {
  if (typeof value !== "object" || value === null) return undefined;
  const v = value as Record<string, unknown>;
  const currencyCode = str(v.currencyCode) ?? "USD";
  return {
    inside: num(v.inside),
    outside: num(v.outside),
    balcony: num(v.balcony),
    suite: num(v.suite),
    currencyCode,
    leadFare: num(v.leadFare),
  };
}

/**
 * Reconcile the manifest's assembleDraft with the resolved real cruise so the
 * concrete facts come from the actual booking. Pure — returns a new manifest.
 *
 * Factual fields updated FROM the resolved real cruise:
 * - nights (what the real sailing actually is)
 * - departurePortHint (real departure port)
 * - portsOfCall (real port sequence)
 *
 * Fields deliberately PRESERVED (marketing, created by the AI for the angle):
 * - itineraryName (the AI's thematic name for the angle)
 * - destination (the AI's broad region / category)
 * - cruiseLine (already matches; verified same line)
 * - shipClassHint (angle-specific, not real-ship pinned)
 * - sailWindow (the angle's season; rationale is creative, not factual)
 *
 * When the chosen real sailing diverges from the angle's draft (e.g. the angle
 * was written around "Transatlantic" but the only inventory available is
 * Northern Europe), the fit-select pass returns a `reframe` — a softened
 * itineraryName/destination/sailWindow rationale grounded in the real sailing.
 * When provided, it OVERRIDES the corresponding preserved marketing fields so
 * the manifest never carries a headline that contradicts its resolved cruise.
 */
export function reconcileAssembleDraftWithResolved(
  manifest: DealTripManifest,
  reframe?: { itineraryName?: string; destination?: string; sailWindowRationale?: string }
): DealTripManifest {
  const r = manifest.resolvedPackage;
  if (!r) return manifest;

  const draft: DealManifestAssembleDraft = {
    ...manifest.assembleDraft,
    nights: r.nights ?? manifest.assembleDraft.nights,
    departurePortHint: r.departurePortCode ?? manifest.assembleDraft.departurePortHint,
    portsOfCall: r.itinerary?.portsOfCall
      ? r.itinerary.portsOfCall.split(/,\s*/).filter((s) => s.length > 0)
      : manifest.assembleDraft.portsOfCall,
    itineraryName: reframe?.itineraryName ?? manifest.assembleDraft.itineraryName,
    destination: reframe?.destination ?? manifest.assembleDraft.destination,
    sailWindow: reframe?.sailWindowRationale
      ? { ...manifest.assembleDraft.sailWindow, rationale: reframe.sailWindowRationale }
      : manifest.assembleDraft.sailWindow,
  };

  return { ...manifest, assembleDraft: draft };
}
