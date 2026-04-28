/**
 * Phase B Runner — CB Group Inventory Matching
 *
 * Scrapes live CB view_groups inventory, then matches each unmatched campaign
 * to a group block and writes the result to DynamoDB.
 *
 * This must run as a standalone Node process (not inside Next.js) because
 * Playwright requires real system Chrome.
 *
 * Usage:
 *   npx tsx scripts/run-phase-b.ts                           # all unmatched campaigns
 *   npx tsx scripts/run-phase-b.ts --slug retro-gaming-2026  # single campaign
 *   npx tsx scripts/run-phase-b.ts --slug retro-gaming-2026 --slug houseplant-botanical-caribbean-2026
 */

import { loadEnvConfig } from '@next/env';
import { scrapeGroupInventory } from './cb-inventory-scraper';
import { matchGroupInventoryToCampaign, CbInventoryMatch } from '../lib/campaigns/cb-inventory-matcher';
import {
    scanUnmatchedCampaigns,
    getCampaignBlueprint,
    upsertCampaignPricingMatch,
    markCampaignUnmatched,
} from '../lib/campaigns/campaign-store';
import { OdysseusEngine } from '../lib/services/odysseus/OdysseusEngine';

loadEnvConfig(process.cwd());

// ─── Odysseus retail link generation ─────────────────────────────────────────

function parseSailDateToMmDdYyyy(rawDate: string): string | null {
    const d = new Date(rawDate);
    if (isNaN(d.getTime())) return null;
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${mm}/${dd}/${d.getFullYear()}`;
}

function shiftDateByDays(mmDdYyyy: string, days: number): string {
    const [mm, dd, yyyy] = mmDdYyyy.split('/').map(Number);
    const d = new Date(yyyy, mm - 1, dd + days);
    const newMm = String(d.getMonth() + 1).padStart(2, '0');
    const newDd = String(d.getDate()).padStart(2, '0');
    return `${newMm}/${newDd}/${d.getFullYear()}`;
}

async function generateOdysseusRetailLink(match: CbInventoryMatch): Promise<string | null> {
    const engine = new OdysseusEngine();
    try {
        await engine.init(true);
        await engine.login();

        const startDate = parseSailDateToMmDdYyyy(match.matchedSailDate);
        const endDate = startDate ? shiftDateByDays(startDate, 30) : undefined;

        const results = await engine.searchCruises({
            passengers: 2,
            guestAges: [35, 35],
            ...(startDate && endDate ? { startDate, endDate } : {}),
        });

        if (results.length === 0) {
            console.log(`[run-phase-b] Odysseus returned no results for "${match.matchedShipName}" — skipping retail link.`);
            return null;
        }

        await engine.selectItinerary(0);
        const retailLink = await engine.bypassGuestInfoAndContinue();

        if (!retailLink) {
            console.log(`[run-phase-b] Odysseus guest-info bypass failed for "${match.matchedShipName}" — skipping retail link.`);
            return null;
        }

        console.log(`[run-phase-b] ✅ Odysseus retail link: ${retailLink}`);
        return retailLink;
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.warn(`[run-phase-b] Odysseus retail link generation failed for "${match.matchedShipName}": ${msg}`);
        return null;
    } finally {
        await engine.close();
    }
}

// ─── CLI argument parsing ────────────────────────────────────────────────────

const args = process.argv.slice(2);
const targetSlugs = args.reduce<string[]>((collected, value, index) => {
    if (value === '--slug') {
        const slug = args[index + 1];
        if (slug) {
            collected.push(slug);
        }
    }
    return collected;
}, []);

// ─── Main ────────────────────────────────────────────────────────────────────

async function runPhaseB(): Promise<void> {
    console.log('\n─── Phase B: CB Inventory Matching ───\n');

    // 1. Scrape live CB group inventory (opens Playwright → requires saved session)
    console.log('[run-phase-b] Scraping CB view_groups...');
    const inventory = await scrapeGroupInventory();
    console.log(`[run-phase-b] ${inventory.length} inventory items scraped.\n`);

    if (inventory.length === 0) {
        console.warn('[run-phase-b] No inventory items found. Ensure CB session is valid.');
        return;
    }

    // 2. Get campaigns to process
    let campaigns = await scanUnmatchedCampaigns();

    if (targetSlugs.length > 0) {
        const requestedCampaigns = await Promise.all(targetSlugs.map((slug) => getCampaignBlueprint(slug)));
        const missingSlugs = targetSlugs.filter((slug, index) => !requestedCampaigns[index]);

        if (missingSlugs.length > 0) {
            console.error(`[run-phase-b] Campaign(s) not found: ${missingSlugs.join(', ')}`);
            process.exitCode = 1;
            return;
        }

        campaigns = requestedCampaigns.filter((campaign) => campaign !== null);
    }

    console.log(`[run-phase-b] Processing ${campaigns.length} campaign(s)...\n`);

    // 3. Match + write results
    const results: Array<{ slug: string; status: 'MATCHED' | 'UNMATCHED'; detail: string }> = [];

    for (const campaign of campaigns) {
        const match = matchGroupInventoryToCampaign(campaign, inventory);

        if (match) {
            console.log(`[run-phase-b] Generating Odysseus retail link for "${campaign.id}"...`);
            match.odysseusRetailBookingLink = await generateOdysseusRetailLink(match);

            await upsertCampaignPricingMatch(campaign.id, match);
            results.push({
                slug: campaign.id,
                status: 'MATCHED',
                detail: `${match.matchedShipName} — $${match.computedStartingPrice}/pp (score: ${match.matchScore})${match.odysseusRetailBookingLink ? ' + retail link' : ''}`,
            });
        } else {
            await markCampaignUnmatched(campaign.id);
            results.push({
                slug: campaign.id,
                status: 'UNMATCHED',
                detail: 'No qualifying CB group found',
            });
        }
    }

    // 4. Summary
    console.log('\n─── Results ───');
    for (const r of results) {
        const icon = r.status === 'MATCHED' ? '✅' : '⚠️';
        console.log(`${icon} [${r.status}] ${r.slug}: ${r.detail}`);
    }

    const matchedCount = results.filter(r => r.status === 'MATCHED').length;
    console.log(`\n[run-phase-b] Done. ${matchedCount}/${results.length} campaigns matched.\n`);
}

runPhaseB().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[run-phase-b] Fatal error: ${message}`);
    process.exitCode = 1;
});
