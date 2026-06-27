/**
 * Operator-run cabin pricing drift check for published Deals.
 *
 * Cabin pricing is captured ONCE at resolve time (Step 4) and frozen onto the
 * Deal's cruiseFacts.cabinPrices forever after — there is no live re-fetch
 * when the public /deals/[id] page renders. Real cruise pricing moves
 * (promotions expire, fares reprice), so a published Deal's displayed price
 * can silently drift away from what CB Agent Tools' live booking page
 * actually charges.
 *
 * This script scrapes the live cabin-tier prices directly off each Deal's
 * own bookingUrl — the exact page a guest sees — and compares them against
 * what's stored. It NEVER WRITES — flag-only by design, since this is
 * public-facing pricing data and an operator should review and decide how to
 * update each mismatch (see RED_FLAG_GOOGLE_ADS_PLACEMENT_FABRICATION.md for
 * the standing house principle: don't let an unattended process change
 * something a guest-facing page asserts as fact). Use the dashboard's
 * Pricing Check panel (Tools tab) for a one-click per-tier apply once you've
 * reviewed a mismatch, or a manual Dynamo edit.
 *
 * An earlier version of this script ran a fresh Odysseus search and matched
 * by packageId, but Odysseus can re-index/re-rate a sailing under a NEW
 * packageId between searches (same physical cruise, different id), which
 * made comparisons unreliable and occasionally impossible. Reading the
 * booking page directly sidesteps that — there's no id to match.
 *
 * Read-only (navigates the booking page only — never books/holds).
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/check-deal-pricing.ts                  # all published deals
 *   npx tsx --env-file=.env.local scripts/check-deal-pricing.ts --deal 1543052   # one deal (id or packageId)
 *   npx tsx --env-file=.env.local scripts/check-deal-pricing.ts --tolerance 10   # flag only if >10% off (default 5)
 */

import { execSync } from "node:child_process";
import * as fs from "fs";
import * as path from "path";

import { listCuratedDeals } from "../lib/cb/deals-system/deals-dynamo-store";
import { scrapeLiveBookingPagePricing } from "../lib/cb/link-broker/browser-validate";
import type { BookingPageCabinPrices } from "../lib/cb/link-broker/browser-validate";
import type { CuratedOdysseusDeal, CuratedDealCabinPrices } from "../lib/cb/deals-system/curated-deal-types";

const CABIN_TIERS = ["inside", "outside", "balcony", "suite"] as const;
type CabinTier = (typeof CABIN_TIERS)[number];

const PLAYWRIGHT_STATE_FILE = path.join(process.cwd(), ".playwright-state.json");
const REAL_CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** Sweep orphaned automation Chrome before a cold-start (Windows only). Mirrors backfill-deal-itinerary.ts. */
function sweepOrphanedAutomationChrome(): void {
  if (process.platform !== "win32") return;
  try {
    const ps =
      "Get-CimInstance Win32_Process -Filter \"Name='chrome.exe'\" | " +
      "Where-Object { $_.CommandLine -match 'disable-blink-features=AutomationControlled' } | " +
      "ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }";
    execSync(`powershell -NoProfile -NonInteractive -Command "${ps}"`, { stdio: "ignore", timeout: 30000 });
    console.log("[check-deal-pricing] Swept any orphaned automation Chrome before start.");
  } catch {
    /* best-effort */
  }
}

interface TierMismatch {
  tier: CabinTier;
  stored: number;
  live: number;
  percentDelta: number;
}

function compareTiers(
  stored: CuratedDealCabinPrices,
  live: BookingPageCabinPrices,
  toleranceFraction: number
): TierMismatch[] {
  const mismatches: TierMismatch[] = [];
  for (const tier of CABIN_TIERS) {
    const storedValue = stored[tier];
    const liveValue = live[tier];
    if (typeof storedValue !== "number" || typeof liveValue !== "number") continue;
    if (storedValue <= 0) continue;
    const percentDelta = ((liveValue - storedValue) / storedValue) * 100;
    if (Math.abs(percentDelta) / 100 > toleranceFraction) {
      mismatches.push({ tier, stored: storedValue, live: liveValue, percentDelta });
    }
  }
  return mismatches;
}

async function checkOneDeal(
  deal: CuratedOdysseusDeal,
  toleranceFraction: number
): Promise<{ checked: boolean; mismatches: TierMismatch[]; note?: string }> {
  const hasStoredPricing = CABIN_TIERS.some((t) => typeof deal.cruiseFacts.cabinPrices[t] === "number");
  if (!hasStoredPricing) {
    return { checked: false, mismatches: [], note: "no stored cabin pricing to compare against" };
  }
  if (!deal.bookingUrl) {
    return { checked: false, mismatches: [], note: "deal has no bookingUrl to scrape" };
  }

  const outcome = await scrapeLiveBookingPagePricing(deal.bookingUrl, {
    storageStatePath: fs.existsSync(PLAYWRIGHT_STATE_FILE) ? PLAYWRIGHT_STATE_FILE : undefined,
    executablePath: fs.existsSync(REAL_CHROME_PATH) ? REAL_CHROME_PATH : undefined,
  });

  if (!outcome.ok || !outcome.prices) {
    return {
      checked: false,
      mismatches: [],
      note: `could not read live pricing from the booking page: ${outcome.failureReason ?? "unknown reason"}`,
    };
  }

  const mismatches = compareTiers(deal.cruiseFacts.cabinPrices, outcome.prices, toleranceFraction);
  return { checked: true, mismatches };
}

async function main(): Promise<void> {
  const dealArg = arg("deal");
  const toleranceFraction = (Number(arg("tolerance")) || 5) / 100;

  const all = await listCuratedDeals();
  const targets = dealArg ? all.filter((d) => d.id === dealArg || d.packageId === dealArg) : all;

  if (dealArg && targets.length === 0) {
    console.error(`No curated deal found for "${dealArg}". (Checked id and packageId.)`);
    process.exit(1);
  }

  console.log(
    `[check-deal-pricing] Checking ${targets.length} deal(s) (tolerance ±${(toleranceFraction * 100).toFixed(0)}%)...\n`
  );

  sweepOrphanedAutomationChrome();

  let checked = 0;
  let mismatched = 0;
  let skipped = 0;

  for (const deal of targets) {
    const label = `${deal.id} (${deal.cruiseFacts.shipName ?? deal.cruiseFacts.cruiseLine ?? "?"}, ${deal.cruiseFacts.itineraryName ?? "?"})`;
    console.log(`  Deal ${label}:`);
    try {
      const result = await checkOneDeal(deal, toleranceFraction);
      if (!result.checked) {
        console.log(`    ⏭  skipped — ${result.note}`);
        skipped++;
        continue;
      }
      checked++;
      if (result.mismatches.length === 0) {
        console.log(`    ✅ within tolerance`);
      } else {
        mismatched++;
        for (const m of result.mismatches) {
          const sign = m.percentDelta > 0 ? "+" : "";
          console.log(
            `    ⚠️  ${m.tier}: stored $${m.stored.toFixed(2)} → live $${m.live.toFixed(2)} (${sign}${m.percentDelta.toFixed(1)}%) MISMATCH`
          );
        }
      }
    } catch (error) {
      console.log(`    ✗ check failed: ${error instanceof Error ? error.message : String(error)}`);
      skipped++;
    }
  }

  console.log(
    `\n[check-deal-pricing] Done. checked=${checked} mismatched=${mismatched} skipped=${skipped}. No writes were made — review mismatches above and correct via the dashboard's Pricing Check panel or a manual Dynamo edit.`
  );
}

main().catch((err) => {
  console.error("[check-deal-pricing] Fatal error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
