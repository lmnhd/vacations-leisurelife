import assert from 'node:assert/strict';
import { enums } from 'google-ads-api';

import type { GoogleTargetingPackage } from '../google-ads/targeting';
import {
    type AdGroupCriterionRow,
    buildAdGroupCriterionOperations,
    summarizeTargetingVerification,
} from '../google-ads/campaign';

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

function makeTargeting(overrides: Partial<GoogleTargetingPackage> = {}): GoogleTargetingPackage {
    return {
        keywords: ['forest bathing', 'sunrise yoga deck flow', 'wellness retreat'],
        placements: ['reddit.com/r/yoga', 'youtube.com/@yogawithadriene'],
        negativeKeywords: ['cheap cruise', 'cruise deals'],
        summary: 'Keywords (3): forest bathing, sunrise yoga deck flow, wellness retreat',
        rationale: 'Test rationale',
        seedKeywords: ['wellness retreat', 'forest bathing'],
        audienceSignals: ['r/yoga 12k+ upvotes'],
        placementSources: ['audience_signals'],
        ...overrides,
    };
}

async function main(): Promise<void> {
    await runTest('buildAdGroupCriterionOperations produces keyword + placement + negative criteria', () => {
        const targeting = makeTargeting();
        const ops = buildAdGroupCriterionOperations('customers/123/adGroups/456', targeting);

        assert.equal(
            ops.length,
            targeting.keywords.length + targeting.placements.length + targeting.negativeKeywords.length,
        );

        const keywordOps = ops.filter(
            (op) => (op as { keyword?: unknown; negative?: boolean }).keyword && !(op as { negative?: boolean }).negative,
        );
        const placementOps = ops.filter((op) => (op as { placement?: unknown }).placement);
        const negativeOps = ops.filter((op) => (op as { negative?: boolean }).negative === true);

        assert.equal(keywordOps.length, targeting.keywords.length);
        assert.equal(placementOps.length, targeting.placements.length);
        assert.equal(negativeOps.length, targeting.negativeKeywords.length);

        for (const op of ops) {
            assert.equal((op as { ad_group?: string }).ad_group, 'customers/123/adGroups/456');
        }

        const firstKeyword = keywordOps[0] as {
            keyword?: { text?: string; match_type?: number | string };
            status?: number | string;
        };
        assert.equal(firstKeyword.keyword?.text, 'forest bathing');
        assert.equal(firstKeyword.keyword?.match_type, enums.KeywordMatchType.BROAD);
        assert.equal(firstKeyword.status, enums.AdGroupCriterionStatus.ENABLED);

        const firstPlacement = placementOps[0] as { placement?: { url?: string } };
        assert.equal(firstPlacement.placement?.url, 'reddit.com/r/yoga');
    });

    await runTest('summarizeTargetingVerification reports matching readback', () => {
        const targeting = makeTargeting();
        const rows: AdGroupCriterionRow[] = [
            ...targeting.keywords.map((text) => ({
                ad_group_criterion: { negative: false, keyword: { text } },
            })),
            ...targeting.placements.map((url) => ({
                ad_group_criterion: { negative: false, placement: { url } },
            })),
            ...targeting.negativeKeywords.map((text) => ({
                ad_group_criterion: { negative: true, keyword: { text } },
            })),
        ];

        const verification = summarizeTargetingVerification('PAUSED', true, rows, targeting);

        assert.equal(verification.matches, true);
        assert.deepEqual(verification.discrepancies, []);
        assert.equal(verification.appliedKeywords, targeting.keywords.length);
        assert.equal(verification.appliedPlacements, targeting.placements.length);
        assert.equal(verification.appliedNegatives, targeting.negativeKeywords.length);
        assert.equal(verification.campaignStatus, 'PAUSED');
        assert.equal(verification.adGroupExists, true);
    });

    await runTest('summarizeTargetingVerification flags discrepancies', () => {
        const targeting = makeTargeting();
        const rows: AdGroupCriterionRow[] = [
            { ad_group_criterion: { negative: false, keyword: { text: targeting.keywords[0] } } },
        ];

        const verification = summarizeTargetingVerification('ENABLED', false, rows, targeting);

        assert.equal(verification.matches, false);
        assert.ok(verification.discrepancies.some((d) => d.includes('PAUSED')));
        assert.ok(verification.discrepancies.some((d) => d.includes('ad group not found')));
        assert.ok(verification.discrepancies.some((d) => d.includes('keyword count mismatch')));
        assert.ok(verification.discrepancies.some((d) => d.includes('placement count mismatch')));
        assert.ok(verification.discrepancies.some((d) => d.includes('negative keyword count mismatch')));
    });
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
