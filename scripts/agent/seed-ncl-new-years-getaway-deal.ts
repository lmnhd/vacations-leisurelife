import { readFileSync } from "node:fs";
import { join } from "node:path";

import { POST as lookupPackage } from "../../app/api/tests/deals-system/lookup-package/route";
import { POST as updateCuratedDeal } from "../../app/api/tests/deals-system/curated-deal/route";
import { POST as runCopywriter } from "../../app/api/tests/deals-system/copywriter/route";
import { POST as runFunnelSynthesis } from "../../app/api/tests/deals-system/funnel-synthesis/route";
import { POST as assembleForPublication } from "../../app/api/tests/deals-system/publish/route";
import {
  buildDealBriefId,
  buildTripManifestId,
  upsertPromoRecordEntry,
  type CbPromoIntelligenceCache,
  type CbPromoIntelligenceRecord,
  type DealItineraryDay,
} from "../../lib/cb/deals-system";

const PACKAGE_ID = "1557855";
const PROMO_ID = "cbpromo-2904";
const ANGLE_TITLE = "Midnight Is the Departure";
const SIID = process.env.CB_AGENT_SIID ?? "1049337";
const BOOKING_URL =
  `https://bookings.cbagenttools.com/swift/cruise/package/${PACKAGE_ID}?siid=${SIID}&lang=1`;

const TARGET_AUDIENCE =
  "US couples, friend groups, and celebration travelers who want New Year's Eve to become the first night of a real Caribbean vacation, with a compelling current fare and a time-limited NCL sale.";

const VISUAL_ANGLE =
  "A cinematic countdown clock reaches midnight as Norwegian Getaway leaves Florida, then opens into a clean seven-night route through Puerto Plata, St. Thomas, Tortola, and Great Stirrup Cay. Elegant celebration energy, not generic confetti.";

const TARGETING_KEYWORDS = [
  "New Year's Eve cruise 2026",
  "New Year cruise from Florida",
  "Norwegian Getaway",
  "Eastern Caribbean cruise",
  "Port Canaveral cruise",
  "New Year's vacation for couples",
  "holiday cruise deal",
  "seven-night Caribbean cruise",
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
  handoffAssessment?: { status?: string; warnings?: string[] };
  adCopy?: {
    id: string;
    variants: Array<{
      variantLabel: string;
      headline: string;
      bodyCopy: string;
      callToAction: string;
      promotionMode?: string;
    }>;
  };
  synthesis?: {
    id: string;
    candidates?: unknown[];
    landingPage?: { heroHeadline?: string };
    carousel?: { cards?: unknown[] };
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

function loadFreshNclPromo(): CbPromoIntelligenceRecord {
  const cachePath = join(process.cwd(), ".github", "data", "cb-promo-intelligence-cache.json");
  const cache = JSON.parse(readFileSync(cachePath, "utf8")) as CbPromoIntelligenceCache;
  const raw = cache.records.find((record) => record.id === PROMO_ID);
  if (!raw) throw new Error(`Fresh promo cache does not contain ${PROMO_ID}.`);
  if (raw.bookingWindow.endsOn !== "2026-08-18") {
    throw new Error(`Unexpected NCL booking-window end: ${raw.bookingWindow.endsOn ?? "missing"}.`);
  }
  if (raw.sailingWindow.startsOn !== "2026-10-15" || raw.sailingWindow.endsOn !== "2027-09-02") {
    throw new Error("Unexpected NCL sailing window in the fresh CB promo capture.");
  }

  return {
    ...raw,
    extracted: {
      offerTypes: ["second_guest_discount", "onboard_credit", "free_extra_guests", "other"],
      percentDiscounts: [
        {
          appliesTo: "Eligible Norwegian Cruise Line cruise fares",
          percentOff: 50,
          rawText: "50% off all cruises, subject to the promotion terms and eligible rate.",
        },
      ],
      dollarSavings: [],
      onboardCredits: [],
      freeGuestOffers: [
        {
          guestNumbers: "Select sailings: third and fourth guests",
          rawText: "Select sailing dates may offer third and fourth guests free or at a reduced child rate.",
        },
      ],
      combinability: {
        rawRules: [
          "Prepaid gratuities are not combinable with FITOBC.",
          "Military and teacher programs are capacity controlled and have separate combinability rules.",
        ],
      },
      exclusions: [
        "Bonus onboard credit is limited to select sailings and qualifying cabin categories.",
        "Third and fourth guest offers are limited to select sailing dates.",
      ],
      applicableProducts: [
        "Norwegian Cruise Line sailings of three days or longer",
        "Reduced deposit applies to balcony cabins and below",
      ],
      applicableMarkets: ["US"],
    },
    marketingUse: {
      publicClaimsAllowed: [
        "Norwegian Cruise Line's Semi-Annual Sale is available for eligible new bookings through August 18, 2026.",
      ],
      publicClaimsNeedsQualifier: [
        "Save 50% on eligible NCL cruise fares, subject to current promotion and rate terms.",
        "Reduced deposit is available on eligible balcony-and-below bookings.",
        "Bonus onboard credit and third/fourth guest offers apply only to select sailings and qualifying bookings.",
      ],
      agentOnlyNotes: [
        "Verify the selected rate at booking.",
        "Prepaid gratuities are not combinable with FITOBC.",
        "Do not advertise the July 31-August 3 onboard-credit window before it begins or without rate-level confirmation.",
      ],
      suggestedAngles: [
        "Make New Year's Eve the first night of a seven-night Caribbean vacation.",
        "Pair an exact December 31 departure with the time-limited NCL Semi-Annual Sale.",
      ],
      cautionFlags: [
        "All prices and availability can change until booked.",
        "Do not promise onboard credit or free extra guests for this package without rate-level confirmation.",
      ],
      bestMatchedDealBriefs: [buildDealBriefId(PACKAGE_ID, ANGLE_TITLE)],
      visitorFriendlySummary:
        "Sail on New Year's Eve and check current NCL Semi-Annual Sale pricing on this exact seven-night Caribbean voyage.",
    },
    diagnostics: {
      status: "needs_review",
      model: "manual_source_bounded_extraction",
      notes: [
        "Structured from the fresh 2026-07-30 CB Agent Tools capture after the general extraction command timed out.",
      ],
      warnings: [
        "Rate-level eligibility remains an operator check before final booking.",
      ],
    },
  };
}

async function main(): Promise<void> {
  const promo = loadFreshNclPromo();
  await upsertPromoRecordEntry(promo);

  const lookup = await callRoute(lookupPackage, "lookup-package", { packageId: PACKAGE_ID });
  const facts = lookup.cruiseFacts;
  if (!facts) throw new Error(`Exact package ${PACKAGE_ID} returned no cruise facts.`);
  if (facts.packageId !== PACKAGE_ID) throw new Error(`Expected ${PACKAGE_ID}, received ${facts.packageId}.`);
  if (facts.sailDateIso !== "2026-12-31") {
    throw new Error(`Package ${PACKAGE_ID} sail date changed to ${facts.sailDateIso}.`);
  }
  if (facts.shipName !== "Norwegian Getaway") {
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
        "NCL Semi-Annual Sale",
        "50% off eligible cruise fares",
        "reduced deposit on eligible balcony-and-below bookings",
      ],
    },
  });

  const linkVerified = await callRoute(updateCuratedDeal, "curated-deal", {
    action: "set_link_valid",
    dealId: PACKAGE_ID,
    decisionNote: "Exact package page loaded successfully during the 2026-07-30 Odysseus capture.",
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

  const copy = await callRoute(runCopywriter, "copywriter", {
    action: "write",
    manifestId,
    variantCount: 3,
  });
  if (!copy.adCopy) throw new Error("Copywriter returned no ad-copy artifact.");

  await callRoute(runCopywriter, "copywriter", {
    action: "select",
    adCopyId: copy.adCopy.id,
    variantIndex: 0,
  });

  const funnel = await callRoute(runFunnelSynthesis, "funnel-synthesis", {
    action: "synthesize",
    adCopyId: copy.adCopy.id,
    variantIndex: 0,
    sourceImages: true,
  });
  if (!funnel.synthesis) throw new Error("Funnel synthesis returned no artifact.");

  await callRoute(assembleForPublication, "publish", {
    action: "publish",
    manifestId,
    adCopyId: copy.adCopy.id,
  });
  const publicationReview = await callRoute(assembleForPublication, "publish", {
    action: "set_link_valid",
    dealId: PACKAGE_ID,
  });

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
        nextUrl: handoff.nextUrl,
        handoffAssessment: handoff.handoffAssessment,
        adCopyId: copy.adCopy.id,
        selectedVariantIndex: 0,
        funnelSynthesisId: funnel.synthesis.id,
        imageCandidateCount: funnel.synthesis.candidates?.length ?? 0,
        publicationReviewStatus: publicationReview.deal?.status,
        publicationApprovalStatus: publicationReview.deal?.operatorApproval?.status,
        cabinPricing: facts.cabinPricing,
        variants: copy.adCopy.variants,
        unresolved: [
          "Operator approval is still required before publication.",
          "Rate-level promo eligibility and live price must be rechecked at booking.",
          "Sourced image candidates still require operator selection and ship-identity review.",
          "Media generation has not been run or waived.",
        ],
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
