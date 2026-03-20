/**
 * Test Fresh Campaign - drift-festival-icon-2026
 * Check if it develops the production build status issue
 */

import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

async function testFreshCampaign(): Promise<void> {
    console.log('🚀 Testing: drift-festival-icon-2026\n');
    
    const { getCampaignBlueprint } = await import('../lib/campaigns/campaign-store');
    
    const slug = 'drift-festival-icon-2026';
    
    // Get campaign info
    const campaign = await getCampaignBlueprint(slug);
    if (!campaign) {
        console.log('❌ Campaign not found');
        return;
    }
    
    console.log('Campaign Info:');
    console.log(`  Name: ${campaign.name}`);
    console.log(`  Ship: ${campaign.matchedShipName || 'N/A'}`);
    console.log(`  Price: $${campaign.startingPrice || 'N/A'}`);
    console.log(`  Pricing Status: ${campaign.pricingStatus}`);
    
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
    
    // Check production build status immediately after generation
    const brief = await getAestheticBrief(slug);
    const readiness = await getReadiness(slug);
    
    console.log('\n--- Post-Generation Status ---');
    console.log(`Readiness: ${readiness.readiness}`);
    console.log(`Brief Status: ${brief?.humanReviewStatus || 'N/A'}`);
    console.log(`Production Build Status: ${brief?.productionBuildStatus || 'N/A'}`);
    console.log(`Production Build Evaluated: ${brief?.productionBuildEvaluatedAt || 'N/A'}`);
    
    if (brief?.productionBuildLint) {
        console.log(`\nProduction Build Lint:`);
        console.log(`  Verdict: ${brief.productionBuildLint.verdict}`);
        console.log(`  Blocking Issues: ${brief.productionBuildLint.blockingIssues?.length || 0}`);
        
        if (brief.productionBuildLint.blockingIssues && brief.productionBuildLint.blockingIssues.length > 0) {
            console.log('\nIssues:');
            brief.productionBuildLint.blockingIssues.slice(0, 3).forEach((issue: any, i: number) => {
                console.log(`    ${i + 1}. [${issue.severity}] ${issue.message.substring(0, 100)}...`);
            });
        }
    }
    
    // Test approval if possible
    if (blockers === 0) {
        console.log('\n--- Testing Approval ---');
        try {
            const approval = await approveForMedia(slug);
            console.log(`✅ Approval successful: ${approval.readiness}`);
            
            // Check final status after approval
            const finalBrief = await getAestheticBrief(slug);
            const finalReadiness = await getReadiness(slug);
            
            console.log('\n--- Final Status ---');
            console.log(`Final Readiness: ${finalReadiness.readiness}`);
            console.log(`Final Production Build Status: ${finalBrief?.productionBuildStatus || 'N/A'}`);
            
            // Check for the issue
            const hasIssue = finalReadiness.readiness === 'ready_for_media' && finalBrief?.productionBuildStatus === 'fail';
            console.log(`\n🚨 ISSUE DETECTED: ${hasIssue ? 'YES' : 'NO'}`);
            
            if (hasIssue) {
                console.log('⚠️  This campaign developed the issue: ready_for_media but productionBuildStatus = fail');
            }
            
        } catch (error) {
            console.log(`❌ Approval failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    } else {
        console.log(`\nSkipping approval (${blockers} blockers remain)`);
    }
    
    console.log('\n✅ Test completed');
}

testFreshCampaign().catch(console.error);
