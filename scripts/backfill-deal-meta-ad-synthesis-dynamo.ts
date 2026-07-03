/**
 * Operator-run backfill: mirror existing Meta ad-card syntheses (Step 8) from
 * the local JSON lab cache into the `lll-deals-system` Dynamo table.
 *
 * Context: the meta-ad-synthesis lab (/tests/deals-system/meta-ad-synthesis)
 * only ever wrote to `.github/data/deal-meta-ad-syntheses-cache.json`. The
 * public /deals/[id] page reads Dynamo only (see deals-dynamo-store.ts), so
 * any synthesis generated BEFORE the route started mirroring new mutations to
 * Dynamo never reaches a real visitor. This script does the one-time catch-up
 * for records that already exist locally: it reads the JSON cache and upserts
 * every synthesis into Dynamo, without touching the local cache or
 * regenerating any images.
 *
 * Idempotent: re-running just re-upserts the same records (Dynamo PutCommand
 * is an overwrite), so it's safe to run again after generating more cards.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/backfill-deal-meta-ad-synthesis-dynamo.ts
 *   npx tsx --env-file=.env.local scripts/backfill-deal-meta-ad-synthesis-dynamo.ts --dry-run
 *   npx tsx --env-file=.env.local scripts/backfill-deal-meta-ad-synthesis-dynamo.ts --deal 1543052
 */

import {
  loadDealMetaAdSynthesisCache,
} from "../lib/cb/deals-system/deal-meta-ad-synthesis-cache";
import { upsertDealMetaAdSynthesisRecord } from "../lib/cb/deals-system/deals-dynamo-store";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main(): Promise<void> {
  const dryRun = flag("dry-run");
  const onlyDealId = arg("deal");

  const cache = loadDealMetaAdSynthesisCache();
  const syntheses = onlyDealId
    ? cache.syntheses.filter((s) => s.dealId === onlyDealId)
    : cache.syntheses;

  if (syntheses.length === 0) {
    console.log(
      onlyDealId
        ? `No local meta ad synthesis found for deal "${onlyDealId}".`
        : "No meta ad syntheses in the local cache. Nothing to backfill."
    );
    return;
  }

  console.log(`Found ${syntheses.length} local synthesis record(s) to mirror:\n`);
  for (const s of syntheses) {
    const readyCount = s.cards.filter((c) => c.status === "ready" && Boolean(c.imageUrl)).length;
    console.log(
      `  ${s.dealId}  ${s.sailingAngleTitle}  (${readyCount}/${s.cards.length} cards ready)`
    );
  }

  if (dryRun) {
    console.log("\n--dry-run: not writing to Dynamo.");
    return;
  }

  console.log("");
  let succeeded = 0;
  let failed = 0;
  for (const synthesis of syntheses) {
    try {
      await upsertDealMetaAdSynthesisRecord(synthesis);
      console.log(`  ✓ Mirrored ${synthesis.dealId} (${synthesis.id}) to Dynamo.`);
      succeeded += 1;
    } catch (error) {
      console.error(
        `  ✗ Failed to mirror ${synthesis.dealId} (${synthesis.id}):`,
        error instanceof Error ? error.message : error
      );
      failed += 1;
    }
  }

  console.log(`\nDone. ${succeeded} mirrored, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Backfill failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
