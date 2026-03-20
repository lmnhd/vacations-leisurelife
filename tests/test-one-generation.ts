/**
 * Test One Campaign Brief Generation
 */

import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

async function testOneGeneration(): Promise<void> {
    console.log('🚀 Testing brief generation for one campaign...\n');
    
    try {
        // Imports
        const { createOrRefreshBrief, getReadiness, approveForMedia } = await import('../lib/campaigns/brief-engine/orchestrator');
        const { getCampaignBlueprint, getAestheticBrief } = await import('../lib/campaigns/campaign-store');
        
        const slug = 'bp-cottagecore-infinity-2026-10n-grtr';
        
        // Get campaign
        const campaign = await getCampaignBlueprint(slug);
        if (!campaign) {
            console.log('❌ Campaign not found');
            return;
        }
        
        console.log(`Campaign: ${campaign.name}`);
        console.log(`Target Dates: ${campaign.targetDates}\n`);
        
        // Generate brief
        console.log('Generating brief...');
        const startTime = Date.now();
        
        const result = await createOrRefreshBrief(slug);
        
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`✓ Generation completed in ${duration}s\n`);
        
        // Show results
        console.log(`Readiness: ${result.readiness}`);
        console.log(`Summary: ${result.summary}`);
        console.log(`Blockers: ${result.issues.filter(i => i.severity === 'blocker').length}`);
        console.log(`Warnings: ${result.issues.filter(i => i.severity === 'warning').length}`);
        console.log(`Auto-fix applied: ${result.autoFixApplied}`);
        console.log(`Fixed codes: ${result.fixedCodes.join(', ') || 'none'}`);
        console.log(`Corrective reprompt used: ${result.correctiveRepromptUsed}\n`);
        
        // Show blockers if any
        const blockers = result.issues.filter(i => i.severity === 'blocker');
        if (blockers.length > 0) {
            console.log('Blockers:');
            blockers.forEach(b => {
                console.log(`  - [${b.code}] ${b.message}`);
                console.log(`    Auto-fixable: ${b.autoFixable}`);
            });
        }
        
        // Check stored brief
        const storedBrief = await getAestheticBrief(slug);
        if (storedBrief) {
            console.log('\n✓ Brief persisted successfully');
            console.log(`Theme: ${storedBrief.themeName}`);
            console.log(`Hero Slogan: ${storedBrief.messaging?.heroSlogan || 'N/A'}`);
            console.log(`Merch: ${storedBrief.merch?.coreItem?.productType || 'N/A'}`);
            console.log(`Production Bible: ${storedBrief.productionBible ? '✓' : '❌'}`);
            console.log(`Landing Still Bible: ${storedBrief.landingStillBible ? '✓' : '❌'}`);
            console.log(`Production Lint: ${storedBrief.productionBuildLint ? '✓' : '❌'}`);
        } else {
            console.log('\n❌ Brief not persisted');
        }
        
        // Check readiness matches
        const storedReadiness = await getReadiness(slug);
        console.log(`\nStored readiness: ${storedReadiness.readiness}`);
        console.log(`Stored issues: ${storedReadiness.issues.length}`);
        
        // Test approval if no blockers
        if (blockers.length === 0) {
            console.log('\nAttempting approval...');
            try {
                const approval = await approveForMedia(slug);
                console.log(`✅ Approval successful: ${approval.readiness}`);
            } catch (error) {
                console.log(`❌ Approval failed: ${error instanceof Error ? error.message : String(error)}`);
            }
        } else {
            console.log(`\nSkipping approval (${blockers.length} blockers remain)`);
        }
        
        console.log('\n✅ Test completed');
        
    } catch (error) {
        console.error('\n❌ Test failed:', error);
        if (error instanceof Error) {
            console.error('Stack:', error.stack);
        }
        process.exit(1);
    }
}

testOneGeneration().catch(console.error);
