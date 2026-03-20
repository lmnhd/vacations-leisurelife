/**
 * Simple Test: One Campaign Only
 */

import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

async function testOneCampaign(): Promise<void> {
    console.log('Testing one campaign...');
    
    // Test just the imports first
    try {
        const { scanAllCampaigns } = await import('../lib/campaigns/campaign-store');
        console.log('✓ Campaign store imports work');
        
        const campaigns = await scanAllCampaigns();
        console.log(`✓ Found ${campaigns.length} campaigns`);
        
        // Test one specific campaign
        const campaign = campaigns.find(c => c.id === 'bp-cottagecore-infinity-2026-10n-grtr');
        if (campaign) {
            console.log(`✓ Found test campaign: ${campaign.name}`);
        }
        
    } catch (error) {
        console.error('❌ Import failed:', error);
        process.exit(1);
    }
}

testOneCampaign().catch(console.error);
