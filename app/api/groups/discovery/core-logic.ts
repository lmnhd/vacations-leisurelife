import { z } from 'zod';
import { callGlobalGenerateObject } from '@/lib/chat/llm-call';
import { ModelName } from '@/lib/ai/llm-gateway';
import { callGeminiDeepResearch } from '@/lib/ai/gemini-deep-research';
import { Campaign } from '@/lib/campaigns/types';
import { getAestheticBrief, saveCampaignBlueprint, getCampaignBlueprint, scanAllCampaigns } from '@/lib/campaigns/campaign-store';
import { DiscoveryBlueprintBatchSchema, mapDiscoveryBlueprintToCampaign } from '@/lib/campaigns/discovery-schema';
import {
    assertLaunchWindowCompliance,
    buildLaunchWindowPromptGuidance,
    getLaunchWindowAssessment,
    getLaunchWindowViolations,
    getLaunchWindowPolicy,
} from '@/lib/campaigns/launch-window';
import { CbGroupInventoryItem } from '@/lib/campaigns/cb-inventory-types';
import { matchGroupInventoryToCampaign } from '@/lib/campaigns/cb-inventory-matcher';
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
        sailDate: string;      // actually itinerary text, e.g. "7 Night Alaska Inside Passage Cruise"
        startingPrice?: string; // actually departure port code, e.g. "YVR"
        priceAdvantage?: string;
        sourceUrl?: string;
    }>;
};

const CB_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function warnIfCbCacheStale(now: Date = new Date()): void {
    if (!existsSync(CB_DEALS_CACHE_FILE)) {
        console.warn('[discovery] CB deals cache not found — run scrape-cb-deals.ts first.');
        return;
    }
    try {
        const raw = readFileSync(CB_DEALS_CACHE_FILE, 'utf-8');
        const cache = JSON.parse(raw) as CbDealsCache;
        const generatedAt = new Date(cache.generatedAtIso);
        const ageMs = now.getTime() - generatedAt.getTime();
        if (ageMs > CB_CACHE_MAX_AGE_MS) {
            const ageHours = Math.round(ageMs / (60 * 60 * 1000));
            console.warn(`[discovery] CB deals cache is ${ageHours}h old (>24h). Run scrape-cb-deals.ts to refresh inventory before discovery.`);
        }
    } catch {
        console.warn('[discovery] Failed to read CB deals cache for staleness check.');
    }
}

function loadCbInventoryFromCache(): CbGroupInventoryItem[] {
    if (!existsSync(CB_DEALS_CACHE_FILE)) return [];
    try {
        const raw = readFileSync(CB_DEALS_CACHE_FILE, 'utf-8');
        const cache = JSON.parse(raw) as CbDealsCache;
        return cache.priceAdvantages
            .filter((item) => item.groupId && item.shipName)
            .map((item) => ({
                groupId: item.groupId,
                shipName: item.shipName,
                vendor: item.vendor ?? '',
                itinerary: item.sailDate ?? '',    // sailDate column holds itinerary text
                sailDate: '',                      // actual sail date not captured in this cache
                startingPrice: '',
                startingPriceNumber: 0,
                priceAdvantage: item.priceAdvantage ?? '',
                priceAdvantageNumber: Number(item.priceAdvantage) || 0,
                departurePort: item.startingPrice, // startingPrice column holds departure port code
                sourceUrl: item.sourceUrl ?? '',
            }));
    } catch {
        return [];
    }
}

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

    // Pre-load CB inventory for both Step 2 (context) and Step 3 (hard constraints + match gate)
    warnIfCbCacheStale(now);
    const cbInventoryContext = buildCbInventoryContext(now);
    const cachedInventory = loadCbInventoryFromCache();
    const launchWindowPromptGuidance = buildLaunchWindowPromptGuidance(now);
    if (cbInventoryContext) {
        console.log(`[runGroupDiscoveryPipeline] CB inventory context loaded: ${cachedInventory.length} item(s) available for match gate.`);
    } else {
        console.warn('[runGroupDiscoveryPipeline] No CB inventory cache — hard constraints disabled. Run scrape-cb-deals.ts first.');
    }

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
        psychographicData = await callGeminiDeepResearch(psychographicPrompt);
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
        aestheticData = await callGeminiDeepResearch(aestheticPrompt);
        cache.aestheticData = aestheticData;
        writeResearchCache(cache);
        console.log('[runGroupDiscoveryPipeline] Step 2: ✅ Saved to cache.');
    }

    console.log('[runGroupDiscoveryPipeline] Step 3: Generating Structured Blueprints via OpenAI (gpt-5)');
    const cbInventoryHardConstraintBlock = cbInventoryContext
        ? `\n\nINVENTORY HARD CONSTRAINTS — STRICT RULES:\n${cbInventoryContext}\n\n- shipTarget MUST name a ship that appears in the AVAILABLE CB GROUP INVENTORY list above.\n- targetDestination MUST match one of the destination regions shown in the inventory.\n- targetDates MUST align with a sailing in the inventory (within ±60 days of a listed date).\n- If you cannot find a niche that fits the available inventory, adjust your shipTarget and targetDestination to match what IS in the list rather than inventing unmatchable combinations.\n- Never name a ship that is not in the inventory list above.`
        : '';
    const { object } = await callGlobalGenerateObject({
        schema: DiscoveryBlueprintBatchSchema,
        modelName: ModelName.GPT_5_HIGH,
        operationName: 'DiscoveryStep3-Blueprints',
        timeoutMs: 300000, // 5 minute timeout for complex generation
        maxOutputTokens: 12000,
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

Ensure each blueprint is highly specific, aspirational, and contains all required fields.

REQUIRED JSON FIELDS for every blueprint — the parser will reject any missing fields:
- id (string): url-friendly slug
- name (string)
- description (string)
- aesthetic (string)
- targetDates (string): exact sailing date copied from inventory, e.g. "2026-11-07"
- targetDestination (string)
- shipTarget (string): ship name from inventory
- highlightEvents (array of strings, 3-5)
- targetingKeywords (array of strings, 3-5)
- minCabinsRequired (number): default 8
- startingPrice (number): default 1000 if unknown
- priceSource (string): "AI Estimate" if unknown
- researchRationale (string)
- successLogic (string)
- audienceSignals (array of strings, 2-4)
- vacationFitRationale (string)
- cruiseNativeMoments (array of strings, 3-5)
- nicheExpressionMode (string)
- implausibleLiteralizations (array of strings, 3-5)
- allowedThemeSignals (array of strings, 3-6)
- discouragedThemeSignals (array of strings, 3-6)
- communityFitRationale (string)
- optionalGatheringMoments (array of strings, 3-5)
- optionalityStyle (string)
- solitudeRisks (array of strings, 3-5)

Output must be a single JSON object with a top-level "blueprints" array containing exactly 5 objects, each with ALL fields above populated. Do not omit any numeric or string field.${cbInventoryHardConstraintBlock}${existingThemesBlock}${approvedCandidatesBlock}${respinFeedbackBlock}
        `.trim(),
    });

    const launchWindowViolations = getLaunchWindowViolations(
        object.blueprints.map((blueprint) => ({
            id: blueprint.id,
            name: blueprint.name,
            targetDates: blueprint.targetDates,
        })),
        now,
    );

    if (launchWindowViolations.length > 0) {
        const details = launchWindowViolations.map((violation) => violation.message).join('; ');
        console.error(`[runGroupDiscoveryPipeline] Step 3: Rejected generated blueprints before campaign creation: ${details}`);
        throw new Error(`Discovery generated ineligible sailings before campaign creation: ${details}`);
    }

    assertLaunchWindowCompliance(
        object.blueprints.map((blueprint) => ({
            id: blueprint.id,
            name: blueprint.name,
            targetDates: blueprint.targetDates,
        })),
        now,
    );

    // ── Inventory Match Gate ──────────────────────────────────────────────────
    // Discard any blueprint that cannot be matched to CB inventory before saving.
    const allCampaigns: Campaign[] = object.blueprints.map((bp) => mapDiscoveryBlueprintToCampaign(bp));
    const matchedCampaigns: Campaign[] = [];

    if (cachedInventory.length === 0) {
        console.warn('[runGroupDiscoveryPipeline] Inventory Match Gate: no cached inventory — bypassing gate, all blueprints proceed.');
        matchedCampaigns.push(...allCampaigns);
    } else {
        for (const campaign of allCampaigns) {
            const match = matchGroupInventoryToCampaign(campaign, cachedInventory);
            if (match) {
                console.log(`[runGroupDiscoveryPipeline] ✅ Gate PASSED: "${campaign.id}" → ${match.matchedShipName} (score: ${match.matchScore})`);
                matchedCampaigns.push(campaign);
            } else {
                console.warn(`[runGroupDiscoveryPipeline] ⚠️ Gate DISCARDED: "${campaign.id}" — ship: "${campaign.shipTarget ?? 'unset'}", destination: "${campaign.targetDestination ?? 'unset'}"`);
            }
        }
        const discardedCount = allCampaigns.length - matchedCampaigns.length;
        if (discardedCount > 0) {
            console.log(`[runGroupDiscoveryPipeline] Inventory Match Gate: ${matchedCampaigns.length}/${allCampaigns.length} blueprints passed (${discardedCount} discarded).`);
        }
    }

    if (matchedCampaigns.length === 0) {
        const ships = allCampaigns.map(c => `"${c.shipTarget ?? 'unknown'}"`).join(', ');
        throw new Error(
            `All ${allCampaigns.length} generated blueprints failed the inventory match gate. ` +
            `CB inventory may be too narrow for the requested niche space. ` +
            `Requested ships: ${ships}. ` +
            `Suggest: re-scrape CB inventory or re-spin with relaxed destination constraints.`
        );
    }

    if (matchedCampaigns.length < 2) {
        console.warn(`[runGroupDiscoveryPipeline] Only ${matchedCampaigns.length} blueprint(s) passed the inventory gate — consider a re-spin with relaxed constraints.`);
    }

    console.log('[runGroupDiscoveryPipeline] Step 4: Saving Matched Blueprints to DynamoDB (with idempotency check)');
    let skippedCount = 0;
    for (const campaign of matchedCampaigns) {
        const existing = await getCampaignBlueprint(campaign.id);
        if (existing) {
            console.warn(`[runGroupDiscoveryPipeline] Campaign "${campaign.id}" already exists — skipping.`);
            skippedCount++;
            continue;
        }
        await saveCampaignBlueprint(campaign);
    }

    return {
        campaigns: matchedCampaigns,
        skippedCount,
        sonarResearch: {
            psychographic: psychographicData,
            aesthetic: aestheticData,
        },
    };
}
