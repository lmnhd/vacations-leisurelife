import { assessPromoHandoff } from "../lib/cb/deals-system/promo-handoff-assessment";

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

function main(): void {
  console.log("Deal promo handoff assessment\n");

  const noPromo = assessPromoHandoff({
    cruiseLine: "Celebrity Cruises",
    campaignAngle: "No-fly Southampton departure",
    targetAudience: "UK-based cruisers aged 45-70 departing Southampton",
    targetingKeywords: ["Southampton cruise", "Celebrity Apex"],
    selectedPromos: [],
    cruiseLinePromoCount: 1,
  });
  check("no selected promo produces no_promo_selected status", noPromo.status === "no_promo_selected");
  check(
    "no selected promo warns that pipeline will become no-promo",
    noPromo.warnings.some((warning) => warning.includes("no-promo manifest"))
  );

  const mismatch = assessPromoHandoff({
    cruiseLine: "Celebrity Cruises",
    campaignAngle: "No-fly Southampton departure",
    targetAudience: "United Kingdom guests who want a Southampton sailing",
    targetingKeywords: ["Southampton", "UK cruise"],
    selectedPromos: [
      {
        id: "promo-1",
        title: "Summer Sale",
        vendor: "Celebrity Cruises",
        applicableMarkets: ["US", "Canada", "Latin America"],
      },
    ],
    cruiseLinePromoCount: 1,
  });
  check("UK audience infers UK market", mismatch.inferredAudienceMarket === "UK");
  check("mismatched promo blocks handoff", mismatch.status === "promo_market_mismatch");
  check(
    "mismatch explains selected promo market conflict",
    mismatch.blockingIssues.some((issue) => issue.includes("United Kingdom")),
    mismatch.blockingIssues.join(" | ")
  );

  const compatible = assessPromoHandoff({
    cruiseLine: "Celebrity Cruises",
    campaignAngle: "Celebrity Apex from Fort Lauderdale",
    targetAudience: "United States travelers looking for Celebrity deals",
    targetingKeywords: ["Fort Lauderdale", "Celebrity Cruises", "US cruise deal"],
    selectedPromos: [
      {
        id: "promo-2",
        title: "Summer Sale",
        vendor: "Celebrity Cruises",
        applicableMarkets: ["US", "Canada"],
      },
    ],
    cruiseLinePromoCount: 1,
  });
  check("US audience can keep US promo", compatible.status === "promo_attached");
  check("compatible promo has no blocking issues", compatible.blockingIssues.length === 0);

  console.log(`\nResults: ${passed} passed, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

main();
