/**
 * Phase B Runner — CB Inventory Confirmation + Retail Link Generation
 *
 * Campaigns now arrive at Phase B already matched (inventory gate runs during discovery).
 * Phase B re-scrapes live CB inventory to confirm the match still holds, then generates
 * the Odysseus retail booking link and writes the final result to DynamoDB.
 *
 * If the live scrape shows the match is gone (inventory sold/expired), the campaign is
 * logged for operator review but left in CB_MATCHED state.
 *
 * Usage:
 *   npx tsx scripts/run-phase-b.ts                           # all CB_MATCHED campaigns
 *   npx tsx scripts/run-phase-b.ts --slug retro-gaming-2026  # single campaign
 *   npx tsx scripts/run-phase-b.ts --slug retro-gaming-2026 --slug houseplant-botanical-caribbean-2026
 */

import { loadEnvConfig } from '@next/env';
import { scrapeGroupInventory, scrapeGroupPersonalLink } from './cb-inventory-scraper';
import { matchGroupInventoryToCampaign, CbInventoryMatch } from '../lib/campaigns/cb-inventory-matcher';
import {
    scanMatchedCampaigns,
    getCampaignBlueprint,
    upsertCampaignPricingMatch,
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
    console.log('\n─── Phase B: CB Inventory Confirmation + Retail Link Generation ───\n');

    // 1. Scrape live CB group inventory (opens Playwright → requires saved session)
    console.log('[run-phase-b] Scraping live CB view_groups for match confirmation...');
    const inventory = await scrapeGroupInventory();
    console.log(`[run-phase-b] ${inventory.length} inventory items scraped.\n`);

    if (inventory.length === 0) {
        console.warn('[run-phase-b] No inventory items found. Ensure CB session is valid.');
        return;
    }

    // 2. Get campaigns to process (only CB_MATCHED campaigns — matching was done during discovery)
    let campaigns = await scanMatchedCampaigns();

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

    console.log(`[run-phase-b] Confirming ${campaigns.length} pre-matched campaign(s)...\n`);

    // 3. Confirm match against live inventory + write Odysseus retail link
    const results: Array<{ slug: string; status: 'CONFIRMED' | 'MATCH_EXPIRED'; detail: string }> = [];

    for (const campaign of campaigns) {
        const confirmation = matchGroupInventoryToCampaign(campaign, inventory);

        if (confirmation) {
            console.log(`[run-phase-b] ✅ Match confirmed for "${campaign.id}" → ${confirmation.matchedShipName} (score: ${confirmation.matchScore})`);
            
            // 3a. Extract the true Personal Link from the group details page
            console.log(`[run-phase-b] Fetching true Personal Booking Link for group ${confirmation.cbGroupId}...`);
            const truePersonalLink = await scrapeGroupPersonalLink(confirmation.cbGroupId);
            if (truePersonalLink) {
                confirmation.cbPersonalLink = truePersonalLink;
            } else {
                console.warn(`[run-phase-b] ⚠️ Could not fetch true Personal Link for group ${confirmation.cbGroupId}. Link may be 404.`);
            }

            console.log(`[run-phase-b] Generating Odysseus retail link for "${campaign.id}"...`);
            confirmation.odysseusRetailBookingLink = await generateOdysseusRetailLink(confirmation);

            await upsertCampaignPricingMatch(campaign.id, confirmation);
            results.push({
                slug: campaign.id,
                status: 'CONFIRMED',
                detail: `${confirmation.matchedShipName} — $${confirmation.computedStartingPrice}/pp (score: ${confirmation.matchScore})${confirmation.odysseusRetailBookingLink ? ' + retail link' : ''}`,
            });
        } else {
            // Match existed at discovery time but is no longer in live inventory — flag for review
            console.warn(`[run-phase-b] ⚠️ Match EXPIRED for "${campaign.id}" — was matched to "${campaign.matchedShipName ?? 'unknown'}" but not found in current live inventory. Manual operator review needed.`);
            results.push({
                slug: campaign.id,
                status: 'MATCH_EXPIRED',
                detail: `Previously matched to "${campaign.matchedShipName ?? 'unknown'}" — no longer in live CB inventory`,
            });
        }
    }

    // 4. Summary
    console.log('\n─── Results ───');
    for (const r of results) {
        const icon = r.status === 'CONFIRMED' ? '✅' : '⚠️';
        console.log(`${icon} [${r.status}] ${r.slug}: ${r.detail}`);
    }

    const confirmedCount = results.filter(r => r.status === 'CONFIRMED').length;
    const expiredCount = results.filter(r => r.status === 'MATCH_EXPIRED').length;
    console.log(`\n[run-phase-b] Done. ${confirmedCount}/${results.length} confirmed, ${expiredCount} need operator review.\n`);
}

runPhaseB().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[run-phase-b] Fatal error: ${message}`);
    process.exitCode = 1;
});
