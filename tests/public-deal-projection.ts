/**
 * Phase 10 proof artifact: public Deal projection + homepage gate.
 *
 * Proves the two public-surface safety properties:
 *   1. Only homepage-eligible Deals (bookable + approved + valid link) survive
 *      the filter the homepage and /deals/[id] use. A valid link alone, an
 *      unapproved Deal, or a needs_review Deal is excluded.
 *   2. The public projection never emits agent-only notes, ad structure, or raw
 *      targeting keywords into visitor-facing fields.
 *
 * Run:
 *   npm run test:public-deal-projection
 */

import {
  approveCuratedDeal,
  assembleCuratedDeal,
  isDealHomepageEligible,
  projectPublicDealPage,
  projectPublicDealTile,
  type AssembleCuratedDealInput,
  type CbPromoIntelligenceRecord,
  type CuratedOdysseusDeal,
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

const baseInput: AssembleCuratedDealInput = {
  dealId: "deal-public-test",
  briefId: "brief-public-test",
  packageId: "1619969",
  siid: "1049337",
  cruiseFacts: {
    title: "6 Night Southern Caribbean Cruise",
    cruiseLine: "Royal Caribbean",
    shipName: "Liberty of the Seas",
    itineraryName: "6 Night Southern Caribbean",
    nights: 6,
    sailDateIso: "2026-11-08",
    departurePort: "Fort Lauderdale",
    portsOfCall: ["Perfect Day at CocoCay", "Aruba", "Curacao"],
    cabinPrices: { inside: 699, balcony: 1199, currencyCode: "USD" },
    promoSignals: ["Caribbean"],
  },
  generatedAtIso: GEN_AT,
};

const AGENT_SECRET = "TC credit applies; do not surface group economics publicly";
const promoRecord: CbPromoIntelligenceRecord = {
  id: "cbpromo-public-test",
  source: "cb_agent_tools_todays_view",
  sourceUrl: "https://www.cbagenttools.com/marketing/todaysview/",
  detailUrl: "https://www.cbagenttools.com/marketing/promotion/test",
  capturedAtIso: GEN_AT,
  title: "Test Caribbean Sale",
  vendor: "Royal Caribbean",
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
    publicClaimsAllowed: ["Sail the Southern Caribbean with onboard credit on select cabins"],
    publicClaimsNeedsQualifier: ["Onboard credit varies by cabin category"],
    agentOnlyNotes: [AGENT_SECRET],
    suggestedAngles: ["Warm-weather escape"],
    cautionFlags: [],
    bestMatchedDealBriefs: [],
    visitorFriendlySummary: "A Southern Caribbean sailing that may include onboard credit.",
  },
  diagnostics: { status: "succeeded", notes: [], warnings: [] },
};

async function main(): Promise<void> {
console.log("Phase 10 - Public Deal projection + homepage gate\n");

// Build an assembled Deal carrying an agent-only note.
const assembled = await assembleCuratedDeal({ ...baseInput, promoRecords: [promoRecord] });
check("assembled deal has the agent-only note internally", (assembled.agentOnlyNotes ?? []).some((n) => n.includes("TC credit")));

// --- Homepage eligibility filter ----------------------------------------------
console.log("Homepage eligibility filter:");
const needsReview = assembled;
const validLinkUnapproved: CuratedOdysseusDeal = {
  ...assembled,
  linkHealth: { status: "valid", lastVerifiedAtIso: GEN_AT },
};
const approved = approveCuratedDeal(validLinkUnapproved, {
  textOnlyLaunchWaived: true,
  decidedAtIso: GEN_AT,
}).deal;
const approvedThenLinkBroke: CuratedOdysseusDeal = {
  ...approved,
  linkHealth: { status: "broken", failureReason: "link 404" },
};

const pool = [needsReview, validLinkUnapproved, approved, approvedThenLinkBroke];
const eligible = pool.filter(isDealHomepageEligible);

check("needs_review deal excluded", !isDealHomepageEligible(needsReview));
check("valid-link but unapproved deal excluded", !isDealHomepageEligible(validLinkUnapproved));
check("approved + valid-link deal included", isDealHomepageEligible(approved));
check("approved deal with broken link excluded", !isDealHomepageEligible(approvedThenLinkBroke));
check("exactly one of four pool deals is eligible", eligible.length === 1);

// --- Projection safety --------------------------------------------------------
console.log("\nProjection safety:");
const tile = projectPublicDealTile(approved);
const page = projectPublicDealPage(approved);
const tileText = allText(tile);
const pageText = allText(page);

check("tile text never contains the agent-only note", !tileText.includes("tc credit") && !tileText.includes("group economics"), tileText);
check("page text never contains the agent-only note", !pageText.includes("tc credit") && !pageText.includes("group economics"), pageText);
check("page exposes no ad-structure field", !("adStructure" in page) && !pageText.includes("campaignthesis"));
check("page exposes no raw approval gates", !("operatorApproval" in page) && !pageText.includes("blocking"));

// --- Projection content -------------------------------------------------------
console.log("\nProjection content:");
check("tile links to the deal page", tile.href === `/deals/${encodeURIComponent(approved.id)}`);
check("tile carries the approved booking url", tile.bookingUrl === approved.bookingUrl);
check("tile shows a per-person price from cabin prices", tile.pricePerPersonLabel === "$699 USD");
check("page title is present", page.title.length > 0);
check("page hero summary is present", page.heroSummary.length > 20);
check(
  "page offer line carries qualified public claim",
  page.offerLines.some((line) => /onboard credit/i.test(line))
);
check(
  "page has three CTAs (book/email/callback)",
  page.ctas.length === 3 &&
    ["book_now", "email_link", "request_callback"].every((kind) =>
      page.ctas.some((c) => c.kind === kind)
    )
);
check("page facts carry the real ship", page.facts.shipName === "Liberty of the Seas");

// --- Text-only launch flows to the projection ---------------------------------
console.log("\nText-only launch:");
check(
  "text-only waiver surfaces on the page projection",
  page.textOnlyLaunchWaived === true
);
const mediaReadyDeal = approveCuratedDeal(
  { ...validLinkUnapproved, mediaPlan: { ...assembled.mediaPlan!, readiness: "ready" } },
  { decidedAtIso: GEN_AT }
).deal;
check(
  "non-waived approved deal projects textOnlyLaunchWaived=false",
  projectPublicDealPage(mediaReadyDeal).textOnlyLaunchWaived === false
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
