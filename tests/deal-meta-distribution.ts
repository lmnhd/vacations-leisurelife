/**
 * Deal Meta Distribution proof artifact (Step 9).
 *
 * Asserts that deal-level Meta targeting stays loyal to the selected cruise
 * product and does not leak static cruise-line or port seeds from another deal.
 *
 * Run:
 *   npx tsx tests/deal-meta-distribution.ts
 */

import {
  planDealMetaDistribution,
  type CuratedOdysseusDeal,
  type DealMetaAdSynthesis,
} from "../lib/cb/deals-system";

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

const originalMetaEnv = {
  META_ACCESS_TOKEN: process.env.META_ACCESS_TOKEN,
  META_AD_ACCOUNT_ID: process.env.META_AD_ACCOUNT_ID,
  META_PAGE_ID: process.env.META_PAGE_ID,
};

delete process.env.META_ACCESS_TOKEN;
delete process.env.META_AD_ACCOUNT_ID;
delete process.env.META_PAGE_ID;

const deal: CuratedOdysseusDeal = {
  id: "1576786",
  status: "bookable",
  source: "odysseus_curated_retail",
  briefId: "brief-allure-family",
  capturedAtIso: "2026-07-03T00:00:00.000Z",
  packageId: "1576786",
  siid: "siid-allure",
  bookingUrl: "https://example.com/book/1576786",
  bookingUrlSource: "constructed_package_url",
  linkHealth: "valid",
  cruiseFacts: {
    title: "Allure of the Seas - Western Caribbean and Perfect Day",
    cruiseLine: "Royal Caribbean",
    shipName: "Allure of the Seas",
    itineraryName: "Western Caribbean and Perfect Day Cococay",
    nights: 6,
    sailDateIso: "2027-02-08",
    departurePort: "Miami, Florida",
    portsOfCall: ["Labadee, Haiti", "Falmouth, Jamaica", "Perfect Day at CocoCay"],
    cabinPrices: { inside: 699, balcony: 999, currencyCode: "USD" },
    promoSignals: ["Bonus dining eligibility"],
  },
  scoring: { score: 90, reasons: [], warnings: [] },
  packaging: {
    headline: "February Family Escape on Allure of the Seas",
    shortSummary: "A school-break Royal Caribbean family cruise with Perfect Day.",
    highlights: ["Perfect Day at CocoCay", "family balcony value", "bonus dining eligibility"],
    destinationNotes: [],
    bestFor: ["families", "kids", "grandparents"],
  },
  campaignStrategy: {
    campaignAngle: "February family escape with balcony value",
    targetAudience: "US families and multigenerational travelers",
    visualAngle: "Bright family Caribbean cruise imagery",
    targetingKeywords: ["family cruise", "Perfect Day CocoCay", "Royal Caribbean"],
    savedAtIso: "2026-07-03T00:00:00.000Z",
  },
  targetingDemographic: {
    dealId: "1576786",
    packageId: "1576786",
    generatedAtIso: "2026-07-03T00:00:00.000Z",
    primaryAudience: {
      label: "US families planning a February Caribbean cruise",
      description: "Parents and grandparents looking for a school-break sailing.",
      whyThisCruiseFits: "",
      emotionalDrivers: [],
      likelyObjections: [],
    },
    secondaryAudiences: [],
    nicheKeywords: {
      lifestyle: ["family beach vacation"],
      destination: ["Perfect Day CocoCay"],
      shipExperience: ["Allure of the Seas"],
      amenities: ["balcony cabin", "specialty dining"],
      eventsAndSeasonality: ["February family vacation"],
      trendSignals: [],
      exclusionKeywords: [],
    },
    channelTargeting: {
      meta: {
        interestClusters: ["Oceania Cruises", "Royal Caribbean", "Allure of the Seas", "family cruises"],
        behaviorSignals: [],
        creativeHooks: ["Kids crash early", "Perfect Day at CocoCay"],
        audienceWarnings: [],
      },
      google: { searchThemes: [], keywordIdeas: [], negativeKeywords: [], landingPageIntentNotes: [] },
      tiktok: { creatorAngles: [], trendHooks: [], shortVideoConcepts: [] },
      email: { segmentIdeas: [], subjectLineAngles: [], personalizationNotes: [] },
    },
    researchSummary: { primaryInsight: "", whyNow: "", competitorBlindSpot: "", positioningStatement: "" },
    sources: [],
    confidence: { score: 90, strengths: [], risks: [], needsHumanReview: [] },
  },
};

const synthesis: DealMetaAdSynthesis = {
  id: "funnel-adcopy-allure-family",
  dealId: "1576786",
  generatedAtIso: "2026-07-03T00:00:00.000Z",
  sourceFunnelSynthesisId: "funnel-adcopy-allure-family",
  sailingAngleTitle: "February Family Escape - Allure of the Seas",
  promptTemplate: "{{HEADLINE}}\n{{PRIMARY_TEXT}}",
  cards: [
    {
      cardIndex: 0,
      headline: "Allure of the Seas - Lock In the Balcony Value",
      primaryText: "Family February cruise with Perfect Day at CocoCay.",
      status: "ready",
      imageUrl: "https://example.com/allure-card.png",
    },
  ],
};

async function main(): Promise<void> {
  const plan = await planDealMetaDistribution(synthesis, deal);
  const queryText = plan.targeting.interestQueries.join(" | ").toLowerCase();

  check("keeps the selected Royal Caribbean line", queryText.includes("royal caribbean"));
  check("keeps the selected Allure ship", queryText.includes("allure of the seas"));
  check("keeps current deal ports", queryText.includes("labadee") && queryText.includes("perfect day"));
  check("drops incompatible Oceania cruise-line seed", !queryText.includes("oceania cruises"), queryText);
  check("does not append prior ABC-island ports globally", !queryText.includes("aruba") && !queryText.includes("barbados"));

  process.env.META_ACCESS_TOKEN = originalMetaEnv.META_ACCESS_TOKEN;
  process.env.META_AD_ACCOUNT_ID = originalMetaEnv.META_AD_ACCOUNT_ID;
  process.env.META_PAGE_ID = originalMetaEnv.META_PAGE_ID;

  console.log(`\nDeal Meta Distribution tests: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
