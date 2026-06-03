import { z } from 'zod';
import type { Campaign } from '../../../types';
import { normalizeCampaignResearchDossier } from '../../../schema';
import {
    searchMetaAdInterests,
    type MetaAdsConfig,
    type MetaInterestSearchResult,
} from '../../../../integrations/meta-ads';
import { generateStructuredObject, modelForTask } from '../../../../ai/llm-gateway';

export interface MetaResolvedInterest {
    id: string;
    name: string;
    sourceQuery: string;
    resolvedQuery?: string;
    audienceSizeLowerBound?: number;
    audienceSizeUpperBound?: number;
}

export interface MetaTargetingPackage {
    seedKeywords: string[];
    audienceSignals: string[];
    parentNodes: string[];
    interestQueries: string[];
    resolvedInterests: MetaResolvedInterest[];
    unresolvedQueries: string[];
    targeting: {
        geo_locations: {
            countries: string[];
        };
        flexible_spec: Array<{
            interests: Array<{ id: string; name: string }>;
        }>;
        exclusions: {
            interests: Array<{ id: string; name: string }>;
        };
    };
    summary: string;
    rationale: string;
    warnings: string[];
}

export class MetaTargetingSynthesisError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'MetaTargetingSynthesisError';
    }
}

const MIN_INTEREST_QUERIES = 5;
const MAX_INTEREST_QUERIES = 12;
const MAX_RESOLVED_INTERESTS = 8;
const MAX_INTEREST_QUERY_WORDS = 4;
const MAX_INTEREST_QUERY_CHARS = 36;

const GENERIC_DENY_TERMS = new Set([
    'cruise',
    'cruises',
    'cruising',
    'cruise vacation',
    'cruise vacations',
    'travel',
    'travels',
    'traveling',
    'travelling',
    'vacation',
    'vacations',
    'holiday',
    'holidays',
    'trip',
    'trips',
    'tourism',
    'getaway',
    'getaways',
    'all inclusive',
    'resort',
]);

const TRAVEL_IDEOLOGY_TOKENS = new Set([
    'cruise',
    'cruises',
    'cruising',
    'travel',
    'travels',
    'traveling',
    'travelling',
    'vacation',
    'vacations',
    'holiday',
    'holidays',
    'trip',
    'trips',
    'tour',
    'tours',
    'tourism',
    'getaway',
    'getaways',
    'sailing',
    'sailings',
    'voyage',
    'voyages',
    'ship',
    'ships',
    'cabin',
    'cabins',
    'shore',
    'excursion',
    'excursions',
    'deck',
    'lounge',
    'port',
    'ports',
    'caribbean',
    'fjord',
    'fjords',
    'itinerary',
    'itineraries',
    'resort',
]);

const TRAVEL_IDEOLOGY_PHRASES = [
    'group travel',
    'cruise group',
    'cruise vacation',
    'cruise vacations',
    'slow making vacation',
    'shore excursion',
    'shore excursions',
    'onboard',
    'on board',
];

const PHRASE_STOPWORDS = new Set([
    'a',
    'an',
    'are',
    'and',
    'at',
    'by',
    'for',
    'from',
    'in',
    'into',
    'is',
    'of',
    'on',
    'or',
    'over',
    'that',
    'the',
    'this',
    'to',
    'what',
    'with',
]);

const LOW_SIGNAL_TOKENS = new Set([
    'active',
    'bamboo',
    'chart',
    'charts',
    'clipped',
    'compare',
    'compares',
    'compliments',
    'daily',
    'details',
    'discuss',
    'discusses',
    'focused',
    'great',
    'growing',
    'handwritten',
    'light',
    'lightly',
    'looking',
    'nearby',
    'natural',
    'naturally',
    'notes',
    'patterns',
    'peeking',
    'phrases',
    'printout',
    'pristine',
    'projects',
    'quiet',
    'report',
    'reports',
    'row',
    'share',
    'shares',
    'showing',
    'shows',
    'show',
    'showfloor',
    'slim',
    'social',
    'strong',
    'stitches',
    'tablet',
    'table',
    'textured',
    'threads',
    'tiny',
    'track',
    'tracks',
    'truth',
    'used',
    'volume',
    'weekly',
    'wood',
    'work',
    'working',
    'canvas',
    'phone',
    'wip',
    'frogged',
]);

const LEADING_MODIFIER_TOKENS = new Set([
    'ergonomic',
    'great',
    'handwritten',
    'natural',
    'neat',
    'quiet',
    'slim',
    'textured',
    'tiny',
]);


const interestCache = new Map<string, MetaResolvedInterest | null>();

function normalizeTerm(value: string): string {
    return value
        .replace(/[^a-zA-Z0-9\s\-\/]+/g, ' ')
        .replace(/[\s\u00a0]+/g, ' ')
        .trim()
        .toLowerCase();
}

function isGenericTerm(term: string): boolean {
    const lower = normalizeTerm(term);
    if (!lower) return true;
    if (GENERIC_DENY_TERMS.has(lower)) return true;

    const tokens = lower.split(/\s+/);
    if (tokens.some((token) => TRAVEL_IDEOLOGY_TOKENS.has(token))) return true;
    return TRAVEL_IDEOLOGY_PHRASES.some((phrase) => lower.includes(phrase));
}

function pushUnique(target: string[], candidate: string, max: number): boolean {
    const normalized = normalizeTerm(candidate);
    if (!normalized || isGenericTerm(normalized) || !isMetaInterestCandidate(normalized)) return false;
    if (target.includes(normalized)) return false;
    if (target.length >= max) return false;
    target.push(normalized);
    return true;
}

function isMetaInterestCandidate(term: string): boolean {
    const normalized = normalizeTerm(term);
    if (!normalized) return false;
    if (normalized.length > MAX_INTEREST_QUERY_CHARS) return false;

    const tokens = normalized.split(/\s+/).filter(Boolean);
    if (tokens.length === 0 || tokens.length > MAX_INTEREST_QUERY_WORDS) return false;
    if (tokens.some((token) => PHRASE_STOPWORDS.has(token))) return false;
    if (tokens.some((token) => LOW_SIGNAL_TOKENS.has(token))) return false;
    return true;
}

function extractWordPhrases(source: string): string[] {
    if (!source) return [];
    const cleaned = source
        .replace(/["'`]/g, '')
        .replace(/[^a-zA-Z0-9\s\-\/]/g, ' ')
        .toLowerCase();

    const phrases = new Set<string>();
    const tokens = cleaned.split(/\s+/).filter((token) => token.length > 2);
    for (let i = 0; i < tokens.length; i += 1) {
        for (let len = 2; len <= 3 && i + len <= tokens.length; len += 1) {
            const phraseTokens = tokens.slice(i, i + len);
            if (phraseTokens.some((token) => PHRASE_STOPWORDS.has(token))) continue;
            const phrase = phraseTokens.join(' ');
            if (phrase.length >= 7 && !isGenericTerm(phrase) && isMetaInterestCandidate(phrase)) {
                phrases.add(phrase);
            }
        }
    }
    return Array.from(phrases);
}

function explodeInterestSegments(source: string): string[] {
    const normalized = source
        .replace(/["'`]/g, '')
        .replace(/[()]/g, ' ')
        .replace(/[/:;]/g, ',')
        .toLowerCase();

    const rawSegments = normalized
        .split(',')
        .flatMap((segment) => {
            const trimmed = segment.trim();
            if (!trimmed) return [];
            if (trimmed.split(/\s+/).length > 4 && trimmed.includes(' or ')) {
                return trimmed.split(/\bor\b/gi).map((part) => part.trim());
            }
            return [trimmed];
        });

    const cleaned = rawSegments
        .map((segment) =>
            segment
                .replace(/^(and|or)\s+/, '')
                .replace(/^(a|an)\s+/, '')
                .replace(/^phrases like\s+/, '')
                .replace(/^insider shorthand(?:\s+used\s+lightly\s+and\s+naturally)?\s*/, '')
                .replace(/^natural light on\s+/, '')
                .replace(/^maker-to-maker compliments\s+focused on\s+craft truth\s*/, '')
                .replace(/\bwith\b.*$/, '')
                .replace(/\bshowing\b.*$/, '')
                .replace(/\bfocused on\b.*$/, '')
                .replace(/\bused\b.*$/, '')
                .replace(/\bclipped\b.*$/, '')
                .replace(/\bnearby\b.*$/, '')
                .replace(/\bas\b.*$/, '')
                .replace(/\bnot just\b.*$/, '')
                .replace(/\bmid[- ]project\b.*$/, '')
                .trim(),
        )
        .map((segment) => {
            const tokens = normalizeTerm(segment).split(/\s+/).filter(Boolean);
            while (tokens.length > 1 && LEADING_MODIFIER_TOKENS.has(tokens[0])) {
                tokens.shift();
            }
            return tokens.join(' ');
        })
        .map(normalizeTerm)
        .filter(Boolean);

    return Array.from(new Set(cleaned));
}

function buildResolutionCandidates(query: string): string[] {
    const candidates: string[] = [];
    const pushCandidate = (value: string): void => {
        const normalized = normalizeTerm(value);
        if (!normalized || normalized === query) return;
        if (!isMetaInterestCandidate(normalized)) return;
        if (!candidates.includes(normalized)) candidates.push(normalized);
    };

    const clauses = query
        .split(/[,;:/()]/)
        .map((part) => normalizeTerm(part))
        .filter(Boolean);

    for (const clause of clauses) {
        pushCandidate(clause);
        for (const phrase of extractWordPhrases(clause)) {
            pushCandidate(phrase);
        }
    }

    return candidates;
}

function scoreInterestResult(result: MetaInterestSearchResult, query: string): number {
    const normalizedName = normalizeTerm(result.name);
    const normalizedQuery = normalizeTerm(query);

    let score = 0;
    if (normalizedName === normalizedQuery) score += 100;
    if (normalizedName.startsWith(normalizedQuery)) score += 50;
    if (normalizedName.includes(normalizedQuery)) score += 25;
    if ((result.path ?? []).some((segment: string) => normalizeTerm(segment).includes(normalizedQuery))) score += 15;
    if (result.audience_size_upper_bound !== undefined) score += 5;
    score -= Math.max(0, normalizedName.split(/\s+/).length - normalizedQuery.split(/\s+/).length);
    return score;
}

function dossierStructuredTerms(campaign: Campaign): string[] {
    const dossier = normalizeCampaignResearchDossier(campaign.researchDossier);
    if (!dossier) return [];

    const niche = dossier.nicheResearch;
    return [
        ...(niche.allowedSignals ?? []),
        ...(niche.specificExamples ?? []),
    ].filter((value): value is string => typeof value === 'string' && value.length > 0);
}

function dossierTextSources(campaign: Campaign): string[] {
    const dossier = normalizeCampaignResearchDossier(campaign.researchDossier);
    if (!dossier) return [];

    const niche = dossier.nicheResearch;
    return [
        ...(niche.allowedSignals ?? []),
        ...(niche.specificExamples ?? []),
        ...(niche.audienceRoutineInsights ?? []),
        ...(niche.sourceNotes ?? []),
        niche.trendCycleSummary,
        niche.whyThisTrendFeelsDistinctNow,
    ].filter((value): value is string => typeof value === 'string' && value.length > 0);
}

function campaignSupportTextSources(campaign: Campaign): string[] {
    const fields: Array<string | string[] | undefined> = [
        campaign.audienceSignals,
        campaign.communityFitRationale,
        campaign.nicheExpressionMode,
        campaign.allowedThemeSignals,
        campaign.optionalGatheringMoments,
        campaign.highlightEvents,
        campaign.optionalityStyle,
        campaign.researchRationale,
        campaign.successLogic,
    ];

    const out: string[] = [];
    for (const value of fields) {
        if (!value) continue;
        if (Array.isArray(value)) {
            for (const entry of value) {
                if (typeof entry === 'string' && entry.length > 0) out.push(entry);
            }
        } else if (value.length > 0) {
            out.push(value);
        }
    }
    return out;
}

function appendInterestAtoms(target: string[], sources: string[], max: number): void {
    for (const source of sources) {
        if (target.length >= max) break;
        for (const segment of explodeInterestSegments(source)) {
            pushUnique(target, segment, max);
            if (target.length >= max) break;
            for (const phrase of extractWordPhrases(segment)) {
                pushUnique(target, phrase, max);
                if (target.length >= max) break;
            }
        }
    }
}

function appendCompactDossierTerms(target: string[], sources: string[], max: number): void {
    for (const source of sources) {
        if (target.length >= max) break;
        for (const segment of explodeInterestSegments(source)) {
            pushUnique(target, segment, max);
            if (target.length >= max) break;
        }
    }
}

const MetaParentNodesSchema = z.object({
    parentNodes: z
        .array(z.string())
        .min(1)
        .max(6)
        .describe('Broad Meta Ads interest category names that are recognized parent nodes in the Meta interest taxonomy'),
});

async function resolveMetaParentNodes(campaign: Campaign, seedKeywords: string[]): Promise<string[]> {
    const nicheContext = [
        campaign.name,
        ...(campaign.targetingKeywords ?? []),
        ...(campaign.audienceSignals ?? []),
        campaign.nicheExpressionMode,
        campaign.researchRationale,
    ]
        .filter((v): v is string => typeof v === 'string' && v.length > 0)
        .slice(0, 10)
        .join('\n');

    try {
        const { object } = await generateStructuredObject({
            model: modelForTask('extraction'),
            schema: MetaParentNodesSchema,
            system: [
                'You are a Meta Ads targeting specialist.',
                'Given a niche campaign description, return 2–6 broad Meta Ads interest category names that are verified parent nodes in the Meta detailed-targeting interest taxonomy.',
                'Rules:',
                '- Use only real Meta interest category names (e.g. "Knitting", "Board game", "Photography", "Yoga").',
                '- Choose the highest-order recognized parent that accurately covers the niche — not sub-categories or topic variants.',
                '- Never include travel, cruise, vacation, or destination terms.',
                '- Return only the category names, no explanation.',
            ].join(' '),
            prompt: `Campaign niche signals:\n${nicheContext}\n\nSeed keywords: ${seedKeywords.join(', ')}`,
            timeoutMs: 15_000,
        });
        return object.parentNodes;
    } catch {
        return [];
    }
}

function buildInterestQueries(campaign: Campaign, seedKeywords: string[], parentNodes: string[]): string[] {
    const queries: string[] = [];

    for (const seed of seedKeywords) {
        pushUnique(queries, seed, MAX_INTEREST_QUERIES);
    }

    // Inject AI-resolved broad parent nodes immediately after seeds so they are never crowded
    // out by secondary text-mining phases. These are verified Meta-recognized interest terms
    // that keep the ad set deliverable when niche atoms fail resolution.
    for (const parent of parentNodes) {
        pushUnique(queries, parent, MAX_INTEREST_QUERIES);
    }

    appendCompactDossierTerms(queries, dossierStructuredTerms(campaign), MAX_INTEREST_QUERIES);

    appendInterestAtoms(queries, dossierTextSources(campaign), MAX_INTEREST_QUERIES);
    appendInterestAtoms(queries, campaign.audienceSignals ?? [], MAX_INTEREST_QUERIES);
    appendInterestAtoms(queries, campaignSupportTextSources(campaign), MAX_INTEREST_QUERIES);

    return queries;
}

async function resolveInterestQuery(config: MetaAdsConfig, query: string): Promise<MetaResolvedInterest | null> {
    const cacheKey = `${config.adAccountId}:${query}`;
    if (interestCache.has(cacheKey)) {
        return interestCache.get(cacheKey) ?? null;
    }

    const candidateQueries = [query, ...buildResolutionCandidates(query)];

    for (const candidateQuery of candidateQueries) {
        const results = await searchMetaAdInterests(config.accessToken, candidateQuery, 6);
        const scored = results
            .filter((interest) => !isGenericTerm(interest.name))
            .map((interest) => ({
                interest,
                score: scoreInterestResult(interest, candidateQuery),
            }))
            .sort((a, b) => b.score - a.score);

        const selected = scored[0]?.score && scored[0].score >= 25 ? scored[0].interest : null;
        if (!selected) {
            continue;
        }

        const resolved: MetaResolvedInterest = {
            id: selected.id,
            name: selected.name,
            sourceQuery: query,
            ...(candidateQuery !== query ? { resolvedQuery: candidateQuery } : {}),
            ...(selected.audience_size_lower_bound !== undefined
                ? { audienceSizeLowerBound: selected.audience_size_lower_bound }
                : {}),
            ...(selected.audience_size_upper_bound !== undefined
                ? { audienceSizeUpperBound: selected.audience_size_upper_bound }
                : {}),
        };
        interestCache.set(cacheKey, resolved);
        return resolved;
    }

    interestCache.set(cacheKey, null);
    return null;
}

async function resolveInterests(
    config: MetaAdsConfig | undefined,
    queries: string[],
): Promise<{ resolvedInterests: MetaResolvedInterest[]; unresolvedQueries: string[]; warnings: string[] }> {
    if (!config) {
        return {
            resolvedInterests: [],
            unresolvedQueries: queries,
            warnings: ['Meta Ads credentials are not configured. Set META_ACCESS_TOKEN and META_AD_ACCOUNT_ID to enable interest ID resolution.'],
        };
    }

    const resolvedInterests: MetaResolvedInterest[] = [];
    const unresolvedQueries: string[] = [];
    const warnings: string[] = [];
    const seenInterestIds = new Set<string>();

    for (const query of queries) {
        if (resolvedInterests.length >= MAX_RESOLVED_INTERESTS) break;
        try {
            const interest = await resolveInterestQuery(config, query);
            if (!interest) {
                unresolvedQueries.push(query);
                continue;
            }
            if (seenInterestIds.has(interest.id)) {
                continue;
            }
            seenInterestIds.add(interest.id);
            resolvedInterests.push(interest);
        } catch (error: unknown) {
            unresolvedQueries.push(query);
            warnings.push(
                `Meta interest search failed for "${query}": ${error instanceof Error ? error.message : String(error)}`,
            );
        }
    }

    if (resolvedInterests.length === 0 && queries.length > 0) {
        warnings.push('No Meta interest IDs resolved. All queries were too specific for Meta detailed targeting — the ad set will fall back to META_AD_SET_ID if configured, or dispatch will fail.');
    }

    return { resolvedInterests, unresolvedQueries, warnings };
}

function buildSummary(
    seedKeywords: string[],
    audienceSignals: string[],
    parentNodes: string[],
    interestQueries: string[],
    resolvedInterests: MetaResolvedInterest[],
    unresolvedQueries: string[],
): { summary: string; rationale: string } {
    const summary = [
        `Interest queries (${interestQueries.length}): ${interestQueries.join(', ')}`,
        parentNodes.length > 0
            ? `AI-resolved parent nodes (${parentNodes.length}): ${parentNodes.join(', ')}`
            : 'AI-resolved parent nodes: none',
        resolvedInterests.length > 0
            ? `Resolved Meta interests (${resolvedInterests.length}): ${resolvedInterests.map((interest) => `${interest.name} [${interest.id}]${interest.resolvedQuery && interest.resolvedQuery !== interest.sourceQuery ? ` via ${interest.resolvedQuery}` : ''}`).join(', ')}`
            : 'Resolved Meta interests: none',
        unresolvedQueries.length > 0
            ? `Unresolved queries (${unresolvedQueries.length}): ${unresolvedQueries.join(', ')}`
            : 'Unresolved queries: none',
    ].join('\n');

    const rationale = [
        `Seeded from ${seedKeywords.length} campaign.targetingKeywords term(s).`,
        parentNodes.length > 0
            ? `Broadened with ${parentNodes.length} AI-resolved Meta parent node(s) to ensure ad set deliverability.`
            : 'No AI-resolved parent nodes were returned.',
        `Expanded further with ${audienceSignals.length} audience signal(s) and secondary research dossier vocabulary before campaign-authored prose, then compressed into short Meta-safe interest atoms.`,
        'Travel ideology terms such as cruise, group travel, vacation, ship, and venue language are excluded before Meta interest resolution.',
    ].join(' ');

    return { summary, rationale };
}

export async function synthesizeMetaTargeting(
    campaign: Campaign,
    options: {
        config?: MetaAdsConfig;
        resolveInterestIds?: boolean;
        /** Override the AI parent-node resolution step — used in tests to avoid live LLM calls. */
        resolveParentNodes?: (campaign: Campaign, seeds: string[]) => Promise<string[]>;
    } = {},
): Promise<MetaTargetingPackage> {
    const seedKeywords = (campaign.targetingKeywords ?? [])
        .map(normalizeTerm)
        .filter((term) => term.length > 0);
    const audienceSignals = (campaign.audienceSignals ?? [])
        .map((signal) => (signal ?? '').toString().trim())
        .filter((signal) => signal.length > 0);

    if (seedKeywords.length === 0) {
        throw new MetaTargetingSynthesisError(
            `Campaign "${campaign.id}" has no targetingKeywords. Refusing to synthesize Meta targeting from generic cruise terms.`,
        );
    }

    const nonGenericSeeds = seedKeywords.filter((seed) => !isGenericTerm(seed));
    if (nonGenericSeeds.length === 0) {
        throw new MetaTargetingSynthesisError(
            `Campaign "${campaign.id}" has only generic seed keywords. Add niche-specific targetingKeywords before Meta dispatch.`,
        );
    }

    const resolveParents = options.resolveParentNodes ?? resolveMetaParentNodes;
    const parentNodes = (await resolveParents(campaign, nonGenericSeeds))
        .map(normalizeTerm)
        .filter((n) => n.length > 0 && !isGenericTerm(n));

    const interestQueries = buildInterestQueries(campaign, nonGenericSeeds, parentNodes);
    if (interestQueries.length < MIN_INTEREST_QUERIES) {
        throw new MetaTargetingSynthesisError(
            `Campaign "${campaign.id}" only yielded ${interestQueries.length} Meta interest query term(s), minimum ${MIN_INTEREST_QUERIES}.`,
        );
    }

    const resolution = options.resolveInterestIds
        ? await resolveInterests(options.config, interestQueries)
        : {
            resolvedInterests: [],
            unresolvedQueries: interestQueries,
            warnings: ['Simulation mode: Meta interest IDs not resolved. Dispatch live to populate flexible_spec with real interest node IDs.'],
        };

    const targeting = {
        geo_locations: {
            countries: ['US'],
        },
        flexible_spec: resolution.resolvedInterests.length > 0
            ? [
                {
                    interests: resolution.resolvedInterests.map((interest) => ({
                        id: interest.id,
                        name: interest.name,
                    })),
                },
            ]
            : [],
        exclusions: {
            interests: [],
        },
    };

    const { summary, rationale } = buildSummary(
        nonGenericSeeds,
        audienceSignals,
        parentNodes,
        interestQueries,
        resolution.resolvedInterests,
        resolution.unresolvedQueries,
    );

    return {
        seedKeywords: nonGenericSeeds,
        audienceSignals,
        parentNodes,
        interestQueries,
        resolvedInterests: resolution.resolvedInterests,
        unresolvedQueries: resolution.unresolvedQueries,
        targeting,
        summary,
        rationale,
        warnings: resolution.warnings,
    };
}
