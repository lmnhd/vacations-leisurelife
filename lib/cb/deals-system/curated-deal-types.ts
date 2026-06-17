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

import type {
  DealAdStructure,
  DealApprovalState,
  DealCopyPackage,
  DealMediaPlan,
  DealPitchBrief,
} from "./campaign-types";
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
  /**
   * Optional public visibility cutoff. When present as YYYY-MM-DD, the deal is
   * still visible through the end of that date; omit to keep legacy deals live.
   */
  expiresOnIso?: string;
  packageId: string;
  siid: string;
  bookingUrl: string;
  bookingUrlSource: CuratedDealBookingUrlSource;
  /** Link health gates public publishing; see baseline rule 2. */
  linkHealth: LinkBrokerHealth;
  /**
   * How confidently Step 2's package lookup matched this packageId to the
   * angle's requested cruise facts (carried from manifest.resolvedPackage).
   * Gates approval — see evaluateApprovalGates "match_confidence" — so a
   * low-confidence/best-effort pick can't reach the homepage without an
   * operator override.
   */
  packageMatch?: {
    confidence: number;
    reasons: string[];
  };
  cruiseFacts: CuratedDealCruiseFacts;
  scoring: CuratedDealScoring;
  packaging: CuratedDealPackaging;
  /** Promos that may apply, with applicability confidence. */
  promoApplicability?: PromoApplicabilityResult[];
  /** Trip research backing the chosen angle. */
  angleResearch?: DealAngleResearch;
  /** Package-specific targeting resource, generated before ad packaging. */
  targetingDemographic?: DealTargetingDemographic;
  /**
   * Editorial pitch brief (Phase 9B): the customer-voice decisions that sit
   * between research and copy. Must exist before a DealCopyPackage is generated.
   */
  pitchBrief?: DealPitchBrief;
  /** Visitor-safe copy package (Phase 9A/9B); sourced from pitchBrief, not raw research. */
  copyPackage?: DealCopyPackage;
  /** Ad/campaign structure (Phase 9A); generated as an independent stage. */
  adStructure?: DealAdStructure;
  /** Media plan (Phase 9A); generated as an independent stage. */
  mediaPlan?: DealMediaPlan;
  /**
   * Operator approval gate (Phase 9A). The homepage may only render a Deal when
   * this is "approved" AND status is "bookable" AND link health is "valid". A
   * valid booking link alone is never enough to publish.
   */
  operatorApproval?: DealApprovalState;
  /** Internal-only notes; never rendered to public Deal fields. */
  agentOnlyNotes?: string[];
  /**
   * Operator-controlled homepage visibility (Phase 14). `pinned` Deals sort
   * first among eligible Deals; `hidden` Deals never appear publicly even if
   * otherwise eligible.
   */
  operatorVisibility?: {
    pinned?: boolean;
    hidden?: boolean;
  };
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
