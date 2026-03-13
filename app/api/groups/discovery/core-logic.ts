import { z } from 'zod';
import { callGlobalGenerateObject } from '@/lib/chat/llm-call';
import { ModelName } from '@/lib/ai/llm-gateway';
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
    promptVersion?: string;
    psychographicData?: string;
    aestheticData?: string;
};

const DISCOVERY_PROMPT_VERSION = '2026-03-09-cottagecore-grounding';

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
    if (!existsSync(CACHE_FILE)) return { date: today, promptVersion: DISCOVERY_PROMPT_VERSION };
    try {
        const raw = readFileSync(CACHE_FILE, 'utf-8');
        const parsed = JSON.parse(raw) as ResearchCache;
        if (parsed.date !== today) return { date: today, promptVersion: DISCOVERY_PROMPT_VERSION };
        if (parsed.promptVersion !== DISCOVERY_PROMPT_VERSION) {
            return { date: today, promptVersion: DISCOVERY_PROMPT_VERSION };
        }
        return parsed;
    } catch {
        return { date: today, promptVersion: DISCOVERY_PROMPT_VERSION };
    }
}

function writeResearchCache(cache: ResearchCache): void {
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(CACHE_FILE, JSON.stringify({ ...cache, promptVersion: DISCOVERY_PROMPT_VERSION }, null, 2), 'utf-8');
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

const CRUISE_REALISM_GOVERNING_PRINCIPLE = 'A valid group cruise theme must feel like a desirable vacation first, and only secondarily like a niche identity expression.';

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
        targetDestination: z.string().describe("Primary route or destination region, e.g. 'Greek Isles' or 'Western Caribbean'"),
        shipTarget: z.string().describe("Target cruise line or ship class"),
        highlightEvents: z.array(z.string()).describe("List of suggested activities or meetups (3-5 items)"),
        targetingKeywords: z.array(z.string()).describe("List of targeting keywords for ads (3-5 items)"),
        minCabinsRequired: z.number().describe("Default to 8"),
        startingPrice: z.number().describe("Estimated starting price (use 1000 if unknown)"),
        priceSource: z.string().describe("Source of the price, e.g. 'AI Estimate'"),
        // ─── Research Intelligence (required) ───────────────────────
        researchRationale: z.string().describe(
            "Why this niche was selected: reference the specific community data, platform signals, or trend observations from the research that identified this theme as viable. Be specific — name subreddits, hashtag metrics, Discord server sizes, etc."
        ),
        successLogic: z.string().describe(
            "The commercial and psychological reasoning this niche+cruise pairing will convert: explain audience spending willingness, the IRL meetup pull factor, what market gap this fills, and why a relaxed cruise vacation is uniquely suited to this community."
        ),
        audienceSignals: z.array(z.string()).min(2).max(4).describe(
            "2-4 concrete, specific data signals from the research that validate this niche. Each should be a single-sentence fact, e.g. 'r/solotravel recorded 15k+ upvotes on an IRL meetup thread in Jan 2026', or 'TikTok #darkacademia has 3.2B views with >60% Gen-Z engagement'."
        ),
        vacationFitRationale: z.string().describe(
            "Explain why this theme feels like a great cruise vacation rather than a retreat, workshop, residency, lab, or conference."
        ),
        cruiseNativeMoments: z.array(z.string()).min(3).max(5).describe(
            "3-5 believable cruise-native moments that make this theme feel enjoyable on a ship, such as deck conversations, listening sessions, scenic hobby practice, sunset mixers, or relaxed themed rituals."
        ),
        nicheExpressionMode: z.string().describe(
            "Describe how the niche should show up lightly and pleasantly during the cruise, as a social flavor layer rather than the operational center of the trip."
        ),
        implausibleLiteralizations: z.array(z.string()).min(3).max(5).describe(
            "3-5 examples of how this theme should NOT be expressed because they would feel too industrial, clinical, workshop-like, academic, or operationally awkward on a cruise."
        ),
        allowedThemeSignals: z.array(z.string()).min(3).max(6).describe(
            "Lightweight aesthetic or behavioral cues that are good to use when expressing the theme on a cruise, such as clothing, props, rituals, music, decor, or conversational energy."
        ),
        discouragedThemeSignals: z.array(z.string()).min(3).max(6).describe(
            "Signals, props, environments, or programming cues that would make the theme feel too formal, technical, or unrealistic for a cruise vacation."
        ),
    })).length(5, "Must provide exactly 5 blueprints")
});

interface DiscoveryPipelineResult {
    campaigns: Campaign[];
    skippedCount: number;
    sonarResearch: {
        psychographic: string;
        aesthetic: string;
    };
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
    You are researching niche communities for a vacation-first group cruise business.

    ${CRUISE_REALISM_GOVERNING_PRINCIPLE}

    Identify 5 high-engagement niche communities whose identity can be expressed through a relaxed, sociable, hobby-forward cruise vacation.

    Prioritize communities that are:
    - hobby-centric, taste-centric, fandom-driven, aesthetic-led, or socially expressive
    - compatible with low-pressure mingling, scenic exploration, shared rituals, listening, reading, creating, collecting, or playful participation
    - likely to enjoy an all-in-one floating getaway with built-in social energy
    - visually distinctive without requiring heavy gear, lab spaces, formal instruction, or structured productivity

    IMPORTANT AESTHETIC FILTER:
    - do not substitute broad luxury-travel language for the actual niche identity
    - "quiet luxury," "elevated escape," "refined sophistication," and "wellness getaway" are not niches by themselves
    - when evaluating slow-living, pastoral, bookish, or cozy communities, prefer handmade warmth, tactile rituals, scenic softness, casual social rituals, and modest beauty over status-signaling luxury cues
    - if a theme only sounds compelling after being translated into generic upscale travel language, reject it

    Explicitly avoid communities whose appeal depends on:
    - clinical or diagnostic culture
    - optimization protocols
    - professional advancement
    - formal workshops or masterclasses as the core attraction
    - industrial systems, activist labor, or technical infrastructure demos
    - gear-heavy practice that would feel awkward, unsafe, or unrealistic on a cruise ship

    For each community, explain:
    1. Why the niche has strong market momentum and spend willingness
    2. Why it would feel natural in a relaxed shipboard vacation environment
    3. What the cruise-native appeal is: conversation, discovery, music, scenic participation, hobby bonding, dressing the part, or themed social rituals
    4. What would make the niche feel too formal, technical, or retreat-like if interpreted too literally

    Do not optimize for the most intense or industrial niche. Optimize for the best blend of demand, cruise plausibility, laid-back social chemistry, and ownable aesthetic.${existingThemesBlock}
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

    ${CRUISE_REALISM_GOVERNING_PRINCIPLE}

    For each promising theme, analyze it in this order:

    1. What are the most believable cruise-native expressions of this theme?
    2. What guest behaviors, moods, and lightweight rituals make it feel delightful at sea?
    3. What would feel implausible, over-programmed, industrial, clinical, workshop-like, academic, or operationally awkward on a cruise?
    4. Only then, which cruise lines or ships could support the believable version of the theme naturally, without requiring major customization or infrastructure fantasy?

    Focus on:
    - deck life
    - scenic participation
    - lounges and listening spaces
    - dining and gathering rhythms
    - soft hobby rituals
    - port-day exploration
    - social identity and group cohesion

    Do not focus primarily on:
    - equipment rooms
    - formal classrooms
    - lab infrastructure
    - treatment suites
    - maker residencies
    - workshop stations
    - technical demonstration areas

    For each theme, return insight on:
    - cruise-native moments
    - niche-enhanced moments
    - plausible props or aesthetic signals
    - discouraged literalizations
    - best-fit ship environments
    - why the concept still feels like a great vacation even if the guest only lightly participates in the niche

    ANTI-DRIFT RULE:
    - do not let pastoral, cottagecore, bookish, or slow-living themes collapse into generic luxury hotel language
    - distinguish cozy, handmade, garden, thrifted, analog, and unhurried cues from polished, status-signaling, "quiet luxury" cues
    - if a ship fit relies mainly on words like refined, luxe, elevated, premium, or sophisticated, the match is too generic and needs a more niche-native justification${cbInventoryContext}
        `.trim();
        aestheticData = await callPerplexity(aestheticPrompt);
        cache.aestheticData = aestheticData;
        writeResearchCache(cache);
        console.log('[runGroupDiscoveryPipeline] Step 2: ✅ Saved to cache.');
    }

    console.log('[runGroupDiscoveryPipeline] Step 3: Generating Structured Blueprints via OpenAI (gpt-5)');
    const { object } = await callGlobalGenerateObject({
        schema: ThemeBlueprintSchema,
        modelName: ModelName.GPT_5_HIGH,
        prompt: `
You are an expert Cruise Campaign Strategist with deep knowledge of niche subcultures and community marketing. Review the following Perplexity Sonar Deep Research regarding niche subcultures and ship infrastructure:

Research Data:
${aestheticData}

Write a structured JSON detailing exactly 5 fully vetted, high-value Theme Cruise Blueprints based on this research.

CRITICAL REQUIREMENTS for each blueprint:
1. researchRationale: Cite SPECIFIC findings from the research above — name the exact communities, subreddits, hashtags, or metrics the Sonar data surfaced. Do not generalise.
2. successLogic: Explain the commercial + psychological case for why this niche will convert to bookings. Include spend willingness signals, the IRL pull factor, and what market gap this fills.
3. audienceSignals: Provide 2-4 concrete, specific data points directly from the research (with platform, metric, and date context where available).
4. vacationFitRationale: Prove that this concept feels like a desirable cruise vacation, not a retreat, class, residency, lab, or conference.
5. cruiseNativeMoments: Name 3-5 believable shipboard moments that make the theme feel pleasurable and cruise-native.
6. nicheExpressionMode: Explain how the niche acts as a social flavor layer rather than the operational center of the trip.
7. implausibleLiteralizations: Name 3-5 ways this theme should not be interpreted because they would feel too workshop-like, industrial, clinical, or unrealistic on a ship.
8. allowedThemeSignals and discouragedThemeSignals must clearly separate lightweight, vacation-friendly cues from overly formal or technical cues.

NON-NEGOTIABLE REALISM BOUNDARY:
${CRUISE_REALISM_GOVERNING_PRINCIPLE}

Reject any blueprint that primarily reads like:
- a field lab
- a clinical retreat
- a formal workshop sailing
- a residency program
- a conference at sea
- an activist or systems project installed onto a ship

Prefer blueprints where the guest fantasy is:
- mingling with their people
- dressing into a shared vibe
- listening, exploring, tasting, observing, reading, collecting, photographing, or playing together
- enjoying the ship and destination first, with the niche amplifying the mood

WORDING GUARDRAILS:
- avoid generic luxury-signaling descriptors unless luxury is itself the niche
- for pastoral, cottagecore, or slow-living concepts, prefer language like unhurried, handmade, garden, tea, deck reading, market strolls, pressed flowers, natural textures, and shared quiet rituals
- avoid aesthetic labels that flatten the niche into upscale sameness, especially phrases like quiet luxury, elevated escape, or low-key luxe

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
            targetDestination: bp.targetDestination,
            shipTarget: bp.shipTarget,
            highlightEvents: bp.highlightEvents,
            targetingKeywords: bp.targetingKeywords,
            minCabinsRequired: bp.minCabinsRequired,
            startingPrice: bp.startingPrice,
            priceSource: bp.priceSource,
            researchRationale: bp.researchRationale,
            successLogic: bp.successLogic,
            audienceSignals: bp.audienceSignals,
            vacationFitRationale: bp.vacationFitRationale,
            cruiseNativeMoments: bp.cruiseNativeMoments,
            nicheExpressionMode: bp.nicheExpressionMode,
            implausibleLiteralizations: bp.implausibleLiteralizations,
            allowedThemeSignals: bp.allowedThemeSignals,
            discouragedThemeSignals: bp.discouragedThemeSignals,
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

    return {
        campaigns,
        skippedCount,
        sonarResearch: {
            psychographic: psychographicData,
            aesthetic: aestheticData,
        },
    };
}
