/**
 * VERTICAL_VIDEO_EDITOR — beat edit override tests.
 * Verifies buildPackageSequenceBeats applies sparse per-beat edits onto the
 * correct card slots per preset, and that empty edits are a no-op (no render
 * regression for un-edited campaigns).
 *
 * Run with: npx tsx --env-file=.env.local lib/campaigns/media/__tests__/tiktok-video-edits.test.ts
 */

import assert from 'node:assert/strict';
import type { CampaignAestheticBrief, Storyboard, TikTokPromotionPackage, TikTokVideoEdits, ShotSpec } from '../../schema';
import { buildPackageSequenceBeats } from '../generators/tiktok-formats/package-template';
import { mergeTikTokVideoEdits } from '../media-store';

function shot(shotNumber: number, sceneId: string): ShotSpec {
    return {
        shotNumber,
        sceneId,
        durationSeconds: 5,
        cameraMovement: 'static',
        subjectMotion: 'still',
        environmentMotion: 'shimmer',
        transitionIn: 'cut',
        transitionOut: 'cut',
        emotionalBeat: 'beat',
        narrationSegment: `narration ${shotNumber}`,
        musicCue: 'bed',
    };
}

const storyboard: Storyboard = {
    deliverableId: 'tiktok_seed',
    title: 'Test',
    totalDurationSeconds: 18,
    shotSequence: [shot(1, 'scene_a'), shot(2, 'scene_b'), shot(3, 'scene_c')],
    narrationScript: '',
    musicDirection: '',
    editingStyle: '',
};

const promotionPackage: TikTokPromotionPackage = {
    synthesizedAt: new Date().toISOString(),
    strategySummary: 'test',
    extractionNotes: [],
    beats: [
        { role: 'hook', headline: 'Hook Headline', subline: 'Hook Subline', spokenText: 'hook spoken' },
        { role: 'social', headline: 'Social Headline', subline: 'Social Subline', spokenText: 'social spoken' },
        { role: 'cta', headline: 'Cta Headline', subline: 'Cta Subline', spokenText: 'cta spoken', cta: 'Book Now' },
    ],
};

const brief = {
    visual: { colorPalette: { primary: '#111111', secondary: '#222222', accent: '#f0b000' } },
    messaging: { ctaVariants: { bookNow: 'Book Now' } },
} as unknown as CampaignAestheticBrief;

const opts = { beatCount: 3, targetDurationSeconds: 18 };

async function main() {
    let passed = 0;
    let failed = 0;
    function test(label: string, fn: () => void): void {
        try {
            fn();
            console.log(`PASS ${label}`);
            passed += 1;
        } catch (error) {
            console.error(`FAIL ${label}`);
            console.error(`  ${error instanceof Error ? error.message : String(error)}`);
            failed += 1;
        }
    }

    test('empty edits produce identical output to no edits', () => {
        const base = buildPackageSequenceBeats(brief, storyboard, opts, promotionPackage);
        const withEmpty = buildPackageSequenceBeats(brief, storyboard, opts, promotionPackage, {
            updatedAt: new Date().toISOString(),
            beats: {},
        });
        assert.deepEqual(withEmpty, base, 'empty edits must be a no-op');
    });

    test('hook beat: headline/subline/badge override the tag card', () => {
        const edits: TikTokVideoEdits = {
            updatedAt: new Date().toISOString(),
            beats: { '0': { headline: 'Edited Hook', subline: 'Edited Sub', badge: 'NEW BADGE' } },
        };
        const beats = buildPackageSequenceBeats(brief, storyboard, opts, promotionPackage, edits);
        const tag = beats[0].overlaySpecs.find((s) => s.variant === 'tag');
        assert.equal(tag?.headline, 'Edited Hook');
        assert.equal(tag?.subline, 'Edited Sub');
        assert.equal(tag?.badge, 'NEW BADGE');
    });

    test('social beat: headline → top tag card, subline → bottom statement headline', () => {
        const edits: TikTokVideoEdits = {
            updatedAt: new Date().toISOString(),
            beats: { '1': { headline: 'Top Tag Text', subline: 'Bottom Statement Text' } },
        };
        const beats = buildPackageSequenceBeats(brief, storyboard, opts, promotionPackage, edits);
        const tag = beats[1].overlaySpecs.find((s) => s.variant === 'tag');
        const statement = beats[1].overlaySpecs.find((s) => s.variant === 'statement');
        assert.equal(tag?.headline, 'Top Tag Text');
        assert.equal(statement?.headline, 'Bottom Statement Text', 'social subline maps to statement headline');
    });

    test('cta beat: cta field overrides the pill label, headline overrides statement', () => {
        const edits: TikTokVideoEdits = {
            updatedAt: new Date().toISOString(),
            beats: { '2': { headline: 'Edited Cta Statement', cta: 'Reserve Today' } },
        };
        const beats = buildPackageSequenceBeats(brief, storyboard, opts, promotionPackage, edits);
        const statement = beats[2].overlaySpecs.find((s) => s.variant === 'statement');
        const pill = beats[2].overlaySpecs.find((s) => s.variant === 'cta');
        assert.equal(statement?.headline, 'Edited Cta Statement');
        assert.equal(pill?.headline, 'Reserve Today');
    });

    test('imageAssetId and spokenText overrides land on the beat', () => {
        const edits: TikTokVideoEdits = {
            updatedAt: new Date().toISOString(),
            beats: { '0': { imageAssetId: 'asset_xyz', spokenText: 'custom voiceover' } },
        };
        const beats = buildPackageSequenceBeats(brief, storyboard, opts, promotionPackage, edits);
        assert.equal(beats[0].imageAssetId, 'asset_xyz');
        assert.equal(beats[0].spokenText, 'custom voiceover');
    });

    test('absent edit fields fall through to promotion package values', () => {
        const edits: TikTokVideoEdits = {
            updatedAt: new Date().toISOString(),
            beats: { '0': { badge: 'ONLY BADGE' } },
        };
        const beats = buildPackageSequenceBeats(brief, storyboard, opts, promotionPackage, edits);
        const tag = beats[0].overlaySpecs.find((s) => s.variant === 'tag');
        assert.equal(tag?.headline, 'Hook Headline', 'headline keeps package value when not overridden');
        assert.equal(tag?.badge, 'ONLY BADGE');
    });

    // ── merge semantics (mergeTikTokVideoEdits) ───────────────────────────────

    test('merge: a field patch merges onto an existing beat', () => {
        const existing: TikTokVideoEdits = { updatedAt: 'x', beats: { '0': { headline: 'old' } } };
        const merged = mergeTikTokVideoEdits(existing, { beats: { '0': { subline: 'new sub' } } });
        assert.deepEqual(merged?.beats['0'], { headline: 'old', subline: 'new sub' });
    });

    test('merge: null/empty field clears that field', () => {
        const existing: TikTokVideoEdits = { updatedAt: 'x', beats: { '0': { headline: 'old', subline: 's' } } };
        const merged = mergeTikTokVideoEdits(existing, { beats: { '0': { headline: null } } });
        assert.deepEqual(merged?.beats['0'], { subline: 's' });
    });

    test('merge: a beat emptied of all fields is dropped', () => {
        const existing: TikTokVideoEdits = { updatedAt: 'x', beats: { '0': { headline: 'old' } } };
        const merged = mergeTikTokVideoEdits(existing, { beats: { '0': { headline: null } } });
        assert.equal(merged, undefined, 'no beats + no grain ⇒ whole field removed');
    });

    test('merge: null beat value deletes that beat', () => {
        const existing: TikTokVideoEdits = { updatedAt: 'x', beats: { '0': { headline: 'a' }, '1': { headline: 'b' } } };
        const merged = mergeTikTokVideoEdits(existing, { beats: { '0': null } });
        assert.equal(merged?.beats['0'], undefined);
        assert.deepEqual(merged?.beats['1'], { headline: 'b' });
    });

    test('merge: grain flags set and clear', () => {
        const set = mergeTikTokVideoEdits(undefined, { applyFilmGrain: false, grainStrength: 12 });
        assert.equal(set?.applyFilmGrain, false);
        assert.equal(set?.grainStrength, 12);
        const cleared = mergeTikTokVideoEdits({ updatedAt: 'x', applyFilmGrain: false, beats: {} }, { applyFilmGrain: null });
        assert.equal(cleared, undefined, 'clearing the only grain flag empties the field');
    });

    if (failed > 0) {
        throw new Error(`${failed} TikTok video edit test(s) failed`);
    }
    console.log(`\n${passed} TikTok video edit tests passed`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
