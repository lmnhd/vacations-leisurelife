import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

async function main() {
  const slug = 'board-games-at-sea';
  const base = 'http://localhost:3000';

  // 1. Check landing page
  console.log('=== CHECKING LANDING PAGE ===');
  try {
    const res = await fetch(`${base}/groups/${slug}`);
    console.log(`Landing page status: ${res.status} ${res.statusText}`);
    if (res.status === 200) {
      const html = await res.text();
      console.log(`Landing page HTML length: ${html.length}`);
      console.log(`Contains "Board Games": ${html.includes('Board Games')}`);
      console.log(`Contains "notFound": ${html.includes('not-found') || html.includes('404')}`);
    }
  } catch (e) {
    console.log(`Landing page error: ${e instanceof Error ? e.message : String(e)}`);
  }

  // 2. Check distribution plan
  console.log('\n=== CHECKING DISTRIBUTION PLAN ===');
  try {
    const res = await fetch(`${base}/api/groups/campaign/${slug}/media/distribute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'plan', providerMode: 'simulate' }),
    });
    console.log(`Distribute status: ${res.status} ${res.statusText}`);
    const body = await res.json();
    console.log(JSON.stringify(body, null, 2));
  } catch (e) {
    console.log(`Distribute error: ${e instanceof Error ? e.message : String(e)}`);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
