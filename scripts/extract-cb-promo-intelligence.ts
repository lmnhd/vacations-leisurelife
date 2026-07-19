/**
 * Phase 5 runner - Structured Promo Extraction.
 *
 * Reads .github/data/cb-promo-intelligence-cache.json (Phase 4 raw capture),
 * runs GPT-5.4 structured extraction on each record, and writes the cache back
 * with `extracted` / `marketingUse` filled and `diagnostics.status` updated to
 * `succeeded` or `failed`.
 *
 * Not a browser/portal action — pure LLM over already-captured text. No CB login.
 *
 * Usage:
 *   npm run extract-cb-promo-intelligence
 *   npm run extract-cb-promo-intelligence -- --id cbpromo-2837   # one record
 *   npm run extract-cb-promo-intelligence -- --only-needs-review # default
 *   npm run extract-cb-promo-intelligence -- --force             # re-extract all
 */

import * as fs from "node:fs";
import path from "node:path";

import { ModelName } from "../lib/ai/llm-gateway";
import { upsertPromoRecordEntry } from "../lib/cb/deals-system/deals-dynamo-store";
import { extractPromoIntelligence } from "../lib/cb/deals-system/promo-extraction";
import { validatePromoIntelligenceCache } from "../lib/cb/deals-system/validate";
import type { CbPromoIntelligenceCache } from "../lib/cb/deals-system/promo-intelligence-types";

const CACHE_PATH = path.join(process.cwd(), ".github", "data", "cb-promo-intelligence-cache.json");

function parseArgs(argv: string[]): { id?: string; force: boolean } {
  let id: string | undefined;
  const idIdx = argv.indexOf("--id");
  if (idIdx >= 0) id = argv[idIdx + 1];
  return { id, force: argv.includes("--force") };
}

async function main(): Promise<void> {
  const { id, force } = parseArgs(process.argv.slice(2));

  const raw = JSON.parse(fs.readFileSync(CACHE_PATH, "utf8")) as unknown;
  const validation = validatePromoIntelligenceCache(raw);
  if (!validation.ok || !validation.value) {
    throw new Error(`Cache failed validation: ${validation.errors.join("; ")}`);
  }
  const cache: CbPromoIntelligenceCache = validation.value;

  const targets = cache.records.filter((rec) => {
    if (id) return rec.id === id;
    if (force) return true;
    return rec.diagnostics.status !== "succeeded";
  });

  console.log(
    `[extract-cb-promo-intelligence] ${targets.length} record(s) to extract` +
      `${id ? ` (id=${id})` : force ? " (--force)" : " (needs_review only)"}.`
  );

  let succeeded = 0;
  let failed = 0;

  for (const record of targets) {
    process.stdout.write(`  • ${record.id} "${record.title.slice(0, 50)}" ... `);
    try {
      const outcome = await extractPromoIntelligence(record, { model: ModelName.GPT_5_HIGH });
      record.extracted = outcome.extracted;
      record.marketingUse = outcome.marketingUse;
      record.diagnostics = {
        status: "succeeded",
        model: outcome.modelId,
        notes: [
          `Offers: ${outcome.extracted.offerTypes.join(", ") || "none"}.`,
          `Public claims: ${outcome.marketingUse.publicClaimsAllowed.length}, ` +
            `needs-qualifier: ${outcome.marketingUse.publicClaimsNeedsQualifier.length}, ` +
            `caution flags: ${outcome.marketingUse.cautionFlags.length}.`,
        ],
        warnings: outcome.warnings,
      };
      succeeded += 1;
      console.log(
        `✅ ${outcome.extracted.offerTypes.length} offer type(s), ` +
          `${outcome.marketingUse.cautionFlags.length} caution flag(s)`
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      record.diagnostics = {
        status: "failed",
        notes: record.diagnostics.notes,
        warnings: [...record.diagnostics.warnings, `Extraction failed: ${msg}`],
      };
      failed += 1;
      console.log(`✗ ${msg}`);
    }
  }

  cache.generatedAtIso = new Date().toISOString();
  cache.diagnostics.extractionSucceeded = cache.records.filter(
    (r) => r.diagnostics.status === "succeeded"
  ).length;
  cache.diagnostics.extractionNeedsReview = cache.records.filter(
    (r) => r.diagnostics.status === "needs_review"
  ).length;

  fs.writeFileSync(CACHE_PATH, `${JSON.stringify(cache, null, 2)}\n`, "utf8");

  const storeReadyRecords = cache.records.filter(
    (record) => record.diagnostics.status === "succeeded"
  );
  for (const record of storeReadyRecords) {
    await upsertPromoRecordEntry(record);
  }

  console.log(
    `\n[extract-cb-promo-intelligence] Done. succeeded=${succeeded} failed=${failed}. ` +
      `Cache totals: succeeded=${cache.diagnostics.extractionSucceeded}, ` +
      `needsReview=${cache.diagnostics.extractionNeedsReview}.`
  );
  console.log(`[extract-cb-promo-intelligence] Wrote ${CACHE_PATH}`);
  console.log(
    `[extract-cb-promo-intelligence] Synced ${storeReadyRecords.length} succeeded record(s) to the Deals store.`
  );
}

main().catch((err) => {
  console.error("[extract-cb-promo-intelligence] Fatal error:", err);
  process.exit(1);
});
