/**
 * Agent-safe campaign status check — no Playwright, no HTTP.
 * Queries DynamoDB for campaign + brief state and writes a JSON result file.
 *
 * Usage: npx tsx scripts/agent/campaign-status.ts <slug>
 * Output: scripts/agent/output/<slug>-status.json  (also printed to stdout)
 * Exit code: 0 = success, 1 = error
 */

import { loadEnvConfig } from '@next/env';
import * as fs from 'fs';
import * as path from 'path';
import { getCampaignBlueprint, getAestheticBrief } from '@/lib/campaigns/campaign-store';

loadEnvConfig(process.cwd());

async function main(): Promise<void> {
    const slug = process.argv.slice(2).find(arg => !arg.startsWith('--'));
    if (!slug) {
        console.error('Usage: npx tsx scripts/agent/campaign-status.ts <slug>');
        process.exit(1);
    }

    const [campaign, brief] = await Promise.all([
        getCampaignBlueprint(slug),
        getAestheticBrief(slug),
    ]);

    const result = {
        slug,
        campaignExists: Boolean(campaign),
        name: campaign?.name ?? null,
        status: campaign?.status ?? null,
        pricingStatus: campaign?.pricingStatus ?? null,
        aestheticBriefStatus: campaign?.aestheticBriefStatus ?? null,
        activeBookingMode: campaign?.activeBookingMode ?? null,
        inventoryHealth: campaign?.inventoryHealth ?? null,
        inventoryLastCheckedAt: campaign?.inventoryLastCheckedAt ?? null,
        matchedShipName: campaign?.matchedShipName ?? null,
        matchedSailDate: campaign?.matchedSailDate ?? null,
        startingPrice: campaign?.startingPrice ?? null,
        retiredAt: campaign?.discoveryIteration?.retiredAt ?? null,
        brief: brief ? {
            exists: true,
            themeName: brief.themeName ?? null,
            reviewStatus: brief.humanReviewStatus ?? null,
            productionBuildStatus: brief.productionBuildStatus ?? null,
            generatedAt: brief.generatedAt ?? null,
            hasProductionBible: Boolean(brief.productionBible?.sceneLibrary?.length),
            sceneCount: brief.productionBible?.sceneLibrary?.length ?? 0,
        } : { exists: false },
        checkedAt: new Date().toISOString(),
    };

    const outputDir = path.join(process.cwd(), 'scripts', 'agent', 'output');
    fs.mkdirSync(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, `${slug}-status.json`);
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf-8');

    console.log(JSON.stringify(result, null, 2));
    console.log(`\n[agent] Written to ${outputPath}`);
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});
