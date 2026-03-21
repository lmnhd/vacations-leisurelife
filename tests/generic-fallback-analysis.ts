/**
 * Generic Fallback Reduction Test
 * Test targeted improvements to reduce generic cruise-lifestyle fallbacks in art/creative campaigns
 */

import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

async function testGenericFallbackReduction(): Promise<void> {
    console.log('🎯 Generic Fallback Reduction Test\n');
    console.log('TARGET: Reduce generic cruise-lifestyle templates in art/creative campaigns\n');
    
    const campaignStore = await import('../lib/campaigns/campaign-store');
    const brief = await campaignStore.getAestheticBrief('eastern-caribbean-stitch-sail-2026-09-19');
    
    if (!brief || !(brief.landingStillBible as any)?.stillLibrary) {
        console.log('❌ Brief or still library not found');
        return;
    }
    
    const stillLibrary = (brief.landingStillBible as any).stillLibrary;
    const artKeywords = ['stitch', 'knit', 'crochet', 'fiber', 'yarn', 'sewing', 'craft', 'maker'];
    
    console.log('🔍 ANALYZING GENERIC FALLBACK PATTERNS:\n');
    
    // Analyze each still for generic vs specific content
    stillLibrary.forEach((still: any, index: number) => {
        const prompt = (still.imagePrompt + ' ' + still.subjectAction).toLowerCase();
        const hasNiche = artKeywords.some((keyword: string) => prompt.includes(keyword.toLowerCase()));
        
        // Generic cruise indicators
        const genericIndicators = [
            'cruise vacation', 'vacationers', 'holiday', 'relaxing by the pool',
            'enjoying the sun', 'cruise ship', 'onboard activities', 'sea breeze',
            'tropical paradise', 'beach chair', 'cocktail in hand', 'lounging'
        ];
        
        const genericCount = genericIndicators.filter((indicator: string) => 
            prompt.includes(indicator.toLowerCase())
        ).length;
        
        const isGeneric = genericCount >= 2; // 2+ generic indicators = likely generic fallback
        
        console.log(`Still ${index + 1} (${still.usage}):`);
        console.log(`  Niche cues: ${hasNiche ? '✅ YES' : '❌ NO'}`);
        console.log(`  Generic indicators: ${genericCount}`);
        console.log(`  Classification: ${isGeneric ? '🔄 GENERIC FALLBACK' : '🎨 SPECIFIC CONTENT'}`);
        
        if (isGeneric && hasNiche) {
            console.log(`  ⚠️  MIXED: Has niche but dominated by generic content`);
        } else if (hasNiche && !isGeneric) {
            console.log(`  ✅ IDEAL: Niche-focused content`);
        } else if (isGeneric && !hasNiche) {
            console.log(`  ❌ PROBLEM: Pure generic content`);
        }
        
        console.log(`  Preview: ${still.imagePrompt.substring(0, 80)}...`);
        console.log('');
    });
    
    // Count patterns
    const genericStills = stillLibrary.filter((still: any) => {
        const prompt = (still.imagePrompt + ' ' + still.subjectAction).toLowerCase();
        const genericIndicators = [
            'cruise vacation', 'vacationers', 'holiday', 'relaxing by the pool',
            'enjoying the sun', 'cruise ship', 'onboard activities', 'sea breeze',
            'tropical paradise', 'beach chair', 'cocktail in hand', 'lounging'
        ];
        const genericCount = genericIndicators.filter((indicator: string) => 
            prompt.includes(indicator.toLowerCase())
        ).length;
        return genericCount >= 2;
    });
    
    console.log('📊 SUMMARY:');
    console.log(`  Total stills: ${stillLibrary.length}`);
    console.log(`  Generic fallback stills: ${genericStills.length}/${stillLibrary.length}`);
    console.log(`  Generic fallback rate: ${Math.round(genericStills.length / stillLibrary.length * 100)}%`);
    
    // Production build threshold analysis
    const maxGenericAllowed = 2; // 4/6 generic = fail, so max 2 allowed
    const isOverThreshold = genericStills.length > maxGenericAllowed;
    
    console.log(`  Max generic allowed: ${maxGenericAllowed}`);
    console.log(`  Over threshold: ${isOverThreshold ? '❌ YES' : '✅ NO'}`);
    
    if (isOverThreshold) {
        console.log(`\n🎯 TARGET FOR IMPROVEMENT:`);
        console.log(`  Reduce generic fallbacks from ${genericStills.length} to ${maxGenericAllowed} or fewer`);
        console.log(`  Focus on converting generic cruise content to niche-specific activities`);
        
        console.log(`\n💡 IMPROVEMENT STRATEGY:`);
        console.log(`  1. Strengthen anti-generic instructions in system prompt`);
        console.log(`  2. Add niche-specific activity templates for art/creative campaigns`);
        console.log(`  3. Increase penalty for generic cruise lifestyle content`);
        console.log(`  4. Add validation for niche-to-generic ratio in stills`);
    } else {
        console.log(`\n✅ Generic fallback rate is acceptable`);
    }
    
    console.log('\n✅ Generic fallback analysis completed');
}

testGenericFallbackReduction().catch(console.error);
