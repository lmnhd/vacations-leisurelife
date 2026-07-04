/**
 * Operator-run diagnostic: report DealFunnelSynthesis records in the live
 * Dynamo store whose ids collide because of the old truncated-slug id scheme
 * (see buildAdCopyId in deal-copywriter-generator.ts). Read-only.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/agent/diagnose-synthesis-id-collisions.ts
 */
import { listDealFunnelSyntheses } from "../../lib/cb/deals-system/deals-dynamo-store";

async function main(): Promise<void> {
  const list = await listDealFunnelSyntheses();
  console.log(`Total funnel synthesis records in Dynamo: ${list.length}\n`);
  for (const s of list) {
    console.log(`  id=${s.id}`);
    console.log(`     dealId=${s.dealId}  title=${(s.sailingAngleTitle || "").slice(0, 60)}`);
  }
  const byId: Record<string, number> = {};
  for (const s of list) byId[s.id] = (byId[s.id] || 0) + 1;
  const dupes = Object.entries(byId).filter(([, n]) => n > 1);
  console.log(`\nUnique ids: ${Object.keys(byId).length}`);
  if (dupes.length === 0) {
    console.log("No id collisions found in stored records.");
  } else {
    console.log(`COLLIDING ids (${dupes.length}):`);
    for (const [id, n] of dupes) console.log(`  ${id}  x${n}`);
  }

  // Also show how many DISTINCT dealIds exist vs distinct ids — if a deal's
  // record was overwritten by a colliding one, its dealId won't appear.
  const dealIds = new Set(list.map((s) => s.dealId));
  console.log(`\nDistinct dealIds present: ${dealIds.size}`);
  console.log([...dealIds].sort().join(", "));
}

main().catch((err) => {
  console.error("Diagnostic failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
