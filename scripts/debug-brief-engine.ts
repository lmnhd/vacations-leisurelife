import fs from 'fs';
import path from 'path';
import { createOrRefreshBrief } from '../lib/campaigns/brief-engine/orchestrator';

const SLUG = 'wellness-and-nature-cruise';
const OUT = path.join(__dirname, 'brief-result.json');

async function run() {
  try {
    console.log(`Generating brief for ${SLUG}...`);
    const res = await createOrRefreshBrief(SLUG);
    fs.writeFileSync(OUT, JSON.stringify(res, null, 2));
    console.log('Brief generated. Result written to', OUT);
    console.log('Success:', res.success);
    console.log('Issues:', res.issues?.length || 0);
    if (res.brief) {
      console.log('Brief title:', res.brief.title);
      console.log('Brief status:', res.brief.status);
    }
  } catch(e) {
    const err = e instanceof Error ? e : new Error(String(e));
    fs.writeFileSync(OUT, JSON.stringify({ error: err.message, stack: err.stack }, null, 2));
    console.error('Caught:', err.message);
    process.exit(1);
  }
}

run();
