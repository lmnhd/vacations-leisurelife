/**
 * Operator-run Deep Cruise Search sweep (Deal Workflow Step 1A).
 *
 * Pulls a BROAD slate of real, bookable Odysseus sailings across forward date
 * windows (vendor-unfiltered, so all lines compete), then scores + selects the
 * top "excellent deals" by objective deal-quality signals (lead fare, sea-day
 * density, itinerary distinctiveness, live-promo overlap). Emits a machine-
 * readable JSON block the discovery route parses. Read-only Odysseus search; no
 * booking / hold / guest-info action.
 *
 * Usage:
 *   npm run deep-cruise-search                       # default 6/12/18-mo windows
 *   npm run deep-cruise-search -- --select 8         # select top 8 deals
 *   npm run deep-cruise-search -- --months 3,6,9,12  # custom forward windows
 */

import { execSync } from "node:child_process";

import { selectDealsFromSweep, type RawSailing } from "../lib/cb/deals-system/deep-cruise-search";
import { listPromoRecords } from "../lib/cb/deals-system/deals-dynamo-store";
import { releaseOdysseusSession } from "../lib/services/odysseus/OdysseusSessionManager";
import type { CbPromoIntelligenceRecord } from "../lib/cb/deals-system/promo-intelligence-types";
import type { CruiseResult } from "../lib/services/odysseus/types";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** MM/DD/YYYY for a date `monthsAhead` from today. */
function monthsFromNow(monthsAhead: number): Date {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() + monthsAhead);
  return d;
}
function toMmDdYyyy(d: Date): string {
  return `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")}/${d.getUTCFullYear()}`;
}

/**
 * Sweep ORPHANED automation Chrome left by prior runs that didn't tear down
 * cleanly (mirrors lookup-odysseus-package.ts). Best-effort; never blocks.
 */
function sweepOrphanedAutomationChrome(): void {
  if (process.platform !== "win32") return;
  try {
    const ps =
      "Get-CimInstance Win32_Process -Filter \"Name='chrome.exe'\" | " +
      "Where-Object { $_.CommandLine -match 'disable-blink-features=AutomationControlled' } | " +
      "ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }";
    execSync(`powershell -NoProfile -NonInteractive -Command "${ps}"`, { stdio: "ignore", timeout: 30000 });
    console.log("[deep-cruise-search] Swept any orphaned automation Chrome before start.");
  } catch {
    /* best-effort cleanup — never block the sweep */
  }
}

async function loadPromoRecords(): Promise<CbPromoIntelligenceRecord[]> {
  try {
    return await listPromoRecords();
  } catch {
    return [];
  }
}

async function main(): Promise<void> {
  sweepOrphanedAutomationChrome();

  const selectCount = arg("select") ? Number(arg("select")) : 5;
  const months = (arg("months") ?? "6,12,18")
    .split(",")
    .map((m) => Number(m.trim()))
    .filter((m) => Number.isFinite(m) && m > 0);
  // Each window spans ~3 months starting at the requested forward offset.
  const windows = months.map((m) => ({
    startDate: toMmDdYyyy(monthsFromNow(m)),
    endDate: toMmDdYyyy(monthsFromNow(m + 3)),
  }));

  // Target "anti-typical / elite" cruise lines by Odysseus vendor ID. VERIFIED
  // 2026-06-16 against live Odysseus (see CRUISE_LINE_NAMES in package-lookup.ts).
  // These are swept explicitly so the unfiltered API (which sorts by cruiselinePriority
  // and surfaces Carnival first) doesn't crowd out every other line. Mass-market
  // lines (Carnival=1, RCL=8, Norwegian=6, MSC=982, Costa=10, Disney=4) are excluded
  // here — they appear in the unfiltered pass but the prestige scorer ranks them
  // below these targeted lines when both compete for the same slots.
  const TARGET_VENDOR_IDS: number[] = [
    8116, // Regent Seven Seas (ultra-luxury)
    11,   // Seabourn (ultra-luxury)
    8115, // Silversea (ultra-luxury)
    3,    // Crystal (ultra-luxury)
    12,   // Cunard (ultra-luxury / iconic)
    14,   // Oceania (premium)
    1043, // Azamara (premium)
    2,    // Celebrity (premium)
    5,    // Holland America (premium)
    7,    // Princess (premium)
  ];

  console.log(
    `[deep-cruise-search] Sweeping ${windows.length} window(s) × ` +
      `${TARGET_VENDOR_IDS.length} target line(s) + 1 unfiltered pass: ` +
      windows.map((w) => `${w.startDate}..${w.endDate}`).join(", ")
  );

  const { getOdysseusSession } = await import("../lib/services/odysseus/OdysseusSessionManager");
  const engine = await getOdysseusSession();

  const sweep: RawSailing[] = [];
  const searchNotes: string[] = [];

  // Per-line targeted sweeps — one API call per (line × window) pair.
  for (const vendorId of TARGET_VENDOR_IDS) {
    for (const window of windows) {
      const results: CruiseResult[] = await engine.searchCruises({
        passengers: 2,
        guestAges: [35, 35],
        startDate: window.startDate,
        endDate: window.endDate,
        vendorId,
      });
      searchNotes.push(`Vendor ${vendorId} | ${window.startDate}..${window.endDate}: ${results.length} result(s).`);
      for (const result of results) sweep.push({ result });
    }
  }

  // One unfiltered pass per window to catch any non-targeted lines that happen to
  // score well (unknown lines get neutral prestige = 0.5 in the scorer).
  for (const window of windows) {
    const results: CruiseResult[] = await engine.searchCruises({
      passengers: 2,
      guestAges: [35, 35],
      startDate: window.startDate,
      endDate: window.endDate,
    });
    searchNotes.push(`Unfiltered | ${window.startDate}..${window.endDate}: ${results.length} result(s).`);
    for (const result of results) sweep.push({ result });
  }

  for (const note of searchNotes) console.log(`  - ${note}`);

  const promoRecords = await loadPromoRecords();
  console.log(`[deep-cruise-search] Loaded ${promoRecords.length} live promo record(s) for overlap scoring.`);

  const selection = selectDealsFromSweep(sweep, { promoRecords, selectCount });

  console.log("\nDiagnostics:");
  for (const d of selection.diagnostics) console.log(`  - ${d}`);

  console.log(`\nTop selected deals (${selection.selected.length}):`);
  for (const deal of selection.selected) {
    console.log(
      `  [${deal.qualityScore.toFixed(2)}] pkg ${deal.packageId} | ${deal.cruiseName} | ` +
        `${deal.cruiseLine ?? "?"} | ${deal.sailDateIso}${deal.nights ? ` ${deal.nights}n` : ""}` +
        `${deal.leadFare ? ` | from $${deal.leadFare}` : ""}`
    );
    for (const s of deal.qualitySignals) {
      if (s.points > 0) console.log(`        +${s.points.toFixed(2)} ${s.signal}: ${s.reason}`);
    }
  }

  const jsonPayload = {
    selected: selection.selected,
    ranked: selection.ranked,
    diagnostics: [...searchNotes, ...selection.diagnostics],
  };
  console.log(`\n---DEEP_CRUISE_SEARCH_RESULT_JSON---\n${JSON.stringify(jsonPayload)}\n---END_JSON---`);
}

main()
  .then(async () => {
    try {
      await releaseOdysseusSession();
    } catch {
      /* ignore */
    }
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("[deep-cruise-search] Fatal error:", err);
    try {
      await releaseOdysseusSession();
    } catch {
      /* ignore */
    }
    process.exit(1);
  });
