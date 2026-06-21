/**
 * Operator-run backfill: capture the real cruise line + ship name for an
 * already published Deal from the CB booking package page.
 *
 * Read-only against CB/Odysseus package pages. It never creates holds,
 * reservations, payments, or bookings.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/backfill-deal-ship-identity.ts --deal 1578937
 *   npx tsx --env-file=.env.local scripts/backfill-deal-ship-identity.ts --deal 1578937 --force
 *   npx tsx --env-file=.env.local scripts/backfill-deal-ship-identity.ts --deal 1578937 --dry-run
 */

import {
  getCuratedDeal,
  listCuratedDeals,
  listDealTripManifests,
  upsertCuratedDealRecord,
  upsertDealTripManifestRecord,
} from "../lib/cb/deals-system/deals-dynamo-store";
import type { CuratedOdysseusDeal } from "../lib/cb/deals-system/curated-deal-types";
import type { DealTripManifest } from "../lib/cb/deals-system/deal-trip-manifest-types";
import { looksLikeCruiseItineraryName } from "../lib/cb/deals-system/ship-identity";
import {
  getOdysseusSession,
  releaseOdysseusSession,
} from "../lib/services/odysseus/OdysseusSessionManager";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function positionalDealId(): string | undefined {
  const scriptIndex = process.argv.findIndex((value) => value.endsWith("backfill-deal-ship-identity.ts"));
  const start = scriptIndex >= 0 ? scriptIndex + 1 : 2;
  return process.argv.slice(start).find((value) => value !== "--" && !value.startsWith("--"));
}

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function hasUsableShipName(shipName: string | undefined): boolean {
  const trimmed = shipName?.trim();
  return Boolean(trimmed && !looksLikeCruiseItineraryName(trimmed));
}

async function findDeal(dealId: string): Promise<CuratedOdysseusDeal | null> {
  const direct = await getCuratedDeal(dealId);
  if (direct) return direct;
  const deals = await listCuratedDeals();
  return deals.find((deal) => deal.id === dealId || deal.packageId === dealId) ?? null;
}

function manifestForDeal(
  deal: CuratedOdysseusDeal,
  manifests: DealTripManifest[]
): DealTripManifest | undefined {
  return manifests.find(
    (manifest) =>
      manifest.resolvedPackage?.packageId === deal.packageId ||
      manifest.resolvedPackage?.packageId === deal.id
  );
}

async function main(): Promise<void> {
  const dealId = arg("deal") ?? positionalDealId();
  if (!dealId) {
    console.error("Usage: scripts/backfill-deal-ship-identity.ts --deal <dealId|packageId> [--force] [--dry-run]");
    process.exit(1);
  }

  const force = flag("force");
  const dryRun = flag("dry-run");
  const deal = await findDeal(dealId);
  if (!deal) {
    console.error(`No curated deal found for "${dealId}". Checked id and packageId.`);
    process.exit(1);
  }

  console.log(`Deal: ${deal.id} | package ${deal.packageId}`);
  console.log(`  current line: ${deal.cruiseFacts.cruiseLine || "(missing)"}`);
  console.log(`  current ship: ${deal.cruiseFacts.shipName || "(missing)"}`);

  if (hasUsableShipName(deal.cruiseFacts.shipName) && !force) {
    console.log("  Deal already has a usable ship name. Pass --force to refresh it from the package page.");
    return;
  }

  let summaryShipName = "";
  let summaryCruiseLine = "";
  try {
    const engine = await getOdysseusSession();
    const summary = await engine.fetchPackagePageSummary(deal.packageId, deal.siid);
    if (!summary) {
      console.error("  Package page summary was not available. Aborting; no data fabricated.");
      process.exit(1);
    }
    summaryShipName = summary.shipName?.trim() ?? "";
    summaryCruiseLine = summary.cruiseLine?.trim() ?? "";
    console.log(`  package title: ${summary.title ?? "(missing)"}`);
    console.log(`  package line: ${summaryCruiseLine || "(missing)"}`);
    console.log(`  package ship: ${summaryShipName || "(missing)"}`);
  } finally {
    await releaseOdysseusSession();
  }

  if (!hasUsableShipName(summaryShipName)) {
    console.error("  Package page did not expose a usable ship name. Aborting; no data fabricated.");
    process.exit(1);
  }

  const cruiseLine = summaryCruiseLine || deal.cruiseFacts.cruiseLine;
  const manifests = await listDealTripManifests();
  const manifest = manifestForDeal(deal, manifests);
  if (!manifest) {
    console.warn(`  No trip manifest matched package ${deal.packageId}; will patch the curated deal only.`);
  }

  if (dryRun) {
    console.log("  --dry-run: not writing.");
    console.log(`  would set cruiseFacts.shipName = ${summaryShipName}`);
    console.log(`  would set cruiseFacts.cruiseLine = ${cruiseLine}`);
    if (manifest?.resolvedPackage) {
      console.log(`  would set manifest ${manifest.id} resolvedPackage.shipName = ${summaryShipName}`);
    }
    return;
  }

  const updatedDeal: CuratedOdysseusDeal = {
    ...deal,
    cruiseFacts: {
      ...deal.cruiseFacts,
      cruiseLine,
      shipName: summaryShipName,
    },
  };
  await upsertCuratedDealRecord(updatedDeal);
  console.log(`  Patched curated deal ${deal.id} cruiseFacts.shipName = ${summaryShipName}.`);

  if (manifest?.resolvedPackage) {
    const updatedManifest: DealTripManifest = {
      ...manifest,
      resolvedPackage: {
        ...manifest.resolvedPackage,
        cruiseLine,
        shipName: summaryShipName,
        lookupDiagnostics: [
          ...manifest.resolvedPackage.lookupDiagnostics,
          `Backfilled package-page ship identity: ${cruiseLine ? `${cruiseLine}: ` : ""}${summaryShipName}.`,
        ],
      },
    };
    await upsertDealTripManifestRecord(updatedManifest);
    console.log(`  Patched trip manifest ${manifest.id} resolvedPackage.shipName = ${summaryShipName}.`);
  }

  console.log(`Done. Reload /deals/${deal.id} to see ${summaryShipName}.`);
}

main().catch((err) => {
  console.error("Backfill failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
