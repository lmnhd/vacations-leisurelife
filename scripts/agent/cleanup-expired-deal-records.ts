/**
 * Operator-run Dynamo housekeeping: delete deal-system records whose sailing
 * is in the past (or whose explicit expiresOnIso cutoff has lapsed).
 *
 * A deal is EXPIRED when:
 *   - its expiresOnIso (public visibility cutoff, YYYY-MM-DD) is past, OR
 *   - its sailDateIso is more than GRACE_DAYS in the past (the ship sailed;
 *     nobody can book it).
 *
 * For each expired deal this removes, from the lll-deals-system table:
 *   DEAL#{id}, BRIEF#{id}, MANIFEST#{manifest ids for the deal},
 *   SYNTHESIS#{funnel ids}, METAADSYNTH#{meta ids}
 * matched by the deal's stable dealId. Records for deals that are NOT expired
 * are never touched. Local JSON lab caches are never touched.
 *
 * Safety:
 *   - DRY RUN by default; nothing is deleted without --apply.
 *   - Point-in-time recovery is enabled on the table (2026-07-04), so even an
 *     applied run can be undone by restoring to a timestamp before the run.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/agent/cleanup-expired-deal-records.ts             # dry run
 *   npx tsx --env-file=.env.local scripts/agent/cleanup-expired-deal-records.ts --apply
 *   npx tsx --env-file=.env.local scripts/agent/cleanup-expired-deal-records.ts --grace-days 60
 */

import {
  listCuratedDeals,
  deleteCuratedDealRecord,
  deleteDealBriefRecord,
  listDealTripManifests,
  deleteDealTripManifestRecord,
  listDealFunnelSyntheses,
  deleteDealFunnelSynthesisRecord,
  listDealMetaAdSyntheses,
  deleteDealMetaAdSynthesisRecord,
} from "../../lib/cb/deals-system/deals-dynamo-store";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

/** Days after the sail date before a deal counts as obsolete. Generous by
 * default so recently-sailed deals stay inspectable. */
const DEFAULT_GRACE_DAYS = 30;

function isExpired(
  deal: { sailDateIso?: string; expiresOnIso?: string },
  now: Date,
  graceDays: number
): { expired: boolean; reason: string } {
  if (deal.expiresOnIso) {
    const cutoff = new Date(`${deal.expiresOnIso}T23:59:59Z`);
    if (!Number.isNaN(cutoff.getTime()) && cutoff < now) {
      return { expired: true, reason: `expiresOnIso ${deal.expiresOnIso} passed` };
    }
  }
  if (deal.sailDateIso) {
    const sail = new Date(deal.sailDateIso);
    if (!Number.isNaN(sail.getTime())) {
      const ageDays = (now.getTime() - sail.getTime()) / 86_400_000;
      if (ageDays > graceDays) {
        return { expired: true, reason: `sailed ${Math.floor(ageDays)}d ago (grace ${graceDays}d)` };
      }
    }
  }
  return { expired: false, reason: "" };
}

async function main(): Promise<void> {
  const apply = flag("apply");
  const graceDays = Number(arg("grace-days") ?? DEFAULT_GRACE_DAYS);
  const now = new Date();

  console.log(`Mode: ${apply ? "APPLY (deletes)" : "DRY RUN (no deletes)"} — grace ${graceDays}d\n`);

  const [deals, manifests, funnels, metas] = await Promise.all([
    listCuratedDeals(),
    listDealTripManifests(),
    listDealFunnelSyntheses(),
    listDealMetaAdSyntheses(),
  ]);

  const expiredDeals = deals
    .map((d) => ({ deal: d, ...isExpired(d, now, graceDays) }))
    .filter((e) => e.expired);

  console.log(`Curated deals: ${deals.length} total, ${expiredDeals.length} expired.\n`);
  if (expiredDeals.length === 0) {
    console.log("Nothing to clean up.");
    return;
  }

  let deleted = 0;
  for (const { deal, reason } of expiredDeals) {
    const dealId = deal.id;
    console.log(`EXPIRED ${dealId}  ${deal.title ?? ""}\n  reason: ${reason}`);

    const dealManifests = manifests.filter(
      (m) => m.id.includes(dealId) || (m as { dealId?: string }).dealId === dealId
    );
    const dealFunnels = funnels.filter((f) => f.dealId === dealId);
    const dealMetas = metas.filter((s) => s.dealId === dealId);

    console.log(
      `  records: DEAL#, BRIEF#, ${dealManifests.length} manifest(s), ${dealFunnels.length} funnel(s), ${dealMetas.length} meta synth(s)`
    );

    if (!apply) continue;

    for (const s of dealMetas) {
      await deleteDealMetaAdSynthesisRecord(s.id);
      deleted++;
    }
    for (const f of dealFunnels) {
      await deleteDealFunnelSynthesisRecord(f.id);
      deleted++;
    }
    for (const m of dealManifests) {
      await deleteDealTripManifestRecord(m.id);
      deleted++;
    }
    await deleteDealBriefRecord(dealId);
    deleted++;
    await deleteCuratedDealRecord(dealId);
    deleted++;
    console.log(`  ✓ deleted`);
  }

  console.log(
    apply
      ? `\nDone. ${deleted} record(s) deleted. (PITR can restore to any point in the last 35 days.)`
      : "\nDry run complete. Re-run with --apply to delete."
  );
}

main().catch((err) => {
  console.error("Cleanup failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
