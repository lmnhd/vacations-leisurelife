import { loadEnvConfig } from '@next/env';
import { getAestheticBrief } from '@/lib/campaigns/campaign-store';

loadEnvConfig(process.cwd());

async function run(): Promise<void> {
    const slug = process.argv.slice(2).find((arg) => arg !== '--');
    if (!slug) {
        throw new Error('Provide a campaign slug.');
    }

    const brief = await getAestheticBrief(slug);
    console.log(JSON.stringify({
        slug,
        exists: Boolean(brief),
        themeName: brief?.themeName ?? null,
        reviewStatus: brief?.humanReviewStatus ?? null,
        productionBuildStatus: brief?.productionBuildStatus ?? null,
        generatedAt: brief?.generatedAt ?? null,
    }, null, 2));
}

run().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});