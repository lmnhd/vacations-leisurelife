import type { Campaign } from '../../../types';
import { normalizeCampaignResearchDossier } from '../../../schema';

export interface GoogleTargetingPackage {
    keywords: string[];
    placements: string[];
    negativeKeywords: string[];
    summary: string;
    rationale: string;
    seedKeywords: string[];
    audienceSignals: string[];
    placementSources: Array<'audience_signals' | 'research_dossier' | 'niche_text_fields' | 'keyword_derived'>;
}

export class TargetingSynthesisError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'TargetingSynthesisError';
    }
}

const MIN_KEYWORDS = 10;
const MAX_KEYWORDS = 15;
const MIN_PLACEMENTS = 5;
const MAX_PLACEMENTS = 10;

const GENERIC_SUBREDDIT_DENY = new Set([
    'cruise',
    'cruises',
    'travel',
    'vacation',
    'vacations',
    'holiday',
    'holidays',
    'trip',
    'trips',
    'tourism',
    'getaway',
    'wanderlust',
]);

const GENERIC_DENY_TERMS = new Set([
    'cruise',
    'cruises',
    'cruising',
    'cruise vacation',
    'cruise vacations',
    'cruise deals',
    'cruise deal',
    'cheap cruise',
    'cheap cruises',
    'best cruise',
    'best cruises',
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
]);

const DEFAULT_NEGATIVE_KEYWORDS = [
    'cheap cruise',
    'cruise deals',
    'last minute cruise',
    'discount cruise',
    'all inclusive cruise',
    'family cruise',
    'cruise jobs',
];

function normalizeTerm(value: string): string {
    return value
        .replace(/[\s ]+/g, ' ')
        .trim()
        .toLowerCase();
}

function isGenericTerm(term: string): boolean {
    const lower = normalizeTerm(term);
    if (!lower) return true;
    if (GENERIC_DENY_TERMS.has(lower)) return true;
    // Single-word stems like "cruise"/"travel" embedded as the only token
    const tokens = lower.split(/\s+/);
    if (tokens.length === 1 && GENERIC_DENY_TERMS.has(tokens[0])) {
        return true;
    }
    return false;
}

function pushUnique(target: string[], candidate: string, max: number): boolean {
    const normalized = normalizeTerm(candidate);
    if (!normalized) return false;
    if (target.includes(normalized)) return false;
    if (target.length >= max) return false;
    target.push(normalized);
    return true;
}

function extractWordPhrases(source: string): string[] {
    if (!source) return [];
    const cleaned = source
        .replace(/[“”"'`]/g, '')
        .replace(/[^a-zA-Z0-9\s\-\/]/g, ' ')
        .toLowerCase();

    const phrases = new Set<string>();
    // Multi-word noun-like phrases: 2-4 consecutive lowercase words
    const tokens = cleaned.split(/\s+/).filter((token) => token.length > 2);
    for (let i = 0; i < tokens.length; i += 1) {
        for (let len = 2; len <= 3 && i + len <= tokens.length; len += 1) {
            const phrase = tokens.slice(i, i + len).join(' ');
            if (phrase.length >= 8 && phrase.length <= 40) {
                phrases.add(phrase);
            }
        }
    }
    return Array.from(phrases);
}

function extractPlacementsFromText(
    sources: string[],
    placements: string[],
): void {
    const subredditPattern = /\br\/([a-z0-9_]+)/gi;
    const youtubeHandlePattern = /(?:youtube\.com\/)?@([a-z0-9_\-]{3,})/gi;
    const domainPattern = /\b((?:www\.)?[a-z0-9][a-z0-9-]*\.[a-z]{2,})(?:\/[a-z0-9_\-\/]*)?/gi;

    for (const raw of sources) {
        if (!raw) continue;
        const signal = raw.toString();

        let match: RegExpExecArray | null;
        subredditPattern.lastIndex = 0;
        while ((match = subredditPattern.exec(signal)) !== null) {
            const slug = match[1].toLowerCase();
            if (GENERIC_SUBREDDIT_DENY.has(slug)) continue;
            pushUnique(placements, `reddit.com/r/${slug}`, MAX_PLACEMENTS);
        }

        youtubeHandlePattern.lastIndex = 0;
        while ((match = youtubeHandlePattern.exec(signal)) !== null) {
            pushUnique(placements, `youtube.com/@${match[1].toLowerCase()}`, MAX_PLACEMENTS);
        }

        domainPattern.lastIndex = 0;
        while ((match = domainPattern.exec(signal)) !== null) {
            const domain = match[1].toLowerCase().replace(/^www\./, '');
            if (domain === 'reddit.com' || domain === 'youtube.com' || domain.length < 5) {
                continue;
            }
            pushUnique(placements, domain, MAX_PLACEMENTS);
        }
    }
}

function deriveSubredditCandidatesFromKeywords(keywords: string[]): string[] {
    const candidates: string[] = [];

    for (const keyword of keywords) {
        if (candidates.length >= MAX_PLACEMENTS) break;
        if (isGenericTerm(keyword)) continue;

        const tokens = keyword.split(/\s+/).filter((token) => token.length > 0);
        const compact = tokens.join('').toLowerCase().replace(/[^a-z0-9]/g, '');
        if (compact.length >= 4 && !GENERIC_SUBREDDIT_DENY.has(compact)) {
            pushUnique(candidates, `reddit.com/r/${compact}`, MAX_PLACEMENTS);
        }

        // Also try the longest single token (e.g. "forest bathing" → "forestbathing" above + "forestbathing"); also seed the head token if compound
        if (tokens.length > 1) {
            const headToken = tokens[tokens.length - 1].toLowerCase();
            if (headToken.length >= 4 && !GENERIC_SUBREDDIT_DENY.has(headToken)) {
                pushUnique(candidates, `reddit.com/r/${headToken}`, MAX_PLACEMENTS);
            }
        }
    }

    return candidates;
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
    ].filter((value): value is string => typeof value === 'string' && value.length > 0);
}

function nicheTextSources(campaign: Campaign): string[] {
    const fields: Array<string | string[] | undefined> = [
        campaign.researchRationale,
        campaign.successLogic,
        campaign.communityFitRationale,
        campaign.vacationFitRationale,
        campaign.nicheExpressionMode,
        campaign.optionalityStyle,
        campaign.cruiseNativeMoments,
        campaign.allowedThemeSignals,
        campaign.optionalGatheringMoments,
        campaign.highlightEvents,
    ];

    const out: string[] = [];
    for (const value of fields) {
        if (!value) continue;
        if (Array.isArray(value)) {
            for (const entry of value) {
                if (typeof entry === 'string' && entry.length > 0) out.push(entry);
            }
        } else if (typeof value === 'string' && value.length > 0) {
            out.push(value);
        }
    }
    return out;
}

function buildPlacementSet(
    campaign: Campaign,
    audienceSignals: string[],
    keywords: string[],
): { placements: string[]; sources: GoogleTargetingPackage['placementSources'] } {
    const placements: string[] = [];
    const sources: GoogleTargetingPackage['placementSources'] = [];

    const beforeAudience = placements.length;
    extractPlacementsFromText(audienceSignals, placements);
    if (placements.length > beforeAudience) sources.push('audience_signals');

    if (placements.length < MAX_PLACEMENTS) {
        const beforeDossier = placements.length;
        extractPlacementsFromText(dossierTextSources(campaign), placements);
        if (placements.length > beforeDossier) sources.push('research_dossier');
    }

    if (placements.length < MAX_PLACEMENTS) {
        const beforeNiche = placements.length;
        extractPlacementsFromText(nicheTextSources(campaign), placements);
        if (placements.length > beforeNiche) sources.push('niche_text_fields');
    }

    if (placements.length < MIN_PLACEMENTS) {
        const beforeDerived = placements.length;
        for (const candidate of deriveSubredditCandidatesFromKeywords(keywords)) {
            pushUnique(placements, candidate, MAX_PLACEMENTS);
            if (placements.length >= MAX_PLACEMENTS) break;
        }
        if (placements.length > beforeDerived) sources.push('keyword_derived');
    }

    return { placements, sources };
}

function buildKeywordExpansion(
    seedKeywords: string[],
    nicheExpressionMode: string | undefined,
    highlightEvents: string[],
    researchRationale: string | undefined,
): string[] {
    const keywords: string[] = [];

    for (const seed of seedKeywords) {
        if (!isGenericTerm(seed)) {
            pushUnique(keywords, seed, MAX_KEYWORDS);
        }
    }

    // Expand from highlight events (specific, campaign-native)
    for (const event of highlightEvents) {
        if (!event || isGenericTerm(event)) continue;
        const phrases = extractWordPhrases(event);
        for (const phrase of phrases) {
            if (!isGenericTerm(phrase)) {
                pushUnique(keywords, phrase, MAX_KEYWORDS);
            }
            if (keywords.length >= MAX_KEYWORDS) break;
        }
        if (keywords.length >= MAX_KEYWORDS) break;
    }

    // Expand from niche expression mode (a sentence describing tone)
    if (nicheExpressionMode && keywords.length < MAX_KEYWORDS) {
        for (const phrase of extractWordPhrases(nicheExpressionMode)) {
            if (!isGenericTerm(phrase)) {
                pushUnique(keywords, phrase, MAX_KEYWORDS);
            }
            if (keywords.length >= MAX_KEYWORDS) break;
        }
    }

    // Fall back to research rationale phrases (most generic source - last)
    if (researchRationale && keywords.length < MAX_KEYWORDS) {
        for (const phrase of extractWordPhrases(researchRationale)) {
            if (!isGenericTerm(phrase)) {
                pushUnique(keywords, phrase, MAX_KEYWORDS);
            }
            if (keywords.length >= MAX_KEYWORDS) break;
        }
    }

    return keywords;
}

function buildSummary(pkg: Omit<GoogleTargetingPackage, 'summary' | 'rationale'>): {
    summary: string;
    rationale: string;
} {
    const summaryLines: string[] = [];
    summaryLines.push(`Keywords (${pkg.keywords.length}): ${pkg.keywords.join(', ')}`);
    if (pkg.placements.length > 0) {
        summaryLines.push(
            `Placements (${pkg.placements.length}, sources: ${pkg.placementSources.join('+') || 'none'}): ${pkg.placements.join(', ')}`,
        );
    } else {
        summaryLines.push(
            'Placements: none — niche fields and keyword-derived fallbacks produced no usable URLs.',
        );
    }
    summaryLines.push(`Negative keywords (${pkg.negativeKeywords.length}): ${pkg.negativeKeywords.join(', ')}`);

    const rationaleLines: string[] = [
        `Seeded from ${pkg.seedKeywords.length} campaign.targetingKeywords term(s).`,
        `Expanded with ${pkg.audienceSignals.length} audience signal(s).`,
        pkg.placementSources.length > 0
            ? `Placements sourced from: ${pkg.placementSources.join(', ')}.`
            : 'No placement sources contributed.',
        'Generic cruise / travel / vacation terms excluded by design.',
    ];

    return {
        summary: summaryLines.join('\n'),
        rationale: rationaleLines.join(' '),
    };
}

export function synthesizeGoogleTargeting(campaign: Campaign): GoogleTargetingPackage {
    const seedKeywords = (campaign.targetingKeywords ?? [])
        .map(normalizeTerm)
        .filter((term) => term.length > 0);

    const audienceSignals = (campaign.audienceSignals ?? [])
        .map((signal) => (signal ?? '').toString().trim())
        .filter((signal) => signal.length > 0);

    if (seedKeywords.length === 0) {
        throw new TargetingSynthesisError(
            `Campaign "${campaign.id}" has no targetingKeywords. ` +
                'Refusing to synthesize Google Ads targeting from generic cruise/travel terms. ' +
                'Populate campaign.targetingKeywords with niche-specific phrases first.',
        );
    }

    if (audienceSignals.length === 0) {
        throw new TargetingSynthesisError(
            `Campaign "${campaign.id}" has no audienceSignals. ` +
                'Refusing to broaden Google Ads targeting without niche audience evidence. ' +
                'Populate campaign.audienceSignals with concrete community signals first.',
        );
    }

    const nonGenericSeeds = seedKeywords.filter((seed) => !isGenericTerm(seed));
    if (nonGenericSeeds.length === 0) {
        throw new TargetingSynthesisError(
            `Campaign "${campaign.id}" has only generic seed keywords (cruise/travel/vacation). ` +
                'Refusing to broaden audience. Add niche-specific seed terms.',
        );
    }

    const keywords = buildKeywordExpansion(
        nonGenericSeeds,
        campaign.nicheExpressionMode,
        campaign.highlightEvents ?? [],
        campaign.researchRationale,
    );

    if (keywords.length < MIN_KEYWORDS) {
        throw new TargetingSynthesisError(
            `Campaign "${campaign.id}" only yielded ${keywords.length} niche keyword(s) ` +
                `(minimum ${MIN_KEYWORDS}). Enrich targetingKeywords, highlightEvents, or nicheExpressionMode ` +
                'with more campaign-native terms before retrying.',
        );
    }

    const { placements, sources: placementSources } = buildPlacementSet(
        campaign,
        audienceSignals,
        keywords,
    );

    const negativeKeywords: string[] = [];
    for (const term of DEFAULT_NEGATIVE_KEYWORDS) {
        pushUnique(negativeKeywords, term, DEFAULT_NEGATIVE_KEYWORDS.length);
    }

    const partial = {
        keywords,
        placements,
        negativeKeywords,
        seedKeywords: nonGenericSeeds,
        audienceSignals,
        placementSources,
    } as const;

    const { summary, rationale } = buildSummary(partial);

    return {
        ...partial,
        summary,
        rationale,
    };
}
