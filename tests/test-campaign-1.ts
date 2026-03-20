/**
 * Test Individual Campaign - film-and-zine-afloat-2026
 * Check production build status issue
 */

import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

async function testCampaign1(): Promise<void> {
    console.log('🔍 Testing: film-and-zine-afloat-2026\n');
    
    const { getAestheticBrief } = await import('../lib/campaigns/campaign-store');
    const { getReadiness } = await import('../lib/campaigns/brief-engine/orchestrator');
    
    const slug = 'film-and-zine-afloat-2026';
    
    // Check current state
    const brief = await getAestheticBrief(slug);
    const readiness = await getReadiness(slug);
    
    console.log('Current State:');
    console.log(`  Readiness: ${readiness.readiness}`);
    console.log(`  Brief Status: ${brief?.humanReviewStatus || 'N/A'}`);
    console.log(`  Production Build Status: ${brief?.productionBuildStatus || 'N/A'}`);
    console.log(`  Production Build Evaluated: ${brief?.productionBuildEvaluatedAt || 'N/A'}`);
    
    if (brief?.productionBuildLint) {
        console.log('\nProduction Build Lint Report:');
        console.log(`  Verdict: ${brief.productionBuildLint.verdict}`);
        console.log(`  Evaluated: ${brief.productionBuildLint.evaluatedAt}`);
        console.log(`  Blocking Issues: ${brief.productionBuildLint.blockingIssues?.length || 0}`);
        
        if (brief.productionBuildLint.blockingIssues) {
            console.log('\nBlocking Issues:');
            brief.productionBuildLint.blockingIssues.forEach((issue: any, i: number) => {
                console.log(`    ${i + 1}. [${issue.severity}] ${issue.message}`);
                if (issue.suggestion) {
                    console.log(`       Suggestion: ${issue.suggestion}`);
                }
            });
        }
    }
    
    // Check if this is the issue we're looking for
    const hasIssue = readiness.readiness === 'ready_for_media' && brief?.productionBuildStatus === 'fail';
    
    console.log(`\n🚨 ISSUE CONFIRMED: ${hasIssue ? 'YES' : 'NO'}`);
    console.log(`   Readiness = ready_for_media: ${readiness.readiness === 'ready_for_media'}`);
    console.log(`   Production Build Status = fail: ${brief?.productionBuildStatus === 'fail'}`);
    
    if (hasIssue) {
        console.log('\n⚠️  This campaign has the exact issue: ready_for_media but productionBuildStatus = fail');
    }
}

testCampaign1().catch(console.error);
