import type {
  DealAngleResearch,
  DealResearchCruiseCandidate,
  DealTargetingDemographic,
  RetailDiscoveryBrief,
} from "./research-types";

function unique(values: string[]): string[] {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))
  );
}

function compact<T>(values: Array<T | undefined | null | false>): T[] {
  return values.filter(Boolean) as T[];
}

function destinationKeywords(candidate: DealResearchCruiseCandidate, brief?: RetailDiscoveryBrief): string[] {
  return unique([
    candidate.destination,
    candidate.itineraryName,
    candidate.departurePort,
    ...candidate.portsOfCall,
    ...(brief?.cruiseFit.idealDestinations ?? []),
  ].filter((value): value is string => Boolean(value)));
}

function shipExperienceKeywords(candidate: DealResearchCruiseCandidate, brief?: RetailDiscoveryBrief): string[] {
  return unique([
    candidate.shipName,
    candidate.cruiseLine,
    ...candidate.shipFeatures ?? [],
    ...(brief?.cruiseFit.idealShipFeatures ?? []),
  ].filter((value): value is string => Boolean(value)));
}

function eventSeasonalityKeywords(candidate: DealResearchCruiseCandidate, brief?: RetailDiscoveryBrief): string[] {
  return unique(compact([
    candidate.sailDateIso ? `sailing ${candidate.sailDateIso}` : undefined,
    brief?.cruiseFit.idealSeasonality,
    candidate.nights ? `${candidate.nights} night cruise` : undefined,
    `${candidate.destination} seasonality`,
  ]));
}

export function generateDealTargetingDemographic(input: {
  dealId: string;
  packageId: string;
  candidate: DealResearchCruiseCandidate;
  angleResearch: DealAngleResearch;
  retailBrief?: RetailDiscoveryBrief;
  generatedAtIso?: string;
}): DealTargetingDemographic {
  const { candidate, angleResearch, retailBrief } = input;
  const primaryAudienceLabel =
    retailBrief?.audience.label ?? angleResearch.nicheAudienceAngles[0] ?? "specific-interest cruise travelers";
  const lifestyleKeywords = unique([
    ...(retailBrief?.targetingSeeds.nicheKeywords ?? []),
    ...(retailBrief?.audience.communitySignals ?? []),
  ]).slice(0, 18);
  const destinations = destinationKeywords(candidate, retailBrief);
  const shipExperience = shipExperienceKeywords(candidate, retailBrief);
  const amenities = unique([...(candidate.amenities ?? []), ...(candidate.shipFeatures ?? [])]);
  const trendSignals = unique([
    ...(retailBrief?.targetingSeeds.trendKeywords ?? []),
    ...angleResearch.trendMatches,
  ]).slice(0, 18);
  const negativeKeywords = unique([
    ...(retailBrief?.targetingSeeds.negativeKeywords ?? []),
    "free cruise",
    "cruise job",
    "crew job",
    "cargo ship",
  ]);
  const creativeHooks = unique([
    angleResearch.recommendedPrimaryAngle.publicCopyHook,
    ...(retailBrief ? [retailBrief.retailPositioning.primaryHook] : []),
    ...angleResearch.destinationHooks.slice(0, 3),
  ]);

  return {
    dealId: input.dealId,
    packageId: input.packageId,
    generatedAtIso: input.generatedAtIso ?? new Date().toISOString(),
    primaryAudience: {
      label: primaryAudienceLabel,
      description: retailBrief
        ? `${primaryAudienceLabel} who would not necessarily search for cruises, but can understand this sailing as a direct expression of their interest.`
        : `Travelers whose interests match ${candidate.destination}, ${candidate.itineraryName}, and the ship experience.`,
      whyThisCruiseFits: angleResearch.recommendedPrimaryAngle.rationale,
      emotionalDrivers: unique([
        ...(retailBrief?.audience.emotionalDrivers ?? []),
        "a trip that feels chosen for them rather than broadly advertised",
        "a visually specific reason to imagine the cruise",
      ]),
      likelyObjections: unique([
        "They may not think of themselves as cruise shoppers.",
        "They may need confidence that the angle is grounded in the real itinerary, not generic copy.",
        "They may want exact pricing, cabin, and perk confirmation before committing.",
      ]),
    },
    secondaryAudiences: [
      {
        label: `${candidate.destination} experience seekers`,
        description: `Travelers drawn to ${candidate.destination}, the ports, and the seasonal itinerary context.`,
        whyThisCruiseFits: `${candidate.itineraryName} gives them a ready-made way to experience ${candidate.destination}.`,
        targetingNotes: destinations,
      },
      {
        label: "Premium convenience travelers",
        description: "People who value a packaged, low-friction way to experience a destination.",
        whyThisCruiseFits: "The cruise bundles transport, lodging, ship amenities, and multiple destination moments into one booking path.",
        targetingNotes: shipExperience,
      },
    ],
    nicheKeywords: {
      lifestyle: lifestyleKeywords,
      destination: destinations,
      shipExperience,
      amenities,
      eventsAndSeasonality: eventSeasonalityKeywords(candidate, retailBrief),
      trendSignals,
      exclusionKeywords: negativeKeywords,
    },
    channelTargeting: {
      meta: {
        interestClusters: unique([
          ...(retailBrief?.targetingSeeds.metaInterestSeeds ?? []),
          ...lifestyleKeywords.slice(0, 8),
          ...destinations.slice(0, 4),
        ]).slice(0, 18),
        behaviorSignals: unique([
          "engages with destination visuals",
          "saves travel inspiration content",
          "responds to niche lifestyle identity cues",
        ]),
        creativeHooks: creativeHooks.slice(0, 8),
        audienceWarnings: [
          "Avoid broad cruise-interest targeting as the primary audience.",
          "Do not imply organized onboard programming unless separately created.",
        ],
      },
      google: {
        searchThemes: unique([
          ...(retailBrief?.targetingSeeds.googleSearchThemes ?? []),
          ...destinations.map((destination) => `${destination} cruise`),
          ...lifestyleKeywords.slice(0, 6).map((keyword) => `${keyword} travel`),
        ]).slice(0, 20),
        keywordIdeas: unique([
          ...destinations,
          ...lifestyleKeywords,
          candidate.itineraryName,
        ]).slice(0, 24),
        negativeKeywords,
        landingPageIntentNotes: [
          "Landing page should lead with the niche/trend hook before price.",
          "Booking CTA should confirm live pricing and availability in the CB portal.",
        ],
      },
      tiktok: {
        creatorAngles: unique([
          `${primaryAudienceLabel} packing or prep video`,
          `${candidate.destination} visual inspiration`,
          "show the trip as a solution to a niche interest, not a cruise ad",
        ]),
        trendHooks: trendSignals.slice(0, 10),
        shortVideoConcepts: unique([
          `POV: your ${candidate.destination} cruise is actually built around ${primaryAudienceLabel.toLowerCase()}.`,
          ...angleResearch.destinationHooks.slice(0, 3),
        ]),
      },
      email: {
        segmentIdeas: unique([
          primaryAudienceLabel,
          `${candidate.destination} interested travelers`,
          "people who clicked but did not request a booking link",
        ]),
        subjectLineAngles: unique([
          angleResearch.recommendedPrimaryAngle.title,
          `A ${candidate.destination} cruise with a more specific reason to go`,
          ...(retailBrief ? [retailBrief.retailPositioning.quickSaleCTA] : []),
        ]),
        personalizationNotes: [
          "Reference the specific interest angle before mentioning the cruise line.",
          "Use live booking-link freshness and package details in follow-up.",
        ],
      },
    },
    researchSummary: {
      primaryInsight:
        angleResearch.recommendedPrimaryAngle.publicCopyHook,
      whyNow:
        retailBrief?.cruiseFit.idealSeasonality ??
        "The Deal becomes timely when package availability, price, and the destination season line up.",
      competitorBlindSpot:
        angleResearch.competitorBlindSpots[0] ??
        "Most competitors market the sailing generically instead of tying it to a targetable interest.",
      positioningStatement:
        angleResearch.recommendedPrimaryAngle.rationale,
    },
    sources: unique([
      ...angleResearch.sources.map((source) => JSON.stringify(source)),
      JSON.stringify({
        title: retailBrief ? `Retail discovery brief: ${retailBrief.retailAngleTitle}` : "Cruise candidate facts",
        url: "internal://deals-system/targeting",
        usedFor: "Targeting-Demographic generation.",
      }),
    ]).map((source) => JSON.parse(source) as DealTargetingDemographic["sources"][number]),
    confidence: {
      score: retailBrief ? 82 : 68,
      strengths: unique([
        "Audience is more specific than generic cruise shoppers.",
        "Creative hook is tied to the actual package research.",
        "Negative keywords and channel-specific targeting are present.",
      ]),
      risks: unique([
        ...angleResearch.factualGuardrails,
        ...(retailBrief?.risks ?? []),
      ]),
      needsHumanReview: [
        "Confirm ship amenities before public ad copy.",
        "Confirm package link health before launch.",
        "Confirm target audience does not imply a hosted group or event.",
      ],
    },
  };
}

