import { z } from 'zod';
import { callGlobalGenerateObject } from '@/lib/chat/llm-call';
import { Campaign } from '@/lib/campaigns/types';
import { saveCampaignBlueprint, getCampaignBlueprint, scanAllCampaigns } from '@/lib/campaigns/campaign-store';

const PerplexityResponseSchema = z.object({
    choices: z.array(
        z.object({
            message: z.object({
                content: z.string(),
            }),
        })
    ),
});

async function callPerplexity(prompt: string): Promise<string> {
    const apiKey = process.env.PERPLEXITY_API_KEY;
    if (!apiKey) {
        throw new Error('Missing PERPLEXITY_API_KEY environment variable.');
    }

    const response = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: 'sonar-deep-research',
            messages: [
                {
                    role: 'user',
                    content: prompt,
                },
            ],
            temperature: 0.2, // Low temp for more factual/focused answers
        }),
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

    return result;
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
    // Pre-load existing campaigns to build the deduplication exclusion list
    const existingCampaigns = await scanAllCampaigns();
    const existingThemesBlock = existingCampaigns.length > 0
        ? `\n\nIMPORTANT: The following theme niches have already been created and must NOT be suggested again — choose entirely different communities and aesthetics:\n${existingCampaigns.map(c => `- ${c.name} (${c.aesthetic ?? c.id})`).join('\n')}`
        : '';

    console.log(`[runGroupDiscoveryPipeline] ${existingCampaigns.length} existing campaign(s) found — injecting exclusion list into prompts.`);

    console.log('[runGroupDiscoveryPipeline] Step 1: Psychographic Discovery');
    const psychographicPrompt = `
Analyze current community growth and sentiment for niche subcultures discussing 'digital burnout,' 'IRL meetups,' or 'aesthetic retreats.' Identify 5 high-engagement communities with a high willingness to spend and a specific, ownable aesthetic (e.g., Solar-punk, Dark Academia, Biohacking, Retro-Gaming). For each, explain why a 4-day 'controlled environment' like a cruise would resonate.${existingThemesBlock}
    `.trim();
    const psychographicData = await callPerplexity(psychographicPrompt);

    console.log('[runGroupDiscoveryPipeline] Step 2: Aesthetic Gap Follow-up');
    const aestheticPrompt = `
Based on the following subcultures we identified:
${psychographicData}

For each theme retreat, what onboard amenities are most requested? Now cross-reference which cruise lines — focus on ships with newer fleet builds — already have that infrastructure without requiring a full-scale custom arrangement.
    `.trim();
    const aestheticData = await callPerplexity(aestheticPrompt);

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
