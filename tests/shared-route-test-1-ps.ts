/**
 * Shared Route Test - Campaign 1 (PowerShell version)
 * bp-tabletop-icon-2027-7n-caribbean
 */

import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

// Helper function to make HTTP requests using PowerShell
async function makeRequest(url: string, method: string = 'GET', body?: any): Promise<{ status: number; data?: any }> {
    const psScript = body 
        ? `$body = '${JSON.stringify(body)}' | ConvertFrom-Json; $response = Invoke-WebRequest -Uri "${url}" -Method ${method} -ContentType "application/json" -Body ($body | ConvertTo-Json -Depth 10) -UseBasicParsing; Write-Output $response.StatusCode; Write-Output ($response.Content | ConvertFrom-Json)`
        : `$response = Invoke-WebRequest -Uri "${url}" -Method ${method} -UseBasicParsing; Write-Output $response.StatusCode; Write-Output ($response.Content | ConvertFrom-Json)`;
    
    try {
        const { execSync } = require('child_process');
        const output = execSync(`powershell -Command "${psScript.replace(/"/g, '\\"')}"`, { encoding: 'utf8' });
        const lines = output.trim().split('\n');
        const status = parseInt(lines[0]);
        const data = lines.length > 1 ? JSON.parse(lines.slice(1).join('\n')) : null;
        return { status, data };
    } catch (error: any) {
        // Try to extract status from error output
        const errorOutput = error.stdout || error.message;
        const statusMatch = errorOutput.match(/(\d{3})/);
        const status = statusMatch ? parseInt(statusMatch[1]) : 500;
        return { status, data: null };
    }
}

async function testSharedRoute1(): Promise<void> {
    console.log('🌐 Shared Route Test - Campaign 1/3\n');
    console.log('Campaign: bp-tabletop-icon-2027-7n-caribbean\n');
    
    const slug = 'bp-tabletop-icon-2027-7n-caribbean';
    const baseUrl = 'http://localhost:3000';
    
    // Step 1: DELETE existing aesthetic brief
    console.log('--- Step 1: DELETE /api/groups/campaign/{slug}/media/aesthetic ---');
    try {
        const deleteResult = await makeRequest(`${baseUrl}/api/groups/campaign/${slug}/media/aesthetic`, 'DELETE');
        console.log(`Delete Status: ${deleteResult.status}`);
        if (deleteResult.status === 200) {
            console.log('✅ Brief deleted successfully');
        } else {
            console.log(`⚠️ Delete response: ${deleteResult.status}`);
        }
    } catch (error) {
        console.log(`❌ Delete failed: ${error instanceof Error ? error.message : String(error)}`);
        return;
    }
    
    // Step 2: POST to generate new brief
    console.log('\n--- Step 2: POST /api/groups/campaign/{slug}/brief ---');
    let generationResult;
    try {
        const postResult = await makeRequest(`${baseUrl}/api/groups/campaign/${slug}/brief`, 'POST');
        
        if (postResult.status !== 200) {
            console.log(`❌ Generation failed: ${postResult.status}`);
            return;
        }
        
        generationResult = postResult.data;
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
        const readinessResultData = await makeRequest(`${baseUrl}/api/groups/campaign/${slug}/brief/readiness`, 'GET');
        
        if (readinessResultData.status !== 200) {
            console.log(`❌ Readiness failed: ${readinessResultData.status}`);
            return;
        }
        
        readinessResult = readinessResultData.data;
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
            const approveResult = await makeRequest(`${baseUrl}/api/groups/campaign/${slug}/brief/approve`, 'POST');
            
            if (approveResult.status !== 200) {
                console.log(`❌ Approval failed: ${approveResult.status}`);
            } else {
                console.log(`✅ Approval successful: ${approveResult.data?.readiness || 'unknown'}`);
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
