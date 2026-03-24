import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

const base = "http://localhost:3000";
const slugs = [
  "alaska-slow-living-2026-09-20",
  "night-sky-sea-2026",
  "retro-handheld-arcade-2026",
  "alaska-tea-ritual-2026-09-20",
  "eastern-caribbean-stitch-sail-2026-09-19"
];

async function run() {
  for (const slug of slugs) {
    console.log(`\n=========================================`);
    console.log(`=== CAMPAIGN: ${slug} ===`);
    console.log(`=========================================`);

    const baselineRes = await fetch(`${base}/api/groups/campaign/${slug}/brief/readiness`);
    const baseline = await baselineRes.json();
    console.log(`1. Baseline Readiness: ${baseline.status}`);

    console.log(`2. Generating/Refreshing Brief (this may take a minute)...`);
    const genRes = await fetch(`${base}/api/groups/campaign/${slug}/brief`, { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' } });
    const generated = await genRes.json();
    console.log(`   -> Generation Complete.`);

    const readRes = await fetch(`${base}/api/groups/campaign/${slug}/brief/readiness`);
    const readiness = await readRes.json();
    console.log(`3. Post-Generation Readiness: ${readiness.status}`);

    const storeRes = await fetch(`${base}/api/groups/campaign/${slug}/media/aesthetic`);
    const stored = await storeRes.json();
    console.log(`4. Persisted: ${stored.productionBuildStatus ? 'Yes (' + stored.productionBuildStatus + ')' : 'No'}`);

    const blockers = (readiness.issues || []).filter((i: any) => i.severity === 'blocker');
    console.log(`   -> Blockers Count: ${blockers.length}`);

    let canApprove = true;
    if (blockers.length > 0) canApprove = false;
    if (stored.productionBuildStatus === 'fail') canApprove = false;

    if (canApprove) {
      try {
        const appRes = await fetch(`${base}/api/groups/campaign/${slug}/brief/approve`, { method: 'POST' });
        const approval = await appRes.json();
        console.log(`5. APPROVED: ${approval.status || 'Success'}`);
      } catch (e: any) {
        console.log(`5. APPROVAL FAILED: ${e.message}`);
      }
    } else {
      console.log(`5. SKIPPED APPROVAL: Blockers remain or production build failed`);
    }
  }
}
run();
