/**
 * Reference Pack Resolution Tests
 *
 * Verifies that the reference pack infrastructure correctly:
 * 1. Infers niche family from campaign context
 * 2. Resolves the correct reference pack
 * 3. Produces slot-scoped bundles with correct structure
 * 4. Formats prompt text with winning + toxic examples
 */

import assert from 'node:assert';
import type { Campaign } from '../types';
import { inferNicheFamily, getReferencePack, getSlotReferenceBundle, formatReferenceBundleForPrompt, formatReferencePackForGeneration, getExpandedNicheKeywords } from '../reference-packs';
import type { ReferencePack } from '../reference-pack-types';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
    try {
        fn();
        console.log(`  ✓ ${name}`);
        passed++;
    } catch (err) {
        console.log(`  ✗ ${name}`);
        console.log(`    ${err instanceof Error ? err.message : String(err)}`);
        failed++;
    }
}

// ── Minimal campaign fixtures ────────────────────────────────────────────────

function makeCampaign(overrides: Partial<Campaign>): Campaign {
    return {
        id: overrides.id ?? 'test-campaign',
        name: overrides.name ?? 'Test Campaign',
        targetingKeywords: overrides.targetingKeywords ?? [],
        ...overrides,
    } as Campaign;
}

// ── inferNicheFamily ─────────────────────────────────────────────────────────

console.log('\nReference Packs — Niche Family Inference\n');

test('tabletop campaign infers tabletop family', () => {
    const campaign = makeCampaign({ id: 'bp-tabletop-icon-2027-7n-caribbean', name: 'Tabletop Icon', targetingKeywords: ['board game', 'dice', 'strategy'] });
    assert.equal(inferNicheFamily(campaign), 'tabletop');
});

test('stitch campaign infers stitch family', () => {
    const campaign = makeCampaign({ id: 'eastern-caribbean-stitch-sail-2026-09-19', name: 'Stitch & Sail', targetingKeywords: ['embroidery', 'needlework', 'fiber'] });
    assert.equal(inferNicheFamily(campaign), 'stitch');
});

test('sketchbook campaign infers sketchbook family', () => {
    const campaign = makeCampaign({ id: 'deck-sketchbook-society-2026', name: 'Deck Sketchbook Society', targetingKeywords: ['sketching', 'watercolor'] });
    assert.equal(inferNicheFamily(campaign), 'sketchbook');
});

test('unknown campaign returns null', () => {
    const campaign = makeCampaign({ id: 'generic-cruise-2026', name: 'Generic Cruise', targetingKeywords: ['vacation', 'relaxation'] });
    assert.equal(inferNicheFamily(campaign), null);
});

test('keywords take priority even if name is generic', () => {
    const campaign = makeCampaign({ id: 'caribbean-cruise', name: 'Caribbean Cruise', targetingKeywords: ['crochet', 'yarn'] });
    assert.equal(inferNicheFamily(campaign), 'stitch');
});

// ── getReferencePack ─────────────────────────────────────────────────────────

console.log('\nReference Packs — Pack Resolution\n');

test('tabletop campaign resolves tabletop pack', () => {
    const campaign = makeCampaign({ id: 'bp-tabletop-icon-2027-7n-caribbean', name: 'Tabletop Icon', targetingKeywords: ['board game'] });
    const pack = getReferencePack(campaign);
    assert.ok(pack, 'pack must not be null');
    assert.equal(pack.nicheFamily, 'tabletop');
    assert.equal(pack.referencePackId, 'ref-tabletop-v1');
});

test('stitch campaign resolves stitch pack', () => {
    const campaign = makeCampaign({ id: 'stitch-sail', name: 'Stitch & Sail', targetingKeywords: ['embroidery'] });
    const pack = getReferencePack(campaign);
    assert.ok(pack, 'pack must not be null');
    assert.equal(pack.nicheFamily, 'stitch');
});

test('unknown campaign resolves null', () => {
    const campaign = makeCampaign({ id: 'generic', name: 'Generic', targetingKeywords: [] });
    const pack = getReferencePack(campaign);
    assert.equal(pack, null);
});

test('each pack has at least 4 winning examples', () => {
    const families = ['tabletop', 'stitch', 'sketchbook'] as const;
    for (const fam of families) {
        const campaign = makeCampaign({ targetingKeywords: [fam === 'stitch' ? 'embroidery' : fam] });
        const pack = getReferencePack(campaign);
        assert.ok(pack, `${fam} pack must exist`);
        assert.ok(pack.winningExamples.length >= 4, `${fam} must have >= 4 winning examples, got ${pack.winningExamples.length}`);
    }
});

test('each pack has at least 1 toxic example', () => {
    const families = ['tabletop', 'stitch', 'sketchbook'] as const;
    for (const fam of families) {
        const campaign = makeCampaign({ targetingKeywords: [fam === 'stitch' ? 'embroidery' : fam] });
        const pack = getReferencePack(campaign);
        assert.ok(pack, `${fam} pack must exist`);
        assert.ok(pack.toxicExamples.length >= 1, `${fam} must have >= 1 toxic example`);
    }
});

// ── getSlotReferenceBundle ───────────────────────────────────────────────────

console.log('\nReference Packs — Slot Bundle Resolution\n');

test('HERO_PRIMARY slot bundle has matching winning examples', () => {
    const campaign = makeCampaign({ targetingKeywords: ['board game'] });
    const pack = getReferencePack(campaign) as ReferencePack;
    const bundle = getSlotReferenceBundle(pack, 'HERO_PRIMARY');
    assert.equal(bundle.slotRole, 'HERO_PRIMARY');
    assert.ok(bundle.winningExamples.length > 0, 'must have winning examples');
    assert.ok(bundle.winningExamples.length <= 2, 'max 2 winning examples');
    assert.ok(bundle.winningExamples.some(w => w.slotRole === 'HERO_PRIMARY'), 'at least one example must match HERO_PRIMARY');
});

test('INTIMATE slot bundle has matching winning examples', () => {
    const campaign = makeCampaign({ targetingKeywords: ['embroidery'] });
    const pack = getReferencePack(campaign) as ReferencePack;
    const bundle = getSlotReferenceBundle(pack, 'INTIMATE');
    assert.equal(bundle.slotRole, 'INTIMATE');
    assert.ok(bundle.winningExamples.length > 0);
    assert.ok(bundle.toxicExample, 'must have a toxic example');
    assert.ok(bundle.toxicExample.whyToxic.length > 0, 'toxic example must explain why');
});

test('slot bundle includes required niche signals', () => {
    const campaign = makeCampaign({ targetingKeywords: ['sketching'] });
    const pack = getReferencePack(campaign) as ReferencePack;
    const bundle = getSlotReferenceBundle(pack, 'EDITORIAL_WIDE_A');
    assert.ok(bundle.requiredNicheSignals.length > 0, 'must have niche signals');
});

// ── Prompt formatting ────────────────────────────────────────────────────────

console.log('\nReference Packs — Prompt Formatting\n');

test('formatReferenceBundleForPrompt includes winning and toxic examples', () => {
    const campaign = makeCampaign({ targetingKeywords: ['board game'] });
    const pack = getReferencePack(campaign) as ReferencePack;
    const bundle = getSlotReferenceBundle(pack, 'HERO_PRIMARY');
    const text = formatReferenceBundleForPrompt(bundle);
    assert.ok(text.includes('WINNING EXAMPLE'), 'must include winning example header');
    assert.ok(text.includes('TOXIC EXAMPLE'), 'must include toxic example header');
    assert.ok(text.includes('HERO_PRIMARY'), 'must reference slot role');
});

test('formatReferencePackForGeneration includes all 6 slot roles', () => {
    const campaign = makeCampaign({ targetingKeywords: ['embroidery'] });
    const pack = getReferencePack(campaign) as ReferencePack;
    const text = formatReferencePackForGeneration(pack);
    assert.ok(text.includes('HERO_PRIMARY'), 'must include HERO_PRIMARY');
    assert.ok(text.includes('HERO_ALT'), 'must include HERO_ALT');
    assert.ok(text.includes('EDITORIAL_WIDE_A'), 'must include EDITORIAL_WIDE_A');
    assert.ok(text.includes('EDITORIAL_WIDE_B'), 'must include EDITORIAL_WIDE_B');
    assert.ok(text.includes('INTIMATE'), 'must include INTIMATE');
    assert.ok(text.includes('FLEX'), 'must include FLEX');
    assert.ok(text.includes('BANNED FALLBACK'), 'must include banned fallback section');
    assert.ok(text.includes('REFERENCE GROUNDING'), 'must include reference grounding header');
});

test('winning example shot intents have all required fields', () => {
    const campaign = makeCampaign({ targetingKeywords: ['board game'] });
    const pack = getReferencePack(campaign) as ReferencePack;
    for (const win of pack.winningExamples) {
        assert.ok(win.shotIntent.shotIntent, `${win.exampleId}: shotIntent missing`);
        assert.ok(win.shotIntent.cameraDistance, `${win.exampleId}: cameraDistance missing`);
        assert.ok(win.shotIntent.framingMode, `${win.exampleId}: framingMode missing`);
        assert.ok(win.shotIntent.heroSubject, `${win.exampleId}: heroSubject missing`);
        assert.ok(win.shotIntent.nicheCue, `${win.exampleId}: nicheCue missing`);
        assert.ok(win.shotIntent.antiFallbackNote, `${win.exampleId}: antiFallbackNote missing`);
        assert.ok(win.shotIntent.locationFamily, `${win.exampleId}: locationFamily missing`);
    }
});

// ── Expanded niche keywords ──────────────────────────────────────────────────

console.log('\nReference Packs — Expanded Niche Keywords\n');

test('getExpandedNicheKeywords merges campaign keywords with pack signals', () => {
    const campaign = makeCampaign({ targetingKeywords: ['embroidery', 'fiber arts'], id: 'stitch-test' });
    const expanded = getExpandedNicheKeywords(campaign);
    assert.ok(expanded.includes('embroidery'), 'must include original keyword');
    assert.ok(expanded.includes('fiber arts'), 'must include original keyword');
    assert.ok(expanded.includes('crochet'), 'must include pack signal: crochet');
    assert.ok(expanded.includes('yarn'), 'must include pack signal: yarn');
    assert.ok(expanded.includes('knitting'), 'must include pack signal: knitting');
    assert.ok(expanded.includes('embroidery hoop'), 'must include pack signal: embroidery hoop');
});

test('getExpandedNicheKeywords deduplicates overlapping keywords', () => {
    const campaign = makeCampaign({ targetingKeywords: ['embroidery', 'stitch'], id: 'stitch-dedup' });
    const expanded = getExpandedNicheKeywords(campaign);
    const embroideryCount = expanded.filter(k => k === 'embroidery').length;
    assert.equal(embroideryCount, 1, 'embroidery must appear exactly once');
});

test('getExpandedNicheKeywords returns base keywords for unknown niche', () => {
    const campaign = makeCampaign({ targetingKeywords: ['relaxation', 'spa'], id: 'generic-test' });
    const expanded = getExpandedNicheKeywords(campaign);
    assert.deepStrictEqual(expanded, ['relaxation', 'spa']);
});

test('getExpandedNicheKeywords returns empty array for no keywords and no pack', () => {
    const campaign = makeCampaign({ targetingKeywords: [], id: 'empty-test' });
    const expanded = getExpandedNicheKeywords(campaign);
    assert.deepStrictEqual(expanded, []);
});

test('tabletop expanded keywords include board game and dice', () => {
    const campaign = makeCampaign({ targetingKeywords: ['tabletop'], id: 'tabletop-expand' });
    const expanded = getExpandedNicheKeywords(campaign);
    assert.ok(expanded.includes('board game'), 'must include board game');
    assert.ok(expanded.includes('dice'), 'must include dice');
    assert.ok(expanded.includes('game piece'), 'must include game piece');
});

console.log(`\nPassed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
    process.exit(1);
}
