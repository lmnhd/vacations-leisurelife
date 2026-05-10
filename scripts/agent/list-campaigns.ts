/**
 * Agent-safe campaign list — no Playwright, no HTTP.
 * Scans all DynamoDB campaign records and writes a JSON summary file.
 *
 * Usage: npx tsx scripts/agent/list-campaigns.ts
 * Output: scripts/agent/output/campaigns-list.json  (also printed to stdout)
 * Exit code: 0 = success, 1 = error
 */

import { loadEnvConfig } from '@next/env';
import * as fs from 'fs';
import * as path from 'path';
import { scanAllCampaigns } from '@/lib/campaigns/campaign-store';

loadEnvConfig(process.cwd());

async function main(): Promise<void> {
    const campaigns = await scanAllCampaigns();

    const summary = campaigns
        .map(c => ({
            slug: c.id,
            name: c.name,
            status: c.status ?? null,
            pricingStatus: c.pricingStatus ?? null,
            aestheticBriefStatus: c.aestheticBriefStatus ?? null,
            activeBookingMode: c.activeBookingMode ?? null,
            inventoryHealth: c.inventoryHealth ?? null,
            matchedShipName: c.matchedShipName ?? null,
            matchedSailDate: c.matchedSailDate ?? null,
            retiredAt: c.discoveryIteration?.retiredAt ?? null,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

    const result = {
        count: summary.length,
        campaigns: summary,
        scannedAt: new Date().toISOString(),
    };

    const outputDir = path.join(process.cwd(), 'scripts', 'agent', 'output');
    fs.mkdirSync(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, 'campaigns-list.json');
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf-8');

    console.log(JSON.stringify(result, null, 2));
    console.log(`\n[agent] Written to ${outputPath}`);
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});
