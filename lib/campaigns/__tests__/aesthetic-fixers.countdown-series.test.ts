/**
 * Countdown Series Deterministic Fixer — unit tests
 * Run with: npx tsx lib/campaigns/__tests__/aesthetic-fixers.countdown-series.test.ts
 */

import assert from 'node:assert/strict';
import type { CampaignAestheticBrief, VideoBrief } from '../schema';
import { fixCountdownSeries } from '../aesthetic-fixers/countdown-series';

// ── Minimal brief factory ────────────────────────────────────────────────────

function makeVideoConcept(overrides: Partial<VideoBrief> = {}): VideoBrief {
    return {
        title: 'Test Video',
        durationSeconds: 15,
        tool: 'runwayml',
        scriptOrNarration: 'Join us for a voyage.',
        visualDirectionNotes: 'Wide establishing shot.',
        avatarRequired: false,
        backgroundDescription: 'Ocean horizon.',
        musicMood: 'aspirational',
        ...overrides,
    };
}

function makeBrief(countdownSeries: VideoBrief[]): CampaignAestheticBrief {
    return {
        slug: 'test-campaign',
        themeName: 'Jazz & Sails 2026',
        visual: {
            aestheticLabel: 'Editorial Maritime',
            colorPalette: { primary: '#1a2b3c', secondary: '#4d5e6f', accent: '#f0c040', background: '#0a0a0a', textOnDark: '#ffffff', textOnLight: '#111111' },
            typographyDirection: { headlineStyle: 'Bold serif', bodyStyle: 'Clean sans', suggestedFonts: ['Playfair Display'] },
            imageryMood: 'cinematic',
            lightingStyle: 'golden hour',
            compositionNotes: 'Wide angle, rule of thirds.',
            avoidList: [],
            referenceMoodboard: ['midnight blue ocean', 'jazz club amber', 'port arrival dusk'],
            plausibilityFramework: { governingPrinciple: 'Cruise-native', cruiseNativeMoments: [], nicheEnhancedMoments: [], implausibleLiteralizations: [], allowedProps: [], discouragedProps: [] },
            humanRepresentation: { castingGoal: 'Mixed', ageRangeGuidance: '25-65', diversityIntent: 'Inclusive', pairingGuidance: 'Mixed pairs', stylingGuidance: 'Smart casual', antiStereotypeRules: [] },
        },
        messaging: { heroSlogan: 'Sail With Purpose', subSlogan: 'Your voyage awaits', ctaVariants: { waitlist: 'Join', bookNow: 'Book', merch: 'Shop', share: 'Share' }, elevatorPitch: 'A jazz cruise.', toneKeywords: [], voicePersona: 'Warm and direct', starterConversation: [] },
        communityExpression: { corePromise: 'Community', participationStyle: 'Active', socialGravity: 'High', optionalGatherings: [], belongingSignals: [], solitudeAntiPatterns: [], visualTogethernessNotes: 'Group energy', copyFramingRule: 'Inclusive', activityInvitations: [] },
        socialConcepts: {} as unknown as CampaignAestheticBrief['socialConcepts'],
        videoConcepts: {
            heroExplainer: makeVideoConcept({ title: 'Hero' }),
            tiktokSeed: makeVideoConcept({ title: 'TikTok Seed' }),
            thresholdAnnouncement: makeVideoConcept({ title: 'Threshold' }),
            merchReveal: makeVideoConcept({ title: 'Merch Reveal' }),
            countdownSeries,
        },
        merch: { conceptStatement: 'Jazz merch', coreItem: {} as CampaignAestheticBrief['merch']['coreItem'], practicalItem: {} as CampaignAestheticBrief['merch']['practicalItem'], nicheSpecificItems: [], logoConceptDescription: 'Wave motif', tagline: 'Jazz & Sails', printStyle: 'Minimalist' },
        audio: { ambientNarrationScript: 'Welcome aboard.', hypeClipScript: 'The voyage begins.', voiceProfile: 'Warm baritone', musicMood: 'jazz, smooth' },
        generatedAt: '2026-01-01T00:00:00Z',
        generatedBy: 'agent',
        humanReviewStatus: 'pending',
        revisionCycleCount: 0,
    };
}

// ── Tests ────────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(label: string, fn: () => void): void {
    try {
        fn();
        console.log(`  ✓ ${label}`);
        passed++;
    } catch (err) {
        console.error(`  ✗ ${label}`);
        console.error(`    ${err instanceof Error ? err.message : String(err)}`);
        failed++;
    }
}

console.log('\nCountdown Series Fixer\n');

test('skips brief with no countdownSeries', () => {
    const brief = makeBrief([]);
    const result = fixCountdownSeries(brief);
    assert.equal(result.applied, false);
    assert.equal(result.appliedOperations[0].status, 'skipped');
});

test('no-ops when series has no banned patterns', () => {
    const clean = makeVideoConcept({ title: 'Open Sailing Window', scriptOrNarration: 'Join us for a voyage.', tool: 'runwayml', avatarRequired: false });
    const brief = makeBrief([clean]);
    const result = fixCountdownSeries(brief);
    assert.equal(result.applied, false);
    assert.equal(result.appliedOperations[0].status, 'no_op');
});

test('detects T- pattern and applies fix', () => {
    const dirty = makeVideoConcept({ title: 'T-3 Days Left', scriptOrNarration: 'Only T-3 days remain!' });
    const brief = makeBrief([dirty]);
    const result = fixCountdownSeries(brief);
    assert.equal(result.applied, true);
    assert.equal(result.appliedOperations[0].status, 'applied');
});

test('detects cabin countdown pattern', () => {
    const dirty = makeVideoConcept({ scriptOrNarration: '3 cabins left — book now!' });
    const brief = makeBrief([dirty]);
    const result = fixCountdownSeries(brief);
    assert.equal(result.applied, true);
});

test('detects scarcity keyword', () => {
    const dirty = makeVideoConcept({ scriptOrNarration: 'Create urgency around scarcity.' });
    const brief = makeBrief([dirty]);
    const result = fixCountdownSeries(brief);
    assert.equal(result.applied, true);
});

test('detects heygen tool as banned', () => {
    const dirty = makeVideoConcept({ tool: 'heygen', scriptOrNarration: 'Generic narration.' });
    const brief = makeBrief([dirty]);
    const result = fixCountdownSeries(brief);
    assert.equal(result.applied, true);
});

test('detects avatarRequired = true as banned', () => {
    const dirty = makeVideoConcept({ avatarRequired: true, scriptOrNarration: 'Clean narration.' });
    const brief = makeBrief([dirty]);
    const result = fixCountdownSeries(brief);
    assert.equal(result.applied, true);
});

test('replacement always produces exactly 3 concepts (open_window_triplet)', () => {
    const dirty = [
        makeVideoConcept({ title: 'T-3 Countdown', scriptOrNarration: 'T-3 days left' }),
        makeVideoConcept({ title: 'T-2 Countdown', scriptOrNarration: 'T-2 days left' }),
    ];
    const brief = makeBrief(dirty);
    const result = fixCountdownSeries(brief);
    assert.equal(result.applied, true);
    const updatedSeries = result.brief.videoConcepts.countdownSeries;
    assert.equal(updatedSeries.length, 3);
});

test('replacement forces avatarRequired = false on all 3 concepts', () => {
    const dirty = makeVideoConcept({ title: 'T-1', scriptOrNarration: 'T-1', avatarRequired: true });
    const brief = makeBrief([dirty]);
    const result = fixCountdownSeries(brief);
    const series = result.brief.videoConcepts.countdownSeries;
    assert.ok(series.every(c => c.avatarRequired === false), 'all concepts must have avatarRequired = false');
});

test('replacement does not emit heygen as tool', () => {
    const dirty = makeVideoConcept({ tool: 'heygen', scriptOrNarration: 'countdown' });
    const brief = makeBrief([dirty]);
    const result = fixCountdownSeries(brief);
    const series = result.brief.videoConcepts.countdownSeries;
    assert.ok(series.every(c => c.tool !== 'heygen'), 'no concept may use heygen tool');
});

test('replacement titles contain no banned patterns', () => {
    const dirty = makeVideoConcept({ title: 'T-3 Cabin Countdown', scriptOrNarration: 'Only 2 cabins left — selling out fast! T-1' });
    const brief = makeBrief([dirty]);
    const result = fixCountdownSeries(brief);
    const series = result.brief.videoConcepts.countdownSeries;
    const BANNED = [/\bT-\d+\b/i, /cabin(s)?\s*(left|remain)/i, /countdown/i, /scarcity/i, /selling\s+out/i];
    for (const concept of series) {
        for (const re of BANNED) {
            assert.ok(!re.test(concept.title), `title "${concept.title}" contains banned pattern ${re}`);
            assert.ok(!re.test(concept.scriptOrNarration), `scriptOrNarration contains banned pattern ${re}`);
        }
    }
});

test('fix is idempotent — applying twice yields same result as once', () => {
    const dirty = makeVideoConcept({ title: 'T-3', scriptOrNarration: 'T-3 days — scarcity!' });
    const brief = makeBrief([dirty]);
    const first = fixCountdownSeries(brief);
    const second = fixCountdownSeries(first.brief);
    assert.equal(second.applied, false, 'second run should be no-op');
    assert.equal(second.appliedOperations[0].status, 'no_op');
});

test('touchedPaths includes videoConcepts.countdownSeries when applied', () => {
    const dirty = makeVideoConcept({ scriptOrNarration: 'T-1 cabin left' });
    const brief = makeBrief([dirty]);
    const result = fixCountdownSeries(brief);
    assert.ok(result.touchedPaths.includes('videoConcepts.countdownSeries'));
});

test('non-countdownSeries fields are unchanged after fix', () => {
    const dirty = makeVideoConcept({ scriptOrNarration: 'T-3 countdown' });
    const brief = makeBrief([dirty]);
    const result = fixCountdownSeries(brief);
    assert.equal(result.brief.themeName, brief.themeName);
    assert.equal(result.brief.videoConcepts.heroExplainer.title, brief.videoConcepts.heroExplainer.title);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
