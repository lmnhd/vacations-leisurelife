/**
 * Operator-run backfill: capture the REAL day-by-day itinerary AND cabin pricing
 * for an already published Deal that was resolved before those capture steps
 * existed in the pipeline.
 *
 * Such deals carry only the coarse ports-of-call STRING and no cabin prices, so
 * the public page can render nothing but a deduped port list and a "draft"
 * pricing fallback. This script:
 *   1. loads the curated Deal (+ its trip manifest) from the live store,
 *   2. PREFERRED: reads the deal's OWN CB Swift package page (stable packageId
 *      from the booking URL) to recover the itinerary id, day-by-day schedule,
 *      and live cabin pricing — the search index re-ranks/re-windows and often
 *      cannot re-find close-in sailings it previously returned, while the
 *      package page keeps working for as long as the sailing is bookable,
 *   3. FALLBACK: drives a read-only Odysseus search when the package page
 *      yields nothing (gone/renamed package),
 *   4. writes the schedule + pricing back onto the Deal's cruiseFacts (and the
 *      manifest's resolved package) so /deals/[id] renders them immediately.
 *
 * Read-only against Odysseus (package page + itinerary detail + search — never
 * books/holds). Idempotent: a deal that already has a day-by-day schedule AND
 * cabin pricing is left untouched unless --force is passed.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/backfill-deal-itinerary.ts --deal 1582993
 *   npx tsx --env-file=.env.local scripts/backfill-deal-itinerary.ts --deal 1582993 --force
 *   npx tsx --env-file=.env.local scripts/backfill-deal-itinerary.ts --deal 1582993 --dry-run
 *   # --accept-closest: only for the search FALLBACK, when the exact package id
 *   # is gone and you have verified the top candidate is the same sailing.
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
  capturePackagePageTruth,
  lookupOdysseusPackages,
} from "../lib/cb/link-broker/odysseus-lookup";
import { releaseOdysseusSession } from "../lib/services/odysseus/OdysseusSessionManager";
import type { PackageCabinPricing } from "../lib/cb/link-broker/package-lookup";
import type { CuratedOdysseusDeal, DealItineraryDay } from "../lib/cb/deals-system/curated-deal-types";
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

  const hasDays = Boolean(deal.cruiseFacts.dayByDayItinerary && deal.cruiseFacts.dayByDayItinerary.length > 0);
  const hasPricing = [
    deal.cruiseFacts.cabinPrices.inside,
    deal.cruiseFacts.cabinPrices.outside,
    deal.cruiseFacts.cabinPrices.balcony,
    deal.cruiseFacts.cabinPrices.suite,
  ].some((v) => typeof v === "number" && v > 0);
  if (hasDays && hasPricing && !force) {
    console.log(`  Already has ${deal.cruiseFacts.dayByDayItinerary!.length} day node(s) and cabin pricing. Pass --force to recapture. Nothing to do.`);
    return;
  }

  const manifests = await listDealTripManifests();
  const manifest = manifestForDeal(deal, manifests);
  if (!manifest) {
    console.warn(`  ⚠ No trip manifest matched package ${deal.packageId}; will patch the deal only.`);
  }

  sweepOrphanedAutomationChrome();
  let flatDays: DealItineraryDay[] | undefined;
  let cabinPricing: PackageCabinPricing | undefined;

  // ── Preferred: read the deal's OWN package page (stable packageId) ─────────
  // The search index re-ranks/re-windows and often cannot re-find close-in
  // sailings it previously returned; the package page the deal's bookingUrl
  // points at keeps working for as long as the sailing is bookable.
  try {
    console.log(`  Reading the deal's own package page (package ${deal.packageId}, siid ${deal.siid})…`);
    const truth = await capturePackagePageTruth(deal.packageId, deal.siid);
    if (truth) {
      truth.diagnostics.forEach((d) => console.log(`    · ${d}`));
      const pageSail = truth.summary.sailDateIso;
      const dealSail = deal.cruiseFacts.sailDateIso?.trim();
      if (pageSail && dealSail && pageSail !== dealSail) {
        // Throw (not process.exit) so the finally still releases the session.
        throw new Error(
          `Package page shows sail date ${pageSail} but the deal says ${dealSail} — ` +
            `the package id may have been reused for a different sailing. Aborting (no data fabricated).`
        );
      }
      if (truth.dayByDay && truth.dayByDay.days.length > 0) {
        flatDays = truth.dayByDay.days.map((d) => ({ ...d }));
        console.log(`  ✓ Captured ${flatDays.length} day node(s) from the package page.`);
      }
      if (truth.summary.cabinPricing) {
        cabinPricing = truth.summary.cabinPricing;
      }
    } else {
      console.warn(`  ⚠ Package page yielded nothing for ${deal.packageId}; falling back to a search.`);
    }
  } finally {
    try {
      await releaseOdysseusSession();
    } catch {
      /* ignore */
    }
  }

  // ── Fallback: recover the itinerary id via a live search ───────────────────
  if (!flatDays) {
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
      if (lookup.candidates.length > 0) {
        console.log(`  Candidates returned by the search:`);
        for (const c of lookup.candidates) {
          console.log(
            `    - ${c.packageId}  ${c.shipName ?? c.cruiseName}  sail ${c.sailDateIso}  ${c.nights ?? "?"}n  ` +
              `dep ${c.departurePortCode ?? "?"}  conf ${c.confidence.toFixed(2)}  ` +
              `ports: ${c.itinerary?.normalizedPortsOfCall ?? c.portsOfCall ?? "?"}`
          );
        }
      }
      const exact = lookup.candidates.find((c) => c.packageId === deal!.packageId);
      const match = exact ?? lookup.selected ?? lookup.candidates[0];
      if (match && match.packageId !== deal.packageId) {
        // A different package means a different sailing — its schedule and pricing
        // would be flatly wrong for this deal. Never adopt it implicitly; the
        // operator must opt in per-run after eyeballing the candidate list above.
        if (!flag("accept-closest")) {
          // Throw (not process.exit) so the finally below still releases the
          // Odysseus session — exiting here would leak the automation browser.
          throw new Error(
            `Exact package ${deal.packageId} not in results; closest is ${match.packageId} ` +
              `(${match.shipName ?? match.cruiseName}, sail ${match.sailDateIso}). ` +
              `Refusing to write another sailing's itinerary/pricing onto this deal. ` +
              `Re-run with --accept-closest ONLY if you've verified the candidate above is the same sailing under a new package id.`
          );
        }
        console.warn(`  ⚠ Exact package ${deal.packageId} not in results; using closest match ${match.packageId} (--accept-closest).`);
      }
      itineraryId = match?.itinerary?.itineraryId;
      cabinPricing = cabinPricing ?? match?.cabinPricing;
    } finally {
      try {
        await releaseOdysseusSession();
      } catch {
        /* ignore */
      }
    }

    if (!itineraryId) {
      console.error("  ✗ Could not recover an itinerary id from the package page or the search — cannot capture the schedule. Aborting (no data fabricated).");
      process.exit(1);
    }
    console.log(`  Itinerary id: ${itineraryId}`);

    // ── Capture + normalize the real day-by-day schedule ─────────────────────
    const dayByDay = await captureDayByDayItinerary(itineraryId);
    if (!dayByDay || dayByDay.days.length === 0) {
      console.error(`  ✗ Itinerary detail endpoint returned no usable schedule for ${itineraryId}. Aborting.`);
      process.exit(1);
    }
    flatDays = dayByDay.days.map((d) => ({ ...d }));
  }

  if (cabinPricing) {
    console.log(
      `  ✓ Recovered cabin pricing: ${["inside", "outside", "balcony", "suite"]
        .filter((k) => typeof cabinPricing![k as keyof PackageCabinPricing] === "number")
        .map((k) => `${k} $${(cabinPricing![k as keyof PackageCabinPricing] as number).toLocaleString()}`)
        .join(", ")} ${cabinPricing.currencyCode}`
    );
  } else {
    console.warn("  ⚠ No cabin pricing recovered for this sailing; leaving pricing untouched (no fabrication).");
  }

  console.log(`  ✓ Captured ${flatDays.length} day node(s): Day ${flatDays[0].day} … Day ${flatDays[flatDays.length - 1].day}`);
  console.log(`    e.g. Day ${flatDays[0].day}: ${flatDays[0].atSea ? "At Sea" : flatDays[0].portName}`);

  if (dryRun) {
    console.log("  --dry-run: not writing. Sample of captured schedule:");
    for (const d of flatDays.slice(0, 6)) {
      console.log(`    Day ${d.day}: ${d.atSea ? "At Sea" : d.portName}${d.arrivalTime ? ` (arr ${d.arrivalTime})` : ""}${d.departureTime ? ` (dep ${d.departureTime})` : ""}`);
    }
    return;
  }

  // ── Write back: the page reads the schedule + prices from the Deal's cruiseFacts ──
  const updatedDeal: CuratedOdysseusDeal = {
    ...deal,
    cruiseFacts: {
      ...deal.cruiseFacts,
      dayByDayItinerary: flatDays,
      cabinPrices: cabinPricing
        ? {
            inside: cabinPricing.inside,
            outside: cabinPricing.outside,
            balcony: cabinPricing.balcony,
            suite: cabinPricing.suite,
            currencyCode: cabinPricing.currencyCode,
          }
        : deal.cruiseFacts.cabinPrices,
    },
  };
  await upsertCuratedDealRecord(updatedDeal);
  console.log(`  ✓ Patched curated deal ${deal.id} cruiseFacts.dayByDayItinerary${cabinPricing ? " + cabinPrices" : ""}.`);

  // Keep the manifest's resolved package in sync so a future re-assembly carries it.
  if (manifest?.resolvedPackage) {
    const updatedManifest: DealTripManifest = {
      ...manifest,
      resolvedPackage: {
        ...manifest.resolvedPackage,
        itinerary: { ...manifest.resolvedPackage.itinerary, dayByDay: flatDays },
        cabinPricing: cabinPricing ?? manifest.resolvedPackage.cabinPricing,
      },
    };
    await upsertDealTripManifestRecord(updatedManifest);
    console.log(`  ✓ Patched trip manifest ${manifest.id} resolvedPackage.itinerary.dayByDay${cabinPricing ? " + cabinPricing" : ""}.`);
  }

  console.log(`Done. Reload /deals/${dealId} — the itinerary should now render Day 1..${flatDays.length}.`);
}

main().catch((err) => {
  console.error("Backfill failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
