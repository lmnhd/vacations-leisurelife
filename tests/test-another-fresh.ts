/**
 * Test Another Fresh Campaign
 */

import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

async function testAnotherFresh(): Promise<void> {
    console.log('🚀 Testing another fresh campaign...\n');
    
    const { scanAllCampaigns } = await import('../lib/campaigns/campaign-store');
    
    // Find fresh campaigns (skip the ones we've already tested)
    const campaigns = await scanAllCampaigns();
    const freshCandidates = campaigns.filter(c => 
        c.pricingStatus === 'CB_MATCHED' && 
        c.id !== 'bp-cottagecore-infinity-2026-10n-grtr' && // deleted
        c.id !== 'film-and-zine-afloat-2026' && // just tested
        c.id !== 'bp-tabletop-icon-2027-7n-caribbean' &&
        c.id !== 'greek-isles-book-lovers-2026-09-26'
    );
    
    console.log(`Found ${freshCandidates.length} remaining fresh campaigns:`);
    freshCandidates.slice(0, 5).forEach(c => {
        console.log(`  - ${c.id}: ${c.name}`);
    });
    
    if (freshCandidates.length === 0) {
        console.log('❌ No more fresh campaigns found');
        return;
    }
    
    // Pick a different one
    const testCampaign = freshCandidates[1]; // Use index 1 for variety
    console.log(`\n🚀 Testing: ${testCampaign.id}`);
    console.log(`Name: ${testCampaign.name}`);
    console.log(`Ship: ${testCampaign.matchedShipName || 'N/A'}`);
    console.log(`Price: $${testCampaign.startingPrice || 'N/A'}`);
    
    // Test the campaign
    console.log('\n--- Testing Campaign ---');
    
    const { createOrRefreshBrief, getReadiness, approveForMedia } = await import('../lib/campaigns/brief-engine/orchestrator');
    const { getAestheticBrief } = await import('../lib/campaigns/campaign-store');
    
    const start = Date.now();
    let result;
    
    try {
        result = await createOrRefreshBrief(testCampaign.id);
    } catch (error) {
        console.log(`❌ Generation failed: ${error instanceof Error ? error.message : String(error)}`);
        if (error instanceof Error && error.stack) {
            console.log('Stack trace:', error.stack);
        }
        return;
    }
    
    const duration = ((Date.now() - start) / 1000).toFixed(1);
    const blockers = result.issues.filter(i => i.severity === 'blocker').length;
    const warnings = result.issues.filter(i => i.severity === 'warning').length;
    
    console.log(`\n✅ Generation completed in ${duration}s`);
    console.log(`Readiness: ${result.readiness}`);
    console.log(`Summary: ${result.summary}`);
    console.log(`Blockers: ${blockers}, Warnings: ${warnings}`);
    console.log(`Auto-fix: ${result.autoFixApplied}`);
    console.log(`Fixed codes: ${result.fixedCodes.join(', ') || 'none'}`);
    console.log(`Corrective reprompt: ${result.correctiveRepromptUsed}`);
    
    // Show blockers if any
    if (blockers > 0) {
        console.log('\nBlockers:');
        result.issues.filter(i => i.severity === 'blocker').forEach(b => {
            console.log(`  - [${b.code}] ${b.message}`);
        });
    }
    
    // Verify brief persisted
    const brief = await getAestheticBrief(testCampaign.id);
    if (brief) {
        console.log(`\n✅ Brief persisted:`);
        console.log(`  Theme: ${brief.themeName}`);
        console.log(`  Hero Slogan: ${brief.messaging?.heroSlogan || 'N/A'}`);
        console.log(`  Merch: ${brief.merch?.coreItem?.productType || 'N/A'}`);
        console.log(`  Production Bible: ${brief.productionBible ? '✓' : '❌'}`);
        console.log(`  Landing Still Bible: ${brief.landingStillBible ? '✓' : '❌'}`);
        console.log(`  Production Lint: ${brief.productionBuildLint ? '✓' : '❌'}`);
    } else {
        console.log('\n❌ Brief not persisted');
    }
    
    // Test approval if clean
    if (blockers === 0) {
        console.log('\n--- Testing Approval ---');
        try {
            const approval = await approveForMedia(testCampaign.id);
            console.log(`✅ Approval successful: ${approval.readiness}`);
        } catch (error) {
            console.log(`❌ Approval failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    } else {
        console.log(`\nSkipping approval (${blockers} blockers remain)`);
    }
    
    console.log('\n✅ Campaign test completed');
}

testAnotherFresh().catch((error) => {
    console.error('FATAL:', error);
    process.exit(1);
});
