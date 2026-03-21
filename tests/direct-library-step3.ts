/**
 * Direct Library Test - Step 3 Verification
 * Tests the same 3 campaigns using direct library calls
 */

import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

async function testDirectLibrary(): Promise<void> {
    console.log('🔧 Direct Library Test - Step 3 Verification\n');
    
    const campaigns = [
        'bp-tabletop-icon-2027-7n-caribbean',
        'deck-sketchbook-society-2026',
        'eastern-caribbean-stitch-sail-2026-09-19'
    ];
    
    const { deleteAestheticBrief } = await import('../lib/campaigns/campaign-store');
    const { createOrRefreshBrief, getReadiness, approveForMedia } = await import('../lib/campaigns/brief-engine/orchestrator');
    
    const results = [];
    
    for (let i = 0; i < campaigns.length; i++) {
        const slug = campaigns[i];
        console.log(`\n🎯 Campaign ${i + 1}/3: ${slug}`);
        console.log('='.repeat(50));
        
        // Step 1: DELETE existing brief
        console.log('\n--- Step 1: Delete existing brief ---');
        try {
            await deleteAestheticBrief(slug);
            console.log('✅ Brief deleted successfully');
        } catch (error) {
            console.log('⚠️ No existing brief to delete');
        }
        
        // Step 2: POST to generate new brief
        console.log('\n--- Step 2: Generate new brief ---');
        let generationResult;
        try {
            const start = Date.now();
            generationResult = await createOrRefreshBrief(slug);
            const duration = ((Date.now() - start) / 1000).toFixed(1);
            console.log(`✅ Generation completed in ${duration}s`);
            console.log(`Auto-fix applied: ${generationResult.autoFixApplied}`);
            console.log(`Fixed codes: ${generationResult.fixedCodes?.join(', ') || 'none'}`);
        } catch (error) {
            console.log(`❌ Generation failed: ${error instanceof Error ? error.message : String(error)}`);
            results.push({ slug, error: 'Generation failed' });
            continue;
        }
        
        // Step 3: GET readiness
        console.log('\n--- Step 3: Check readiness ---');
        let readinessResult;
        try {
            readinessResult = await getReadiness(slug);
            console.log(`✅ Readiness retrieved: ${readinessResult.readiness}`);
        } catch (error) {
            console.log(`❌ Readiness failed: ${error instanceof Error ? error.message : String(error)}`);
            results.push({ slug, error: 'Readiness failed' });
            continue;
        }
        
        // Extract metrics
        const structuralBlockers = readinessResult.issues?.filter((i: any) => i.severity === 'blocker').length || 0;
        const productionBlockers = readinessResult.brief?.productionBuildLint?.blockingIssues?.length || 0;
        const productionStatus = readinessResult.brief?.productionBuildStatus || 'N/A';
        const finalReadiness = readinessResult.readiness || 'N/A';
        
        // Get blocking issue codes
        const structuralCodes = readinessResult.issues?.filter((i: any) => i.severity === 'blocker').map((i: any) => i.code) || [];
        const productionCodes = readinessResult.brief?.productionBuildLint?.blockingIssues?.map((i: any) => i.code) || [];
        const allCodes = [...structuralCodes, ...productionCodes];
        
        console.log(`\n📊 RESULTS:`);
        console.log(`  Structural Blockers: ${structuralBlockers}`);
        console.log(`  Production-Build Blockers: ${productionBlockers}`);
        console.log(`  Production Status: ${productionStatus}`);
        console.log(`  Final Readiness: ${finalReadiness}`);
        console.log(`  Blocking Issue Codes: ${allCodes.length > 0 ? allCodes.join(', ') : 'none'}`);
        
        // Step 4: POST approve if ready
        console.log(`\n--- Step 4: Attempt approval ---`);
        let approvalResult = 'skipped';
        if (structuralBlockers === 0 && productionStatus !== 'fail') {
            try {
                const approval = await approveForMedia(slug);
                approvalResult = `approved: ${approval.readiness}`;
                console.log(`✅ Approval successful: ${approval.readiness}`);
            } catch (error) {
                approvalResult = `failed: ${error instanceof Error ? error.message : String(error)}`;
                console.log(`❌ Approval failed: ${error instanceof Error ? error.message : String(error)}`);
            }
        } else {
            console.log(`⏸️ Approval skipped (${structuralBlockers} structural blockers + production status: ${productionStatus})`);
        }
        
        // Store results
        results.push({
            slug,
            structuralBlockers,
            productionBlockers,
            productionStatus,
            finalReadiness,
            blockingIssueCodes: allCodes,
            approvalResult
        });
        
        console.log(`\n✅ Campaign ${i + 1} completed`);
    }
    
    // Summary table
    console.log('\n\n📈 SUMMARY TABLE');
    console.log('='.repeat(80));
    console.log('| Campaign | Structural | Production | Status | Readiness | Blocking Codes | Approval |');
    console.log('|---------|------------|------------|--------|-----------|----------------|----------|');
    
    results.forEach((result: any) => {
        if (result.error) {
            console.log(`| ${result.slug} | ERROR | ERROR | ERROR | ERROR | ERROR | ${result.error} |`);
        } else {
            const campaign = result.slug.replace(/^(bp-|.*-)(.+)$/, '$2').substring(0, 20);
            console.log(`| ${campaign} | ${result.structuralBlockers} | ${result.productionBlockers} | ${result.productionStatus} | ${result.finalReadiness} | ${result.blockingIssueCodes.length > 0 ? result.blockingIssueCodes.join(', ') : 'none'} | ${result.approvalResult} |`);
        }
    });
    
    // Overall metrics
    const validResults = results.filter(r => !r.error);
    const totalStructural = validResults.reduce((sum: number, r: any) => sum + (r.structuralBlockers || 0), 0);
    const totalProduction = validResults.reduce((sum: number, r: any) => sum + (r.productionBlockers || 0), 0);
    const readyCount = validResults.filter((r: any) => r.finalReadiness === 'ready_for_media').length;
    
    console.log('\n📊 OVERALL METRICS');
    console.log(`Total campaigns tested: ${validResults.length}`);
    console.log(`Total structural blockers: ${totalStructural}`);
    console.log(`Total production-build blockers: ${totalProduction}`);
    console.log(`Campaigns ready for media: ${readyCount}/${validResults.length} (${Math.round(readyCount/validResults.length*100)}%)`);
    
    console.log('\n✅ All tests completed');
}

testDirectLibrary().catch(console.error);
