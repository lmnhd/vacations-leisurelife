/**
 * Operator-run backfill: capture the REAL day-by-day itinerary for an already
 * published Deal that was resolved before the itinerary-capture pipeline existed.
 *
 * Such deals carry only the coarse ports-of-call STRING, so the public page can
 * render nothing but a deduped port list. The full per-day schedule (port names,
 * arrival/departure times, sea days) lives at /nitroapi/v2/cruise/itinerary/{id}.
 * This script:
 *   1. loads the curated Deal (+ its trip manifest) from the live store,
 *   2. drives a read-only Odysseus search for the sailing to recover its
 *      itinerary id (deals resolved pre-pipeline never stored one),
 *   3. fetches + normalizes the day-by-day schedule for that id,
 *   4. writes it back onto the Deal's cruiseFacts (and the manifest's resolved
 *      package) so /deals/[id] renders the real itinerary immediately.
 *
 * Read-only against Odysseus (search + itinerary detail only — never books/holds).
 * Idempotent: a deal that already has a day-by-day schedule is left untouched
 * unless --force is passed.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/backfill-deal-itinerary.ts --deal 1582993
 *   npx tsx --env-file=.env.local scripts/backfill-deal-itinerary.ts --deal 1582993 --force
 *   npx tsx --env-file=.env.local scripts/backfill-deal-itinerary.ts --deal 1582993 --dry-run
 */

import { execSync } from "node:child_process";

import {
  getCuratedDeal,
  listCuratedDeals,
  listDealTripManifests,
  upsertCuratedDealRecord,
  upsertDealTripManifestRecord,
} from "../lib/cb/deals-system/deals-dynamo-store";
import {
  captureDayByDayItinerary,
  lookupOdysseusPackages,
} from "../lib/cb/link-broker/odysseus-lookup";
import { releaseOdysseusSession } from "../lib/services/odysseus/OdysseusSessionManager";
import type { CuratedOdysseusDeal } from "../lib/cb/deals-system/curated-deal-types";
import type { DealTripManifest } from "../lib/cb/deals-system/deal-trip-manifest-types";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

/** Sweep orphaned automation Chrome before a cold-start (Windows only). */
function sweepOrphanedAutomationChrome(): void {
  if (process.platform !== "win32") return;
  try {
    const ps =
      "Get-CimInstance Win32_Process -Filter \"Name='chrome.exe'\" | " +
      "Where-Object { $_.CommandLine -match 'disable-blink-features=AutomationControlled' } | " +
      "ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }";
    execSync(`powershell -NoProfile -NonInteractive -Command "${ps}"`, { stdio: "ignore", timeout: 30000 });
    console.log("[backfill-deal-itinerary] Swept any orphaned automation Chrome before start.");
  } catch {
    /* best-effort */
  }
}

/** Find the trip manifest backing a deal by matching the resolved package id. */
function manifestForDeal(
  deal: CuratedOdysseusDeal,
  manifests: DealTripManifest[]
): DealTripManifest | undefined {
  return manifests.find((m) => m.resolvedPackage?.packageId === deal.packageId);
}

async function main(): Promise<void> {
  const dealId = arg("deal");
  if (!dealId) {
    console.error("Usage: scripts/backfill-deal-itinerary.ts --deal <dealId|packageId> [--force] [--dry-run]");
    process.exit(1);
  }
  const force = flag("force");
  const dryRun = flag("dry-run");

  // The deal id on the public route may be the packageId or the curated id; try
  // a direct get first, then fall back to scanning by packageId.
  let deal = await getCuratedDeal(dealId);
  if (!deal) {
    const all = await listCuratedDeals();
    deal = all.find((d) => d.packageId === dealId || d.id === dealId) ?? null;
  }
  if (!deal) {
    console.error(`No curated deal found for "${dealId}". (Checked id and packageId.)`);
    process.exit(1);
  }

  console.log(`Deal: ${deal.id} | package ${deal.packageId} | ${deal.cruiseFacts.shipName ?? deal.cruiseFacts.cruiseLine}`);
  console.log(`  sail ${deal.cruiseFacts.sailDateIso ?? "?"} | ${deal.cruiseFacts.nights ?? "?"} nights`);

  if (deal.cruiseFacts.dayByDayItinerary && deal.cruiseFacts.dayByDayItinerary.length > 0 && !force) {
    console.log(`  Already has ${deal.cruiseFacts.dayByDayItinerary.length} day node(s). Pass --force to recapture. Nothing to do.`);
    return;
  }

  const manifests = await listDealTripManifests();
  const manifest = manifestForDeal(deal, manifests);
  if (!manifest) {
    console.warn(`  ⚠ No trip manifest matched package ${deal.packageId}; will patch the deal only.`);
  }

  // ── Recover the itinerary id via a live search ─────────────────────────────
  sweepOrphanedAutomationChrome();
  let itineraryId: number | undefined;
  try {
    console.log(`  Searching Odysseus for the sailing to recover its itinerary id…`);
    const lookup = await lookupOdysseusPackages({
      cruiseLine: deal.cruiseFacts.cruiseLine,
      shipName: deal.cruiseFacts.shipName ?? undefined,
      sailDate: deal.cruiseFacts.sailDateIso ?? undefined,
      nights: deal.cruiseFacts.nights ?? undefined,
    });
    lookup.diagnostics.forEach((d) => console.log(`    · ${d}`));
    const match =
      lookup.candidates.find((c) => c.packageId === deal!.packageId) ?? lookup.selected ?? lookup.candidates[0];
    itineraryId = match?.itinerary?.itineraryId;
    if (match && match.packageId !== deal.packageId) {
      console.warn(`  ⚠ Exact package ${deal.packageId} not in results; using closest match ${match.packageId}.`);
    }
  } finally {
    try {
      await releaseOdysseusSession();
    } catch {
      /* ignore */
    }
  }

  if (!itineraryId) {
    console.error("  ✗ Could not recover an itinerary id from the search — cannot capture the schedule. Aborting (no data fabricated).");
    process.exit(1);
  }
  console.log(`  Itinerary id: ${itineraryId}`);

  // ── Capture + normalize the real day-by-day schedule ───────────────────────
  const dayByDay = await captureDayByDayItinerary(itineraryId);
  if (!dayByDay || dayByDay.days.length === 0) {
    console.error(`  ✗ Itinerary detail endpoint returned no usable schedule for ${itineraryId}. Aborting.`);
    process.exit(1);
  }
  const flatDays = dayByDay.days.map((d) => ({ ...d }));
  console.log(`  ✓ Captured ${flatDays.length} day node(s): Day ${flatDays[0].day} … Day ${flatDays[flatDays.length - 1].day}`);
  console.log(`    e.g. Day ${flatDays[0].day}: ${flatDays[0].atSea ? "At Sea" : flatDays[0].portName}`);

  if (dryRun) {
    console.log("  --dry-run: not writing. Sample of captured schedule:");
    for (const d of flatDays.slice(0, 6)) {
      console.log(`    Day ${d.day}: ${d.atSea ? "At Sea" : d.portName}${d.arrivalTime ? ` (arr ${d.arrivalTime})` : ""}${d.departureTime ? ` (dep ${d.departureTime})` : ""}`);
    }
    return;
  }

  // ── Write back: the page reads the schedule from the Deal's cruiseFacts ─────
  const updatedDeal: CuratedOdysseusDeal = {
    ...deal,
    cruiseFacts: { ...deal.cruiseFacts, dayByDayItinerary: flatDays },
  };
  await upsertCuratedDealRecord(updatedDeal);
  console.log(`  ✓ Patched curated deal ${deal.id} cruiseFacts.dayByDayItinerary.`);

  // Keep the manifest's resolved package in sync so a future re-assembly carries it.
  if (manifest?.resolvedPackage) {
    const updatedManifest: DealTripManifest = {
      ...manifest,
      resolvedPackage: {
        ...manifest.resolvedPackage,
        itinerary: { ...manifest.resolvedPackage.itinerary, dayByDay: flatDays },
      },
    };
    await upsertDealTripManifestRecord(updatedManifest);
    console.log(`  ✓ Patched trip manifest ${manifest.id} resolvedPackage.itinerary.dayByDay.`);
  }

  console.log(`Done. Reload /deals/${dealId} — the itinerary should now render Day 1..${flatDays.length}.`);
}

main().catch((err) => {
  console.error("Backfill failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
