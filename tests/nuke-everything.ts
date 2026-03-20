/**
 * Nuclear option: Delete ALL campaigns and briefs
 * Start completely fresh
 */

import { deleteAllCampaigns, deleteAestheticBrief } from '../lib/campaigns/campaign-store';
import { scanAllCampaigns } from '../lib/campaigns/campaign-store';

async function nukeEverything(): Promise<void> {
    console.log('\n☢️  NUCLEAR OPTION: Deleting everything...\n');

    // Step 1: Get all campaigns
    console.log('[1/3] Finding all campaigns...');
    const campaigns = await scanAllCampaigns();
    console.log(`Found ${campaigns.length} campaigns`);

    // Step 2: Delete all briefs first
    console.log('\n[2/3] Deleting all aesthetic briefs...');
    let deletedBriefs = 0;
    for (const campaign of campaigns) {
        try {
            await deleteAestheticBrief(campaign.id);
            console.log(`  ✓ Deleted brief for ${campaign.id}`);
            deletedBriefs++;
        } catch {
            // Brief may not exist, ignore
        }
    }
    console.log(`Deleted ${deletedBriefs} briefs`);

    // Step 3: Delete all campaigns
    console.log('\n[3/3] Deleting all campaigns...');
    const deletedCampaigns = await deleteAllCampaigns();
    console.log(`Deleted ${deletedCampaigns} campaigns`);

    console.log('\n✅ All clear. Starting fresh.');
    console.log('\nNext steps:');
    console.log('1. Go to /tests/groups/discovery');
    console.log('2. Create new campaign with real cruise inventory');
    console.log('3. Run through Brief Studio → Media Generation → Landing Page');
    console.log('');
}

nukeEverything().catch((error) => {
    console.error('\n❌ ERROR:', error instanceof Error ? error.message : String(error));
    process.exit(1);
});
