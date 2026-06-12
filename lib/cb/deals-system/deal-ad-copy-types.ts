/**
 * Deal Ad Copy — the Copywriter agent's output (Deal Workflow Step 3).
 *
 * The copywriter is a strict EXPANSION engine: it takes the unified manifest
 * (creative brief + inventory/promo manifest) and emits direct-response retail ad
 * copy. It replaces the older targeting / sales-pitch / deal-copy steps for this
 * workflow — the ad-platform targeting hooks are embedded in each variant.
 *
 * Multiple variants per run: a primary play on the strongest promo plus aspirational
 * upsell tiers, each tagged with the promo id it leans on.
 */

import type { DealAiGenerationTrace } from "./campaign-types";

/** Ad-platform targeting embedded in each variant (replaces the separate targeting step). */
export interface DealAdTargetingHooks {
  demographicTargeting: string;
  interestKeywords: string[];
}

export interface DealAdVariant {
  /** Promo id this variant leans on, or "none" when no promo is featured. */
  promoApplied: string;
  /** e.g. "Primary retail play" / "Aspirational upsell". */
  variantLabel: string;
  headline: string;
  bodyCopy: string;
  /** Mandatory discretionary disclaimers (select sailings / stateroom / live lookup). */
  pricingDisclaimers: string;
  callToAction: string;
  adPlatformTargetingHooks: DealAdTargetingHooks;
  /** Banned-vocabulary hits flagged for the operator (not auto-fixed). */
  voiceWarnings: string[];
}

export interface DealAdCopy {
  /** Slug; idempotency key in the cache. */
  id: string;
  generatedAtIso: string;
  generator: "gpt";
  sourceUnifiedManifestId: string;
  campaignName: string;
  targetAudienceTag: string;
  /** The promo id the primary variant leans on. */
  primaryPromoApplied: string;
  variants: DealAdVariant[];
  /**
   * Index into `variants` the operator chose as the final/primary ad. Absent =
   * not yet chosen (treated as 0). Downstream assembly promotes this variant to
   * the headline/hero so the published deal page uses the operator's pick.
   */
  selectedVariantIndex?: number;
  aiTrace?: DealAiGenerationTrace;
}

export interface DealAdCopyCache {
  version: 1;
  generatedAtIso: string;
  adCopies: DealAdCopy[];
}
