import assert from 'node:assert/strict';

import type { Campaign } from '../../../types';
import {
    MetaTargetingSynthesisError,
    synthesizeMetaTargeting,
} from '../meta-ads/targeting';

async function runTest(label: string, fn: () => Promise<void> | void): Promise<void> {
    try {
        await fn();
        console.log(`PASS ${label}`);
    } catch (error) {
        console.error(`FAIL ${label}`);
        console.error(error);
        throw error;
    }
}

// Stub that bypasses live LLM calls in all tests that aren't specifically testing parent resolution.
const noopParents = async (): Promise<string[]> => [];

function makeCampaign(overrides: Partial<Campaign> = {}): Campaign {
    return {
        PK: 'CAMPAIGN#tabletop-at-sea',
        SK: 'METADATA',
        id: 'tabletop-at-sea',
        name: 'Tabletop at Sea',
        description: 'A tabletop gaming themed group cruise.',
        targetDates: '2026-10-01',
        targetDestination: 'Eastern Caribbean',
        shipTarget: 'Celebrity Apex',
        highlightEvents: [
            'board game socials in the lounge',
            'strategy game meetups after dinner',
            'casual dice and card game tables',
        ],
        targetingKeywords: [
            'board games',
            'tabletop gaming',
            'strategy games',
            'dice games',
        ],
        minCabinsRequired: 8,
        status: 'GATHERING_INTEREST',
        researchRationale:
            'r/boardgames and tabletop convention communities show steady interest in destination meetups, with Gen Con adjacent audiences discussing travel plans.',
        audienceSignals: [
            'r/boardgames meetup threads show strong discussion volume',
            'BoardGameGeek communities track convention travel and publisher events',
            'Gen Con attendees often look for social tabletop events outside the show floor',
        ],
        nicheExpressionMode:
            'relaxed social play, compact games, low-pressure strategy conversations, and welcoming hobby cues',
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-05-01T00:00:00.000Z',
        ...overrides,
    };
}

async function main(): Promise<void> {
    await runTest('synthesizes Meta interest queries from niche campaign fields', async () => {
        const pkg = await synthesizeMetaTargeting(makeCampaign(), {
            resolveInterestIds: false,
            resolveParentNodes: noopParents,
        });

        assert.ok(
            pkg.interestQueries.length >= 5 && pkg.interestQueries.length <= 12,
            `expected 5-12 queries, got ${pkg.interestQueries.length}: ${pkg.interestQueries.join(', ')}`,
        );
        assert.ok(pkg.interestQueries.includes('board games'));
        assert.ok(pkg.interestQueries.includes('tabletop gaming'));
        assert.equal(pkg.resolvedInterests.length, 0);
        assert.equal(pkg.unresolvedQueries.length, pkg.interestQueries.length);
        assert.match(pkg.summary, /Interest queries \(\d+\):/);
        assert.match(pkg.rationale, /Travel ideology terms/);
    });

    await runTest('rejects generic cruise and travel seed terms before Meta resolution', async () => {
        const pkg = await synthesizeMetaTargeting(
            makeCampaign({
                targetingKeywords: ['cruise', 'vacation', 'travel', 'board games'],
            }),
            { resolveInterestIds: false, resolveParentNodes: noopParents },
        );

        assert.ok(!pkg.seedKeywords.includes('cruise'));
        assert.ok(!pkg.seedKeywords.includes('vacation'));
        assert.ok(!pkg.seedKeywords.includes('travel'));
        assert.ok(pkg.seedKeywords.includes('board games'));
    });

    await runTest('keeps fiber interest queries inside the yarn and knitting circle', async () => {
        const pkg = await synthesizeMetaTargeting(
            makeCampaign({
                id: 'fiber-arts-yarn-tasting-voyage',
                name: 'Fiber Arts Yarn-Tasting Voyage',
                description: 'A fiber arts themed cruise.',
                targetingKeywords: [
                    'knitting cruise',
                    'crochet group travel',
                    'ravelry community',
                    'yarn tasting',
                    'slow making vacation',
                    'indie yarn',
                    'sunset shawl',
                ],
                highlightEvents: [
                    'morning stitch circles',
                    'indie yarn tasting tables',
                    'sunset shawl show and tell',
                ],
                researchRationale:
                    'Ravelry groups, r/knitting, r/crochet, indie dyer newsletters, yarn shops, and knit-along communities show active fiber arts demand.',
                audienceSignals: [
                    'r/knitting project threads show strong daily discussion volume',
                    'r/crochet pattern help threads stay active',
                    'r/yarnaddicts regularly discusses indie dyers and yarn clubs',
                ],
                nicheExpressionMode:
                    'fiber artists share skein notes, compare indie dyers, discuss shawl patterns, and browse yarn tasting tables',
            }),
            { resolveInterestIds: false, resolveParentNodes: noopParents },
        );

        for (const forbidden of ['knitting cruise', 'crochet group travel', 'slow making vacation']) {
            assert.ok(!pkg.interestQueries.includes(forbidden), `travel-framed query leaked: ${forbidden}`);
        }
        for (const allowed of ['ravelry community', 'yarn tasting', 'indie yarn', 'sunset shawl']) {
            assert.ok(pkg.interestQueries.includes(allowed), `expected niche-native query: ${allowed}`);
        }
        for (const query of pkg.interestQueries) {
            assert.ok(!query.includes('cruise'), `cruise query leaked: ${query}`);
            assert.ok(!query.includes('travel'), `travel query leaked: ${query}`);
            assert.ok(!query.includes('vacation'), `vacation query leaked: ${query}`);
        }
    });

    await runTest('prioritizes dossier-native interest language before campaign-invented phrasing', async () => {
        const pkg = await synthesizeMetaTargeting(
            makeCampaign({
                id: 'fiber-circle',
                targetingKeywords: ['yarn', 'knitting', 'ravelry'],
                audienceSignals: [
                    'r/knitting knit-along threads stay active each week',
                    'r/yarnaddicts discussions center indie dyers and local yarn shops',
                ],
                highlightEvents: [
                    'morning stitch circles on deck',
                    'yarn tasting tables at sunset',
                ],
                nicheExpressionMode:
                    'soft fiber rituals, morning stitch circles, and tasting-table moments',
                researchRationale:
                    'Campaign prose keeps inventing poetic event labels that do not come from the underlying niche research.',
                researchDossier: {
                    nicheResearch: {
                        nicheTitle: 'Indie Yarn and Knit-Along Culture',
                        trendCycleSummary:
                            'Current yarn-community momentum lives in knit-alongs, local yarn shops, and indie dyer launches.',
                        whyThisTrendFeelsDistinctNow:
                            'People are trading project notes, pattern talk, and hand-dyed skein drops in public hobby spaces.',
                        audienceRoutineInsights: [
                            'Knitters compare project bags, swap row-counting habits, and share shawl progress.',
                        ],
                        specificExamples: [
                            'local yarn shop',
                            'knit along',
                            'indie dyers',
                            'hand dyed yarn',
                        ],
                        allowedSignals: [
                            'project bag',
                            'shawl knitting',
                        ],
                        discouragedSignals: ['costume pirate knitting'],
                        sourceNotes: ['Ravelry forum language and yarn-shop event listings shaped these terms.'],
                    },
                    cruiseTranslation: {
                        cruiseNativeTranslationNotes: [
                            'The ship angle belongs later, after niche trust is established.',
                        ],
                        downstreamImplications: {
                            briefDirection: [],
                            mediaGeneration: [],
                            copyDirection: [],
                        },
                    },
                },
            }),
            { resolveInterestIds: false, resolveParentNodes: noopParents },
        );

        const expectedDossierTerms = [
            'local yarn shop',
            'knit along',
            'indie dyers',
            'hand dyed yarn',
            'project bag',
            'shawl knitting',
        ];
        for (const term of expectedDossierTerms) {
            assert.ok(pkg.interestQueries.includes(term), `expected dossier-native interest query: ${term}`);
        }
        assert.ok(!pkg.interestQueries.includes('morning stitch circles'));
        assert.ok(!pkg.interestQueries.includes('yarn tasting tables'));
    });

    await runTest('compresses long dossier signal prose into short Meta-safe interest atoms', async () => {
        const pkg = await synthesizeMetaTargeting(
            makeCampaign({
                id: 'fiber-long',
                targetingKeywords: ['ravelry community', 'yarn tasting'],
                audienceSignals: [
                    'r/knitting project threads show strong daily discussion volume',
                    'r/yarnaddicts regularly discusses indie dyers and yarn clubs',
                ],
                researchDossier: {
                    nicheResearch: {
                        nicheTitle: 'Fiber Arts Yarn Tasting',
                        trendCycleSummary:
                            'Knitters share project notes and hand-dyed skein finds in public hobby spaces.',
                        whyThisTrendFeelsDistinctNow:
                            'Yarn circles center tools, texture, and indie dyers more than generic travel framing.',
                        audienceRoutineInsights: [],
                        specificExamples: [],
                        allowedSignals: [
                            'canvas or quilted project bags with yarn peeking out',
                            'wood or bamboo needles, ergonomic crochet hooks, slim notions tins',
                            'stitch markers clipped to the work and a row counter nearby',
                            'insider shorthand used lightly and naturally: wip, frogged it, stash, gauge, blocking',
                            'natural light on textured stitches: ribbing, lace, moss stitch, cables, granny motifs',
                        ],
                        discouragedSignals: [],
                        sourceNotes: [],
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
            }),
            { resolveInterestIds: false, resolveParentNodes: noopParents },
        );

        for (const expected of [
            'quilted project bags',
            'crochet hooks',
            'notions tins',
            'stitch markers',
            'stash',
            'gauge',
            'blocking',
        ]) {
            assert.ok(pkg.interestQueries.includes(expected), `expected Meta-safe atom: ${expected}`);
        }
        for (const forbidden of [
            'canvas or quilted project bags with yarn peeking out',
            'wood or bamboo needles, ergonomic crochet hooks, slim notions tins',
            'stitch markers clipped to the work and a row counter nearby',
            'wip',
            'frogged it',
        ]) {
            assert.ok(!pkg.interestQueries.includes(forbidden), `unexpected long or low-signal query: ${forbidden}`);
        }
        for (const query of pkg.interestQueries) {
            assert.ok(query.split(/\s+/).length <= 4, `query should stay compact: ${query}`);
            assert.ok(!/[,:?]/.test(query), `query should not contain prose punctuation: ${query}`);
        }
    });

    await runTest('injects AI-resolved parent nodes ahead of text-mined atoms', async () => {
        const stubbedParents = ['Knitting', 'Crochet', 'Quilting'];
        const pkg = await synthesizeMetaTargeting(
            makeCampaign({
                id: 'fiber-parent-injection',
                targetingKeywords: ['ravelry community', 'yarn tasting', 'crochet hooks', 'quilted project bags'],
                audienceSignals: ['r/knitting threads show active engagement'],
                highlightEvents: ['morning stitch circles', 'indie yarn tasting tables'],
                researchRationale: 'Fiber arts community overlaps knitting, crochet, and quilting niches.',
                nicheExpressionMode: 'knitters comparing project bags and indie dyers',
            }),
            {
                resolveInterestIds: false,
                resolveParentNodes: async () => stubbedParents,
            },
        );

        // All stubbed parents must appear in the query list
        for (const parent of ['knitting', 'crochet', 'quilting']) {
            assert.ok(
                pkg.interestQueries.includes(parent),
                `expected parent node "${parent}"; got: ${pkg.interestQueries.join(', ')}`,
            );
        }
        // Parent nodes must be surfaced on the package for preview/audit
        for (const parent of ['knitting', 'crochet', 'quilting']) {
            assert.ok(pkg.parentNodes.includes(parent), `expected parentNodes to include "${parent}"`);
        }
        // Niche atoms must still be present alongside parents
        assert.ok(pkg.interestQueries.includes('ravelry community'), 'ravelry community should remain');
        // Summary must reference parent nodes
        assert.match(pkg.summary, /AI-resolved parent nodes/);
    });

    await runTest('throws when all seed keywords are generic', async () => {
        await assert.rejects(
            () =>
                synthesizeMetaTargeting(
                    makeCampaign({ targetingKeywords: ['cruise', 'vacation', 'travel'] }),
                    { resolveInterestIds: false, resolveParentNodes: noopParents },
                ),
            MetaTargetingSynthesisError,
        );
    });

    await runTest('throws when niche text is too thin for an ad set audience', async () => {
        await assert.rejects(
            () =>
                synthesizeMetaTargeting(
                    makeCampaign({
                        targetingKeywords: ['board games'],
                        highlightEvents: [],
                        researchRationale: undefined,
                        audienceSignals: [],
                        nicheExpressionMode: undefined,
                    }),
                    { resolveInterestIds: false, resolveParentNodes: noopParents },
                ),
            MetaTargetingSynthesisError,
        );
    });
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
