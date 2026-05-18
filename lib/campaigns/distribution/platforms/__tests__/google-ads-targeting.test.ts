import assert from 'node:assert/strict';

import type { Campaign } from '../../../types';
import {
    TargetingSynthesisError,
    synthesizeGoogleTargeting,
} from '../google-ads/targeting';

async function runTest(label: string, fn: () => Promise<void> | void): Promise<void> {
    try {
        await fn();
        console.log(`✓ ${label}`);
    } catch (error) {
        console.error(`✗ ${label}`);
        console.error(error);
        throw error;
    }
}

function makeCampaign(overrides: Partial<Campaign> = {}): Campaign {
    return {
        PK: 'CAMPAIGN#wellness-and-nature-cruise',
        SK: 'METADATA',
        id: 'wellness-and-nature-cruise',
        name: 'Wellness & Nature Cruise',
        description: 'A wellness-and-nature themed group cruise.',
        targetDates: '2026-10-01',
        targetDestination: 'Norwegian Fjords',
        shipTarget: 'Holland America Rotterdam',
        highlightEvents: [
            'sunrise yoga deck flow',
            'forest bathing shore excursion',
            'breathwork lounge sessions',
        ],
        targetingKeywords: [
            'wellness retreat',
            'forest bathing',
            'sunrise yoga',
            'mindful nature travel',
        ],
        minCabinsRequired: 8,
        status: 'GATHERING_INTEREST',
        researchRationale:
            'r/yoga and r/forestbathing show consistent meetup demand; nature retreat newsletters report sold-out cohorts; mindfulness creators on youtube drive consistent saves on slow-cinema clips.',
        audienceSignals: [
            'r/yoga 12k+ upvotes on retreat meetup threads',
            'r/forestbathing growing weekly with shinrin-yoku creators',
            'youtube.com/@yogawithadriene retreat-adjacent audience',
            'mindbodygreen.com retreat features convert mid-funnel',
        ],
        nicheExpressionMode:
            'gentle ambient signals: slow flow practice, herbal tea moments, quiet shore walks',
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-05-01T00:00:00.000Z',
        ...overrides,
    };
}

async function main(): Promise<void> {
    await runTest('synthesizes 10-15 niche keywords from campaign seed', () => {
        const pkg = synthesizeGoogleTargeting(makeCampaign());

        assert.ok(
            pkg.keywords.length >= 10 && pkg.keywords.length <= 15,
            `expected 10-15 keywords, got ${pkg.keywords.length}: ${pkg.keywords.join(', ')}`,
        );
        // All seed keywords should be present (first priority)
        assert.ok(pkg.keywords.includes('wellness retreat'));
        assert.ok(pkg.keywords.includes('forest bathing'));
        assert.ok(pkg.keywords.includes('sunrise yoga'));
    });

    await runTest('rejects generic cruise / travel / vacation terms', () => {
        const pkg = synthesizeGoogleTargeting(makeCampaign());

        for (const generic of ['cruise', 'cruises', 'travel', 'vacation', 'holiday', 'getaway']) {
            assert.ok(
                !pkg.keywords.includes(generic),
                `generic term "${generic}" leaked into keyword set: ${pkg.keywords.join(', ')}`,
            );
        }
    });

    await runTest('extracts placements from audienceSignals (reddit + youtube + domains)', () => {
        const pkg = synthesizeGoogleTargeting(makeCampaign());

        assert.ok(
            pkg.placements.includes('reddit.com/r/yoga'),
            `expected reddit.com/r/yoga, got placements: ${pkg.placements.join(', ')}`,
        );
        assert.ok(pkg.placements.includes('reddit.com/r/forestbathing'));
        assert.ok(pkg.placements.includes('youtube.com/@yogawithadriene'));
        assert.ok(pkg.placements.includes('mindbodygreen.com'));
        assert.ok(pkg.placements.length <= 10);
    });

    await runTest('throws when campaign has no targetingKeywords', () => {
        assert.throws(
            () => synthesizeGoogleTargeting(makeCampaign({ targetingKeywords: [] })),
            TargetingSynthesisError,
        );
    });

    await runTest('throws when campaign has no audienceSignals', () => {
        assert.throws(
            () => synthesizeGoogleTargeting(makeCampaign({ audienceSignals: [] })),
            TargetingSynthesisError,
        );
    });

    await runTest('throws when all seed keywords are generic', () => {
        assert.throws(
            () =>
                synthesizeGoogleTargeting(
                    makeCampaign({ targetingKeywords: ['cruise', 'vacation', 'travel'] }),
                ),
            TargetingSynthesisError,
        );
    });

    await runTest('throws when niche signal is too thin to reach minimum keyword count', () => {
        assert.throws(
            () =>
                synthesizeGoogleTargeting(
                    makeCampaign({
                        targetingKeywords: ['wellness retreat'],
                        highlightEvents: [],
                        nicheExpressionMode: undefined,
                        researchRationale: undefined,
                    }),
                ),
            TargetingSynthesisError,
        );
    });

    await runTest('summary string lists keyword and placement counts', () => {
        const pkg = synthesizeGoogleTargeting(makeCampaign());

        assert.match(pkg.summary, /Keywords \(\d+\):/);
        assert.match(pkg.summary, /Placements/);
        assert.match(pkg.summary, /Negative keywords/);
        assert.ok(pkg.rationale.length > 0);
        assert.ok(pkg.seedKeywords.length >= 1);
    });

    await runTest('includes default negative keywords (generic cruise/travel exclusions)', () => {
        const pkg = synthesizeGoogleTargeting(makeCampaign());

        assert.ok(pkg.negativeKeywords.includes('cheap cruise'));
        assert.ok(pkg.negativeKeywords.includes('cruise deals'));
        assert.ok(pkg.negativeKeywords.includes('cruise jobs'));
    });

    await runTest('produces >=5 placements when audienceSignals are prose-only (no URLs)', () => {
        const proseCampaign = makeCampaign({
            audienceSignals: [
                'Wellness retreat operators report consistent sell-out cohorts after launching slow-cinema reels.',
                'Forest-bathing creators describe steady weekly cohort growth without paid promotion.',
                'Mindful nature creators see strong save rates on quiet outdoor practice clips.',
                'Sunrise yoga groups maintain ongoing meetup attendance through informal word-of-mouth.',
            ],
        });

        const pkg = synthesizeGoogleTargeting(proseCampaign);

        assert.ok(
            pkg.placements.length >= 5,
            `expected >=5 placements from prose-only signals, got ${pkg.placements.length}: ${pkg.placements.join(', ')}`,
        );
        assert.ok(pkg.placements.length <= 10);
        assert.ok(
            pkg.placementSources.includes('keyword_derived'),
            `expected keyword_derived in placementSources, got: ${pkg.placementSources.join(', ')}`,
        );
        // Generic subreddits must not leak in even through keyword-derived path
        for (const generic of ['reddit.com/r/cruise', 'reddit.com/r/travel', 'reddit.com/r/vacation']) {
            assert.ok(
                !pkg.placements.includes(generic),
                `generic placement "${generic}" leaked in: ${pkg.placements.join(', ')}`,
            );
        }
    });

    await runTest('prefers placements extracted from audienceSignals before keyword-derived fallback', () => {
        const pkg = synthesizeGoogleTargeting(makeCampaign());

        // makeCampaign() has URL-shaped audienceSignals — those should be picked up first
        assert.ok(pkg.placementSources.includes('audience_signals'));
        assert.ok(pkg.placements.indexOf('reddit.com/r/yoga') < pkg.placements.length);
    });

    await runTest('extracts placements from researchDossier when audienceSignals lack URLs', () => {
        const campaign = makeCampaign({
            audienceSignals: ['Plain prose with no URLs and no community handles.'],
            researchDossier: {
                nicheResearch: {
                    nicheTitle: 'Forest Bathing Retreats',
                    trendCycleSummary: 'Trend summary referencing youtube.com/@shinrinyokuwalk and r/forestbathing.',
                    whyThisTrendFeelsDistinctNow: 'Distinct because mindbodygreen.com keeps publishing retreat coverage.',
                    audienceRoutineInsights: [
                        'Audience routine cited in r/wellness threads about morning practice.',
                    ],
                    specificExamples: [
                        'See yogajournal.com retreat directory for cohort sizing.',
                    ],
                    allowedSignals: [],
                    discouragedSignals: [],
                    sourceNotes: ['Source: outsideonline.com retreat coverage 2025.'],
                },
                cruiseTranslation: {
                    cruiseNativeTranslationNotes: [],
                    downstreamImplications: {
                        briefDirection: [],
                        mediaGeneration: [],
                        copyDirection: [],
                    },
                },
            },
        });

        const pkg = synthesizeGoogleTargeting(campaign);

        assert.ok(
            pkg.placementSources.includes('research_dossier'),
            `expected research_dossier in placementSources, got: ${pkg.placementSources.join(', ')}`,
        );
        assert.ok(pkg.placements.includes('reddit.com/r/forestbathing'));
        assert.ok(pkg.placements.includes('youtube.com/@shinrinyokuwalk'));
        assert.ok(pkg.placements.includes('mindbodygreen.com'));
        assert.ok(pkg.placements.includes('yogajournal.com'));
    });

    await runTest('summary mentions placement source attribution', () => {
        const pkg = synthesizeGoogleTargeting(makeCampaign());
        assert.match(pkg.summary, /Placements \(\d+, sources: [a-z_+]+\)/);
    });
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
