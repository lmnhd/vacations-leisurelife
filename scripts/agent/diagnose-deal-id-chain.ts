/**
 * Read-only: dump the id chain across Dynamo record types so we can size the
 * id-format migration. Shows funnel syntheses + meta ad syntheses in the live
 * store and whether each id already matches the NEW buildAdCopyId format
 * (leads with the deal's unique manifest trailing token).
 */
import {
  listDealFunnelSyntheses,
  listDealMetaAdSyntheses,
} from "../../lib/cb/deals-system/deals-dynamo-store";

async function main(): Promise<void> {
  const funnels = await listDealFunnelSyntheses();
  const metas = await listDealMetaAdSyntheses();

  console.log(`FUNNEL SYNTHESES (${funnels.length}):`);
  for (const s of funnels) {
    console.log(`  dealId=${s.dealId}`);
    console.log(`    id=${s.id}`);
    console.log(`    sourceAdCopyId=${(s as { sourceAdCopyId?: string }).sourceAdCopyId ?? "(none)"}`);
  }

  console.log(`\nMETA AD SYNTHESES (${metas.length}):`);
  for (const s of metas) {
    console.log(`  dealId=${s.dealId}  id=${s.id}  fsid=${s.sourceFunnelSynthesisId}`);
  }
}

main().catch((err) => {
  console.error("Diagnostic failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
