/**
 * Test Brief Engine Imports
 */

import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

async function testBriefEngine(): Promise<void> {
    console.log('Testing brief engine imports...');
    
    try {
        // Test brief engine imports
        const { createOrRefreshBrief, getReadiness, approveForMedia } = await import('../lib/campaigns/brief-engine/orchestrator');
        console.log('✓ Brief engine imports work');
        
        // Test campaign store imports  
        const { getCampaignBlueprint, getAestheticBrief, deleteAestheticBrief } = await import('../lib/campaigns/campaign-store');
        console.log('✓ Campaign store imports work');
        
        // Get a test campaign
        const campaign = await getCampaignBlueprint('bp-cottagecore-infinity-2026-10n-grtr');
        if (!campaign) {
            console.log('❌ Test campaign not found');
            return;
        }
        
        console.log(`✓ Test campaign: ${campaign.name}`);
        
        // Check if brief exists
        const existingBrief = await getAestheticBrief('bp-cottagecore-infinity-2026-10n-grtr');
        console.log(`✓ Brief check: ${existingBrief ? 'exists' : 'none'}`);
        
        // Test readiness function
        if (existingBrief) {
            const readiness = await getReadiness('bp-cottagecore-infinity-2026-10n-grtr');
            console.log(`✓ Readiness: ${readiness.readiness} (${readiness.issues.length} issues)`);
        }
        
    } catch (error) {
        console.error('❌ Import failed:', error);
        if (error instanceof Error) {
            console.error('Stack:', error.stack);
        }
        process.exit(1);
    }
}

testBriefEngine().catch(console.error);
