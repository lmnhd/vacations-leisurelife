/**
 * Verify CRUISE_LINE_NAMES against live Odysseus (operator-run).
 *
 * The Odysseus search API's `cruiseline.id` merely echoes the vendorId we filter
 * on, so it is NOT independent proof of which line an id maps to. The TRUE line
 * name only appears on the rendered package page (heading breadcrumb:
 * "N Nights | Destination | <Line>: <Ship> | Date"). For each id in the map (plus
 * a probe band to catch lines outside it), this opens one sample package and reads
 * that breadcrumb, then prints any MISMATCH vs. CRUISE_LINE_NAMES.
 *
 * Run this whenever a campaign shows a wrong cruise line, or before trusting the
 * map after any portal change. Read-only: never books/holds/publishes.
 *
 *   npm run verify-cruise-line-ids
 *   npm run verify-cruise-line-ids -- --ids 11,12,1043,8115,8116
 */
import { execSync } from "node:child_process";

import { CRUISE_LINE_NAMES } from "../lib/cb/link-broker/package-lookup";
import { releaseOdysseusSession } from "../lib/services/odysseus/OdysseusSessionManager";
import type { CruiseResult } from "../lib/services/odysseus/types";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function monthsFromNow(n: number): Date {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() + n);
  return d;
}
function mmddyyyy(d: Date): string {
  return `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")}/${d.getUTCFullYear()}`;
}
function sweepChrome(): void {
  if (process.platform !== "win32") return;
  try {
    const ps =
      "Get-CimInstance Win32_Process -Filter \"Name='chrome.exe'\" | " +
      "Where-Object { $_.CommandLine -match 'disable-blink-features=AutomationControlled' } | " +
      "ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }";
    execSync(`powershell -NoProfile -NonInteractive -Command "${ps}"`, { stdio: "ignore", timeout: 30000 });
  } catch {
    /* best-effort */
  }
}

/** Normalize a portal line name to compare against our map's short name. */
function looselyMatches(mapName: string, portalName: string): boolean {
  const a = mapName.toLowerCase().replace(/[^a-z]/g, "");
  const b = portalName.toLowerCase().replace(/[^a-z]/g, "");
  return b.includes(a) || a.includes(b);
}

async function main(): Promise<void> {
  sweepChrome();
  const { getOdysseusSession } = await import("../lib/services/odysseus/OdysseusSessionManager");
  const engine = await getOdysseusSession();
  const page = (engine as unknown as { odysseusPage: import("playwright").Page }).odysseusPage;
  const siid = (() => {
    try { return new URL(page.url()).searchParams.get("siid") ?? ""; } catch { return ""; }
  })();

  const start = mmddyyyy(monthsFromNow(3));
  const end = mmddyyyy(monthsFromNow(18));

  const ids = arg("ids")
    ? arg("ids")!.split(",").map((s) => Number(s.trim())).filter(Number.isFinite)
    : Object.keys(CRUISE_LINE_NAMES).map(Number);

  const mismatches: string[] = [];
  const ok: string[] = [];
  const empty: string[] = [];

  for (const id of ids) {
    const expected = CRUISE_LINE_NAMES[id] ?? "(not in map)";
    let results: CruiseResult[] = [];
    try {
      results = await engine.searchCruises({ passengers: 2, guestAges: [35, 35], startDate: start, endDate: end, vendorId: id });
    } catch {
      mismatches.push(`id ${id}: SEARCH ERROR (expected "${expected}")`);
      continue;
    }
    const sample = results.find((r) => r.packages?.[0]?.id);
    if (!sample) { empty.push(`id ${id} ("${expected}"): no sailings in window`); continue; }
    const pkgId = sample.packages![0].id;
    const url = `https://bookings.cbagenttools.com/swift/cruise/package/${pkgId}?${siid ? `siid=${siid}&` : ""}lang=1`;
    let portalLine = "";
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => undefined);
      const body = await page.evaluate(() => document.body.innerText).catch(() => "");
      const m = body.match(/\|\s*([A-Za-z][A-Za-z .&'-]+?)\s*:\s*([A-Za-z0-9].+?)\s*\|/);
      portalLine = m ? m[1].trim() : "(name not found on page)";
    } catch {
      portalLine = "(page error)";
    }
    if (looselyMatches(expected, portalLine)) {
      ok.push(`id ${id}: "${expected}" ✓ (portal: "${portalLine}", pkg ${pkgId})`);
    } else {
      mismatches.push(`id ${id}: MAP SAYS "${expected}" but PORTAL SAYS "${portalLine}" (pkg ${pkgId})`);
    }
  }

  console.log("\n=== CRUISE_LINE_NAMES verification ===");
  console.log(`\nOK (${ok.length}):`);
  for (const r of ok) console.log("  " + r);
  if (empty.length) {
    console.log(`\nNo sailings to verify (${empty.length}):`);
    for (const r of empty) console.log("  " + r);
  }
  if (mismatches.length) {
    console.log(`\n*** MISMATCHES (${mismatches.length}) — FIX CRUISE_LINE_NAMES ***`);
    for (const r of mismatches) console.log("  " + r);
    process.exitCode = 1;
  } else {
    console.log("\nNo mismatches. Map is consistent with the live portal. ✓");
  }
}

main()
  .then(async () => { try { await releaseOdysseusSession(); } catch { /* ignore */ } process.exit(process.exitCode ?? 0); })
  .catch(async (err) => { console.error("[verify-cruise-line-ids] Fatal:", err); try { await releaseOdysseusSession(); } catch {} process.exit(1); });
