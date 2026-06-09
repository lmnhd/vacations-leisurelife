export interface CBPickData {
  img: string;
  destination: string;
  what: string;
  when: string;
  price: string;
  elsepay: string;
  go: string;
  why: string;
  other: string;
  id: string;
  destination_url?: string;
}

export interface CbHomepageDealToolTips {
  freeDining?: boolean;
  freeDrinks?: boolean;
  freeWifi?: boolean;
  onboardCredits?: boolean;
}

export interface StoredCbHomepageDeal {
  id: string;
  destination: string;
  imageSrc: string;
  alt: string;
  day: string;
  port: string;
  header1: string;
  header2: string;
  description: string;
  pricePerPerson: string;
  detailsLink: string;
  toolTips?: CbHomepageDealToolTips;
  status?: StoredCbDealStatus;
  bookingUrl?: string;
}

export type StoredCbDealStatus = "bookable" | "info_only" | "needs_operator_review";

export type StoredCbDealLinkSource =
  | "cb_pick"
  | "cb_agent_tools_promo"
  | "operator_override"
  | "none";

export interface StoredCbDealDetail {
  id: string;
  status: StoredCbDealStatus;
  sourcePick: CBPickData;
  display: {
    title: string;
    subtitle: string;
    heroImageSrc: string;
    heroImageAlt: string;
    shortSummary: string;
    longSummary: string;
    dealHighlights: string[];
    itineraryHighlights: string[];
    destinationHighlights: string[];
    bestFor: string[];
    urgencyCopy: string;
  };
  cruiseFacts: {
    destination: string;
    cruiseLine?: string;
    shipName?: string;
    nights?: string;
    embarkationPort?: string;
    sailDateLabel?: string;
    priceFromLabel?: string;
    includedPerks: string[];
  };
  booking: {
    packageId?: string;
    siid?: string;
    bookingUrl?: string;
    bookingUrlVerifiedAtIso?: string;
    linkSource: StoredCbDealLinkSource;
    matchScore?: number;
    matchedShipName?: string;
    matchedVendor?: string;
    matchedSailDate?: string;
    matchedNights?: string;
    matchedItinerary?: string;
  };
  enrichment: {
    model: "deterministic_v1" | "gpt-5.4-mini" | "gpt-5.4";
    generatedAtIso: string;
    sourceInputsHash: string;
  };
}

export interface CbDealsRefreshDiagnostics {
  picksFound: number;
  cbAgentToolsPromosFound?: number;
  cbAgentToolsBookablePromosFound?: number;
  homepageDealsBuilt: number;
  detailDealsBuilt: number;
  bookableDeals: number;
  infoOnlyDeals: number;
  needsOperatorReview: number;
  generatedAtIso: string;
}

export interface StoredCbDealsPayload {
  version: number;
  generatedAtIso: string;
  source: string;
  picks: CBPickData[];
  homepageDeals: StoredCbHomepageDeal[];
  dealDetails?: StoredCbDealDetail[];
  refreshDiagnostics?: CbDealsRefreshDiagnostics;
}
