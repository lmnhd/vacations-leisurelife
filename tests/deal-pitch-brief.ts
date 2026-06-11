/**
 * Phase 9B proof artifact: Deal sales pitch brief.
 *
 * Asserts:
 *   1. generateDealPitchBrief produces the right shape and customer-readable fields.
 *   2. researchRationale is internal-only — never surfaced in public projections.
 *   3. generateDealCopyPackage sources whyThisTrip from pitchBrief.sellingFacts.
 *   4. A Deal assembled via assembleCuratedDeal carries a pitch brief and the
 *      pitch_brief_present gate passes.
 *   5. detectRedFlags still catches real promotional risk terms from promo records.
 *
 * Run:
 *   npm run test:deal-pitch-brief
 */

import {
  assembleCuratedDeal,
  generateDealCopyPackageAi,
  generateDealPitchBriefAi,
  isDealHomepageEligible,
  projectPublicDealPage,
  projectPublicDealTile,
  type AssembleCuratedDealInput,
  type CampaignStageInputs,
  type CbPromoIntelligenceRecord,
  type CuratedDealCruiseFacts,
} from "../lib/cb/deals-system";
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

function allText(value: unknown): string {
  return JSON.stringify(value).toLowerCase();
}

const GEN_AT = "2026-06-09T00:00:00.000Z";

const cruiseFacts: CuratedDealCruiseFacts = {
  title: "6 Night Southern Caribbean Cruise",
  cruiseLine: "Royal Caribbean",
  shipName: "Liberty of the Seas",
  itineraryName: "6 Night Southern Caribbean",
  nights: 6,
  sailDateIso: "2026-11-08",
  departurePort: "Fort Lauderdale",
  portsOfCall: ["Perfect Day at CocoCay", "Aruba", "Curacao"],
  cabinPrices: { inside: 699, currencyCode: "USD" },
  promoSignals: ["Caribbean"],
};

const baseInput: CampaignStageInputs = {
  dealId: "deal-pitch-test",
  packageId: "1619969",
  cruiseFacts,
  generatedAtIso: GEN_AT,
};

const assembleInput: AssembleCuratedDealInput = {
  dealId: "deal-pitch-test",
  briefId: "brief-pitch-test",
  packageId: "1619969",
  siid: "1049337",
  cruiseFacts,
  generatedAtIso: GEN_AT,
};

async function main(): Promise<void> {
console.log("Phase 9B - Deal sales pitch brief\n");

// --- Pitch brief shape -------------------------------------------------------
console.log("Pitch brief shape:");
const brief = await generateDealPitchBriefAi(baseInput);

check("has dealId", brief.dealId === "deal-pitch-test");
check("has generator field", brief.generator === "gpt");
check("has aiTrace", Boolean(brief.aiTrace && brief.aiTrace.model.length > 0));
check("tripSummary mentions nights", /\d+ nights/i.test(brief.tripSummary));
check("tripSummary mentions ship", brief.tripSummary.includes("Liberty of the Seas"));
check("tripSummary mentions a port", ["CocoCay", "Aruba", "Curacao"].some((p) => brief.tripSummary.includes(p)));
check("audienceStatement is a complete sentence", brief.audienceStatement.length > 20);
check("primaryHook is a complete sentence", brief.primaryHook.length > 20);
check("curatedReason is a complete sentence", brief.curatedReason.length > 20);
check("sellingFacts has exactly 3 items", brief.sellingFacts.length === 3);
check("each selling fact is non-empty", brief.sellingFacts.every((f) => f.length > 5));
check("researchRationale is non-empty", brief.researchRationale.length > 0);

// --- Copy sources from pitch brief -------------------------------------------
console.log("\nCopy dependency on pitch brief:");
const copy = await generateDealCopyPackageAi(baseInput, brief);

check("whyThisTrip includes all three selling facts", brief.sellingFacts.every((fact) => copy.whyThisTrip.includes(fact)));
check("heroCopy includes tripSummary", copy.heroCopy.includes(brief.tripSummary));
check("first headlineOption is the primaryHook", copy.headlineOptions[0] === brief.primaryHook);
check("copy generator is gpt", copy.generator === "gpt");

// --- researchRationale never reaches public surfaces ------------------------
console.log("\nresearchRationale isolation:");
const assembled = await assembleCuratedDeal(assembleInput);
check("assembled deal has pitchBrief", Boolean(assembled.pitchBrief));

const tile = projectPublicDealTile(assembled);
const page = projectPublicDealPage(assembled);
const tileText = allText(tile);
const pageText = allText(page);
const rationaleSlug = assembled.pitchBrief!.researchRationale.toLowerCase().slice(0, 40);

check("researchRationale not in tile", !tileText.includes(rationaleSlug));
check("researchRationale not in page", !pageText.includes(rationaleSlug));

// --- Approval gate -----------------------------------------------------------
console.log("\nApproval gate:");
const gates = assembled.operatorApproval?.gates ?? [];
const pitchGate = gates.find((g) => g.id === "pitch_brief_present");
check("pitch_brief_present gate exists", Boolean(pitchGate));
check("pitch_brief_present gate passes", pitchGate?.passed === true);
check("pitch_brief_present gate is blocking", pitchGate?.blocking === true);
check("assembled deal still not eligible until approved + valid", !isDealHomepageEligible(assembled));

// --- detectRedFlags catches promo risk terms from external records -----------
console.log("\nPromo risk detection:");
const riskyPromo: CbPromoIntelligenceRecord = {
  id: "cbpromo-risky",
  source: "cb_agent_tools_todays_view",
  sourceUrl: "https://www.cbagenttools.com/marketing/todaysview/",
  detailUrl: "https://www.cbagenttools.com/marketing/promotion/risky",
  capturedAtIso: GEN_AT,
  title: "Risky Promo",
  vendor: "Test",
  bookingWindow: { rawText: "Now" },
  sailingWindow: { rawText: "Fall 2026" },
  promotionDetailsRaw: "",
  agentInstructionsRaw: "",
  keyFeaturesRaw: "",
  applicableSailingsRaw: "",
  applicableProductsRaw: "",
  applicableMarketsRaw: "",
  supportingFiles: [],
  extracted: {
    offerTypes: ["dollars_off"],
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
    publicClaimsAllowed: ["Guaranteed lowest price on all sailings"],
    publicClaimsNeedsQualifier: [],
    agentOnlyNotes: [],
    suggestedAngles: [],
    cautionFlags: [],
    bestMatchedDealBriefs: [],
    visitorFriendlySummary: "",
  },
  diagnostics: { status: "succeeded", notes: [], warnings: [] },
};

const inputWithRiskyPromo: CampaignStageInputs = { ...baseInput, promoRecords: [riskyPromo] };
const riskyBrief = await generateDealPitchBriefAi(inputWithRiskyPromo);
const riskyCopy = await generateDealCopyPackageAi(inputWithRiskyPromo, riskyBrief);
check(
  "detectRedFlags catches 'guaranteed lowest price' from promo record",
  riskyCopy.publicCopyRedFlags.some((flag) => /guaranteed/i.test(flag)),
  riskyCopy.publicCopyRedFlags.join(" | ")
);

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
