/**
 * Deal Trip Manifest data contracts (Deal Workflow Step 2 — Trip Manifestation).
 *
 * Under the inventory-first workflow, Step 1 (Discovery) produces a SailingAngleProfile
 * that is ALREADY GROUNDED on a real, verified Odysseus sailing (angle.groundedCandidate:
 * real packageId, cruise line, ship, sail date, nights, ports). Step 2 therefore does NOT
 * search for or choose a cruise. It takes that grounded angle + the raw CB promo
 * intelligence and produces the object that pre-fills SOURCE & ASSEMBLE for Step 3:
 *   - itineraryName / destination / cruiseLine / nights / ports / sail window — derived
 *     deterministically from the grounded candidate's REAL facts (no model framing).
 *   - appliedPromos / promoStrategy / manifestReasoning — the AI's only job (promo correlation).
 *
 * The booking link for the known packageId is resolved by the link broker
 * (resolveCandidateOntoManifest), writing `resolvedPackage`. `lookupQuery` is retained for
 * back-compat / traceability but the packageId is already known from Discovery — no manual
 * paste-into-lookup step is required anymore.
 */

import type { DealAiGenerationTrace } from "./campaign-types";
import type { LinkBrokerHealth } from "./link-broker-types";
import type { PromoApplicabilityResult } from "./promo-intelligence-types";

/**
 * Cabin-category lead fares the operator-run lookup captured from Odysseus. Real
 * pricing — never estimated. Mirrors PackageCabinPricing from the link broker.
 */
export interface DealResolvedCabinPricing {
  inside?: number;
  outside?: number;
  balcony?: number;
  suite?: number;
  currencyCode: string;
  /** Lowest populated tier — the "from" price. */
  leadFare?: number;
}

/**
 * One day of the real day-by-day schedule from the Odysseus itinerary-detail
 * endpoint. Real data — never fabricated. `day` is 1-based from embarkation.
 */
export interface DealItineraryDay {
  day: number;
  /** Readable port/description (e.g. "San Juan, Puerto Rico" or "At Sea"). */
  portName: string;
  portCode?: string;
  atSea: boolean;
  /** Raw "HH:MM:SS" Odysseus times; absent when not applicable. */
  arrivalTime?: string;
  departureTime?: string;
}

/**
 * Structured itinerary captured from the Odysseus result. `dayByDay` is the REAL
 * per-day schedule (port names, arrival/departure times, sea days) from the
 * itinerary-detail endpoint, captured for the resolved sailing; the coarse
 * departure/arrival/ports fields come from the search result.
 */
export interface DealResolvedItinerary {
  durationNights?: number;
  departurePortCode?: string;
  arrivalPortCode?: string;
  portsOfCall?: string;
  normalizedPortsOfCall?: string;
  mapPath?: string;
  /** Real day-by-day schedule from the itinerary-detail endpoint, when captured. */
  dayByDay?: DealItineraryDay[];
}

/** The sail-date window the angle implies; bounds the package lookup + promo match. */
export interface DealManifestSailWindow {
  earliestIso?: string;
  latestIso?: string;
  rationale: string;
}

/**
 * Draft cruise facts that pre-fill SOURCE & ASSEMBLE. Carries framing derived from
 * the grounded candidate's real facts; the live-resolved booking fields (shipName,
 * siid, bookingUrl) still come from the link broker via `resolvedPackage`, not the model.
 */
export interface DealManifestAssembleDraft {
  suggestedDealId: string;
  suggestedBriefId: string;
  cruiseLine: string;
  /** Optional ship CLASS hint (e.g. "Radiance class") for imagery sourcing; often unset now. */
  shipClassHint?: string;
  itineraryName: string;
  destination: string;
  nights?: number;
  sailWindow: DealManifestSailWindow;
  departurePortHint?: string;
  portsOfCall: string[];
}

/**
 * The cruise facts (line/ship/date/nights/port) for this manifest. Retained for
 * traceability + the link-broker resolution; under inventory-first Discovery the
 * packageId is already known, so this is no longer a manual paste-into-lookup query.
 */
export interface DealManifestLookupQuery {
  line: string;
  ship?: string;
  destination: string;
  date?: string;
  nights?: number;
  port?: string;
  windowDays: number;
}

/**
 * Optional structured targeting hints carried with the manifest so later stages
 * can build stronger platform targeting without re-guessing the operator's
 * audience intent from freeform copy alone.
 */
export interface DealManifestTargetingSeeds {
  inferredMarket?: string;
  geoFocus: string[];
  personaSignals: string[];
  metaInterestSeeds: string[];
  metaBehaviorSignals: string[];
  excludedAudienceSignals: string[];
}

/**
 * The real, resolved package for this manifest. Under inventory-first Discovery the
 * packageId is already known from angle.groundedCandidate; resolving the booking link
 * for it (via the link broker) stamps this object on. Every field here comes from a
 * real Odysseus search result + the link broker — never the model. Its presence means
 * SOURCE & ASSEMBLE is fully fillable.
 */
export interface DealManifestResolvedPackage {
  resolvedAtIso: string;
  /** Provenance lock: only the operator-run lookup may write this object. */
  source: "operator_package_lookup";
  packageId: string;
  cruiseName: string;
  cruiseLine?: string;
  shipName?: string;
  sailDateIso: string;
  nights?: number;
  departurePortCode?: string;
  /** Ranker confidence (0..1) of the candidate the operator selected. */
  confidence: number;
  /** Ranker reasons for the selected candidate, shown for traceability. */
  reasons: string[];
  siid: string;
  bookingUrl?: string;
  bookingLinkClass?: string;
  linkHealth?: LinkBrokerHealth;
  /** Real cabin pricing captured from the Odysseus result, when available. */
  cabinPricing?: DealResolvedCabinPricing;
  /** Structured itinerary (ports/map) captured from the Odysseus result. */
  itinerary?: DealResolvedItinerary;
  /** Diagnostics from the lookup + broker run that produced this resolution. */
  lookupDiagnostics: string[];
}

export interface DealTripManifest {
  /** Slug derived from the angle + cruise line; idempotency key in the cache. */
  id: string;
  generatedAtIso: string;
  generator: "gpt";
  /**
   * Optional public visibility cutoff for promos with a known end date. Date-only
   * values stay visible through that date; omit for backwards compatibility.
   */
  expiresOnIso?: string;
  /** The DealDiscoveryIdea this manifest was built from. */
  sourceAngleId: string;
  /** Carried from the angle for display + traceability. */
  isolatedNiche: string;
  sailingAngleTitle: string;

  /** Pre-fills SOURCE & ASSEMBLE (minus live-resolved fields). */
  assembleDraft: DealManifestAssembleDraft;
  /** Promos the agent judged applicable, with confidence + matched signals. */
  appliedPromos: PromoApplicabilityResult[];
  /** How the applied perks/discounts strengthen this angle. */
  promoStrategy: string;
  /** Why this line/destination/window fits the angle + its onboard-asset needs. */
  manifestReasoning: string;
  /** What the operator pastes into Package Lookup to resolve packageId + link. */
  lookupQuery: DealManifestLookupQuery;
  /** Optional structured audience hints for downstream targeting + ad routing. */
  targetingSeeds?: DealManifestTargetingSeeds;

  /**
   * Step 4 - Resolve. Written ONLY when the operator runs the lookupQuery
   * through the live Package Lookup and picks a real candidate. Never written
   * by the model.
   */
  resolvedPackage?: DealManifestResolvedPackage;

  aiTrace?: DealAiGenerationTrace;
}

export interface DealTripManifestsCache {
  version: 1;
  generatedAtIso: string;
  manifests: DealTripManifest[];
}
