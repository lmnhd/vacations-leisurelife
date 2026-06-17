import fs from "fs/promises";

import {
  DEALS_CACHE_PATHS,
  loadCuratedDealsCache,
  loadDealFunnelSynthesisCache,
  loadDealTripManifestsCache,
} from "../lib/cb/deals-system";
import {
  upsertCuratedDealRecord,
  upsertDealBriefRecord,
  upsertDealFunnelSynthesisRecord,
  upsertDealTripManifestRecord,
  upsertPromoRecordEntry,
} from "../lib/cb/deals-system";
import { validatePromoIntelligenceCache } from "../lib/cb/deals-system/validate";

async function loadPromoRecordsFromDisk() {
  try {
    const raw = await fs.readFile(DEALS_CACHE_PATHS.promoIntelligence, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    const result = validatePromoIntelligenceCache(parsed);
    if (!result.ok || !result.value) {
      throw new Error(result.errors.join("\n  - "));
    }
    return result.value.records;
  } catch (error) {
    const enoent = error instanceof Error && "code" in error && error.code === "ENOENT";
    if (enoent) return [];
    throw error;
  }
}

async function main(): Promise<void> {
  const curatedCache = loadCuratedDealsCache();
  const tripManifestCache = loadDealTripManifestsCache();
  const funnelSynthesisCache = loadDealFunnelSynthesisCache();
  const promoRecords = await loadPromoRecordsFromDisk();

  for (const brief of curatedCache.briefs) {
    await upsertDealBriefRecord(brief);
  }

  for (const deal of curatedCache.deals) {
    await upsertCuratedDealRecord(deal);
  }

  for (const manifest of tripManifestCache.manifests) {
    await upsertDealTripManifestRecord(manifest);
  }

  for (const synthesis of funnelSynthesisCache.syntheses) {
    await upsertDealFunnelSynthesisRecord(synthesis);
  }

  for (const record of promoRecords) {
    await upsertPromoRecordEntry(record);
  }

  console.log(
    [
      `Migrated ${curatedCache.briefs.length} brief(s)`,
      `${curatedCache.deals.length} curated deal(s)`,
      `${tripManifestCache.manifests.length} trip manifest(s)`,
      `${funnelSynthesisCache.syntheses.length} funnel synthesis(es)`,
      `${promoRecords.length} promo record(s)`,
    ].join("; ")
  );
}

main().catch((error) => {
  console.error(
    "[migrate-deals-to-dynamo] Error:",
    error instanceof Error ? error.message : String(error)
  );
  process.exit(1);
});