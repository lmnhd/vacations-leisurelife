import { loadEnvConfig } from '@next/env';
import { getAestheticBrief } from '@/lib/campaigns/campaign-store';

loadEnvConfig(process.cwd());

async function main() {
    try {
        const brief = await getAestheticBrief('bp-opendeck-icon-2027-7n-caribbean');
        if (!brief) {
            console.log('Brief not found.');
            return;
        }
        
        console.log(JSON.stringify({
            productionBuildStatus: brief.productionBuildStatus,
            issues: brief.issueLedger,
            messaging: brief.messaging,
            communityExpression: brief.communityExpression,
            landingStill: brief.landingStillBible,
            productionBible: brief.productionBible,
        }, null, 2));
    } catch (e) {
        console.error('Error fetching brief:', e);
    }
}
main();