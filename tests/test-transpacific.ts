/**
 * Test Fresh Campaign - transpacific-vinyl-listening-nov-2026
 * Continue checking for production build status issue
 */

import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

async function testTranspacific(): Promise<void> {
    console.log('🚀 Testing: transpacific-vinyl-listening-nov-2026\n');
    
    const { getCampaignBlueprint } = await import('../lib/campaigns/campaign-store');
    
    const slug = 'transpacific-vinyl-listening-nov-2026';
    
    const campaign = await getCampaignBlueprint(slug);
    if (!campaign) {
        console.log('❌ Campaign not found');
        return;
    }
    
    console.log('Campaign Info:');
    console.log(`  Name: ${campaign.name}`);
    console.log(`  Ship: ${campaign.matchedShipName || 'N/A'}`);
    console.log(`  Price: $${campaign.startingPrice || 'N/A'}`);
    
    // Generate brief
    console.log('\n--- Generating Brief ---');
    
    const { createOrRefreshBrief, getReadiness, approveForMedia } = await import('../lib/campaigns/brief-engine/orchestrator');
    const { getAestheticBrief } = await import('../lib/campaigns/campaign-store');
    
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
    
    // Check production build status
    const brief = await getAestheticBrief(slug);
    const readiness = await getReadiness(slug);
    
    console.log('\n--- Post-Generation Status ---');
    console.log(`Readiness: ${readiness.readiness}`);
    console.log(`Production Build Status: ${brief?.productionBuildStatus || 'N/A'}`);
    
    if (brief?.productionBuildLint) {
        console.log(`Production Build Verdict: ${brief.productionBuildLint.verdict}`);
        console.log(`Blocking Issues: ${brief.productionBuildLint.blockingIssues?.length || 0}`);
    }
    
    // Test approval if possible
    if (blockers === 0) {
        console.log('\n--- Testing Approval ---');
        try {
            const approval = await approveForMedia(slug);
            console.log(`✅ Approval successful: ${approval.readiness}`);
            
            // Check final status
            const finalBrief = await getAestheticBrief(slug);
            const finalReadiness = await getReadiness(slug);
            
            const hasIssue = finalReadiness.readiness === 'ready_for_media' && finalBrief?.productionBuildStatus === 'fail';
            console.log(`\n🚨 ISSUE DETECTED: ${hasIssue ? 'YES' : 'NO'}`);
            
            if (hasIssue) {
                console.log('⚠️  Another case: ready_for_media but productionBuildStatus = fail');
            }
            
        } catch (error) {
            console.log(`❌ Approval failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    } else {
        console.log(`\nSkipping approval (${blockers} blockers remain)`);
    }
    
    console.log('\n✅ Test completed');
}

testTranspacific().catch(console.error);
