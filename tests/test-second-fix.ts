/**
 * Test Fixed Approval - transpacific-vinyl-listening-nov-2026
 * Second verification of the production build lint gate fix
 */

import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

async function testSecondFix(): Promise<void> {
    console.log('🔧 Testing Fixed Approval: transpacific-vinyl-listening-nov-2026\n');
    
    const { getAestheticBrief, deleteAestheticBrief } = await import('../lib/campaigns/campaign-store');
    const { getReadiness, approveForMedia } = await import('../lib/campaigns/brief-engine/orchestrator');
    
    const slug = 'transpacific-vinyl-listening-nov-2026';
    
    // Check current state
    const currentBrief = await getAestheticBrief(slug);
    const currentReadiness = await getReadiness(slug);
    
    console.log('Current State:');
    console.log(`  Readiness: ${currentReadiness.readiness}`);
    console.log(`  Production Build Status: ${currentBrief?.productionBuildStatus || 'N/A'}`);
    
    // Delete and regenerate
    console.log('\n--- Deleting Brief ---');
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
    console.log(`Blockers: ${blockers}, Auto-fix: ${result.autoFixApplied}`);
    
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
    console.log('\n--- Testing Approval ---');
    
    if (blockers === 0) {
        try {
            const approval = await approveForMedia(slug);
            console.log(`❌ UNEXPECTED: Approval succeeded: ${approval.readiness}`);
        } catch (error) {
            console.log(`✅ EXPECTED: Approval failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    } else {
        console.log(`Skipping approval test (${blockers} structural blockers remain)`);
    }
    
    console.log('\n✅ Second fix verification completed');
}

testSecondFix().catch(console.error);
