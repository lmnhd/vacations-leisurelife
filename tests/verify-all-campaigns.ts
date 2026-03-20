/**
 * Verify all 5 campaigns created by discovery pipeline
 * Check compliance and readiness status
 */

import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import { scanAllCampaigns, getAestheticBrief } from '../lib/campaigns/campaign-store';
import { getReadiness } from '../lib/campaigns/brief-engine/orchestrator';

async function verifyAllCampaigns(): Promise<void> {
    console.log('\n🔍 VERIFYING ALL DISCOVERY CAMPAIGNS\n');

    // Get all campaigns
    const campaigns = await scanAllCampaigns();
    console.log(`Found ${campaigns.length} campaigns in database\n`);

    let readyCount = 0;
    let needsReviewCount = 0;
    let noBriefCount = 0;
    let compliant = true;

    for (let i = 0; i < campaigns.length; i++) {
        const campaign = campaigns[i];
        console.log(`\n[${i + 1}/${campaigns.length}] ${campaign.name}`);
        console.log(`      ID: ${campaign.id}`);

        // Use matchedSailDate or fallback to targetDates for launch window check
        const sailDateStr = campaign.matchedSailDate || campaign.targetDates;
        console.log(`      Sail Date: ${sailDateStr}`);

        // Calculate days until sail
        const sailDate = new Date(sailDateStr);
        const now = new Date();
        const daysUntilSail = Math.ceil((sailDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        console.log(`      Days Until Sail: ${daysUntilSail}`);

        // Check launch window compliance (180 day minimum)
        const campaignCompliant = daysUntilSail >= 180;
        if (!campaignCompliant) compliant = false;
        console.log(`      Launch Window: ${campaignCompliant ? '✓ COMPLIANT' : '❌ VIOLATION (< 180 days)'}`);

        // Check brief status
        const brief = await getAestheticBrief(campaign.id);
        if (!brief) {
            console.log(`      Brief: ❌ NOT FOUND`);
            noBriefCount++;
            continue;
        }
        console.log(`      Brief: ✓ Present`);
        console.log(`      Theme: ${brief.themeName}`);

        // Check readiness
        const readiness = await getReadiness(campaign.id);
        console.log(`      Status: ${readiness.readiness}`);
        console.log(`      Summary: ${readiness.summary}`);

        if (readiness.readiness === 'ready_for_media') {
            readyCount++;
        } else if (readiness.readiness === 'needs_review') {
            needsReviewCount++;
        }

        // Show issues if any
        if (readiness.issues && readiness.issues.length > 0) {
            const blockers = readiness.issues.filter((i: { severity: string }) => i.severity === 'blocker');
            const warnings = readiness.issues.filter((i: { severity: string }) => i.severity === 'warning');
            console.log(`      Blockers: ${blockers.length}, Warnings: ${warnings.length}`);
            blockers.forEach((b: { code: string; message: string }) => {
                console.log(`        - [BLOCKER] ${b.code}: ${b.message}`);
            });
        }
    }

    console.log('\n' + '='.repeat(50));
    console.log('SUMMARY:');
    console.log(`  Total Campaigns: ${campaigns.length}`);
    console.log(`  Ready for Media: ${readyCount}`);
    console.log(`  Needs Review: ${needsReviewCount}`);
    console.log(`  No Brief: ${noBriefCount}`);
    console.log('='.repeat(50) + '\n');

    // Exit code based on results
    if (noBriefCount > 0) {
        console.log('❌ Some campaigns missing briefs');
        process.exit(1);
    }
    if (!compliant) {
        console.log('❌ Some campaigns violate launch window');
        process.exit(1);
    }
    console.log('✅ All campaigns verified');
}

let compliant = true;
verifyAllCampaigns().catch((error) => {
    console.error('\n❌ ERROR:', error instanceof Error ? error.message : String(error));
    process.exit(1);
});
