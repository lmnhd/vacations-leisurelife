/**
 * Test New Brief Generation System - Smoke Batch
 * Following agent-flow.md guidelines
 */

import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import { 
    scanAllCampaigns, 
    getCampaignBlueprint, 
    getAestheticBrief, 
    deleteAestheticBrief 
} from '../lib/campaigns/campaign-store';
import { 
    createOrRefreshBrief, 
    getReadiness, 
    approveForMedia 
} from '../lib/campaigns/brief-engine/orchestrator';

interface TestResult {
    campaignSlug: string;
    campaignName: string;
    baselineReadiness?: string;
    generationSummary: string;
    blockerCount: number;
    warningCount: number;
    autoFixApplied: boolean;
    fixedCodes: string[];
    correctiveRepromptUsed: boolean;
    approvalAttempted: boolean;
    approvalResult?: string;
    finalReadiness: string;
    status: 'PASS' | 'SOFT_PASS' | 'FAIL';
}

async function runSmokeBatch(): Promise<void> {
    console.log('\n🚀 SMOKE BATCH: Testing New Brief Generation System\n');

    // Step 1: Load existing campaigns
    const campaigns = await scanAllCampaigns();
    console.log(`Found ${campaigns.length} campaigns in database\n`);

    // Step 2: Select 3 representative campaigns
    const selectedCampaigns = [
        // CB_MATCHED with existing approved brief
        'bp-cottagecore-infinity-2026-10n-grtr',
        // CB_MATCHED with no brief
        'bp-tabletop-icon-2027-7n-caribbean', 
        // CB_MATCHED with no brief, different ship
        'greek-isles-book-lovers-2026-09-26'
    ];

    const results: TestResult[] = [];

    for (const slug of selectedCampaigns) {
        console.log(`\n--- Testing campaign: ${slug} ---`);
        
        const campaign = await getCampaignBlueprint(slug);
        if (!campaign) {
            console.log(`❌ Campaign not found: ${slug}`);
            continue;
        }

        const result: TestResult = {
            campaignSlug: slug,
            campaignName: campaign.name,
            generationSummary: '',
            blockerCount: 0,
            warningCount: 0,
            autoFixApplied: false,
            fixedCodes: [],
            correctiveRepromptUsed: false,
            approvalAttempted: false,
            finalReadiness: '',
            status: 'FAIL'
        };

        try {
            // Step 2: Capture baseline state
            const baselineBrief = await getAestheticBrief(slug);
            const baselineReadiness = baselineBrief ? await getReadiness(slug) : null;
            result.baselineReadiness = baselineReadiness?.readiness || 'NO_BRIEF';
            console.log(`  Baseline readiness: ${result.baselineReadiness}`);

            // Step 3: Delete existing brief for clean generation test (if exists)
            if (baselineBrief) {
                console.log(`  Deleting existing brief for clean test...`);
                await deleteAestheticBrief(slug);
            }

            // Step 3: Trigger brief generation
            console.log(`  Generating brief...`);
            const generationResult = await createOrRefreshBrief(slug);
            
            result.generationSummary = generationResult.summary;
            result.blockerCount = generationResult.issues.filter(i => i.severity === 'blocker').length;
            result.warningCount = generationResult.issues.filter(i => i.severity === 'warning').length;
            result.autoFixApplied = generationResult.autoFixApplied;
            result.fixedCodes = generationResult.fixedCodes;
            result.correctiveRepromptUsed = generationResult.correctiveRepromptUsed;

            console.log(`  Generation summary: ${result.generationSummary}`);
            console.log(`  Blockers: ${result.blockerCount}, Warnings: ${result.warningCount}`);
            console.log(`  Auto-fix applied: ${result.autoFixApplied}`);
            console.log(`  Fixed codes: ${result.fixedCodes.join(', ') || 'none'}`);
            console.log(`  Corrective reprompt used: ${result.correctiveRepromptUsed}`);

            // Step 4: Recheck stored readiness
            const storedReadiness = await getReadiness(slug);
            result.finalReadiness = storedReadiness.readiness;
            console.log(`  Stored readiness: ${result.finalReadiness}`);

            // Step 5: Verify persisted brief exists
            const persistedBrief = await getAestheticBrief(slug);
            if (!persistedBrief) {
                console.log(`  ❌ FAIL: No brief persisted`);
                result.status = 'FAIL';
                continue;
            }

            // Verify key fields exist
            const hasProductionBible = !!persistedBrief.productionBible;
            const hasLandingStillBible = !!persistedBrief.landingStillBible;
            const hasProductionLint = !!persistedBrief.productionBuildLint;
            
            console.log(`  Production Bible: ${hasProductionBible ? '✓' : '❌'}`);
            console.log(`  Landing Still Bible: ${hasLandingStillBible ? '✓' : '❌'}`);
            console.log(`  Production Lint: ${hasProductionLint ? '✓' : '❌'}`);

            if (!hasProductionBible || !hasLandingStillBible || !hasProductionLint) {
                console.log(`  ❌ FAIL: Missing required brief components`);
                result.status = 'FAIL';
                continue;
            }

            // Step 6: Attempt approval only when clean
            if (result.blockerCount === 0) {
                console.log(`  Attempting approval...`);
                result.approvalAttempted = true;
                
                try {
                    const approvalResult = await approveForMedia(slug);
                    result.approvalResult = approvalResult.readiness;
                    console.log(`  ✓ Approval successful: ${result.approvalResult}`);
                    
                    // Verify final readiness
                    const finalReadinessCheck = await getReadiness(slug);
                    if (finalReadinessCheck.readiness === 'ready_for_media') {
                        result.status = 'PASS';
                        console.log(`  ✅ PASS: Clean generation and approval`);
                    } else {
                        result.status = 'FAIL';
                        console.log(`  ❌ FAIL: Approval succeeded but readiness not ready_for_media`);
                    }
                } catch (error) {
                    result.approvalResult = `ERROR: ${error instanceof Error ? error.message : String(error)}`;
                    console.log(`  ❌ Approval failed: ${result.approvalResult}`);
                    result.status = 'FAIL';
                }
            } else {
                console.log(`  Skipping approval (${result.blockerCount} blockers remain)`);
                result.status = 'SOFT_PASS';
                console.log(`  ✅ SOFT_PASS: Generation completed with explicit blockers`);
            }

            // Show key brief content for successful generations
            if (persistedBrief && (result.status === 'PASS' || result.status === 'SOFT_PASS')) {
                console.log(`  Key brief content:`);
                console.log(`    Hero Slogan: ${persistedBrief.messaging?.heroSlogan || 'N/A'}`);
                console.log(`    Merch Type: ${persistedBrief.merch?.coreItem?.productType || 'N/A'}`);
                console.log(`    Theme: ${persistedBrief.themeName}`);
            }

        } catch (error) {
            console.log(`  ❌ ERROR: ${error instanceof Error ? error.message : String(error)}`);
            result.status = 'FAIL';
        }

        results.push(result);
    }

    // Summary report
    console.log('\n' + '='.repeat(80));
    console.log('SMOKE BATCH RESULTS');
    console.log('='.repeat(80));

    const passCount = results.filter(r => r.status === 'PASS').length;
    const softPassCount = results.filter(r => r.status === 'SOFT_PASS').length;
    const failCount = results.filter(r => r.status === 'FAIL').length;

    console.log(`\nSummary: ${passCount} PASS, ${softPassCount} SOFT_PASS, ${failCount} FAIL`);

    for (const result of results) {
        console.log(`\n[${result.status}] ${result.campaignSlug}`);
        console.log(`  Name: ${result.campaignName}`);
        console.log(`  Baseline: ${result.baselineReadiness}`);
        console.log(`  Summary: ${result.generationSummary}`);
        console.log(`  Blockers: ${result.blockerCount}, Warnings: ${result.warningCount}`);
        console.log(`  Auto-fix: ${result.autoFixApplied}, Reprompt: ${result.correctiveRepromptUsed}`);
        console.log(`  Approval: ${result.approvalAttempted ? 'YES' : 'NO'} ${result.approvalResult || ''}`);
        console.log(`  Final: ${result.finalReadiness}`);
    }

    console.log('\n' + '='.repeat(80));
    
    if (failCount > 0) {
        console.log('❌ SMOKE BATCH FAILED - Critical issues found');
        process.exit(1);
    } else if (softPassCount > 0) {
        console.log('⚠️  SMOKE BATCH COMPLETE - Some blockers remain (expected)');
    } else {
        console.log('✅ SMOKE BATCH PASSED - All clean generations');
    }
}

runSmokeBatch().catch((error) => {
    console.error('\n❌ FATAL ERROR:', error instanceof Error ? error.message : String(error));
    process.exit(1);
});
