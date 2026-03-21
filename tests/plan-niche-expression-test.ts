/**
 * Plan: Niche Expression Strength Targeted Test
 * 
 * OBJECTIVE: Test targeted improvements for niche-expression strength in art/creative campaigns
 * 
 * STEP 1: Analyze the failing campaign
 * - Examine deck-sketchbook-society-2026 still generation details
 * - Identify specific niche signal weaknesses
 * 
 * STEP 2: Find similar archetype campaigns  
 * - Search for art/creative themed campaigns
 * - Select 2-3 fresh campaigns with similar niche patterns
 * 
 * STEP 3: Baseline test
 * - Run the similar campaigns through current system
 * - Measure if the same failure pattern repeats
 * - Document niche expression issues
 * 
 * STEP 4: Targeted improvement test
 * - Implement niche-expression strength improvements
 * - Re-test the same campaigns
 * - Measure improvement delta
 * 
 * SUCCESS METRICS:
 * - Reduce weak_niche_signal blockers by 50%+
 * - Improve identity_legibility scores
 * - Increase ready_for_media rate for art/creative campaigns
 */

import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

async function planNicheExpressionTest(): Promise<void> {
    console.log('🎯 PLAN: Niche Expression Strength Targeted Test\n');
    
    const { scanAllCampaigns, getAestheticBrief } = await import('../lib/campaigns/campaign-store');
    
    // Step 1: Analyze the failing campaign
    console.log('--- Step 1: Analyze deck-sketchbook-society-2026 ---');
    
    const campaignStore = await import('../lib/campaigns/campaign-store');
    const brief = await campaignStore.getAestheticBrief('deck-sketchbook-society-2026');
    
    if (brief) {
        console.log('Campaign Details:');
        console.log(`  Theme: ${brief.themeName}`);
        console.log(`  Niche Keywords: ${(brief as any).nicheKeywords?.join(', ') || 'none'}`);
        console.log(`  Production Status: ${brief.productionBuildStatus}`);
        
        if (brief.productionBuildLint?.blockingIssues) {
            console.log('\nProduction Build Issues:');
            brief.productionBuildLint.blockingIssues.forEach((issue: any, i: number) => {
                console.log(`  ${i + 1}. [${issue.code}] ${issue.message}`);
            });
        }
        
        if ((brief.landingStillBible as any)?.stillLibrary) {
            const stillLibrary = (brief.landingStillBible as any).stillLibrary;
            console.log('\nStill Set Analysis:');
            console.log(`  Total stills: ${stillLibrary.length}`);
            
            // Count stills with niche cues
            const nicheKeywords = (brief as any).nicheKeywords || [];
            const stillsWithNiche = stillLibrary.filter((still: any) => {
                const prompt = (still.imagePrompt + ' ' + still.subjectAction).toLowerCase();
                return nicheKeywords.some((keyword: string) => 
                    prompt.includes(keyword.toLowerCase()) || 
                    prompt.includes('sketch') || 
                    prompt.includes('drawing') || 
                    prompt.includes('art')
                );
            });
            
            console.log(`  Stills with niche cues: ${stillsWithNiche.length}/${stillLibrary.length}`);
            
            if (stillsWithNiche.length < stillLibrary.length) {
                console.log('\nStills missing niche cues:');
                stillLibrary.forEach((still: any, index: number) => {
                    const prompt = (still.imagePrompt + ' ' + still.subjectAction).toLowerCase();
                    const hasNiche = nicheKeywords.some((keyword: string) => prompt.includes(keyword.toLowerCase())) || 
                                  prompt.includes('sketch') || prompt.includes('drawing') || prompt.includes('art');
                    if (!hasNiche) {
                        console.log(`  Still ${index + 1} (${still.usage}): ${still.imagePrompt.substring(0, 60)}...`);
                    }
                });
            }
        }
    }
    
    // Step 2: Find similar archetype campaigns
    console.log('\n--- Step 2: Find Art/Creative Archetype Campaigns ---');
    
    const campaigns = await scanAllCampaigns();
    const artCreativeKeywords = [
        'art', 'artist', 'sketch', 'drawing', 'paint', 'creative', 'maker', 
        'craft', 'design', 'illustration', 'watercolor', 'canvas', 'portfolio'
    ];
    
    const artCreativeCampaigns = campaigns.filter(c => {
        const nameAndTheme = (c.name + ' ' + (c as any).themeName).toLowerCase();
        return artCreativeKeywords.some(keyword => nameAndTheme.includes(keyword)) &&
               c.pricingStatus === 'CB_MATCHED' &&
               c.id !== 'deck-sketchbook-society-2026'; // Skip the one we already analyzed
    });
    
    console.log(`Found ${artCreativeCampaigns.length} art/creative campaigns:`);
    
    artCreativeCampaigns.slice(0, 5).forEach((c, i) => {
        console.log(`\n${i + 1}. ${c.id}`);
        console.log(`   Name: ${c.name}`);
        console.log(`   Ship: ${c.matchedShipName || 'N/A'}`);
        console.log(`   Price: $${c.startingPrice || 'N/A'}`);
        console.log(`   Has brief: ${c.aestheticBriefStatus ? 'YES' : 'NO'}`);
    });
    
    if (artCreativeCampaigns.length >= 2) {
        console.log(`\n📋 Selected for testing:`);
        const selected = artCreativeCampaigns.slice(0, 2);
        selected.forEach((c, i) => {
            console.log(`  Test ${i + 1}: ${c.id} - ${c.name}`);
        });
        
        console.log(`\n✅ Ready to proceed with niche expression strength test`);
        console.log(`\nNext steps:`);
        console.log(`  1. Baseline test the selected campaigns`);
        console.log(`  2. Analyze niche expression patterns`);
        console.log(`  3. Implement targeted improvements`);
        console.log(`  4. Re-test and measure improvement`);
        
    } else {
        console.log(`\n⚠️ Need at least 2 art/creative campaigns for testing`);
    }
}

planNicheExpressionTest().catch(console.error);
