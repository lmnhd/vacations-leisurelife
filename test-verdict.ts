import { getCampaignBlueprint } from './lib/campaigns/campaign-store';
async function run() {
  const c1 = await getCampaignBlueprint('cartridge-and-sunrise-retro-deck-nights');
  const c2 = await getCampaignBlueprint('aesthetic-scandinavia-2026');
  console.log('Cartridge:', c1.discoveryRedTeamReview?.verdict);
  console.log('Scandinavia:', c2.discoveryRedTeamReview?.verdict);
}
run();
