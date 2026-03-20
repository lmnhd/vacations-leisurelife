/**
 * Regenerate drift-festival-icon-2026 with fix
 * Test if production build lint passes now
 */

import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

async function regenerateDriftFestival(): Promise<void> {
    console.log('🔄 Regenerating: drift-festival-icon-2026 (with fix)\n');
    
    const { deleteAestheticBrief } = await import('../lib/campaigns/campaign-store');
    const { createOrRefreshBrief, approveForMedia, getReadiness } = await import('../lib/campaigns/brief-engine/orchestrator');
    const { getAestheticBrief } = await import('../lib/campaigns/campaign-store');
    
    const slug = 'drift-festival-icon-2026';
    
    // Delete existing brief
    console.log('--- Deleting Existing Brief ---');
    try {
        await deleteAestheticBrief(slug);
        console.log('✅ Brief deleted');
    } catch (error) {
        console.log('⚠️ Brief deletion:', error instanceof Error ? error.message : String(error));
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
    
    console.log(`\n✅ Generation completed in ${duration}s`);
    console.log(`Blockers: ${blockers}, Warnings: ${result.issues.filter(i => i.severity === 'warning').length}`);
    console.log(`Auto-fix: ${result.autoFixApplied}, Reprompt: ${result.correctiveRepromptUsed}`);
    
    // Check production build status
    const brief = await getAestheticBrief(slug);
    const readiness = await getReadiness(slug);
    
    console.log('\n--- Results ---');
    console.log(`Readiness: ${readiness.readiness}`);
    console.log(`Production Build Status: ${brief?.productionBuildStatus || 'N/A'}`);
    
    if (brief?.productionBuildLint) {
        console.log(`Production Build Verdict: ${brief.productionBuildLint.verdict}`);
        console.log(`Blocking Issues: ${brief.productionBuildLint.blockingIssues?.length || 0}`);
        
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
            console.log(`🎉 APPROVAL SUCCESSFUL: ${approval.readiness}`);
            console.log('✅ Production build lint passed - campaign ready for media!');
        } catch (error) {
            console.log(`❌ Approval still blocked: ${error instanceof Error ? error.message : String(error)}`);
            console.log('⚠️ Production build issues still need resolution');
        }
    } else {
        console.log(`\nSkipping approval (${blockers} structural blockers remain)`);
    }
    
    console.log('\n✅ Regeneration test completed');
}

regenerateDriftFestival().catch(console.error);
