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

export interface DealAngleSource {
  title: string;
  url: string;
  usedFor: string;
}

export interface DealAngleResearch {
  dealCandidateId: string;
  generatedAtIso: string;
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
}
