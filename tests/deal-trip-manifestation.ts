/**
 * Deal Trip Manifestation proof artifact: angle + promo intelligence → manifest.
 *
 * Asserts:
 *   1. generateDealTripManifest produces a manifest with generator "gpt" + aiTrace.
 *   2. assembleDraft never carries packageId/shipName/siid/bookingUrl (no fabrication).
 *   3. appliedPromos only reference prefiltered input ids; a hallucinated id is dropped.
 *   4. The deterministic prefilter drops a clearly non-matching vendor.
 *   5. A lookupQuery is produced for the operator package lookup.
 *   6. The manifest cache validator accepts the output (and rejects a fabricated field).
 *
 * Run:
 *   npm run test:trip-manifestation
 */

import {
  emptyDealTripManifestsCache,
  generateDealTripManifest,
  prefilterPromoRecords,
  upsertDealTripManifest,
  validateDealTripManifestsCache,
  type CbPromoIntelligenceRecord,
  type DealDiscoveryIdea,
} from "../lib/cb/deals-system";
import { reconcileAssembleDraftWithResolved } from "../lib/cb/deals-system/deal-package-resolver";
import { selectBestFitCandidate } from "../lib/cb/deals-system/deal-trip-manifest-generator";
import { installDealsAiStub } from "./deals-ai-stub";

installDealsAiStub();

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

const GEN_AT = "2026-06-10T00:00:00.000Z";

const angle: DealDiscoveryIdea = {
  id: "angle-prints-of-changing-latitudes",
  generatedAtIso: GEN_AT,
  generator: "gpt",
  sourceResearchCachedAt: "2026-06-10",
  isolatedNiche: "The Cyanotype Botanical Alchemist",
  sailingAngleProfile: {
    sailingAngleTitle: "Prints of Changing Latitudes",
    theCorePitch: "Shifting latitude alters your UV exposure daily while each port delivers fresh botanicals.",
    visualAnchor: "Hands unclipping a plexiglass frame on a sun-drenched deck.",
    targetAudienceDescriptor: "Solo creators and artistic couples who practice alternative photography.",
    relevantKeywords: ["cyanotype printing", "sun printing", "botanical art"],
    destinationAndTimeOfYearHints:
      "Tropical or high-sun regions (Caribbean) during high-UV seasons (late spring through early autumn 2026).",
    onboardAssetRequirements: "Expansive open-air top decks, ocean-facing balconies, fresh-water rinsing stations.",
  },
  groundedCandidate: {
    resolvedAtIso: GEN_AT,
    packageId: "1500001",
    cruiseName: "Wonder of the Seas 7-Night Caribbean",
    cruiseLine: "Royal Caribbean",
    sailDateIso: "2026-07-04",
    nights: 7,
    departurePortCode: "MIA",
    portsOfCall: "Nassau, Cozumel",
    confidence: 0.92,
    reasons: ["date match", "line match"],
  },
};

function promo(id: string, vendor: string, sailing: { startsOn?: string; endsOn?: string; rawText: string }): CbPromoIntelligenceRecord {
  return {
    id,
    source: "cb_agent_tools_todays_view",
    sourceUrl: "https://www.cbagenttools.com/marketing/todaysview/",
    detailUrl: `https://www.cbagenttools.com/marketing/promotion/${id}`,
    capturedAtIso: GEN_AT,
    title: `${vendor} sale`,
    vendor,
    bookingWindow: { rawText: "Now" },
    sailingWindow: sailing,
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
      publicClaimsAllowed: ["Onboard credit on select cabins"],
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

// One matching RCL promo (in window), one off-vendor promo that prefilter should drop.
const promoRecords: CbPromoIntelligenceRecord[] = [
  promo("cbpromo-test", "Royal Caribbean", { startsOn: "2026-05-01", endsOn: "2026-09-30", rawText: "Summer 2026" }),
  promo("cbpromo-carnival", "Carnival", { startsOn: "2026-05-01", endsOn: "2026-09-30", rawText: "Summer 2026" }),
];

async function main(): Promise<void> {
  console.log("Deal Trip Manifestation - angle + promo intelligence → manifest\n");

  // --- Prefilter (deterministic) ---------------------------------------------
  console.log("Promo prefilter:");
  const pf = prefilterPromoRecords(promoRecords, { cruiseLine: "Royal Caribbean" });
  check("prefilter keeps the matching RCL promo", pf.kept.some((r) => r.id === "cbpromo-test"));
  check("prefilter drops the off-vendor promo", pf.dropped.some((d) => d.id === "cbpromo-carnival"));

  // --- Manifest generation ---------------------------------------------------
  console.log("\nManifest generation:");
  const { manifest, prefilter, rejectedPromoIds } = await generateDealTripManifest({
    angle,
    promoRecords,
    generatedAtIso: GEN_AT,
  });

  check("manifest generator is gpt", manifest.generator === "gpt");
  check("manifest has aiTrace", Boolean(manifest.aiTrace && manifest.aiTrace.model.length > 0));
  check("manifest carries the source angle id", manifest.sourceAngleId === angle.id);
  check("assembleDraft has a cruise line", manifest.assembleDraft.cruiseLine.length > 0);
  check("assembleDraft has a sail window rationale", manifest.assembleDraft.sailWindow.rationale.length > 0);

  // Framing is DERIVED from the grounded candidate's real facts (no AI). The
  // grounded ports are "Nassau, Cozumel" → region "Caribbean", and the itinerary
  // name templates the real nights onto that region. This must NOT come from the
  // AI stub (which no longer emits itineraryName/destination at all).
  check(
    "destination is derived from the real ports (Caribbean)",
    manifest.assembleDraft.destination === "Caribbean",
    manifest.assembleDraft.destination
  );
  check(
    "itineraryName is derived from real nights + region",
    manifest.assembleDraft.itineraryName === "7-Night Caribbean",
    manifest.assembleDraft.itineraryName
  );

  // No fabricated live-resolved fields.
  const draftKeys = Object.keys(manifest.assembleDraft);
  check(
    "assembleDraft omits packageId/shipName/siid/bookingUrl",
    !["packageId", "shipName", "siid", "bookingUrl"].some((k) => draftKeys.includes(k)),
    draftKeys.join(", ")
  );

  // Promo id validation. The generator's internal prefilter seeds the cruise line
  // from the angle text; this angle names no line, so vendor filtering is skipped
  // there (only the sail-window seed applies). The model still must not cite an id
  // outside whatever survived prefiltering.
  check("applied promos reference only prefiltered ids", manifest.appliedPromos.every((p) => p.promoRecordId === "cbpromo-test"));
  check("hallucinated promo id was dropped + reported", rejectedPromoIds.includes("cbpromo-FAKE"));
  check("generator prefiltered against the in-window promos", prefilter.kept >= 1 && prefilter.kept <= promoRecords.length);

  // Lookup query for the operator.
  check("manifest has a lookup query line", manifest.lookupQuery.line.length > 0);
  check("manifest has a lookup window", typeof manifest.lookupQuery.windowDays === "number");

  // --- Cache validation ------------------------------------------------------
  console.log("\nCache upsert + validation:");
  let cache = emptyDealTripManifestsCache(GEN_AT);
  cache = upsertDealTripManifest(cache, manifest);
  cache = upsertDealTripManifest(cache, manifest);
  check("upsert is idempotent on id", cache.manifests.length === 1);

  const validation = validateDealTripManifestsCache(cache);
  check("validator accepts the manifest cache", validation.ok, validation.errors.join("; "));

  // Validator must reject a fabricated packageId.
  const tampered = {
    ...cache,
    manifests: [
      { ...manifest, assembleDraft: { ...manifest.assembleDraft, packageId: "1619969" } },
    ],
  };
  const badValidation = validateDealTripManifestsCache(tampered);
  check("validator rejects a fabricated packageId in the draft", !badValidation.ok);

  // --- Inventory-aware fit-select ------------------------------------------------
  console.log("\nInventory-aware fit-select:");
  const fakeCandidates = [
    {
      packageId: "1500001",
      cruiseCode: "WONDER-7N",
      cruiseName: "Wonder of the Seas 7-Night Caribbean",
      cruiseLine: "Royal Caribbean",
      sailDateIso: "2026-11-08",
      nights: 7,
      confidence: 0.95,
      reasons: ["date match"],
    },
    {
      packageId: "1500002",
      cruiseCode: "INDY-4N",
      cruiseName: "Independence of the Seas 4-Night Bahamas",
      cruiseLine: "Royal Caribbean",
      sailDateIso: "2026-12-20",
      nights: 4,
      confidence: 0.85,
      reasons: ["line match"],
    },
  ];
  const fitResult = await selectBestFitCandidate({ angle, candidates: fakeCandidates as unknown[] });
  check("fit-select returns a candidate", fitResult.candidate !== undefined);
  check("fit-select returns a fitRationale", fitResult.fitRationale.length > 0);

  // --- Reconcile assembleDraft with resolved real cruise -------------------------
  console.log("\nReconcile assembleDraft with resolved:");
  const resolvedManifest = {
    ...manifest,
    resolvedPackage: {
      resolvedAtIso: GEN_AT,
      source: "operator_package_lookup" as const,
      packageId: "1500001",
      cruiseName: "Wonder of the Seas 7-Night Caribbean",
      cruiseLine: "Royal Caribbean",
      shipName: "Wonder of the Seas",
      sailDateIso: "2026-11-08",
      nights: 7,
      departurePortCode: "MIA",
      confidence: 0.95,
      reasons: ["date match"],
      siid: "1049337",
      itinerary: { durationNights: 7, departurePortCode: "MIA", portsOfCall: "Nassau, Cozumel" },
      lookupDiagnostics: [],
    },
  };
  const reconciled = reconcileAssembleDraftWithResolved(resolvedManifest);
  check("reconcile updates nights from resolved", reconciled.assembleDraft.nights === 7);
  check("reconcile updates departure port", reconciled.assembleDraft.departurePortHint === "MIA");
  check("reconcile updates ports", reconciled.assembleDraft.portsOfCall.join(", ") === "Nassau, Cozumel");
  check("reconcile preserves itinerary name", reconciled.assembleDraft.itineraryName === manifest.assembleDraft.itineraryName);
  check("reconcile preserves destination", reconciled.assembleDraft.destination === manifest.assembleDraft.destination);

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
