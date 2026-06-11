/**
 * Deal Discovery proof artifact: niche research → Sailing Angle Profiles.
 *
 * Asserts:
 *   1. generateDealDiscoveryIdeas produces SailingAngleProfile-shaped angles with
 *      generator "gpt", an isolated niche, and an AI trace.
 *   2. No banned mass-group language or generic travel clichés leak into the copy.
 *   3. Missing saved research throws a clear operator error (no Gemini call).
 *   4. upsertDealDiscoveryIdea is idempotent on id.
 *   5. The deal-discovery cache validator accepts a generated angle.
 *
 * Run:
 *   npm run test:deal-discovery
 */

import {
  emptyDealDiscoveryIdeasCache,
  generateDealDiscoveryIdeas,
  upsertDealDiscoveryIdea,
  validateDealDiscoveryIdeasCache,
  validateSailingAngleProfile,
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

const GEN_AT = "2026-06-10T00:00:00.000Z";

const research = {
  psychographicData:
    "The cyanotype and alternative-process community: botanical sun-printing artists with strong creator ecosystems and gear spend.",
  aestheticData: "Open-deck, balcony-rich ships and high-UV itineraries suit sun printers.",
  cachedAt: "2026-06-10",
};

async function main(): Promise<void> {
  console.log("Deal Discovery - niche research → Sailing Angle Profiles\n");

  // --- Generation shape ------------------------------------------------------
  console.log("Angle generation:");
  const first = await generateDealDiscoveryIdeas({ count: 1, research, generatedAtIso: GEN_AT });
  check("produced at least one angle", first.ideas.length >= 1);
  check("first run reports no skips", first.skipped.length === 0);
  check("first run is not exhausted", first.exhausted === false);

  const idea = first.ideas[0];
  const p = idea.sailingAngleProfile;
  check("idea generator is gpt", idea.generator === "gpt");
  check("idea has aiTrace", Boolean(idea.aiTrace && idea.aiTrace.model.length > 0));
  check("idea records source research date", idea.sourceResearchCachedAt === "2026-06-10");
  check("idea names the isolated niche", idea.isolatedNiche.length > 5);
  check("idea id is an angle slug", idea.id.startsWith("angle-"));
  check("title is a punchy hook", p.sailingAngleTitle.split(/\s+/).length <= 8 && p.sailingAngleTitle.length > 3);
  check("core pitch is present", p.theCorePitch.length > 40);
  check("visual anchor is present", p.visualAnchor.length > 20);
  check("audience descriptor is present", p.targetAudienceDescriptor.length > 20);
  check("has 6-8 relevant keywords", p.relevantKeywords.length >= 6 && p.relevantKeywords.length <= 8);
  check("has destination/season hints", p.destinationAndTimeOfYearHints.length > 20);
  check("has onboard asset requirements", p.onboardAssetRequirements.length > 20);

  // --- Banned language -------------------------------------------------------
  console.log("\nBanned language (no group / generic travel):");
  const warnings = validateSailingAngleProfile(p);
  check("profile carries no banned-language warnings", warnings.length === 0, warnings.join(", "));

  // --- Missing research errors clearly ---------------------------------------
  console.log("\nMissing research handling:");
  let threw = false;
  let message = "";
  try {
    await generateDealDiscoveryIdeas({ count: 1, research: {} });
  } catch (err) {
    threw = true;
    message = err instanceof Error ? err.message : String(err);
  }
  check("throws when no saved research", threw);
  check("error names the saved-research requirement", /no saved discovery research/i.test(message), message);

  // --- Dedup on re-run -------------------------------------------------------
  // The stub always returns the same single angle. A second run that passes the
  // first run's ideas as existingAngles must skip the duplicate and report
  // nothing new (exhausted) — proving repeated clicks don't regenerate the same.
  console.log("\nDedup on re-run:");
  const second = await generateDealDiscoveryIdeas({
    count: 1,
    research,
    existingAngles: first.ideas,
    generatedAtIso: GEN_AT,
  });
  check("re-run produces no new angle for a duplicate niche", second.ideas.length === 0);
  check("re-run reports the duplicate as skipped", second.skipped.length === 1);
  check("re-run is flagged exhausted", second.exhausted === true);

  // --- Cache idempotency + validation ----------------------------------------
  console.log("\nCache upsert + validation:");
  let cache = emptyDealDiscoveryIdeasCache(GEN_AT);
  cache = upsertDealDiscoveryIdea(cache, idea);
  cache = upsertDealDiscoveryIdea(cache, idea);
  check("upsert is idempotent on id", cache.ideas.length === 1);

  const validation = validateDealDiscoveryIdeasCache(cache);
  check("validator accepts the generated angle cache", validation.ok, validation.errors.join("; "));

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
