// lib/campaigns/media/__tests__/reference-pipeline.phase8.test.ts
//
// Phase 8 (IMAGE_GEN_REVAMP_5-26): regression tests for the reference-image
// pipeline recovery. Verifies:
//   1. selectFetchableReferenceUrl prefers record.url (R2/storage) over
//      record.sourceImageUrl (third-party). This is the root-cause fix for
//      the bland-image symptom — before Phase 8 the third-party URL was
//      preferred and silently failed at generation time.
//   2. r2://pending: placeholders are rejected; we fall back to sourceImageUrl.
//   3. assetRecordToShipReferenceCandidate threads the fetchable URL through.
//   4. ReferenceFetchError carries the attempted URL list for diagnostics.

import assert from 'node:assert/strict';
import type { AssetRecord } from '../../schema';
import {
    assertShipReferenceIdentityIsConsistent,
    assetRecordToShipReferenceCandidate,
    filterShipReferenceRecordsForCampaign,
    selectFetchableReferenceUrl,
    resolveShipReferenceShipName,
} from '../ship-reference-service';
import { ReferenceFetchError } from '../generators/stability-generator';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeReferenceRecord(overrides: Partial<AssetRecord>): AssetRecord {
    return {
        assetId: 'img_ship_reference_001',
        assetType: 'ship_reference_image',
        url: 'https://r2.example.com/slug/images/references/img_ship_reference_001.jpg',
        generator: 'serpapi',
        promptUsed: 'Brilliance of the Seas atrium',
        sourceImageUrl: 'https://assets.widgety.co.uk/2024/.../atrium.jpg',
        sourcePageUrl: 'https://hayscruise.co.uk/cruise-lines/brilliance-of-the-seas',
        sourceThumbnailUrl: 'https://thumb.example.com/atrium.jpg',
        sourceQuery: 'brilliance of the seas atrium',
        selectionScore: 75,
        dimensions: { width: 1920, height: 1080 },
        fileSizeBytes: 240000,
        mimeType: 'image/jpeg',
        tags: ['ship-reference', 'atrium', 'reference'],
        createdAt: '2026-05-26T00:00:00.000Z',
        reviewStatus: 'auto_approved',
        version: 1,
        active: true,
        ...overrides,
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

    // ── selectFetchableReferenceUrl ───────────────────────────────────────────

    test('prefers record.url (R2/storage) over sourceImageUrl when both exist', () => {
        const record = makeReferenceRecord({});
        const url = selectFetchableReferenceUrl(record);
        assert.equal(url, 'https://r2.example.com/slug/images/references/img_ship_reference_001.jpg',
            'AUDIT REGRESSION: before Phase 8 this returned the third-party URL — that is the root cause of bland scenes.');
    });

    test('falls back to sourceImageUrl when record.url is r2://pending: placeholder', () => {
        const record = makeReferenceRecord({
            url: 'r2://pending:img_ship_reference_001',
        });
        const url = selectFetchableReferenceUrl(record);
        assert.equal(url, 'https://assets.widgety.co.uk/2024/.../atrium.jpg',
            'placeholder URLs are not fetchable — must fall back to the third-party source');
    });

    test('handles records missing sourceImageUrl gracefully', () => {
        const record = makeReferenceRecord({
            sourceImageUrl: undefined,
        });
        const url = selectFetchableReferenceUrl(record);
        assert.equal(url, 'https://r2.example.com/slug/images/references/img_ship_reference_001.jpg');
    });

    // ── assetRecordToShipReferenceCandidate ──────────────────────────────────

    test('candidate.imageUrl uses the fetchable R2 URL, not the third-party source', () => {
        const record = makeReferenceRecord({});
        const candidate = assetRecordToShipReferenceCandidate(record);
        assert.ok(candidate, 'should produce a candidate');
        assert.equal(candidate!.imageUrl, 'https://r2.example.com/slug/images/references/img_ship_reference_001.jpg',
            'downstream generation must fetch from R2, not from the flaky third-party URL');
    });

    test('candidate.imageUrl falls back to third-party when rehost failed (placeholder url)', () => {
        const record = makeReferenceRecord({
            url: 'r2://pending:img_ship_reference_001',
        });
        const candidate = assetRecordToShipReferenceCandidate(record);
        assert.ok(candidate);
        assert.equal(candidate!.imageUrl, 'https://assets.widgety.co.uk/2024/.../atrium.jpg');
    });

    test('candidate.contextUrl keeps the original source page URL for human attribution', () => {
        const record = makeReferenceRecord({});
        const candidate = assetRecordToShipReferenceCandidate(record);
        assert.equal(candidate!.contextUrl, 'https://hayscruise.co.uk/cruise-lines/brilliance-of-the-seas',
            'contextUrl is the HTML page the human can click — should remain the original source page');
    });

    test('returns null for non-ship-reference assets', () => {
        const record = makeReferenceRecord({ assetType: 'scene_image' });
        const candidate = assetRecordToShipReferenceCandidate(record);
        assert.equal(candidate, null);
    });

    test('resolveShipReferenceShipName prefers matchedShipName over shipTarget', () => {
        const shipName = resolveShipReferenceShipName({
            id: 'campaign-001',
            shipTarget: 'Celebrity Edge',
            matchedShipName: 'Norwegian Gem',
        } as never);

        assert.equal(shipName, 'Norwegian Gem');
    });

    // ── ReferenceFetchError ───────────────────────────────────────────────────

    test('blocks specific Royal Caribbean ship conflicts before reference search', () => {
        assert.throws(
            () => assertShipReferenceIdentityIsConsistent({
                id: 'campaign-001',
                shipTarget: 'Explorer of the Seas',
                matchedShipName: 'Symphony of the Seas',
            } as never),
            /shipTarget is "Explorer of the Seas" but matchedShipName is "Symphony of the Seas"/,
        );
    });

    test('filters existing references to the resolved campaign ship', () => {
        const explorerRecord = makeReferenceRecord({
            assetId: 'img_ship_reference_explorer',
            promptUsed: 'Explorer of the Seas Royal Promenade',
            sourcePageUrl: 'https://example.com/explorer-of-the-seas-promenade',
            sourceQuery: 'Explorer of the Seas central promenade hall',
            tags: ['ship-reference', 'atrium', 'reference', 'match:exact_ship', 'ship:explorer of the seas'],
        });
        const staleSymphonyRecord = makeReferenceRecord({
            assetId: 'img_ship_reference_symphony',
            promptUsed: 'Symphony of the Seas Royal Promenade',
            sourcePageUrl: 'https://example.com/symphony-of-the-seas-promenade',
            sourceQuery: 'Symphony of the Seas central promenade hall',
            tags: ['ship-reference', 'atrium', 'reference', 'match:exact_ship', 'ship:symphony of the seas'],
        });
        const wonderOffboardRecord = makeReferenceRecord({
            assetId: 'img_ship_reference_wonder',
            promptUsed: 'Wonder of the Seas Caribbean feature',
            sourcePageUrl: 'https://example.com/wonder-of-the-seas',
            sourceQuery: 'Caribbean cruise excursion beautiful travel photo',
            tags: ['ship-reference', 'offboard_excursion', 'reference', 'match:generic_cruise'],
        });

        const filtered = filterShipReferenceRecordsForCampaign({
            id: 'campaign-001',
            shipTarget: 'Explorer of the Seas',
        } as never, [explorerRecord, staleSymphonyRecord, wonderOffboardRecord]);

        assert.deepEqual(filtered.map((record) => record.assetId), ['img_ship_reference_explorer']);
    });

    test('ReferenceFetchError carries the list of attempted URLs', () => {
        const err = new ReferenceFetchError(
            ['https://r2.example.com/a.jpg', 'https://third-party.example.com/a.jpg'],
            new Error('HTTP 403'),
        );
        assert.equal(err.name, 'ReferenceFetchError');
        assert.deepEqual(err.attemptedUrls, [
            'https://r2.example.com/a.jpg',
            'https://third-party.example.com/a.jpg',
        ]);
        assert.ok(err.message.includes('HTTP 403'), 'last error should be quoted in the message');
        assert.ok(err.message.includes('Attempted:'), 'message should list attempted URLs');
    });

    test('ReferenceFetchError with empty URL list still describes the problem', () => {
        const err = new ReferenceFetchError([], new Error('no usable URL on reference asset'));
        assert.ok(err.message.includes('Reference image fetch failed'));
        assert.deepEqual(err.attemptedUrls, []);
    });

    // ─── Summary ──────────────────────────────────────────────────────────────

    console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
    if (failed > 0) process.exit(1);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
