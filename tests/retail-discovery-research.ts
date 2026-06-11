/**
 * Phase 5A/7 proof artifact: Retail Discovery adapter + Deal Angle Research.
 *
 * Asserts that Group Discovery-style niche research can become a quick-sale
 * retail Deal brief, then feed a package-specific DealAngleResearch scaffold
 * without leaking group/waitlist/threshold mechanics.
 *
 * Run:
 *   npm run test:retail-discovery-research
 */

import {
  adaptGroupDiscoveryToRetailBrief,
  generateDealAngleResearch,
  generateDealTargetingDemographic,
  type DealResearchCruiseCandidate,
  type GroupDiscoveryRetailSource,
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

function containsAny(value: string, terms: string[]): boolean {
  const lower = value.toLowerCase();
  return terms.some((term) => lower.includes(term));
}

function allText(value: unknown): string {
  return JSON.stringify(value).toLowerCase();
}

const GROUP_TERMS = [
  "threshold",
  "waitlist",
  "tour conductor",
  "tc credit",
  "private event",
  "exclusive event",
];

const sketchingSource: GroupDiscoveryRetailSource = {
  id: "alaska-sketching-landscape",
  name: "Alaska Landscape Sketching Group Cruise",
  researchRationale:
    "Plein-air sketchers, urban sketchers, and watercolor travel journal communities share gear lists, sketchbook spreads, and destination prompts. Alaska, glaciers, fjords, mountain light, and coastal towns give the niche strong non-generic travel material.",
  audienceSignals: [
    "Urban sketching communities regularly discuss travel sketch kits, fountain pens, compact watercolor palettes, and portable stools.",
    "Plein-air artists buy premium supplies, online courses, workshops, and destination retreats.",
    "Nature journaling communities seek slow observation, scenic light, and wildlife-adjacent landscapes.",
  ],
  cruiseNativeMoments: [
    "a watercolor sketchbook open beside a lounge window while blue-white glacier light fills the page",
    "pencils and travel brushes laid on a teak deck rail during Inside Passage scenic cruising",
    "a quiet coffee table with a half-finished sketch of a coastal Alaska town",
  ],
  targetDestination: "Alaska",
  targetDates: "2027 summer Alaska season",
  shipTarget: "Radiance-class or scenic Alaska-capable ship",
  aestheticHooks: [
    "soft graphite lines over glacier blue",
    "travel sketchbook texture",
    "coastal town storefronts and mountain silhouettes",
  ],
  targetableKeywords: [
    "urban sketching",
    "plein air painting",
    "watercolor travel journal",
    "nature journaling",
  ],
};

const alaskaCandidate: DealResearchCruiseCandidate = {
  id: "candidate-alaska-sketching-retail",
  cruiseLine: "Royal Caribbean",
  shipName: "Radiance of the Seas",
  itineraryName: "7 Night Alaska Inside Passage",
  destination: "Alaska",
  nights: 7,
  sailDateIso: "2027-07-16",
  departurePort: "Vancouver",
  portsOfCall: ["Juneau", "Skagway", "Ketchikan", "Inside Passage"],
  shipFeatures: ["floor-to-ceiling glass", "scenic lounges", "open deck viewing"],
  amenities: ["coffee lounges", "quiet indoor viewpoints", "outdoor decks"],
};

console.log("Phase 5A/7 - Retail Discovery adapter + Deal Angle Research\n");

const brief = adaptGroupDiscoveryToRetailBrief(sketchingSource);
const briefText = allText(brief);

console.log("RetailDiscoveryBrief:");
check("source is group_discovery_retail_adapter", brief.source === "group_discovery_retail_adapter");
check("title reframes as retail cruise angle", /perfect cruise/i.test(brief.retailAngleTitle));
check("audience keeps sketching niche", /sketch|plein|creative/i.test(brief.audience.label));
check("destination includes Alaska", brief.cruiseFit.idealDestinations.includes("Alaska"));
check("search hints include Alaska", brief.odysseusSearchHints.destinations?.includes("Alaska") === true);
check("quick-sale CTA exists", /booking link|available/i.test(brief.retailPositioning.quickSaleCTA));
check("targeting seeds include urban sketching", brief.targetingSeeds.nicheKeywords.includes("urban sketching"));
check("negative keywords included", brief.targetingSeeds.negativeKeywords.includes("free cruise"));
check("brief strips hard group-only mechanics", !containsAny(briefText, GROUP_TERMS), briefText);
check(
  "brief explicitly says this is not a group product",
  /retail deal angle/i.test(brief.retailPositioning.whyThisIsNotAGroup) &&
    /immediate booking/i.test(brief.retailPositioning.whyThisIsNotAGroup)
);

const research = generateDealAngleResearch({
  candidate: alaskaCandidate,
  retailBrief: brief,
  generatedAtIso: "2026-06-08T00:00:00.000Z",
});
const researchText = allText(research);

console.log("\nDealAngleResearch:");
check("research carries candidate id", research.dealCandidateId === alaskaCandidate.id);
check("research links retail brief id", research.retailDiscoveryBriefId === brief.id);
check("ship appeal references scenic features", containsAny(research.shipAppeal.join(" "), ["scenic", "glass", "viewing"]));
check("destination hooks include Inside Passage", containsAny(research.destinationHooks.join(" "), ["inside passage"]));
check("niche audience angles include sketching", containsAny(research.nicheAudienceAngles.join(" "), ["sketch", "plein"]));
check("primary angle has public hook", research.recommendedPrimaryAngle.publicCopyHook.length > 20);
check("exclusive rationale is present", research.recommendedPrimaryAngle.whyThisFeelsExclusive.length > 20);
check("generic cruise sale rejected", research.rejectedAngles.some((angle) => /generic cruise sale/i.test(angle.title)));
check("cohort-trip implications rejected", research.rejectedAngles.some((angle) => /cohort/i.test(angle.title)));
check("guardrails include amenity verification", research.factualGuardrails.some((guardrail) => /amenit/i.test(guardrail)));
check("guardrails prevent invented pricing", research.factualGuardrails.some((guardrail) => /invent pricing/i.test(guardrail)));
check("research keeps quick-sale retail orientation", !containsAny(researchText, ["threshold", "waitlist", "tour conductor"]));

const targeting = generateDealTargetingDemographic({
  dealId: "deal-alaska-sketching-retail",
  packageId: "1619969",
  candidate: alaskaCandidate,
  retailBrief: brief,
  angleResearch: research,
  generatedAtIso: "2026-06-08T00:00:00.000Z",
});
const targetingText = allText(targeting);

console.log("\nTargeting-Demographic:");
check("targeting carries deal id", targeting.dealId === "deal-alaska-sketching-retail");
check("targeting carries package id", targeting.packageId === "1619969");
check("primary audience keeps sketching niche", /sketch|plein|creative/i.test(targeting.primaryAudience.label));
check("primary audience explains cruise fit", targeting.primaryAudience.whyThisCruiseFits.length > 40);
check("likely objections are present", targeting.primaryAudience.likelyObjections.length >= 2);
check("secondary audiences are present", targeting.secondaryAudiences.length >= 2);
check("lifestyle keywords include urban sketching", targeting.nicheKeywords.lifestyle.includes("urban sketching"));
check("destination keywords include Alaska", targeting.nicheKeywords.destination.includes("Alaska"));
check("ship experience keywords include scenic feature", containsAny(targeting.nicheKeywords.shipExperience.join(" "), ["scenic", "glass", "viewing"]));
check("negative keywords included", targeting.nicheKeywords.exclusionKeywords.includes("free cruise"));
check("Meta targeting avoids broad cruise-first strategy", targeting.channelTargeting.meta.audienceWarnings.some((warning) => /broad cruise/i.test(warning)));
check("Google negative keywords are present", targeting.channelTargeting.google.negativeKeywords.includes("cruise job"));
check("TikTok concepts are generated", targeting.channelTargeting.tiktok.shortVideoConcepts.length > 0);
check("email subject angles are generated", targeting.channelTargeting.email.subjectLineAngles.length > 0);
check("research summary includes competitor blind spot", targeting.researchSummary.competitorBlindSpot.length > 20);
check("confidence score is strong for retail brief", targeting.confidence.score >= 80);
check("human review includes link health", targeting.confidence.needsHumanReview.some((item) => /link health/i.test(item)));
check("targeting keeps quick-sale retail orientation", !containsAny(targetingText, ["threshold", "waitlist", "tour conductor"]));
check("targeting is not generic cruise targeting only", containsAny(targetingText, ["urban sketching", "plein", "watercolor", "nature journaling"]));

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
