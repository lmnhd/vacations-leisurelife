import { z } from 'zod';
import { callGlobalGenerateObject } from '@/lib/chat/llm-call';
import { Campaign } from '@/lib/campaigns/types';
import { saveCampaignBlueprint, getCampaignBlueprint, scanAllCampaigns } from '@/lib/campaigns/campaign-store';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';

// ─── Research Cache ─────────────────────────────────────────────────────────
// Persists each Perplexity step result to disk so a mid-pipeline failure can
// resume without re-paying for completed steps. Cache key = YYYY-MM-DD.
// Delete .github/data/discovery-research-cache.json to force a fresh run.

const CACHE_DIR = path.join(process.cwd(), '.github', 'data');
const CACHE_FILE = path.join(CACHE_DIR, 'discovery-research-cache.json');
const CB_DEALS_CACHE_FILE = path.join(CACHE_DIR, 'cb-deals-cache.json');

type ResearchCache = {
    date: string;
    psychographicData?: string;
    aestheticData?: string;
};

type CbDealsCache = {
    generatedAtIso: string;
    priceAdvantages: Array<{
        groupId: string;
        shipName: string;
        vendor: string;
        sailDate: string;
    }>;
};

function readResearchCache(): ResearchCache {
    const today = new Date().toISOString().slice(0, 10);
    if (!existsSync(CACHE_FILE)) return { date: today };
    try {
        const raw = readFileSync(CACHE_FILE, 'utf-8');
        const parsed = JSON.parse(raw) as ResearchCache;
        if (parsed.date !== today) return { date: today };
        return parsed;
    } catch {
        return { date: today };
    }
}

function writeResearchCache(cache: ResearchCache): void {
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf-8');
}

/**
 * Reads the CB deals cache and builds a concise ship inventory string for AI prompts.
 * Returns empty string if cache file doesn't exist — graceful degradation.
 */
function buildCbInventoryContext(): string {
    if (!existsSync(CB_DEALS_CACHE_FILE)) return '';
    try {
        const raw = readFileSync(CB_DEALS_CACHE_FILE, 'utf-8');
        const cache = JSON.parse(raw) as CbDealsCache;
        const ships = cache.priceAdvantages
            .filter(g => g.shipName && g.vendor)
            .map(g => `- ${g.shipName} (${g.vendor})${g.sailDate ? ': ' + g.sailDate : ''}`)
            // Deduplicate by ship name
            .filter((line, idx, arr) => arr.findIndex(l => l.startsWith(line.split('(')[0])) === idx)
            .slice(0, 20); // cap to keep prompt size sane

        if (ships.length === 0) return '';

        return `\n\nAVAILABLE CB GROUP INVENTORY (real bookable ship blocks — your blueprints MUST target one of these ships):\n${ships.join('\n')}`;
    } catch {
        return '';
    }
}

const PerplexityResponseSchema = z.object({
    choices: z.array(
        z.object({
            message: z.object({
                content: z.string(),
            }),
        })
    ),
});

async function callPerplexity(prompt: string, attempt: number = 1): Promise<string> {
    const apiKey = process.env.PERPLEXITY_API_KEY;
    if (!apiKey) {
        throw new Error('Missing PERPLEXITY_API_KEY environment variable.');
    }

    const MAX_ATTEMPTS = 3;
    const controller = new AbortController();
    // Hard cap: 10 minutes per call (sonar-deep-research is slow)
    const timeoutId = setTimeout(() => controller.abort(), 10 * 60 * 1000);

    try {
        console.log(`[callPerplexity] Attempt ${attempt}/${MAX_ATTEMPTS}...`);
        const response = await fetch('https://api.perplexity.ai/chat/completions', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'Connection': 'keep-alive',
            },
            body: JSON.stringify({
                model: 'sonar-deep-research',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.2,
            }),
            signal: controller.signal,
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`Perplexity request failed (${response.status}): ${errorBody}`);
        }

        const parsedResponse = PerplexityResponseSchema.parse(await response.json());
        const result = parsedResponse.choices[0]?.message.content?.trim();
        if (!result) {
            throw new Error('Perplexity returned an empty research response.');
        }

        console.log(`[callPerplexity] ✅ Response received (attempt ${attempt}).`);
        return result;

    } catch (error) {
        const isRetryable = error instanceof Error && (
            error.message.includes('ECONNRESET') ||
            error.message.includes('ECONNREFUSED') ||
            error.message.includes('fetch failed') ||
            error.name === 'AbortError'
        );

        if (isRetryable && attempt < MAX_ATTEMPTS) {
            const delayMs = attempt * 5000; // 5s, 10s backoff
            console.warn(`[callPerplexity] Retryable error on attempt ${attempt}: ${error instanceof Error ? error.message : 'unknown'}. Retrying in ${delayMs / 1000}s...`);
            await new Promise(resolve => setTimeout(resolve, delayMs));
            return callPerplexity(prompt, attempt + 1);
        }

        throw error;
    } finally {
        clearTimeout(timeoutId);
    }
}


const ThemeBlueprintSchema = z.object({
    blueprints: z.array(z.object({
        id: z.string().describe("A url-friendly slug for the campaign, e.g. 'retro-gaming-2026'"),
        name: z.string().describe("Display name for the Theme/Campaign"),
        description: z.string().describe("Short promotional description"),
        aesthetic: z.string().describe("The aesthetic or vibe of the campaign"),
        targetDates: z.string().describe("Planned departure dates, e.g. 'November 2026'"),
        shipTarget: z.string().describe("Target cruise line or ship class"),
        highlightEvents: z.array(z.string()).describe("List of suggested activities or meetups (3-5 items)"),
        targetingKeywords: z.array(z.string()).describe("List of targeting keywords for ads (3-5 items)"),
        minCabinsRequired: z.number().describe("Default to 8"),
        startingPrice: z.number().describe("Estimated starting price (use 1000 if unknown)"),
        priceSource: z.string().describe("Source of the price, e.g. 'AI Estimate'")
    })).length(5, "Must provide exactly 5 blueprints")
});

interface DiscoveryPipelineResult {
    campaigns: Campaign[];
    skippedCount: number;
}

export async function runGroupDiscoveryPipeline(): Promise<DiscoveryPipelineResult> {
    const cache = readResearchCache();

    // Pre-load existing campaigns to build the deduplication exclusion list
    const existingCampaigns = await scanAllCampaigns();
    const existingThemesBlock = existingCampaigns.length > 0
        ? `\n\nIMPORTANT: The following theme niches have already been created and must NOT be suggested again — choose entirely different communities and aesthetics:\n${existingCampaigns.map(c => `- ${c.name} (${c.aesthetic ?? c.id})`).join('\n')}`
        : '';

    console.log(`[runGroupDiscoveryPipeline] ${existingCampaigns.length} existing campaign(s) found — injecting exclusion list into prompts.`);

    // ── Step 1: Psychographic Discovery ──────────────────────────────────────
    let psychographicData: string;
    if (cache.psychographicData) {
        console.log('[runGroupDiscoveryPipeline] Step 1: ✅ Resuming from cache (psychographicData)');
        psychographicData = cache.psychographicData;
    } else {
        console.log('[runGroupDiscoveryPipeline] Step 1: Psychographic Discovery');
        const psychographicPrompt = `
Analyze current community growth and sentiment for niche subcultures discussing 'digital burnout,' 'IRL meetups,' or 'aesthetic retreats.' Identify 5 high-engagement communities with a high willingness to spend and a specific, ownable aesthetic (e.g., Solar-punk, Dark Academia, Biohacking, Retro-Gaming). For each, explain why a 4-day 'controlled environment' like a cruise would resonate.${existingThemesBlock}
        `.trim();
        psychographicData = await callPerplexity(psychographicPrompt);
        cache.psychographicData = psychographicData;
        writeResearchCache(cache);
        console.log('[runGroupDiscoveryPipeline] Step 1: ✅ Saved to cache.');
    }

    // ── Step 2: Aesthetic Gap Follow-up ──────────────────────────────────────
    let aestheticData: string;
    if (cache.aestheticData) {
        console.log('[runGroupDiscoveryPipeline] Step 2: ✅ Resuming from cache (aestheticData)');
        aestheticData = cache.aestheticData;
    } else {
        const cbInventoryContext = buildCbInventoryContext();
        if (cbInventoryContext) {
            console.log('[runGroupDiscoveryPipeline] Step 2: CB inventory context loaded from cb-deals-cache.json');
        } else {
            console.warn('[runGroupDiscoveryPipeline] Step 2: No CB deals cache found — run scrape-cb-deals.ts first for inventory-first theming.');
        }

        console.log('[runGroupDiscoveryPipeline] Step 2: Aesthetic Gap Follow-up');
        const aestheticPrompt = `
Based on the following subcultures we identified:
${psychographicData}

For each theme retreat, what onboard amenities are most requested? Now cross-reference which cruise lines — focus on ships with newer fleet builds — already have that infrastructure without requiring a full-scale custom arrangement.${cbInventoryContext}
        `.trim();
        aestheticData = await callPerplexity(aestheticPrompt);
        cache.aestheticData = aestheticData;
        writeResearchCache(cache);
        console.log('[runGroupDiscoveryPipeline] Step 2: ✅ Saved to cache.');
    }

    console.log('[runGroupDiscoveryPipeline] Step 3: Generating Structured Blueprints via OpenAI (gpt-5-mini)');
    const { object } = await callGlobalGenerateObject({
        schema: ThemeBlueprintSchema,
        prompt: `
You are an expert Cruise Campaign Strategist. Review the following deep research regarding niche subcultures and ship infrastructure:

Research Data:
${aestheticData}

Write a structured JSON detailing exactly 5 fully vetted, high-value Theme Cruise Blueprints based on this research.
Ensure each blueprint is highly specific, aspirational, and contains all required fields.${existingThemesBlock}
        `.trim(),
    });

    console.log('[runGroupDiscoveryPipeline] Step 4: Saving Blueprints to DynamoDB (with idempotency check)');
    const campaigns: Campaign[] = object.blueprints.map(bp => {
        const now = new Date().toISOString();
        return {
            PK: `CAMPAIGN#${bp.id}`,
            SK: `METADATA`,
            id: bp.id,
            name: bp.name,
            description: bp.description,
            aesthetic: bp.aesthetic,
            targetDates: bp.targetDates,
            shipTarget: bp.shipTarget,
            highlightEvents: bp.highlightEvents,
            targetingKeywords: bp.targetingKeywords,
            minCabinsRequired: bp.minCabinsRequired,
            startingPrice: bp.startingPrice,
            priceSource: bp.priceSource,
            status: 'DRAFT',
            createdAt: now,
            updatedAt: now
        } as Campaign;
    });

    let skippedCount = 0;
    for (const campaign of campaigns) {
        const existing = await getCampaignBlueprint(campaign.id);
        if (existing) {
            console.warn(`[runGroupDiscoveryPipeline] Campaign "${campaign.id}" already exists — skipping.`);
            skippedCount++;
            continue;
        }
        await saveCampaignBlueprint(campaign);
    }

    return { campaigns, skippedCount };
}
