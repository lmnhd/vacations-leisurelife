import { POST as lookupPackage } from "../../app/api/tests/deals-system/lookup-package/route";
import { POST as updateCuratedDeal } from "../../app/api/tests/deals-system/curated-deal/route";
import { POST as runCopywriter } from "../../app/api/tests/deals-system/copywriter/route";
import { buildDealBriefId, buildTripManifestId } from "../../lib/cb/deals-system/deal-ids";
import type { DealItineraryDay } from "../../lib/cb/deals-system/deal-trip-manifest-types";

const PACKAGE_ID = "1640418";
const ANGLE_TITLE = "Your 8-Night January Reset";
const SIID = process.env.CB_AGENT_SIID ?? "1049337";

// Operator-confirmed from the CB booking category-selection screen on
// 2026-07-16. The package summary exposes no numeric pricing, so retain these
// as the fallback until a later reviewed pricing correction replaces them.
const OPERATOR_CONFIRMED_CABIN_PRICING = {
  inside: 1112,
  outside: 1192,
  balcony: 1272,
  suite: 3760,
  currencyCode: "USD",
  leadFare: 1112,
};

const TARGET_AUDIENCE =
  "US adults and couples seeking an adults-only winter escape from Miami with a longer Caribbean itinerary and clear trip details before booking.";

const VISUAL_ANGLE =
  "A cold gray winter morning transitioning into Resilient Lady, a clean Western Caribbean route map, grown-up dining, open-deck relaxation, and bright destination moments without weather guarantees.";

const TARGETING_KEYWORDS = [
  "adults-only Caribbean cruise",
  "January 2027 cruise from Miami",
  "winter cruise for couples",
  "Virgin Voyages",
  "Resilient Lady",
  "eight-night Caribbean cruise",
  "Western Caribbean cruise",
  "Bimini cruise",
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
  deal?: { id?: string; status?: string; operatorApproval?: { status?: string } };
  manifestId?: string;
  nextUrl?: string;
  adCopy?: {
    id: string;
    variants: Array<{
      variantLabel: string;
      headline: string;
      bodyCopy: string;
      callToAction: string;
    }>;
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

async function main(): Promise<void> {
  const lookup = await callRoute(lookupPackage, "lookup-package", {
    packageId: PACKAGE_ID,
  });
  const facts = lookup.cruiseFacts;
  if (!facts) throw new Error(`Exact package ${PACKAGE_ID} returned no cruise facts.`);
  if (facts.packageId !== PACKAGE_ID) {
    throw new Error(`Expected package ${PACKAGE_ID}, received ${facts.packageId}.`);
  }
  if (facts.sailDateIso !== "2027-01-16") {
    throw new Error(`Package ${PACKAGE_ID} sail date changed to ${facts.sailDateIso}.`);
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
    campaignAngle: ANGLE_TITLE,
    targetAudience: TARGET_AUDIENCE,
    visualAngle: VISUAL_ANGLE,
    targetingKeywords: TARGETING_KEYWORDS,
    promoRecordIds: [],
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
      cabinPrices: facts.cabinPricing ?? OPERATOR_CONFIRMED_CABIN_PRICING,
      promoSignals: [],
    },
  });

  const handoff = await callRoute(updateCuratedDeal, "curated-deal", {
    action: "send_to_pipeline",
    dealId: PACKAGE_ID,
    promoRecordIds: [],
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

  console.log(
    JSON.stringify(
      {
        lane: "Deal",
        dealId: assembled.deal?.id,
        dealStatus: assembled.deal?.status,
        approvalStatus: assembled.deal?.operatorApproval?.status,
        packageId: PACKAGE_ID,
        briefId,
        manifestId,
        nextUrl: handoff.nextUrl,
        adCopyId: copy.adCopy.id,
        variants: copy.adCopy.variants,
        unresolved: [
          "Cabin-tier pricing uses the operator-confirmed CB booking category-selection capture from 2026-07-16 because the package summary returned no numeric fares.",
          "Constructed booking link is not yet validated.",
          "No Virgin Voyages promotion was present in the fresh CB promo cache.",
          "No ad-copy variant has been selected.",
        ],
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
