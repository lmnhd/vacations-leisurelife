/**
 * Find Campaigns for Wider Batch Test
 */

import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

async function findBatchCandidates(): Promise<void> {
    console.log('🔍 Finding campaigns for wider batch test...\n');
    
    const { scanAllCampaigns, getAestheticBrief } = await import('../lib/campaigns/campaign-store');
    
    const campaigns = await scanAllCampaigns();
    console.log(`Total campaigns: ${campaigns.length}\n`);
    
    // Check existing briefs and their production build status
    const candidates = [];
    
    for (const campaign of campaigns) {
        const brief = await getAestheticBrief(campaign.id);
        
        if (brief) {
            const status = brief.productionBuildStatus || 'unknown';
            const readiness = brief.humanReviewStatus || 'unknown';
            
            candidates.push({
                slug: campaign.id,
                name: campaign.name,
                pricingStatus: campaign.pricingStatus,
                hasBrief: true,
                readiness,
                productionBuildStatus: status,
                needsTest: status === 'fail' || !campaign.pricingStatus || campaign.pricingStatus === 'UNMATCHED'
            });
            
            console.log(`${campaign.id}:`);
            console.log(`  Name: ${campaign.name}`);
            console.log(`  Pricing: ${campaign.pricingStatus}`);
            console.log(`  Readiness: ${readiness}`);
            console.log(`  Production Build: ${status}`);
            console.log(`  Needs test: ${status === 'fail' || !campaign.pricingStatus || campaign.pricingStatus === 'UNMATCHED'}\n`);
        } else {
            candidates.push({
                slug: campaign.id,
                name: campaign.name,
                pricingStatus: campaign.pricingStatus,
                hasBrief: false,
                readiness: 'none',
                productionBuildStatus: 'none',
                needsTest: campaign.pricingStatus === 'CB_MATCHED'
            });
            
            console.log(`${campaign.id}:`);
            console.log(`  Name: ${campaign.name}`);
            console.log(`  Pricing: ${campaign.pricingStatus}`);
            console.log(`  Brief: NONE`);
            console.log(`  Needs test: ${campaign.pricingStatus === 'CB_MATCHED'}\n`);
        }
    }
    
    const needsTest = candidates.filter(c => c.needsTest);
    console.log(`\n📋 Campaigns needing test: ${needsTest.length}\n`);
    
    needsTest.forEach((c, i) => {
        console.log(`${i + 1}. ${c.slug} - ${c.name}`);
        console.log(`   Pricing: ${c.pricingStatus} | Brief: ${c.hasBrief ? 'YES' : 'NO'} | Prod Build: ${c.productionBuildStatus}`);
    });
    
    console.log('\n✅ Ready for individual testing');
}

findBatchCandidates().catch(console.error);
