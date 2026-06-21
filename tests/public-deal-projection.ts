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
  dealFunnelSynthesisLookupKeys,
  findDealFunnelSynthesisForDeal,
  findDealTripManifestForDeal,
  isDealHomepageEligible,
  projectPublicDealPage,
  projectPublicDealTile,
  type AssembleCuratedDealInput,
  type CbPromoIntelligenceRecord,
  type CuratedOdysseusDeal,
  type DealFunnelSynthesis,
} from "../lib/cb/deals-system";
import { installDealsAiStub } from "./deals-ai-stub";

/** Minimal funnel synthesis fixture: hero + 5 segments + per-segment images. */
function synthesisFor(dealId: string): DealFunnelSynthesis {
  const cat = (c: string, id: string) => ({
    id,
    imageUrl: `https://img.example.com/${id}.jpg`,
    thumbnailUrl: `https://img.example.com/${id}-t.jpg`,
    title: `${c} photo`,
    provenance: "serpapi_search" as const,
    category: c as DealFunnelSynthesis["candidates"][number]["category"],
  });
  return {
    id: dealId,
    dealId,
    generatedAtIso: GEN_AT,
    generator: "gpt",
    sourceAdCopyId: "adcopy-x",
    sailingAngleTitle: "Sea Days Roll Differently",
    landingPage: {
      heroHeadline: "An Ocean Crossing with Nothing Between You and the Horizon",
      heroSubhead: "All-suite. All-inclusive. Every day is entirely yours.",
      segments: [
        { segment: "cabins", heading: "The Cabins", body: "Every suite faces the ocean.", imageId: "img-cabins" },
        { segment: "lounges", heading: "The Lounges", body: "Deep chairs, soft light.", imageId: "img-lounges" },
        { segment: "atrium", heading: "The Atrium", body: "A refined gathering point.", imageId: "img-atrium" },
        { segment: "dining", heading: "The Dining Rooms", body: "Every meal is included.", imageId: "img-dining" },
        { segment: "excursions", heading: "The Excursions", body: "Curated shore excursions.", imageId: "img-excursions" },
      ],
      warnings: [],
    },
    carousel: { cards: [], warnings: [] },
    candidates: [
      cat("hero", "img-hero"),
      cat("hero", "img-hero-backup"),
      cat("cabins", "img-cabins"),
      cat("lounges", "img-lounges"),
      cat("atrium", "img-atrium"),
      cat("dining", "img-dining"),
      cat("excursions", "img-excursions"),
      cat("excursions", "img-excursions-backup"),
    ],
    galleryIds: [],
    heroImageId: "img-hero",
  };
}

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
check(
  "expired approved deal excluded",
  !isDealHomepageEligible({ ...approved, expiresOnIso: "2000-01-01" })
);
check(
  "future-expiring approved deal included",
  isDealHomepageEligible({ ...approved, expiresOnIso: "2999-01-01" })
);

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

// Tile hero image: operator-selected synthesis image when present, stock fallback otherwise.
check(
  "tile without synthesis falls back to a stock hero image",
  tile.imageSrc.includes("pexels.com"),
  tile.imageSrc
);
const tileWithSynthesis = projectPublicDealTile(approved, synthesisFor(approved.id));
check(
  "tile WITH synthesis uses the operator-selected hero image",
  tileWithSynthesis.imageSrc === "https://img.example.com/img-hero.jpg",
  tileWithSynthesis.imageSrc
);
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

// --- Premium Deal Page (designPage) -------------------------------------------
console.log("\nPremium Deal Page (designPage):");

// Without a synthesis, no designPage (route falls back to legacy rendering).
check("no synthesis -> no designPage", projectPublicDealPage(approved).designPage === undefined);

// With a synthesis, a resolved deal yields a full premium page view. `approved`
// was waived text-only, so use a media-ready approval for the hero-image check.
const mediaReadyForHero = approveCuratedDeal(
  { ...validLinkUnapproved, mediaPlan: { ...assembled.mediaPlan!, readiness: "ready" } },
  { decidedAtIso: GEN_AT }
).deal;
const resolvedPage = projectPublicDealPage(mediaReadyForHero, synthesisFor(mediaReadyForHero.id)).designPage;
check("synthesis present -> designPage built", resolvedPage !== undefined);
check("designPage readiness is resolved (ship+date+price present)", resolvedPage?.readiness === "resolved");
check("hero uses the synthesis headline", resolvedPage?.hero.headline.startsWith("An Ocean Crossing"));
check("hero image resolves from heroImageId", resolvedPage?.hero.imageUrl === "https://img.example.com/img-hero.jpg",
  resolvedPage?.hero.imageUrl);
check("hero carries same-set fallback images",
  resolvedPage?.hero.imageFallbacks?.some((image) => image.imageUrl === "https://img.example.com/img-hero-backup.jpg") === true);
check("hero tries selected thumbnail before other fallbacks",
  resolvedPage?.hero.imageFallbacks?.[0]?.imageUrl === "https://img.example.com/img-hero-t.jpg",
  resolvedPage?.hero.imageFallbacks?.[0]?.imageUrl);
// A funnel synthesis carries operator-selected imagery, so it should override
// the older text-only media waiver from the curated-deal publish step.
check("text-only-waived deal still uses selected synthesis hero image",
  projectPublicDealPage(approved, synthesisFor(approved.id)).designPage?.hero.imageUrl === "https://img.example.com/img-hero.jpg");
check("five segments in fixed order", resolvedPage?.segments.length === 5 &&
  resolvedPage?.segments[0].heading === "Your Space at Sea" &&
  resolvedPage?.segments[4].heading === "Where You'll Step Ashore");
check("segment images resolve from per-segment imageId",
  resolvedPage?.segments.every((s) => typeof s.imageUrl === "string" && s.imageUrl.length > 0) === true);
check("segment image alt text is public-safe, not source-page title",
  resolvedPage?.segments.find((s) => s.heading === "First Impressions")?.imageAlt === "Atrium aboard the ship");
check("segment image carries same-category fallback images",
  resolvedPage?.segments.find((s) => s.heading === "Where You'll Step Ashore")?.imageFallbacks?.some((image) =>
    image.imageUrl === "https://img.example.com/img-excursions-backup.jpg"
  ) === true);
check("segment image tries selected thumbnail before category fallbacks",
  resolvedPage?.segments.find((s) => s.heading === "Where You'll Step Ashore")?.imageFallbacks?.[0]?.imageUrl ===
    "https://img.example.com/img-excursions-t.jpg");
check("segment index labels are 01..05",
  resolvedPage?.segments.map((s) => s.index).join(",") === "01,02,03,04,05");
check("resolved pricing is a table with a lead fare",
  resolvedPage?.pricing.kind === "table" &&
    resolvedPage.pricing.rows.some((r) => r.lead === true));
check("resolved from-price reflects the lowest cabin fare", resolvedPage?.fromPriceLabel === "$699");
check("resolved itinerary lists every port as days",
  resolvedPage?.itinerary.kind === "days" && resolvedPage.itinerary.rows.length === approved.cruiseFacts.portsOfCall.length);
check("designPage carries the booking url", resolvedPage?.bookingUrl === approved.bookingUrl);
check("designPage never leaks the agent-only note",
  !allText(resolvedPage).includes("tc credit") && !allText(resolvedPage).includes("group economics"));

// Real day-by-day itinerary (port names + arrival/departure times + sea days)
// is preferred over the coarse ports string when present on the deal facts.
const dayByDayDeal: CuratedOdysseusDeal = {
  ...mediaReadyForHero,
  cruiseFacts: {
    ...mediaReadyForHero.cruiseFacts,
    dayByDayItinerary: [
      { day: 1, portName: "Orlando (Port Canaveral), Fl", atSea: false, departureTime: "15:30:00" },
      { day: 2, portName: "At Sea", atSea: true },
      { day: 3, portName: "San Juan, Puerto Rico", atSea: false, arrivalTime: "10:30:00", departureTime: "18:00:00" },
      { day: 4, portName: "Orlando (Port Canaveral), Fl", atSea: false, arrivalTime: "07:00:00" },
    ],
  },
};
const dayByDayPage = projectPublicDealPage(dayByDayDeal, synthesisFor(dayByDayDeal.id)).designPage;
const dbdItinerary = dayByDayPage?.itinerary;
check(
  "day-by-day itinerary renders as day rows",
  dbdItinerary?.kind === "days" && dbdItinerary.rows.length === 4,
  `kind=${dbdItinerary?.kind}`
);
if (dbdItinerary?.kind === "days") {
  check("embarkation row formats the departure time", dbdItinerary.rows[0]?.timing === "Depart 3:30 PM", dbdItinerary.rows[0]?.timing);
  check("sea day row is flagged atSea", dbdItinerary.rows[1]?.atSea === true && dbdItinerary.rows[1]?.text === "At Sea");
  check(
    "port call shows arrival + departure",
    dbdItinerary.rows[2]?.timing === "Arrive 10:30 AM · Depart 6:00 PM",
    dbdItinerary.rows[2]?.timing
  );
  check("disembarkation shows arrival only", dbdItinerary.rows[3]?.timing === "Arrive 7:00 AM", dbdItinerary.rows[3]?.timing);
  check("real port names render (San Juan)", dbdItinerary.rows[2]?.text === "San Juan, Puerto Rico");
}

// Port codes (e.g. "NYC", "SOU") resolve to readable names on the public page.
const codedPortsDeal: CuratedOdysseusDeal = {
  ...mediaReadyForHero,
  cruiseFacts: {
    ...mediaReadyForHero.cruiseFacts,
    departurePort: "NYC",
    portsOfCall: ["NYC | SOU"],
  },
};
const codedPortsPage = projectPublicDealPage(codedPortsDeal, synthesisFor(codedPortsDeal.id)).designPage;
const codedItineraryText =
  codedPortsPage?.itinerary.kind === "days"
    ? codedPortsPage.itinerary.rows.map((r) => r.text)
    : codedPortsPage?.itinerary.kind === "ports"
      ? codedPortsPage.itinerary.ports
      : [];
check(
  "port codes resolve to readable names in the itinerary",
  codedItineraryText.includes("New York, NY") && codedItineraryText.includes("Southampton, UK"),
  codedItineraryText.join(" / ")
);
check(
  "raw port codes do not leak to the itinerary",
  !codedItineraryText.includes("NYC") && !codedItineraryText.includes("SOU"),
  codedItineraryText.join(" / ")
);
check(
  "departure port code resolves on the page facts",
  projectPublicDealPage(codedPortsDeal).facts.departurePort === "New York, NY",
  projectPublicDealPage(codedPortsDeal).facts.departurePort
);

// Published deals use live package ids, but the funnel synthesis cache is
// keyed to the source manifest/ad-copy trace carried in agentOnlyNotes.
const sourceManifestId = "manifest-sea-days-roll-differently-celebrity-cruises";
const sourceAdCopyId = "adcopy-sea-days-roll-differently";
const manifestKeyedDeal: CuratedOdysseusDeal = {
  ...mediaReadyForHero,
  id: "1665442",
  packageId: "1665442",
  copyPackage: {
    ...mediaReadyForHero.copyPackage!,
    agentOnlyNotes: [`Assembled from manifest unified-${sourceManifestId} + ad copy ${sourceAdCopyId}`],
  },
  agentOnlyNotes: [`Assembled from manifest unified-${sourceManifestId} + ad copy ${sourceAdCopyId}`],
};
const lookupKeys = dealFunnelSynthesisLookupKeys(manifestKeyedDeal);
check("synthesis lookup includes public package id", lookupKeys.includes("1665442"));
check("synthesis lookup includes source manifest id", lookupKeys.includes(sourceManifestId));
check("synthesis lookup includes source ad-copy id", lookupKeys.includes(sourceAdCopyId));
const manifestKeyedSynthesis: DealFunnelSynthesis = {
  ...synthesisFor(sourceManifestId),
  id: "funnel-source-manifest",
  dealId: sourceManifestId,
  sourceAdCopyId,
};
check(
  "manifest-keyed synthesis resolves for package-keyed deal",
  findDealFunnelSynthesisForDeal(manifestKeyedDeal, [manifestKeyedSynthesis]) === manifestKeyedSynthesis
);
check(
  "package-keyed deal builds premium designPage from manifest-keyed synthesis",
  projectPublicDealPage(manifestKeyedDeal, manifestKeyedSynthesis).designPage !== undefined
);
check(
  "source manifest resolves for package-keyed deal",
  findDealTripManifestForDeal(manifestKeyedDeal, [{ id: sourceManifestId } as never])?.id === sourceManifestId
);

const screenshotBugDeal: CuratedOdysseusDeal = {
  ...manifestKeyedDeal,
  cruiseFacts: {
    ...manifestKeyedDeal.cruiseFacts,
    itineraryName: "Sea Days Roll Differently - Transatlantic Crossing for the Solo Journaling Roleplayer",
    shipName: "13-Night Westbound Transatlantic Cruise From Southampton Ending In Fort Lauderdale",
    sailDateIso: "2026-09-14",
    portsOfCall: ["Southampton | Vigo | Lisbon | Madeira | Port Everglades"],
    cabinPrices: { currencyCode: "USD" },
  },
  promoApplicability: [
    { promoRecordId: "likely", status: "likely_applicable", matchedOn: ["Celebrity match"], assumptions: ["Likely applies"], warnings: [] },
    { promoRecordId: "possible", status: "possibly_applicable_needs_review", matchedOn: ["Fallback line"], assumptions: ["Maybe"], warnings: [] },
  ],
};
const screenshotBugPage = projectPublicDealPage(screenshotBugDeal, manifestKeyedSynthesis).designPage;
check(
  "cruise-name ship field becomes itinerary, not ship",
  screenshotBugPage?.factBand.some((f) =>
    f.label === "Itinerary" &&
    f.value === "13-Night Westbound Transatlantic Cruise From Southampton Ending In Fort Lauderdale"
  ) === true
);
check(
  "pipe-delimited ports split into individual ports",
  screenshotBugPage?.factBand.some((f) =>
    f.label === "Ports of Call" &&
    f.value === "Southampton · Vigo · Lisbon · Madeira · Port Everglades"
  ) === true
);
check(
  "known sail date is shown even when pricing is still draft",
  screenshotBugPage?.factBand.some((f) => f.label === "Sail Date" && f.value === "September 14, 2026") === true
);
check(
  "fallback/possible promos do not duplicate public offer cards",
  screenshotBugPage?.specials.length === 1
);
check(
  "promo matcher internals do not render on the design page",
  !allText(screenshotBugPage).includes("celebrity match") &&
    !allText(screenshotBugPage).includes("likely applies") &&
    !allText(screenshotBugPage).includes("fallback line")
);

const seabournQuestDeal: CuratedOdysseusDeal = {
  ...manifestKeyedDeal,
  id: "1582993",
  packageId: "1582993",
  cruiseFacts: {
    ...manifestKeyedDeal.cruiseFacts,
    cruiseLine: "Seabourn",
    itineraryName: "35-Day World Cruise: Panama Canal Crossing & Polynesia",
    title: "35-Day World Cruise: Panama Canal Crossing & Polynesia",
    shipName: "35-Day World Cruise: Panama Canal Crossing & Polynesia",
    sailDateIso: "2027-01-05",
    nights: 35,
    portsOfCall: ["MIA | PNMC | GYE | CALL | PPT"],
    cabinPrices: { outside: 18523, balcony: 23353, suite: 45023, currencyCode: "USD" },
  },
};
const seabournQuestProjection = projectPublicDealPage(seabournQuestDeal, manifestKeyedSynthesis);
check(
  "known package resolves itinerary-title ship to Seabourn Quest",
  seabournQuestProjection.facts.shipName === "Seabourn Quest",
  seabournQuestProjection.facts.shipName
);
check(
  "known package resolves display cruise line",
  seabournQuestProjection.facts.cruiseLine === "Seabourn Cruise Line",
  seabournQuestProjection.facts.cruiseLine
);
check(
  "known package design page fact band shows the vessel, not itinerary",
  seabournQuestProjection.designPage?.factBand.some((f) => f.label === "Ship" && f.value === "Seabourn Quest") === true
);
check(
  "known package design page exposes a first-image vessel label",
  seabournQuestProjection.designPage?.vesselLabel === "Seabourn Quest · Seabourn Cruise Line",
  seabournQuestProjection.designPage?.vesselLabel
);

const queenMaryDeal: CuratedOdysseusDeal = {
  ...manifestKeyedDeal,
  id: "1578937",
  packageId: "1578937",
  cruiseFacts: {
    ...manifestKeyedDeal.cruiseFacts,
    cruiseLine: "Cunard",
    itineraryName: "Eastbound Transatlantic Crossing",
    title: "Eastbound Transatlantic Crossing",
    shipName: "Eastbound Transatlantic Crossing",
    sailDateIso: "2027-01-02",
    nights: 9,
    portsOfCall: ["NYC | SOU"],
    cabinPrices: { inside: 859.48, outside: 1149.48, balcony: 1289.48, suite: 4269.48, currencyCode: "USD" },
  },
};
const queenMaryProjection = projectPublicDealPage(queenMaryDeal, manifestKeyedSynthesis);
check(
  "known Cunard package resolves itinerary-title ship to Queen Mary 2",
  queenMaryProjection.facts.shipName === "Queen Mary 2",
  queenMaryProjection.facts.shipName
);
check(
  "known Cunard package exposes a first-image vessel label",
  queenMaryProjection.designPage?.vesselLabel === "Queen Mary 2 · Cunard",
  queenMaryProjection.designPage?.vesselLabel
);

const safePromoDeal: CuratedOdysseusDeal = {
  ...manifestKeyedDeal,
  promoApplicability: [
    {
      promoRecordId: promoRecord.id,
      status: "likely_applicable",
      matchedOn: ["Vendor match: internal-only reasoning"],
      assumptions: ["Operator should never see this on the public page"],
      warnings: ["Do not headline this internal warning"],
    },
  ],
};
const safePromoPage = projectPublicDealPage(safePromoDeal, manifestKeyedSynthesis, [promoRecord]).designPage;
check(
  "safe promo page uses visitor-safe promo claims",
  safePromoPage?.specials[0]?.claims.some((claim) =>
    claim.includes("Sail the Southern Caribbean with onboard credit on select cabins")
  ) === true
);
check(
  "safe promo page excludes applicability reasoning and warnings",
  !allText(safePromoPage).includes("vendor match") &&
    !allText(safePromoPage).includes("operator should never") &&
    !allText(safePromoPage).includes("do not headline")
);

// Draft fork: a deal with no ship/date/pricing must show graceful fallbacks and
// NEVER an invented price.
const draftDeal: CuratedOdysseusDeal = {
  ...approved,
  cruiseFacts: {
    ...approved.cruiseFacts,
    shipName: "",
    sailDateIso: "",
    cabinPrices: { currencyCode: "USD" },
  },
};
const draftPage = projectPublicDealPage(draftDeal, synthesisFor(draftDeal.id)).designPage;
check("draft deal -> readiness draft", draftPage?.readiness === "draft");
check("draft pricing shows no invented number", draftPage?.pricing.kind === "draft");
check("draft has no from-price label", draftPage?.fromPriceLabel === undefined);
check("draft itinerary falls back to named ports", draftPage?.itinerary.kind === "ports");
check("draft fact band marks ship/date confirmed at booking",
  draftPage?.factBand.some((e) => e.value === "Confirmed at booking") === true);

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
