/**
 * Blocker Frequency Test - Campaign 3
 * eastern-caribbean-stitch-sail-2026-09-19
 */

import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

async function testBlockerFrequency3(): Promise<void> {
    console.log('🎯 Blocker Frequency Test - Campaign 3/3\n');
    console.log('Campaign: eastern-caribbean-stitch-sail-2026-09-19');
    console.log('Name: Stitch & Sail: Eastern Caribbean Maker Cruise\n');
    
    const { getCampaignBlueprint, deleteAestheticBrief } = await import('../lib/campaigns/campaign-store');
    const { createOrRefreshBrief, getReadiness, approveForMedia } = await import('../lib/campaigns/brief-engine/orchestrator');
    const { getAestheticBrief } = await import('../lib/campaigns/campaign-store');
    
    const slug = 'eastern-caribbean-stitch-sail-2026-09-19';
    
    // Get campaign info
    const campaign = await getCampaignBlueprint(slug);
    if (!campaign) {
        console.log('❌ Campaign not found');
        return;
    }
    
    console.log('Campaign Info:');
    console.log(`  Ship: ${campaign.matchedShipName || 'N/A'}`);
    console.log(`  Price: $${campaign.startingPrice || 'N/A'}`);
    console.log(`  Target Dates: ${campaign.targetDates}`);
    
    // Clean start - delete any existing brief
    console.log('\n--- Clean Start ---');
    try {
        await deleteAestheticBrief(slug);
        console.log('✅ Any existing brief cleared');
    } catch {
        console.log('✅ No existing brief to clear');
    }
    
    // Generate fresh brief
    console.log('\n--- Generating Fresh Brief ---');
    
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
    const warnings = result.issues.filter(i => i.severity === 'warning').length;
    
    console.log(`\n✅ Generation completed in ${duration}s`);
    console.log(`📊 Blocker Frequency Results:`);
    console.log(`  Structural Blockers: ${blockers}`);
    console.log(`  Warnings: ${warnings}`);
    console.log(`  Auto-fix Applied: ${result.autoFixApplied}`);
    console.log(`  Fixed Codes: ${result.fixedCodes.join(', ') || 'none'}`);
    console.log(`  Corrective Reprompt Used: ${result.correctiveRepromptUsed}`);
    
    // Show structural blockers if any
    if (blockers > 0) {
        console.log(`\n🚨 Structural Blockers:`);
        result.issues.filter(i => i.severity === 'blocker').forEach((b, i) => {
            console.log(`  ${i + 1}. [${b.code}] ${b.message}`);
            console.log(`     Auto-fixable: ${b.autoFixable}`);
        });
    }
    
    // Check production build status
    const brief = await getAestheticBrief(slug);
    const readiness = await getReadiness(slug);
    
    console.log(`\n🏗️ Production Build Status:`);
    console.log(`  Status: ${brief?.productionBuildStatus || 'N/A'}`);
    console.log(`  Readiness: ${readiness.readiness}`);
    
    if (brief?.productionBuildLint) {
        console.log(`  Verdict: ${brief.productionBuildLint.verdict}`);
        console.log(`  Blocking Issues: ${brief.productionBuildLint.blockingIssues?.length || 0}`);
        console.log(`  Warnings: ${brief.productionBuildLint.warnings?.length || 0}`);
        
        // Show production build blockers if any
        if (brief.productionBuildLint.blockingIssues && brief.productionBuildLint.blockingIssues.length > 0) {
            console.log(`\n🚨 Production Build Blockers:`);
            brief.productionBuildLint.blockingIssues.slice(0, 3).forEach((issue: any, i: number) => {
                console.log(`  ${i + 1}. [${issue.code}] ${issue.message.substring(0, 80)}...`);
            });
        }
    }
    
    // Test approval if possible
    console.log(`\n🔒 Approval Test:`);
    if (blockers === 0 && brief?.productionBuildStatus !== 'fail') {
        try {
            const approval = await approveForMedia(slug);
            console.log(`  ✅ APPROVAL SUCCESSFUL: ${approval.readiness}`);
            console.log(`  🎉 Campaign ready for media generation!`);
        } catch (error) {
            console.log(`  ❌ Approval failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    } else {
        console.log(`  ⏸️ Approval skipped (${blockers} structural blockers + production status: ${brief?.productionBuildStatus})`);
    }
    
    // Summary
    console.log(`\n📈 CAMPAIGN 3 SUMMARY:`);
    console.log(`  Total Blockers: ${blockers + (brief?.productionBuildLint?.blockingIssues?.length || 0)}`);
    console.log(`  Structural: ${blockers}, Production: ${brief?.productionBuildLint?.blockingIssues?.length || 0}`);
    console.log(`  Ready for Media: ${blockers === 0 && brief?.productionBuildStatus !== 'fail' ? 'YES' : 'NO'}`);
    
    console.log('\n✅ Campaign 3 test completed');
}

testBlockerFrequency3().catch(console.error);
