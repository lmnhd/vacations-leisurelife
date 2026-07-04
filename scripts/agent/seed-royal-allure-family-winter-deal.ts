import {
  evaluateApprovalGates,
  getCuratedDeal,
  loadDealDiscoveryIdeasCache,
  saveDealDiscoveryIdeasCache,
  upsertCuratedDealRecord,
  upsertDealBriefRecord,
  upsertDealDiscoveryIdea,
  upsertDealTripManifestRecord,
  upsertPromoRecordEntry,
  type CbPromoIntelligenceRecord,
  type CuratedDealCruiseFacts,
  type CuratedOdysseusDeal,
  type DealAdStructure,
  type DealAngleResearch,
  type DealCampaignStrategy,
  type DealCopyPackage,
  type DealDiscoveryIdea,
  type DealItineraryDay,
  type DealMediaPlan,
  type DealPitchBrief,
  type DealTargetingDemographic,
  type DealTripManifest,
  type PromoApplicabilityResult,
} from "../../lib/cb/deals-system";

const DEAL_ID = "deal-rcl-allure-perfect-day-family-1576786";
const BRIEF_ID = "brief-rcl-allure-perfect-day-family-early-bird";
const PACKAGE_ID = "1576786";
const SIID = process.env.CB_AGENT_SIID || "1049337";
const GENERATED_AT_ISO = new Date().toISOString();

const BOOKING_URL = `https://bookings.cbagenttools.com/swift/cruise/package/${PACKAGE_ID}?siid=${SIID}&lang=1`;

const dayByDayItinerary: DealItineraryDay[] = [
  { day: 1, portName: "Miami, Florida", portCode: "MIA", atSea: false, departureTime: "16:00:00" },
  { day: 2, portName: "Cruising", portCode: "SEAD", atSea: true },
  { day: 3, portName: "Labadee, Haiti", portCode: "LA1", atSea: false, arrivalTime: "07:00:00", departureTime: "16:00:00" },
  { day: 4, portName: "Falmouth, Jamaica", portCode: "FALM", atSea: false, arrivalTime: "09:30:00", departureTime: "17:00:00" },
  { day: 5, portName: "Cruising", portCode: "SEAD", atSea: true },
  { day: 6, portName: "Perfect Day Cococay, Bahamas", portCode: "COCY", atSea: false, arrivalTime: "07:00:00", departureTime: "17:00:00" },
  { day: 7, portName: "Miami, Florida", portCode: "MIA", atSea: false, arrivalTime: "06:00:00" },
];

const cruiseFacts: CuratedDealCruiseFacts = {
  title: "6 Night Western Caribbean & Perfect Day",
  cruiseLine: "Royal Caribbean",
  shipName: "Allure of the Seas",
  itineraryName: "6 Night Western Caribbean & Perfect Day",
  nights: 6,
  sailDateIso: "2027-02-08",
  departurePort: "Miami",
  portsOfCall: [
    "Miami, Florida",
    "Labadee, Haiti",
    "Falmouth, Jamaica",
    "Perfect Day Cococay, Bahamas",
    "Miami, Florida",
  ],
  dayByDayItinerary,
  cabinPrices: {
    inside: 645.5,
    outside: 740.5,
    balcony: 722.5,
    suite: 1849,
    currencyCode: "USD",
  },
  promoSignals: [
    "Royal Caribbean family winter escape",
    "Perfect Day Cococay",
    "balcony value close to inside fare",
    "eligible bonus dining candidate",
    "early booking onboard credit candidate",
  ],
};

const campaignStrategy: DealCampaignStrategy = {
  campaignAngle:
    "Book next winter's big family escape early: Allure of the Seas, Perfect Day Cococay, and a balcony-value sweet spot with eligible Royal Caribbean bonus offers.",
  targetAudience:
    "US families, multigenerational travelers, and school-break planners looking for a February Caribbean cruise with a major resort-style ship, private-destination beach days, and a timely reason to book in July.",
  visualAngle:
    "Bright family Caribbean energy: Allure of the Seas scale, pool-deck action, Perfect Day waterpark and beach imagery, warm February escape cues, and balcony upgrade value.",
  targetingKeywords: [
    "family cruises",
    "Royal Caribbean",
    "Allure of the Seas",
    "Perfect Day Cococay",
    "winter Caribbean cruise",
    "February family vacation",
    "kids sail free",
    "cruise dining package",
    "multigenerational vacation",
    "Caribbean balcony cruise",
  ],
  savedAtIso: GENERATED_AT_ISO,
};

function buildAngleResearch(): DealAngleResearch {
  return {
    dealCandidateId: DEAL_ID,
    generatedAtIso: GENERATED_AT_ISO,
    shipAppeal: [
      "Allure of the Seas is the strongest family-scale ship found in the verified Royal Caribbean winter candidate set.",
      "The itinerary combines a major ship experience with Labadee, Jamaica, and Perfect Day Cococay.",
      "Current Odysseus pricing shows a balcony lead close enough to inside pricing to support an upgrade-value angle.",
    ],
    amenityHighlights: [
      "Royal Caribbean resort-style ship experience",
      "Perfect Day Cococay private-destination day",
      "Family dining and entertainment variety",
      "Balcony cabin value signal",
    ],
    destinationHooks: [
      "Miami roundtrip winter escape",
      "Labadee beach day",
      "Falmouth Jamaica culture and shore excursion day",
      "Perfect Day Cococay high-energy family finale",
    ],
    itineraryPacingNotes: [
      "Six nights is long enough to feel like a real winter vacation without requiring a full week-plus commitment.",
      "Two sea days give families room to use the ship rather than treating it only as transportation.",
      "The beach and private-destination sequence gives the landing page natural visual variety.",
    ],
    nicheAudienceAngles: [
      "Families planning February winter travel before fares and bonus windows move.",
      "Parents comparing cruise value against land resorts.",
      "Multigenerational travelers who need a ship with enough options for different ages.",
    ],
    trendMatches: [
      "Early booking family travel",
      "Private island cruise demand",
      "Winter sun vacation planning",
      "Upgrade-value cruise shopping",
    ],
    competitorBlindSpots: [
      "Most broad cruise ads lead with percentage discounts instead of a concrete ship, date, route, and family reason to act.",
      "The balcony sweet spot can make this feel more specific than generic Royal Caribbean sale creative.",
    ],
    recommendedPrimaryAngle: {
      title: "February Family Escape",
      rationale:
        "This is the cleanest synthesis of real inventory, family appeal, winter timing, and promo urgency.",
      publicCopyHook:
        "Book next winter's big family escape early and verify eligible Royal Caribbean bonus offers before the July window closes.",
      whyThisFeelsExclusive:
        "The offer is anchored to one exact Allure of the Seas sailing, current cabin-tier pricing, and CB-only promo context.",
    },
    rejectedAngles: [
      {
        title: "Luxury winter retreat",
        reason: "Too adult and premium for the strongest family value signals.",
      },
      {
        title: "Last-minute Caribbean sale",
        reason: "The actual strategy is early booking seven months out.",
      },
    ],
    factualGuardrails: [
      "Do not promise free dining until the operator verifies eligible rate and form requirements.",
      "Do not claim Royal Caribbean July specials without resolving the conflicting card date language.",
      "Do not mark the constructed booking link valid until browser validation is complete.",
    ],
    sources: [
      {
        title: "Odysseus package lookup 1576786",
        url: BOOKING_URL,
        usedFor: "Ship, date, itinerary, cabin pricing, and day-by-day schedule.",
      },
      {
        title: "CB Agent Tools Today's Promos",
        url: "https://www.cbagenttools.com/marketing/todaysview/",
        usedFor: "Royal Caribbean bonus dining, July specials, and early-booking OBC promo context.",
      },
    ],
  };
}

function buildTargetingDemographic(): DealTargetingDemographic {
  return {
    dealId: DEAL_ID,
    packageId: PACKAGE_ID,
    generatedAtIso: GENERATED_AT_ISO,
    primaryAudience: {
      label: "Winter family cruise planners",
      description:
        "Parents and multigenerational households planning a February warm-weather vacation early enough to compare cabins, offers, and school calendars.",
      whyThisCruiseFits:
        "Allure of the Seas has the scale and variety families expect, while Perfect Day Cococay and Labadee make the itinerary easy to understand visually.",
      emotionalDrivers: [
        "Escaping winter",
        "Giving kids something huge to look forward to",
        "Getting the family trip handled before prices or offers shift",
      ],
      likelyObjections: [
        "Is this actually better than a resort?",
        "Will there be enough for different ages?",
        "Does the bonus offer apply to my cabin and party?",
      ],
    },
    secondaryAudiences: [
      {
        label: "Grandparents treating the family",
        description: "Older family buyers looking for an easy shared vacation with activities for children and adults.",
        whyThisCruiseFits: "The ship and private-destination days reduce planning friction across ages.",
        targetingNotes: ["multigenerational vacation", "family cruise", "Caribbean cruise"],
      },
      {
        label: "Royal Caribbean loyalists",
        description: "Travelers already familiar with Royal Caribbean ships or Perfect Day Cococay.",
        whyThisCruiseFits: "The itinerary includes the recognizable Royal Caribbean private-destination hook.",
        targetingNotes: ["Royal Caribbean", "Allure of the Seas", "Perfect Day Cococay"],
      },
    ],
    nicheKeywords: {
      lifestyle: ["family travel", "multigenerational travel", "winter vacation planning"],
      destination: ["Perfect Day Cococay", "Labadee", "Falmouth Jamaica", "Western Caribbean"],
      shipExperience: ["Allure of the Seas", "Royal Caribbean", "large family cruise ship"],
      amenities: ["specialty dining", "balcony cabin", "ship entertainment", "private destination"],
      eventsAndSeasonality: ["February vacation", "winter escape", "early booking"],
      trendSignals: ["private island cruises", "family cruise deals", "book early travel"],
      exclusionKeywords: ["adults only", "solo backpacking", "luxury only"],
    },
    channelTargeting: {
      meta: {
        interestClusters: campaignStrategy.targetingKeywords,
        behaviorSignals: [
          "responds to limited-time travel offers",
          "compares family vacation value",
          "engages with cruise line and private destination content",
        ],
        creativeHooks: [
          "February family escape",
          "Perfect Day Cococay",
          "balcony-value sweet spot",
          "check today's eligible bonus offer",
        ],
        audienceWarnings: [
          "Avoid location-only targeting; the sell is family winter planning plus Royal Caribbean private-destination value.",
        ],
      },
      google: {
        searchThemes: [
          "February family cruises",
          "Royal Caribbean Allure of the Seas",
          "Perfect Day Cococay cruise",
          "winter Caribbean cruise deals",
        ],
        keywordIdeas: campaignStrategy.targetingKeywords,
        negativeKeywords: ["jobs", "crew", "weather only", "map only"],
        landingPageIntentNotes:
          "Landing page should answer ship, family fit, exact ports, current price snapshot, and bonus-offer eligibility.",
      },
      tiktok: {
        creatorAngles: [
          "POV you booked the February family trip before winter hit",
          "What kids actually get excited about on Allure plus Perfect Day",
        ],
        trendHooks: ["winter escape planning", "family trip reveal", "private island day"],
        shortVideoConcepts: [
          "Fast itinerary reveal: Miami, Labadee, Jamaica, Perfect Day",
          "Balcony upgrade value explainer",
        ],
      },
      email: {
        segmentIdeas: ["family cruise prospects", "Royal Caribbean clickers", "Caribbean deal shoppers"],
        subjectLineAngles: [
          "February family cruise idea: Allure + Perfect Day",
          "Check Royal Caribbean bonus eligibility on this sailing",
        ],
        personalizationNotes:
          "Personalize by party size, kids' ages, and whether balcony/suite eligibility matters.",
      },
    },
    researchSummary: {
      primaryInsight:
        "This should be sold as a specific winter family vacation, not a generic Royal Caribbean sale.",
      whyNow:
        "The Cruise Brothers bonus dining window is listed through July 31, and the February sailing is seven months out.",
      competitorBlindSpot:
        "Generic cruise sale ads usually underuse the exact family itinerary and cabin-tier pricing signal.",
      positioningStatement:
        "A big-ship February family escape with Perfect Day Cococay and a timely bonus-offer check.",
    },
    sources: buildAngleResearch().sources,
    confidence: {
      score: 0.86,
      strengths: [
        "Exact package verified",
        "Strong family ship",
        "Strong private-destination visual hook",
        "Likely compatible primary bonus dining promo",
      ],
      risks: [
        "Promo eligibility needs rate-level operator verification",
        "Constructed booking link still needs browser validation",
      ],
      needsHumanReview: [
        "Confirm Royal Caribbean bonus dining form process",
        "Resolve July specials date conflict",
      ],
    },
  };
}

function buildPitchBrief(): DealPitchBrief {
  return {
    dealId: DEAL_ID,
    packageId: PACKAGE_ID,
    generatedAtIso: GENERATED_AT_ISO,
    generator: "deterministic_scaffold",
    tripSummary:
      "A February family escape on Royal Caribbean's Allure of the Seas with Labadee, Jamaica, and Perfect Day Cococay.",
    audienceStatement:
      "For families who want next winter's big warm-weather trip settled early, with enough ship and island variety for every age.",
    primaryHook:
      "Book seven months ahead and verify eligible Royal Caribbean bonus offers before the July window closes.",
    curatedReason:
      "The current balcony price sits close to the inside fare, giving this sailing a stronger upgrade story than a generic cruise sale.",
    sellingFacts: [
      "Six nights from Miami on Allure of the Seas.",
      "Stops include Labadee, Falmouth, and Perfect Day Cococay.",
      "Cruise Brothers lists a Royal Caribbean bonus dining offer for eligible balcony or suite bookings through July 31.",
    ],
    researchRationale:
      "Built from verified Odysseus package 1576786 and refreshed CB Today Promos context.",
  };
}

function buildCopyPackage(): DealCopyPackage {
  return {
    dealId: DEAL_ID,
    packageId: PACKAGE_ID,
    generatedAtIso: GENERATED_AT_ISO,
    generator: "deterministic_scaffold",
    headlineOptions: [
      "A February Family Escape On Allure",
      "Allure, Perfect Day, And A Reason To Book Early",
      "Next Winter's Big Family Cruise Starts Here",
    ],
    shortTileCopy:
      "Six nights from Miami on Allure of the Seas with Labadee, Jamaica, Perfect Day Cococay, and eligible Royal Caribbean bonus-offer checks.",
    heroCopy:
      "Get next winter's family trip on the calendar now: Allure of the Seas sails February 8, 2027 from Miami to Labadee, Falmouth, and Perfect Day Cococay. Eligible Royal Caribbean bonus dining and early-booking offers must be verified before final booking.",
    whyThisTrip: [
      "A major Royal Caribbean family ship, not a vague cruise sale.",
      "Perfect Day Cococay gives the campaign an easy family beach-and-waterpark hook.",
      "The current balcony fare is close enough to inside pricing to make the upgrade conversation worth having.",
    ],
    offerLines: [
      {
        text: "Bonus dining eligibility must be verified for the selected rate and stateroom category before booking.",
        promoRecordId: promoRecords[0].id,
        needsQualifier: true,
      },
      {
        text: "Royal Caribbean July specials may add extra savings on eligible sailings after verification.",
        promoRecordId: promoRecords[1].id,
        needsQualifier: true,
      },
      {
        text: "Early-booking onboard credit may be available on eligible Royal Caribbean bookings.",
        promoRecordId: promoRecords[2].id,
        needsQualifier: true,
      },
    ],
    ctaCopy: [
      {
        kind: "request_callback",
        label: "Check This Sailing",
        supportingText: "Send a structured request for offer and cabin eligibility review.",
      },
      {
        kind: "email_link",
        label: "Send Me The Deal",
        supportingText: "Get the Allure sailing link and offer notes by email.",
      },
      {
        kind: "book_now",
        label: "View Booking Page",
        supportingText: "Open the Royal Caribbean package page to review live cabin availability.",
      },
    ],
    publicCopyRedFlags: [],
    agentOnlyNotes: [
      "Deterministic starter copy. Run Copywriter before final approval if a richer campaign voice is needed.",
      "All promo language is intentionally qualified pending operator verification.",
    ],
  };
}

function buildAdStructure(): DealAdStructure {
  return {
    dealId: DEAL_ID,
    packageId: PACKAGE_ID,
    generatedAtIso: GENERATED_AT_ISO,
    generator: "deterministic_scaffold",
    campaignThesis:
      "Families planning winter travel will respond to a specific Allure of the Seas sailing with Perfect Day Cococay and a concrete bonus-offer verification CTA.",
    channels: [
      {
        channel: "meta",
        primaryAngle: "February family escape with Perfect Day Cococay",
        hooks: ["Book winter early", "Balcony value check", "Verify the bonus dining offer"],
        proofPoints: ["Allure of the Seas", "February 8, 2027", "Perfect Day Cococay", "CB bonus dining promo context"],
        notes: ["Use family-planning and Royal Caribbean private-destination targeting, not location-only targeting."],
      },
      {
        channel: "google",
        primaryAngle: "Royal Caribbean February family cruise deal",
        hooks: ["Allure of the Seas February 2027", "Perfect Day Cococay family cruise", "Royal Caribbean bonus dining check"],
        proofPoints: ["Package 1576786", "Miami roundtrip", "6 nights", "current cabin-tier snapshot"],
        notes: ["Build search themes around exact ship, family winter cruise, and Perfect Day."],
      },
      {
        channel: "email",
        primaryAngle: "Get next winter's family trip settled early",
        hooks: ["February family escape", "Allure + Perfect Day", "Check bonus offer before July ends"],
        proofPoints: ["verified package", "specific itinerary", "promo window"],
        notes: ["Good for family cruise clickers and Royal Caribbean interest segments."],
      },
    ],
    nicheKeywords: campaignStrategy.targetingKeywords,
    trendKeywords: ["winter family travel", "private island cruises", "early booking travel"],
    negativeKeywords: ["adults only", "solo travel", "crew jobs"],
    creativeHypotheses: [
      "Perfect Day Cococay imagery will outperform generic ship-only creative.",
      "Balcony-value framing will outperform headline discount language because the promo requires verification.",
      "Family winter escape timing will outperform broad Caribbean targeting.",
    ],
    offerProofPoints: [
      "Cruise Brothers bonus dining promo card",
      "Royal Caribbean early-booking OBC promo card",
      "Odysseus cabin-tier pricing snapshot",
    ],
  };
}

function buildMediaPlan(): DealMediaPlan {
  return {
    dealId: DEAL_ID,
    packageId: PACKAGE_ID,
    generatedAtIso: GENERATED_AT_ISO,
    generator: "deterministic_scaffold",
    visualDirection: [
      "Bright Royal Caribbean family energy",
      "Perfect Day Cococay water, beach, and thrill cues",
      "Allure of the Seas scale and balcony-view warmth",
    ],
    imageSlots: [
      {
        slot: "hero",
        purpose: "Sell the big February family escape instantly.",
        visualConceptPrompt:
          "Royal Caribbean Allure of the Seas in bright Caribbean light with family-friendly resort energy and warm February escape mood.",
        requiredSourceAssets: ["Allure of the Seas exterior", "Caribbean sea or port context"],
      },
      {
        slot: "offer",
        purpose: "Support the bonus-offer CTA without overclaiming.",
        visualConceptPrompt:
          "Premium cruise dining moment suitable for a qualified bonus dining offer check.",
        requiredSourceAssets: ["Royal Caribbean dining or specialty dining context"],
      },
      {
        slot: "destination",
        purpose: "Make Perfect Day Cococay feel like the family payoff.",
        visualConceptPrompt:
          "Perfect Day Cococay beach and waterpark energy with bright family vacation color.",
        requiredSourceAssets: ["Perfect Day Cococay"],
      },
    ],
    shortVideoConcepts: [
      {
        concept: "February escape reveal",
        hook: "Next winter's family trip is already sitting here.",
        shots: ["Miami departure", "Allure deck energy", "Labadee", "Falmouth", "Perfect Day Cococay"],
      },
      {
        concept: "Bonus offer check",
        hook: "Before booking the balcony, verify what bonus applies today.",
        shots: ["Balcony view", "Dining table", "Perfect Day beach", "CTA screen"],
      },
    ],
    requiredSourceAssets: ["Allure of the Seas", "Perfect Day Cococay", "Labadee", "family cruise dining"],
    readiness: "concepts_ready",
  };
}

function promoRecord(input: {
  id: string;
  title: string;
  bookingWindow: string;
  sailingWindow: string;
  details: string;
  allowed: string[];
  qualified: string[];
  suggestedAngles: string[];
  cautions: string[];
  offerTypes: CbPromoIntelligenceRecord["extracted"]["offerTypes"];
  products: string[];
}): CbPromoIntelligenceRecord {
  return {
    id: input.id,
    source: "cb_agent_tools_todays_view",
    sourceUrl: "https://www.cbagenttools.com/marketing/todaysview/",
    detailUrl: "https://www.cbagenttools.com/marketing/todaysview/",
    capturedAtIso: GENERATED_AT_ISO,
    title: input.title,
    vendor: "Royal Caribbean",
    bookingWindow: { rawText: input.bookingWindow, endsOn: input.bookingWindow.includes("07/31/2026") ? "2026-07-31" : undefined },
    sailingWindow: { rawText: input.sailingWindow },
    promotionDetailsRaw: input.details,
    agentInstructionsRaw: "Created from refreshed CB Agent Tools Today's Promos card text. Operator must verify eligibility before final public approval.",
    keyFeaturesRaw: input.details,
    applicableSailingsRaw: input.sailingWindow,
    applicableProductsRaw: input.products.join("; "),
    applicableMarketsRaw: "US market assumed from CB Agent Tools context; operator review required.",
    supportingFiles: [],
    extracted: {
      offerTypes: input.offerTypes,
      percentDiscounts: [],
      dollarSavings: [],
      onboardCredits: [],
      freeGuestOffers: input.title.includes("Free Guests")
        ? [{ guestNumbers: "3rd and 4th guests", rawText: "Free 3rd and 4th guests on eligible Royal Caribbean July specials; exact sailing eligibility needs review." }]
        : [],
      combinability: { rawRules: ["Combinability not confirmed from promo card."] },
      exclusions: ["Exact rate, cabin, and sailing eligibility must be confirmed at booking."],
      applicableProducts: input.products,
      applicableMarkets: ["US"],
    },
    marketingUse: {
      publicClaimsAllowed: input.allowed,
      publicClaimsNeedsQualifier: input.qualified,
      agentOnlyNotes: ["Verify the current Royal Caribbean rate code and promo eligibility before approval."],
      suggestedAngles: input.suggestedAngles,
      cautionFlags: input.cautions,
      bestMatchedDealBriefs: [BRIEF_ID],
      visitorFriendlySummary: input.qualified[0] ?? input.allowed[0] ?? input.details,
    },
    diagnostics: {
      status: "needs_review",
      notes: ["Derived from Today's Promos card text because no Royal Caribbean detail page was exposed in the structured scrape."],
      warnings: input.cautions,
    },
  };
}

const promoRecords: CbPromoIntelligenceRecord[] = [
  promoRecord({
    id: "cbtodays-royal-caribbean-bonus-free-dining-2026-07-31",
    title: "Cruise Brothers BONUS Free Dining - Royal Caribbean",
    bookingWindow: "Valid Until 07/31/2026",
    sailingWindow: "Balcony or Suite on 6-night or longer Caribbean, Bermuda, Bahamas and West Coast/Mexico sailings departing August 17, 2026 - April 30, 2027.",
    details:
      "Cruise Brothers Exclusive - Bonus Free Specialty Dining for 2 people aboard eligible Royal Caribbean voyages. New bookings only. Dining form required.",
    allowed: ["Cruise Brothers lists a Royal Caribbean bonus specialty dining offer for eligible balcony or suite bookings."],
    qualified: ["Bonus dining eligibility must be confirmed for the selected rate and stateroom category before booking."],
    suggestedAngles: ["Book the balcony sweet spot while the Cruise Brothers dining bonus is available."],
    cautions: ["Operator must submit or confirm the dining form process and verify rate eligibility."],
    offerTypes: ["agency_special", "other"],
    products: ["Royal Caribbean balcony or suite sailings of 6 nights or longer"],
  }),
  promoRecord({
    id: "cbtodays-royal-caribbean-july-specials-2026-07-31",
    title: "Royal Caribbean 30% Off, Free Guests, Mega Savings, Military Savings",
    bookingWindow: "Valid Until 07/31/2026; card text also says Book through July 7.",
    sailingWindow: "Eligible Royal Caribbean sailings; exact sailing list not included in the card excerpt.",
    details:
      "Royal Caribbean July specials card references dollars off, free 3rd and 4th guests, instant savings, and military savings.",
    allowed: ["Royal Caribbean July specials may add extra savings on eligible sailings."],
    qualified: ["Royal Caribbean July special eligibility must be confirmed against live rate and sailing rules before booking."],
    suggestedAngles: ["A time-sensitive July family value check for 3rd and 4th guests."],
    cautions: ["The card has conflicting date language; do not claim this offer without live operator verification."],
    offerTypes: ["second_guest_discount", "free_extra_guests", "instant_savings", "dollars_off"],
    products: ["Royal Caribbean eligible sailings"],
  }),
  promoRecord({
    id: "cbtodays-royal-caribbean-early-booking-obc-2026-12-31",
    title: "Royal Caribbean Bonus Onboard Credit",
    bookingWindow: "Valid Until 12/31/2026",
    sailingWindow: "Early booking Royal Caribbean onboard credit program; exact sailing list not included in the card excerpt.",
    details:
      "Royal Caribbean Early Booking OBC for clients. The card positions early booking as a way to craft memories with friends and loved ones.",
    allowed: ["Royal Caribbean has an early-booking onboard credit program for eligible bookings."],
    qualified: ["Early-booking onboard credit eligibility and amount must be confirmed against live rate and sailing rules before booking."],
    suggestedAngles: ["Book seven months ahead and check the early-booking onboard credit opportunity."],
    cautions: ["Exact onboard credit amount and eligibility were not present in the Today's Promos card excerpt."],
    offerTypes: ["onboard_credit"],
    products: ["Royal Caribbean eligible bookings"],
  }),
];

const promoApplicability: PromoApplicabilityResult[] = [
  {
    promoRecordId: promoRecords[0].id,
    status: "likely_applicable",
    matchedOn: [
      "Royal Caribbean line match",
      "6-night sailing",
      "Caribbean and Bahamas itinerary",
      "2027-02-08 departure inside the listed sailing window",
      "balcony and suite cabin tiers present",
    ],
    assumptions: ["Final eligibility depends on the rate selected and Cruise Brothers dining form handling."],
    warnings: ["Do not promise the dining bonus until the operator verifies the booking conditions."],
  },
  {
    promoRecordId: promoRecords[1].id,
    status: "possibly_applicable_needs_review",
    matchedOn: ["Royal Caribbean line match", "family value angle match"],
    assumptions: ["The current Royal July specials may still be visible in CB Agent Tools."],
    warnings: ["Promo card has conflicting date language and needs live verification before public claims."],
  },
  {
    promoRecordId: promoRecords[2].id,
    status: "possibly_applicable_needs_review",
    matchedOn: ["Royal Caribbean line match", "early booking angle match"],
    assumptions: ["The sailing may be eligible under the early-booking OBC program."],
    warnings: ["Exact onboard credit amount was not captured from the promo card."],
  },
];

function buildDiscoveryIdea(): DealDiscoveryIdea {
  return {
    id: "angle-workbench-rcl-allure-perfect-day-family-1576786",
    generatedAtIso: GENERATED_AT_ISO,
    generator: "gpt",
    sourceResearchCachedAt: "workbench",
    isolatedNiche: campaignStrategy.targetAudience,
    researchRationale:
      "The strongest winter family opportunity found in CB and Odysseus research pairs a major Royal Caribbean family ship with Perfect Day Cococay, a February school-year escape window, and a timely balcony/suite dining bonus candidate.",
    successLogic:
      "Families can understand this offer quickly: a real February sailing on Allure of the Seas, private-destination beach days, and a July booking reason tied to eligible Royal Caribbean bonus offers.",
    audienceSignals: [
      "Family cruises",
      "Winter Caribbean escape",
      "Perfect Day Cococay",
      "Royal Caribbean private destination",
      "Balcony upgrade value",
      "Multigenerational vacation planning",
      "Early booking vacation shoppers",
    ],
    sailingAngleProfile: {
      sailingAngleTitle: "February Family Escape",
      theCorePitch:
        "Get next winter's big family cruise on the calendar now: Allure of the Seas, Labadee, Jamaica, and Perfect Day Cococay in one warm-weather week. The current balcony pricing creates a strong upgrade story while the Royal Caribbean bonus-offer window gives families a reason to ask now.",
      visualAnchor:
        "Allure of the Seas at sea, Perfect Day Cococay color and waterpark energy, family pool-deck moments, and balcony-view Caribbean warmth.",
      targetAudienceDescriptor: campaignStrategy.targetAudience,
      relevantKeywords: campaignStrategy.targetingKeywords,
      destinationAndTimeOfYearHints:
        "February 2027 Caribbean and Bahamas itinerary from Miami, positioned as a winter family escape booked seven months early.",
      onboardAssetRequirements:
        "Large Royal Caribbean resort ship, family entertainment, pools, dining variety, private-destination beach and waterpark assets, balcony value proof.",
    },
    groundedCandidate: {
      resolvedAtIso: GENERATED_AT_ISO,
      packageId: PACKAGE_ID,
      cruiseName: cruiseFacts.title,
      cruiseLine: cruiseFacts.cruiseLine,
      sailDateIso: cruiseFacts.sailDateIso,
      nights: cruiseFacts.nights,
      departurePortCode: "MIA",
      portsOfCall: cruiseFacts.portsOfCall.join(" | "),
      itineraryId: 575355,
      confidence: 1,
      reasons: [
        "Exact Odysseus lookup matched package 1576786.",
        "Package page captured ship identity: Allure of the Seas.",
        "Day-by-day itinerary and cabin pricing were captured from Odysseus.",
      ],
    },
  };
}

function buildManifest(): DealTripManifest {
  const idea = buildDiscoveryIdea();
  return {
    id: "manifest-workbench-rcl-allure-perfect-day-family-1576786",
    generatedAtIso: GENERATED_AT_ISO,
    generator: "gpt",
    expiresOnIso: "2026-07-31",
    sourceAngleId: idea.id,
    isolatedNiche: idea.isolatedNiche,
    sailingAngleTitle: idea.sailingAngleProfile.sailingAngleTitle,
    assembleDraft: {
      suggestedDealId: DEAL_ID,
      suggestedBriefId: BRIEF_ID,
      cruiseLine: cruiseFacts.cruiseLine,
      itineraryName: cruiseFacts.itineraryName,
      destination: "Western Caribbean and Perfect Day Cococay",
      nights: cruiseFacts.nights,
      sailWindow: {
        earliestIso: cruiseFacts.sailDateIso,
        latestIso: cruiseFacts.sailDateIso,
        rationale: "Exact February 2027 sailing selected for a winter family early-booking campaign.",
      },
      departurePortHint: "Miami",
      portsOfCall: cruiseFacts.portsOfCall,
    },
    appliedPromos: promoApplicability,
    promoStrategy:
      "Lead with the Cruise Brothers Royal Caribbean bonus dining eligibility check for balcony or suite bookings, then use the Royal Caribbean July specials and early-booking OBC only as verified-at-call secondary checks.",
    manifestReasoning:
      "This package gives the campaign a strong family ship, two private-destination style beach days, a February winter-escape date, and a real July booking urgency mechanism through the Royal Caribbean bonus dining promo.",
    lookupQuery: {
      line: cruiseFacts.cruiseLine,
      ship: cruiseFacts.shipName,
      destination: "Caribbean",
      date: cruiseFacts.sailDateIso,
      nights: cruiseFacts.nights,
      port: "Miami",
      windowDays: 0,
    },
    targetingSeeds: {
      inferredMarket: "US",
      geoFocus: ["Miami", "Western Caribbean", "Perfect Day Cococay", "Labadee", "Falmouth Jamaica"],
      personaSignals: [
        "families planning winter travel",
        "multigenerational cruise shoppers",
        "parents comparing Caribbean resort vacations",
        "Royal Caribbean loyalists",
        "balcony upgrade shoppers",
      ],
      metaInterestSeeds: campaignStrategy.targetingKeywords,
      metaBehaviorSignals: [
        "responds to limited-time travel offers",
        "compares family vacation value",
        "engages with cruise line and private destination content",
      ],
      excludedAudienceSignals: ["luxury-only adults-only travelers", "solo backpacking", "last-minute only"],
    },
    resolvedPackage: {
      resolvedAtIso: GENERATED_AT_ISO,
      source: "operator_package_lookup",
      packageId: PACKAGE_ID,
      cruiseName: cruiseFacts.title,
      cruiseLine: cruiseFacts.cruiseLine,
      shipName: cruiseFacts.shipName,
      sailDateIso: cruiseFacts.sailDateIso,
      nights: cruiseFacts.nights,
      departurePortCode: "MIA",
      confidence: 1,
      reasons: [
        "Exact sail date",
        "Cruise line matches Royal Caribbean",
        "Package page captured Allure of the Seas",
        "Itinerary name matches Caribbean and Perfect Day criteria",
      ],
      siid: SIID,
      bookingUrl: BOOKING_URL,
      bookingLinkClass: "constructed_package_url",
      linkHealth: {
        status: "unknown",
        failureReason: "Constructed package link not yet browser-validated by operator.",
      },
      cabinPricing: {
        inside: 645.5,
        outside: 740.5,
        balcony: 722.5,
        suite: 1849,
        currencyCode: "USD",
        leadFare: 645.5,
      },
      itinerary: {
        durationNights: cruiseFacts.nights,
        departurePortCode: "MIA",
        arrivalPortCode: "MIA",
        portsOfCall: cruiseFacts.portsOfCall.join(" | "),
        normalizedPortsOfCall: "MIA|LA1|FALM|COCY|MIA",
        mapPath: "MIA_LA1_FMH_CCY_MIA.jpg",
        dayByDay: dayByDayItinerary,
      },
      lookupDiagnostics: [
        "Odysseus lookup returned confident_match for package 1576786.",
        "Captured package-page ship identity: Royal Caribbean: Allure of the Seas.",
        "Captured 7 day itinerary nodes.",
      ],
    },
  };
}

async function main(): Promise<void> {
  const existing = await getCuratedDeal(DEAL_ID);
  if (existing) {
    throw new Error(`${DEAL_ID} already exists. Refusing to overwrite existing operator work.`);
  }

  for (const record of promoRecords) {
    await upsertPromoRecordEntry(record);
  }

  const angleResearch = buildAngleResearch();
  const targetingDemographic = buildTargetingDemographic();
  const pitchBrief = buildPitchBrief();
  const copyPackage = buildCopyPackage();
  const adStructure = buildAdStructure();
  const mediaPlan = buildMediaPlan();
  const packageMatch = {
    confidence: 1,
    reasons: [
      "Exact Odysseus package 1576786 was selected.",
      "Allure of the Seas ship identity was captured from the package page.",
      "Sail date, line, itinerary name, and day-by-day itinerary match the campaign facts.",
    ],
  };
  const linkHealth = {
    status: "unknown" as const,
    failureReason: "Constructed package link not yet browser-validated by operator.",
  };
  const gates = evaluateApprovalGates({
    packageId: PACKAGE_ID,
    linkHealth,
    packageMatch,
    pitchBrief,
    copyPackage,
    targetingDemographic,
    mediaPlan,
  });
  const deal: CuratedOdysseusDeal = {
    id: DEAL_ID,
    status: "needs_review",
    source: "odysseus_curated_retail",
    briefId: BRIEF_ID,
    capturedAtIso: GENERATED_AT_ISO,
    expiresOnIso: "2026-07-31",
    packageId: PACKAGE_ID,
    siid: SIID,
    bookingUrl: BOOKING_URL,
    bookingUrlSource: "constructed_package_url",
    linkHealth,
    packageMatch,
    cruiseFacts,
    scoring: {
      score: 75,
      reasons: [
        "Exact Odysseus package facts captured.",
        "Campaign strategy saved.",
        "Targeting scaffold attached.",
        "Pitch and starter copy attached.",
        "Media concepts attached.",
      ],
      warnings: [
        "Constructed booking link still needs operator browser validation.",
        "Promo eligibility must be checked at rate level before approval.",
        "Starter layers are deterministic scaffolds; run copy/funnel stages for polished final assets.",
      ],
    },
    packaging: {
      headline: copyPackage.headlineOptions[0],
      shortSummary: copyPackage.shortTileCopy,
      highlights: copyPackage.whyThisTrip,
      destinationNotes: angleResearch.destinationHooks,
      bestFor: [
        targetingDemographic.primaryAudience.label,
        ...targetingDemographic.secondaryAudiences.map((audience) => audience.label),
      ],
    },
    promoApplicability,
    angleResearch,
    campaignStrategy,
    targetingDemographic,
    pitchBrief,
    copyPackage,
    adStructure,
    mediaPlan,
    operatorApproval: {
      dealId: DEAL_ID,
      status: "needs_review",
      updatedAtIso: GENERATED_AT_ISO,
      decidedBy: "system",
      textOnlyLaunchWaived: false,
      gates,
    },
    agentOnlyNotes: [
      "Seeded by Codex from refreshed CB Today's Promos and Odysseus lookup on 2026-07-03.",
      "Primary promo is likely applicable but still needs operator/rate-level eligibility review before public approval.",
      "Royal Caribbean July specials card had conflicting valid-through and book-through text.",
    ],
  };

  await upsertCuratedDealRecord(deal);
  await upsertDealBriefRecord({
    id: BRIEF_ID,
    title: cruiseFacts.title,
    destinationKeywords: ["Perfect Day Cococay", "Labadee", "Falmouth Jamaica", "Western Caribbean"],
    cruiseLine: cruiseFacts.cruiseLine,
    vendorId: 8,
    shipName: cruiseFacts.shipName,
    departurePort: cruiseFacts.departurePort,
    minNights: cruiseFacts.nights,
    maxNights: cruiseFacts.nights,
    earliestSailDate: cruiseFacts.sailDateIso,
    latestSailDate: cruiseFacts.sailDateIso,
    maxInsidePricePerPerson: 645.5,
    maxBalconyPricePerPerson: 722.5,
    requiredPromoSignals: ["Royal Caribbean bonus dining eligibility check", "early booking onboard credit check"],
    marketingAngle: campaignStrategy.campaignAngle,
    audienceFit: [
      "Families planning February winter travel",
      "Multigenerational Caribbean vacation shoppers",
      "Royal Caribbean and Perfect Day Cococay prospects",
    ],
  });

  const idea = buildDiscoveryIdea();
  const cache = upsertDealDiscoveryIdea(loadDealDiscoveryIdeasCache(), idea);
  saveDealDiscoveryIdeasCache(cache);

  const manifest = buildManifest();
  await upsertDealTripManifestRecord(manifest);

  const readback = await getCuratedDeal(DEAL_ID);
  console.log(JSON.stringify({
    dealId: deal.id,
    status: readback?.status,
    approval: readback?.operatorApproval?.status,
    packageId: readback?.packageId,
    packageMatch: readback?.packageMatch?.confidence,
    linkHealth: readback?.linkHealth.status,
    promoCount: readback?.promoApplicability?.length ?? 0,
    manifestId: manifest.id,
    nextUrl: `/tests/deals-system/copywriter?manifestId=${encodeURIComponent(manifest.id)}`,
    bookingUrl: readback?.bookingUrl,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
