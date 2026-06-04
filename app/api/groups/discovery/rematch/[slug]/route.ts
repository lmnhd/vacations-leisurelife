import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { getCampaignBlueprint, upsertCampaignPricingMatch, updateCampaignInventoryMode } from '@/lib/campaigns/campaign-store';
import { matchGroupInventoryToCampaign } from '@/lib/campaigns/cb-inventory-matcher';
import type { CbGroupInventoryItem } from '@/lib/campaigns/cb-inventory-types';

const CB_DEALS_CACHE_FILE = path.join(process.cwd(), '.github', 'data', 'cb-deals-cache.json');
const CB_CACHE_MAX_AGE_MS = 72 * 60 * 60 * 1000;

type CbDealsCache = {
    generatedAtIso: string;
    priceAdvantages: Array<{
        groupId: string;
        shipName: string;
        vendor: string;
        itinerary?: string;
        departurePort?: string;
        nights?: string;
        sailDate: string;
        startingPrice?: string;
        priceAdvantage?: string;
        sourceUrl?: string;
    }>;
};

function parseCurrencyNumber(value?: string): number {
    if (!value) return 0;
    const normalized = value.replace(/[^0-9.]/g, '');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
}

function loadCbInventory(): { items: CbGroupInventoryItem[]; cacheAgeHours: number } {
    if (!existsSync(CB_DEALS_CACHE_FILE)) {
        throw new Error('CB deals cache not found. Run scrape-cb-deals.ts first.');
    }
    const raw = readFileSync(CB_DEALS_CACHE_FILE, 'utf-8');
    const cache = JSON.parse(raw) as CbDealsCache;
    const ageMs = Date.now() - new Date(cache.generatedAtIso).getTime();
    const cacheAgeHours = Math.round(ageMs / (60 * 60 * 1000));
    if (ageMs > CB_CACHE_MAX_AGE_MS) {
        throw new Error(`CB deals cache is ${cacheAgeHours}h old (>72h). Run scrape-cb-deals.ts to refresh.`);
    }
    const items: CbGroupInventoryItem[] = cache.priceAdvantages
        .filter((item) => item.groupId && item.shipName)
        .map((item) => ({
            groupId: item.groupId,
            shipName: item.shipName,
            vendor: item.vendor ?? '',
            itinerary: item.itinerary ?? '',
            sailDate: item.sailDate ?? '',
            startingPrice: item.startingPrice ?? '',
            startingPriceNumber: parseCurrencyNumber(item.startingPrice),
            priceAdvantage: item.priceAdvantage ?? '',
            priceAdvantageNumber: parseCurrencyNumber(item.priceAdvantage),
            departurePort: item.departurePort,
            nights: item.nights,
            sourceUrl: item.sourceUrl ?? '',
        }));
    return { items, cacheAgeHours };
}

/**
 * POST /api/groups/discovery/rematch/[slug]
 *
 * Re-runs the CB inventory matcher against the current cache for a campaign whose
 * existing match failed (e.g. House group, expired link). The campaign's blueprint,
 * niche, and all creative fields are left completely untouched — only the inventory
 * fields are replaced. After rematch the campaign returns to AI_ESTIMATE / unverified
 * state, ready for a fresh Phase B run.
 *
 * Body (optional): { excludeGroupIds?: string[] }
 * Use excludeGroupIds to prevent re-matching to the same failed group(s).
 */
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
    const { slug } = await params;

    let excludeGroupIds: string[] = [];
    try {
        const body = (await req.json()) as { excludeGroupIds?: string[] } | null;
        excludeGroupIds = Array.isArray(body?.excludeGroupIds) ? body.excludeGroupIds : [];
    } catch {
        excludeGroupIds = [];
    }

    try {
        const campaign = await getCampaignBlueprint(slug);
        if (!campaign) {
            return NextResponse.json({ success: false, error: `Campaign "${slug}" not found.` }, { status: 404 });
        }

        const { items: allInventory, cacheAgeHours } = loadCbInventory();

        // Filter out any explicitly excluded group IDs (e.g. the current failed match)
        const previousGroupId = campaign.cbagenttoolsGroupId;
        const autoExclude = previousGroupId ? [previousGroupId] : [];
        const excluded = new Set([...autoExclude, ...excludeGroupIds]);
        const inventory = excluded.size > 0
            ? allInventory.filter((item) => !excluded.has(item.groupId))
            : allInventory;

        if (inventory.length === 0) {
            return NextResponse.json(
                { success: false, error: 'No eligible inventory after exclusions. Re-scrape CB deals or broaden the search.' },
                { status: 422 },
            );
        }

        const match = matchGroupInventoryToCampaign(campaign, inventory);
        if (!match) {
            return NextResponse.json(
                {
                    success: false,
                    error: `No matching CB inventory found for "${campaign.name}". The current cache (${cacheAgeHours}h old) may not have a suitable sailing — try re-scraping CB deals.`,
                    previousGroupId,
                    cacheAgeHours,
                },
                { status: 422 },
            );
        }

        // Write the new inventory match — upsertCampaignPricingMatch resets pricing
        // fields in place; then reset health state so Phase B treats it as fresh.
        await upsertCampaignPricingMatch(slug, match);
        await updateCampaignInventoryMode(slug, 'GROUP_BLOCK_ACTIVE', 'UNVERIFIED');

        const updated = await getCampaignBlueprint(slug);

        console.log(
            `[rematch] "${slug}" rematched: ${previousGroupId ?? 'none'} → ${match.cbGroupId} (${match.matchedShipName} ${match.matchedSailDate}, score ${match.matchScore})`,
        );

        return NextResponse.json({
            success: true,
            previousGroupId,
            newGroupId: match.cbGroupId,
            matchedShipName: match.matchedShipName,
            matchedSailDate: match.matchedSailDate,
            matchScore: match.matchScore,
            cacheAgeHours,
            campaign: updated,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[rematch] Error for "${slug}":`, error);
        return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
}
