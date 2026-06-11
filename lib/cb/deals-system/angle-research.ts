import type {
  DealAngleResearch,
  DealResearchCruiseCandidate,
  RetailDiscoveryBrief,
} from "./research-types";

function unique(values: string[]): string[] {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))
  );
}

function destinationHooks(candidate: DealResearchCruiseCandidate): string[] {
  const ports = candidate.portsOfCall.length > 0 ? candidate.portsOfCall : [candidate.destination];
  return unique([
    `Sail to ${candidate.destination} — a destination worth the trip.`,
    ...ports.slice(0, 5).map((port) => `${port} is on the itinerary.`),
  ]);
}

function itineraryPacing(candidate: DealResearchCruiseCandidate): string[] {
  const notes: string[] = [];
  if (candidate.nights) {
    notes.push(`${candidate.nights} nights — enough time to settle in and explore without overstaying.`);
  }
  if (candidate.departurePort) {
    notes.push(`Departs from ${candidate.departurePort}.`);
  }
  if (candidate.portsOfCall.length >= 3) {
    notes.push(`Calls at ${candidate.portsOfCall.slice(0, 4).join(", ")}.`);
  }
  return notes;
}

export function generateDealAngleResearch(input: {
  candidate: DealResearchCruiseCandidate;
  retailBrief?: RetailDiscoveryBrief;
  generatedAtIso?: string;
}): DealAngleResearch {
  const { candidate, retailBrief } = input;
  const audienceLabel = retailBrief?.audience.label ?? "travelers who want a specific, well-matched cruise experience";
  const angleTitle =
    retailBrief?.retailAngleTitle ??
    `A curated ${candidate.destination} cruise on ${candidate.shipName ?? candidate.cruiseLine ?? "a matched ship"}`;
  const shipName = candidate.shipName ?? "the ship";
  const line = candidate.cruiseLine ?? "the cruise line";
  const shipFeatures = candidate.shipFeatures ?? [];
  const amenities = candidate.amenities ?? [];
  const briefFeatures = retailBrief?.cruiseFit.idealShipFeatures ?? [];

  return {
    dealCandidateId: candidate.id,
    generatedAtIso: input.generatedAtIso ?? new Date().toISOString(),
    retailDiscoveryBriefId: retailBrief?.id,
    shipAppeal: unique([
      `Sail on ${shipName} — ${line}'s ship for this itinerary.`,
      ...shipFeatures.map((feature) => `${feature}.`),
      ...briefFeatures.map((feature) => `${feature}.`),
    ]),
    amenityHighlights: unique([
      ...amenities.map((amenity) => `${amenity}.`),
      ...briefFeatures.map((feature) => `${feature}.`),
    ]),
    destinationHooks: destinationHooks(candidate),
    itineraryPacingNotes: itineraryPacing(candidate),
    nicheAudienceAngles: unique([
      ...(retailBrief ? [retailBrief.retailPositioning.primaryHook] : []),
      ...(retailBrief?.audience.emotionalDrivers ?? []),
    ]),
    trendMatches: unique([
      ...(retailBrief?.targetingSeeds.trendKeywords ?? []),
      "experience-first travel",
      "specific-interest travel",
    ]),
    competitorBlindSpots: unique([
      "Most cruise listings lead with price; this one leads with the reason to go.",
      ...(retailBrief ? [`This angle is specific to ${audienceLabel.toLowerCase()} — not how most agencies package it.`] : []),
    ]),
    recommendedPrimaryAngle: {
      title: angleTitle,
      rationale: retailBrief
        ? `A sailing selected around ${audienceLabel.toLowerCase()} — not a generic cruise sale.`
        : `${candidate.nights ? `${candidate.nights} nights to ` : ""}${candidate.destination} on ${shipName}.`,
      publicCopyHook: retailBrief?.retailPositioning.primaryHook ?? `A curated ${candidate.destination} sailing with a clearer reason to book than price alone.`,
      whyThisFeelsExclusive:
        retailBrief
          ? `This is a sailing chosen for ${audienceLabel.toLowerCase()}, not a broad promotion.`
          : `Leisure Life picks this sailing for a specific traveler, not a general audience.`,
    },
    rejectedAngles: [
      {
        title: "Generic cruise sale",
        reason: "Price and perks are supporting details, not the main reason to promote the trip.",
      },
      {
        title: "Organized cohort trip",
        reason: "This retail Deal must not imply minimum cabins, interest collection, or planned onboard programming.",
      },
    ],
    factualGuardrails: [
      "Verify all ship amenities before public copy.",
      "Verify that sailing date and itinerary support any seasonal or destination-specific claims.",
      "Do not imply a group, instructor, workshop, or onboard event unless separately created.",
      "Do not invent pricing, onboard credit, cabin availability, or promo eligibility.",
    ],
    sources: [
      {
        title: retailBrief ? `Retail discovery brief: ${retailBrief.retailAngleTitle}` : "Cruise candidate facts",
        url: "internal://deals-system/research",
        usedFor: "Niche angle and trip-quality research scaffold.",
      },
    ],
  };
}
