/**
 * Promo Intelligence data contracts.
 *
 * Structured CB Agent Tools Today's View promotion records: rules, perks,
 * windows, combinability, restrictions, warnings. Promo Intelligence is not
 * publishable on its own — a Deal still needs a valid booking path (see
 * PHASE_0_BASELINE_GUARDRAILS.md).
 *
 * Mirrors CB_AGENT_TOOLS_PROMO_INTELLIGENCE_PLAN.md. Extraction lands in
 * Phase 4/5; these are the Phase 1 schemas.
 */

export type CbPromoOfferType =
  | "second_guest_discount"
  | "dollars_off"
  | "onboard_credit"
  | "free_extra_guests"
  | "instant_savings"
  | "all_included"
  | "agency_special"
  | "suite_perk"
  | "other";

export interface CbPromoPercentDiscount {
  appliesTo: string;
  percentOff: number;
  depositType?: "refundable" | "non_refundable";
  rawText: string;
}

export interface CbPromoDollarSaving {
  amountUsd: number;
  appliesTo: string;
  voyageLength?: "3_to_5_nights" | "6_plus_nights" | string;
  cabinCategory?: string;
  bookingDayWindow?: string;
  rawText: string;
}

export interface CbPromoOnboardCredit {
  amountUsd: number;
  appliesTo: string;
  voyageLength?: string;
  cabinCategory?: string;
  bookingDayWindow?: string;
  rawText: string;
}

export interface CbPromoFreeGuestOffer {
  guestNumbers: string;
  excludedCabins?: string[];
  rawText: string;
}

export interface CbPromoCombinability {
  cruiseOnly?: boolean;
  allIncluded?: boolean;
  refundableDeposit?: boolean;
  nonRefundableDeposit?: boolean;
  groupRates?: boolean;
  groupXRates?: boolean;
  singleSupplements?: boolean;
  riverCruises?: boolean;
  cruiseTours?: boolean;
  rawRules: string[];
}

export interface CbPromoExtractedTerms {
  offerTypes: CbPromoOfferType[];
  percentDiscounts: CbPromoPercentDiscount[];
  dollarSavings: CbPromoDollarSaving[];
  onboardCredits: CbPromoOnboardCredit[];
  freeGuestOffers: CbPromoFreeGuestOffer[];
  combinability: CbPromoCombinability;
  exclusions: string[];
  applicableProducts: string[];
  applicableMarkets: string[];
}

export interface CbPromoMarketingUse {
  publicClaimsAllowed: string[];
  publicClaimsNeedsQualifier: string[];
  agentOnlyNotes: string[];
  suggestedAngles: string[];
  cautionFlags: string[];
  bestMatchedDealBriefs: string[];
  visitorFriendlySummary: string;
}

export interface CbPromoExtractionDiagnostics {
  /** "succeeded" | "needs_review" | "failed" — extraction outcome. */
  status: "succeeded" | "needs_review" | "failed";
  model?: string;
  notes: string[];
  warnings: string[];
}

export interface CbPromoDateWindow {
  startsOn?: string;
  endsOn?: string;
  rawText: string;
}

export interface CbPromoSupportingFile {
  label: string;
  url: string;
  fileName: string;
}

export type CbPromoIntelligenceSource =
  | "cb_agent_tools_todays_view"
  | "official_cruise_line";

export interface CbPromoIntelligenceRecord {
  id: string;
  source: CbPromoIntelligenceSource;
  sourceUrl: string;
  detailUrl: string;
  capturedAtIso: string;
  title: string;
  vendor: string;
  bookingWindow: CbPromoDateWindow;
  sailingWindow: CbPromoDateWindow;
  promotionDetailsRaw: string;
  agentInstructionsRaw: string;
  keyFeaturesRaw: string;
  applicableSailingsRaw: string;
  applicableProductsRaw: string;
  applicableMarketsRaw: string;
  supportingFiles: CbPromoSupportingFile[];
  extracted: CbPromoExtractedTerms;
  marketingUse: CbPromoMarketingUse;
  diagnostics: CbPromoExtractionDiagnostics;
}

export interface CbPromoIntelligenceCache {
  version: 1;
  generatedAtIso: string;
  sourceUrl: "https://www.cbagenttools.com/marketing/todaysview/";
  records: CbPromoIntelligenceRecord[];
  diagnostics: {
    promotionLinksFound: number;
    detailPagesScraped: number;
    extractionSucceeded: number;
    extractionNeedsReview: number;
    supportingFilesFound: number;
    errors: string[];
  };
}

export type PromoApplicabilityStatus =
  | "likely_applicable"
  | "possibly_applicable_needs_review"
  | "not_applicable"
  | "insufficient_data";

export interface PromoApplicabilityResult {
  promoRecordId: string;
  status: PromoApplicabilityStatus;
  matchedOn: string[];
  assumptions: string[];
  warnings: string[];
}
