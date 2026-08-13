/**
 * Deal Meta Distribution — Deal Workflow Step 9 (contracts).
 *
 * Pushes a Step 8 Meta Ad Synthesis (4 ready carousel cards) to Meta Ads
 * Manager as a paused draft, mirroring the group campaign system's
 * dispatchMetaAdsLive / dispatchInstagramGraphLive carousel pattern:
 *
 *   - New Campaign + Ad Set per deal (PAUSED, dynamic targeting from the
 *     deal's targetingDemographic, falling back to META_AD_SET_ID).
 *   - Instagram Graph carousel: one child media container per ready card
 *     (is_carousel_item) + one parent CAROUSEL container (children).
 *   - Facebook ad creative: child_attachments carousel on a link ad,
 *     each attachment using an uploaded image hash.
 *
 * Defaults to "simulate" mode (build + return the plan without calling the
 * Graph API). The operator flips a live toggle to actually dispatch.
 */

import type {
  DealAudienceCellDispatch,
  DealAudienceCellMatrix,
} from "./deal-audience-cell-types";

export type DealMetaDistributionMode = "simulate" | "live" | "organic_page_only";

export type DealMetaDistributionStatus =
  | "planned"
  | "dispatched"
  | "error";

/** One carousel card as it will be sent to Meta (image + copy + link). */
export interface DealMetaDistributionCard {
  cardIndex: number;
  headline: string;
  primaryText: string;
  imageUrl: string;
}

/** Result of resolving the deal's targeting demographic into Meta interests. */
export interface DealMetaDistributionTargetingPreview {
  interestQueries: string[];
  resolvedInterests: Array<{
    id: string;
    name: string;
    sourceQuery: string;
    resolvedQuery?: string;
    audienceSizeLowerBound?: number;
    audienceSizeUpperBound?: number;
  }>;
  unresolvedQueries: string[];
  targeting: Record<string, unknown>;
  adSetMode: "dynamic" | "static_fallback";
  geographicRestriction?: {
    countryCode: string;
    regionCode: string;
    regionName: string;
    residencyRequired: boolean;
    strict: true;
  };
  warnings: string[];
}

/** A built (but not necessarily dispatched) distribution plan for a deal. */
export interface DealMetaDistributionPlan {
  dealId: string;
  destinationUrl: string;
  caption: string;
  cards: DealMetaDistributionCard[];
  targeting: DealMetaDistributionTargetingPreview;
  /**
   * Creative audience matrix: 2-4 persona hypotheses with resolved targeting
   * diagnostics. Verified intent interests are consolidated into the single
   * prospecting ad set represented by `targeting`.
   */
  audienceMatrix?: DealAudienceCellMatrix;
  campaignName: string;
  adSetName: string;
  creativeName: string;
  adName: string;
}

/** Persisted record of a distribution attempt for a meta ad synthesis. */
export interface DealMetaDistribution {
  /** Cache key. Equals the source meta ad synthesis id. */
  id: string;
  dealId: string;
  sourceMetaAdSynthesisId: string;
  generatedAtIso: string;
  mode: DealMetaDistributionMode;
  status: DealMetaDistributionStatus;
  plan: DealMetaDistributionPlan;
  /** Populated once a live dispatch creates these Graph API objects. */
  metaCampaignId?: string;
  metaAdSetId?: string;
  metaAdSetMode?: "dynamic" | "static_fallback";
  facebookCreativeId?: string;
  facebookAdId?: string;
  /** Legacy per-cell outcomes retained for older distribution records. */
  cellDispatches?: DealAudienceCellDispatch[];
  facebookPagePostId?: string;
  instagramCarouselContainerId?: string;
  instagramMediaId?: string;
  reviewUrl?: string;
  notes: string[];
  error?: string;
}

export interface DealMetaDistributionCache {
  version: 1;
  generatedAtIso: string;
  distributions: DealMetaDistribution[];
}
