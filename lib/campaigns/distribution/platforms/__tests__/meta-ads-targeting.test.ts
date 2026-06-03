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
        const pkg = await synthesizeMetaTargeting(makeCampaign(), { resolveInterestIds: false });

        assert.ok(
            pkg.interestQueries.length >= 5 && pkg.interestQueries.length <= 12,
            `expected 5-12 queries, got ${pkg.interestQueries.length}: ${pkg.interestQueries.join(', ')}`,
        );
        assert.ok(pkg.interestQueries.includes('board games'));
        assert.ok(pkg.interestQueries.includes('tabletop gaming'));
        assert.equal(pkg.resolvedInterests.length, 0);
        assert.equal(pkg.unresolvedQueries.length, pkg.interestQueries.length);
        assert.match(pkg.summary, /Interest queries \(\d+\):/);
        assert.match(pkg.rationale, /Generic cruise \/ travel \/ vacation terms excluded/);
    });

    await runTest('rejects generic cruise and travel seed terms before Meta resolution', async () => {
        const pkg = await synthesizeMetaTargeting(
            makeCampaign({
                targetingKeywords: ['cruise', 'vacation', 'travel', 'board games'],
            }),
            { resolveInterestIds: false },
        );

        assert.ok(!pkg.seedKeywords.includes('cruise'));
        assert.ok(!pkg.seedKeywords.includes('vacation'));
        assert.ok(!pkg.seedKeywords.includes('travel'));
        assert.ok(pkg.seedKeywords.includes('board games'));
    });

    await runTest('throws when all seed keywords are generic', async () => {
        await assert.rejects(
            () =>
                synthesizeMetaTargeting(
                    makeCampaign({ targetingKeywords: ['cruise', 'vacation', 'travel'] }),
                    { resolveInterestIds: false },
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
                    { resolveInterestIds: false },
                ),
            MetaTargetingSynthesisError,
        );
    });
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
