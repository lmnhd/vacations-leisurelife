/**
 * Operator-run Odysseus package lookup (Phase 6 proof artifact).
 *
 * Resolves cruise facts into a ranked set of Odysseus package candidates, and
 * optionally hands the resolved package to the Link Broker to produce a booking
 * link. Read-only Odysseus search; no booking/hold/guest-info action.
 *
 * Usage:
 *   npm run lookup-odysseus-package -- --line "Royal Caribbean" --date 2026-11-08
 *   npm run lookup-odysseus-package -- --line Celebrity --ship "Edge" --date 2026-09-01 --nights 7
 *   npm run lookup-odysseus-package -- --line "Royal Caribbean" --date 2026-11-08 --build-link
 */

import { lookupOdysseusPackages } from "../lib/cb/link-broker/odysseus-lookup";
import { resolveBestBookingLink } from "../lib/cb/link-broker";
import type { LinkBrokerCruiseFacts } from "../lib/cb/link-broker";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main(): Promise<void> {
  const facts: LinkBrokerCruiseFacts = {
    cruiseLine: arg("line"),
    shipName: arg("ship"),
    sailDate: arg("date"),
    nights: arg("nights") ? Number(arg("nights")) : undefined,
    destination: arg("destination"),
    departurePort: arg("port"),
  };

  if (!facts.cruiseLine && !facts.shipName) {
    throw new Error("Provide at least --line or --ship (and ideally --date).");
  }

  console.log("[lookup-odysseus-package] Cruise facts:", JSON.stringify(facts));
  const result = await lookupOdysseusPackages(facts, {
    searchWindowDays: arg("window") ? Number(arg("window")) : 7,
  });

  console.log(`\nStatus: ${result.status}`);
  console.log("Diagnostics:");
  for (const d of result.diagnostics) console.log(`  - ${d}`);

  if (result.selected) {
    console.log("\nSelected:");
    console.log(`  package ${result.selected.packageId} | ${result.selected.cruiseName}`);
    console.log(
      `  ${result.selected.cruiseLine ?? "?"} | ${result.selected.sailDateIso} | ` +
        `${result.selected.nights ?? "?"}n | confidence ${result.selected.confidence.toFixed(2)}`
    );
    console.log(`  reasons: ${result.selected.reasons.join("; ")}`);
  }

  if (result.candidates.length > 0) {
    console.log(`\nTop candidates (${result.candidates.length}):`);
    for (const c of result.candidates.slice(0, 8)) {
      console.log(
        `  [${c.confidence.toFixed(2)}] pkg ${c.packageId} | ${c.cruiseName} | ` +
          `${c.sailDateIso}${c.nights ? ` ${c.nights}n` : ""}`
      );
    }
  }

  // Optionally feed the lookup straight into the broker.
  if (flag("build-link")) {
    console.log("\n[lookup-odysseus-package] Building booking link via the broker...");
    const output = await resolveBestBookingLink(
      { intent: "find_best_link", cruise: facts, agent: { siid: process.env.CB_AGENT_SIID || "1049337" } },
      { useCache: false, packageLookup: (f) => lookupOdysseusPackages(f) }
    );
    console.log(`  broker status: ${output.status}`);
    console.log(`  link class:    ${output.linkClass}`);
    if (output.url) console.log(`  url:           ${output.url}`);
    if (output.warnings.length) console.log(`  warnings:\n    - ${output.warnings.join("\n    - ")}`);
  }
}

main().catch((err) => {
  console.error("[lookup-odysseus-package] Fatal error:", err);
  process.exit(1);
});
