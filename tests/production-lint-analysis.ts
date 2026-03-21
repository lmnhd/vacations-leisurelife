/**
 * Production Build Lint Analysis
 * Use the actual lint logic to understand why eastern-caribbean-stitch-sail is failing
 */

import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

async function analyzeProductionLint(): Promise<void> {
    console.log('🔍 Production Build Lint Analysis\n');
    console.log('Using actual lint logic to understand failure patterns\n');
    
    const campaignStore = await import('../lib/campaigns/campaign-store');
    const { lintProductionBuild } = await import('../lib/campaigns/media/production-build-lint');
    
    const brief = await campaignStore.getAestheticBrief('eastern-caribbean-stitch-sail-2026-09-19');
    
    if (!brief || !(brief.landingStillBible as any)?.stillLibrary) {
        console.log('❌ Brief or still library not found');
        return;
    }
    
    // Run the actual lint
    const lintReport = lintProductionBuild({
        landingStillBible: brief.landingStillBible as any,
        themeName: brief.themeName,
        nicheKeywords: (brief as any).nicheKeywords || []
    });
    
    console.log('📊 LINT REPORT RESULTS:');
    console.log(`  Verdict: ${lintReport.verdict}`);
    console.log(`  Blocking Issues: ${lintReport.blockingIssues?.length || 0}`);
    console.log(`  Warnings: ${lintReport.warnings?.length || 0}`);
    
    if (lintReport.blockingIssues) {
        console.log('\n🚨 BLOCKING ISSUES:');
        lintReport.blockingIssues.forEach((issue, i) => {
            console.log(`  ${i + 1}. [${issue.code}] ${issue.message}`);
        });
    }
    
    if (lintReport.warnings) {
        console.log('\n⚠️ WARNINGS:');
        lintReport.warnings.forEach((warning, i) => {
            console.log(`  ${i + 1}. [${warning.code}] ${warning.message}`);
        });
    }
    
    // Analyze pattern summary
    if (lintReport.patternSummary) {
        console.log('\n🔍 PATTERN ANALYSIS:');
        console.log(`  Generic fallback stills: ${lintReport.patternSummary.genericFallbackStillIds.length}`);
        console.log(`  No niche cue stills: ${lintReport.patternSummary.noCueStillIds.length}`);
        console.log(`  Subtle niche cue stills: ${lintReport.patternSummary.subtleCueStillIds.length}`);
        console.log(`  Explicit niche cue stills: ${lintReport.patternSummary.explicitCueStillIds.length}`);
        
        console.log('\n📋 STILL-BY-STILL BREAKDOWN:');
        const stillLibrary = (brief.landingStillBible as any).stillLibrary;
        
        stillLibrary.forEach((still: any, index: number) => {
            console.log(`\nStill ${index + 1} (${still.usage}):`);
            console.log(`  Location: ${still.location}`);
            console.log(`  Action: ${still.subjectAction}`);
            console.log(`  Composition: ${still.composition}`);
            
            // Check if it's a generic fallback
            const isGenericFallback = lintReport.patternSummary.genericFallbackStillIds.includes(still.stillId);
            const hasNicheCue = lintReport.patternSummary.explicitCueStillIds.includes(still.stillId);
            const hasSubtleCue = lintReport.patternSummary.subtleCueStillIds.includes(still.stillId);
            const hasNoCue = lintReport.patternSummary.noCueStillIds.includes(still.stillId);
            
            console.log(`  Generic fallback: ${isGenericFallback ? '❌ YES' : '✅ NO'}`);
            console.log(`  Niche cue strength: ${hasNicheCue ? 'EXPLICIT' : hasSubtleCue ? 'SUBTLE' : hasNoCue ? 'ABSENT' : 'UNKNOWN'}`);
            
            // Show the actual prompt
            console.log(`  Prompt: ${still.imagePrompt.substring(0, 100)}...`);
            
            if (isGenericFallback) {
                console.log(`  ⚠️  This still is flagged as generic fallback!`);
            }
        });
    }
    
    // Show threshold analysis
    console.log('\n📈 THRESHOLD ANALYSIS:');
    console.log(`  Generic fallback threshold: >2 stills = BLOCKER`);
    console.log(`  Niche cue threshold: >2 stills with absent/subtle cues = BLOCKER`);
    
    const genericCount = lintReport.patternSummary.genericFallbackStillIds.length;
    const weakCueCount = lintReport.patternSummary.noCueStillIds.length + lintReport.patternSummary.subtleCueStillIds.length;
    
    console.log(`  Current generic fallbacks: ${genericCount} ${genericCount > 2 ? '❌ OVER THRESHOLD' : '✅ OK'}`);
    console.log(`  Current weak niche cues: ${weakCueCount} ${weakCueCount > 2 ? '❌ OVER THRESHOLD' : '✅ OK'}`);
    
    console.log('\n✅ Production lint analysis completed');
}

analyzeProductionLint().catch(console.error);
