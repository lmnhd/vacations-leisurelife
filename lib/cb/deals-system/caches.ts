/**
 * Local development cache file locations and empty-payload factories.
 *
 * These caches are filled by later phases. Phase 1 only needs the repo to be
 * able to load and validate empty/sample payloads, and for no UI to depend on
 * them yet.
 */

import path from "path";

import type { CbPromoIntelligenceCache } from "./promo-intelligence-types";
import type { CuratedOdysseusDealsCache } from "./curated-deal-types";
import type { DealDiscoveryIdeasCache } from "./deal-discovery-types";
import type { DealTripManifestsCache } from "./deal-trip-manifest-types";
import type { DealUnifiedManifestsCache } from "./deal-unified-manifest-types";
import type { DealAdCopyCache } from "./deal-ad-copy-types";
import type { DealFunnelSynthesisCache } from "./deal-page-design-types";
import type { DealMetaAdSynthesisCache } from "./deal-meta-ad-synthesis-types";
import type { DealMetaDistributionCache } from "./deal-meta-distribution-types";
import type { LinkBrokerCache } from "./link-broker-types";
import type { AgentCallbackRequestsCache } from "./callback-request-types";

const DATA_DIR = path.join(process.cwd(), ".github", "data");

export const DEALS_CACHE_PATHS = {
  promoIntelligence: path.join(DATA_DIR, "cb-promo-intelligence-cache.json"),
  curatedDeals: path.join(DATA_DIR, "odysseus-curated-deals-cache.json"),
  linkBroker: path.join(DATA_DIR, "cb-link-broker-cache.json"),
  callbackRequests: path.join(DATA_DIR, "deal-callback-requests-cache.json"),
  dealDiscoveryIdeas: path.join(DATA_DIR, "deal-discovery-ideas-cache.json"),
  dealTripManifests: path.join(DATA_DIR, "deal-trip-manifests-cache.json"),
  dealUnifiedManifests: path.join(DATA_DIR, "deal-unified-manifests-cache.json"),
  dealAdCopy: path.join(DATA_DIR, "deal-ad-copy-cache.json"),
  dealFunnelSyntheses: path.join(DATA_DIR, "deal-funnel-syntheses-cache.json"),
  dealMetaAdSyntheses: path.join(DATA_DIR, "deal-meta-ad-syntheses-cache.json"),
  dealMetaDistributions: path.join(DATA_DIR, "deal-meta-distributions-cache.json"),
} as const;

export function emptyPromoIntelligenceCache(
  generatedAtIso: string = new Date().toISOString()
): CbPromoIntelligenceCache {
  return {
    version: 1,
    generatedAtIso,
    sourceUrl: "https://www.cbagenttools.com/marketing/todaysview/",
    records: [],
    diagnostics: {
      promotionLinksFound: 0,
      detailPagesScraped: 0,
      extractionSucceeded: 0,
      extractionNeedsReview: 0,
      supportingFilesFound: 0,
      errors: [],
    },
  };
}

export function emptyCuratedDealsCache(
  generatedAtIso: string = new Date().toISOString()
): CuratedOdysseusDealsCache {
  return {
    version: 1,
    generatedAtIso,
    briefs: [],
    deals: [],
  };
}

export function emptyLinkBrokerCache(
  generatedAtIso: string = new Date().toISOString()
): LinkBrokerCache {
  return {
    version: 1,
    generatedAtIso,
    records: [],
  };
}

export function emptyCallbackRequestsCache(
  generatedAtIso: string = new Date().toISOString()
): AgentCallbackRequestsCache {
  return {
    version: 1,
    generatedAtIso,
    requests: [],
  };
}

export function emptyDealDiscoveryIdeasCache(
  generatedAtIso: string = new Date().toISOString()
): DealDiscoveryIdeasCache {
  return {
    version: 1,
    generatedAtIso,
    ideas: [],
  };
}

export function emptyDealTripManifestsCache(
  generatedAtIso: string = new Date().toISOString()
): DealTripManifestsCache {
  return {
    version: 1,
    generatedAtIso,
    manifests: [],
  };
}

export function emptyDealUnifiedManifestsCache(
  generatedAtIso: string = new Date().toISOString()
): DealUnifiedManifestsCache {
  return {
    version: 1,
    generatedAtIso,
    manifests: [],
  };
}

export function emptyDealAdCopyCache(
  generatedAtIso: string = new Date().toISOString()
): DealAdCopyCache {
  return {
    version: 1,
    generatedAtIso,
    adCopies: [],
  };
}

export function emptyDealFunnelSynthesisCache(
  generatedAtIso: string = new Date().toISOString()
): DealFunnelSynthesisCache {
  return {
    version: 1,
    generatedAtIso,
    syntheses: [],
  };
}

export function emptyDealMetaAdSynthesisCache(
  generatedAtIso: string = new Date().toISOString()
): DealMetaAdSynthesisCache {
  return {
    version: 1,
    generatedAtIso,
    syntheses: [],
  };
}

export function emptyDealMetaDistributionCache(
  generatedAtIso: string = new Date().toISOString()
): DealMetaDistributionCache {
  return {
    version: 1,
    generatedAtIso,
    distributions: [],
  };
}
