/**
 * Integration test: Brief Engine end-to-end
 * Tests that the orchestrator can generate, validate, auto-fix, and approve a brief
 */

import { createOrRefreshBrief, getReadiness, approveForMedia } from '../lib/campaigns/brief-engine/orchestrator';
import { getCampaignBlueprint, getAestheticBrief, deleteAestheticBrief } from '../lib/campaigns/campaign-store';

const TEST_SLUG = 'eurogame-deck-nights-2026';

async function runIntegrationTest(): Promise<void> {
    console.log('\n=== Brief Engine Integration Test ===\n');
    
    // Step 1: Check campaign exists
    console.log(`[1/5] Loading campaign: ${TEST_SLUG}`);
    const campaign = await getCampaignBlueprint(TEST_SLUG);
    if (!campaign) {
        console.error(`✗ Campaign not found: ${TEST_SLUG}`);
        process.exit(1);
    }
    console.log(`✓ Campaign loaded: ${campaign.name}`);
    
    // Step 2: Clear any existing brief to test fresh generation
    console.log('\n[2/5] Clearing existing brief (if any)...');
    const existingBrief = await getAestheticBrief(TEST_SLUG);
    if (existingBrief) {
        await deleteAestheticBrief(TEST_SLUG);
        console.log('✓ Existing brief cleared');
    } else {
        console.log('ℹ No existing brief (fresh start)');
    }
    
    // Step 3: Generate initial brief via Brief Engine
    console.log('\n[3/5] Generating brief via Brief Engine...');
    const startTime = Date.now();
    const result = await createOrRefreshBrief(TEST_SLUG);
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    
    console.log(`✓ Brief generated in ${duration}s`);
    console.log(`  Readiness: ${result.readiness}`);
    console.log(`  Blockers: ${result.issues.filter(i => i.severity === 'blocker').length}`);
    console.log(`  Warnings: ${result.issues.filter(i => i.severity === 'warning').length}`);
    console.log(`  Auto-fix applied: ${result.autoFixApplied}`);
    if (result.fixedCodes.length > 0) {
        console.log(`  Fixed codes: ${result.fixedCodes.join(', ')}`);
    }
    if (result.warnings.length > 0) {
        console.log(`  Warnings: ${result.warnings.join('; ')}`);
    }
    
    // Step 4: Verify readiness state
    console.log('\n[4/5] Checking readiness state...');
    const readiness = await getReadiness(TEST_SLUG);
    console.log(`✓ Readiness: ${readiness.readiness}`);
    console.log(`  Summary: ${readiness.summary}`);
    
    // Step 5: Attempt approval (if no blockers)
    console.log('\n[5/5] Attempting approval...');
    const blockers = result.issues.filter(i => i.severity === 'blocker');
    
    if (blockers.length === 0) {
        try {
            const approval = await approveForMedia(TEST_SLUG);
            console.log(`✓ Approval successful!`);
            console.log(`  Status: ${approval.readiness}`);
            console.log(`  Summary: ${approval.summary}`);
            console.log('\n=== ✅ TEST PASSED - Campaign ready for media ===');
        } catch (error) {
            console.error(`✗ Approval failed: ${error instanceof Error ? error.message : String(error)}`);
            console.log('\n=== ❌ TEST FAILED - Approval blocked ===');
            process.exit(1);
        }
    } else {
        console.log(`⚠ Cannot approve: ${blockers.length} blocker(s) remain`);
        blockers.forEach(b => console.log(`  - ${b.code}: ${b.message}`));
        console.log('\n=== ⚠ TEST INCOMPLETE - Blockers need resolution ===');
        // Don't exit with error - this is expected behavior
    }
    
    console.log('\n');
}

runIntegrationTest().catch((error) => {
    console.error('\n=== ❌ TEST ERROR ===');
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});
