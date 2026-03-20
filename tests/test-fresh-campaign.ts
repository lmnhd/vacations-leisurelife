/**
 * Delete Cottagecore Campaign & Test Fresh One
 */

import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

async function deleteAndTestFresh(): Promise<void> {
    console.log('🗑️ Deleting cottagecore campaign...\n');
    
    const { deleteCampaignBlueprint, scanAllCampaigns, getCampaignBlueprint } = await import('../lib/campaigns/campaign-store');
    
    // Delete cottagecore
    try {
        await deleteCampaignBlueprint('bp-cottagecore-infinity-2026-10n-grtr');
        console.log('✅ Cottagecore campaign deleted');
    } catch (error) {
        console.log('⚠️ Cottagecore deletion:', error instanceof Error ? error.message : String(error));
    }
    
    // Find a fresh campaign (CB matched, no brief)
    console.log('\n🔍 Finding fresh campaign to test...\n');
    
    const campaigns = await scanAllCampaigns();
    const freshCandidates = campaigns.filter(c => 
        c.pricingStatus === 'CB_MATCHED' && 
        c.id !== 'bp-cottagecore-infinity-2026-10n-grtr' &&
        c.id !== 'bp-tabletop-icon-2027-7n-caribbean' &&
        c.id !== 'greek-isles-book-lovers-2026-09-26'
    );
    
    console.log(`Found ${freshCandidates.length} fresh CB-matched candidates:`);
    freshCandidates.slice(0, 5).forEach(c => {
        console.log(`  - ${c.id}: ${c.name}`);
    });
    
    if (freshCandidates.length === 0) {
        console.log('❌ No fresh campaigns found');
        return;
    }
    
    // Pick the first one
    const testCampaign = freshCandidates[0];
    console.log(`\n🚀 Testing: ${testCampaign.id}`);
    console.log(`Name: ${testCampaign.name}`);
    console.log(`Ship: ${testCampaign.matchedShipName || 'N/A'}`);
    console.log(`Price: $${testCampaign.startingPrice || 'N/A'}`);
    
    // Test the fresh campaign
    console.log('\n--- Testing Fresh Campaign ---');
    
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
    
    console.log('\n✅ Fresh campaign test completed');
}

deleteAndTestFresh().catch((error) => {
    console.error('FATAL:', error);
    process.exit(1);
});
