import { getCampaignBlueprint } from '../lib/campaigns/campaign-store';

async function inspect() {
    const slugs = ['mystical-seas','cosplay-at-sea','sci-fi-adventure','fantasy-literary-cruise'];
    for (const slug of slugs) {
        const c = await getCampaignBlueprint(slug);
        const r = c?.discoveryRedTeamReview;
        if (!r) {
            console.log(`\n=== ${slug}: NO REVIEW ===`);
            continue;
        }
        console.log(`\n=== ${slug}: ${r.verdict} (${r.requiredFixes?.length} fixes) ===`);
        console.log('ISSUES:');
        for (const i of r.issues ?? []) {
            console.log(`  [${i.severity}] ${i.category}: ${i.title}`);
            console.log(`    Evidence: ${(i.evidence ?? '').slice(0, 120)}...`);
        }
        console.log('REQUIRED FIXES:');
        for (const f of r.requiredFixes ?? []) {
            console.log(`  - ${(f ?? '').slice(0, 120)}...`);
        }
    }
}

inspect().catch(e => console.error(e));
