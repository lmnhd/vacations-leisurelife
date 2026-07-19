import fs from "node:fs/promises";

import { POST as lookupPackage } from "../../app/api/tests/deals-system/lookup-package/route";
import { POST as updateCuratedDeal } from "../../app/api/tests/deals-system/curated-deal/route";
import { POST as updatePublishedDeal } from "../../app/api/tests/deals-system/publish/route";
import { DEALS_CACHE_PATHS } from "../../lib/cb/deals-system/caches";
import { upsertPromoRecordEntry } from "../../lib/cb/deals-system/deals-dynamo-store";
import { buildDealBriefId, buildTripManifestId } from "../../lib/cb/deals-system/deal-ids";
import type { DealItineraryDay } from "../../lib/cb/deals-system/deal-trip-manifest-types";
import { validatePromoIntelligenceCache } from "../../lib/cb/deals-system/validate";

const PACKAGE_ID = "1553111";
const PROMO_RECORD_ID = "cbpromo-2907";
const ANGLE_TITLE =
  "The Last Ten Nights of Summer - An Overnight in Stockholm and Bonus Onboard Credit on Select Bookings";
const OFFER_END_DATE = "2026-08-03";
const SIID = process.env.CB_AGENT_SIID ?? "1049337";

const TARGET_AUDIENCE =
  "US friend groups of two to four cabins and experience-driven couples who prioritize itinerary depth and respond to qualified onboard-credit value.";

const VISUAL_ANGLE =
  "MSC Magnifica in late-summer light, a Copenhagen-to-Stockholm route map, a clear Stockholm overnight marker, and warm Northern Europe city imagery without implying specific excursions or weather.";

const TARGETING_KEYWORDS = [
  "Stockholm overnight cruise",
  "MSC Cruises onboard credit",
  "Baltic cruise with overnight port",
  "September Northern Europe cruise",
  "MSC Magnifica 2026",
  "Copenhagen cruise September",
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
    expiresOnIso?: string;
    promoApplicability?: Array<{ promoRecordId: string; status: string }>;
    operatorApproval?: { status?: string };
  };
  manifestId?: string;
  nextUrl?: string;
  handoffAssessment?: {
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

async function syncSelectedPromotion(): Promise<void> {
  const raw = await fs.readFile(DEALS_CACHE_PATHS.promoIntelligence, "utf8");
  const validated = validatePromoIntelligenceCache(JSON.parse(raw) as unknown);
  if (!validated.ok || !validated.value) {
    throw new Error(`Promotion intelligence cache is invalid: ${validated.errors.join("; ")}`);
  }
  const record = validated.value.records.find((candidate) => candidate.id === PROMO_RECORD_ID);
  if (!record) {
    throw new Error(`Promotion ${PROMO_RECORD_ID} is absent from the refreshed intelligence cache.`);
  }
  await upsertPromoRecordEntry(record);
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
  if (facts.sailDateIso !== "2026-09-12") {
    throw new Error(`Package ${PACKAGE_ID} sail date changed to ${facts.sailDateIso}.`);
  }
  if (!facts.dayByDayItinerary || facts.dayByDayItinerary.length === 0) {
    throw new Error(`Package ${PACKAGE_ID} returned no day-by-day itinerary.`);
  }
  if (!facts.cabinPricing) {
    throw new Error(`Package ${PACKAGE_ID} returned no cabin pricing.`);
  }

  const briefId = buildDealBriefId(PACKAGE_ID, ANGLE_TITLE);
  const manifestId = buildTripManifestId(PACKAGE_ID, ANGLE_TITLE);
  const portsOfCall = orderedPortNames(facts.dayByDayItinerary);

  await syncSelectedPromotion();

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
    promoRecordIds: [PROMO_RECORD_ID],
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
        "Select MSC Cruises sailings booked by August 3 may qualify for bonus savings and up to $500 in shipboard credit.",
      ],
    },
  });

  await callRoute(updatePublishedDeal, "publish", {
    action: "set_expiration",
    dealId: PACKAGE_ID,
    expiresOnIso: OFFER_END_DATE,
  });

  const handoff = await callRoute(updateCuratedDeal, "curated-deal", {
    action: "send_to_pipeline",
    dealId: PACKAGE_ID,
    promoRecordIds: [PROMO_RECORD_ID],
    campaignAngle: ANGLE_TITLE,
    targetAudience: TARGET_AUDIENCE,
    visualAngle: VISUAL_ANGLE,
    targetingKeywords: TARGETING_KEYWORDS,
  });
  if (handoff.manifestId !== manifestId) {
    throw new Error(`Expected manifest ${manifestId}, received ${handoff.manifestId ?? "none"}.`);
  }

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
        promotion: PROMO_RECORD_ID,
        expiresOnIso: OFFER_END_DATE,
        nextUrl: handoff.nextUrl,
        handoffWarnings: handoff.handoffAssessment?.warnings ?? [],
        unresolved: [
          "Confirm the exact promotion value against the selected live rate before public copy or approval.",
          "Confirm promo market eligibility before public copy or approval.",
          "Constructed booking link is not yet browser-validated.",
          "No ad copy has been generated or selected.",
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
