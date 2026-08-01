import { POST as lookupPackage } from "../../app/api/tests/deals-system/lookup-package/route";
import { POST as updateCuratedDeal } from "../../app/api/tests/deals-system/curated-deal/route";
import {
  buildDealBriefId,
  buildTripManifestId,
  upsertPromoRecordEntry,
  type CbPromoIntelligenceRecord,
  type DealItineraryDay,
} from "../../lib/cb/deals-system";

const PACKAGE_ID = "1621785";
const PROMO_ID = "official-dcl-florida-resident-1621785";
const ANGLE_TITLE = "Holiday Magic Without the Holiday Marathon";
const SIID = process.env.CB_AGENT_SIID ?? "1049337";
const BOOKING_URL =
  `https://bookings.cbagenttools.com/swift/cruise/package/${PACKAGE_ID}?siid=${SIID}&lang=1`;
const PROMO_SOURCE_URL =
  "https://disneycruise.disney.go.com/special-offers/florida-residents-rates/";

const TARGET_AUDIENCE =
  "Florida-resident families who want a meaningful Disney holiday but do not want another tightly scheduled park trip or an unclear total vacation cost.";

const VISUAL_ANGLE =
  "An overfull holiday checklist gives way to the calm geometry of Disney Fantasy at dusk, then Castaway Cay, Cozumel, and an unhurried family sea day. Holiday warmth without a generic character collage.";

const TARGETING_KEYWORDS = [
  "Florida resident Disney cruise offer",
  "Disney Very Merrytime cruise 2026",
  "Disney Fantasy November 2026",
  "holiday cruise from Port Canaveral",
  "Disney cruise for families",
  "Castaway Cay cruise",
  "Christmas cruise from Florida",
  "family holiday without theme parks",
];

interface LookupFacts {
  packageId: string;
  cruiseLine: string;
  shipName: string;
  title: string;
  nights?: number;
  sailDateIso: string;
  departurePort?: string;
  cabinPricing?: {
    inside?: number;
    outside?: number;
    balcony?: number;
    suite?: number;
    currencyCode: string;
    leadFare?: number;
  };
  dayByDayItinerary?: DealItineraryDay[];
}

interface RoutePayload {
  ok?: boolean;
  error?: string;
  message?: string;
  cruiseFacts?: LookupFacts;
  deal?: {
    id?: string;
    status?: string;
    linkHealth?: { status?: string };
    operatorApproval?: { status?: string };
  };
  manifestId?: string;
  nextUrl?: string;
  handoffAssessment?: {
    status?: string;
    warnings?: string[];
    blockingIssues?: string[];
  };
}

async function callRoute(
  post: (request: Request) => Promise<Response>,
  routeName: string,
  body: Record<string, unknown>
): Promise<RoutePayload> {
  const response = await post(
    new Request(`http://local.invalid/${routeName}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  );
  const payload = (await response.json()) as RoutePayload;
  if (!response.ok || payload.ok !== true) {
    throw new Error(payload.error ?? payload.message ?? `${routeName} failed with ${response.status}.`);
  }
  return payload;
}

function orderedPortNames(days: DealItineraryDay[]): string[] {
  const seen = new Set<string>();
  const ports: string[] = [];
  for (const day of days) {
    if (day.atSea || seen.has(day.portName)) continue;
    seen.add(day.portName);
    ports.push(day.portName);
  }
  return ports;
}

function buildOfficialDisneyPromo(briefId: string): CbPromoIntelligenceRecord {
  return {
    id: PROMO_ID,
    source: "official_cruise_line",
    sourceUrl: PROMO_SOURCE_URL,
    detailUrl: PROMO_SOURCE_URL,
    capturedAtIso: new Date().toISOString(),
    title: "Florida Resident Rates - November 20, 2026 Disney Fantasy",
    vendor: "Disney Cruise Line",
    bookingWindow: {
      rawText: "No booking deadline is stated on the captured official offer page; availability is limited.",
    },
    sailingWindow: {
      startsOn: "2026-11-20",
      endsOn: "2026-11-20",
      rawText: "5-Night Very Merrytime Western Caribbean Cruise aboard Disney Fantasy departing November 20, 2026.",
    },
    promotionDetailsRaw:
      "Disney Cruise Line lists this exact sailing under Florida Resident Rates at up to 30% off voyage fare. Taxes, Fees and Port Expenses are excluded.",
    agentInstructionsRaw:
      "At least one adult in each stateroom must present proof of Florida residency that is valid at the time of sailing. Confirm the selected cabin and rate display the promotion before using a numeric savings claim.",
    keyFeaturesRaw:
      "Up to 30% off voyage fare; limited to 50 staterooms per sailing; valid on new and existing reservations; cannot be combined with another special offer or discount.",
    applicableSailingsRaw:
      "Disney Fantasy, 5-Night Very Merrytime Western Caribbean Cruise, November 20, 2026.",
    applicableProductsRaw:
      "Eligible voyage fare on the exact listed sailing; cabin-level promotional inventory remains subject to availability.",
    applicableMarketsRaw:
      "Florida residents only. At least one adult per stateroom must provide valid Florida-residency proof at check-in.",
    supportingFiles: [],
    extracted: {
      offerTypes: ["instant_savings"],
      percentDiscounts: [
        {
          appliesTo: "Eligible voyage fare on the November 20, 2026 Disney Fantasy sailing",
          percentOff: 30,
          rawText: "Up to 30% off voyage fare for eligible Florida residents.",
        },
      ],
      dollarSavings: [],
      onboardCredits: [],
      freeGuestOffers: [],
      combinability: {
        rawRules: ["Cannot be combined with another special offer or discount."],
      },
      exclusions: [
        "Taxes, Fees and Port Expenses are excluded from the discount.",
        "Limited to 50 staterooms per sailing.",
        "At least one adult in each stateroom must present valid proof of Florida residency at check-in.",
      ],
      applicableProducts: [
        "Disney Fantasy",
        "5-Night Very Merrytime Western Caribbean Cruise",
        "November 20, 2026 departure",
      ],
      applicableMarkets: ["US"],
    },
    marketingUse: {
      publicClaimsAllowed: [
        "Disney Cruise Line lists a Florida Resident Rate for the November 20, 2026 Disney Fantasy sailing.",
      ],
      publicClaimsNeedsQualifier: [
        "Eligible Florida residents may save up to 30% on voyage fare for this sailing, subject to promotional inventory and rate confirmation.",
      ],
      agentOnlyNotes: [
        "Require Florida-only geographic targeting for paid media.",
        "Confirm the selected cabin and rate display the Florida Resident Rate before quoting the discount as available.",
        "Verify residency evidence with the traveler; at least one adult per stateroom must present valid proof at check-in.",
      ],
      suggestedAngles: [
        "Florida families can trade holiday logistics for five nights of Very Merrytime sailing.",
        "A Florida-resident opportunity for Disney holiday magic without another tightly scheduled park trip.",
      ],
      cautionFlags: [
        "Always retain 'up to' with the 30% claim.",
        "Do not imply every cabin category or rate is discounted.",
        "Do not target or qualify non-Florida residents for this offer.",
        "Prices and promotional inventory can change until booked.",
      ],
      bestMatchedDealBriefs: [briefId],
      visitorFriendlySummary:
        "Eligible Florida residents can check current Disney Cruise Line pricing for up to 30% off voyage fare on this exact Very Merrytime sailing, subject to availability and rate confirmation.",
    },
    diagnostics: {
      status: "needs_review",
      model: "manual_official_source_review",
      notes: [
        "Structured from Disney Cruise Line's official Florida Resident Rates page captured on 2026-07-31.",
        "The official offer page lists this exact ship, itinerary length, and sail date.",
      ],
      warnings: [
        "The official page does not state a booking deadline.",
        "Cabin-level promotional inventory must be confirmed before booking and before making an unqualified availability claim.",
      ],
    },
  };
}

async function main(): Promise<void> {
  const lookup = await callRoute(lookupPackage, "lookup-package", { packageId: PACKAGE_ID });
  const facts = lookup.cruiseFacts;
  if (!facts) throw new Error(`Exact package ${PACKAGE_ID} returned no cruise facts.`);
  if (facts.packageId !== PACKAGE_ID) throw new Error(`Expected ${PACKAGE_ID}, received ${facts.packageId}.`);
  if (facts.sailDateIso !== "2026-11-20") {
    throw new Error(`Package ${PACKAGE_ID} sail date changed to ${facts.sailDateIso}.`);
  }
  if (facts.shipName !== "Disney Fantasy") {
    throw new Error(`Package ${PACKAGE_ID} ship changed to ${facts.shipName || "unknown"}.`);
  }
  if (!facts.cabinPricing?.inside || !facts.cabinPricing?.balcony) {
    throw new Error(`Package ${PACKAGE_ID} returned incomplete numeric cabin pricing.`);
  }
  if (!facts.dayByDayItinerary || facts.dayByDayItinerary.length === 0) {
    throw new Error(`Package ${PACKAGE_ID} returned no day-by-day itinerary.`);
  }

  const briefId = buildDealBriefId(PACKAGE_ID, ANGLE_TITLE);
  const manifestId = buildTripManifestId(PACKAGE_ID, ANGLE_TITLE);
  const promo = buildOfficialDisneyPromo(briefId);
  await upsertPromoRecordEntry(promo);
  const portsOfCall = orderedPortNames(facts.dayByDayItinerary);

  const assembled = await callRoute(updateCuratedDeal, "curated-deal", {
    action: "assemble",
    dealId: PACKAGE_ID,
    briefId,
    packageId: PACKAGE_ID,
    siid: SIID,
    bookingUrl: BOOKING_URL,
    campaignAngle: ANGLE_TITLE,
    targetAudience: TARGET_AUDIENCE,
    visualAngle: VISUAL_ANGLE,
    targetingKeywords: TARGETING_KEYWORDS,
    metaGeographicRestriction: {
      countryCode: "US",
      regionCode: "FL",
      regionName: "Florida",
      residencyRequired: true,
    },
    promoRecordIds: [PROMO_ID],
    cruiseFacts: {
      title: facts.title,
      cruiseLine: facts.cruiseLine,
      shipName: facts.shipName,
      itineraryName: facts.title,
      nights: facts.nights,
      sailDateIso: facts.sailDateIso,
      departurePort: facts.departurePort,
      portsOfCall,
      dayByDayItinerary: facts.dayByDayItinerary,
      cabinPrices: facts.cabinPricing,
      promoSignals: [
        "Disney Cruise Line Florida Resident Rate",
        "up to 30% off eligible voyage fare",
        "Florida residency proof required",
      ],
    },
  });

  const linkVerified = await callRoute(updateCuratedDeal, "curated-deal", {
    action: "set_link_valid",
    dealId: PACKAGE_ID,
    decisionNote: "Exact package page loaded successfully during the 2026-07-31 Odysseus capture.",
  });

  const handoff = await callRoute(updateCuratedDeal, "curated-deal", {
    action: "send_to_pipeline",
    dealId: PACKAGE_ID,
    promoRecordIds: [PROMO_ID],
    campaignAngle: ANGLE_TITLE,
    targetAudience: TARGET_AUDIENCE,
    visualAngle: VISUAL_ANGLE,
    targetingKeywords: TARGETING_KEYWORDS,
  });
  if (handoff.manifestId !== manifestId) {
    throw new Error(`Expected manifest ${manifestId}, received ${handoff.manifestId ?? "none"}.`);
  }
  if (handoff.handoffAssessment?.status !== "promo_attached") {
    throw new Error(
      `Disney promotion handoff did not pass: ${handoff.handoffAssessment?.status ?? "missing"}.`
    );
  }

  console.log(
    JSON.stringify(
      {
        lane: "Deal",
        dealId: assembled.deal?.id,
        dealStatus: assembled.deal?.status,
        approvalStatus: assembled.deal?.operatorApproval?.status,
        linkHealth: linkVerified.deal?.linkHealth?.status,
        packageId: PACKAGE_ID,
        briefId,
        manifestId,
        promoRecordId: PROMO_ID,
        promoSource: promo.source,
        promoDiagnostics: promo.diagnostics,
        handoffAssessment: handoff.handoffAssessment,
        nextUrl: handoff.nextUrl,
        cabinPricing: facts.cabinPricing,
        nextRequiredDecision:
          "Review promotion-qualified copy and funnel-image candidates. Do not approve or publish until the selected cabin rate confirms the Florida Resident Rate.",
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
