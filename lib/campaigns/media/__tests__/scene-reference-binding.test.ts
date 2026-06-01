// lib/campaigns/media/__tests__/scene-reference-binding.test.ts
//
// Phase 2 (IMAGE_GEN_REVAMP_5-26): regression tests for per-scene reference
// binding. Verifies that scenes get bound to their category-matched references,
// that distinctive features are extracted, that antiTags are excluded, and
// that re-binding is idempotent.

import assert from 'node:assert/strict';
import type { AssetRecord, SceneSpec, ShipReferenceCandidate } from '../../schema';
import { bindReferencesToScenes } from '../scene-reference-binding';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeScene(sceneId: string, referenceCategory: string, overrides: Partial<SceneSpec> = {}): SceneSpec {
    return {
        sceneId,
        location: `${referenceCategory} location`,
        timeOfDay: 'golden hour',
        lighting: 'warm natural light',
        cameraAngle: 'medium-wide establishing',
        subjectAction: 'guests gathering in the space',
        environmentDetails: 'polished surfaces, sea light',
        mood: 'easy belonging',
        imagePrompt: `A ${referenceCategory} scene aboard a cruise ship`,
        referenceCategory,
        ...overrides,
    };
}

function makeCandidate(
    overrides: Partial<ShipReferenceCandidate> & { category: string; imageUrl: string },
): ShipReferenceCandidate {
    return {
        title: 'ref',
        thumbnailUrl: overrides.imageUrl,
        contextUrl: 'https://example.com/source',
        width: 1920,
        height: 1080,
        query: 'test query',
        selectionScore: 70,
        ...overrides,
    };
}

function makeRecord(assetId: string, url: string): AssetRecord {
    return {
        assetId,
        assetType: 'ship_reference_image',
        url,
        generator: 'serpapi',
        promptUsed: '',
        fileSizeBytes: 100000,
        mimeType: 'image/jpeg',
        tags: ['ship_reference'],
        createdAt: '2026-05-26T00:00:00.000Z',
        reviewStatus: 'auto_approved',
        version: 1,
        active: true,
    };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

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

    // ── Basic binding by category ─────────────────────────────────────────────

    test('scene gets bound to a matching category candidate', () => {
        const scene = makeScene('s1', 'atrium');
        const candidate = makeCandidate({
            category: 'atrium',
            imageUrl: 'https://cdn.example.com/atrium-1.jpg',
            detectedTags: ['glass_atrium_arches', 'brass_railing'],
            aiScore: 80,
        });
        const record = makeRecord('ref-atrium-1', candidate.imageUrl);

        const [bound] = bindReferencesToScenes([scene], [candidate], [record]);

        assert.deepEqual(bound.referenceAssetIds, ['ref-atrium-1']);
        assert.deepEqual(bound.mustPreserveShipFeatures, ['glass_atrium_arches', 'brass_railing']);
    });

    test('scene with no matching candidate keeps empty bindings', () => {
        const scene = makeScene('s1', 'spa');
        const candidate = makeCandidate({
            category: 'atrium',
            imageUrl: 'https://cdn.example.com/atrium-1.jpg',
            detectedTags: ['glass_atrium_arches'],
        });
        const record = makeRecord('ref-atrium-1', candidate.imageUrl);

        const [bound] = bindReferencesToScenes([scene], [candidate], [record]);

        assert.equal(bound.referenceAssetIds, undefined);
        assert.equal(bound.mustPreserveShipFeatures, undefined);
    });

    // ── Top-scoring candidate wins ────────────────────────────────────────────

    test('higher combined score (selectionScore + aiScore) wins among candidates', () => {
        const scene = makeScene('s1', 'pool_deck');
        const weak = makeCandidate({
            category: 'pool_deck',
            imageUrl: 'https://cdn.example.com/pool-weak.jpg',
            detectedTags: ['weak_feature'],
            selectionScore: 50,
            aiScore: 30,
        });
        const strong = makeCandidate({
            category: 'pool_deck',
            imageUrl: 'https://cdn.example.com/pool-strong.jpg',
            detectedTags: ['aft_pool_canopy', 'teak_sundeck'],
            selectionScore: 80,
            aiScore: 90,
        });
        const recWeak = makeRecord('ref-weak', weak.imageUrl);
        const recStrong = makeRecord('ref-strong', strong.imageUrl);

        const [bound] = bindReferencesToScenes([scene], [weak, strong], [recWeak, recStrong]);

        assert.ok(bound.referenceAssetIds?.includes('ref-strong'), 'top-scored asset must be present');
        // ref-strong should be first in the list since it scored highest
        assert.equal(bound.referenceAssetIds?.[0], 'ref-strong');
    });

    test('multiple matching candidates contribute distinct features (up to limit)', () => {
        const scene = makeScene('s1', 'dining');
        const c1 = makeCandidate({
            category: 'dining',
            imageUrl: 'https://cdn.example.com/d1.jpg',
            detectedTags: ['arched_dining_room', 'pendant_lighting'],
            selectionScore: 90,
        });
        const c2 = makeCandidate({
            category: 'dining',
            imageUrl: 'https://cdn.example.com/d2.jpg',
            detectedTags: ['waterfront_windows', 'pendant_lighting'], // pendant_lighting duplicates
            selectionScore: 70,
        });
        const r1 = makeRecord('ref-d1', c1.imageUrl);
        const r2 = makeRecord('ref-d2', c2.imageUrl);

        const [bound] = bindReferencesToScenes([scene], [c1, c2], [r1, r2]);

        assert.deepEqual(bound.referenceAssetIds, ['ref-d1', 'ref-d2']);
        // Deduplicated, order preserved from top-scored to weaker.
        assert.deepEqual(
            bound.mustPreserveShipFeatures,
            ['arched_dining_room', 'pendant_lighting', 'waterfront_windows'],
        );
    });

    // ── antiTags exclusion ────────────────────────────────────────────────────

    test('antiTags are excluded from mustPreserveShipFeatures', () => {
        const scene = makeScene('s1', 'atrium');
        const candidate = makeCandidate({
            category: 'atrium',
            imageUrl: 'https://cdn.example.com/atrium.jpg',
            detectedTags: ['glass_atrium_arches', 'crowded', 'brass_railing'],
            antiTags: ['crowded'],
        });
        const record = makeRecord('ref-atrium', candidate.imageUrl);

        const [bound] = bindReferencesToScenes([scene], [candidate], [record]);

        assert.ok(!bound.mustPreserveShipFeatures?.includes('crowded'),
            'antiTag values must not appear in preserved features');
        assert.deepEqual(bound.mustPreserveShipFeatures, ['glass_atrium_arches', 'brass_railing']);
    });

    // ── Fallback feature when no detectedTags ─────────────────────────────────

    test('candidate without detectedTags gets a category-derived fallback feature', () => {
        const scene = makeScene('s1', 'sports_deck');
        const candidate = makeCandidate({
            category: 'sports_deck',
            imageUrl: 'https://cdn.example.com/sports.jpg',
            // no detectedTags
        });
        const record = makeRecord('ref-sports', candidate.imageUrl);

        const [bound] = bindReferencesToScenes([scene], [candidate], [record]);

        assert.deepEqual(bound.mustPreserveShipFeatures, ['sports_deck_architecture']);
    });

    // ── Idempotency ───────────────────────────────────────────────────────────

    test('re-binding an already-bound scene is a no-op', () => {
        const scene = makeScene('s1', 'atrium', {
            referenceAssetIds: ['prior-binding'],
            mustPreserveShipFeatures: ['prior_feature'],
        });
        const candidate = makeCandidate({
            category: 'atrium',
            imageUrl: 'https://cdn.example.com/atrium.jpg',
            detectedTags: ['glass_atrium_arches'],
        });
        const record = makeRecord('ref-new', candidate.imageUrl);

        const [bound] = bindReferencesToScenes([scene], [candidate], [record]);

        assert.deepEqual(bound.referenceAssetIds, ['prior-binding']);
        assert.deepEqual(bound.mustPreserveShipFeatures, ['prior_feature']);
    });

    // ── Multiple scenes, mixed categories ─────────────────────────────────────

    test('each scene gets bound to its own category', () => {
        const sceneAtrium = makeScene('s1', 'atrium');
        const sceneDining = makeScene('s2', 'dining');
        const sceneNoMatch = makeScene('s3', 'theater');

        const candidates: ShipReferenceCandidate[] = [
            makeCandidate({
                category: 'atrium',
                imageUrl: 'https://cdn.example.com/a.jpg',
                detectedTags: ['glass_atrium'],
            }),
            makeCandidate({
                category: 'dining',
                imageUrl: 'https://cdn.example.com/d.jpg',
                detectedTags: ['arched_dining_room'],
            }),
        ];
        const records: AssetRecord[] = [
            makeRecord('ref-a', candidates[0].imageUrl),
            makeRecord('ref-d', candidates[1].imageUrl),
        ];

        const [a, d, t] = bindReferencesToScenes([sceneAtrium, sceneDining, sceneNoMatch], candidates, records);

        assert.deepEqual(a.referenceAssetIds, ['ref-a']);
        assert.deepEqual(d.referenceAssetIds, ['ref-d']);
        assert.equal(t.referenceAssetIds, undefined);
    });

    // ── Candidate without record (e.g., orphan) ───────────────────────────────

    test('candidate without a matching record produces a feature-only binding', () => {
        const scene = makeScene('s1', 'atrium');
        const candidate = makeCandidate({
            category: 'atrium',
            imageUrl: 'https://cdn.example.com/orphan.jpg',
            detectedTags: ['glass_atrium_arches'],
        });
        // No matching record passed in

        const [bound] = bindReferencesToScenes([scene], [candidate], []);

        assert.equal(bound.referenceAssetIds, undefined,
            'No usable asset id when no matching record exists');
        assert.deepEqual(bound.mustPreserveShipFeatures, ['glass_atrium_arches'],
            'Features are still extracted even when no record can be linked');
    });

    // ─── Summary ──────────────────────────────────────────────────────────────

    console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
    if (failed > 0) process.exit(1);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
