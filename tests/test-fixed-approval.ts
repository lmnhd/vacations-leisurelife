/**
 * Test Fixed Approval - drift-festival-icon-2026
 * Verify the production build lint gate fix
 */

import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

async function testFixedApproval(): Promise<void> {
    console.log('🔧 Testing Fixed Approval: drift-festival-icon-2026\n');
    
    const { getAestheticBrief, deleteAestheticBrief } = await import('../lib/campaigns/campaign-store');
    const { getReadiness, approveForMedia } = await import('../lib/campaigns/brief-engine/orchestrator');
    
    const slug = 'drift-festival-icon-2026';
    
    // Check current state
    const currentBrief = await getAestheticBrief(slug);
    const currentReadiness = await getReadiness(slug);
    
    console.log('Current State:');
    console.log(`  Readiness: ${currentReadiness.readiness}`);
    console.log(`  Brief Status: ${currentBrief?.humanReviewStatus || 'N/A'}`);
    console.log(`  Production Build Status: ${currentBrief?.productionBuildStatus || 'N/A'}`);
    
    if (currentBrief?.productionBuildLint) {
        console.log(`  Production Build Verdict: ${currentBrief.productionBuildLint.verdict}`);
        console.log(`  Blocking Issues: ${currentBrief.productionBuildLint.blockingIssues?.length || 0}`);
    }
    
    // Delete and regenerate to test the fix
    console.log('\n--- Deleting Brief to Test Fix ---');
    try {
        await deleteAestheticBrief(slug);
        console.log('✅ Brief deleted');
    } catch (error) {
        console.log('⚠️ Brief deletion:', error instanceof Error ? error.message : String(error));
    }
    
    // Generate fresh brief
    console.log('\n--- Generating Fresh Brief ---');
    
    const { createOrRefreshBrief } = await import('../lib/campaigns/brief-engine/orchestrator');
    
    const start = Date.now();
    let result;
    
    try {
        result = await createOrRefreshBrief(slug);
    } catch (error) {
        console.log(`❌ Generation failed: ${error instanceof Error ? error.message : String(error)}`);
        return;
    }
    
    const duration = ((Date.now() - start) / 1000).toFixed(1);
    const blockers = result.issues.filter(i => i.severity === 'blocker').length;
    
    console.log(`\n✅ Generation completed in ${duration}s`);
    console.log(`Blockers: ${blockers}, Warnings: ${result.issues.filter(i => i.severity === 'warning').length}`);
    console.log(`Auto-fix: ${result.autoFixApplied}, Reprompt: ${result.correctiveRepromptUsed}`);
    
    // Check post-generation status
    const newBrief = await getAestheticBrief(slug);
    const newReadiness = await getReadiness(slug);
    
    console.log('\n--- Post-Generation Status ---');
    console.log(`Readiness: ${newReadiness.readiness}`);
    console.log(`Production Build Status: ${newBrief?.productionBuildStatus || 'N/A'}`);
    
    if (newBrief?.productionBuildLint) {
        console.log(`Production Build Verdict: ${newBrief.productionBuildLint.verdict}`);
        console.log(`Blocking Issues: ${newBrief.productionBuildLint.blockingIssues?.length || 0}`);
    }
    
    // Test approval attempt
    console.log('\n--- Testing Approval (Should Fail Now) ---');
    
    if (blockers === 0) {
        try {
            const approval = await approveForMedia(slug);
            console.log(`❌ UNEXPECTED: Approval succeeded: ${approval.readiness}`);
            console.log('⚠️  The fix may not be working correctly');
        } catch (error) {
            console.log(`✅ EXPECTED: Approval failed: ${error instanceof Error ? error.message : String(error)}`);
            console.log('🔧 Fix is working - approval blocked due to production build failure');
        }
    } else {
        console.log(`Skipping approval test (${blockers} structural blockers remain)`);
    }
    
    console.log('\n✅ Fix verification completed');
}

testFixedApproval().catch(console.error);
