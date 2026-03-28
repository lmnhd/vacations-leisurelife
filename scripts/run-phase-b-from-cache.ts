import fs from 'node:fs';
import path from 'node:path';
import { loadEnvConfig } from '@next/env';

import * as matcherModule from '../lib/campaigns/cb-inventory-matcher';
import {
    scanUnmatchedCampaigns,
    getCampaignBlueprint,
    upsertCampaignPricingMatch,
} from '../lib/campaigns/campaign-store';
import type { CbGroupInventoryItem } from '../lib/campaigns/cb-inventory-types';
import type { Campaign } from '../lib/campaigns/types';

loadEnvConfig(process.cwd());

type CachedPriceAdvantageItem = {
    groupId?: string;
    shipName?: string;
    vendor?: string;
    sailDate?: string;
    startingPrice?: string;
    priceAdvantage?: string;
    sourceUrl?: string;
};

type CachedDealsFile = {
    priceAdvantages?: CachedPriceAdvantageItem[];
};

type ParsedArgs = {
    apply: boolean;
    slugs: string[];
};

const matchGroupInventoryToCampaign = matcherModule.matchGroupInventoryToCampaign;

function parseArgs(argv: string[]): ParsedArgs {
    const slugs: string[] = [];
    let apply = false;

    for (let index = 0; index < argv.length; index += 1) {
        const value = argv[index];
        if (value === '--') {
            continue;
        }
        if (value === '--apply') {
            apply = true;
            continue;
        }
        if (value === '--slug') {
            const slug = argv[index + 1];
            if (slug) {
                slugs.push(slug);
                index += 1;
            }
        }
    }

    return { apply, slugs };
}

function parseNumericValue(rawValue?: string): number {
    const digits = (rawValue ?? '').replace(/[^0-9.]/g, '');
    return digits ? Number.parseFloat(digits) : 0;
}

function extractDeparturePort(rawValue?: string): string | undefined {
    const candidate = (rawValue ?? '').trim().toUpperCase();
    return /^[A-Z]{3,4}$/.test(candidate) ? candidate : undefined;
}

function extractNights(itinerary?: string): string | undefined {
    const match = itinerary?.match(/(\d+)\s+night/i);
    return match ? match[1] : undefined;
}

function extractActualSailDate(rawValue?: string): string {
    const value = (rawValue ?? '').trim();
    if (!value) {
        return '';
    }

    const exactDateMatch = value.match(/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december)\.?\s+\d{1,2},\s+20\d{2}\b/i);
    return exactDateMatch ? exactDateMatch[0] : '';
}

function normalizeCachedInventoryItem(item: CachedPriceAdvantageItem): CbGroupInventoryItem | null {
    const groupId = String(item.groupId ?? '').trim();
    const shipName = String(item.shipName ?? '').trim();
    const vendor = String(item.vendor ?? '').trim();
    const rawItinerary = String(item.sailDate ?? '').trim();

    if (!groupId || !shipName || !vendor) {
        return null;
    }

    return {
        groupId,
        shipName,
        vendor,
        itinerary: rawItinerary,
        sailDate: extractActualSailDate(rawItinerary),
        startingPrice: String(item.startingPrice ?? ''),
        startingPriceNumber: parseNumericValue(item.startingPrice),
        priceAdvantage: String(item.priceAdvantage ?? ''),
        priceAdvantageNumber: parseNumericValue(item.priceAdvantage),
        departurePort: extractDeparturePort(item.startingPrice),
        nights: extractNights(rawItinerary),
        sourceUrl: String(item.sourceUrl ?? ''),
    };
}

function loadCachedInventory(): CbGroupInventoryItem[] {
    const cachePath = path.join(process.cwd(), '.github', 'data', 'cb-deals-cache.json');
    if (!fs.existsSync(cachePath)) {
        throw new Error('cb-deals-cache.json not found.');
    }

    const parsed = JSON.parse(fs.readFileSync(cachePath, 'utf8')) as CachedDealsFile;
    return (parsed.priceAdvantages ?? [])
        .map(normalizeCachedInventoryItem)
        .filter((item): item is CbGroupInventoryItem => item !== null);
}

async function resolveCampaigns(targetSlugs: string[]): Promise<Campaign[]> {
    if (targetSlugs.length === 0) {
        return scanUnmatchedCampaigns();
    }

    const campaigns = await Promise.all(targetSlugs.map((slug) => getCampaignBlueprint(slug)));
    const missingSlugs = targetSlugs.filter((slug, index) => !campaigns[index]);
    if (missingSlugs.length > 0) {
        throw new Error(`Campaign(s) not found: ${missingSlugs.join(', ')}`);
    }

    return campaigns.filter((campaign): campaign is Campaign => campaign !== null);
}

async function main(): Promise<void> {
    const args = parseArgs(process.argv.slice(2));
    const inventory = loadCachedInventory();
    const campaigns = await resolveCampaigns(args.slugs);

    console.log('\n--- Phase B From Cache ---\n');
    console.log(`[cache-phase-b] Loaded ${inventory.length} cached inventory items.`);
    console.log(`[cache-phase-b] Processing ${campaigns.length} campaign(s).`);
    console.log(`[cache-phase-b] Mode: ${args.apply ? 'apply' : 'dry-run'}\n`);

    const results: Array<{ slug: string; status: 'MATCHED' | 'UNMATCHED'; detail: string }> = [];

    for (const campaign of campaigns) {
        const match = matchGroupInventoryToCampaign(campaign, inventory);

        if (!match) {
            results.push({
                slug: campaign.id,
                status: 'UNMATCHED',
                detail: 'No qualifying cached CB group found',
            });
            continue;
        }

        if (args.apply) {
            await upsertCampaignPricingMatch(campaign.id, match);
        }

        results.push({
            slug: campaign.id,
            status: 'MATCHED',
            detail: `${match.matchedShipName} | group ${match.cbGroupId} | $${match.computedStartingPrice}/pp | score ${match.matchScore}`,
        });
    }

    console.log('--- Results ---');
    for (const result of results) {
        const icon = result.status === 'MATCHED' ? 'OK' : 'NO';
        console.log(`[${icon}] [${result.status}] ${result.slug}: ${result.detail}`);
    }

    const matchedCount = results.filter((result) => result.status === 'MATCHED').length;
    console.log(`\n[cache-phase-b] ${matchedCount}/${results.length} campaign(s) matched.`);
}

main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[cache-phase-b] Fatal error: ${message}`);
    process.exitCode = 1;
});