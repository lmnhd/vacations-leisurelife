/**
 * Aesthetic Modification Layer — unit tests (pure logic, no network)
 * Run with: npx tsx lib/campaigns/__tests__/aesthetic-modification.test.ts
 *
 * Tests schema validation, FixerPathError, AllNoOpError, idempotency of
 * inject operations, time normalization, and venue genericization.
 * Preview/apply persistence tests require store integration (not covered here).
 */

import assert from 'node:assert/strict';
import type { CampaignAestheticBrief, VideoBrief } from '../schema';
import { AestheticModificationRequestSchema } from '../schema';
import {
    runOperation,
    isAllowedTargetPath,
    ISSUE_CODE_OPERATIONS,
    ALLOWED_OPERATION_PATHS,
    suggestDeterministicIssueCodes,
} from '../aesthetic-fixers/registry';
import { FixerPathError, AllNoOpError } from '../aesthetic-modification';

// ── Fixture factory (mirrors countdown-series test) ──────────────────────────

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

function makeBrief(overrides: Partial<CampaignAestheticBrief> = {}): CampaignAestheticBrief {
    const base: CampaignAestheticBrief = {
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
        messaging: { heroSlogan: 'Sail With Purpose', subSlogan: 'Your voyage awaits', ctaVariants: { waitlist: 'Join', bookNow: 'Book', merch: 'Shop', share: 'Share' }, elevatorPitch: 'A jazz cruise.', toneKeywords: [], voicePersona: 'Warm and direct' },
        communityExpression: { corePromise: 'Community', participationStyle: 'Active', socialGravity: 'High', optionalGatherings: [], belongingSignals: [], solitudeAntiPatterns: [], visualTogethernessNotes: 'Group energy', copyFramingRule: 'Inclusive' },
        socialConcepts: {} as unknown as CampaignAestheticBrief['socialConcepts'],
        videoConcepts: {
            heroExplainer: makeVideoConcept({ title: 'Hero' }),
            tiktokSeed: makeVideoConcept({ title: 'TikTok Seed' }),
            thresholdAnnouncement: makeVideoConcept({ title: 'Threshold' }),
            merchReveal: makeVideoConcept({ title: 'Merch Reveal' }),
            countdownSeries: [],
        },
        merch: { conceptStatement: 'Jazz merch', coreItem: {} as CampaignAestheticBrief['merch']['coreItem'], practicalItem: {} as CampaignAestheticBrief['merch']['practicalItem'], nicheSpecificItems: [], logoConceptDescription: 'Wave motif', tagline: 'Jazz & Sails', printStyle: 'Minimalist' },
        audio: { ambientNarrationScript: 'Welcome aboard.', hypeClipScript: 'The voyage begins.', voiceProfile: 'Warm baritone', musicMood: 'jazz, smooth' },
        generatedAt: '2026-01-01T00:00:00Z',
        generatedBy: 'agent',
        humanReviewStatus: 'pending',
        revisionCycleCount: 0,
    };
    return { ...base, ...overrides };
}

// ── Test runner ───────────────────────────────────────────────────────────────

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

// ── Schema validation ────────────────────────────────────────────────────────

console.log('\nRequest Schema Validation\n');

test('valid preview request passes schema', () => {
    const result = AestheticModificationRequestSchema.safeParse({
        mode: 'preview',
        source: 'issue_codes',
        actor: { type: 'human', id: 'op-1', label: 'Operator' },
        issueCodes: ['countdown_series_hard_scarcity'],
    });
    assert.ok(result.success, `Schema rejected valid request: ${result.success ? '' : result.error.message}`);
});

test('missing mode field fails schema', () => {
    const result = AestheticModificationRequestSchema.safeParse({
        source: 'issue_codes',
        actor: { type: 'human', id: 'op-1', label: 'Operator' },
        issueCodes: ['countdown_series_hard_scarcity'],
    });
    assert.equal(result.success, false);
});

test('invalid mode value fails schema', () => {
    const result = AestheticModificationRequestSchema.safeParse({
        mode: 'destroy',
        source: 'issue_codes',
        actor: { type: 'human', id: 'op-1', label: 'Operator' },
        issueCodes: ['countdown_series_hard_scarcity'],
    });
    assert.equal(result.success, false);
});

test('invalid issue code value fails schema', () => {
    const result = AestheticModificationRequestSchema.safeParse({
        mode: 'preview',
        source: 'issue_codes',
        actor: { type: 'human', id: 'op-1', label: 'Operator' },
        issueCodes: ['not_a_real_issue_code'],
    });
    assert.equal(result.success, false);
});

test('actor missing id fails schema', () => {
    const result = AestheticModificationRequestSchema.safeParse({
        mode: 'apply',
        source: 'issue_codes',
        actor: { type: 'human', label: 'Operator' },
        issueCodes: ['countdown_series_hard_scarcity'],
    });
    assert.equal(result.success, false);
});

// ── Path validation ──────────────────────────────────────────────────────────

console.log('\nPath Validation\n');

test('isAllowedTargetPath returns true for known paths', () => {
    assert.ok(isAllowedTargetPath('visual.compositionNotes'));
    assert.ok(isAllowedTargetPath('videoConcepts.heroExplainer.avatarRequired'));
    assert.ok(isAllowedTargetPath('audio.ambientNarrationScript'));
    assert.ok(isAllowedTargetPath('videoConcepts.countdownSeries'));
    assert.ok(isAllowedTargetPath('merch.conceptStatement'));
});

test('isAllowedTargetPath returns false for nonexistent schema paths', () => {
    assert.equal(isAllowedTargetPath('copy.privacyLine'), false);
    assert.equal(isAllowedTargetPath('productionNotes'), false);
    assert.equal(isAllowedTargetPath('copy.filmingGuidance'), false);
    assert.equal(isAllowedTargetPath('videoConcepts.freeformScript'), false);
    assert.equal(isAllowedTargetPath(''), false);
});

test('ALLOWED_OPERATION_PATHS does not contain ghost schema paths', () => {
    assert.ok(!ALLOWED_OPERATION_PATHS.has('copy.privacyLine'), 'copy.privacyLine must not be allowed');
    assert.ok(!ALLOWED_OPERATION_PATHS.has('copy.filmingGuidance'), 'copy.filmingGuidance must not be allowed');
    assert.ok(!ALLOWED_OPERATION_PATHS.has('productionNotes'), 'productionNotes must not be allowed');
});

test('runOperation throws FixerPathError for disallowed path', () => {
    const brief = makeBrief();
    assert.throws(
        () => runOperation(brief, { kind: 'set_boolean', targetPath: 'copy.privacyLine', params: { value: true } }),
        (err: unknown) => err instanceof FixerPathError,
    );
});

test('runOperation throws FixerPathError for invented path', () => {
    const brief = makeBrief();
    assert.throws(
        () => runOperation(brief, { kind: 'append_sentence_if_missing', targetPath: 'nonexistent.field', params: { sentence: 'test' } }),
        (err: unknown) => err instanceof FixerPathError,
    );
});

test('FixerPathError message includes the bad path', () => {
    const brief = makeBrief();
    try {
        runOperation(brief, { kind: 'normalize_time_strings', targetPath: 'copy.privacyLine' });
        assert.fail('Should have thrown');
    } catch (err) {
        assert.ok(err instanceof FixerPathError);
        assert.ok(err.message.includes('copy.privacyLine'));
    }
});

// ── All-no-op detection ───────────────────────────────────────────────────────

console.log('\nAll-no-op / AllNoOpError\n');

test('AllNoOpError is named correctly', () => {
    const err = new AllNoOpError();
    assert.equal(err.name, 'AllNoOpError');
    assert.ok(err instanceof Error);
});

test('set_boolean no-ops when value already matches', () => {
    const brief = makeBrief();
    const result = runOperation(brief, {
        kind: 'set_boolean',
        targetPath: 'videoConcepts.heroExplainer.avatarRequired',
        params: { value: false },
    });
    assert.equal(result.applied, false);
    assert.equal(result.appliedOperations[0].status, 'no_op');
});

test('set_enum no-ops when value already matches', () => {
    const brief = makeBrief();
    const result = runOperation(brief, {
        kind: 'set_enum',
        targetPath: 'videoConcepts.heroExplainer.tool',
        params: { value: 'runwayml' },
    });
    assert.equal(result.applied, false);
    assert.equal(result.appliedOperations[0].status, 'no_op');
});

// ── Privacy line injection — idempotency ──────────────────────────────────────

console.log('\nPrivacy Line Injection\n');

test('privacy injection appends sentence to compositionNotes', () => {
    const brief = makeBrief({ visual: { ...makeBrief().visual, compositionNotes: 'Wide angle framing.' } });
    const op = ISSUE_CODE_OPERATIONS.privacy_line_missing[0];
    const result = runOperation(brief, op);
    assert.equal(result.applied, true);
    const updated = result.brief.visual.compositionNotes;
    assert.ok(updated.includes("participant consent"), `Expected privacy sentence in compositionNotes, got: ${updated}`);
});

test('privacy injection is idempotent — second run is no-op', () => {
    const brief = makeBrief({ visual: { ...makeBrief().visual, compositionNotes: 'Wide angle.' } });
    const op = ISSUE_CODE_OPERATIONS.privacy_line_missing[0];
    const first = runOperation(brief, op);
    const second = runOperation(first.brief, op);
    assert.equal(second.applied, false);
    assert.equal(second.appliedOperations[0].status, 'no_op');
});

// ── Rail safety injection — idempotency ───────────────────────────────────────

console.log('\nRail Safety Injection\n');

test('rail safety injection appends sentence to compositionNotes', () => {
    const brief = makeBrief({ visual: { ...makeBrief().visual, compositionNotes: 'Wide angle.' } });
    const op = ISSUE_CODE_OPERATIONS.rail_safety_missing[0];
    const result = runOperation(brief, op);
    assert.equal(result.applied, true);
    assert.ok(result.brief.visual.compositionNotes.includes('deck railings'));
});

test('rail safety injection is idempotent — second run is no-op', () => {
    const brief = makeBrief({ visual: { ...makeBrief().visual, compositionNotes: 'Wide angle.' } });
    const op = ISSUE_CODE_OPERATIONS.rail_safety_missing[0];
    const first = runOperation(brief, op);
    const second = runOperation(first.brief, op);
    assert.equal(second.applied, false);
    assert.equal(second.appliedOperations[0].status, 'no_op');
});

// ── Filming permission injection — idempotency ────────────────────────────────

console.log('\nFilming Permission Gate\n');

test('filming permission injection appends sentence', () => {
    const brief = makeBrief({ visual: { ...makeBrief().visual, compositionNotes: 'Wide angle.' } });
    const op = ISSUE_CODE_OPERATIONS.filming_permissions_missing[0];
    const result = runOperation(brief, op);
    assert.equal(result.applied, true);
    assert.ok(result.brief.visual.compositionNotes.includes('prior written approval'));
});

test('filming permission injection is idempotent', () => {
    const brief = makeBrief({ visual: { ...makeBrief().visual, compositionNotes: 'Wide angle.' } });
    const op = ISSUE_CODE_OPERATIONS.filming_permissions_missing[0];
    const first = runOperation(brief, op);
    const second = runOperation(first.brief, op);
    assert.equal(second.applied, false);
});

// ── Venue genericization — idempotency ───────────────────────────────────────

console.log('\nVenue Genericization\n');

test('replaces starbucks with generic label', () => {
    const brief = makeBrief({ visual: { ...makeBrief().visual, compositionNotes: 'Meet at Starbucks on the lido deck.' } });
    const result = runOperation(brief, {
        kind: 'replace_named_venues_with_generic',
        targetPath: 'visual.compositionNotes',
    });
    assert.equal(result.applied, true);
    assert.ok(!result.brief.visual.compositionNotes.toLowerCase().includes('starbucks'));
    assert.ok(result.brief.visual.compositionNotes.includes('a coffee bar'));
});

test('venue genericization is idempotent — second run is no-op', () => {
    const brief = makeBrief({ visual: { ...makeBrief().visual, compositionNotes: 'Meet at Starbucks.' } });
    const op = { kind: 'replace_named_venues_with_generic' as const, targetPath: 'visual.compositionNotes' };
    const first = runOperation(brief, op);
    const second = runOperation(first.brief, op);
    assert.equal(second.applied, false);
});

test('no-ops when no branded names present', () => {
    const brief = makeBrief({ visual: { ...makeBrief().visual, compositionNotes: 'Golden sunset on open water.' } });
    const result = runOperation(brief, { kind: 'replace_named_venues_with_generic', targetPath: 'visual.compositionNotes' });
    assert.equal(result.applied, false);
    assert.equal(result.appliedOperations[0].status, 'no_op');
});

test('normalizes ship-incompatible venue phrasing inside productionBible.sceneLibrary', () => {
    const brief = makeBrief({
        productionBible: {
            storyboards: [],
            globalDirectionNotes: 'Keep ship spaces believable.',
            avoidDirectives: [],
            sceneLibrary: [
                {
                    sceneId: 'S10',
                    location: 'Windjammer Cafe open-air terrace/window side',
                    timeOfDay: 'late afternoon',
                    lighting: 'soft natural light',
                    cameraAngle: 'eye-level',
                    subjectAction: 'Two guests chat over coffee.',
                    environmentDetails: 'Ocean visible beyond the seating area.',
                    mood: 'easy and relaxed',
                    imagePrompt: 'Late lunch glow at the Windjammer Cafe open-air terrace/window side.',
                    referenceCategory: 'ship_interior',
                },
            ],
        },
    });

    const result = runOperation(brief, {
        kind: 'replace_named_venues_with_generic',
        targetPath: 'productionBible.sceneLibrary',
    });

    assert.equal(result.applied, true);
    const scene = result.brief.productionBible!.sceneLibrary[0];
    assert.equal(scene.location, 'Windjammer Café window-side seating');
    assert.ok(scene.imagePrompt.includes('Windjammer Café window-side seating'));
});

// ── Time normalization ────────────────────────────────────────────────────────

console.log('\nTime Normalization\n');

test('removes HH:MM exact time strings from narration', () => {
    const brief = makeBrief({ audio: { ...makeBrief().audio, ambientNarrationScript: 'Show starts at 8:30pm sharp. Boarding at 7:15pm.' } });
    const result = runOperation(brief, {
        kind: 'normalize_time_strings',
        targetPath: 'audio.ambientNarrationScript',
    });
    assert.equal(result.applied, true);
    assert.ok(!/\d{1,2}:\d{2}/.test(result.brief.audio.ambientNarrationScript), `HH:MM still present after normalization`);
});

test('time normalization is idempotent — second run is no-op', () => {
    const brief = makeBrief({ audio: { ...makeBrief().audio, ambientNarrationScript: 'Boarding at 6:00pm.' } });
    const op = { kind: 'normalize_time_strings' as const, targetPath: 'audio.ambientNarrationScript' };
    const first = runOperation(brief, op);
    const second = runOperation(first.brief, op);
    assert.equal(second.applied, false);
    assert.equal(second.appliedOperations[0].status, 'no_op');
});

test('no-ops when no time strings present', () => {
    const brief = makeBrief({ audio: { ...makeBrief().audio, ambientNarrationScript: 'Join us for a morning voyage.' } });
    const result = runOperation(brief, { kind: 'normalize_time_strings', targetPath: 'audio.ambientNarrationScript' });
    assert.equal(result.applied, false);
});

// ── Avatar/tool fix ───────────────────────────────────────────────────────────

console.log('\nAvatar / Tool Fix\n');

test('set_boolean applies avatarRequired = false when true', () => {
    const brief = makeBrief({
        videoConcepts: { ...makeBrief().videoConcepts, heroExplainer: makeVideoConcept({ avatarRequired: true }) },
    });
    const result = runOperation(brief, {
        kind: 'set_boolean',
        targetPath: 'videoConcepts.heroExplainer.avatarRequired',
        params: { value: false },
    });
    assert.equal(result.applied, true);
    assert.equal(result.brief.videoConcepts.heroExplainer.avatarRequired, false);
});

test('set_enum replaces heygen with runwayml on hero', () => {
    const brief = makeBrief({
        videoConcepts: { ...makeBrief().videoConcepts, heroExplainer: makeVideoConcept({ tool: 'heygen' }) },
    });
    const result = runOperation(brief, {
        kind: 'set_enum',
        targetPath: 'videoConcepts.heroExplainer.tool',
        params: { value: 'runwayml' },
    });
    assert.equal(result.applied, true);
    assert.equal(result.brief.videoConcepts.heroExplainer.tool, 'runwayml');
});

// ── Scarcity copy fix ─────────────────────────────────────────────────────────

console.log('\nScarcity Copy Fix\n');

test('replace_phrase_patterns removes T-N pattern from script', () => {
    const brief = makeBrief({
        videoConcepts: {
            ...makeBrief().videoConcepts,
            heroExplainer: makeVideoConcept({ scriptOrNarration: 'Only T-3 days remain — hurry!' }),
        },
    });
    const ops = ISSUE_CODE_OPERATIONS.compliance_risk_scarcity_copy.filter(
        op => op.targetPath === 'videoConcepts.heroExplainer.scriptOrNarration',
    );
    assert.equal(ops.length, 1, 'Expected exactly one compliance_risk op for heroExplainer.scriptOrNarration');
    const result = runOperation(brief, ops[0]);
    assert.equal(result.applied, true);
    assert.ok(!result.brief.videoConcepts.heroExplainer.scriptOrNarration.includes('T-3'));
    assert.ok(!result.brief.videoConcepts.heroExplainer.scriptOrNarration.includes('hurry'));
});

// ── ISSUE_CODE_OPERATIONS integrity ──────────────────────────────────────────

console.log('\nISSUE_CODE_OPERATIONS Integrity\n');

test('all operations in ISSUE_CODE_OPERATIONS target allowed paths', () => {
    const violations: string[] = [];
    for (const [code, ops] of Object.entries(ISSUE_CODE_OPERATIONS)) {
        for (const op of ops) {
            if (op.kind === 'replace_countdown_series') continue; // special case — no path check
            if (!isAllowedTargetPath(op.targetPath)) {
                violations.push(`${code}: ${op.targetPath}`);
            }
        }
    }
    assert.deepEqual(violations, [], `Operations with disallowed target paths: ${violations.join(', ')}`);
});

test('disallowed_video_tool does not target countdownSeries directly', () => {
    const ops = ISSUE_CODE_OPERATIONS.disallowed_video_tool;
    const bad = ops.filter(op => op.targetPath === 'videoConcepts.countdownSeries' && op.kind !== 'replace_countdown_series');
    assert.equal(bad.length, 0, 'disallowed_video_tool must not target countdownSeries with set_enum');
});

test('exact_time_strings maps only to normalize_time_strings ops on real fields', () => {
    const ops = ISSUE_CODE_OPERATIONS.exact_time_strings;
    assert.ok(ops.length > 0);
    for (const op of ops) {
        assert.equal(op.kind, 'normalize_time_strings');
        assert.ok(isAllowedTargetPath(op.targetPath), `exact_time_strings targets disallowed path: ${op.targetPath}`);
    }
});

test('queue_device_handling maps to replace_phrase_patterns ops with non-empty patterns', () => {
    const ops = ISSUE_CODE_OPERATIONS.queue_device_handling;
    assert.ok(ops.length > 0);
    for (const op of ops) {
        assert.equal(op.kind, 'replace_phrase_patterns');
        const patterns = op.params?.['patterns'] as string[] | undefined;
        assert.ok(Array.isArray(patterns) && patterns.length > 0, `queue_device_handling op at ${op.targetPath} has empty patterns`);
    }
});

test('safe rail references do not trigger rail_safety_missing detection', () => {
    const suggested = suggestDeterministicIssueCodes([], 'Deck 5 starboard rail shade pockets, moving flow, no lines, keep right.');
    assert.ok(!suggested.includes('rail_safety_missing'));
});

test('year-like colon strings do not trigger exact_time_strings detection', () => {
    const suggested = suggestDeterministicIssueCodes([], 'Pricing snapshot 2026:11 and coordinate marker 91:77 are metadata placeholders.');
    assert.ok(!suggested.includes('exact_time_strings'));
});

test('photoshop mention does not trigger privacy_line_missing detection', () => {
    const suggested = suggestDeterministicIssueCodes([], 'Color grade pass in Photoshop before export.');
    assert.ok(!suggested.includes('privacy_line_missing'));
});

// ── Downstream semantics ──────────────────────────────────────────────────────

console.log('\nDownstream Semantics\n');

test('VIDEO_DELIVERABLE_SPECS countdown_1 title is not scarcity copy', async () => {
    const { VIDEO_DELIVERABLE_SPECS } = await import('../media/video-deliverable-specs');
    const countdown = VIDEO_DELIVERABLE_SPECS.find(s => s.id === 'countdown_1');
    assert.ok(countdown, 'countdown_1 spec not found');
    assert.ok(!/cabin|scarcity|countdown|T-\d/i.test(countdown.title), `countdown_1 title contains scarcity copy: "${countdown.title}"`);
});

test('distribution-planner copyVariants use neutral window_ prefix', async () => {
    const { buildDistributionSchedule } = await import('../distribution-planner');
    const campaign = { id: 'test', status: 'GATHERING_INTEREST', communityChannelUrl: null } as unknown as Parameters<typeof buildDistributionSchedule>[0];
    const manifest = {
        videos: { countdown: [{ assetId: 'vid_window_1' }, { assetId: 'vid_window_2' }, { assetId: 'vid_window_3' }] },
        images: { hero: [], platformCrops: {}, aestheticConcepts: [] },
        audio: {},
        merch: { mockups: [] },
    } as unknown as Parameters<typeof buildDistributionSchedule>[1];
    const schedule = buildDistributionSchedule(campaign, manifest, { caller: 'agent' });
    const countdownPosts = schedule.posts.filter(p =>
        p.assetId.includes('window_') || p.copyVariant.includes('window_'),
    );
    for (const post of countdownPosts) {
        assert.ok(!post.copyVariant.includes('countdown_day'), `copyVariant "${post.copyVariant}" still uses countdown_day prefix`);
    }
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
