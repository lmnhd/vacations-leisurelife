// lib/ads/__tests__/render-pack.ad-in-ad.test.ts
//
// Regression suite for the ad-in-ad failure mode documented in
// IMAGE_GEN_REVAMP_5-26/06_WORKFLOW_DRIFT_AUDIT_REPORT.md (Finding 6).
//
// Verifies that assets with ineligible eligibilityRoles are blocked from ad
// source pools regardless of their manifest section or approval state.

import assert from 'node:assert/strict';
import type { AssetEligibilityRole, AssetRecord } from '@/lib/campaigns/schema';
import { isAdSourceEligible } from '../render-pack';
import { inferEligibilityRole, migrateManifestRoles } from '@/lib/campaigns/media/asset-role-migration';
import type { ManifestAssetSection } from '@/lib/campaigns/media/asset-manifest-section';
import type { CampaignMediaManifest } from '@/lib/campaigns/schema';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeAsset(
    assetId: string,
    assetType: AssetRecord['assetType'],
    eligibilityRole?: AssetEligibilityRole,
): AssetRecord {
    return {
        assetId,
        assetType,
        url: `https://cdn.example.com/${assetId}.jpg`,
        generator: 'stability_ai',
        promptUsed: 'test prompt',
        fileSizeBytes: 50000,
        mimeType: 'image/jpeg',
        tags: [assetType],
        createdAt: '2026-05-26T00:00:00.000Z',
        reviewStatus: 'human_approved',
        version: 1,
        active: true,
        eligibilityRole,
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
        },
    };
}

function makeMinimalManifest(overrides: Partial<CampaignMediaManifest['images']> = {}): CampaignMediaManifest {
    return {
        slug: 'test-campaign',
        generatedAt: '2026-05-26T00:00:00.000Z',
        totalAssets: 0,
        completionStatus: 'partial',
        images: {
            shipReferences: [],
            hero: [],
            flyerImages: [],
            sceneImages: [],
            aestheticConcepts: [],
            documentaryDetails: [],
            alternateArt: [],
            designedAdArtifacts: [],
            platformCrops: {},
            ...overrides,
        },
        videos: {
            tiktokSeed: null,
            heroExplainer: null,
            thresholdAnnouncement: null,
            countdown: [],
            broll: [],
        },
        audio: {
            ambientNarration: null,
            hypeClip: null,
            themeMusic: null,
        },
        merch: {
            designs: [],
            mockups: [],
            printfulProductIds: [],
        },
        copy: null,
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

    // ── isAdSourceEligible ────────────────────────────────────────────────────

    test('source.group_action is eligible', () => {
        const asset = makeAsset('scene-1', 'scene_image', 'source.group_action');
        assert.equal(isAdSourceEligible(asset), true);
    });

    test('source.hero_clean is eligible', () => {
        const asset = makeAsset('hero-1', 'hero_image', 'source.hero_clean');
        assert.equal(isAdSourceEligible(asset), true);
    });

    test('source.theme_detail is eligible', () => {
        const asset = makeAsset('detail-1', 'documentary_detail_image', 'source.theme_detail');
        assert.equal(isAdSourceEligible(asset), true);
    });

    test('source.ship_context is eligible', () => {
        const asset = makeAsset('ship-1', 'ship_reference_image', 'source.ship_context');
        assert.equal(isAdSourceEligible(asset), true);
    });

    test('final.ad_artifact is NOT eligible — core ad-in-ad guard', () => {
        const asset = makeAsset('ad-1', 'designed_ad_artifact', 'final.ad_artifact');
        assert.equal(isAdSourceEligible(asset), false,
            'A designed ad artifact must be blocked even when human_approved');
    });

    test('final.channel_deliverable is NOT eligible', () => {
        const asset = makeAsset('vid-1', 'tiktok_seed_video', 'final.channel_deliverable');
        assert.equal(isAdSourceEligible(asset), false);
    });

    test('reference.audit_only is NOT eligible', () => {
        const asset = makeAsset('ref-1', 'ship_reference_image', 'reference.audit_only');
        assert.equal(isAdSourceEligible(asset), false);
    });

    test('alternate_art is NOT eligible', () => {
        const asset = makeAsset('art-1', 'aesthetic_concept', 'alternate_art');
        assert.equal(isAdSourceEligible(asset), false);
    });

    test('review_only is NOT eligible', () => {
        const asset = makeAsset('probe-1', 'probe_image', 'review_only');
        assert.equal(isAdSourceEligible(asset), false);
    });

    test('legacy record with no eligibilityRole is treated as source-eligible', () => {
        const asset = makeAsset('legacy-1', 'scene_image');
        assert.equal(isAdSourceEligible(asset), true,
            'Pre-migration records (no role field) must not be silently blocked');
    });

    // ── inferEligibilityRole ──────────────────────────────────────────────────

    const roleMap: Array<[ManifestAssetSection, AssetEligibilityRole]> = [
        ['designedAdArtifacts', 'final.ad_artifact'],
        ['shipReferences',      'reference.audit_only'],
        ['hero',                'source.hero_clean'],
        ['aestheticConcepts',   'source.hero_clean'],
        ['sceneImages',         'source.group_action'],
        ['documentaryDetails',  'source.theme_detail'],
        ['tiktokSeed',          'final.channel_deliverable'],
        ['designs',             'source.theme_detail'],
    ];

    for (const [section, expectedRole] of roleMap) {
        test(`inferEligibilityRole("${section}") returns "${expectedRole}"`, () => {
            assert.equal(inferEligibilityRole(section), expectedRole);
        });
    }

    // ── migrateManifestRoles ──────────────────────────────────────────────────

    test('migration stamps designed ad artifacts as final.ad_artifact', () => {
        const adAsset = makeAsset('ad-legacy', 'designed_ad_artifact');
        const manifest = makeMinimalManifest({ designedAdArtifacts: [adAsset] });
        const migrated = migrateManifestRoles(manifest);
        assert.equal(migrated.images.designedAdArtifacts[0].eligibilityRole, 'final.ad_artifact');
    });

    test('migration stamps scene images as source.group_action', () => {
        const scene = makeAsset('scene-legacy', 'scene_image');
        const manifest = makeMinimalManifest({ sceneImages: [scene] });
        const migrated = migrateManifestRoles(manifest);
        assert.equal(migrated.images.sceneImages[0].eligibilityRole, 'source.group_action');
    });

    test('migration stamps ship references as reference.audit_only', () => {
        const ref = makeAsset('ref-legacy', 'ship_reference_image');
        const manifest = makeMinimalManifest({ shipReferences: [ref] });
        const migrated = migrateManifestRoles(manifest);
        assert.equal(migrated.images.shipReferences[0].eligibilityRole, 'reference.audit_only');
    });

    test('migration is idempotent — pre-assigned role is not overwritten', () => {
        const scene = makeAsset('scene-pre', 'scene_image', 'source.editorial_alt');
        const manifest = makeMinimalManifest({ sceneImages: [scene] });
        const migrated = migrateManifestRoles(manifest);
        assert.equal(
            migrated.images.sceneImages[0].eligibilityRole,
            'source.editorial_alt',
            'A role that was explicitly set must not be overwritten by migration',
        );
    });

    // ── End-to-end: final.ad_artifact blocked after migration ─────────────────

    test('migrated designed_ad_artifact is blocked by isAdSourceEligible', () => {
        const adAsset = makeAsset('ad-e2e', 'designed_ad_artifact');
        const manifest = makeMinimalManifest({ designedAdArtifacts: [adAsset] });
        const migrated = migrateManifestRoles(manifest);
        const migratedAd = migrated.images.designedAdArtifacts[0];
        assert.equal(isAdSourceEligible(migratedAd), false,
            'After migration, a designed ad artifact must be blocked from any source pool');
    });

    // ─── Summary ──────────────────────────────────────────────────────────────

    console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
    if (failed > 0) process.exit(1);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
