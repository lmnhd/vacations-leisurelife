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
  assembleCuratedDealFromManifest,
  buildDealBriefId,
  buildTripManifestId,
  defaultDealExpiresOnIso,
  evaluateApprovalGates,
  hasDealEnteredInventoryCutoffWindow,
  hasDealSailed,
  isDealExpired,
  isDealHomepageEligible,
  rejectCuratedDeal,
  resolveInitialCabinPricing,
  runDealCampaignStage,
  validateCuratedDealsCache,
  type AssembleCuratedDealInput,
  type CbPromoIntelligenceRecord,
  type CuratedOdysseusDeal,
  type DealAdCopy,
  type DealTripManifest,
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

console.log("Canonical Deal IDs:");
check(
  "trip manifest id leads with the package id",
  buildTripManifestId("1640418", "Your 8-Night January Reset") ===
    "manifest-1640418-your-8-night-january-reset"
);
check(
  "brief id leads with the package id",
  buildDealBriefId("1640418", "Your 8-Night January Reset") ===
    "brief-1640418-your-8-night-january-reset"
);

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
    cabinPrices: { inside: 699, currencyCode: "USD" },
    promoSignals: ["Caribbean"],
  },
  generatedAtIso: GEN_AT,
  expiresOnIso: "2999-01-01",
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

const manifestAssemblyManifest: DealTripManifest = {
  id: "manifest-workbench-alaska-edge",
  generatedAtIso: GEN_AT,
  generator: "gpt",
  sourceAngleId: "angle-workbench-alaska-edge",
  isolatedNiche: "Luxury Alaska suite shoppers",
  sailingAngleTitle: "Suite-level Alaska glacier play",
  assembleDraft: {
    suggestedDealId: "deal-alaska-edge",
    suggestedBriefId: "brief-alaska-edge",
    cruiseLine: "Celebrity Cruises",
    itineraryName: "7 Night Alaska Dawes Glacier Cruise",
    destination: "Alaska",
    nights: 7,
    sailWindow: {
      earliestIso: "2026-07-24",
      latestIso: "2026-07-24",
      rationale: "Exact sailing selected by operator.",
    },
    departurePortHint: "Seattle",
    portsOfCall: ["Ketchikan", "Endicott Arm & Dawes Glacier", "Juneau", "Skagway"],
    shipClassHint: "Celebrity Edge",
  },
  appliedPromos: [],
  promoStrategy: "Lead with the July Summer Sale suite perks where supportable.",
  manifestReasoning:
    "Created from an operator-selected Alaska sailing for suite buyers who care about glacier viewing and premium ship comfort.",
  lookupQuery: {
    line: "Celebrity Cruises",
    ship: "Celebrity Edge",
    destination: "Alaska",
    date: "2026-07-24",
    nights: 7,
    port: "Seattle",
    windowDays: 0,
  },
  targetingSeeds: {
    inferredMarket: "US",
    geoFocus: ["Seattle", "Pacific Northwest travel", "Alaska travel"],
    personaSignals: ["suite shoppers", "premium cruise travelers", "milestone travel planners"],
    metaInterestSeeds: ["Alaska travel", "Celebrity Cruises", "Sky Suite", "Seattle departures"],
    metaBehaviorSignals: ["responds to limited-time travel offers", "compares premium vacation value"],
    excludedAudienceSignals: ["Avoid broad cruise-interest targeting as the only audience."],
  },
  resolvedPackage: {
    resolvedAtIso: GEN_AT,
    source: "operator_package_lookup",
    packageId: "1543052",
    cruiseName: "7 Night Alaska Dawes Glacier Cruise",
    cruiseLine: "Celebrity Cruises",
    shipName: "Celebrity Edge",
    sailDateIso: "2026-07-24",
    nights: 7,
    departurePortCode: "Seattle",
    confidence: 1,
    reasons: ["Operator selected the exact package."],
    siid: "1049337",
    bookingUrl: "https://bookings.cbagenttools.com/swift/cruise/package/1543052?siid=1049337&lang=1",
    bookingLinkClass: "constructed_package_url",
    linkHealth: { status: "unknown", failureReason: "Not yet validated." },
    cabinPricing: {
      suite: 4899,
      balcony: 2399,
      currencyCode: "USD",
    },
    itinerary: {
      durationNights: 7,
      departurePortCode: "Seattle",
      portsOfCall: "Seattle | Ketchikan | Endicott Arm & Dawes Glacier | Juneau | Skagway",
      normalizedPortsOfCall: "Seattle, Ketchikan, Endicott Arm & Dawes Glacier, Juneau, Skagway",
    },
    lookupDiagnostics: ["Resolved from workbench handoff."],
  },
};

const manifestAssemblyAdCopy: DealAdCopy = {
  id: "adcopy-alaska-edge",
  generatedAtIso: GEN_AT,
  generator: "gpt",
  sourceUnifiedManifestId: "unified-manifest-workbench-alaska-edge",
  campaignName: "See Dawes Glacier from Celebrity Edge",
  targetAudienceTag: "Couples aged 40-65 seeking premium Alaska cruise experiences",
  primaryPromoApplied: "none",
  variants: [
    {
      promoApplied: "none",
      variantLabel: "Primary retail play",
      headline: "Sky Suite. Dawes Glacier. July 24.",
      bodyCopy:
        "Your private veranda when Edge noses into Endicott Arm - no jockeying for rail space on Deck 15. 7-night Alaska RT Seattle.",
      pricingDisclaimers: "Fares vary by cabin and availability. Confirm live pricing before booking.",
      callToAction: "Check availability",
      adPlatformTargetingHooks: {
        demographicTargeting: "Adults 40-65 with high household income who respond to premium cruise and milestone-travel messaging.",
        interestKeywords: ["Celebrity Cruises", "Celebrity Edge", "Alaska cruise", "Sky Suite", "Seattle cruise"],
      },
      voiceWarnings: [],
    },
  ],
};

async function main(): Promise<void> {
console.log("Phase 9 / 9A - Curated Deal assembly + approval gate\n");

console.log("Booking-link cabin pricing hydration:");
let bookingPageReads = 0;
const hydratedPricing = await resolveInitialCabinPricing(
  { currencyCode: "USD" },
  "https://bookings.cbagenttools.com/swift/cruise/package/1640418?siid=1049337&lang=1",
  async () => {
    bookingPageReads += 1;
    return {
      ok: true,
      prices: { inside: 899, balcony: 1299, currencyCode: "USD" },
    };
  }
);
check("missing pricing is hydrated from the acquired booking URL", hydratedPricing.status === "hydrated");
check("hydrated pricing carries live cabin tiers", hydratedPricing.pricing?.balcony === 1299);
check("booking page is read once when pricing is missing", bookingPageReads === 1);

const retainedPricing = await resolveInitialCabinPricing(
  { inside: 699, currencyCode: "USD" },
  "https://bookings.cbagenttools.com/swift/cruise/package/1640418?siid=1049337&lang=1",
  async () => {
    bookingPageReads += 1;
    return { ok: false, failureReason: "should not be called" };
  }
);
check("existing cabin pricing bypasses the booking-page scrape", retainedPricing.status === "already_present");
check("existing cabin pricing remains unchanged", retainedPricing.pricing?.inside === 699);
check("existing pricing does not trigger another booking-page read", bookingPageReads === 1);

const unresolvedPricing = await resolveInitialCabinPricing(
  { currencyCode: "USD" },
  "https://bookings.cbagenttools.com/swift/cruise/package/1640418?siid=1049337&lang=1",
  async () => ({ ok: false, failureReason: "Every cabin tier showed a dash." })
);
check("handoff can identify a pricing-unavailable booking link", unresolvedPricing.status === "unavailable");

const missingPricingGate = evaluateApprovalGates({
  cruiseFacts: { ...baseInput.cruiseFacts, cabinPrices: { currencyCode: "USD" } },
}).find((gate) => gate.id === "cabin_pricing");
check("missing cabin pricing is a blocking approval failure", missingPricingGate?.blocking === true && !missingPricingGate.passed);

// --- Assembly produces a non-publishable needs_review Deal ---------------------
const deal = await assembleCuratedDeal({ ...baseInput, promoRecords: [promoRecord] });

console.log("Assembly:");
check("deal id carried through", deal.id === baseInput.dealId);
// The fixture's expiry (2999-01-01) is later than the pre-sail inventory cutoff,
// so assembly caps it to 45 days before departure.
check(
  "expiration later than the inventory cutoff is capped to 45 days before sailing",
  deal.expiresOnIso === "2026-09-24",
  deal.expiresOnIso
);
{
  const dealEarlyExpiry = await assembleCuratedDeal({
    ...baseInput,
    expiresOnIso: "2026-08-01",
    promoRecords: [promoRecord],
  });
  check(
    "expiration earlier than the sail date passes through unchanged",
    dealEarlyExpiry.expiresOnIso === "2026-08-01",
    dealEarlyExpiry.expiresOnIso
  );
}

// --- Expiration is non-optional: defaults to exactly 90 days from assembly -------
{
  const { expiresOnIso: _omit, ...withoutExpiry } = baseInput;
  void _omit;
  const dealNoExpiry = await assembleCuratedDeal({
    ...withoutExpiry,
    promoRecords: [promoRecord],
  });
  check(
    "omitted expiration defaults to 90 days from assembly",
    dealNoExpiry.expiresOnIso === defaultDealExpiresOnIso(baseInput.generatedAtIso)
  );
  check("defaulted expiration is present (non-optional)", Boolean(dealNoExpiry.expiresOnIso));
}
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

console.log("\nManifest assembly targeting:");
const assembledFromManifest = assembleCuratedDealFromManifest({
  manifest: manifestAssemblyManifest,
  adCopy: manifestAssemblyAdCopy,
});
check(
  "manifest assembly keeps Meta interest hooks from ad copy",
  (assembledFromManifest.targetingDemographic?.channelTargeting.meta.interestClusters ?? []).includes("Sky Suite")
);
check(
  "manifest assembly adds richer destination terms beyond ad copy hooks",
  (assembledFromManifest.targetingDemographic?.channelTargeting.meta.interestClusters ?? []).includes("Alaska")
);
check(
  "manifest assembly restores Meta behavior signals",
  (assembledFromManifest.targetingDemographic?.channelTargeting.meta.behaviorSignals ?? []).includes(
    "responds to limited-time travel offers"
  )
);
check(
  "manifest assembly restores seasonality keywords",
  (assembledFromManifest.targetingDemographic?.nicheKeywords.eventsAndSeasonality ?? []).some((term) =>
    term.includes("2026-07-24")
  )
);
check(
  "manifest assembly keeps manifest targeting seeds in Meta interests",
  (assembledFromManifest.targetingDemographic?.channelTargeting.meta.interestClusters ?? []).includes(
    "Seattle departures"
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
check("future-expiring deal is not expired", !isDealExpired(approved.deal, new Date("2026-06-09T12:00:00.000Z")));
check(
  "date-only expiration remains valid through end of date",
  !isDealExpired({ expiresOnIso: "2026-06-09" }, new Date("2026-06-09T23:59:59.999Z"))
);
check(
  "date-only expiration is expired after the date",
  isDealExpired({ expiresOnIso: "2026-06-09" }, new Date("2026-06-10T00:00:00.000Z"))
);

const expiredApprovedDeal: CuratedOdysseusDeal = {
  ...approved.deal,
  expiresOnIso: "2000-01-01",
};
check("expired approved deal is not homepage eligible", !isDealHomepageEligible(expiredApprovedDeal));
check("missing expiration keeps legacy approved deal eligible", isDealHomepageEligible({ ...approved.deal, expiresOnIso: undefined }));
check(
  "deal stays visible before the 45-day inventory cutoff",
  !hasDealEnteredInventoryCutoffWindow(approved.deal, new Date("2026-09-23T23:59:59.999Z"))
);
check(
  "deal drops once the 45-day inventory cutoff window begins",
  hasDealEnteredInventoryCutoffWindow(approved.deal, new Date("2026-09-25T00:00:00.000Z"))
);
check(
  "within-cutoff deal is not homepage eligible even with valid link and approval",
  !isDealHomepageEligible({
    ...approved.deal,
    cruiseFacts: { ...approved.deal.cruiseFacts, sailDateIso: "2026-08-20" },
  })
);

// Sailed-departure guard: independent of expiresOnIso, so legacy deals whose
// stored expiry outlives the departure (pre-cap assemblies) still drop off.
check(
  "deal is not sailed through end of its sail date",
  !hasDealSailed(approved.deal, new Date("2026-11-08T23:59:59.999Z"))
);
check(
  "deal has sailed the day after departure",
  hasDealSailed(approved.deal, new Date("2026-11-09T00:00:00.000Z"))
);
check(
  "missing sail date never counts as sailed",
  !hasDealSailed(
    { cruiseFacts: { ...approved.deal.cruiseFacts, sailDateIso: "" } },
    new Date("2999-01-01T00:00:00.000Z")
  )
);
const sailedDeal: CuratedOdysseusDeal = {
  ...approved.deal,
  expiresOnIso: "2999-01-01",
  cruiseFacts: { ...approved.deal.cruiseFacts, sailDateIso: "2000-01-01" },
};
check(
  "sailed deal is not homepage eligible even with a far-future expiry",
  !isDealHomepageEligible(sailedDeal)
);

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
