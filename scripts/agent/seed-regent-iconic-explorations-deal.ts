import {
  loadDealDiscoveryIdeasCache,
  saveDealDiscoveryIdeasCache,
  upsertDealDiscoveryIdea,
  upsertDealTripManifestRecord,
  upsertPromoRecordEntry,
  type CbPromoIntelligenceRecord,
  type DealDiscoveryIdea,
  type DealTripManifest,
  type PromoApplicabilityResult,
} from "../../lib/cb/deals-system";

const generatedAtIso = new Date().toISOString();

const promoId = "rssc-iconic-explorations-free-land-2026-2027";
const angleId = "angle-regent-buenos-aires-antarctic-overture";
const manifestId = "manifest-regent-buenos-aires-antarctic-overture-1523892";

const promoRecord: CbPromoIntelligenceRecord = {
  id: promoId,
  source: "cb_agent_tools_todays_view",
  sourceUrl: "https://www.cbagenttools.com/marketing/todaysview/",
  detailUrl: "https://www.rssc.com/Iconic-Explorations",
  capturedAtIso: generatedAtIso,
  title: "Regent Seven Seas Iconic Explorations - Free Pre- or Post-Cruise Land Program",
  vendor: "Regent Seven Seas",
  bookingWindow: {
    startsOn: "2026-06-01",
    endsOn: "2026-08-31",
    rawText: "New reservations made June 1, 2026 through August 31, 2026.",
  },
  sailingWindow: {
    startsOn: "2026-11-22",
    endsOn: "2027-09-04",
    rawText: "Select 2026-2027 Exotic Voyages listed in the Iconic Explorations promotion.",
  },
  promotionDetailsRaw:
    "Free pre- or post-cruise land program on select Regent Seven Seas 2026-2027 Exotic Voyages. Guests 1 and 2 receive either a free pre-cruise or post-cruise land program on select voyages in all suite categories. Capacity controlled. Mention promo code ICONIC.",
  agentInstructionsRaw:
    "Offer applies only to new reservations made June 1, 2026 through August 31, 2026. Valid only for residents of the US and Canada who book directly through Regent Seven Seas Cruises or through travel advisors located only in the US and Canada. Applicable voyages and land programs may change or be removed without notice. Not all promotions are combinable. Mention promo code ICONIC.",
  keyFeaturesRaw:
    "Free pre- or post-cruise land program on select exotic voyages; more than 15 curated programs including Buenos Aires, Rio, Tokyo, Singapore, Sydney, Bali, Bangkok, Fiji, and more.",
  applicableSailingsRaw:
    "Includes Seven Seas Mariner Feb 2, 2027 18-night roundtrip Buenos Aires with Enchanting Argentina and Iguazu / Flavors and Rhythms of Buenos Aires land program options.",
  applicableProductsRaw: "Select Regent Seven Seas 2026-2027 Exotic Voyages in all suite categories.",
  applicableMarketsRaw: "Residents of the US and Canada.",
  supportingFiles: [
    {
      label: "Iconic Explorations promo page",
      url: "https://www.rssc.com/Iconic-Explorations",
      fileName: "Iconic Explorations",
    },
  ],
  extracted: {
    offerTypes: ["suite_perk", "other"],
    percentDiscounts: [],
    dollarSavings: [],
    onboardCredits: [],
    freeGuestOffers: [],
    combinability: {
      rawRules: [
        "Capacity controlled.",
        "Not all promotions are combinable.",
        "Applicable voyages may be removed at any time without notice.",
      ],
    },
    exclusions: [
      "Guests 3 or more are not eligible for the free land program.",
      "Valid only for residents of the US and Canada.",
      "New reservations only.",
      "Select voyages only.",
    ],
    applicableProducts: ["Select 2026-2027 Regent Seven Seas Exotic Voyages", "All suite categories"],
    applicableMarkets: ["US", "CA"],
  },
  marketingUse: {
    publicClaimsAllowed: [
      "Free pre- or post-cruise land program available on select Regent Seven Seas exotic voyages.",
      "Guests 1 and 2 may receive one included land program on eligible sailings.",
      "Book by August 31, 2026 for this Iconic Explorations offer.",
    ],
    publicClaimsNeedsQualifier: [
      "Offer is capacity controlled and applies only to select voyages.",
      "Eligibility, combinability, and availability must be confirmed at booking.",
      "US and Canada residency restrictions apply.",
    ],
    agentOnlyNotes: [
      "Mention promo code ICONIC at time of booking.",
      "Confirm exact land program choice and eligibility with Regent before quoting.",
    ],
    suggestedAngles: [
      "Make Buenos Aires the opening act, not just the airport.",
      "Antarctic-edge luxury with a cultural land chapter included.",
      "A voyage that starts with tango, wine, and Iguazu-scale drama before Patagonia and the Falklands.",
    ],
    cautionFlags: [
      "Do not imply all sailings qualify.",
      "Do not guarantee land program availability without live confirmation.",
      "Do not market to non-US/non-Canada residents.",
    ],
    bestMatchedDealBriefs: [angleId],
    visitorFriendlySummary:
      "On select Regent Seven Seas exotic voyages, eligible guests 1 and 2 may receive a free pre- or post-cruise land program when booking by August 31, 2026, subject to availability and terms.",
  },
  diagnostics: {
    status: "needs_review",
    notes: [
      "Seeded by agent from operator-provided Regent Iconic Explorations promotion text.",
      "Promo should be reviewed against the current Regent terms before public launch.",
    ],
    warnings: [
      "Promotion is capacity controlled.",
      "Land program availability can change.",
      "Rate-level eligibility has not been live-confirmed.",
    ],
  },
};

const appliedPromo: PromoApplicabilityResult = {
  promoRecordId: promoId,
  status: "likely_applicable",
  matchedOn: [
    "Regent Seven Seas",
    "Seven Seas Mariner",
    "2027-02-02",
    "18-night roundtrip Buenos Aires appears in the operator-provided promo list.",
  ],
  assumptions: [
    "Guest market is US or Canada.",
    "Booking occurs before August 31, 2026.",
    "Land program inventory remains available.",
  ],
  warnings: [
    "Confirm promo code ICONIC and land program availability before quoting publicly.",
    "Do not present this as guaranteed until Regent confirms eligibility for the booking.",
  ],
};

const angle: DealDiscoveryIdea = {
  id: angleId,
  generatedAtIso,
  generator: "gpt",
  sourceResearchCachedAt: "agent-promo-intake",
  isolatedNiche:
    "Affluent US and Canada travelers who want Antarctica-adjacent scenery without sacrificing ultra-luxury comfort, and who respond to cultural immersion when the land portion feels as curated as the ship.",
  researchRationale:
    "The selected sailing turns Buenos Aires from a transit city into the emotional gateway for Patagonia, Antarctic scenic cruising, the Falklands, Uruguay, and the South Atlantic. The free land program gives the campaign a tangible reason to act before the booking deadline.",
  successLogic:
    "This audience is already considering high-value bucket-list travel. The campaign works because it reframes the offer as a richer journey, not a discount: Buenos Aires culture plus Regent-level South Atlantic exploration on one resolved package.",
  audienceSignals: [
    "Luxury cruise repeaters considering expedition-like scenery without expedition-ship tradeoffs.",
    "Couples planning a milestone winter escape from North America.",
    "Travelers drawn to tango, wine, Patagonia, Antarctic waters, and the Falklands.",
    "Regent prospects who value included luxury and curated land experiences.",
  ],
  sailingAngleProfile: {
    sailingAngleTitle: "Buenos Aires as the Overture to the Edge of Antarctica",
    theCorePitch:
      "Begin with Argentina's cultural pulse, then sail Regent's all-suite luxury toward Patagonia, Antarctic scenic cruising, the Falklands, Uruguay, and back to Buenos Aires.",
    visualAnchor:
      "Tango-lit Buenos Aires evenings, Iguazu-scale mist and rainforest drama, white Antarctic water, penguin-country shorelines, polished Regent suite luxury, and South Atlantic horizons.",
    targetAudienceDescriptor:
      "Affluent couples and luxury travelers in the US and Canada who want a grand South America voyage with cultural depth before or after the cruise.",
    relevantKeywords: [
      "Regent Seven Seas South America",
      "Buenos Aires luxury cruise",
      "Antarctica scenic cruising",
      "Patagonia cruise",
      "free land program",
      "ultra luxury cruise",
      "Falkland Islands cruise",
      "Iguazu Falls trip",
    ],
    destinationAndTimeOfYearHints:
      "February 2027 South America sailing from Buenos Aires during the Southern Hemisphere summer.",
    onboardAssetRequirements:
      "Use Seven Seas Mariner luxury suite, dining, lounge, and deck assets; pair with Buenos Aires, Patagonia, Falklands, Antarctic scenic cruising, Montevideo, and Punta del Este imagery.",
  },
  groundedCandidate: {
    resolvedAtIso: generatedAtIso,
    packageId: "1523892",
    cruiseName: "Colossal Coastlines",
    cruiseLine: "Regent Seven Seas",
    sailDateIso: "2027-02-02",
    nights: 18,
    departurePortCode: "BUE",
    portsOfCall:
      "Buenos Aires | Puerto Madryn | Punta Arenas | Ushuaia | Cruising the Drake Passage | Half Moon Island | Admiralty Bay | Elephant Island | Stanley | Punta del Este | Montevideo | Buenos Aires",
    confidence: 0.85,
    reasons: [
      "Exact sail date matched Odysseus lookup.",
      "18-night duration matched promo flyer.",
      "Cruise line matched Regent Seven Seas.",
      "Package page confirmed Seven Seas Mariner ship identity.",
    ],
  },
};

const manifest: DealTripManifest = {
  id: manifestId,
  generatedAtIso,
  generator: "gpt",
  expiresOnIso: "2026-08-31",
  sourceAngleId: angleId,
  isolatedNiche: angle.isolatedNiche,
  sailingAngleTitle: angle.sailingAngleProfile.sailingAngleTitle,
  assembleDraft: {
    suggestedDealId: "regent-buenos-aires-antarctic-overture-1523892",
    suggestedBriefId: "brief-regent-buenos-aires-antarctic-overture",
    cruiseLine: "Regent Seven Seas",
    itineraryName: "Colossal Coastlines",
    destination: "South America and Antarctic scenic cruising",
    nights: 18,
    sailWindow: {
      earliestIso: "2027-02-02",
      latestIso: "2027-02-02",
      rationale: "Exact sail date selected from the Regent Iconic Explorations promo list.",
    },
    departurePortHint: "Buenos Aires",
    portsOfCall: [
      "Buenos Aires",
      "Puerto Madryn",
      "Punta Arenas",
      "Ushuaia",
      "Cruising the Drake Passage",
      "Half Moon Island",
      "Admiralty Bay",
      "Elephant Island",
      "Stanley",
      "Punta del Este",
      "Montevideo",
      "Buenos Aires",
    ],
  },
  appliedPromos: [appliedPromo],
  promoStrategy:
    "Lead with the free pre- or post-cruise land program as the reason this ultra-luxury voyage feels complete before guests even step aboard. Use qualified language: eligible guests may receive one land program on this select sailing when booked by August 31, 2026, subject to availability and terms.",
  manifestReasoning:
    "This sailing has the strongest campaign shape because the ship, date, duration, route, price, and day-by-day itinerary were resolved from Odysseus, and the Regent promo adds an emotionally legible Buenos Aires land chapter to an already bucket-list South Atlantic route.",
  lookupQuery: {
    line: "Regent Seven Seas",
    ship: "Seven Seas Mariner",
    destination: "South America and Antarctic scenic cruising",
    date: "2027-02-02",
    nights: 18,
    port: "BUE",
    windowDays: 2,
  },
  targetingSeeds: {
    inferredMarket: "US",
    geoFocus: [
      "Buenos Aires",
      "Patagonia",
      "Ushuaia",
      "Antarctic scenic cruising",
      "Falkland Islands",
      "Uruguay",
    ],
    personaSignals: [
      "Affluent couples",
      "Luxury cruise repeat guests",
      "Bucket-list South America travelers",
      "Travelers seeking cultural immersion before or after a cruise",
    ],
    metaInterestSeeds: [
      "Regent Seven Seas Cruises",
      "Luxury travel",
      "Buenos Aires",
      "Patagonia",
      "Antarctica travel",
      "Iguazu Falls",
      "Falkland Islands",
      "Tango",
    ],
    metaBehaviorSignals: [
      "International luxury travel planners",
      "Cruise vacation shoppers",
      "High-value trip researchers",
      "Responds to limited-time travel offers",
    ],
    excludedAudienceSignals: [
      "Budget cruise shoppers",
      "Families needing third-guest promo eligibility",
      "Travelers outside US and Canada for this offer",
    ],
  },
  resolvedPackage: {
    resolvedAtIso: generatedAtIso,
    source: "operator_package_lookup",
    packageId: "1523892",
    cruiseName: "Colossal Coastlines",
    cruiseLine: "Regent Seven Seas",
    shipName: "Seven Seas Mariner",
    sailDateIso: "2027-02-02",
    nights: 18,
    departurePortCode: "BUE",
    confidence: 0.85,
    reasons: [
      "Exact sail date",
      "18 nights match",
      "Cruise line matches Regent Seven Seas",
      "Package page confirmed Seven Seas Mariner",
    ],
    siid: process.env.CB_AGENT_SIID || "1049337",
    bookingUrl: `https://bookings.cbagenttools.com/swift/cruise/package/1523892?siid=${process.env.CB_AGENT_SIID || "1049337"}&lang=1`,
    bookingLinkClass: "constructed_package_url",
    linkHealth: {
      status: "unknown",
      failureReason: "Constructed link not yet browser-validated.",
    },
    cabinPricing: {
      currencyCode: "USD",
      suite: 15299,
      leadFare: 15299,
    },
    itinerary: {
      durationNights: 18,
      departurePortCode: "BUE",
      arrivalPortCode: "BUE",
      portsOfCall:
        "Buenos Aires | Puerto Madryn | Punta Arenas | Punta Arenas | Ushuaia | Stanley | Punta Del Este | Montevideo | Buenos Aires",
      normalizedPortsOfCall:
        "BUE|8176|PMY|8176|PUQ|USH|8027|HMIA|ADMB|ELIA|8176|PSY|8176|PDP|MVD|BUE",
      mapPath: "BUE_PMY_PUQ_USH_HMIA_ELIA_PSY_PDP_MVD_BUE.jpg",
      dayByDay: [
        { day: 1, portName: "Buenos Aires", portCode: "BUE", atSea: false, departureTime: "18:00:00" },
        { day: 2, portName: "Cruising The Atlantic Ocean", portCode: "8176", atSea: true },
        { day: 3, portName: "Cruising The Atlantic Ocean", portCode: "8176", atSea: true },
        { day: 4, portName: "Puerto Madryn", portCode: "PMY", atSea: false, arrivalTime: "07:00:00", departureTime: "17:00:00" },
        { day: 5, portName: "Cruising The Atlantic Ocean", portCode: "8176", atSea: true },
        { day: 6, portName: "Punta Arenas", portCode: "PUQ", atSea: false, arrivalTime: "16:00:00" },
        { day: 7, portName: "Punta Arenas", portCode: "PUQ", atSea: false, departureTime: "16:00:00" },
        { day: 8, portName: "Ushuaia", portCode: "USH", atSea: false, arrivalTime: "10:30:00", departureTime: "18:30:00" },
        { day: 9, portName: "Cruising The Drake Passage", portCode: "8027", atSea: true },
        { day: 10, portName: "Cruising By Half Moon Islands", portCode: "HMIA", atSea: true, arrivalTime: "13:00:00", departureTime: "16:00:00" },
        { day: 11, portName: "Cruising Admiralty Bay", portCode: "ADMB", atSea: true, arrivalTime: "10:00:00", departureTime: "13:00:00" },
        { day: 12, portName: "Cruising By Elephant Island (Cape Lookout)", portCode: "ELIA", atSea: true, arrivalTime: "10:00:00", departureTime: "15:00:00" },
        { day: 13, portName: "Cruising The Atlantic Ocean", portCode: "8176", atSea: true },
        { day: 14, portName: "Stanley", portCode: "PSY", atSea: false, arrivalTime: "09:00:00", departureTime: "19:00:00" },
        { day: 15, portName: "Cruising The Atlantic Ocean", portCode: "8176", atSea: true },
        { day: 16, portName: "Cruising The Atlantic Ocean", portCode: "8176", atSea: true },
        { day: 17, portName: "Punta Del Este", portCode: "PDP", atSea: false, arrivalTime: "09:00:00", departureTime: "19:00:00" },
        { day: 18, portName: "Montevideo", portCode: "MVD", atSea: false, arrivalTime: "07:00:00", departureTime: "17:00:00" },
        { day: 19, portName: "Buenos Aires", portCode: "BUE", atSea: false, arrivalTime: "06:00:00" },
      ],
    },
    lookupDiagnostics: [
      "Odysseus search returned a confident match.",
      "Captured package-page ship identity for 1523892: Regent Seven Seas: Seven Seas Mariner.",
      "Captured day-by-day itinerary for 1523892.",
    ],
  },
};

async function main(): Promise<void> {
  await upsertPromoRecordEntry(promoRecord);
  saveDealDiscoveryIdeasCache(upsertDealDiscoveryIdea(loadDealDiscoveryIdeasCache(), angle));
  await upsertDealTripManifestRecord(manifest);

  console.log(
    JSON.stringify(
      {
        ok: true,
        promoId,
        angleId,
        manifestId,
        packageId: manifest.resolvedPackage?.packageId,
        nextUrl: `/tests/deals-system/copywriter?manifestId=${encodeURIComponent(manifestId)}`,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
