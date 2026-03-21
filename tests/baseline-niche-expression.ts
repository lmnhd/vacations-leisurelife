/**
 * Niche Expression Strength - Baseline Test
 * Test the remaining art/creative campaign to establish baseline
 */

import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

async function baselineNicheExpressionTest(): Promise<void> {
    console.log('🎯 Niche Expression Strength - Baseline Test\n');
    
    const { deleteAestheticBrief } = await import('../lib/campaigns/campaign-store');
    const { createOrRefreshBrief, getReadiness, approveForMedia } = await import('../lib/campaigns/brief-engine/orchestrator');
    const campaignStore = await import('../lib/campaigns/campaign-store');
    
    const slug = 'eastern-caribbean-stitch-sail-2026-09-19';
    
    console.log(`Testing: ${slug}`);
    console.log('Name: Stitch & Sail: Eastern Caribbean Maker Cruise\n');
    
    // Clean start - delete existing brief
    console.log('--- Clean Start ---');
    try {
        await deleteAestheticBrief(slug);
        console.log('✅ Existing brief cleared');
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
    console.log(`Structural Blockers: ${blockers}`);
    console.log(`Warnings: ${warnings}`);
    console.log(`Auto-fix Applied: ${result.autoFixApplied}`);
    console.log(`Fixed Codes: ${result.fixedCodes.join(', ') || 'none'}`);
    
    // Get detailed analysis
    const brief = await campaignStore.getAestheticBrief(slug);
    const readiness = await getReadiness(slug);
    
    console.log(`\n🏗️ Production Build Status:`);
    console.log(`  Status: ${brief?.productionBuildStatus || 'N/A'}`);
    console.log(`  Readiness: ${readiness.readiness}`);
    
    if (brief?.productionBuildLint) {
        console.log(`  Verdict: ${brief.productionBuildLint.verdict}`);
        console.log(`  Blocking Issues: ${brief.productionBuildLint.blockingIssues?.length || 0}`);
        console.log(`  Warnings: ${brief.productionBuildLint.warnings?.length || 0}`);
        
        if (brief.productionBuildLint.blockingIssues && brief.productionBuildLint.blockingIssues.length > 0) {
            console.log(`\n🚨 Production Build Blockers:`);
            brief.productionBuildLint.blockingIssues.forEach((issue: any, i: number) => {
                console.log(`  ${i + 1}. [${issue.code}] ${issue.message}`);
            });
        }
    }
    
    // Analyze niche expression in stills
    console.log(`\n🎨 Niche Expression Analysis:`);
    if (brief && (brief.landingStillBible as any)?.stillLibrary) {
        const stillLibrary = (brief.landingStillBible as any).stillLibrary;
        const nicheKeywords = (brief as any).nicheKeywords || [];
        
        // Add art/creative related keywords to check
        const artKeywords = [...nicheKeywords, 'stitch', 'knit', 'crochet', 'fiber', 'yarn', 'sewing', 'craft', 'maker'];
        
        console.log(`  Total stills: ${stillLibrary.length}`);
        
        const stillsWithNiche = stillLibrary.filter((still: any) => {
            const prompt = (still.imagePrompt + ' ' + still.subjectAction).toLowerCase();
            return artKeywords.some((keyword: string) => prompt.includes(keyword.toLowerCase()));
        });
        
        console.log(`  Stills with niche cues: ${stillsWithNiche.length}/${stillLibrary.length}`);
        
        if (stillsWithNiche.length < stillLibrary.length) {
            console.log(`\n🔍 Stills missing niche cues:`);
            stillLibrary.forEach((still: any, index: number) => {
                const prompt = (still.imagePrompt + ' ' + still.subjectAction).toLowerCase();
                const hasNiche = artKeywords.some((keyword: string) => prompt.includes(keyword.toLowerCase()));
                if (!hasNiche) {
                    console.log(`    Still ${index + 1} (${still.usage}): ${still.imagePrompt.substring(0, 80)}...`);
                }
            });
        } else {
            console.log(`  ✅ All stills contain niche cues!`);
        }
    }
    
    // Test approval
    console.log(`\n🔒 Approval Test:`);
    if (blockers === 0 && brief?.productionBuildStatus !== 'fail') {
        try {
            const approval = await approveForMedia(slug);
            console.log(`✅ APPROVAL SUCCESSFUL: ${approval.readiness}`);
            console.log(`🎉 Campaign ready for media generation!`);
        } catch (error) {
            console.log(`❌ Approval failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    } else {
        console.log(`⏸️ Approval skipped (${blockers} structural blockers + production status: ${brief?.productionBuildStatus})`);
    }
    
    // Summary
    console.log(`\n📊 BASELINE RESULTS:`);
    console.log(`  Structural Blockers: ${blockers}`);
    console.log(`  Production Blockers: ${brief?.productionBuildLint?.blockingIssues?.length || 0}`);
    console.log(`  Production Status: ${brief?.productionBuildStatus || 'N/A'}`);
    console.log(`  Ready for Media: ${blockers === 0 && brief?.productionBuildStatus !== 'fail' ? 'YES' : 'NO'}`);
    
    // Compare with deck-sketchbook-society
    console.log(`\n📈 ARCHETYPE COMPARISON:`);
    console.log(`  deck-sketchbook-society: 0 structural, 2 production blockers, NO niche cues (0/6)`);
    console.log(`  ${slug}: ${blockers} structural, ${brief?.productionBuildLint?.blockingIssues?.length || 0} production blockers, ${stillsWithNiche?.length || 0}/6 niche cues`);
    
    console.log('\n✅ Baseline test completed');
}

baselineNicheExpressionTest().catch(console.error);
