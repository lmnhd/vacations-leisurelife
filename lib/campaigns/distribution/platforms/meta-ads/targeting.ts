import type { Campaign } from '../../../types';
import { normalizeCampaignResearchDossier } from '../../../schema';
import { searchMetaAdInterests, type MetaAdsConfig } from '../../../../integrations/meta-ads';

export interface MetaResolvedInterest {
    id: string;
    name: string;
    sourceQuery: string;
    audienceSizeLowerBound?: number;
    audienceSizeUpperBound?: number;
}

export interface MetaTargetingPackage {
    seedKeywords: string[];
    audienceSignals: string[];
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

const interestCache = new Map<string, MetaResolvedInterest | null>();

function normalizeTerm(value: string): string {
    return value
        .replace(/[\s\u00a0]+/g, ' ')
        .trim()
        .toLowerCase();
}

function isGenericTerm(term: string): boolean {
    const lower = normalizeTerm(term);
    if (!lower) return true;
    if (GENERIC_DENY_TERMS.has(lower)) return true;

    const tokens = lower.split(/\s+/);
    return tokens.length === 1 && GENERIC_DENY_TERMS.has(tokens[0]);
}

function pushUnique(target: string[], candidate: string, max: number): boolean {
    const normalized = normalizeTerm(candidate);
    if (!normalized || isGenericTerm(normalized)) return false;
    if (target.includes(normalized)) return false;
    if (target.length >= max) return false;
    target.push(normalized);
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
            const phrase = tokens.slice(i, i + len).join(' ');
            if (phrase.length >= 7 && phrase.length <= 42 && !isGenericTerm(phrase)) {
                phrases.add(phrase);
            }
        }
    }
    return Array.from(phrases);
}

function dossierTextSources(campaign: Campaign): string[] {
    const dossier = normalizeCampaignResearchDossier(campaign.researchDossier);
    if (!dossier) return [];

    const niche = dossier.nicheResearch;
    return [
        niche.nicheTitle,
        niche.trendCycleSummary,
        niche.whyThisTrendFeelsDistinctNow,
        ...(niche.audienceRoutineInsights ?? []),
        ...(niche.specificExamples ?? []),
        ...(niche.allowedSignals ?? []),
        ...(niche.sourceNotes ?? []),
        ...(dossier.cruiseTranslation?.cruiseNativeTranslationNotes ?? []),
        ...(dossier.cruiseTranslation?.downstreamImplications?.copyDirection ?? []),
    ].filter((value): value is string => typeof value === 'string' && value.length > 0);
}

function nicheTextSources(campaign: Campaign): string[] {
    const fields: Array<string | string[] | undefined> = [
        campaign.researchRationale,
        campaign.successLogic,
        campaign.communityFitRationale,
        campaign.nicheExpressionMode,
        campaign.optionalityStyle,
        campaign.cruiseNativeMoments,
        campaign.allowedThemeSignals,
        campaign.optionalGatheringMoments,
        campaign.highlightEvents,
        campaign.audienceSignals,
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

function buildInterestQueries(campaign: Campaign, seedKeywords: string[]): string[] {
    const queries: string[] = [];

    for (const seed of seedKeywords) {
        pushUnique(queries, seed, MAX_INTEREST_QUERIES);
    }

    const sourceText = [
        ...(campaign.highlightEvents ?? []),
        ...nicheTextSources(campaign),
        ...dossierTextSources(campaign),
    ];

    for (const source of sourceText) {
        if (queries.length >= MAX_INTEREST_QUERIES) break;
        for (const phrase of extractWordPhrases(source)) {
            pushUnique(queries, phrase, MAX_INTEREST_QUERIES);
            if (queries.length >= MAX_INTEREST_QUERIES) break;
        }
    }

    return queries;
}

async function resolveInterestQuery(config: MetaAdsConfig, query: string): Promise<MetaResolvedInterest | null> {
    const cacheKey = `${config.adAccountId}:${query}`;
    if (interestCache.has(cacheKey)) {
        return interestCache.get(cacheKey) ?? null;
    }

    const results = await searchMetaAdInterests(config.accessToken, query, 6);
    const selected = results.find((interest) => !isGenericTerm(interest.name)) ?? null;
    if (!selected) {
        interestCache.set(cacheKey, null);
        return null;
    }

    const resolved: MetaResolvedInterest = {
        id: selected.id,
        name: selected.name,
        sourceQuery: query,
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

async function resolveInterests(
    config: MetaAdsConfig | undefined,
    queries: string[],
): Promise<{ resolvedInterests: MetaResolvedInterest[]; unresolvedQueries: string[]; warnings: string[] }> {
    if (!config) {
        return {
            resolvedInterests: [],
            unresolvedQueries: queries,
            warnings: ['Meta interest IDs were not resolved because Meta Ads credentials are unavailable.'],
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

    return { resolvedInterests, unresolvedQueries, warnings };
}

function buildSummary(
    seedKeywords: string[],
    audienceSignals: string[],
    interestQueries: string[],
    resolvedInterests: MetaResolvedInterest[],
    unresolvedQueries: string[],
): { summary: string; rationale: string } {
    const summary = [
        `Interest queries (${interestQueries.length}): ${interestQueries.join(', ')}`,
        resolvedInterests.length > 0
            ? `Resolved Meta interests (${resolvedInterests.length}): ${resolvedInterests.map((interest) => `${interest.name} [${interest.id}]`).join(', ')}`
            : 'Resolved Meta interests: none',
        unresolvedQueries.length > 0
            ? `Unresolved queries (${unresolvedQueries.length}): ${unresolvedQueries.join(', ')}`
            : 'Unresolved queries: none',
    ].join('\n');

    const rationale = [
        `Seeded from ${seedKeywords.length} campaign.targetingKeywords term(s).`,
        `Expanded with ${audienceSignals.length} audience signal(s), campaign highlight text, and secondary research dossier text where available.`,
        'Generic cruise / travel / vacation terms excluded before Meta interest resolution.',
    ].join(' ');

    return { summary, rationale };
}

export async function synthesizeMetaTargeting(
    campaign: Campaign,
    options: { config?: MetaAdsConfig; resolveInterestIds?: boolean } = {},
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

    const interestQueries = buildInterestQueries(campaign, nonGenericSeeds);
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
            warnings: ['Meta interest ID resolution skipped for simulation preview.'],
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
        interestQueries,
        resolution.resolvedInterests,
        resolution.unresolvedQueries,
    );

    return {
        seedKeywords: nonGenericSeeds,
        audienceSignals,
        interestQueries,
        resolvedInterests: resolution.resolvedInterests,
        unresolvedQueries: resolution.unresolvedQueries,
        targeting,
        summary,
        rationale,
        warnings: resolution.warnings,
    };
}
