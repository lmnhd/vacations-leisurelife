/**
 * Phase 9 / 9A proof artifact: Curated Deal assembly + approval gate.
 *
 * Proves the core safety property: a Deal is NEVER homepage-eligible without an
 * explicit operator approval, even when its booking link health is valid. Also
 * proves staged generation, the public-copy / agent-only separation, and that
 * the schema validator rejects a "bookable" Deal that is not operator-approved.
 *
 * Run:
 *   npm run test:curated-deal-assembly
 */

import {
  approveCuratedDeal,
  assembleCuratedDeal,
  evaluateApprovalGates,
  isDealHomepageEligible,
  rejectCuratedDeal,
  runDealCampaignStage,
  validateCuratedDealsCache,
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
  dealId: "deal-test-southern-caribbean",
  briefId: "brief-test-warm-escape",
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
    cabinPrices: { currencyCode: "USD" },
    promoSignals: ["Caribbean"],
  },
  generatedAtIso: GEN_AT,
};

// A promo record carrying both public-safe claims and agent-only notes plus a
// deliberately risky "guaranteed lowest price" claim, to prove separation and
// red-flag detection.
const promoRecord: CbPromoIntelligenceRecord = {
  id: "cbpromo-test",
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
    agentOnlyNotes: ["TC credit applies; do not surface group economics publicly"],
    suggestedAngles: ["Warm-weather escape"],
    cautionFlags: [],
    bestMatchedDealBriefs: [],
    visitorFriendlySummary: "A Southern Caribbean sailing that may include onboard credit.",
  },
  diagnostics: { status: "succeeded", notes: [], warnings: [] },
};

async function main(): Promise<void> {
console.log("Phase 9 / 9A - Curated Deal assembly + approval gate\n");

// --- Assembly produces a non-publishable needs_review Deal ---------------------
const deal = await assembleCuratedDeal({ ...baseInput, promoRecords: [promoRecord] });

console.log("Assembly:");
check("deal id carried through", deal.id === baseInput.dealId);
check("status is needs_review", deal.status === "needs_review");
check("approval status is needs_review", deal.operatorApproval?.status === "needs_review");
check("link health starts unknown", deal.linkHealth.status === "unknown");
check("has angle research", Boolean(deal.angleResearch));
check("has targeting demographic", Boolean(deal.targetingDemographic));
check("has copy package", Boolean(deal.copyPackage));
check("has ad structure", Boolean(deal.adStructure));
check("has media plan", Boolean(deal.mediaPlan));
check("NOT homepage eligible on assembly", !isDealHomepageEligible(deal));

// --- Public-copy / agent-only separation --------------------------------------
console.log("\nCopy safety:");
const publicCopyText = allText({
  headlineOptions: deal.copyPackage?.headlineOptions,
  shortTileCopy: deal.copyPackage?.shortTileCopy,
  heroCopy: deal.copyPackage?.heroCopy,
  whyThisTrip: deal.copyPackage?.whyThisTrip,
  offerLines: deal.copyPackage?.offerLines,
});
check(
  "agent-only note does not leak into public copy",
  !publicCopyText.includes("tc credit") && !publicCopyText.includes("group economics"),
  publicCopyText
);
check(
  "agent-only note captured on the deal",
  (deal.agentOnlyNotes ?? []).some((n) => /tc credit/i.test(n))
);
check(
  "public-safe promo claim used in offer copy",
  (deal.copyPackage?.offerLines ?? []).some((line) => /onboard credit/i.test(line.text))
);
check(
  "qualifier appended to needs-qualifier claim",
  (deal.copyPackage?.offerLines ?? []).some(
    (line) => line.needsQualifier && /confirm live pricing/i.test(line.text)
  )
);
check(
  "three CTA options present",
  (deal.copyPackage?.ctaCopy ?? []).length === 3 &&
    ["book_now", "email_link", "request_callback"].every((kind) =>
      deal.copyPackage?.ctaCopy.some((c) => c.kind === kind)
    )
);

// --- THE CORE GATE: valid link is NOT enough to publish -----------------------
console.log("\nApproval gate (core safety):");
const validLinkDeal: CuratedOdysseusDeal = {
  ...deal,
  linkHealth: { status: "valid", lastVerifiedAtIso: GEN_AT },
};
check(
  "valid link alone does NOT make a deal homepage eligible",
  !isDealHomepageEligible(validLinkDeal)
);
check(
  "valid-link but unapproved deal still needs_review",
  validLinkDeal.status === "needs_review"
);

// Approval still blocked while media is only "concepts_ready" (not waived).
const blockedApproval = approveCuratedDeal(validLinkDeal, { decidedAtIso: GEN_AT });
check("approval blocked when media not ready", !blockedApproval.approved);
check(
  "media gate is the blocker",
  blockedApproval.blockingFailures.some((g) => g.id === "media_ready")
);
check("blocked deal is not bookable", blockedApproval.deal.status !== "bookable");
check("blocked deal not homepage eligible", !isDealHomepageEligible(blockedApproval.deal));

// Approve with text-only waiver: now all blocking gates pass.
const approved = approveCuratedDeal(validLinkDeal, {
  textOnlyLaunchWaived: true,
  decisionNote: "Reviewed link + copy; launching text-only",
  decidedAtIso: GEN_AT,
});
check("approval succeeds with valid link + text-only waiver", approved.approved);
check("approved deal becomes bookable", approved.deal.status === "bookable");
check("approved deal approval status is approved", approved.deal.operatorApproval?.status === "approved");
check("approved deal IS homepage eligible", isDealHomepageEligible(approved.deal));

// --- Schema validator enforces the approval gate ------------------------------
console.log("\nSchema validator enforcement:");
const bookableUnapproved: CuratedOdysseusDeal = {
  ...validLinkDeal,
  status: "bookable",
  operatorApproval: validLinkDeal.operatorApproval
    ? { ...validLinkDeal.operatorApproval, status: "needs_review" }
    : undefined,
};
const cacheBad = validateCuratedDealsCache({
  version: 1,
  generatedAtIso: GEN_AT,
  briefs: [],
  deals: [bookableUnapproved],
});
check(
  "validator rejects bookable-but-unapproved deal",
  !cacheBad.ok && cacheBad.errors.some((e) => /operator-approved/i.test(e)),
  cacheBad.errors.join("; ")
);

const cacheGood = validateCuratedDealsCache({
  version: 1,
  generatedAtIso: GEN_AT,
  briefs: [],
  deals: [approved.deal],
});
check("validator accepts approved bookable deal", cacheGood.ok, cacheGood.errors.join("; "));

// --- Regenerating a stage invalidates a prior approval ------------------------
console.log("\nRegeneration safety:");
const regenerated = await runDealCampaignStage(approved.deal, "copy", { generatedAtIso: GEN_AT });
check("regenerating copy returns deal to needs_review", regenerated.status === "needs_review");
check(
  "regenerating copy clears approved status",
  regenerated.operatorApproval?.status === "needs_review"
);
check("regenerated deal not homepage eligible", !isDealHomepageEligible(regenerated));

// --- Rejection ----------------------------------------------------------------
console.log("\nRejection:");
const rejected = rejectCuratedDeal(approved.deal, { decisionNote: "Link went stale", decidedAtIso: GEN_AT });
check("rejected deal is needs_review", rejected.status === "needs_review");
check("rejected deal approval status is rejected", rejected.operatorApproval?.status === "rejected");
check("rejected deal not homepage eligible", !isDealHomepageEligible(rejected));

// --- Gate evaluation on the sample non-real package ---------------------------
console.log("\nGate detail:");
const sampleGates = evaluateApprovalGates({
  packageId: "0000000",
  linkHealth: { status: "unknown" },
});
check(
  "placeholder package id fails the real-package gate",
  sampleGates.some((g) => g.id === "real_package" && !g.passed)
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
