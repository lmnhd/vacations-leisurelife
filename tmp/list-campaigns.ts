import { scanAllCampaigns } from '../lib/campaigns/campaign-store';

async function main() {
  try {
    const campaigns = await scanAllCampaigns();
    console.log(`Found ${campaigns.length} campaigns:`);
    for (const c of campaigns) {
      const name = (c.name || '').toLowerCase();
      const id = (c.id || '').toLowerCase();
      if (name.includes('board') || name.includes('game') || id.includes('board') || id.includes('game')) {
        console.log(`  - ${c.id}: ${c.name}`);
      }
    }
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

main();
