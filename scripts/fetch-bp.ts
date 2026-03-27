import { loadEnvConfig } from '@next/env';
import { getAestheticBrief } from '@/lib/campaigns/campaign-store';

loadEnvConfig(process.cwd());

async function main() {
    try {
        const brief = await getAestheticBrief('bp-opendeck-icon-2027-7n-caribbean');
        if (!brief) return;
        console.log(JSON.stringify(brief.productionBuildLint, null, 2));
    } catch (e) { }
}
main();
