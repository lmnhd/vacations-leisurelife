/**
 * Curated Odysseus Deal data contracts.
 *
 * A Curated Deal merges Odysseus package facts, Link Broker output, promo
 * applicability, trip research, the Targeting-Demographic resource, visitor-safe
 * copy, internal agent notes, and link health into one publishable record.
 *
 * Publishing gate (PHASE_0_BASELINE_GUARDRAILS.md rule 2): a Deal only goes
 * public when `status === "bookable"` and its link health is `valid`.
 *
 * Mirrors PRELIMINARY_PLAN.md (Curated Deal Record) and assembles in Phase 9.
 */

import type { LinkBrokerHealth } from "./link-broker-types";
import type { PromoApplicabilityResult } from "./promo-intelligence-types";
import type {
  DealAngleResearch,
  DealTargetingDemographic,
} from "./research-types";

export type CuratedDealStatus = "bookable" | "needs_review" | "expired";

export type CuratedDealBookingUrlSource =
  | "share_button"
  | "constructed_package_url";

export interface CuratedDealCabinPrices {
  inside?: number;
  outside?: number;
  balcony?: number;
  suite?: number;
  currencyCode: string;
}

export interface CuratedDealCruiseFacts {
  title: string;
  cruiseLine: string;
  shipName: string;
  itineraryName: string;
  nights: number;
  sailDateIso: string;
  departurePort?: string;
  portsOfCall: string[];
  cabinPrices: CuratedDealCabinPrices;
  promoSignals: string[];
}

export interface CuratedDealScoring {
  score: number;
  reasons: string[];
  warnings: string[];
}

export interface CuratedDealPackaging {
  headline: string;
  shortSummary: string;
  highlights: string[];
  destinationNotes: string[];
  bestFor: string[];
}

export interface CuratedOdysseusDeal {
  id: string;
  status: CuratedDealStatus;
  source: "odysseus_curated_retail";
  briefId: string;
  capturedAtIso: string;
  packageId: string;
  siid: string;
  bookingUrl: string;
  bookingUrlSource: CuratedDealBookingUrlSource;
  /** Link health gates public publishing; see baseline rule 2. */
  linkHealth: LinkBrokerHealth;
  cruiseFacts: CuratedDealCruiseFacts;
  scoring: CuratedDealScoring;
  packaging: CuratedDealPackaging;
  /** Promos that may apply, with applicability confidence. */
  promoApplicability?: PromoApplicabilityResult[];
  /** Trip research backing the chosen angle. */
  angleResearch?: DealAngleResearch;
  /** Package-specific targeting resource, generated before ad packaging. */
  targetingDemographic?: DealTargetingDemographic;
  /** Internal-only notes; never rendered to public Deal fields. */
  agentOnlyNotes?: string[];
}

export interface OdysseusDealBrief {
  id: string;
  title: string;
  destinationKeywords: string[];
  cruiseLine?: string;
  vendorId?: number;
  shipName?: string;
  departurePort?: string;
  minNights?: number;
  maxNights?: number;
  earliestSailDate?: string;
  latestSailDate?: string;
  maxInsidePricePerPerson?: number;
  maxBalconyPricePerPerson?: number;
  requiredPromoSignals?: string[];
  excludedSignals?: string[];
  marketingAngle: string;
  audienceFit: string[];
}

export interface CuratedOdysseusDealsCache {
  version: 1;
  generatedAtIso: string;
  briefs: OdysseusDealBrief[];
  deals: CuratedOdysseusDeal[];
}
