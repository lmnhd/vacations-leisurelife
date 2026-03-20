/**
 * Check CB inventory matching status for all campaigns
 * Verify pricingStatus and CB group linkage
 */

import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import { scanAllCampaigns, getAestheticBrief } from '../lib/campaigns/campaign-store';

async function checkCbInventoryMatching(): Promise<void> {
    console.log('\n🔍 CHECKING CB INVENTORY MATCHING STATUS\n');

    const campaigns = await scanAllCampaigns();
    console.log(`Total campaigns: ${campaigns.length}\n`);

    let cbMatched = 0;
    let aiEstimate = 0;
    let unmatched = 0;
    let noPricingStatus = 0;

    for (const c of campaigns) {
        const status = c.pricingStatus || 'NOT_SET';
        const hasCbLink = !!c.cbagenttoolsBookingLink;
        const hasCbGroupId = !!c.cbagenttoolsGroupId;

        // Count by status
        if (status === 'CB_MATCHED') cbMatched++;
        else if (status === 'AI_ESTIMATE') aiEstimate++;
        else if (status === 'UNMATCHED') unmatched++;
        else noPricingStatus++;

        // Show details
        console.log(`${c.name}`);
        console.log(`  ID: ${c.id}`);
        console.log(`  Pricing Status: ${status}`);
        console.log(`  CB Group ID: ${c.cbagenttoolsGroupId || 'N/A'}`);
        console.log(`  CB Booking Link: ${hasCbLink ? '✓ Present' : '❌ Missing'}`);
        console.log(`  Starting Price: $${c.startingPrice || 'N/A'}`);
        console.log(`  Price Source: ${c.priceSource || 'N/A'}`);
        console.log(`  Target Dates: ${c.targetDates}`);
        console.log(`  Matched Sail Date: ${c.matchedSailDate || 'N/A'}`);
        console.log(`  Matched Ship: ${c.matchedShipName || 'N/A'}`);
        console.log(`  Matched Departure Port: ${c.matchedDeparturePort || 'N/A'}`);
        console.log(`  Matched Nights: ${c.matchedNights || 'N/A'}`);

        // Check if brief exists
        const brief = await getAestheticBrief(c.id);
        if (brief) {
            console.log(`  Brief Status: ${brief.readiness || brief.humanReviewStatus || 'unknown'}`);
        } else {
            console.log(`  Brief: ❌ NOT FOUND`);
        }

        // Flag issues
        if (status === 'AI_ESTIMATE') {
            console.log(`  ⚠️  WARNING: Using AI-estimated price, not CB-matched inventory`);
        }
        if (status === 'UNMATCHED') {
            console.log(`  ⚠️  WARNING: Phase B ran but found no matching CB inventory`);
        }
        if (!hasCbLink && status === 'CB_MATCHED') {
            console.log(`  ❌ ERROR: CB_MATCHED but no booking link present`);
        }
        if (brief?.humanReviewStatus === 'ready_for_media' && status !== 'CB_MATCHED') {
            console.log(`  🚨 CRITICAL: Approved for media but NOT CB-matched!`);
        }

        console.log('');
    }

    console.log('='.repeat(60));
    console.log('CB INVENTORY MATCHING SUMMARY:');
    console.log(`  CB_MATCHED:    ${cbMatched} campaigns`);
    console.log(`  AI_ESTIMATE:   ${aiEstimate} campaigns`);
    console.log(`  UNMATCHED:     ${unmatched} campaigns`);
    console.log(`  NOT_SET:       ${noPricingStatus} campaigns`);
    console.log('='.repeat(60));

    // Critical: Check for approved campaigns without CB matching
    console.log('\n🚨 CRITICAL CHECK: Approved campaigns without CB matching:');
    let criticalCount = 0;
    for (const c of campaigns) {
        const brief = await getAestheticBrief(c.id);
        if ((brief?.readiness === 'ready_for_media' || c.aestheticBriefStatus === 'approved') && c.pricingStatus !== 'CB_MATCHED') {
            console.log(`  - ${c.id}: ${c.name} (${c.pricingStatus || 'NO STATUS'})`);
            criticalCount++;
        }
    }
    if (criticalCount === 0) {
        console.log('  ✓ None found');
    } else {
        console.log(`\n  ⚠️  ${criticalCount} campaigns are approved but NOT CB-matched!`);
    }
}

checkCbInventoryMatching().catch((error) => {
    console.error('\n❌ ERROR:', error instanceof Error ? error.message : String(error));
    process.exit(1);
});
