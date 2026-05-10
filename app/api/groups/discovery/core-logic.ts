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

// ─── Two-Stage Pipeline Types ──────────────────────────────────────────────────
// The discovery pipeline can be invoked all-at-once via runGroupDiscoveryPipeline,
// or split into two stages: runDiscoveryResearch (Steps 1+2, Gemini Deep Research)
// then generateDiscoveryBlueprints (Step 3, GPT-5 + match gate + DynamoDB save).
// The two-stage form lets operators iteratively add new campaigns without re-paying
// for Gemini calls when the research is still fresh.

export interface DiscoveryResearchData {
    psychographicData: string;
    aestheticData: string;
}

export interface DiscoveryResearchResult extends DiscoveryResearchData {
    /** ISO date (YYYY-MM-DD) the research was generated/cached on. */
    cachedAt: string;
    psychographicFromCache: boolean;
    aestheticFromCache: boolean;
}

export interface DiscoveryResearchOptions {
    /** Force fresh Gemini calls instead of using same-day cache. */
    force?: boolean;
    /** Re-spin context: pull existing campaigns + iteration feedback into prompts. */
    respin?: boolean;
}

export interface DiscoveryGenerateOptions {
    /** Use this research instead of reading from cache. Required when cache is empty. */
    research?: DiscoveryResearchData;
    /** Re-spin: feed prior campaign feedback into the GPT-5 blueprint prompt. */
    respin?: boolean;
}

export interface DiscoveryResearchCacheStatus {
    hasCache: boolean;
    cachedAt: string | null;
    hasPsychographic: boolean;
    hasAesthetic: boolean;
    promptVersion: string | null;
    isCurrentVersion: boolean;
}

/**
 * Returns the current state of the research cache so operators can see
 * whether Stage 2 (generate) will use cached research or needs a fresh
 * Stage 1 (research) run first.
 */
export function getDiscoveryResearchCacheStatus(): DiscoveryResearchCacheStatus {
    if (!existsSync(CACHE_FILE)) {
        return {
            hasCache: false,
            cachedAt: null,
            hasPsychographic: false,
            hasAesthetic: false,
            promptVersion: null,
            isCurrentVersion: false,
        };
    }
    try {
        const raw = readFileSync(CACHE_FILE, 'utf-8');
        const parsed = JSON.parse(raw) as ResearchCache;
        return {
            hasCache: true,
            cachedAt: parsed.date ?? null,
            hasPsychographic: !!parsed.psychographicData,
            hasAesthetic: !!parsed.aestheticData,
            promptVersion: parsed.promptVersion ?? null,
            isCurrentVersion: parsed.promptVersion === DISCOVERY_PROMPT_VERSION,
        };
    } catch {
        return {
            hasCache: false,
            cachedAt: null,
            hasPsychographic: false,
            hasAesthetic: false,
            promptVersion: null,
            isCurrentVersion: false,
        };
    }
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

SYSTEMIC PATTERN TO AVOID IN THIS RE-SPIN:
The prior discovery batch was consistently flagged for the same structural failure: concepts read as "[niche] events on a ship" rather than "cruise vacations that attract [niche] people." Every concept became too niche-first — the niche was the operational center, not the ambient social flavor. Do not repeat this pattern.

In this re-spin, the vacation experience must come first. Identify cruise experiences that are already desirable to a broad audience, then identify the niche community that would disproportionately self-select for that exact cruise. The niche is the seasoning. A non-enthusiast must still feel the trip is a great vacation regardless of how much they engage with the niche angle.

Rules:
- Do not return slight variations of the same quiet, lounge-based, introspective adult cruise theme.
- Avoid repeating the same social mechanism, prop family, or emotional register across new findings.
- Treat NOT ACCEPTABLE campaigns as warning cases whose weaknesses must be actively avoided.
- If a prior result was ACCEPTABLE, you still must not duplicate it; use it only to understand what worked structurally.
- Push for new community clusters, more differentiated visual worlds, and more varied cruise-native behavior patterns.

Prior results:
${lines}`;
}

/**
 * Internal: builds the prompt-context blocks shared by both research and generate stages.
 * Cheap (mostly cache reads + a single DynamoDB scan), so safe to call once per stage.
 */
async function buildDiscoveryPromptContext(opts: { respin: boolean; now: Date }) {
    const { respin, now } = opts;
    warnIfCbCacheStale(now);
    const cbInventoryContext = buildCbInventoryContext(now);
    const cachedInventory = loadCbInventoryFromCache();
    const launchWindowPromptGuidance = buildLaunchWindowPromptGuidance(now);
    const existingCampaigns = await scanAllCampaigns();
    const priorCampaignContext = respin ? await loadPriorCampaignContext(existingCampaigns) : [];
    const existingThemesBlock = respin
        ? buildCorrectiveThemesBlock(priorCampaignContext)
        : buildExistingThemesBlock(existingCampaigns);
    const approvedCandidatesBlock = respin ? buildApprovedCandidatesBlock(priorCampaignContext) : '';
    const respinFeedbackBlock = respin ? await buildDiscoveryRespinFeedback(priorCampaignContext) : '';
    return {
        cbInventoryContext,
        cachedInventory,
        launchWindowPromptGuidance,
        existingThemesBlock,
        approvedCandidatesBlock,
        respinFeedbackBlock,
        existingCampaignsCount: existingCampaigns.length,
    };
}

/**
 * Stage 1 (cacheable): Run Gemini Deep Research Steps 1+2 only.
 * Persists results to .github/data/discovery-research-cache.json.
 * Stage 2 (generateDiscoveryBlueprints) reads this cache automatically.
 *
 * Use opts.force=true to force fresh Gemini calls even if same-day cache exists.
 * Use opts.respin=true to inject prior-campaign feedback into prompts.
 */
export async function runDiscoveryResearch(opts: DiscoveryResearchOptions = {}): Promise<DiscoveryResearchResult> {
    const { force = false, respin = false } = opts;
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const cache = force ? { date: today, promptVersion: DISCOVERY_PROMPT_VERSION } : readResearchCache();

    const ctx = await buildDiscoveryPromptContext({ respin, now });
    const { launchWindowPromptGuidance, cbInventoryContext, existingThemesBlock, approvedCandidatesBlock, respinFeedbackBlock, existingCampaignsCount } = ctx;
    console.log(`[runDiscoveryResearch] ${existingCampaignsCount} existing campaign(s) found — injecting exclusion list${respin ? ' and re-spin feedback' : ''} into prompts.`);

    let psychographicData: string;
    let psychographicFromCache = false;
    if (!force && cache.psychographicData) {
        console.log('[runDiscoveryResearch] Step 1: ✅ Resuming from cache (psychographicData)');
        psychographicData = cache.psychographicData;
        psychographicFromCache = true;
    } else {
        console.log('[runDiscoveryResearch] Step 1: Psychographic Discovery');
        const psychographicPrompt = buildPsychographicPrompt({ existingThemesBlock, approvedCandidatesBlock, respinFeedbackBlock });
        psychographicData = await callGeminiDeepResearch(psychographicPrompt);
        cache.psychographicData = psychographicData;
        writeResearchCache(cache);
        console.log('[runDiscoveryResearch] Step 1: ✅ Saved to cache.');
    }

    let aestheticData: string;
    let aestheticFromCache = false;
    if (!force && cache.aestheticData) {
        console.log('[runDiscoveryResearch] Step 2: ✅ Resuming from cache (aestheticData)');
        aestheticData = cache.aestheticData;
        aestheticFromCache = true;
    } else {
        console.log('[runDiscoveryResearch] Step 2: Aesthetic Gap Follow-up');
        const aestheticPrompt = buildAestheticPrompt({
            psychographicData,
            launchWindowPromptGuidance,
            cbInventoryContext,
            approvedCandidatesBlock,
            respinFeedbackBlock,
        });
        aestheticData = await callGeminiDeepResearch(aestheticPrompt);
        cache.aestheticData = aestheticData;
        writeResearchCache(cache);
        console.log('[runDiscoveryResearch] Step 2: ✅ Saved to cache.');
    }

    return {
        psychographicData,
        aestheticData,
        cachedAt: cache.date ?? today,
        psychographicFromCache,
        aestheticFromCache,
    };
}

/**
 * Stage 2: Run GPT-5 Step 3 (structured blueprint generation) + inventory match gate +
 * DynamoDB save. Reads research from the cache by default; pass opts.research to use
 * an explicit research payload instead.
 *
 * Throws if no research is available in the cache and none is provided.
 */
export async function generateDiscoveryBlueprints(opts: DiscoveryGenerateOptions = {}): Promise<DiscoveryPipelineResult> {
    const { research, respin = false } = opts;
    const now = new Date();

    // Resolve research data: explicit input wins over cache
    let psychographicData: string;
    let aestheticData: string;
    if (research) {
        psychographicData = research.psychographicData;
        aestheticData = research.aestheticData;
    } else {
        const cache = readResearchCache();
        if (!cache.psychographicData || !cache.aestheticData) {
            throw new Error(
                'No cached discovery research available. Run runDiscoveryResearch() first, or pass research data explicitly via opts.research.',
            );
        }
        psychographicData = cache.psychographicData;
        aestheticData = cache.aestheticData;
    }

    const ctx = await buildDiscoveryPromptContext({ respin, now });
    const { cbInventoryContext, cachedInventory, launchWindowPromptGuidance, existingThemesBlock, approvedCandidatesBlock, respinFeedbackBlock } = ctx;
    if (cbInventoryContext) {
        console.log(`[generateDiscoveryBlueprints] CB inventory context loaded: ${cachedInventory.length} item(s) available for match gate.`);
    } else {
        console.warn('[generateDiscoveryBlueprints] No CB inventory cache — hard constraints disabled. Run scrape-cb-deals.ts first.');
    }

    return await runStep3AndPersist({
        aestheticData,
        psychographicData,
        cbInventoryContext,
        cachedInventory,
        launchWindowPromptGuidance,
        existingThemesBlock,
        approvedCandidatesBlock,
        respinFeedbackBlock,
        now,
    });
}

/**
 * Legacy all-in-one pipeline. Calls runDiscoveryResearch + generateDiscoveryBlueprints.
 * Kept for backwards compatibility with the existing GET /api/groups/discovery route.
 */
export async function runGroupDiscoveryPipeline(options: DiscoveryPipelineOptions = {}): Promise<DiscoveryPipelineResult> {
    const { respin = false } = options;
    const research = await runDiscoveryResearch({ force: respin, respin });
    return await generateDiscoveryBlueprints({ research, respin });
}

// ─── Internal: prompt builders + Step 3 + persistence ─────────────────────────

function buildPsychographicPrompt(blocks: {
    existingThemesBlock: string;
    approvedCandidatesBlock: string;
    respinFeedbackBlock: string;
}): string {
    const { existingThemesBlock, approvedCandidatesBlock, respinFeedbackBlock } = blocks;
    return `
    You are researching cruise vacation experiences for a vacation-first group cruise business.

    PRIMARY FRAMING RULE — read this before everything else:
    ${CRUISE_REALISM_GOVERNING_PRINCIPLE}
    The primary deliverable is the VACATION EXPERIENCE. The niche community is what makes it self-select and feel socially alive — it is the seasoning, not the meal. Do not start from a niche and then figure out how to fit it on a cruise. Start from the cruise vacation and identify which niche community would naturally be drawn to it.

    Identify 5 distinctive cruise vacation experiences where a specific niche community naturally self-selects and gathers — not because the cruise is built for them, but because the cruise is already the right vibe.

    Secondary filters (apply after defining the vacation experience):
    - the self-selecting community should be hobby-centric, taste-centric, fandom-driven, aesthetic-led, or socially expressive
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

    For each vacation experience, describe in this order:
    1. The cruise vacation experience itself: what kind of ship energy, destinations, deck life, port-day rhythms, and social atmosphere define it — before naming any niche
    2. Which niche community would be disproportionately drawn to THIS vacation (not the reverse) — and why the fit feels natural rather than forced
    3. How the niche identity acts as thin ambient social flavoring: discoverable by those who care, optional for those who don't, never scheduled as the operational center
    4. Why a casual participant or non-enthusiast would still rate the trip as a great vacation even if they barely engaged with the niche angle
    5. What low-pressure, drop-in social signals would make the niche visible and connecting without becoming mandatory programming
    6. What spend and market signals show this community actively books experiential vacations

    Do not optimize for the most intense or industrial niche. Optimize for the best blend of vacation desirability, cruise plausibility, laid-back social chemistry, ambient community potential, and ownable aesthetic.${existingThemesBlock}${approvedCandidatesBlock}${respinFeedbackBlock}
        `.trim();
}

function buildAestheticPrompt(blocks: {
    psychographicData: string;
    launchWindowPromptGuidance: string;
    cbInventoryContext: string;
    approvedCandidatesBlock: string;
    respinFeedbackBlock: string;
}): string {
    const { psychographicData, launchWindowPromptGuidance, cbInventoryContext, approvedCandidatesBlock, respinFeedbackBlock } = blocks;
    return `
Based on the following vacation experiences and their self-selecting communities:
${psychographicData}

    ${CRUISE_REALISM_GOVERNING_PRINCIPLE}
    Remember: the vacation experience comes first. The niche community is the seasoning, not the meal.

    For each vacation experience identified above, deepen the picture in this order:

    1. What specific shipboard moments, port-day rhythms, and ambient social energy make this vacation work on its own — before any niche layer is considered?
    2. How does the niche community's presence enhance those moments without replacing or disrupting them?
    3. What would feel implausible, over-programmed, industrial, clinical, workshop-like, academic, or operationally awkward on a cruise?
    4. Only then, which cruise lines or ships could support the believable version of the experience naturally, without requiring major customization or infrastructure fantasy?

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
}

interface Step3PersistArgs {
    aestheticData: string;
    psychographicData: string;
    cbInventoryContext: string;
    cachedInventory: CbGroupInventoryItem[];
    launchWindowPromptGuidance: string;
    existingThemesBlock: string;
    approvedCandidatesBlock: string;
    respinFeedbackBlock: string;
    now: Date;
}

async function runStep3AndPersist(args: Step3PersistArgs): Promise<DiscoveryPipelineResult> {
    const {
        aestheticData,
        psychographicData,
        cbInventoryContext,
        cachedInventory,
        launchWindowPromptGuidance,
        existingThemesBlock,
        approvedCandidatesBlock,
        respinFeedbackBlock,
        now,
    } = args;

    console.log('[generateDiscoveryBlueprints] Step 3: Generating Structured Blueprints via OpenAI (gpt-5)');
    const cbInventoryHardConstraintBlock = cbInventoryContext
        ? `\n\nINVENTORY HARD CONSTRAINTS — STRICT RULES:\n${cbInventoryContext}\n\n- shipTarget MUST name a ship that appears in the AVAILABLE CB GROUP INVENTORY list above.\n- targetDestination MUST match one of the destination regions shown in the inventory.\n- targetDates MUST align with a sailing in the inventory (within ±60 days of a listed date).\n- If you cannot find a niche that fits the available inventory, adjust your shipTarget and targetDestination to match what IS in the list rather than inventing unmatchable combinations.\n- Never name a ship that is not in the inventory list above.`
        : '';
    const { object } = await callGlobalGenerateObject({
        schema: DiscoveryBlueprintBatchSchema,
        modelName: ModelName.GPT_5_HIGH,
        operationName: 'DiscoveryStep3-Blueprints',
        timeoutMs: 300000,
        maxOutputTokens: 12000,
        prompt: `
You are an expert Cruise Campaign Strategist with deep knowledge of niche subcultures and community marketing. Review the following Gemini Deep Research findings on niche subcultures and ship infrastructure:

Research Data:
${aestheticData}

Write a structured JSON detailing exactly 5 fully vetted, high-value Theme Cruise Blueprints based on this research.

CRITICAL REQUIREMENTS for each blueprint:
1. researchRationale: Cite SPECIFIC findings from the research above — name the exact communities, subreddits, hashtags, or metrics the research data surfaced. Do not generalise.
2. successLogic: Explain the commercial + psychological case for why this niche will convert to bookings. Include spend willingness signals, the IRL pull factor, and what market gap this fills.
3. audienceSignals: Provide 2-4 concrete, specific data points directly from the research (with platform, metric, and date context where available).
4. vacationFitRationale: Prove that this concept feels like a desirable cruise vacation, not a retreat, class, residency, lab, or conference.
5. cruiseNativeMoments: Name 3-5 believable shipboard moments that make the theme feel pleasurable and cruise-native. Each moment MUST include at least one specific physical prop, texture, or environmental detail that a photographer could capture or an illustrator could draw. Avoid generic event names. Instead of "game night," write "a half-finished Azul game on a teak table with coffee cups and morning light through a lounge window." Instead of "poolside demo," write "a brightly illustrated game box propped open on a pool chair armrest, dice drying on a towel."
6. nicheExpressionMode: Explain HOW the niche remains ambient and optional throughout the trip. Name specifically what a non-enthusiast guest does on day 1, day 3, and at a port stop — and why they are having a great time regardless of niche participation. If the answer is "they feel left out," reject this concept and choose a different one.
7. implausibleLiteralizations: Name 3-5 ways this theme should not be interpreted because they would feel too workshop-like, industrial, clinical, or unrealistic on a ship.
8. allowedThemeSignals: 3-6 specific visual or tactile cues that will appear in the campaign imagery. Each must be a concrete object, texture, color, or piece of environmental set-dressing — something a viewer could point to in a photograph. Examples: "leather dice tray on a bar rail," "wooden meeples scattered on a deck chair armrest," "colorful game box spine visible on a café shelf." Avoid abstract concepts, event names, or category labels. discouragedThemeSignals must list cues that are overly formal, technical, or workshop-like.
9. communityFitRationale: Prove that the group version matters socially; explain why people in this niche would naturally enjoy finding one another on a ship.
10. optionalGatheringMoments: Name 3-5 low-pressure, drop-in/drop-out gatherings. Each must describe the physical scene — what guests see, touch, or hear when they arrive — not just the event name or schedule slot. Example: "a café table with a rotating library of open games, chips and drinks already poured, no host required."
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

NICHE-HEAVY DRIFT REJECTION RULE:
If a non-enthusiast would feel like they missed the point of the trip because the niche is the operational center rather than the social flavor, reject the blueprint and choose a different concept. The niche must be an ambient layer: discoverable by those who care about it, invisible-but-pleasant to those who don't. A blueprint where the niche IS the trip — not just a flavor of it — fails this rule.

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
- cruiseNativeMoments (array of strings, 3-5): each entry must name a specific prop, texture, or environmental detail — renderable by a photographer or illustrator
- nicheExpressionMode (string)
- implausibleLiteralizations (array of strings, 3-5)
- allowedThemeSignals (array of strings, 3-6): each entry must be a concrete object, texture, color, or set-dressing element visible in a photo — no abstract concepts or event names
- discouragedThemeSignals (array of strings, 3-6)
- communityFitRationale (string)
- optionalGatheringMoments (array of strings, 3-5): each entry must describe the physical scene — what guests see, touch, or hear — not just the event name
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
        console.error(`[generateDiscoveryBlueprints] Step 3: Rejected generated blueprints before campaign creation: ${details}`);
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
        console.warn('[generateDiscoveryBlueprints] Inventory Match Gate: no cached inventory — bypassing gate, all blueprints proceed.');
        matchedCampaigns.push(...allCampaigns);
    } else {
        for (const campaign of allCampaigns) {
            const match = matchGroupInventoryToCampaign(campaign, cachedInventory);
            if (match) {
                console.log(`[generateDiscoveryBlueprints] ✅ Gate PASSED: "${campaign.id}" → ${match.matchedShipName} (score: ${match.matchScore})`);
                matchedCampaigns.push(campaign);
            } else {
                console.warn(`[generateDiscoveryBlueprints] ⚠️ Gate DISCARDED: "${campaign.id}" — ship: "${campaign.shipTarget ?? 'unset'}", destination: "${campaign.targetDestination ?? 'unset'}"`);
            }
        }
        const discardedCount = allCampaigns.length - matchedCampaigns.length;
        if (discardedCount > 0) {
            console.log(`[generateDiscoveryBlueprints] Inventory Match Gate: ${matchedCampaigns.length}/${allCampaigns.length} blueprints passed (${discardedCount} discarded).`);
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
        console.warn(`[generateDiscoveryBlueprints] Only ${matchedCampaigns.length} blueprint(s) passed the inventory gate — consider a re-spin with relaxed constraints.`);
    }

    console.log('[generateDiscoveryBlueprints] Step 4: Saving Matched Blueprints to DynamoDB (with idempotency check)');
    let skippedCount = 0;
    for (const campaign of matchedCampaigns) {
        const existing = await getCampaignBlueprint(campaign.id);
        if (existing) {
            console.warn(`[generateDiscoveryBlueprints] Campaign "${campaign.id}" already exists — skipping.`);
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
