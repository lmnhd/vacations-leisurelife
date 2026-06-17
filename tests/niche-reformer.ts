/**
 * Niche Re-former proof artifact (Deal Workflow Step 1B — inventory-first).
 *
 * Asserts the match-or-discard re-forming of a niche onto a REAL selected cruise:
 *   1. A matched outcome produces a full DealDiscoveryIdea whose groundedCandidate
 *      carries the REAL deal facts (package id, line, sail date, nights, ports).
 *   2. The grounded candidate is sourced from the deal — never fabricated.
 *   3. The produced angle passes the shared Sailing Angle voice rules.
 *   4. A model decline (nicheFits:false) yields a `held` outcome — no angle forced.
 *   5. A below-threshold fit confidence is held, not accepted.
 *   6. Missing saved research throws a clear operator error (no Gemini call).
 *
 * Run:
 *   npm run test:niche-reformer
 */

import {
  __setNicheReformerStructuredObjectGeneratorForTests,
  reformNicheForDeal,
  validateSailingAngleProfile,
  type SelectedDeal,
} from "../lib/cb/deals-system";
import { installDealsAiStub } from "./deals-ai-stub";

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

const GEN_AT = "2026-06-15T00:00:00.000Z";

const research = {
  psychographicData:
    "The solo-journaling tabletop roleplayer community: introverted writers who play diceless and dice-driven solo RPGs, keep analog campaign journals, and crave uninterrupted writing time.",
  aestheticData: "Quiet, balcony-rich ships with libraries and low-traffic lounges suit long sea-day voyages.",
  cachedAt: "2026-06-15",
};

const deal: SelectedDeal = {
  packageId: "1583429",
  cruiseCode: "JOURNEYS-SEA-14",
  cruiseName: "Journeys - 14-Day Southeast Asia",
  cruiseLine: "Carnival",
  shipId: 200,
  sailDateIso: "2027-01-27",
  nights: 14,
  departurePortCode: "SYD",
  arrivalPortCode: "SIN",
  portsOfCall: "Brisbane, Darwin, Bali",
  cabinPricing: { currencyCode: "USD", inside: 994.65, leadFare: 994.65 },
  leadFare: 994.65,
  hasGroupRate: false,
  applicablePromoIds: ["cbpromo-carnival"],
  qualityScore: 0.81,
  qualitySignals: [
    { signal: "value", points: 0.35, reason: "strong value at $71/night" },
    { signal: "sea_day_density", points: 0.17, reason: "~7 sea day(s) over 14n (7 ports)" },
    { signal: "itinerary_distinctiveness", points: 0.22, reason: "long one-way repositioning (syd→sin, 14n)" },
    { signal: "promo_overlap", points: 0.07, reason: "1 live promo(s) may apply" },
  ],
};

async function main(): Promise<void> {
  console.log("Niche Re-former - real selected cruise + research → fitted niche (match-or-discard)\n");

  installDealsAiStub();

  // --- Matched path ----------------------------------------------------------
  console.log("Matched path (stub claims a high-conviction fit):");
  const matched = await reformNicheForDeal(deal, { research, generatedAtIso: GEN_AT });
  check("returns a matched outcome", matched.status === "matched");
  if (matched.status === "matched") {
    const g = matched.idea.groundedCandidate;
    check("grounded candidate carries the REAL package id", g.packageId === "1583429");
    check("grounded candidate carries the real cruise line", g.cruiseLine === "Carnival");
    check("grounded candidate carries the real sail date", g.sailDateIso === "2027-01-27");
    check("grounded candidate carries the real nights", g.nights === 14);
    check("grounded candidate carries the real ports", (g.portsOfCall ?? "").includes("Bali"));
    check("grounded confidence is the deal quality score (not fabricated)", g.confidence === 0.81);
    check("idea has an isolated niche", matched.idea.isolatedNiche.length > 0);
    check("idea has an AI trace", Boolean(matched.idea.aiTrace && matched.idea.aiTrace.model.length > 0));
    check("idea generator is gpt", matched.idea.generator === "gpt");
    check("produced angle passes voice rules", validateSailingAngleProfile(matched.idea.sailingAngleProfile).length === 0, matched.voiceWarnings.join(", "));
    check("fit confidence is reported", matched.fitConfidence >= 0.7);
  }

  // --- Decline path (model says no fit) --------------------------------------
  console.log("\nDecline path (model declines — no angle forced):");
  __setNicheReformerStructuredObjectGeneratorForTests(async () => ({
    object: {
      nicheFits: false,
      fitConfidence: 0.2,
      fitReasoning: "This is a generic short itinerary; no niche in the research is an honest fit.",
    },
    modelId: "claude-opus-4-6",
    warnings: [],
  }));
  const declined = await reformNicheForDeal(deal, { research, generatedAtIso: GEN_AT });
  check("a decline yields a held outcome (no angle)", declined.status === "held");
  if (declined.status === "held") {
    check("held outcome explains why", declined.reason.toLowerCase().includes("declined"));
  }

  // --- Below-threshold path --------------------------------------------------
  console.log("\nBelow-threshold path (claims a fit but low confidence):");
  __setNicheReformerStructuredObjectGeneratorForTests(async () => ({
    object: {
      nicheFits: true,
      fitConfidence: 0.55,
      fitReasoning: "A weak maybe.",
      isolatedNiche: "The Maybe Niche",
      angle: {
        sailingAngleTitle: "A Weak Fit at Sea",
        theCorePitch: "Two sentences of plausible but uncertain pitch copy here. It might work for someone.",
        visualAnchor: "A tentative image.",
        targetAudienceDescriptor: "Some people, maybe.",
        relevantKeywords: ["one", "two", "three", "four", "five", "six"],
        destinationAndTimeOfYearHints: "A 14-night Southeast Asia repositioning in January.",
        onboardAssetRequirements: "A balcony and a quiet lounge.",
      },
    },
    modelId: "claude-opus-4-6",
    warnings: [],
  }));
  const lowFit = await reformNicheForDeal(deal, { research, generatedAtIso: GEN_AT });
  check("below-threshold fit is held, not accepted", lowFit.status === "held");
  if (lowFit.status === "held") {
    check("held reason cites the threshold", lowFit.reason.includes("below threshold"));
  }

  // --- Missing research ------------------------------------------------------
  console.log("\nMissing research guard:");
  let threw = false;
  try {
    await reformNicheForDeal(deal, { research: { psychographicData: "", aestheticData: "" }, generatedAtIso: GEN_AT });
  } catch {
    threw = true;
  }
  check("missing saved research throws a clear operator error", threw);

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
