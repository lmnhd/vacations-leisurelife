/**
 * End-to-End Test: Discovery → Brief → Approval
 * Tests that the full pipeline produces a compliant campaign
 */

import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd());

import { runGroupDiscoveryPipeline } from '../app/api/groups/discovery/core-logic';
import { createOrRefreshBrief, approveForMedia, getReadiness } from '../lib/campaigns/brief-engine/orchestrator';
import { scanAllCampaigns, getAestheticBrief, deleteAestheticBrief } from '../lib/campaigns/campaign-store';

async function runEndToEndTest(): Promise<void> {
    console.log('\n🚀 END-TO-END TEST: Discovery → Brief → Approval\n');

    // Step 1: Run discovery pipeline (USE CACHE - no Perplexity re-run)
    console.log('[1/6] Running discovery pipeline...');
    console.log('      (Using cached research results - no Perplexity calls)');
    const discoveryResult = await runGroupDiscoveryPipeline({ respin: false });
    console.log(`✓ Created ${discoveryResult.campaigns.length} campaigns`);
    
    if (discoveryResult.campaigns.length === 0) {
        console.error('✗ No campaigns created');
        process.exit(1);
    }

    // Step 2: Pick first campaign
    const campaign = discoveryResult.campaigns[0];
    console.log(`\n[2/6] Selected campaign: ${campaign.name} (${campaign.id})`);

    // Step 3: Clear any existing brief
    console.log('\n[3/6] Clearing existing brief (if any)...');
    try {
        await deleteAestheticBrief(campaign.id);
        console.log('  ✓ Cleared existing brief');
    } catch {
        console.log('  ℹ No existing brief');
    }

    // Step 4: Generate brief via Brief Engine
    console.log('\n[4/6] Generating brief via Brief Engine...');
    console.log('      (Trinity: Designer → Builder → Reviewer)');
    const startTime = Date.now();
    const briefResult = await createOrRefreshBrief(campaign.id);
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    
    console.log(`✓ Brief generated in ${duration}s`);
    console.log(`  Readiness: ${briefResult.readiness}`);
    console.log(`  Blockers: ${briefResult.issues.filter(i => i.severity === 'blocker').length}`);
    console.log(`  Warnings: ${briefResult.issues.filter(i => i.severity === 'warning').length}`);
    console.log(`  Auto-fix applied: ${briefResult.autoFixApplied}`);
    
    if (briefResult.fixedCodes.length > 0) {
        console.log(`  Fixed codes: ${briefResult.fixedCodes.join(', ')}`);
    }

    // Step 5: Verify readiness
    console.log('\n[5/6] Checking readiness...');
    const readiness = await getReadiness(campaign.id);
    console.log(`  Status: ${readiness.readiness}`);
    console.log(`  Summary: ${readiness.summary}`);

    // Step 6: Attempt approval
    console.log('\n[6/6] Attempting approval...');
    const blockers = briefResult.issues.filter(i => i.severity === 'blocker');
    
    if (blockers.length === 0) {
        try {
            const approval = await approveForMedia(campaign.id);
            console.log(`✓ APPROVAL SUCCESSFUL!`);
            console.log(`  Final status: ${approval.readiness}`);
            console.log(`\n✅ TEST PASSED - Campaign ready for media generation`);
            
            // Verify final brief
            const finalBrief = await getAestheticBrief(campaign.id);
            if (finalBrief) {
                console.log(`\n📋 Final Brief Summary:`);
                console.log(`  Theme: ${finalBrief.themeName}`);
                console.log(`  Hero Slogan: ${finalBrief.messaging.heroSlogan}`);
                console.log(`  Merch: ${finalBrief.merch.coreItem.productType}`);
                console.log(`  Production Bible: ${finalBrief.productionBible ? '✓ Present' : '✗ Missing'}`);
                console.log(`  Landing Still Bible: ${finalBrief.landingStillBible ? '✓ Present' : '✗ Missing'}`);
            }
        } catch (error) {
            console.error(`✗ Approval failed: ${error instanceof Error ? error.message : String(error)}`);
            console.log('\n❌ TEST FAILED');
            process.exit(1);
        }
    } else {
        console.log(`⚠ Cannot approve: ${blockers.length} blocker(s) remain`);
        blockers.forEach(b => {
            console.log(`  - ${b.code}: ${b.message}`);
            console.log(`    Auto-fixable: ${b.autoFixable ? 'YES' : 'NO'}`);
        });
        
        // Show unfixable blockers
        const unfixable = blockers.filter(b => !b.autoFixable);
        if (unfixable.length > 0) {
            console.log(`\n❌ ${unfixable.length} UNFIXABLE blockers - requires manual intervention`);
            console.log('\n❌ TEST FAILED - Campaign does not meet specifications');
            process.exit(1);
        } else {
            console.log(`\n⚠ All blockers are auto-fixable but weren't fixed`);
            console.log('This is a bug in the auto-fix logic');
            process.exit(1);
        }
    }

    console.log('\n');
}

runEndToEndTest().catch((error) => {
    console.error('\n❌ TEST ERROR:', error instanceof Error ? error.message : String(error));
    process.exit(1);
});
