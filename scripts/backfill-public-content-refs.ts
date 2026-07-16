/**
 * Operator-run backfill: stamp `publicContentRefs` (exact trip-manifest /
 * funnel-synthesis / meta-ad-synthesis record ids) onto every curated Deal in
 * the live Dynamo store, so the public homepage and /deals/[id] pages can
 * point-read those records instead of scanning every row on each render.
 *
 * Matching uses the SAME functions the public read path's scan fallback uses
 * (findDeal*ForDeal), so a stamped ref is by construction the record the page
 * would have rendered anyway. Idempotent — safe to re-run any time (e.g. after
 * regenerating a synthesis or when the smoke test reports a scan fallback).
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/backfill-public-content-refs.ts          # dry-run (prints plan)
 *   npx tsx --env-file=.env.local scripts/backfill-public-content-refs.ts --write  # stamp the refs
 */

import {
  listCuratedDeals,
  listDealFunnelSyntheses,
  listDealMetaAdSyntheses,
  listDealTripManifests,
  upsertCuratedDealRecord,
} from "../lib/cb/deals-system/deals-dynamo-store";
import {
  findDealFunnelSynthesisForDeal,
  findDealMetaAdSynthesisForDeal,
  findDealTripManifestForDeal,
} from "../lib/cb/deals-system/public-deals";
import type { CuratedOdysseusDeal } from "../lib/cb/deals-system/curated-deal-types";

const WRITE = process.argv.includes("--write");

function fmt(value: string | undefined): string {
  return value ?? "—";
}

async function main(): Promise<void> {
  const [deals, manifests, syntheses, metaAds] = await Promise.all([
    listCuratedDeals(),
    listDealTripManifests(),
    listDealFunnelSyntheses(),
    listDealMetaAdSyntheses(),
  ]);

  console.log(
    `Loaded ${deals.length} deals, ${manifests.length} manifests, ` +
      `${syntheses.length} funnel syntheses, ${metaAds.length} meta-ad syntheses.\n`
  );

  let changed = 0;
  for (const deal of deals) {
    const next: NonNullable<CuratedOdysseusDeal["publicContentRefs"]> = {
      tripManifestId: findDealTripManifestForDeal(deal, manifests)?.id,
      funnelSynthesisId: findDealFunnelSynthesisForDeal(deal, syntheses)?.id,
      metaAdSynthesisId: findDealMetaAdSynthesisForDeal(deal, metaAds)?.id,
    };
    const prev = deal.publicContentRefs;
    const dirty =
      prev?.tripManifestId !== next.tripManifestId ||
      prev?.funnelSynthesisId !== next.funnelSynthesisId ||
      prev?.metaAdSynthesisId !== next.metaAdSynthesisId;

    console.log(`${deal.id}  ${deal.cruiseFacts.shipName} (${deal.status})`);
    console.log(`  manifest:  ${fmt(prev?.tripManifestId)} -> ${fmt(next.tripManifestId)}`);
    console.log(`  synthesis: ${fmt(prev?.funnelSynthesisId)} -> ${fmt(next.funnelSynthesisId)}`);
    console.log(`  meta-ad:   ${fmt(prev?.metaAdSynthesisId)} -> ${fmt(next.metaAdSynthesisId)}`);
    if (!next.funnelSynthesisId) {
      console.log("  NOTE: no funnel synthesis matched — page will render the legacy layout (same as today).");
    }

    if (!dirty) {
      console.log("  unchanged.\n");
      continue;
    }
    changed += 1;
    if (WRITE) {
      await upsertCuratedDealRecord({
        ...deal,
        publicContentRefs: { ...next, stampedAtIso: new Date().toISOString() },
      });
      console.log("  WROTE.\n");
    } else {
      console.log("  would write (dry-run; pass --write).\n");
    }
  }

  console.log(
    WRITE
      ? `Done: ${changed} deal record(s) updated.`
      : `Dry-run complete: ${changed} deal record(s) would be updated. Re-run with --write to apply.`
  );
}

main().catch((error) => {
  console.error("[backfill-public-content-refs] failed:", error);
  process.exitCode = 1;
});
