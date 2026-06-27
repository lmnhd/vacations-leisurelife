/**
 * Deal Google Ads Distribution — Deal Workflow Step 10 (contracts).
 *
 * Pushes a Step 9 Google Ads Synthesis (ready landscape + square images,
 * headline/long_headline/description) to the live Google Ads account as a
 * PAUSED Responsive Display Ad draft, reusing the group-campaign system's
 * tested Google Ads platform module
 * (lib/campaigns/distribution/platforms/google-ads/campaign.ts) for the
 * actual API calls — campaign/budget/ad-group/ad creation, targeting
 * criteria, and verification readback — rather than the group-campaign
 * entry points themselves (createGoogleDisplayDraft takes a
 * CampaignMediaManifest + ScheduledPost, which a Deal doesn't have).
 *
 * Defaults to "simulate" mode (build + return the plan without calling the
 * Google Ads API beyond what planning needs). The operator flips a live
 * toggle to actually dispatch — mirroring deal-meta-distribution-types.ts.
 */

import type { GoogleTargetingPackage } from "@/lib/campaigns/distribution/platforms/google-ads/targeting";
import type { GoogleDisplayTargetingVerification } from "@/lib/campaigns/distribution/platforms/google-ads/campaign";

export type DealGoogleAdsDistributionMode = "simulate" | "live";

export type DealGoogleAdsDistributionStatus = "planned" | "dispatched" | "error";

/** Result of adapting the deal's targetingDemographic into Google Ads targeting. */
export interface DealGoogleAdsDistributionTargetingPreview {
  targeting: GoogleTargetingPackage;
  warnings: string[];
}

/** A built (but not necessarily dispatched) distribution plan for a deal. */
export interface DealGoogleAdsDistributionPlan {
  dealId: string;
  finalUrl: string;
  businessName: string;
  headline: string;
  longHeadline: string;
  description: string;
  landscapeImageUrl: string;
  squareImageUrl: string;
  targeting: DealGoogleAdsDistributionTargetingPreview;
  campaignName: string;
}

/** Persisted record of a distribution attempt for a Google Ads synthesis. */
export interface DealGoogleAdsDistribution {
  /** Cache key. Equals the source Google Ads synthesis id. */
  id: string;
  dealId: string;
  sourceGoogleAdsSynthesisId: string;
  generatedAtIso: string;
  mode: DealGoogleAdsDistributionMode;
  status: DealGoogleAdsDistributionStatus;
  plan: DealGoogleAdsDistributionPlan;
  /** Populated once a live dispatch creates these Google Ads objects. */
  campaignId?: string;
  adGroupId?: string;
  adId?: string;
  reviewUrl?: string;
  verification?: GoogleDisplayTargetingVerification;
  notes: string[];
  error?: string;
}

export interface DealGoogleAdsDistributionCache {
  version: 1;
  generatedAtIso: string;
  distributions: DealGoogleAdsDistribution[];
}
