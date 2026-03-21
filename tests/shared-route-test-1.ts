/**
 * Shared Route Test - Campaign 1
 * bp-tabletop-icon-2027-7n-caribbean
 */

import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

async function testSharedRoute1(): Promise<void> {
    console.log('🌐 Shared Route Test - Campaign 1/3\n');
    console.log('Campaign: bp-tabletop-icon-2027-7n-caribbean\n');
    
    const slug = 'bp-tabletop-icon-2027-7n-caribbean';
    const baseUrl = 'http://localhost:3000';
    
    // Step 1: DELETE existing aesthetic brief
    console.log('--- Step 1: DELETE /api/groups/campaign/{slug}/media/aesthetic ---');
    try {
        const deleteResponse = await fetch(`${baseUrl}/api/groups/campaign/${slug}/media/aesthetic`, {
            method: 'DELETE'
        });
        console.log(`Delete Status: ${deleteResponse.status}`);
        if (!deleteResponse.ok) {
            const errorText = await deleteResponse.text();
            console.log(`Delete Response: ${errorText}`);
        } else {
            console.log('✅ Brief deleted successfully');
        }
    } catch (error) {
        console.log(`❌ Delete failed: ${error instanceof Error ? error.message : String(error)}`);
        return;
    }
    
    // Step 2: POST to generate new brief
    console.log('\n--- Step 2: POST /api/groups/campaign/{slug}/brief ---');
    let generationResult;
    try {
        const postResponse = await fetch(`${baseUrl}/api/groups/campaign/${slug}/brief`, {
            method: 'POST'
        });
        
        if (!postResponse.ok) {
            const errorText = await postResponse.text();
            console.log(`❌ Generation failed: ${postResponse.status} - ${errorText}`);
            return;
        }
        
        generationResult = await postResponse.json();
        console.log('✅ Brief generated successfully');
        console.log(`Generation time: ${generationResult.generationTime || 'N/A'}s`);
        console.log(`Auto-fix applied: ${generationResult.autoFixApplied || false}`);
        console.log(`Fixed codes: ${generationResult.fixedCodes?.join(', ') || 'none'}`);
        
    } catch (error) {
        console.log(`❌ Generation failed: ${error instanceof Error ? error.message : String(error)}`);
        return;
    }
    
    // Step 3: GET readiness
    console.log('\n--- Step 3: GET /api/groups/campaign/{slug}/brief/readiness ---');
    let readinessResult;
    try {
        const readinessResponse = await fetch(`${baseUrl}/api/groups/campaign/${slug}/brief/readiness`);
        
        if (!readinessResponse.ok) {
            const errorText = await readinessResponse.text();
            console.log(`❌ Readiness failed: ${readinessResponse.status} - ${errorText}`);
            return;
        }
        
        readinessResult = await readinessResponse.json();
        console.log(`✅ Readiness retrieved`);
        
    } catch (error) {
        console.log(`❌ Readiness failed: ${error instanceof Error ? error.message : String(error)}`);
        return;
    }
    
    // Extract and display results
    const structuralBlockers = readinessResult.issues?.filter((i: any) => i.severity === 'blocker').length || 0;
    const productionBlockers = readinessResult.brief?.productionBuildLint?.blockingIssues?.length || 0;
    const productionStatus = readinessResult.brief?.productionBuildStatus || 'N/A';
    const finalReadiness = readinessResult.readiness || 'N/A';
    
    console.log(`\n📊 CAMPAIGN 1 RESULTS:`);
    console.log(`  Structural Blockers: ${structuralBlockers}`);
    console.log(`  Production-Build Blockers: ${productionBlockers}`);
    console.log(`  Production Status: ${productionStatus}`);
    console.log(`  Final Readiness: ${finalReadiness}`);
    
    // Show blocking issue codes
    const structuralCodes = readinessResult.issues?.filter((i: any) => i.severity === 'blocker').map((i: any) => i.code) || [];
    const productionCodes = readinessResult.brief?.productionBuildLint?.blockingIssues?.map((i: any) => i.code) || [];
    const allCodes = [...structuralCodes, ...productionCodes];
    
    if (allCodes.length > 0) {
        console.log(`  Blocking Issue Codes: ${allCodes.join(', ')}`);
    } else {
        console.log(`  Blocking Issue Codes: none`);
    }
    
    // Step 4: POST approve if ready
    console.log(`\n--- Step 4: POST /api/groups/campaign/{slug}/brief/approve ---`);
    if (structuralBlockers === 0 && productionStatus !== 'fail') {
        try {
            const approveResponse = await fetch(`${baseUrl}/api/groups/campaign/${slug}/brief/approve`, {
                method: 'POST'
            });
            
            if (!approveResponse.ok) {
                const errorText = await approveResponse.text();
                console.log(`❌ Approval failed: ${approveResponse.status} - ${errorText}`);
            } else {
                const approveResult = await approveResponse.json();
                console.log(`✅ Approval successful: ${approveResult.readiness}`);
            }
        } catch (error) {
            console.log(`❌ Approval failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    } else {
        console.log(`⏸️ Approval skipped (${structuralBlockers} structural blockers + production status: ${productionStatus})`);
    }
    
    console.log('\n✅ Campaign 1 test completed');
}

testSharedRoute1().catch(console.error);
