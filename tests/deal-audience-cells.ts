/**
 * Deal Audience Precision Cells proof artifact (Step 9).
 *
 * Asserts the persona-cell targeting engine:
 *   - AND-layered flexible_spec stacks (identity x intent x behavior)
 *   - strict cells disable Advantage+ expansion and honor age bands
 *   - Meta exclusions flow from the blueprint into the spec
 *   - reach-estimate validation with one relaxation pass for narrow cells
 *   - deal-loyalty filtering of cross-product cruise-line interests
 *   - deterministic fallback blueprints when AI decomposition fails
 *   - offline plan builds keep working with a fallback matrix
 *
 * Run:
 *   npx tsx tests/deal-audience-cells.ts
 */

import {
  buildDealAudienceCellMatrix,
  buildFallbackAudienceCellBlueprints,
  dispatchDealMetaDistribution,
  planDealMetaDistribution,
  slugifyAudienceCellLabel,
  MAX_AUDIENCE_CELLS,
  type CuratedOdysseusDeal,
  type DealAudienceCellBlueprint,
  type DealAudienceCellDependencies,
  type DealAudienceCellResolvedEntry,
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
      whyThisCruiseFits: "School-break dates with a family mega-ship.",
      emotionalDrivers: ["one week where nobody cooks"],
      likelyObjections: [],
    },
    secondaryAudiences: [
      {
        label: "Multigen trip planners",
        description: "The one adult in the family who organizes everything.",
        whyThisCruiseFits: "One booking covers three generations.",
        targetingNotes: ["Family reunion", "Grandparent travel"],
      },
    ],
    nicheKeywords: {
      lifestyle: ["family beach vacation", "theme park families"],
      destination: ["Perfect Day CocoCay"],
      shipExperience: ["Allure of the Seas"],
      amenities: ["balcony cabin", "specialty dining"],
      eventsAndSeasonality: ["February family vacation"],
      trendSignals: [],
      exclusionKeywords: ["budget travel"],
    },
    channelTargeting: {
      meta: {
        interestClusters: ["Royal Caribbean", "Allure of the Seas", "family cruises"],
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

const INTEREST_IDS = new Map<string, DealAudienceCellResolvedEntry>([
  ["fine dining", { id: "i-fine-dining", name: "Fine dining", type: "interests", sourceQuery: "Fine dining" }],
  ["wine tasting", { id: "i-wine", name: "Wine tasting", type: "interests", sourceQuery: "Wine tasting" }],
  ["cruise critic", { id: "i-cc", name: "Cruise Critic", type: "interests", sourceQuery: "Cruise Critic" }],
  ["royal caribbean", { id: "i-rc", name: "Royal Caribbean", type: "interests", sourceQuery: "Royal Caribbean" }],
  ["theme parks", { id: "i-tp", name: "Theme parks", type: "interests", sourceQuery: "Theme parks" }],
  ["budget travel", { id: "i-budget", name: "Budget travel", type: "interests", sourceQuery: "budget travel" }],
  ["family reunion", { id: "i-reunion", name: "Family reunion", type: "interests", sourceQuery: "Family reunion" }],
]);

function makeDeps(overrides: Partial<DealAudienceCellDependencies>): DealAudienceCellDependencies {
  return {
    decompose: async () => [],
    resolveInterests: async (queries) => {
      const entries: DealAudienceCellResolvedEntry[] = [];
      const unresolvedQueries: string[] = [];
      for (const query of queries) {
        const hit = INTEREST_IDS.get(query.toLowerCase());
        if (hit) entries.push({ ...hit, sourceQuery: query });
        else unresolvedQueries.push(query);
      }
      return { entries, unresolvedQueries, warnings: [] };
    },
    resolveBehavior: async (hint) =>
      hint.toLowerCase() === "frequent travelers"
        ? { id: "b-freq", name: "Frequent travelers", type: "behaviors", sourceQuery: hint }
        : null,
    estimateReach: async (targeting) => {
      const layers = Array.isArray(targeting.flexible_spec) ? targeting.flexible_spec.length : 0;
      if (layers >= 3) {
        return { estimateReady: true, usersLowerBound: 40_000, usersUpperBound: 80_000 };
      }
      return { estimateReady: true, usersLowerBound: 600_000, usersUpperBound: 900_000 };
    },
    isCompatibleInterest: (name) => !name.toLowerCase().includes("oceania"),
    geoLocations: { countries: ["US"] },
    nowIso: "2026-07-31T00:00:00.000Z",
    ...overrides,
  };
}

const strictCellBlueprint: DealAudienceCellBlueprint = {
  cellId: "empty-nest-culinary-travelers",
  label: "Empty-Nest Culinary Travelers",
  description: "Adults 50+ who plan trips around food and wine.",
  rationale: "Bonus dining eligibility speaks directly to food-led planners.",
  identityInterests: ["Fine dining", "Wine tasting", "Oceania Cruises"],
  intentInterests: ["Cruise Critic", "Royal Caribbean"],
  exclusionInterests: ["budget travel"],
  behaviorHints: ["Frequent travelers"],
  ageMin: 50,
  ageMax: 65,
  precision: "strict",
};

const assistedCellBlueprint: DealAudienceCellBlueprint = {
  cellId: "family-deck-planners",
  label: "Family Deck Planners",
  description: "Parents planning the February school-break trip.",
  rationale: "Balcony value plus Perfect Day is the core family hook.",
  identityInterests: ["Theme parks", "Unknown Hobby"],
  intentInterests: ["Royal Caribbean"],
  exclusionInterests: [],
  behaviorHints: [],
  ageMin: 30,
  precision: "assisted",
};

async function main(): Promise<void> {
  console.log("\nSlug + blueprint basics");
  check("slugify strips punctuation without regex", slugifyAudienceCellLabel("Empty-Nest, Culinary Travelers!") === "empty-nest-culinary-travelers");
  check("slugify never returns empty", slugifyAudienceCellLabel("***") === "cell");

  console.log("\nAI matrix: AND layers, strict mode, exclusions, relaxation");
  const matrix = await buildDealAudienceCellMatrix(deal, synthesis, makeDeps({
    decompose: async () => [strictCellBlueprint, assistedCellBlueprint],
  }));

  check("matrix source is ai", matrix.source === "ai");
  check("matrix keeps both cells", matrix.cells.length === 2);

  const strictCell = matrix.cells[0];
  const assistedCell = matrix.cells[1];

  check(
    "incompatible cruise-line identity interest is dropped",
    !JSON.stringify(strictCell.targeting).toLowerCase().includes("oceania"),
  );
  check(
    "strict cell records the drop as a warning",
    strictCell.warnings.some((w) => w.includes("incompatible")),
  );

  check("strict cell was too narrow at 3 layers and relaxed", strictCell.relaxed === true);
  const strictSpec = strictCell.targeting.flexible_spec as Array<Record<string, unknown>>;
  check("relaxed strict cell has one merged OR layer", strictSpec.length === 1);
  const mergedLayer = strictSpec[0];
  check(
    "merged layer keeps interests and behaviors together",
    Array.isArray(mergedLayer.interests) && Array.isArray(mergedLayer.behaviors),
  );
  check("relaxed cell reach re-estimated to ok", strictCell.reach?.verdict === "ok");
  check(
    "relaxation is explained to the operator",
    strictCell.warnings.some((w) => w.includes("relaxed AND layers")),
  );

  const strictAutomation = strictCell.targeting.targeting_automation as Record<string, unknown>;
  check("strict cell disables Advantage+ audience expansion", strictAutomation.advantage_audience === 0);
  check("strict cell honors age band", strictCell.targeting.age_min === 50 && strictCell.targeting.age_max === 65);
  const strictExclusions = strictCell.targeting.exclusions as { interests?: Array<{ id: string }> };
  check(
    "strict cell excludes wrong-fit budget audience",
    strictExclusions?.interests?.some((entry) => entry.id === "i-budget") === true,
  );

  const assistedSpec = assistedCell.targeting.flexible_spec as Array<Record<string, unknown>>;
  check("assisted cell keeps a true identity AND intent stack", assistedSpec.length === 2 && assistedCell.relaxed === false);
  const assistedAutomation = assistedCell.targeting.targeting_automation as Record<string, unknown>;
  check("assisted cell keeps Advantage+ expansion on", assistedAutomation.advantage_audience === 1);
  check("assisted cell reach verdict ok", assistedCell.reach?.verdict === "ok");
  check(
    "unresolved identity query is tracked, not fatal",
    assistedCell.layers.some((layer) => layer.role === "identity" && layer.unresolvedQueries.includes("Unknown Hobby")),
  );
  check("both cells are dispatchable", strictCell.dispatchable && assistedCell.dispatchable);

  console.log("\nCell cap + duplicate ids");
  const crowded = await buildDealAudienceCellMatrix(deal, synthesis, makeDeps({
    decompose: async () => [
      strictCellBlueprint,
      { ...assistedCellBlueprint },
      { ...assistedCellBlueprint, label: "Family Deck Planners B" },
      { ...assistedCellBlueprint, label: "Family Deck Planners C" },
    ],
  }));
  check(`matrix caps at ${MAX_AUDIENCE_CELLS} cells`, crowded.cells.length === MAX_AUDIENCE_CELLS);
  const crowdedIds = crowded.cells.map((cell) => cell.blueprint.cellId);
  check("duplicate cell ids are de-duplicated", new Set(crowdedIds).size === crowdedIds.length, crowdedIds.join(", "));

  console.log("\nFallback path");
  const fallbackBlueprints = buildFallbackAudienceCellBlueprints(deal);
  check("fallback builds primary + secondary blueprints", fallbackBlueprints.length === 2);
  check(
    "fallback primary cell mirrors researched audience",
    fallbackBlueprints[0].label === "US families planning a February Caribbean cruise" &&
      fallbackBlueprints[0].precision === "assisted",
  );
  check(
    "fallback carries research exclusion keywords",
    fallbackBlueprints[0].exclusionInterests.includes("budget travel"),
  );

  const failedAiMatrix = await buildDealAudienceCellMatrix(deal, synthesis, makeDeps({
    decompose: async () => {
      throw new Error("gateway unavailable");
    },
  }));
  check("AI failure falls back to research blueprints", failedAiMatrix.source === "fallback" && failedAiMatrix.cells.length === 2);
  check(
    "AI failure is surfaced as a matrix warning",
    failedAiMatrix.warnings.some((w) => w.includes("gateway unavailable")),
  );

  console.log("\nOffline plan + simulate dispatch integration");
  const plan = await planDealMetaDistribution(synthesis, deal);
  check("offline plan still includes an audience matrix", plan.audienceMatrix !== undefined);
  check("offline matrix uses the fallback source (no AI spend)", plan.audienceMatrix?.source === "fallback");
  check(
    "offline cells are marked non-dispatchable",
    (plan.audienceMatrix?.cells ?? []).every((cell) => cell.dispatchable === false),
  );
  check(
    "offline matrix warns that legacy targeting will be used",
    (plan.audienceMatrix?.warnings ?? []).some((w) => w.includes("legacy combined targeting")),
  );

  const simulated = await dispatchDealMetaDistribution(synthesis, plan, "simulate");
  check("simulate keeps planned status", simulated.status === "planned");
  check(
    "simulate notes describe the audience matrix",
    simulated.notes.some((n) => n.startsWith("audience_matrix_source=")),
  );
  check(
    "simulate notes include per-cell diagnostics",
    simulated.notes.some((n) => n.startsWith("audience_cell=")),
  );

  process.env.META_ACCESS_TOKEN = originalMetaEnv.META_ACCESS_TOKEN;
  process.env.META_AD_ACCOUNT_ID = originalMetaEnv.META_AD_ACCOUNT_ID;
  process.env.META_PAGE_ID = originalMetaEnv.META_PAGE_ID;

  console.log(`\nDeal Audience Precision Cell tests: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
