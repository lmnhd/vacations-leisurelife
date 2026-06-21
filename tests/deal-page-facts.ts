/**
 * Deal Page Facts proof artifact: the complete, public-safe cruise facts the hosted
 * page needs so a guest can buy without leaving.
 *
 * Asserts:
 *   1. extractCabinPricing maps an Odysseus price set → cabin tiers + lead fare.
 *   2. assembleDealPageFacts(resolved) surfaces real ship/date/itinerary/pricing.
 *   3. assembleDealPageFacts(draft) flags unresolved + falls back to the manifest.
 *   4. Promos reduce to PUBLIC-SAFE fields (summary, publicClaims, perks) — agent-only
 *      notes never cross over.
 *   5. A not_applicable promo is excluded; an unmatched promo id is noted.
 *
 * Run:  npm run test:deal-page-facts
 */

import { extractCabinPricing } from "../lib/cb/link-broker/package-lookup";
import type { CruiseResult } from "../lib/services/odysseus/types";
import {
  assembleDealPageFacts,
  type CbPromoIntelligenceRecord,
  type DealTripManifest,
} from "../lib/cb/deals-system";

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.error(`  FAIL  ${name}${detail ? ` - ${detail}` : ""}`);
  }
}

const GEN_AT = "2026-06-11T00:00:00.000Z";

// ── extractCabinPricing ─────────────────────────────────────────────────────────
const result = {
  code: "X1",
  name: "Edge — Transatlantic",
  itinerary: {
    id: 1,
    duration: 14,
    departure: { code: "FLL", type: "port" },
    arrival: { code: "LIS", type: "port" },
    portsOfCalls: "Fort Lauderdale, Ponta Delgada, Funchal, Lisbon",
    normalizedPortsOfCall: "Fort Lauderdale, Ponta Delgada, Funchal, Lisbon",
    mapPath: "/maps/x1.png",
  },
  uniqueItineraryId: "u1",
  prices: [
    {
      currencyCode: "USD",
      items: [
        { name: "Inside Stateroom", code: "IN", value: 339 },
        { name: "Ocean View", code: "OV", value: 388 },
        { name: "Balcony Veranda", code: "BL", value: 494 },
        { name: "Suite", code: "ST", value: 677 },
      ],
    },
  ],
  ship: { id: 42 },
  packages: [],
} as unknown as CruiseResult;

console.log("extractCabinPricing:");
const pricing = extractCabinPricing(result);
check("pricing extracted", Boolean(pricing));
check("inside fare", pricing?.inside === 339);
check("outside (ocean view) fare", pricing?.outside === 388);
check("balcony (veranda) fare", pricing?.balcony === 494);
check("suite fare", pricing?.suite === 677);
check("lead fare is the lowest tier", pricing?.leadFare === 339);
check("currency carried", pricing?.currencyCode === "USD");

// ── promo record (rich) ─────────────────────────────────────────────────────────
const promo: CbPromoIntelligenceRecord = {
  id: "cbpromo-2837",
  source: "cb_agent_tools_todays_view",
  sourceUrl: "https://www.cbagenttools.com/marketing/todaysview/",
  detailUrl: "https://www.cbagenttools.com/x",
  capturedAtIso: GEN_AT,
  title: "Celebrity Summer Sale",
  vendor: "Celebrity Cruises",
  bookingWindow: { startsOn: "2026-06-02", endsOn: "2026-07-27", rawText: "Jun 2 – Jul 27, 2026" },
  sailingWindow: { rawText: "through May 10, 2028" },
  promotionDetailsRaw: "…",
  agentInstructionsRaw: "AGENT ONLY: do not show clients the net rate.",
  keyFeaturesRaw: "…",
  applicableSailingsRaw: "…",
  applicableProductsRaw: "…",
  applicableMarketsRaw: "…",
  supportingFiles: [],
  extracted: {
    offerTypes: [],
    percentDiscounts: [{ appliesTo: "2nd guest", percentOff: 75, rawText: "75% off 2nd guest" }],
    dollarSavings: [{ amountUsd: 200, appliesTo: "stateroom", rawText: "$200 off" }],
    onboardCredits: [{ amountUsd: 150, appliesTo: "balcony+", rawText: "$150 OBC" }],
    freeGuestOffers: [],
    combinability: { rawRules: [] },
    exclusions: [],
    applicableProducts: [],
    applicableMarkets: [],
  },
  marketingUse: {
    publicClaimsAllowed: ["Bonus onboard credit on select sailings."],
    publicClaimsNeedsQualifier: ["Up to 75% off your second guest*"],
    agentOnlyNotes: ["Net rate is X — never disclose."],
    suggestedAngles: [],
    cautionFlags: [],
    bestMatchedDealBriefs: [],
    visitorFriendlySummary: "Save with bonus onboard credit and second-guest savings.",
  },
  diagnostics: { status: "succeeded", notes: [], warnings: [] },
};

function baseManifest(): DealTripManifest {
  return {
    id: "manifest-x",
    generatedAtIso: GEN_AT,
    generator: "gpt",
    sourceAngleId: "angle-x",
    isolatedNiche: "Niche",
    sailingAngleTitle: "Title",
    assembleDraft: {
      suggestedDealId: "d1",
      suggestedBriefId: "b1",
      cruiseLine: "Celebrity Cruises",
      shipClassHint: "Edge class",
      itineraryName: "Transatlantic Westbound",
      destination: "Transatlantic",
      nights: 14,
      sailWindow: { earliestIso: "2026-11-01", latestIso: "2027-01-31", rationale: "late autumn" },
      departurePortHint: "Fort Lauderdale",
      portsOfCall: ["Ponta Delgada", "Funchal", "Lisbon"],
    },
    appliedPromos: [
      { promoRecordId: "cbpromo-2837", status: "likely_applicable", matchedOn: ["vendor"], assumptions: [], warnings: [] },
      { promoRecordId: "cbpromo-dead", status: "not_applicable", matchedOn: [], assumptions: [], warnings: [] },
    ],
    promoStrategy: "OBC framed as a fund.",
    manifestReasoning: "fits",
    lookupQuery: { line: "Celebrity", destination: "Transatlantic", windowDays: 60 },
  };
}

console.log("\nassembleDealPageFacts (draft / unresolved):");
const draft = assembleDealPageFacts(baseManifest(), [promo]);
check("readiness is draft", draft.readiness === "draft");
check("ship falls back to class hint (no real ship yet)", draft.shipName === undefined && draft.shipClassHint === "Edge class");
check("draft uses the sail window", Boolean(draft.sailWindow?.earliestIso) && draft.sailDateIso === undefined);
check("draft ports come from the manifest", draft.portsOfCall.join(",") === "Ponta Delgada,Funchal,Lisbon");
check("no fabricated pricing in draft", draft.cabinPricing === undefined);
check("draft notes flag unresolved", draft.notes.some((n) => /Resolve|resolved/i.test(n)));

console.log("\nPromo reduction (public-safe):");
check("not_applicable promo is excluded", draft.promos.length === 1);
const dp = draft.promos[0];
check("promo title carried", dp.title === "Celebrity Summer Sale");
check("visitor-friendly summary carried", dp.summary.length > 0);
check("public claims carried", dp.publicClaims.length === 1);
check("qualified claims kept separate", dp.qualifiedClaims.length === 1);
check("perks structured", dp.perks.percentOff[0] === 75 && dp.perks.onboardCreditUsd[0] === 150);
check("booking window carried", dp.bookingWindow?.endsOn === "2026-07-27");
const serialized = JSON.stringify(draft);
check("agent-only notes NEVER cross into page facts", !serialized.includes("never disclose") && !serialized.includes("AGENT ONLY"));

console.log("\nassembleDealPageFacts (resolved):");
const m = baseManifest();
m.resolvedPackage = {
  resolvedAtIso: GEN_AT,
  source: "operator_package_lookup",
  packageId: "pkg-9",
  cruiseName: "Celebrity Edge",
  cruiseLine: "Celebrity Cruises",
  shipName: "Celebrity Edge",
  sailDateIso: "2026-11-15",
  nights: 14,
  departurePortCode: "FLL",
  confidence: 0.9,
  reasons: ["exact sail date"],
  siid: "siid-1",
  bookingUrl: "https://bookings.example/pkg-9",
  cabinPricing: { inside: 339, outside: 388, balcony: 494, suite: 677, currencyCode: "USD", leadFare: 339 },
  itinerary: {
    durationNights: 14,
    departurePortCode: "FLL",
    arrivalPortCode: "LIS",
    portsOfCall: "Fort Lauderdale, Ponta Delgada, Funchal, Lisbon",
    normalizedPortsOfCall: "Fort Lauderdale, Ponta Delgada, Funchal, Lisbon",
    mapPath: "/maps/x1.png",
  },
  lookupDiagnostics: [],
};
const resolved = assembleDealPageFacts(m, [promo]);
check("readiness is resolved", resolved.readiness === "resolved");
check("real ship name surfaced", resolved.shipName === "Celebrity Edge");
check("confirmed sail date surfaced", resolved.sailDateIso === "2026-11-15");
check("real cabin pricing surfaced", resolved.cabinPricing?.leadFare === 339);
check("itinerary surfaced with map", resolved.itinerary?.mapPath === "/maps/x1.png");
check("ports come from resolved itinerary", resolved.portsOfCall[0] === "Fort Lauderdale");
check("booking url carried", resolved.bookingUrl === "https://bookings.example/pkg-9");

console.log("\nassembleDealPageFacts (known ship correction):");
const seabournManifest = baseManifest();
seabournManifest.resolvedPackage = {
  resolvedAtIso: GEN_AT,
  source: "operator_package_lookup",
  packageId: "1582993",
  cruiseName: "35-Day World Cruise: Panama Canal Crossing & Polynesia",
  cruiseLine: "Seabourn",
  shipName: "35-Day World Cruise: Panama Canal Crossing & Polynesia",
  sailDateIso: "2027-01-05",
  nights: 35,
  departurePortCode: "MIA",
  confidence: 0.83,
  reasons: ["verified package"],
  siid: "1049337",
  bookingUrl: "https://bookings.example/1582993",
  cabinPricing: { outside: 18523, balcony: 23353, suite: 45023, currencyCode: "USD", leadFare: 18523 },
  lookupDiagnostics: [],
};
const seabournFacts = assembleDealPageFacts(seabournManifest, [promo]);
check("known package corrects ship from itinerary title", seabournFacts.shipName === "Seabourn Quest", seabournFacts.shipName);
check("known package corrects cruise line display", seabournFacts.cruiseLine === "Seabourn Cruise Line", seabournFacts.cruiseLine);

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
