import type { Campaign } from '../../../types';
import { normalizeCampaignResearchDossier } from '../../../schema';
import type { MetaAdsConfig } from '../../../../integrations/meta-ads';
import {
    appendCompactTerms,
    appendInterestAtoms,
    isGenericTerm,
    MAX_INTEREST_QUERIES,
    MIN_INTEREST_QUERIES,
    normalizeTerm,
    pushUnique,
    resolveInterestQueries,
    resolveMetaParentNodesForNiche,
    type MetaResolvedInterest,
} from './interest-resolution-core';

export type { MetaResolvedInterest } from './interest-resolution-core';

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

    return resolveMetaParentNodesForNiche(nicheContext, seedKeywords);
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

    appendCompactTerms(queries, dossierStructuredTerms(campaign), MAX_INTEREST_QUERIES);

    appendInterestAtoms(queries, dossierTextSources(campaign), MAX_INTEREST_QUERIES);
    appendInterestAtoms(queries, campaign.audienceSignals ?? [], MAX_INTEREST_QUERIES);
    appendInterestAtoms(queries, campaignSupportTextSources(campaign), MAX_INTEREST_QUERIES);

    return queries;
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
        ? await resolveInterestQueries(options.config, interestQueries)
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
