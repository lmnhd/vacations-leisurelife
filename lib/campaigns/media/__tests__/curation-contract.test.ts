// lib/campaigns/media/__tests__/curation-contract.test.ts
//
// Phase 4 (IMAGE_GEN_REVAMP_5-26): regression tests for the shared curation
// contract utility. Verifies that every curation field is honored:
//   - blockedContexts (blocklist)
//   - approvedContexts (allowlist when non-empty)
//   - approvalState (gated by governance)
//   - contextPriorities (overrides globalPriority)
//   - suitabilityTags (positive match space alongside record.tags)
//   - antiTags (negative match space, heavier penalty)
//
// Also verifies the AdFormat → ImageContext mapping used by render-pack.

import assert from 'node:assert/strict';
import type { AssetRecord, MediaGovernancePolicy } from '../../schema';
import {
    applyCurationContract,
    getCurationTagMatchScore,
    getEffectivePriority,
    hasAllPreferredTags,
    isAssetEligibleForContext,
} from '../curation-contract';
import { imageContextForAdFormat } from '@/lib/ads/ad-format-context';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DEFAULT_GOVERNANCE: MediaGovernancePolicy = {
    imageSelectionMode: 'approved_if_any_else_fallback',
    revisionRequiredBlocksUsage: true,
    rejectedBlocksUsage: true,
    holdBlocksUsage: true,
    pendingReviewBlocksWhenLocked: true,
};

function makeAsset(
    assetId: string,
    overrides: Partial<AssetRecord> & { curationOverrides?: Partial<NonNullable<AssetRecord['curation']>> } = {},
): AssetRecord {
    const { curationOverrides, ...rest } = overrides;
    return {
        assetId,
        assetType: 'scene_image',
        url: `https://cdn.example.com/${assetId}.jpg`,
        generator: 'stability_ai',
        promptUsed: '',
        fileSizeBytes: 50000,
        mimeType: 'image/jpeg',
        tags: [],
        createdAt: '2026-05-26T00:00:00.000Z',
        reviewStatus: 'human_approved',
        version: 1,
        active: true,
        curation: {
            approvalState: 'human_approved',
            globalPriority: 50,
            contextPriorities: {},
            approvedContexts: [],
            blockedContexts: [],
            suitabilityTags: [],
            antiTags: [],
            downstreamLocked: false,
            generationLocked: false,
            updatedAt: '2026-05-26T00:00:00.000Z',
            ...curationOverrides,
        },
        ...rest,
    };
}

// ─── Test runner ──────────────────────────────────────────────────────────────

async function main() {
    let passed = 0;
    let failed = 0;

    function test(label: string, fn: () => void): void {
        try {
            fn();
            console.log(`PASS  ${label}`);
            passed++;
        } catch (err) {
            console.error(`FAIL  ${label}`);
            console.error(`      ${err instanceof Error ? err.message : String(err)}`);
            failed++;
        }
    }

    // ── isAssetEligibleForContext / applyCurationContract ────────────────────

    test('asset is eligible when no curation restrictions apply', () => {
        const asset = makeAsset('a');
        assert.equal(isAssetEligibleForContext(asset, 'meta_ad_creative'), true);
    });

    test('asset blocked when context is in blockedContexts', () => {
        const asset = makeAsset('a', {
            curationOverrides: { blockedContexts: ['meta_ad_creative'] },
        });
        assert.equal(isAssetEligibleForContext(asset, 'meta_ad_creative'), false,
            'AUDIT FINDING 11: an asset blocked from meta_ad_creative must be rejected by the ad render pack');
    });

    test('asset blocked when approvedContexts allowlist excludes context', () => {
        const asset = makeAsset('a', {
            curationOverrides: { approvedContexts: ['landing_hero_primary'] },
        });
        assert.equal(isAssetEligibleForContext(asset, 'meta_ad_creative'), false,
            'AUDIT FINDING 11: approvedContexts is an allowlist — context must be present to qualify');
    });

    test('asset eligible when approvedContexts includes the context', () => {
        const asset = makeAsset('a', {
            curationOverrides: { approvedContexts: ['landing_hero_primary', 'meta_ad_creative'] },
        });
        assert.equal(isAssetEligibleForContext(asset, 'meta_ad_creative'), true);
    });

    test('rejected approvalState blocks asset regardless of contexts', () => {
        const asset = makeAsset('a', {
            curationOverrides: { approvalState: 'rejected' },
        });
        assert.equal(isAssetEligibleForContext(asset, 'meta_ad_creative', DEFAULT_GOVERNANCE), false);
    });

    test('inactive asset is blocked', () => {
        const asset = makeAsset('a', { active: false });
        assert.equal(isAssetEligibleForContext(asset, 'meta_ad_creative'), false);
    });

    test('applyCurationContract filters a mixed pool by context', () => {
        const eligible = makeAsset('eligible');
        const blocked = makeAsset('blocked', {
            curationOverrides: { blockedContexts: ['meta_ad_creative'] },
        });
        const allowlistOnlyLanding = makeAsset('allowlist-only', {
            curationOverrides: { approvedContexts: ['landing_hero_primary'] },
        });
        const rejected = makeAsset('rejected', {
            curationOverrides: { approvalState: 'rejected' },
        });
        const result = applyCurationContract(
            [eligible, blocked, allowlistOnlyLanding, rejected],
            'meta_ad_creative',
            DEFAULT_GOVERNANCE,
        );
        assert.deepEqual(result.map((r) => r.assetId), ['eligible'],
            'only the asset that passes every contract check should survive');
    });

    // ── getEffectivePriority ──────────────────────────────────────────────────

    test('contextPriorities[context] overrides globalPriority', () => {
        const asset = makeAsset('a', {
            curationOverrides: {
                globalPriority: 50,
                contextPriorities: { meta_ad_creative: 95 },
            },
        });
        assert.equal(getEffectivePriority(asset, 'meta_ad_creative'), 95);
    });

    test('falls back to globalPriority when no contextPriority is set for this context', () => {
        const asset = makeAsset('a', {
            curationOverrides: {
                globalPriority: 70,
                contextPriorities: { landing_hero_primary: 95 }, // different context
            },
        });
        assert.equal(getEffectivePriority(asset, 'meta_ad_creative'), 70);
    });

    test('defaults to 50 when no curation exists', () => {
        const asset = makeAsset('a');
        asset.curation = undefined;
        assert.equal(getEffectivePriority(asset, 'meta_ad_creative'), 50);
    });

    // ── getCurationTagMatchScore ──────────────────────────────────────────────

    test('matches record.tags against directive preferTags (+1 per match)', () => {
        const asset = makeAsset('a', { tags: ['group_action', 'ocean_forward'] });
        const score = getCurationTagMatchScore(asset, ['group_action', 'ocean_forward', 'absent_tag']);
        assert.equal(score, 2);
    });

    test('matches curation.suitabilityTags against directive preferTags (+1 per match)', () => {
        const asset = makeAsset('a', {
            tags: [],
            curationOverrides: { suitabilityTags: ['headline_safe', 'travel_first'] },
        });
        const score = getCurationTagMatchScore(asset, ['headline_safe', 'travel_first']);
        assert.equal(score, 2,
            'AUDIT FINDING 11: suitabilityTags must contribute the same as record.tags for selector matching');
    });

    test('antiTags matching directive preferTags subtracts 2', () => {
        const asset = makeAsset('a', {
            tags: ['group_action'],
            curationOverrides: { antiTags: ['too_busy'] },
        });
        const score = getCurationTagMatchScore(asset, ['group_action', 'too_busy']);
        assert.equal(score, 1 + (-2), 'tag match (+1) + antiTag hit (-2) = -1');
    });

    test('empty preferTags → 0', () => {
        const asset = makeAsset('a', { tags: ['x'] });
        assert.equal(getCurationTagMatchScore(asset, []), 0);
    });

    test('hasAllPreferredTags returns true only when every wanted tag is in tags or suitabilityTags', () => {
        const asset = makeAsset('a', {
            tags: ['a'],
            curationOverrides: { suitabilityTags: ['b'] },
        });
        assert.equal(hasAllPreferredTags(asset, ['a', 'b']), true);
        assert.equal(hasAllPreferredTags(asset, ['a', 'b', 'c']), false);
        assert.equal(hasAllPreferredTags(asset, []), false);
    });

    // ── imageContextForAdFormat ───────────────────────────────────────────────

    test('meta_feed_square → meta_ad_creative', () => {
        assert.equal(imageContextForAdFormat('meta_feed_square'), 'meta_ad_creative');
    });

    test('meta_story_reel → meta_ad_creative', () => {
        assert.equal(imageContextForAdFormat('meta_story_reel'), 'meta_ad_creative');
    });

    test('meta_carousel_square → meta_ad_creative', () => {
        assert.equal(imageContextForAdFormat('meta_carousel_square'), 'meta_ad_creative');
    });

    test('google_display_landscape → meta_ad_creative', () => {
        assert.equal(imageContextForAdFormat('google_display_landscape'), 'meta_ad_creative');
    });

    test('ig_square → instagram_cover', () => {
        assert.equal(imageContextForAdFormat('ig_square'), 'instagram_cover',
            'ig_square should map to instagram_cover so operators curating IG-specific imagery flow correctly');
    });

    test('legacy carousel → meta_ad_creative', () => {
        assert.equal(imageContextForAdFormat('carousel'), 'meta_ad_creative');
    });

    // ── End-to-end: full curation contract enforcement scenario ──────────────

    test('end-to-end: operator blocks asset from meta ads — render pack filter rejects it', () => {
        // Three candidates: one human_approved baseline, one blocked from meta,
        // one with allowlist excluding meta. Only baseline should remain.
        const baseline = makeAsset('baseline');
        const blockedFromMeta = makeAsset('blocked-from-meta', {
            curationOverrides: { blockedContexts: ['meta_ad_creative'] },
        });
        const landingOnly = makeAsset('landing-only', {
            curationOverrides: { approvedContexts: ['landing_hero_primary'] },
        });
        const eligibleForMetaAds = applyCurationContract(
            [baseline, blockedFromMeta, landingOnly],
            'meta_ad_creative',
            DEFAULT_GOVERNANCE,
        );
        const ids = eligibleForMetaAds.map((a) => a.assetId);
        assert.ok(!ids.includes('blocked-from-meta'),
            'asset explicitly blocked from meta_ad_creative must not reach ad rendering');
        assert.ok(!ids.includes('landing-only'),
            'asset allowlisted only for landing must not reach ad rendering');
        assert.ok(ids.includes('baseline'),
            'an unconstrained baseline asset must remain eligible');
    });

    test('end-to-end: operator boost via contextPriorities raises priority for ad context only', () => {
        // Two assets, equal global priority. One boosts meta_ad_creative.
        // Effective priority should differ per context.
        const boosted = makeAsset('boosted', {
            curationOverrides: {
                globalPriority: 50,
                contextPriorities: { meta_ad_creative: 95 },
            },
        });
        const baseline = makeAsset('baseline');
        assert.ok(getEffectivePriority(boosted, 'meta_ad_creative') > getEffectivePriority(baseline, 'meta_ad_creative'));
        // For landing context (where boost was not set), the boosted asset
        // falls back to its global priority — equal to baseline.
        assert.equal(getEffectivePriority(boosted, 'landing_hero_primary'), getEffectivePriority(baseline, 'landing_hero_primary'));
    });

    // ─── Summary ──────────────────────────────────────────────────────────────

    console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
    if (failed > 0) process.exit(1);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
