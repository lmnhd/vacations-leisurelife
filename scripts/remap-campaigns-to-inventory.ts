/**
 * scripts/remap-campaigns-to-inventory.ts
 *
 * Remaps existing campaign `shipTarget` fields to real CB group inventory ships
 * using GPT-4o-mini — no new Perplexity calls needed.
 *
 * Usage:
 *   npx tsx scripts/remap-campaigns-to-inventory.ts
 *   npx tsx scripts/remap-campaigns-to-inventory.ts --slug norwegian-arcade-revival-2026
 *
 * Each campaign gets: new shipTarget, updated vendor, updated targetDates (if sail dates available)
 */

import { config } from 'dotenv'; config(); config({ path: '.env.local' });
import * as fs from 'fs';
import * as path from 'path';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import OpenAI from 'openai';

// ─── Types ───────────────────────────────────────────────────────────────────

type Campaign = {
    PK: string;
    SK: string;
    id: string;
    name: string;
    description: string;
    aesthetic?: string;
    shipTarget?: string;
    targetDates?: string;
    targetingKeywords?: string[];
};

type CbInventoryItem = {
    groupId: string;
    shipName: string;
    vendor: string;
    sailDate: string;
    startingPrice: string;
    priceAdvantage: string;
};

type RemapResult = {
    campaignId: string;
    newShipTarget: string;
    newVendor: string;
    newTargetDates: string;
    reasoning: string;
};

// ─── AWS Setup ────────────────────────────────────────────────────────────────

const TABLE_NAME = 'lll-shadow-campaigns';
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({
    region: process.env.AWS_REGION ?? 'us-east-1',
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function scanAllCampaigns(): Promise<Campaign[]> {
    const result = await dynamo.send(new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: 'SK = :sk',
        ExpressionAttributeValues: { ':sk': 'METADATA' },
    }));
    return (result.Items ?? []) as Campaign[];
}

async function updateCampaignShipTarget(
    campaignId: string,
    shipTarget: string,
    vendor: string,
    targetDates: string
): Promise<void> {
    await dynamo.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: `CAMPAIGN#${campaignId}`, SK: 'METADATA' },
        UpdateExpression: 'SET shipTarget = :ship, #vendor = :vendor, targetDates = :dates, pricingStatus = :status, updatedAt = :now',
        ExpressionAttributeNames: { '#vendor': 'vendor' },
        ExpressionAttributeValues: {
            ':ship': shipTarget,
            ':vendor': vendor,
            ':dates': targetDates,
            ':status': 'AI_ESTIMATE', // Reset so Phase B re-processes this campaign
            ':now': new Date().toISOString(),
        },
    }));
}

function loadCbInventory(): CbInventoryItem[] {
    const cachePath = path.join(process.cwd(), '.github', 'data', 'cb-deals-cache.json');
    if (!fs.existsSync(cachePath)) {
        console.error('[remap] cb-deals-cache.json not found — run scrape-cb-deals.ts first.');
        process.exit(1);
    }
    const raw = JSON.parse(fs.readFileSync(cachePath, 'utf-8')) as { priceAdvantages: CbInventoryItem[] };
    // Deduplicate by ship name, prefer items with sail date info
    const seen = new Set<string>();
    return raw.priceAdvantages.filter(item => {
        if (!item.shipName || !item.vendor) return false;
        if (seen.has(item.shipName)) return false;
        seen.add(item.shipName);
        return true;
    });
}

// ─── GPT Remap ───────────────────────────────────────────────────────────────

async function remapWithGpt(
    campaign: Campaign,
    inventory: CbInventoryItem[]
): Promise<RemapResult> {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const inventoryList = inventory.map(item =>
        `- ${item.shipName} (${item.vendor})${item.sailDate ? ' | ' + item.sailDate : ''}`
    ).join('\n');

    const prompt = {
        task: 'Match this campaign to the best available CB group inventory ship.',
        campaign: {
            id: campaign.id,
            name: campaign.name,
            description: campaign.description,
            aesthetic: campaign.aesthetic ?? 'unknown',
            currentShipTarget: campaign.shipTarget ?? 'none',
            targetingKeywords: campaign.targetingKeywords ?? [],
        },
        availableInventory: inventory.map(item => ({
            shipName: item.shipName,
            vendor: item.vendor,
            sailDate: item.sailDate || null,
        })),
        instructions: [
            'Pick the single best ship from availableInventory that would resonate with this campaign theme and aesthetic.',
            'Consider: ship size (smaller = more intimate for niche), cruise line brand image, itinerary if shown.',
            'Norwegian, Celebrity, Royal Caribbean = best for active/social/party themes.',
            'Celebrity = premium, design-forward, culinary — good for aesthetic/artsy themes.',
            'Return ONLY valid JSON matching the output schema.',
        ],
        outputSchema: {
            newShipTarget: 'exact ship name from availableInventory',
            newVendor: 'exact vendor string from availableInventory',
            newTargetDates: 'best target date from sailDate if available, else keep current or use "2026-2027"',
            reasoning: 'one sentence why this ship fits',
        },
    };

    const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: JSON.stringify(prompt) }],
        response_format: { type: 'json_object' },
        temperature: 0.3,
    });

    const parsed = JSON.parse(response.choices[0].message.content ?? '{}') as RemapResult;
    return { ...parsed, campaignId: campaign.id };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
    const slugArg = process.argv.includes('--slug')
        ? process.argv[process.argv.indexOf('--slug') + 1]
        : null;

    console.log('─── Campaign Ship Remapper ───');

    const inventory = loadCbInventory();
    console.log(`[remap] Loaded ${inventory.length} unique CB inventory ships.`);

    let campaigns = await scanAllCampaigns();
    if (slugArg) {
        campaigns = campaigns.filter(c => c.id === slugArg);
        if (campaigns.length === 0) {
            console.error(`[remap] No campaign found with slug: ${slugArg}`);
            process.exit(1);
        }
    }
    console.log(`[remap] Processing ${campaigns.length} campaign(s)...`);

    for (const campaign of campaigns) {
        try {
            const result = await remapWithGpt(campaign, inventory);
            await updateCampaignShipTarget(
                campaign.id,
                result.newShipTarget,
                result.newVendor,
                result.newTargetDates
            );
            console.log(`✅ [${campaign.id}]`);
            console.log(`   ${campaign.shipTarget ?? 'none'} → ${result.newShipTarget} (${result.newVendor})`);
            console.log(`   Dates: ${result.newTargetDates}`);
            console.log(`   Reason: ${result.reasoning}`);
        } catch (err) {
            console.error(`❌ [${campaign.id}] Failed:`, err instanceof Error ? err.message : err);
        }
    }

    console.log('\n─── Done. Now run Phase B to match the updated campaigns. ───');
}

main().catch(err => {
    console.error('[remap] Fatal error:', err);
    process.exit(1);
});
