/**
 * Phase 2C Direct Library Verification Test
 * Test the Phase 2C targeted generic fallback fixes via direct library calls
 */

import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

async function testPhase2CDirectLibrary(): Promise<void> {
    console.log('🎯 PHASE 2C DIRECT LIBRARY VERIFICATION\n');
    console.log('Testing targeted generic fallback fixes via direct library calls\n');
    
    const campaigns = [
        'bp-tabletop-icon-2027-7n-caribbean',
        'eastern-caribbean-stitch-sail-2026-09-19', 
        'deck-sketchbook-society-2026'
    ];
    
    // Import the orchestrator directly
    const { createOrRefreshBrief, getReadiness } = await import('../lib/campaigns/brief-engine/orchestrator');
    const { getCampaignBlueprint, getAestheticBrief, deleteAestheticBrief } = await import('../lib/campaigns/campaign-store');
    
    for (const slug of campaigns) {
        console.log(`\n🔍 TESTING: ${slug}`);
        console.log('─'.repeat(50));
        
        try {
            // Step 1: Check if campaign exists
            const campaign = await getCampaignBlueprint(slug);
            if (!campaign) {
                console.log(`❌ Campaign not found: ${slug}`);
                continue;
            }
            console.log(`✅ Found campaign: ${campaign.name}`);
            
            // Step 2: Delete existing brief
            console.log('\n🗑️ Deleting existing brief...');
            try {
                await deleteAestheticBrief(slug);
                console.log('✅ Brief deleted');
            } catch (error) {
                console.log(`⚠️ Delete skipped: ${error instanceof Error ? error.message : String(error)}`);
            }
            
            // Step 3: Generate new brief
            console.log('\n🎨 Generating new brief...');
            const generateStart = Date.now();
            await createOrRefreshBrief(slug);
            const generateTime = Date.now() - generateStart;
            console.log(`✅ Generation completed in ${(generateTime/1000).toFixed(1)}s`);
            
            // Step 4: Check readiness — result shape: { readiness, brief, issues, summary, campaignName }
            console.log('\n📊 Checking readiness...');
            const readinessResult = await getReadiness(slug);
            
            const structuralBlockers = readinessResult.issues.filter(i => i.severity === 'blocker').length;
            const productionBlockers = readinessResult.brief?.productionBuildLint?.blockingIssues?.length || 0;
            const productionStatus = readinessResult.brief?.productionBuildStatus || 'unknown';
            const finalReadiness = readinessResult.readiness;
            
            console.log(`📈 RESULTS:`);
            console.log(`  Structural Blockers: ${structuralBlockers}`);
            console.log(`  Production Blockers: ${productionBlockers}`);
            console.log(`  Production Status: ${productionStatus}`);
            console.log(`  Final Readiness: ${finalReadiness}`);
            
            if (productionBlockers > 0) {
                console.log(`  Production Issues:`);
                readinessResult.brief?.productionBuildLint?.blockingIssues?.forEach((issue, i) => {
                    console.log(`    ${i + 1}. [${issue.code}] ${issue.message}`);
                });
            }
            
            if (readinessResult.brief?.productionBuildLint?.patternSummary) {
                const pattern = readinessResult.brief.productionBuildLint.patternSummary;
                console.log(`  Generic Fallback Stills: ${pattern.genericFallbackStillIds?.length || 0}/6`);
                console.log(`  No Niche Cue Stills: ${pattern.noCueStillIds?.length || 0}/6`);
                console.log(`  Explicit Niche Cues: ${pattern.explicitCueStillIds?.length || 0}/6`);
            }
            
            // Success criteria
            const isTargetSuccess = slug === 'deck-sketchbook-society-2026'
                ? productionBlockers === 0 && finalReadiness === 'ready_for_media'
                : productionBlockers === 0 && (finalReadiness === 'ready_for_media' || finalReadiness === 'needs_review');
            
            console.log(`  🎯 Target Met: ${isTargetSuccess ? '✅ YES' : '❌ NO'}`);
            
        } catch (error) {
            console.log(`❌ ERROR: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    
    console.log('\n📊 PHASE 2C VERIFICATION SUMMARY:');
    console.log('Expected: bp-tabletop-icon-2027-7n-caribbean → stays green');
    console.log('Expected: eastern-caribbean-stitch-sail-2026-09-19 → stays green');
    console.log('Target: deck-sketchbook-society-2026 → 0 blockers, ready_for_media');
    console.log('\n✅ Direct library verification completed');
}

testPhase2CDirectLibrary().catch(console.error);
