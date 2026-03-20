/**
 * Smoke Batch: Test 3 Campaigns
 */

import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

async function testSmokeBatch(): Promise<void> {
    console.log('🚀 SMOKE BATCH: Testing 3 Campaigns\n');
    
    // Imports
    const { createOrRefreshBrief, getReadiness, approveForMedia } = await import('../lib/campaigns/brief-engine/orchestrator');
    const { getCampaignBlueprint, getAestheticBrief, deleteAestheticBrief } = await import('../lib/campaigns/campaign-store');
    
    const campaigns = [
        'bp-cottagecore-infinity-2026-10n-grtr',  // Already tested - should have brief now
        'bp-tabletop-icon-2027-7n-caribbean',      // No brief, CB matched
        'greek-isles-book-lovers-2026-09-26'       // No brief, CB matched
    ];
    
    const results: Array<{
        slug: string;
        name: string;
        duration: string;
        blockers: number;
        warnings: number;
        autoFix: boolean;
        reprompt: boolean;
        approval: string;
        status: 'PASS' | 'SOFT_PASS' | 'FAIL';
    }> = [];
    
    for (const slug of campaigns) {
        console.log(`\n--- ${slug} ---`);
        
        const campaign = await getCampaignBlueprint(slug);
        if (!campaign) {
            console.log('❌ Campaign not found');
            results.push({ slug, name: 'NOT FOUND', duration: '0', blockers: 0, warnings: 0, autoFix: false, reprompt: false, approval: 'N/A', status: 'FAIL' });
            continue;
        }
        
        console.log(`Campaign: ${campaign.name}`);
        
        // Clear existing brief for clean test
        try {
            await deleteAestheticBrief(slug);
            console.log('Cleared existing brief');
        } catch {
            // No brief to clear
        }
        
        // Generate
        const start = Date.now();
        let result;
        try {
            result = await createOrRefreshBrief(slug);
        } catch (error) {
            console.log(`❌ Generation failed: ${error instanceof Error ? error.message : String(error)}`);
            results.push({ slug, name: campaign.name, duration: '0', blockers: 0, warnings: 0, autoFix: false, reprompt: false, approval: 'FAILED', status: 'FAIL' });
            continue;
        }
        
        const duration = ((Date.now() - start) / 1000).toFixed(1);
        const blockers = result.issues.filter(i => i.severity === 'blocker').length;
        const warnings = result.issues.filter(i => i.severity === 'warning').length;
        
        console.log(`Duration: ${duration}s`);
        console.log(`Blockers: ${blockers}, Warnings: ${warnings}`);
        console.log(`Auto-fix: ${result.autoFixApplied}, Reprompt: ${result.correctiveRepromptUsed}`);
        
        // Approval
        let approvalResult = 'SKIPPED';
        if (blockers === 0) {
            try {
                const approval = await approveForMedia(slug);
                approvalResult = approval.readiness;
                console.log(`✅ Approval: ${approvalResult}`);
            } catch (error) {
                approvalResult = `ERROR: ${error instanceof Error ? error.message : String(error)}`;
                console.log(`❌ Approval failed: ${approvalResult}`);
            }
        } else {
            console.log(`Skipped approval (${blockers} blockers)`);
        }
        
        // Verify brief persisted
        const brief = await getAestheticBrief(slug);
        const hasAllComponents = brief?.productionBible && brief?.landingStillBible && brief?.productionBuildLint;
        
        if (!brief || !hasAllComponents) {
            console.log('❌ Brief components missing');
            results.push({ slug, name: campaign.name, duration, blockers, warnings, autoFix: result.autoFixApplied, reprompt: result.correctiveRepromptUsed, approval: approvalResult, status: 'FAIL' });
            continue;
        }
        
        // Status
        const status: 'PASS' | 'SOFT_PASS' | 'FAIL' = blockers === 0 && approvalResult === 'ready_for_media' ? 'PASS' : 
                                                     blockers > 0 ? 'SOFT_PASS' : 'FAIL';
        
        console.log(`Status: ${status}`);
        
        results.push({ slug, name: campaign.name, duration, blockers, warnings, autoFix: result.autoFixApplied, reprompt: result.correctiveRepromptUsed, approval: approvalResult, status });
    }
    
    // Summary
    console.log('\n' + '='.repeat(70));
    console.log('SMOKE BATCH SUMMARY');
    console.log('='.repeat(70));
    
    const pass = results.filter(r => r.status === 'PASS').length;
    const softPass = results.filter(r => r.status === 'SOFT_PASS').length;
    const fail = results.filter(r => r.status === 'FAIL').length;
    
    console.log(`\nResults: ${pass} PASS, ${softPass} SOFT_PASS, ${fail} FAIL\n`);
    
    for (const r of results) {
        console.log(`[${r.status}] ${r.slug}`);
        console.log(`  Name: ${r.name}`);
        console.log(`  Duration: ${r.duration}s | Blockers: ${r.blockers} | Warnings: ${r.warnings}`);
        console.log(`  Auto-fix: ${r.autoFix} | Reprompt: ${r.reprompt}`);
        console.log(`  Approval: ${r.approval}`);
    }
    
    console.log('\n' + '='.repeat(70));
    
    if (fail > 0) {
        console.log('❌ SMOKE BATCH FAILED');
        process.exit(1);
    } else {
        console.log('✅ SMOKE BATCH COMPLETE');
    }
}

testSmokeBatch().catch((error) => {
    console.error('FATAL:', error);
    process.exit(1);
});
