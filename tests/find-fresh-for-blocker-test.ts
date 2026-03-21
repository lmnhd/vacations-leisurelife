/**
 * Find 3 Fresh Campaigns for Blocker Frequency Test
 * Skip campaigns we've already tested
 */

import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

async function findFreshCampaigns(): Promise<void> {
    console.log('🔍 Finding 3 fresh campaigns for blocker frequency test...\n');
    
    const { scanAllCampaigns, getAestheticBrief } = await import('../lib/campaigns/campaign-store');
    
    const campaigns = await scanAllCampaigns();
    
    // Campaigns we've already tested
    const testedSlugs = new Set([
        'bp-cottagecore-infinity-2026-10n-grtr', // deleted
        'film-and-zine-afloat-2026', // tested
        'bp-opendeck-icon-2027-7n-caribbean', // tested
        'drift-festival-icon-2026', // tested multiple times
        'transpacific-vinyl-listening-nov-2026', // tested multiple times
        'open-seas-pride-2026', // tested
        'greek-isles-book-lovers-2026-09-26' // existing approved
    ]);
    
    // Find CB-matched campaigns we haven't tested
    const freshCandidates = campaigns.filter(c => 
        c.pricingStatus === 'CB_MATCHED' && 
        !testedSlugs.has(c.id)
    );
    
    console.log(`Found ${freshCandidates.length} fresh CB-matched candidates:\n`);
    
    freshCandidates.slice(0, 10).forEach((c, i) => {
        console.log(`${i + 1}. ${c.id}`);
        console.log(`   Name: ${c.name}`);
        console.log(`   Ship: ${c.matchedShipName || 'N/A'}`);
        console.log(`   Price: $${c.startingPrice || 'N/A'}`);
        console.log(`   Brief exists: ${c.aestheticBriefStatus ? 'YES' : 'NO'}`);
        console.log('');
    });
    
    if (freshCandidates.length >= 3) {
        console.log('📋 Selected 3 campaigns for blocker frequency test:');
        const selected = freshCandidates.slice(0, 3);
        
        selected.forEach((c, i) => {
            console.log(`\n${i + 1}. ${c.id}`);
            console.log(`   ${c.name}`);
            console.log(`   Ship: ${c.matchedShipName || 'N/A'}, Price: $${c.startingPrice || 'N/A'}`);
        });
        
        console.log('\n✅ Ready to test these 3 campaigns one at a time');
        
    } else {
        console.log('❌ Not enough fresh campaigns found');
    }
}

findFreshCampaigns().catch(console.error);
