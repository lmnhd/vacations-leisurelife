/**
 * Deals System data contracts (Phase 1).
 *
 * Barrel export for the schemas that later phases fill. See
 * PHASE_0_BASELINE_GUARDRAILS.md for locked vocabulary and safety rules and
 * PHASED_IMPLEMENTATION_PLAN.md for the build order.
 */

export * from "./link-broker-types";
export * from "./promo-intelligence-types";
export * from "./research-types";
export * from "./campaign-types";
export * from "./curated-deal-types";
export * from "./deal-discovery-types";
export * from "./deal-trip-manifest-types";
export * from "./deal-unified-manifest-types";
export * from "./deal-ad-copy-types";
export * from "./callback-request-types";
export * from "./caches";
export * from "./validate";
export * from "./retail-discovery-adapter";
export * from "./angle-research";
export * from "./targeting-demographic";
export * from "./campaign-generators";
export * from "./ai-generators";
export * from "./curated-deal-assembly";
export * from "./curated-deal-cache";
export * from "./public-deal-projection";
export * from "./public-deals";
export * from "./deal-link-email";
export * from "./discovery-research-source";
export * from "./deal-discovery-cache";
export * from "./deal-discovery-generator";
export * from "./deep-cruise-search";
export * from "./niche-reformer";
export * from "./angle-inventory-seed";
export * from "./promo-prefilter";
export * from "./deal-trip-manifest-cache";
export * from "./deal-trip-manifest-generator";
export * from "./deal-ids";
export * from "./deal-pricing-hydration";
export * from "./deal-unified-manifest-cache";
export * from "./deal-ad-copy-cache";
export * from "./deal-copywriter-generator";
export * from "./deal-package-resolver";
export * from "./deal-manifest-assembly";
export * from "./deal-page-facts";
export * from "./deal-page-design-types";
export * from "./deal-page-design-generator";
export * from "./deal-funnel-synthesis-cache";
export * from "./deal-meta-ad-style-presets";
export * from "./deal-meta-ad-style-selector";
export * from "./deal-meta-ad-prompt";
export * from "./deal-meta-ad-synthesis-types";
export * from "./deal-meta-ad-synthesis-cache";
export * from "./deal-meta-ad-synthesis-generator";
export * from "./deal-meta-distribution-types";
export * from "./deal-meta-distribution-cache";
export * from "./deal-meta-distribution-generator";
export * from "./deal-google-ads-synthesis-types";
export * from "./deal-google-ads-synthesis-cache";
export * from "./deal-google-ads-synthesis-generator";
export * from "./deal-google-ads-distribution-types";
export * from "./deal-google-ads-distribution-cache";
export * from "./deal-google-ads-distribution-generator";
export * from "./deal-image-search";
export * from "./deal-community-search";
export * from "./deals-dynamo-store";
