import { z } from 'zod';
import { callGlobalGenerateObject } from '@/lib/chat/llm-call';
import { ModelName } from '@/lib/ai/llm-gateway';
import { Campaign } from '@/lib/campaigns/types';
import { getAestheticBrief, saveCampaignBlueprint, getCampaignBlueprint, scanAllCampaigns } from '@/lib/campaigns/campaign-store';
import { DiscoveryBlueprintBatchSchema, mapDiscoveryBlueprintToCampaign } from '@/lib/campaigns/discovery-schema';
import {
    assertLaunchWindowCompliance,
    buildLaunchWindowPromptGuidance,
    getLaunchWindowAssessment,
    getLaunchWindowPolicy,
} from '@/lib/campaigns/launch-window';
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

const DISCOVERY_PROMPT_VERSION = '2026-03-15-launch-window-v2';

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
function buildCbInventoryContext(now: Date = new Date()): string {
    if (!existsSync(CB_DEALS_CACHE_FILE)) return '';
    try {
        const raw = readFileSync(CB_DEALS_CACHE_FILE, 'utf-8');
        const cache = JSON.parse(raw) as CbDealsCache;
        const policy = getLaunchWindowPolicy(now);
        const seenShipDates = new Set<string>();
        let omittedTooCloseCount = 0;

        const ships = cache.priceAdvantages
            .filter((group) => group.shipName && group.vendor && group.sailDate)
            .filter((group) => {
                const assessment = getLaunchWindowAssessment({ matchedSailDate: group.sailDate }, now);
                if (assessment.meetsMinimumLeadTime === false) {
                    omittedTooCloseCount += 1;
                    return false;
                }

                const dedupeKey = `${group.shipName.toLowerCase()}::${group.sailDate.toLowerCase()}`;
                if (seenShipDates.has(dedupeKey)) {
                    return false;
                }

                seenShipDates.add(dedupeKey);
                return true;
            })
            .sort((left, right) => left.sailDate.localeCompare(right.sailDate))
            .slice(0, 30)
            .map((group) => `- ${group.shipName} (${group.vendor}): ${group.sailDate}`);

        if (ships.length === 0) {
            return `\n\nAVAILABLE CB GROUP INVENTORY: no sailings in the current cache clear the ${policy.minimumLeadDays}-day minimum lead time. Do not invent closer dates.`;
        }

        return `\n\nAVAILABLE CB GROUP INVENTORY (real bookable ship blocks — your blueprints MUST target one of these exact ship/date pairs):\n${ships.join('\n')}\n\nOmitted from the prompt as too close to launch: ${omittedTooCloseCount} sailing(s) inside ${policy.minimumLeadDays} days. Do not use omitted sailings or invent earlier dates.`;
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

interface DiscoveryPipelineResult {
    campaigns: Campaign[];
    skippedCount: number;
    sonarResearch: {
        psychographic: string;
        aesthetic: string;
    };
}

interface DiscoveryPipelineOptions {
    respin?: boolean;
}

type PriorCampaignContext = {
    campaign: Campaign;
    brief: Awaited<ReturnType<typeof getAestheticBrief>>;
    verdict: 'pass' | 'warn' | 'block' | null;
    reviewSource: 'discovery-red-team' | 'aesthetic-red-team' | null;
};

function buildExistingThemesBlock(existingCampaigns: Campaign[]): string {
    if (existingCampaigns.length === 0) {
        return '';
    }

    return `\n\nIMPORTANT: The following theme niches have already been created and must NOT be suggested again — choose entirely different communities and aesthetics:\n${existingCampaigns.map(c => `- ${c.name} (${c.aesthetic ?? c.id})`).join('\n')}`;
}

function buildApprovedCandidatesBlock(priorCampaigns: PriorCampaignContext[]): string {
    const approved = priorCampaigns.filter((item) => item.verdict === 'pass');
    if (approved.length === 0) {
        return '';
    }

    return `\n\nAPPROVED DISCOVERY CANDIDATES ALREADY IN PIPELINE:
${approved.map(({ campaign }) => `- ${campaign.name} (${campaign.aesthetic ?? campaign.id})`).join('\n')}

Treat these as viable candidates already preserved in the pipeline. Do not spend the re-spin trying to replace them. Generate additional options only when they are meaningfully distinct in community type, ship behavior, and social mechanism.`;
}

function buildCorrectiveThemesBlock(priorCampaigns: PriorCampaignContext[]): string {
    const corrective = priorCampaigns.filter((item) => item.verdict !== 'pass');
    if (corrective.length === 0) {
        return '';
    }

    return `\n\nIMPORTANT: The following existing discovery candidates are still unresolved and should not be repeated in near-identical form during this re-spin:\n${corrective.map(({ campaign }) => {
        const iterationNote = campaign.discoveryIteration?.retiredAt
            ? 'RETIRED AFTER STAGNATION'
            : campaign.discoveryIteration?.recommendedNextAction === 'operator_cleanup'
                ? 'OPERATOR CLEANUP REQUIRED'
            : campaign.discoveryIteration?.recommendedNextAction === 'branch'
                ? 'STAGNANT - BRANCH REQUIRED'
                : 'UNRESOLVED';
        return `- ${campaign.name} (${campaign.aesthetic ?? campaign.id}) [${iterationNote}]`;
    }).join('\n')}`;
}

async function loadPriorCampaignContext(existingCampaigns: Campaign[]): Promise<PriorCampaignContext[]> {
    const priorBriefs = await Promise.all(existingCampaigns.map(async (campaign) => {
        const brief = await getAestheticBrief(campaign.id).catch(() => null);
        const discoveryReview = campaign.discoveryRedTeamReview;
        const fallbackReview = brief?.redTeamReview;
        return {
            campaign,
            brief,
            verdict: discoveryReview?.verdict ?? fallbackReview?.verdict ?? null,
            reviewSource: discoveryReview ? 'discovery-red-team' : fallbackReview ? 'aesthetic-red-team' : null,
        } satisfies PriorCampaignContext;
    }));

    return priorBriefs;
}

async function buildDiscoveryRespinFeedback(priorCampaigns: PriorCampaignContext[]): Promise<string> {
    if (priorCampaigns.length === 0) {
        return '';
    }

    const lines = priorCampaigns
        .filter(({ verdict }) => verdict !== 'pass')
        .map(({ campaign, brief, verdict, reviewSource }) => {
        const activeReview = campaign.discoveryRedTeamReview ?? brief?.redTeamReview;
        const acceptability = verdict === 'pass'
            ? 'ACCEPTABLE REFERENCE'
            : verdict === 'warn' || verdict === 'block' || brief?.humanReviewStatus === 'revised'
                ? 'NOT ACCEPTABLE'
                : 'UNREVIEWED';
        const topIssues = activeReview?.issues?.slice(0, 3).map((issue) => `${issue.category}: ${issue.title}`).join('; ');
        const requiredFixes = activeReview?.requiredFixes?.slice(0, 2).join('; ');

        return [
            `- ${campaign.name} [${acceptability}]`,
            `  Niche/Aesthetic: ${campaign.aesthetic ?? campaign.id}`,
            `  Summary: ${campaign.description}`,
            campaign.discoveryIteration?.retiredAt ? `  Iteration state: retired (${campaign.discoveryIteration.retirementReason ?? 'repeated non-improvement'})` : '',
            campaign.discoveryIteration?.recommendedNextAction === 'operator_cleanup' ? '  Iteration state: operator cleanup required before another AI pass.' : '',
            campaign.discoveryIteration?.stagnant ? `  Iteration state: stagnant (${campaign.discoveryIteration.stagnationReason ?? 'looping on the same failure pattern'})` : '',
            campaign.discoveryIteration?.recommendedNextAction ? `  Recommended next action: ${campaign.discoveryIteration.recommendedNextAction}` : '',
            campaign.communityFitRationale ? `  Community logic: ${campaign.communityFitRationale}` : '',
            campaign.solitudeRisks?.length ? `  Known solitude risks: ${campaign.solitudeRisks.join('; ')}` : '',
            reviewSource ? `  Review source: ${reviewSource}` : '',
            verdict ? `  Red-team verdict: ${verdict}` : '',
            topIssues ? `  Red-team issues: ${topIssues}` : '',
            requiredFixes ? `  Required fixes: ${requiredFixes}` : '',
        ].filter(Boolean).join('\n');
    }).join('\n');

    if (!lines) {
        return '';
    }

    return `\n\nRE-SPIN FEEDBACK FROM PRIOR DISCOVERY / AESTHETIC RUNS:
You are not starting from zero. Use the prior campaigns below as negative/positive guidance and dig deeper instead of reproducing adjacent findings.

Rules:
- Do not return slight variations of the same quiet, lounge-based, introspective adult cruise theme.
- Avoid repeating the same social mechanism, prop family, or emotional register across new findings.
- Treat NOT ACCEPTABLE campaigns as warning cases whose weaknesses must be actively avoided.
- If a prior result was ACCEPTABLE, you still must not duplicate it; use it only to understand what worked structurally.
- Push for new community clusters, more differentiated visual worlds, and more varied cruise-native behavior patterns.

Prior results:
${lines}`;
}

export async function runGroupDiscoveryPipeline(options: DiscoveryPipelineOptions = {}): Promise<DiscoveryPipelineResult> {
    const { respin = false } = options;
    const now = new Date();
    const cache = respin ? { date: new Date().toISOString().slice(0, 10), promptVersion: DISCOVERY_PROMPT_VERSION } : readResearchCache();

    // Pre-load existing campaigns to build the deduplication exclusion list
    const existingCampaigns = await scanAllCampaigns();
    const priorCampaignContext = respin ? await loadPriorCampaignContext(existingCampaigns) : [];
    const existingThemesBlock = respin ? buildCorrectiveThemesBlock(priorCampaignContext) : buildExistingThemesBlock(existingCampaigns);
    const approvedCandidatesBlock = respin ? buildApprovedCandidatesBlock(priorCampaignContext) : '';
    const respinFeedbackBlock = respin ? await buildDiscoveryRespinFeedback(priorCampaignContext) : '';

    console.log(`[runGroupDiscoveryPipeline] ${existingCampaigns.length} existing campaign(s) found — injecting exclusion list${respin ? ' and re-spin feedback' : ''} into prompts.`);

    // ── Step 1: Psychographic Discovery ──────────────────────────────────────
    let psychographicData: string;
    if (!respin && cache.psychographicData) {
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
    5. Why strangers in this niche would naturally enjoy finding one another at sea without needing a formal program schedule
    6. What low-pressure, drop-in/drop-out group rhythms would make the group feel real without becoming mandatory programming

    Do not optimize for the most intense or industrial niche. Optimize for the best blend of demand, cruise plausibility, laid-back social chemistry, ambient community potential, and ownable aesthetic.${existingThemesBlock}${approvedCandidatesBlock}${respinFeedbackBlock}
        `.trim();
        psychographicData = await callPerplexity(psychographicPrompt);
        cache.psychographicData = psychographicData;
        writeResearchCache(cache);
        console.log('[runGroupDiscoveryPipeline] Step 1: ✅ Saved to cache.');
    }

    // ── Step 2: Aesthetic Gap Follow-up ──────────────────────────────────────
    let aestheticData: string;
    if (!respin && cache.aestheticData) {
        console.log('[runGroupDiscoveryPipeline] Step 2: ✅ Resuming from cache (aestheticData)');
        aestheticData = cache.aestheticData;
    } else {
        const cbInventoryContext = buildCbInventoryContext(now);
        const launchWindowPromptGuidance = buildLaunchWindowPromptGuidance(now);
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
    - why the group version feels emotionally necessary rather than decorative
    - what optional gatherings would make the trip feel socially alive without making it feel scheduled

    ANTI-DRIFT RULE:
    - do not let pastoral, cottagecore, bookish, or slow-living themes collapse into generic luxury hotel language
    - distinguish cozy, handmade, garden, thrifted, analog, and unhurried cues from polished, status-signaling, "quiet luxury" cues
    - if a ship fit relies mainly on words like refined, luxe, elevated, premium, or sophisticated, the match is too generic and needs a more niche-native justification${launchWindowPromptGuidance}${cbInventoryContext}${approvedCandidatesBlock}${respinFeedbackBlock}
        `.trim();
        aestheticData = await callPerplexity(aestheticPrompt);
        cache.aestheticData = aestheticData;
        writeResearchCache(cache);
        console.log('[runGroupDiscoveryPipeline] Step 2: ✅ Saved to cache.');
    }

    console.log('[runGroupDiscoveryPipeline] Step 3: Generating Structured Blueprints via OpenAI (gpt-5)');
    const launchWindowPromptGuidance = buildLaunchWindowPromptGuidance(now);
    const { object } = await callGlobalGenerateObject({
        schema: DiscoveryBlueprintBatchSchema,
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
9. communityFitRationale: Prove that the group version matters socially; explain why people in this niche would naturally enjoy finding one another on a ship.
10. optionalGatheringMoments: Name 3-5 low-pressure, drop-in/drop-out gatherings or rhythms that make the group feel real without turning it into a program schedule.
11. optionalityStyle: Explain how participation should be framed so the trip remains welcoming to introverts, casual participants, and guests who do not want a packed schedule.
12. solitudeRisks: Name 3-5 ways the campaign could drift into loneliness, exclusivity theater, or socially hollow quiet-luxury framing if handled poorly.

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
- joining when it feels right and stepping away without feeling they are missing the point of the trip

WORDING GUARDRAILS:
- avoid generic luxury-signaling descriptors unless luxury is itself the niche
- for pastoral, cottagecore, or slow-living concepts, prefer language like unhurried, handmade, garden, tea, deck reading, market strolls, pressed flowers, natural textures, and shared quiet rituals
- avoid aesthetic labels that flatten the niche into upscale sameness, especially phrases like quiet luxury, elevated escape, or low-key luxe
- avoid making the group feel either over-programmed or emotionally empty; the sweet spot is ambient community, optional gatherings, and easy social recognition

RE-SPIN RULE:
- if prior outputs exist, actively differentiate from them in community type, emotional register, onboard behavior pattern, prop logic, and visual world instead of returning near neighbors

DATE OUTPUT RULES:
${launchWindowPromptGuidance}
- targetDates must be copied as a real, parseable sailing date when the research references eligible CB inventory.
- Never choose a sailing that is merely thematic; it must remain compatible with the launch-window rule.

Ensure each blueprint is highly specific, aspirational, and contains all required fields.${existingThemesBlock}${approvedCandidatesBlock}${respinFeedbackBlock}
        `.trim(),
    });

    assertLaunchWindowCompliance(
        object.blueprints.map((blueprint) => ({
            id: blueprint.id,
            name: blueprint.name,
            targetDates: blueprint.targetDates,
        })),
        now,
    );

    console.log('[runGroupDiscoveryPipeline] Step 4: Saving Blueprints to DynamoDB (with idempotency check)');
    const campaigns: Campaign[] = object.blueprints.map((bp) => mapDiscoveryBlueprintToCampaign(bp));

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
