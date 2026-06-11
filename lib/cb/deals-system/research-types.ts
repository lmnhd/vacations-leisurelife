/**
 * Deal Angle Research and Targeting-Demographic data contracts.
 *
 * A cruise cannot become a promoted Deal on promo/perk data alone. Each serious
 * candidate gets trip-quality research (DealAngleResearch) and, before ad
 * packaging, a package-specific Targeting-Demographic resource.
 *
 * Mirrors CB_AGENT_TOOLS_PROMO_INTELLIGENCE_PLAN.md (Step 6, Targeting section).
 * Generation lands in Phase 7/8; these are the Phase 1 schemas.
 */

import type { DealAiGenerationTrace } from "./campaign-types";

export interface DealAngleSource {
  title: string;
  url: string;
  usedFor: string;
}

export interface GroupDiscoveryRetailSource {
  id: string;
  name: string;
  researchRationale?: string;
  audienceSignals: string[];
  cruiseNativeMoments: string[];
  targetDestination?: string;
  targetDates?: string;
  shipTarget?: string;
  aestheticHooks?: string[];
  targetableKeywords?: string[];
}

export interface RetailDiscoveryBrief {
  id: string;
  source: "group_discovery_retail_adapter";
  sourceResearchId?: string;
  retailAngleTitle: string;
  audience: {
    label: string;
    communitySignals: string[];
    emotionalDrivers: string[];
    spendSignals: string[];
  };
  cruiseFit: {
    idealDestinations: string[];
    idealShipFeatures: string[];
    idealTripLength?: string;
    idealSeasonality?: string;
    preferredDeparturePorts?: string[];
  };
  odysseusSearchHints: {
    cruiseLines?: string[];
    destinations?: string[];
    dateWindows?: string[];
    minNights?: number;
    maxNights?: number;
  };
  retailPositioning: {
    primaryHook: string;
    whyThisIsNotAGroup: string;
    quickSaleCTA: string;
    visualDirection: string[];
  };
  targetingSeeds: {
    nicheKeywords: string[];
    trendKeywords: string[];
    negativeKeywords: string[];
    metaInterestSeeds: string[];
    googleSearchThemes: string[];
  };
  risks: string[];
}

export interface DealResearchCruiseCandidate {
  id: string;
  cruiseLine?: string;
  shipName?: string;
  itineraryName: string;
  destination: string;
  nights?: number;
  sailDateIso?: string;
  departurePort?: string;
  portsOfCall: string[];
  shipFeatures?: string[];
  amenities?: string[];
}

export interface DealAngleResearch {
  dealCandidateId: string;
  generatedAtIso: string;
  retailDiscoveryBriefId?: string;
  shipAppeal: string[];
  amenityHighlights: string[];
  destinationHooks: string[];
  itineraryPacingNotes: string[];
  nicheAudienceAngles: string[];
  trendMatches: string[];
  competitorBlindSpots: string[];
  recommendedPrimaryAngle: {
    title: string;
    rationale: string;
    publicCopyHook: string;
    whyThisFeelsExclusive: string;
  };
  rejectedAngles: Array<{
    title: string;
    reason: string;
  }>;
  factualGuardrails: string[];
  sources: DealAngleSource[];
  /** "gpt" when AI-generated. */
  generator?: "gpt";
  /** AI provenance when generator is "gpt". */
  aiTrace?: DealAiGenerationTrace;
}

export interface DealTargetingDemographic {
  dealId: string;
  packageId: string;
  generatedAtIso: string;
  primaryAudience: {
    label: string;
    description: string;
    whyThisCruiseFits: string;
    emotionalDrivers: string[];
    likelyObjections: string[];
  };
  secondaryAudiences: Array<{
    label: string;
    description: string;
    whyThisCruiseFits: string;
    targetingNotes: string[];
  }>;
  nicheKeywords: {
    lifestyle: string[];
    destination: string[];
    shipExperience: string[];
    amenities: string[];
    eventsAndSeasonality: string[];
    trendSignals: string[];
    exclusionKeywords: string[];
  };
  channelTargeting: {
    meta: {
      interestClusters: string[];
      behaviorSignals: string[];
      creativeHooks: string[];
      audienceWarnings: string[];
    };
    google: {
      searchThemes: string[];
      keywordIdeas: string[];
      negativeKeywords: string[];
      landingPageIntentNotes: string[];
    };
    tiktok: {
      creatorAngles: string[];
      trendHooks: string[];
      shortVideoConcepts: string[];
    };
    email: {
      segmentIdeas: string[];
      subjectLineAngles: string[];
      personalizationNotes: string[];
    };
  };
  researchSummary: {
    primaryInsight: string;
    whyNow: string;
    competitorBlindSpot: string;
    positioningStatement: string;
  };
  sources: DealAngleSource[];
  confidence: {
    score: number;
    strengths: string[];
    risks: string[];
    needsHumanReview: string[];
  };
  /** "gpt" when AI-generated. */
  generator?: "gpt";
  /** AI provenance when generator is "gpt". */
  aiTrace?: DealAiGenerationTrace;
}
