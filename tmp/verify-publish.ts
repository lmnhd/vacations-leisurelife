import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

async function main() {
  const slug = 'board-games-at-sea';
  const base = 'http://localhost:3000';

  // 1. Check landing page
  console.log('=== CHECKING LANDING PAGE ===');
  try {
    const res = await fetch(`${base}/groups/${slug}`);
    console.log(`Status: ${res.status} ${res.statusText}`);
    const html = await res.text();
    console.log(`HTML length: ${html.length}`);
    console.log(`Contains "Board Games": ${html.includes('Board Games')}`);
    console.log(`Contains "notFound": ${html.includes('not-found') || html.includes('404')}`);
    console.log(`Contains "heroSlogan": ${html.includes('Game On') || html.includes('Ocean Bound')}`);
  } catch (e) {
    console.log(`Error: ${e instanceof Error ? e.message : String(e)}`);
  }

  // 2. Check distribution plan (cold placement - simulate)
  console.log('\n=== CHECKING DISTRIBUTION PLAN (SIMULATE) ===');
  try {
    const res = await fetch(`${base}/api/groups/campaign/${slug}/media/distribute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'plan', providerMode: 'simulate' }),
    });
    console.log(`Status: ${res.status} ${res.statusText}`);
    const body = await res.json();
    console.log(JSON.stringify(body, null, 2));
  } catch (e) {
    console.log(`Error: ${e instanceof Error ? e.message : String(e)}`);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
