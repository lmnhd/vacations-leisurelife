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

import { execSync } from "node:child_process";

import { lookupOdysseusPackages } from "../lib/cb/link-broker/odysseus-lookup";
import { releaseOdysseusSession } from "../lib/services/odysseus/OdysseusSessionManager";
import { resolveBestBookingLink } from "../lib/cb/link-broker";
import type { LinkBrokerCruiseFacts } from "../lib/cb/link-broker";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

/**
 * Sweep ORPHANED automation Chrome left by prior lookups that didn't tear down
 * cleanly. Each lookup is its own process with its own headless browser; if one
 * is killed mid-flight (timeout, Ctrl-C) the browser orphans and piles up until
 * the machine is choked and fresh cold-starts can't finish in time → the
 * "Command failed" spam. We only target windows launched with our automation
 * flag, so the operator's real Chrome is never touched. Best-effort: failures
 * here must never block the actual lookup.
 */
function sweepOrphanedAutomationChrome(): void {
  if (process.platform !== "win32") return;
  try {
    const ps =
      "Get-CimInstance Win32_Process -Filter \"Name='chrome.exe'\" | " +
      "Where-Object { $_.CommandLine -match 'disable-blink-features=AutomationControlled' } | " +
      "ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }";
    execSync(`powershell -NoProfile -NonInteractive -Command "${ps}"`, { stdio: "ignore", timeout: 30000 });
    console.log("[lookup-odysseus-package] Swept any orphaned automation Chrome before start.");
  } catch {
    /* best-effort cleanup — never block the lookup */
  }
}

async function main(): Promise<void> {
  sweepOrphanedAutomationChrome();

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

  const bestEffort = flag("best-effort");
  console.log("[lookup-odysseus-package] Cruise facts:", JSON.stringify(facts), bestEffort ? "(best-effort)" : "");
  const result = await lookupOdysseusPackages(facts, {
    searchWindowDays: arg("window") ? Number(arg("window")) : 7,
    bestEffort,
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
  // Emit a machine-readable JSON block so the route parser can recover the
  // FULL candidate data (itinerary, cabin pricing, cruise line) — not just
  // the summary lines above.
  const jsonPayload = {
    status: result.status,
    diagnostics: result.diagnostics,
    selected: result.selected
      ? {
          packageId: result.selected.packageId,
          cruiseName: result.selected.cruiseName,
          cruiseCode: result.selected.cruiseCode,
          cruiseLine: result.selected.cruiseLine,
          sailDateIso: result.selected.sailDateIso,
          nights: result.selected.nights,
          departurePortCode: result.selected.departurePortCode,
          portsOfCall: result.selected.portsOfCall,
          itinerary: result.selected.itinerary,
          cabinPricing: result.selected.cabinPricing,
          confidence: result.selected.confidence,
          reasons: result.selected.reasons,
        }
      : undefined,
    candidates: result.candidates.map((c) => ({
      packageId: c.packageId,
      cruiseName: c.cruiseName,
      cruiseCode: c.cruiseCode,
      cruiseLine: c.cruiseLine,
      sailDateIso: c.sailDateIso,
      nights: c.nights,
      departurePortCode: c.departurePortCode,
      portsOfCall: c.portsOfCall,
      itinerary: c.itinerary,
      cabinPricing: c.cabinPricing,
      confidence: c.confidence,
      reasons: c.reasons,
    })),
  };
  console.log(`\n---ODYSSEUS_LOOKUP_RESULT_JSON---\n${JSON.stringify(jsonPayload)}\n---END_JSON---`);

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

main()
  .then(async () => {
    // Close the browser the lookup opened. The session manager only releases on
    // its own error path, so on the SUCCESS path the headless browser would
    // otherwise orphan and pile up across runs. Always tear down, then exit
    // promptly so a lingering browser handle can't keep the process alive.
    try {
      await releaseOdysseusSession();
    } catch {
      /* ignore */
    }
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("[lookup-odysseus-package] Fatal error:", err);
    try {
      await releaseOdysseusSession();
    } catch {
      /* ignore */
    }
    process.exit(1);
  });
