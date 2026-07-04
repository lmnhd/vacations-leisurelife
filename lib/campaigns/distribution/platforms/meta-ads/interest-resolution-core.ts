import { z } from 'zod';
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

export const MIN_INTEREST_QUERIES = 5;
export const MAX_INTEREST_QUERIES = 12;
export const MAX_RESOLVED_INTERESTS = 8;
export const MAX_INTEREST_QUERY_WORDS = 4;
export const MAX_INTEREST_QUERY_CHARS = 36;

export const GENERIC_DENY_TERMS = new Set([
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

export const TRAVEL_IDEOLOGY_TOKENS = new Set([
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

export const TRAVEL_IDEOLOGY_PHRASES = [
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

export const PHRASE_STOPWORDS = new Set([
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

export const LOW_SIGNAL_TOKENS = new Set([
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

export const LEADING_MODIFIER_TOKENS = new Set([
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

export function normalizeTerm(value: string): string {
    return value
        .replace(/[^a-zA-Z0-9\s\-\/]+/g, ' ')
        .replace(/[\s ]+/g, ' ')
        .trim()
        .toLowerCase();
}

export function isGenericTerm(term: string): boolean {
    const lower = normalizeTerm(term);
    if (!lower) return true;
    if (GENERIC_DENY_TERMS.has(lower)) return true;

    const tokens = lower.split(/\s+/);
    if (tokens.some((token) => TRAVEL_IDEOLOGY_TOKENS.has(token))) return true;
    return TRAVEL_IDEOLOGY_PHRASES.some((phrase) => lower.includes(phrase));
}

export function isMetaInterestCandidate(term: string): boolean {
    const normalized = normalizeTerm(term);
    if (!normalized) return false;
    if (normalized.length > MAX_INTEREST_QUERY_CHARS) return false;

    const tokens = normalized.split(/\s+/).filter(Boolean);
    if (tokens.length === 0 || tokens.length > MAX_INTEREST_QUERY_WORDS) return false;
    if (tokens.some((token) => PHRASE_STOPWORDS.has(token))) return false;
    if (tokens.some((token) => LOW_SIGNAL_TOKENS.has(token))) return false;
    return true;
}

export function pushUnique(target: string[], candidate: string, max: number): boolean {
    const normalized = normalizeTerm(candidate);
    if (!normalized || isGenericTerm(normalized) || !isMetaInterestCandidate(normalized)) return false;
    if (target.includes(normalized)) return false;
    if (target.length >= max) return false;
    target.push(normalized);
    return true;
}

export function extractWordPhrases(source: string): string[] {
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

export function explodeInterestSegments(source: string): string[] {
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

export function buildResolutionCandidates(query: string): string[] {
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

export function scoreInterestResult(result: MetaInterestSearchResult, query: string): number {
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

/** Append normalized, deduped, Meta-safe interest atoms extracted from free-text sources. */
export function appendInterestAtoms(target: string[], sources: string[], max: number): void {
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

/** Append normalized, deduped, Meta-safe interest atoms without sub-phrase decomposition. */
export function appendCompactTerms(target: string[], sources: string[], max: number): void {
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

/**
 * Ask the LLM for 2-6 broad, verified Meta interest taxonomy category names
 * for a niche, as a deliverability fallback when hyper-specific terms fail
 * to resolve to real interest ids.
 */
export async function resolveMetaParentNodesForNiche(
    nicheContext: string,
    seedKeywords: string[],
): Promise<string[]> {
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
            prompt: `Niche signals:\n${nicheContext}\n\nSeed keywords: ${seedKeywords.join(', ')}`,
            timeoutMs: 15_000,
        });
        return object.parentNodes;
    } catch {
        return [];
    }
}

export async function resolveInterestQuery(
    config: MetaAdsConfig,
    query: string,
    options: { allowGenericInterestNames?: string[] } = {},
): Promise<MetaResolvedInterest | null> {
    const allowedGenericNames = new Set((options.allowGenericInterestNames ?? []).map(normalizeTerm));
    const cacheKey = `${config.adAccountId}:${query}:${Array.from(allowedGenericNames).sort().join('|')}`;
    if (interestCache.has(cacheKey)) {
        return interestCache.get(cacheKey) ?? null;
    }

    const candidateQueries = [query, ...buildResolutionCandidates(query)];

    for (const candidateQuery of candidateQueries) {
        const results = await searchMetaAdInterests(config.accessToken, candidateQuery, 6);
        const scored = results
            .filter((interest) => !isGenericTerm(interest.name) || allowedGenericNames.has(normalizeTerm(interest.name)))
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

export async function resolveInterestQueries(
    config: MetaAdsConfig | undefined,
    queries: string[],
    options: { allowGenericInterestNames?: string[] } = {},
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
            const interest = await resolveInterestQuery(config, query, options);
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
