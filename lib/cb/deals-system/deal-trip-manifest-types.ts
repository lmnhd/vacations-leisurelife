/**
 * Deal Trip Manifest data contracts (Deal Workflow Step 2 — Trip Manifestation).
 *
 * Step 1 (Discovery) produces a SailingAngleProfile. Step 2 takes a selected angle
 * + the raw CB promo intelligence and correlates the perfect cruise line /
 * destination / sail window and the perks/discounts that apply, producing the object
 * that pre-fills the SOURCE & ASSEMBLE form for Step 3 (targeting/pitch/copy).
 *
 * Hard constraint: live Odysseus package search is operator-run Playwright, so the
 * agent CANNOT fetch a real packageId. The manifest fills everything in SOURCE &
 * ASSEMBLE EXCEPT packageId, shipName, siid, and bookingUrl — those are resolved by
 * the operator-run package lookup + the link broker. `lookupQuery` is the exact set
 * of inputs the operator pastes into Package Lookup to resolve them.
 */

import type { DealAiGenerationTrace } from "./campaign-types";
import type { PromoApplicabilityResult } from "./promo-intelligence-types";

/** The sail-date window the angle implies; bounds the package lookup + promo match. */
export interface DealManifestSailWindow {
  earliestIso?: string;
  latestIso?: string;
  rationale: string;
}

/**
 * Draft cruise facts that pre-fill SOURCE & ASSEMBLE. Deliberately omits the
 * live-resolved fields (packageId, shipName, siid, bookingUrl) — those come from
 * the operator-run lookup + link broker, never from the model.
 */
export interface DealManifestAssembleDraft {
  suggestedDealId: string;
  suggestedBriefId: string;
  cruiseLine: string;
  /** Ship CLASS hint only (e.g. "Radiance class"); the real ship is resolved by lookup. */
  shipClassHint?: string;
  itineraryName: string;
  destination: string;
  nights?: number;
  sailWindow: DealManifestSailWindow;
  departurePortHint?: string;
  portsOfCall: string[];
}

/** Exact inputs the operator pastes into Package Lookup to resolve packageId + link. */
export interface DealManifestLookupQuery {
  line: string;
  ship?: string;
  destination: string;
  date?: string;
  nights?: number;
  port?: string;
  windowDays: number;
}

export interface DealTripManifest {
  /** Slug derived from the angle + cruise line; idempotency key in the cache. */
  id: string;
  generatedAtIso: string;
  generator: "gpt";
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

  aiTrace?: DealAiGenerationTrace;
}

export interface DealTripManifestsCache {
  version: 1;
  generatedAtIso: string;
  manifests: DealTripManifest[];
}
