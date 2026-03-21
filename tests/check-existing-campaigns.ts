/**
 * Phase 2C Existing Campaign Check
 * Check if Phase 2C improvements are already applied to existing campaigns
 */

import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

async function checkExistingCampaigns(): Promise<void> {
    console.log('🎯 PHASE 2C EXISTING CAMPAIGN CHECK\n');
    console.log('Checking if Phase 2C improvements are already present\n');
    
    const campaigns = [
        'bp-tabletop-icon-2027',
        'eastern-caribbean-stitch-sail-2026-09-19', 
        'deck-sketchbook-society-2026'
    ];
    
    // Import campaign store properly
    const campaignStoreModule = await import('../lib/campaigns/campaign-store');
    const campaignStore = campaignStoreModule.default || campaignStoreModule;
    
    for (const slug of campaigns) {
        console.log(`\n🔍 CHECKING: ${slug}`);
        console.log('─'.repeat(50));
        
        try {
            // Get campaign
            const campaign = await campaignStore.getCampaign(slug);
            if (!campaign) {
                console.log(`❌ Campaign not found: ${slug}`);
                continue;
            }
            console.log(`✅ Found campaign: ${campaign.name}`);
            
            // Get brief
            const brief = await campaignStore.getAestheticBrief(slug);
            if (!brief) {
                console.log(`❌ No brief found for: ${slug}`);
                continue;
            }
            console.log(`✅ Found brief`);
            
            // Check production build status
            const productionStatus = brief.productionBuildStatus || 'unknown';
            const productionVerdict = brief.productionBuildLint?.verdict || 'unknown';
            const productionBlockers = brief.productionBuildLint?.blockingIssues?.length || 0;
            
            console.log(`📈 CURRENT STATUS:`);
            console.log(`  Production Status: ${productionStatus}`);
            console.log(`  Production Verdict: ${productionVerdict}`);
            console.log(`  Production Blockers: ${productionBlockers}`);
            
            // Show blockers if any
            if (productionBlockers > 0) {
                console.log(`  Production Issues:`);
                brief.productionBuildLint?.blockingIssues?.forEach((issue: any, i: number) => {
                    console.log(`    ${i + 1}. [${issue.code}] ${issue.message}`);
                });
            }
            
            // Check pattern summary if available
            if (brief.productionBuildLint?.patternSummary) {
                const pattern = brief.productionBuildLint.patternSummary;
                console.log(`  Pattern Analysis:`);
                console.log(`    Generic Fallback Stills: ${pattern.genericFallbackStillIds?.length || 0}/6`);
                console.log(`    No Niche Cue Stills: ${pattern.noCueStillIds?.length || 0}/6`);
                console.log(`    Explicit Niche Cues: ${pattern.explicitCueStillIds?.length || 0}/6`);
            }
            
            // Check if this looks like Phase 2C improved
            const hasGenericFallbacks = (brief.productionBuildLint?.patternSummary?.genericFallbackStillIds?.length || 0) > 2;
            const hasNoNicheCues = (brief.productionBuildLint?.patternSummary?.noCueStillIds?.length || 0) > 2;
            const isPhase2CImproved = !hasGenericFallbacks && !hasNoNicheCues && productionBlockers === 0;
            
            console.log(`  🎯 Phase 2C Improved: ${isPhase2CImproved ? '✅ YES' : '❌ NO'}`);
            
        } catch (error) {
            console.log(`❌ ERROR: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    
    console.log('\n📊 SUMMARY:');
    console.log('This check shows if existing campaigns already have Phase 2C improvements');
    console.log('If campaigns show 0 generic fallbacks and 0 no-niche-cue stills, Phase 2C is working');
    console.log('\n✅ Existing campaign check completed');
}

checkExistingCampaigns().catch(console.error);
