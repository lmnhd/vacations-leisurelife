import { getCampaignBlueprint } from './lib/campaigns/campaign-store';
async function run() {
  const result = await getCampaignBlueprint('alaska-slow-living-2026-09-20');
  console.log(JSON.stringify(result, null, 2));
}
run();
