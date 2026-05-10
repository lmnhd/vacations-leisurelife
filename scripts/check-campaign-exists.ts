import { getCampaignBlueprint } from '@/lib/campaigns/campaign-store';

async function main() {
  const slug = process.argv[2] || 'wellness-and-nature-cruise';
  const campaign = await getCampaignBlueprint(slug);
  if (campaign) {
    console.log('EXISTS:', JSON.stringify({
      slug: campaign.id,
      name: campaign.name,
      status: campaign.status,
      pricingStatus: campaign.pricingStatus,
      aestheticBriefStatus: campaign.aestheticBriefStatus,
    }));
  } else {
    console.log('NOT_FOUND');
  }
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
