import type { CampaignAestheticBrief, Storyboard, TikTokPromotionPackage, TikTokPromotionBeat } from '../../../schema';
import type { TikTokOverlayCardSpec, TikTokBrandLockupSpec } from '../tiktok-overlay-cards';

// ────────────────────────────────────────────────────────────────────────────
// Shared TikTok Package Template
//
// Mirrors the sandbox prototype aesthetic, meshed with the campaign manifest.
//
// Sequence architecture (mirrors sandbox):
//   - Cycles three presets: hook → social → cta → hook → social → cta …
//   - Each beat maps to a storyboard shot: sceneId, durationSeconds,
//     narrationSegment
//   - narrationSegment (written by the brief engine per shot) is the primary
//     spoken text for the beat; card copy provides the visual layer
//
// Visual layout per preset (identical placements to sandbox):
//   hook    one tag card at top + brand lockup
//   social  tag at top + statement at bottom + brand lockup
//   cta     statement mid-frame + pill button below + brand lockup
//
// Content mapping (brief fields → card slots):
//   hook tag headline   socialConcepts.tiktokOrganic.hook
//   hook tag subline    toneKeywords[0-1] joined · or aestheticLabel
//   social tag headline messaging.heroSlogan
//   social tag subline  communityExpression.socialGravity
//   social stmt head    communityExpression.corePromise
//   social stmt sub     communityExpression.copyFramingRule
//   cta stmt headline   messaging.heroSlogan
//   cta stmt subline    messaging.subSlogan
//   cta pill headline   messaging.ctaVariants.bookNow
//   accent colors       colorPalette.primary / secondary / accent
// ────────────────────────────────────────────────────────────────────────────

export type TikTokPresetId = 'hook' | 'social' | 'cta';

export interface TikTokSequenceBeat {
    presetId: TikTokPresetId;
    /** Scene image ID for this beat — from storyboard.shotSequence[i].sceneId */
    sceneId: string;
    overlaySpecs: TikTokOverlayCardSpec[];
    brandLockup: TikTokBrandLockupSpec;
    /** Primary spoken text: storyboard narrationSegment → card copy fallback */
    spokenText: string;
    durationSeconds: number;
}

export interface PackageTemplateOptions {
    /** Number of beats. Clamped [3, 8]. Defaults to storyboard length or 6. */
    beatCount?: number;
    /** Total duration in seconds. Defaults to storyboard total or 35. */
    targetDurationSeconds?: number;
}

const PRESET_ROTATION: readonly TikTokPresetId[] = ['hook', 'social', 'cta'];

const BRAND_WORDMARK = 'Leisure Life';
const BRAND_TAGLINE = 'Cruises that fit';
const BRAND_LOCKUP_PLACEMENT = { x: 70, y: 138, width: 420, height: 50 } as const;

// ── helpers ──────────────────────────────────────────────────────────────────

function n(value: string | undefined | null): string {
    return (value ?? '').replace(/\s+/g, ' ').trim();
}

function shorten(value: string, maxChars: number): string {
    const s = n(value);
    if (s.length <= maxChars) return s;
    return `${s.slice(0, Math.max(1, maxChars - 1)).trimEnd()}...`;
}

function first(...candidates: string[]): string {
    for (const c of candidates) {
        const s = n(c);
        if (s.length > 0) return s;
    }
    return '';
}

// ── content resolver — maps brief fields to named card slots ─────────────────

interface ResolvedCardContent {
    // hook preset
    hookHeadline: string;
    hookSubline: string;

    // social preset — tag card (top)
    socialTagHeadline: string;
    socialTagSubline: string;

    // social preset — statement card (bottom)
    socialStatementHeadline: string;
    socialStatementSubline: string;

    // cta preset — statement card (mid-frame)
    ctaStatementHeadline: string;
    ctaStatementSubline: string;

    // cta preset — pill button
    ctaPillHeadline: string;
}

function resolveCardContent(brief: CampaignAestheticBrief): ResolvedCardContent {
    const tiktokHook       = n(brief.socialConcepts.tiktokOrganic.hook);
    const heroSlogan       = n(brief.messaging.heroSlogan);
    const subSlogan        = n(brief.messaging.subSlogan);
    const elevatorPitch    = n(brief.messaging.elevatorPitch);
    const corePromise      = n(brief.communityExpression.corePromise);
    const socialGravity    = n(brief.communityExpression.socialGravity);
    const copyFramingRule  = n(brief.communityExpression.copyFramingRule);
    const aestheticLabel   = n(brief.visual.aestheticLabel);
    const toneKeywords     = brief.messaging.toneKeywords.filter(Boolean);
    const narrativeTitle   = n(brief.socialConcepts.tiktokOrganic.narrative.title);
    const bookNow          = first(brief.messaging.ctaVariants.bookNow, 'Join List');

    // Hook subline: short atmospheric descriptor.
    // Use the first two tone keywords joined with ' · ' if available;
    // fall back to aesthetic label or elevator pitch (shortened).
    const hookSubline = shorten(
        first(
            toneKeywords.slice(0, 2).join(' · '),
            aestheticLabel,
            elevatorPitch,
        ),
        70,
    );

    // Social proof headline: brief's community core promise or narrative title.
    // Should be a short, declarative assertion ("People first. Games second.").
    const socialStatementHeadline = shorten(
        first(corePromise, narrativeTitle, subSlogan),
        60,
    );

    // Social tag subline: what draws this group together (social gravity).
    const socialTagSubline = shorten(
        first(socialGravity, copyFramingRule, subSlogan),
        75,
    );

    // Social statement subline: the editorial framing rule for this community.
    const socialStatementSubline = shorten(
        first(copyFramingRule, elevatorPitch),
        90,
    );

    return {
        hookHeadline:            first(tiktokHook, heroSlogan),
        hookSubline,

        socialTagHeadline:       heroSlogan,
        socialTagSubline,

        socialStatementHeadline,
        socialStatementSubline,

        ctaStatementHeadline:    heroSlogan,
        ctaStatementSubline:     shorten(first(subSlogan, elevatorPitch), 75),

        ctaPillHeadline:         bookNow,
    };
}

// ── brand lockup ─────────────────────────────────────────────────────────────

function buildBrandLockup(accentColor: string): TikTokBrandLockupSpec {
    return {
        wordmark: BRAND_WORDMARK,
        tagline:  BRAND_TAGLINE,
        accentColor,
        placement: { ...BRAND_LOCKUP_PLACEMENT },
    };
}

// ── per-preset beat builders ──────────────────────────────────────────────────
// Layout + placement constants mirror the sandbox TEMPLATE_PRESETS exactly.

function buildHookBeat(
    brief: CampaignAestheticBrief,
    content: ResolvedCardContent,
    durationSeconds: number,
    sceneId: string,
    spokenText: string,
): TikTokSequenceBeat {
    const accent = brief.visual.colorPalette.primary;
    const accentMuted = brief.visual.colorPalette.secondary;
    const spoken = first(spokenText, content.hookHeadline);

    return {
        presetId: 'hook',
        sceneId,
        overlaySpecs: [
            {
                badge:       'OPENING',
                headline:    content.hookHeadline,
                subline:     content.hookSubline,
                spokenText:  spoken,
                accentColor: accent,
                accentMuted,
                variant:     'tag',
                placement:   { x: 70, y: 220, width: 940, height: 220 },
            },
        ],
        brandLockup: buildBrandLockup(accent),
        spokenText:  spoken,
        durationSeconds,
    };
}

function buildSocialBeat(
    brief: CampaignAestheticBrief,
    content: ResolvedCardContent,
    durationSeconds: number,
    sceneId: string,
    spokenText: string,
): TikTokSequenceBeat {
    const accent = brief.visual.colorPalette.secondary;
    const accentMuted = brief.visual.colorPalette.primary;
    const spoken = first(
        spokenText,
        `${content.socialTagHeadline}. ${content.socialStatementHeadline}`,
    );

    return {
        presetId: 'social',
        sceneId,
        overlaySpecs: [
            {
                badge:       'GROUP ENERGY',
                headline:    content.socialTagHeadline,
                subline:     content.socialTagSubline,
                spokenText:  '',
                accentColor: accent,
                accentMuted,
                variant:     'tag',
                placement:   { x: 70, y: 220, width: 940, height: 200 },
            },
            {
                badge:       'PROOF',
                headline:    content.socialStatementHeadline,
                subline:     content.socialStatementSubline,
                spokenText:  '',
                accentColor: accent,
                accentMuted,
                variant:     'statement',
                placement:   { x: 70, y: 1180, width: 940, height: 320 },
            },
        ],
        brandLockup: buildBrandLockup(accent),
        spokenText:  spoken,
        durationSeconds,
    };
}

function buildCtaBeat(
    brief: CampaignAestheticBrief,
    content: ResolvedCardContent,
    durationSeconds: number,
    sceneId: string,
    spokenText: string,
): TikTokSequenceBeat {
    const accent = brief.visual.colorPalette.accent;
    const accentMuted = brief.visual.colorPalette.secondary;
    const spoken = first(
        spokenText,
        `${content.ctaStatementHeadline}. ${content.ctaPillHeadline}.`,
    );

    return {
        presetId: 'cta',
        sceneId,
        overlaySpecs: [
            {
                badge:       'BOOK NOW',
                headline:    content.ctaStatementHeadline,
                subline:     content.ctaStatementSubline,
                spokenText:  '',
                accentColor: accent,
                accentMuted,
                variant:     'statement',
                placement:   { x: 70, y: 1100, width: 940, height: 320 },
            },
            {
                badge:       'RESERVE',
                headline:    content.ctaPillHeadline,
                subline:     '',
                spokenText:  '',
                accentColor: accent,
                accentMuted,
                variant:     'cta',
                placement:   { x: 140, y: 1480, width: 800, height: 110 },
            },
        ],
        brandLockup: buildBrandLockup(accent),
        spokenText:  spoken,
        durationSeconds,
    };
}

function buildBeatForPreset(
    presetId: TikTokPresetId,
    brief: CampaignAestheticBrief,
    content: ResolvedCardContent,
    durationSeconds: number,
    sceneId: string,
    spokenText: string,
): TikTokSequenceBeat {
    switch (presetId) {
        case 'hook':   return buildHookBeat(brief, content, durationSeconds, sceneId, spokenText);
        case 'social': return buildSocialBeat(brief, content, durationSeconds, sceneId, spokenText);
        case 'cta':    return buildCtaBeat(brief, content, durationSeconds, sceneId, spokenText);
    }
}

// ── promotion-aware beat builders ────────────────────────────────────────────
// When a synthesized TikTokPromotionPackage is available, these use its beat
// copy instead of deriving from brief fields. The visual layout (placements,
// variants, brand lockup) stays identical — only the text content changes.
//
// Social beat layout: headline → TOP tag card, subline → BOTTOM statement card.
// CTA beat layout:    headline → statement card, beat.cta → pill button label.
// Hook/payoff layout: headline → tag card, subline → tag card supporting line.

function buildHookBeatFromPromotion(
    beat: TikTokPromotionBeat,
    brief: CampaignAestheticBrief,
    durationSeconds: number,
    sceneId: string,
    shotNarration: string,
): TikTokSequenceBeat {
    const accent = brief.visual.colorPalette.primary;
    const spokenText = first(beat.spokenText, shotNarration, beat.headline);
    return {
        presetId: 'hook',
        sceneId,
        overlaySpecs: [
            {
                badge:       beat.badge ?? 'OPENING',
                headline:    beat.headline,
                subline:     beat.subline,
                spokenText,
                accentColor: accent,
                accentMuted: brief.visual.colorPalette.secondary,
                variant:     'tag',
                placement:   { x: 70, y: 220, width: 940, height: 220 },
            },
        ],
        brandLockup: buildBrandLockup(accent),
        spokenText,
        durationSeconds,
    };
}

function buildSocialBeatFromPromotion(
    beat: TikTokPromotionBeat,
    brief: CampaignAestheticBrief,
    durationSeconds: number,
    sceneId: string,
    shotNarration: string,
): TikTokSequenceBeat {
    const accent = brief.visual.colorPalette.secondary;
    const accentMuted = brief.visual.colorPalette.primary;
    const spokenText = first(beat.spokenText, shotNarration);
    // headline drives the top tag card; subline drives the bottom statement card
    const tagBadge       = beat.badge ?? (beat.role === 'proof' ? 'PROOF' : 'GROUP ENERGY');
    const statementBadge = beat.role === 'proof' ? 'CREDIBILITY' : 'PROOF';
    return {
        presetId: 'social',
        sceneId,
        overlaySpecs: [
            {
                badge:       tagBadge,
                headline:    beat.headline,
                subline:     '',
                spokenText:  '',
                accentColor: accent,
                accentMuted,
                variant:     'tag',
                placement:   { x: 70, y: 220, width: 940, height: 200 },
            },
            {
                badge:       statementBadge,
                headline:    beat.subline,
                subline:     '',
                spokenText:  '',
                accentColor: accent,
                accentMuted,
                variant:     'statement',
                placement:   { x: 70, y: 1180, width: 940, height: 320 },
            },
        ],
        brandLockup: buildBrandLockup(accent),
        spokenText,
        durationSeconds,
    };
}

function buildCtaBeatFromPromotion(
    beat: TikTokPromotionBeat,
    brief: CampaignAestheticBrief,
    durationSeconds: number,
    sceneId: string,
    shotNarration: string,
): TikTokSequenceBeat {
    const accent = brief.visual.colorPalette.accent;
    const accentMuted = brief.visual.colorPalette.secondary;
    const pillLabel = first(beat.cta ?? '', brief.messaging.ctaVariants.bookNow, 'Join List');
    const spokenText = first(beat.spokenText, shotNarration, `${beat.headline}. ${pillLabel}.`);
    return {
        presetId: 'cta',
        sceneId,
        overlaySpecs: [
            {
                badge:       beat.badge ?? 'BOOK NOW',
                headline:    beat.headline,
                subline:     beat.subline,
                spokenText:  '',
                accentColor: accent,
                accentMuted,
                variant:     'statement',
                placement:   { x: 70, y: 1100, width: 940, height: 320 },
            },
            {
                badge:       'RESERVE',
                headline:    pillLabel,
                subline:     '',
                spokenText:  '',
                accentColor: accent,
                accentMuted,
                variant:     'cta',
                placement:   { x: 140, y: 1480, width: 800, height: 110 },
            },
        ],
        brandLockup: buildBrandLockup(accent),
        spokenText,
        durationSeconds,
    };
}

function buildBeatFromPromotion(
    promotionBeat: TikTokPromotionBeat,
    presetId: TikTokPresetId,
    brief: CampaignAestheticBrief,
    durationSeconds: number,
    sceneId: string,
    shotNarration: string,
): TikTokSequenceBeat {
    switch (presetId) {
        case 'hook':   return buildHookBeatFromPromotion(promotionBeat, brief, durationSeconds, sceneId, shotNarration);
        case 'social': return buildSocialBeatFromPromotion(promotionBeat, brief, durationSeconds, sceneId, shotNarration);
        case 'cta':    return buildCtaBeatFromPromotion(promotionBeat, brief, durationSeconds, sceneId, shotNarration);
    }
}

// ── public API ────────────────────────────────────────────────────────────────

/**
 * Build the sequence beat plan that drives production TikTok generation.
 *
 * Fallback priority (per TIKTOK_PROMOTION_SYNTHESIS_PHASE_PLAN.md §8):
 *   1. synthesized TikTokPromotionPackage beats  — campaign-specific, distinct
 *   2. storyboard narrationSegment               — shot-specific, production bible
 *   3. brief field derivation                    — safe fallback
 *
 * Scene and duration always come from the storyboard (explicit, production bible).
 */
export function buildPackageSequenceBeats(
    brief: CampaignAestheticBrief,
    storyboard?: Storyboard,
    options: PackageTemplateOptions = {},
    promotionPackage?: TikTokPromotionPackage | null,
): TikTokSequenceBeat[] {
    const shots = storyboard?.shotSequence ?? [];
    const sourceBeatCount = shots.length || options.beatCount || 6;
    const beatCount = Math.max(3, Math.min(8, options.beatCount ?? sourceBeatCount));
    const totalDuration = options.targetDurationSeconds ?? storyboard?.totalDurationSeconds ?? 35;
    const evenDuration = Number((totalDuration / beatCount).toFixed(1));

    if (!promotionPackage) {
        throw new Error('TikTok promotion package is required to build package sequence beats.');
    }

    const promotionBeats = promotionPackage.beats ?? [];
    if (promotionBeats.length < beatCount) {
        throw new Error(
            `TikTok promotion package has ${promotionBeats.length} beats, but ${beatCount} beats are required for this render.`,
        );
    }

    const beats: TikTokSequenceBeat[] = [];

    for (let i = 0; i < beatCount; i++) {
        const presetId      = PRESET_ROTATION[i % PRESET_ROTATION.length];
        const shot          = shots[i];
        const duration      = shot?.durationSeconds ?? evenDuration;
        const sceneId       = n(shot?.sceneId ?? '');
        const shotNarration = n(shot?.narrationSegment ?? '');

        const promotionBeat = promotionBeats[i];
        if (!promotionBeat) {
            throw new Error(`TikTok promotion package is missing beat ${i + 1} of ${beatCount}.`);
        }
        beats.push(buildBeatFromPromotion(promotionBeat, presetId, brief, duration, sceneId, shotNarration));
    }

    return beats;
}

/**
 * Backward-compatible flat overlay list for the motion-clip path.
 * Returns the most prominent card per beat (statement > tag > first).
 */
export function flattenSequenceBeatsToPrimaryOverlays(beats: readonly TikTokSequenceBeat[]): TikTokOverlayCardSpec[] {
    return beats.map((beat) => {
        const statement = beat.overlaySpecs.find((spec) => spec.variant === 'statement');
        return statement ?? beat.overlaySpecs[0];
    });
}
