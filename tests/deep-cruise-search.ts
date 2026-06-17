/**
 * Deep Cruise Search & Select proof artifact (Deal Workflow Step 1A).
 *
 * Asserts the PURE, deterministic deal-quality scorer + selector (no browser/AI):
 *   1. scoreSailing pulls real facts (package id, line, ports, lead fare) from a
 *      CruiseResult and never invents them.
 *   2. A distinctive, well-priced ocean crossing outscores a generic short hop.
 *   3. Per-signal points are bounded and qualityScore is normalized 0..1.
 *   4. A sailing with no usable package id is dropped (not scored).
 *   5. Promo overlap lifts a sailing whose line + sail window a live promo covers.
 *   6. selectDealsFromSweep de-dups by packageId and returns the top-N best-first.
 *
 * Run:
 *   npm run test:deep-cruise-search
 */

import {
  scoreSailing,
  selectDealsFromSweep,
  type RawSailing,
} from "../lib/cb/deals-system/deep-cruise-search";
import type { CbPromoIntelligenceRecord } from "../lib/cb/deals-system/promo-intelligence-types";
import type { CruiseResult } from "../lib/services/odysseus/types";

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail?: string): void {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.error(`  FAIL  ${name}${detail ? ` - ${detail}` : ""}`);
  }
}

/** Build a real-shaped CruiseResult fixture. */
function sailing(opts: {
  packageId?: number;
  code: string;
  name: string;
  cruiseLineId: number;
  shipId?: number;
  startIso: string; // YYYY-MM-DD
  nights: number;
  depCode: string;
  arrCode: string;
  ports: string;
  leadFare?: number;
}): CruiseResult {
  const prices =
    opts.leadFare !== undefined
      ? [
          {
            items: [
              { name: "Interior", code: "INSIDE", value: opts.leadFare },
              { name: "Balcony", code: "BALCONY", value: opts.leadFare * 1.6 },
            ],
            currencyCode: "USD",
          },
        ]
      : [];
  return {
    code: opts.code,
    name: opts.name,
    uniqueItineraryId: opts.code,
    prices,
    ship: { id: opts.shipId ?? 100, cruiseline: { id: opts.cruiseLineId } },
    itinerary: {
      id: 1,
      duration: opts.nights,
      departure: { code: opts.depCode, type: "port" },
      arrival: { code: opts.arrCode, type: "port" },
      portsOfCalls: opts.ports,
      normalizedPortsOfCall: opts.ports,
    },
    packages:
      opts.packageId === undefined
        ? []
        : [
            {
              id: opts.packageId,
              startDateTime: `${opts.startIso}T00:00:00`,
              endDateTime: `${opts.startIso}T00:00:00`,
              prices,
              voyageId: opts.code,
              maxOccupancy: 4,
              minOccupancy: 1,
              cruiseDuration: opts.nights,
            },
          ],
  } as CruiseResult;
}

function promo(id: string, vendor: string, startsOn: string, endsOn: string): CbPromoIntelligenceRecord {
  return {
    id,
    source: "cb_agent_tools_todays_view",
    sourceUrl: "https://www.cbagenttools.com/marketing/todaysview/",
    detailUrl: `https://www.cbagenttools.com/marketing/promotion/${id}`,
    capturedAtIso: "2026-06-10T00:00:00.000Z",
    title: `${vendor} sale`,
    vendor,
    bookingWindow: { rawText: "Now" },
    sailingWindow: { startsOn, endsOn, rawText: `${startsOn}..${endsOn}` },
    promotionDetailsRaw: "",
    agentInstructionsRaw: "",
    keyFeaturesRaw: "",
    applicableSailingsRaw: "",
    applicableProductsRaw: "",
    applicableMarketsRaw: "",
    supportingFiles: [],
    extracted: {
      offerTypes: ["onboard_credit"],
      percentDiscounts: [],
      dollarSavings: [],
      onboardCredits: [],
      freeGuestOffers: [],
      combinability: { rawRules: [] },
      exclusions: [],
      applicableProducts: [],
      applicableMarkets: [],
    },
    marketingUse: {
      publicClaimsAllowed: [],
      publicClaimsNeedsQualifier: [],
      agentOnlyNotes: [],
      suggestedAngles: [],
      cautionFlags: [],
      bestMatchedDealBriefs: [],
      visitorFriendlySummary: "",
    },
    diagnostics: { status: "succeeded", notes: [], warnings: [] },
  };
}

function main(): void {
  console.log("Deep Cruise Search & Select - deal-quality scoring + selection\n");

  // An excellent, distinctive, well-priced transatlantic crossing.
  const crossing = sailing({
    packageId: 1500001,
    code: "EDGE-TA-14",
    name: "Celebrity Edge Transatlantic Crossing",
    cruiseLineId: 2, // Celebrity (verified Odysseus vendor id)
    startIso: "2026-11-08",
    nights: 14,
    depCode: "FLL",
    arrCode: "BCN",
    ports: "Ponta Delgada, Funchal",
    leadFare: 1200, // ~$86/night
  });

  // A generic, port-dense, pricier short Bahamas hop.
  const hop = sailing({
    packageId: 1500002,
    code: "INDY-BAH-4",
    name: "Independence of the Seas 4-Night Bahamas",
    cruiseLineId: 8, // Royal Caribbean
    startIso: "2026-12-20",
    nights: 4,
    depCode: "MIA",
    arrCode: "MIA",
    ports: "Nassau, CocoCay, Freeport, Bimini",
    leadFare: 900, // ~$225/night
  });

  // --- Fact extraction -------------------------------------------------------
  console.log("Fact extraction:");
  const crossingDeal = scoreSailing({ result: crossing }, []);
  check("scores the crossing into a SelectedDeal", crossingDeal !== undefined);
  if (crossingDeal) {
    check("carries the real package id", crossingDeal.packageId === "1500001");
    check("resolves the cruise line from the vendor id", crossingDeal.cruiseLine === "Celebrity");
    check("carries the real sail date", crossingDeal.sailDateIso === "2026-11-08");
    check("carries the real nights", crossingDeal.nights === 14);
    check("computes a lead fare from prices", crossingDeal.leadFare === 1200);
    check("carries ports of call", (crossingDeal.portsOfCall ?? "").includes("Funchal"));
  }

  // --- Relative ranking ------------------------------------------------------
  console.log("\nRelative deal quality:");
  const hopDeal = scoreSailing({ result: hop }, []);
  check("scores the hop too", hopDeal !== undefined);
  if (crossingDeal && hopDeal) {
    check(
      "distinctive well-priced crossing outscores the generic short hop",
      crossingDeal.qualityScore > hopDeal.qualityScore,
      `crossing ${crossingDeal.qualityScore.toFixed(2)} vs hop ${hopDeal.qualityScore.toFixed(2)}`
    );
    check(
      "crossing earns distinctiveness points",
      crossingDeal.qualitySignals.some((s) => s.signal === "itinerary_distinctiveness" && s.points > 0)
    );
    check(
      "crossing earns sea-day density points (few ports over 14n)",
      crossingDeal.qualitySignals.some((s) => s.signal === "sea_day_density" && s.points > 0)
    );
  }

  // --- Bounds ----------------------------------------------------------------
  console.log("\nScore bounds:");
  if (crossingDeal) {
    check("qualityScore is within 0..1", crossingDeal.qualityScore >= 0 && crossingDeal.qualityScore <= 1);
    check("every signal contributes non-negative points", crossingDeal.qualitySignals.every((s) => s.points >= 0));
  }

  // --- No package id is dropped ---------------------------------------------
  console.log("\nNo-package guard:");
  const noPkg = sailing({
    code: "GHOST",
    name: "Ghost sailing with no package",
    cruiseLineId: 1,
    startIso: "2026-09-01",
    nights: 7,
    depCode: "MIA",
    arrCode: "MIA",
    ports: "Nowhere",
  });
  check("a sailing with no package id is not scored", scoreSailing({ result: noPkg }, []) === undefined);

  // --- Promo overlap lifts the score ----------------------------------------
  console.log("\nPromo overlap:");
  const celebrityPromo = promo("cbpromo-celebrity", "Celebrity", "2026-10-01", "2026-12-31");
  const withPromo = scoreSailing({ result: crossing }, [celebrityPromo]);
  check("promo overlap is detected for the matching line + window", (withPromo?.applicablePromoIds ?? []).includes("cbpromo-celebrity"));
  if (crossingDeal && withPromo) {
    check("promo overlap raises the quality score", withPromo.qualityScore > crossingDeal.qualityScore);
  }
  const offVendorPromo = promo("cbpromo-carnival", "Carnival", "2026-10-01", "2026-12-31");
  const noOverlap = scoreSailing({ result: crossing }, [offVendorPromo]);
  check("an off-vendor promo does not overlap", (noOverlap?.applicablePromoIds ?? []).length === 0);

  // --- Selection + de-dup ----------------------------------------------------
  console.log("\nSelection + de-dup:");
  const dupCrossingLowerScore: RawSailing = {
    // Same packageId as crossing, but priced worse — the de-dup must keep the better one.
    result: sailing({
      packageId: 1500001,
      code: "EDGE-TA-14",
      name: "Celebrity Edge Transatlantic Crossing",
      cruiseLineId: 2,
      startIso: "2026-11-08",
      nights: 14,
      depCode: "FLL",
      arrCode: "BCN",
      ports: "Ponta Delgada, Funchal",
      leadFare: 4000, // ~$285/night — much worse value
    }),
  };
  const sweep: RawSailing[] = [{ result: crossing }, { result: hop }, dupCrossingLowerScore, { result: noPkg }];
  const selection = selectDealsFromSweep(sweep, { selectCount: 5 });
  check("de-dups to 2 unique deals (crossing + hop)", selection.ranked.length === 2, `got ${selection.ranked.length}`);
  check("keeps the higher-scored instance of the duplicate", selection.ranked[0].leadFare === 1200);
  check("ranks best-first (crossing on top)", selection.ranked[0].packageId === "1500001");
  check("respects selectCount", selectDealsFromSweep(sweep, { selectCount: 1 }).selected.length === 1);

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
