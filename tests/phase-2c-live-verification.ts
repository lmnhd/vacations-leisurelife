/**
 * Phase 2C Live Verification Test
 * Test the Phase 2C targeted generic fallback fixes via live API calls
 */

import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

async function testPhase2CLiveVerification(): Promise<void> {
    console.log('🎯 PHASE 2C LIVE VERIFICATION\n');
    console.log('Testing targeted generic fallback fixes via shared API routes\n');
    
    const campaigns = [
        'bp-tabletop-icon-2027-7n-caribbean',
        'eastern-caribbean-stitch-sail-2026-09-19', 
        'deck-sketchbook-society-2026'
    ];
    
    const baseUrl = 'http://localhost:3000';
    
    for (const slug of campaigns) {
        console.log(`\n🔍 TESTING: ${slug}`);
        console.log('─'.repeat(50));
        
        try {
            // Step 1: Delete existing brief
            console.log('🗑️ Deleting existing brief...');
            const deleteResponse = await fetch(`${baseUrl}/api/groups/campaign/${slug}/brief`, {
                method: 'DELETE'
            });
            
            if (!deleteResponse.ok) {
                console.log(`⚠️ Delete failed: ${deleteResponse.status}`);
            } else {
                console.log('✅ Brief deleted');
            }
            
            // Step 2: Generate new brief
            console.log('\n🎨 Generating new brief...');
            const generateStart = Date.now();
            const generateResponse = await fetch(`${baseUrl}/api/groups/campaign/${slug}/brief`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            
            const generateTime = Date.now() - generateStart;
            
            if (!generateResponse.ok) {
                console.log(`❌ Generation failed: ${generateResponse.status}`);
                const errorText = await generateResponse.text();
                console.log(`Error: ${errorText.substring(0, 200)}...`);
                continue;
            }
            
            const generateResult = await generateResponse.json();
            console.log(`✅ Generation completed in ${(generateTime/1000).toFixed(1)}s`);
            
            // Step 3: Check readiness
            console.log('\n📊 Checking readiness...');
            const readinessResponse = await fetch(`${baseUrl}/api/groups/campaign/${slug}/brief/readiness`);
            
            if (!readinessResponse.ok) {
                console.log(`❌ Readiness check failed: ${readinessResponse.status}`);
                continue;
            }
            
            const readiness = await readinessResponse.json();
            
            // Extract key metrics
            const structuralBlockers = readiness.readinessRes?.structuralIssues?.filter((i: any) => i.severity === 'blocking')?.length || 0;
            const productionBlockers = readiness.readinessRes?.productionBuildLint?.blockingIssues?.length || 0;
            const productionStatus = readiness.readinessRes?.productionBuildLint?.verdict || 'unknown';
            const finalReadiness = readiness.readinessRes?.readiness || 'unknown';
            
            console.log(`📈 RESULTS:`);
            console.log(`  Structural Blockers: ${structuralBlockers}`);
            console.log(`  Production Blockers: ${productionBlockers}`);
            console.log(`  Production Status: ${productionStatus}`);
            console.log(`  Final Readiness: ${finalReadiness}`);
            
            // Show specific production blockers if any
            if (productionBlockers > 0) {
                console.log(`  Production Issues:`);
                readiness.readinessRes?.productionBuildLint?.blockingIssues?.forEach((issue: any, i: number) => {
                    console.log(`    ${i + 1}. [${issue.code}] ${issue.message}`);
                });
            }
            
            // Show generic fallback details if available
            if (readiness.readinessRes?.productionBuildLint?.patternSummary) {
                const pattern = readiness.readinessRes.productionBuildLint.patternSummary;
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
    console.log('\n✅ Live verification completed');
}

testPhase2CLiveVerification().catch(console.error);
