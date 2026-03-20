/**
 * Diagnose campaign database state
 * Check if specific campaigns exist
 */

import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import { scanAllCampaigns, getCampaignBlueprint, getAestheticBrief } from '../lib/campaigns/campaign-store';

async function diagnoseCampaigns(): Promise<void> {
    console.log('\n🔍 DIAGNOSING CAMPAIGN DATABASE\n');

    // Get all campaigns
    const allCampaigns = await scanAllCampaigns();
    console.log(`Total campaigns in database: ${allCampaigns.length}\n`);

    // Show all campaigns with full details
    console.log('All campaigns:');
    for (const c of allCampaigns) {
        console.log(`\n  - ${c.name}`);
        console.log(`    ID: ${c.id}`);
        console.log(`    Target Dates: ${c.targetDates}`);
        console.log(`    Matched Sail Date: ${c.matchedSailDate || 'N/A'}`);
        console.log(`    Status: ${c.status}`);
        console.log(`    Pricing Status: ${c.pricingStatus || 'N/A'}`);
        console.log(`    Created At: ${c.createdAt}`);
    }

    // Check for the specific campaign from the end-to-end test
    console.log('\n\n🔎 Checking for cottagecore campaign from end-to-end test:');
    const cottagecoreId = 'bp-cottagecore-infinity-2026-10n-grtr';
    const cottagecore = await getCampaignBlueprint(cottagecoreId);

    if (cottagecore) {
        console.log(`  ✓ Found: ${cottagecore.name}`);
        console.log(`    Target Dates: ${cottagecore.targetDates}`);

        // Check for brief
        const brief = await getAestheticBrief(cottagecoreId);
        if (brief) {
            console.log(`  ✓ Brief exists: ${brief.themeName}`);
            console.log(`    Status: ${brief.humanReviewStatus}`);
        } else {
            console.log(`  ❌ No brief found`);
        }
    } else {
        console.log(`  ❌ Campaign "${cottagecoreId}" NOT FOUND in database`);
    }

    // Check if any campaigns have briefs
    console.log('\n\n📋 Checking for briefs on all campaigns:');
    let briefCount = 0;
    for (const c of allCampaigns) {
        const brief = await getAestheticBrief(c.id);
        if (brief) {
            console.log(`  ✓ ${c.id}: ${brief.themeName} (${brief.humanReviewStatus})`);
            briefCount++;
        } else {
            console.log(`  ❌ ${c.id}: No brief`);
        }
    }

    console.log(`\n\nSummary: ${briefCount}/${allCampaigns.length} campaigns have briefs`);
}

diagnoseCampaigns().catch((error) => {
    console.error('\n❌ ERROR:', error instanceof Error ? error.message : String(error));
    process.exit(1);
});
