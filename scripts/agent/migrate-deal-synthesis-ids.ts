/**
 * Operator-run migration: rewrite deal-system synthesis records from the old
 * truncated-slug id scheme to the new per-deal-unique id scheme.
 *
 * WHY: ids were `slugify(`${campaignName}-${sourceManifestId}`).slice(0,80)`.
 * The campaignName came first, so long names ate the 80-char budget and
 * truncated away the disambiguating manifest/deal id — two different deals
 * could collapse onto the same id and silently overwrite each other in the
 * Dynamo partition key (and mix in the Step 9 UI). buildAdCopyId now leads
 * with the deal's unique numeric token so this can't recur — but records
 * created under the OLD scheme keep their old ids, so a future regeneration of
 * the same deal would create a NEW record alongside the stale old one. This
 * one-time migration renames the existing records to the new ids so old and
 * new never coexist.
 *
 * SCOPE (per deal):
 *   - Dynamo SYNTHESIS#<id>      (DealFunnelSynthesis: id, sourceAdCopyId)
 *   - Dynamo METAADSYNTH#<id>    (DealMetaAdSynthesis: id, sourceFunnelSynthesisId)
 *   - local deal-ad-copy-cache.json                  (adCopy.id)
 *   - local deal-google-ads-syntheses-cache.json     (id, sourceFunnelSynthesisId)
 *   - local deal-google-ads-distributions-cache.json (sourceGoogleAdsSynthesisId, plan.dealId untouched)
 *   - local deal-meta-ad-syntheses-cache.json        (id, sourceFunnelSynthesisId)
 *
 * The public /deals/[id] read path matches on the stable dealId as well as id,
 * so renaming ids does not break live pages. dealId is never changed.
 *
 * Idempotent: records already on the new id are detected (new id === current
 * id) and skipped. Dry-run by default.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/agent/migrate-deal-synthesis-ids.ts            # dry run
 *   npx tsx --env-file=.env.local scripts/agent/migrate-deal-synthesis-ids.ts --apply
 *   npx tsx --env-file=.env.local scripts/agent/migrate-deal-synthesis-ids.ts --apply --deal 1543052
 */

import { buildAdCopyId } from "../../lib/cb/deals-system/deal-copywriter-generator";
import { buildFunnelSynthesisId } from "../../lib/cb/deals-system/deal-ids";
import {
  listDealFunnelSyntheses,
  listDealMetaAdSyntheses,
  upsertDealFunnelSynthesisRecord,
  deleteDealFunnelSynthesisRecord,
  upsertDealMetaAdSynthesisRecord,
  deleteDealMetaAdSynthesisRecord,
} from "../../lib/cb/deals-system/deals-dynamo-store";
import { loadDealAdCopyCache, saveDealAdCopyCache } from "../../lib/cb/deals-system/deal-ad-copy-cache";
import {
  loadDealGoogleAdsSynthesisCache,
  saveDealGoogleAdsSynthesisCache,
} from "../../lib/cb/deals-system/deal-google-ads-synthesis-cache";
import {
  loadDealMetaAdSynthesisCache,
  saveDealMetaAdSynthesisCache,
} from "../../lib/cb/deals-system/deal-meta-ad-synthesis-cache";
import { loadDealUnifiedManifestsCache } from "../../lib/cb/deals-system/deal-unified-manifest-cache";
import { loadDealGoogleAdsDistributionCache } from "../../lib/cb/deals-system/deal-google-ads-distribution-cache";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

interface NewIds {
  newAdCopyId: string;
  newFunnelId: string;
  oldAdCopyId: string;
}

/**
 * Resolve each deal's NEW ids, computed exactly the way the generators now do:
 *   - funnel id  = buildFunnelSynthesisId(dealId, { campaignName })  (leads with real dealId)
 *   - adCopy id  = buildAdCopyId(campaignName, manifest.sourceManifestId)
 *
 * Keyed by the STABLE real dealId that lives on every Dynamo record — NOT a
 * token re-derived from the manifest slug (which is absent for hand-seeded
 * manifests). We join each funnel record's dealId to its ad copy (via
 * sourceAdCopyId, falling back to a dealId-substring match) for campaignName +
 * the authoritative sourceManifestId.
 */
async function buildNewIdMap(): Promise<Map<string, NewIds>> {
  const adCopyCache = loadDealAdCopyCache();
  const manifestCache = loadDealUnifiedManifestsCache();
  const funnels = await listDealFunnelSyntheses();
  const map = new Map<string, NewIds>();

  for (const f of funnels) {
    const dealId = f.dealId;
    // Prefer the funnel's own sourceAdCopyId; else match ad copy by dealId
    // appearing in its manifest id.
    const adCopy =
      adCopyCache.adCopies.find((a) => a.id === f.sourceAdCopyId) ??
      adCopyCache.adCopies.find((a) => a.sourceUnifiedManifestId.includes(dealId)) ??
      null;
    if (!adCopy) {
      console.warn(`  ! No ad copy found for funnel deal ${dealId} (sourceAdCopyId=${f.sourceAdCopyId}); skipping.`);
      continue;
    }
    const manifest = manifestCache.manifests.find((m) => m.id === adCopy.sourceUnifiedManifestId);
    const sourceManifestId = manifest?.sourceManifestId ?? adCopy.sourceUnifiedManifestId;

    const newAdCopyId = buildAdCopyId(adCopy.campaignName, sourceManifestId);
    const newFunnelId = buildFunnelSynthesisId(dealId, adCopy.campaignName);
    map.set(dealId, { newAdCopyId, newFunnelId, oldAdCopyId: adCopy.id });
  }

  return map;
}

async function main(): Promise<void> {
  const apply = flag("apply");
  const onlyDealId = arg("deal");

  console.log(`Mode: ${apply ? "APPLY (writes)" : "DRY RUN (no writes)"}\n`);

  const idMap = await buildNewIdMap();
  if (idMap.size === 0) {
    console.log("No deals resolvable from the Dynamo funnel records + local caches. Nothing to migrate.");
    return;
  }

  console.log("Computed NEW ids per deal:");
  for (const [dealId, ids] of idMap) {
    if (onlyDealId && dealId !== onlyDealId) continue;
    console.log(`  deal ${dealId}: funnel -> ${ids.newFunnelId}`);
  }
  console.log("");

  // ── Dynamo: funnel syntheses ────────────────────────────────────────────────
  const funnels = await listDealFunnelSyntheses();
  for (const f of funnels) {
    if (onlyDealId && f.dealId !== onlyDealId) continue;
    const ids = idMap.get(f.dealId);
    if (!ids) {
      console.warn(`  ! Funnel ${f.id} (deal ${f.dealId}) has no computed new id; skipping.`);
      continue;
    }
    if (f.id === ids.newFunnelId) {
      console.log(`  = Funnel deal ${f.dealId} already on new id.`);
      continue;
    }
    console.log(`  → Funnel deal ${f.dealId}: ${f.id}\n              => ${ids.newFunnelId}`);
    if (apply) {
      const migrated = { ...f, id: ids.newFunnelId, sourceAdCopyId: ids.newAdCopyId };
      await upsertDealFunnelSynthesisRecord(migrated);
      await deleteDealFunnelSynthesisRecord(f.id);
      console.log(`     ✓ rewritten + old deleted`);
    }
  }

  // ── Dynamo: meta ad syntheses ───────────────────────────────────────────────
  const metas = await listDealMetaAdSyntheses();
  for (const m of metas) {
    if (onlyDealId && m.dealId !== onlyDealId) continue;
    const ids = idMap.get(m.dealId);
    if (!ids) continue;
    if (m.id === ids.newFunnelId) {
      console.log(`  = Meta deal ${m.dealId} already on new id.`);
      continue;
    }
    console.log(`  → Meta   deal ${m.dealId}: ${m.id}\n              => ${ids.newFunnelId}`);
    if (apply) {
      const migrated = { ...m, id: ids.newFunnelId, sourceFunnelSynthesisId: ids.newFunnelId };
      await upsertDealMetaAdSynthesisRecord(migrated);
      await deleteDealMetaAdSynthesisRecord(m.id);
      console.log(`     ✓ rewritten + old deleted`);
    }
  }

  // ── Local: ad copy cache ────────────────────────────────────────────────────
  {
    const cache = loadDealAdCopyCache();
    const manifestCache = loadDealUnifiedManifestsCache();
    let changed = false;
    const adCopies = cache.adCopies.map((a) => {
      const manifest = manifestCache.manifests.find((mm) => mm.id === a.sourceUnifiedManifestId);
      const sourceManifestId = manifest?.sourceManifestId ?? a.sourceUnifiedManifestId;
      const newId = buildAdCopyId(a.campaignName, sourceManifestId);
      if (newId !== a.id) {
        console.log(`  → adCopy ${a.id}\n           => ${newId}`);
        changed = true;
        return { ...a, id: newId };
      }
      return a;
    });
    if (apply && changed) {
      saveDealAdCopyCache({ ...cache, adCopies });
      console.log(`     ✓ deal-ad-copy-cache.json updated`);
    }
  }

  // ── Local: google-ads syntheses cache ───────────────────────────────────────
  {
    const cache = loadDealGoogleAdsSynthesisCache();
    let changed = false;
    const syntheses = cache.syntheses.map((s) => {
      const ids = idMap.get(s.dealId);
      if (!ids || s.id === ids.newFunnelId) return s;
      console.log(`  → googleAdsSynth deal ${s.dealId}: ${s.id} => ${ids.newFunnelId}`);
      changed = true;
      return { ...s, id: ids.newFunnelId, sourceFunnelSynthesisId: ids.newFunnelId };
    });
    if (apply && changed) {
      saveDealGoogleAdsSynthesisCache({ ...cache, syntheses });
      console.log(`     ✓ deal-google-ads-syntheses-cache.json updated`);
    }
  }

  // ── Local: meta-ad syntheses cache ──────────────────────────────────────────
  {
    const cache = loadDealMetaAdSynthesisCache();
    let changed = false;
    const syntheses = cache.syntheses.map((s) => {
      const ids = idMap.get(s.dealId);
      if (!ids || s.id === ids.newFunnelId) return s;
      console.log(`  → metaSynth(local) deal ${s.dealId}: ${s.id} => ${ids.newFunnelId}`);
      changed = true;
      return { ...s, id: ids.newFunnelId, sourceFunnelSynthesisId: ids.newFunnelId };
    });
    if (apply && changed) {
      saveDealMetaAdSynthesisCache({ ...cache, syntheses });
      console.log(`     ✓ deal-meta-ad-syntheses-cache.json updated`);
    }
  }

  // ── Local: google-ads distributions cache (rewrites sourceGoogleAdsSynthesisId) ─
  {
    const cache = loadDealGoogleAdsDistributionCache();
    let changed = false;
    const distributions = cache.distributions.map((d) => {
      const ids = idMap.get(d.dealId);
      if (!ids) return d;
      const patch: Record<string, unknown> = {};
      if (d.sourceGoogleAdsSynthesisId && d.sourceGoogleAdsSynthesisId !== ids.newFunnelId) {
        patch.sourceGoogleAdsSynthesisId = ids.newFunnelId;
      }
      if (d.id && d.id !== ids.newFunnelId && d.id === (d.sourceGoogleAdsSynthesisId ?? "")) {
        patch.id = ids.newFunnelId;
      }
      if (Object.keys(patch).length === 0) return d;
      console.log(`  → googleAdsDist deal ${d.dealId}: sourceGoogleAdsSynthesisId => ${ids.newFunnelId}`);
      changed = true;
      return { ...d, ...patch };
    });
    if (apply && changed) {
      saveDealGoogleAdsDistributionCache({ ...cache, distributions });
      console.log(`     ✓ deal-google-ads-distributions-cache.json updated`);
    }
  }

  console.log(apply ? "\nDone. Records migrated." : "\nDry run complete. Re-run with --apply to write.");
}

main().catch((err) => {
  console.error("Migration failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
