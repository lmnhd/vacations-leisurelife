import { getCampaignBlueprint } from '../lib/campaigns/campaign-store';

async function main() {
  try {
    const campaign = await getCampaignBlueprint('board-games-at-sea');
    if (!campaign) {
      console.error('Campaign not found');
      process.exit(1);
    }
    console.log(JSON.stringify(campaign, null, 2));
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

main();
