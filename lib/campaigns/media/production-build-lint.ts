import type {
    LandingStillBible,
    LandingStillSpec,
    ProductionBible,
    ProductionBuildLintReport,
    ProductionBuildLintIssue,
    ProductionBuildLintVerdict,
    ProductionBuildPatternSummary,
    ProductionBuildStillDiagnostic,
} from '../schema';

// ────────────────────────────────────────────────────────────────────────────
// Production Build Lint — Structural Spend Gate
// Evaluates a LandingStillBible against heuristic rules to determine whether
// the build is safe to proceed to hero/concept image generation.
// ────────────────────────────────────────────────────────────────────────────

// ── Token helpers ─────────────────────────────────────────────────────────

function normalizeTokens(text: string): string[] {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(t => t.length > 2);
}

const GENERIC_CRUISE_TOKENS = new Set([
    'sea', 'ocean', 'deck', 'ship', 'cruise', 'horizon', 'couple',
    'sunset', 'golden', 'tropical', 'clear', 'water', 'smile', 'laugh',
    'relax', 'enjoy', 'blue', 'sun', 'sky', 'wave', 'sail', 'view',
    'island', 'beach', 'together', 'two', 'partner', 'friends', 'guests',
    'light', 'warm', 'cool', 'fresh', 'breeze', 'wind', 'travel',
    'vacation', 'aboard', 'onboard', 'railing', 'balcony', 'window',
    'rail', 'outdoor', 'passengers', 'port',
]);

// ── Location family ──────────────────────────────────────────────────────

const LOCATION_FAMILY_MAP: Array<[string[], string]> = [
    [['rail', 'railing', 'balcony'], 'rail'],
    [['deck', 'outdoor', 'lido', 'pool'], 'deck'],
    [['cabin', 'window', 'porthole', 'stateroom', 'round window'], 'cabin_window'],
    [['dining', 'restaurant', 'dinner', 'meal', 'table'], 'dining'],
    [['lounge', 'bar', 'lobby', 'atrium'], 'lounge'],
    [['bow', 'stern', 'promenade'], 'promenade'],
    [['port', 'shore', 'dock', 'pier', 'harbor'], 'port_shore'],
];

export function extractLocationFamily(still: LandingStillSpec): string {
    const locationText = still.location.toLowerCase();
    const environmentText = still.environmentDetails.toLowerCase();
    for (const [keywords, family] of LOCATION_FAMILY_MAP) {
        if (keywords.some(kw => locationText.includes(kw))) return family;
    }
    for (const [keywords, family] of LOCATION_FAMILY_MAP) {
        if (keywords.some(kw => environmentText.includes(kw))) return family;
    }
    return 'other';
}

// ── Action family ────────────────────────────────────────────────────────

const ACTION_FAMILY_MAP: Array<[string[], string]> = [
    [['laugh', 'smile', 'joy', 'delight', 'giggle'], 'laughing'],
    [['chat', 'talk', 'convers', 'discuss', 'whisper'], 'chatting'],
    [['contempl', 'gaze', 'look', 'watch', 'stare', 'observe'], 'gazing'],
    [['read', 'book', 'page', 'novel'], 'reading'],
    [['dine', 'eat', 'meal', 'drink', 'sip', 'taste'], 'dining'],
    [['walk', 'stroll', 'wander', 'pace'], 'walking'],
    [['sit', 'lounge', 'lean', 'rest', 'recline'], 'lounging'],
    [['danc', 'move', 'sway', 'spin'], 'dancing'],
];

function extractActionFamily(still: LandingStillSpec): string {
    const combined = `${still.subjectAction} ${still.composition}`.toLowerCase();
    for (const [keywords, family] of ACTION_FAMILY_MAP) {
        if (keywords.some(kw => combined.includes(kw))) return family;
    }
    return 'other';
}

// ── Mood family ──────────────────────────────────────────────────────────

const MOOD_FAMILY_MAP: Array<[string[], string]> = [
    [['intimate', 'tender', 'close', 'romantic', 'soft'], 'intimate'],
    [['contempl', 'quiet', 'solo', 'alone', 'peaceful', 'serene'], 'contemplative'],
    [['joyful', 'playful', 'energetic', 'vibrant', 'lively', 'exuberant'], 'joyful'],
    [['editorial', 'cinematic', 'dramatic', 'bold', 'striking'], 'editorial'],
    [['warm', 'cozy', 'golden', 'nostalgic', 'amber'], 'warm'],
    [['cool', 'crisp', 'clean', 'modern', 'minimal'], 'modern'],
];

function extractMoodFamily(still: LandingStillSpec): string {
    const moodText = still.mood.toLowerCase();
    for (const [keywords, family] of MOOD_FAMILY_MAP) {
        if (keywords.some(kw => moodText.includes(kw))) return family;
    }
    return 'neutral';
}

// ── Shot role ────────────────────────────────────────────────────────────

function extractShotRole(still: LandingStillSpec): 'hero' | 'editorial' | 'intimate' | 'supporting' {
    // ── Structural slot assignment takes priority when present ────────
    // slotRole is enforced by anchor compliance; trust it over composition heuristics.
    if (still.slotRole === 'HERO_PRIMARY' || still.slotRole === 'HERO_ALT') return 'hero';
    if (still.slotRole === 'EDITORIAL_WIDE_A' || still.slotRole === 'EDITORIAL_WIDE_B') return 'editorial';
    if (still.slotRole === 'INTIMATE') return 'intimate';
    // FLEX and undefined slotRole fall through to usage/composition inference

    if (still.usage === 'hero_primary' || still.usage === 'hero_alt') return 'hero';
    if (still.usage === 'concept') {
        const compLower = still.composition.toLowerCase();
        if (
            compLower.includes('intimate') || compLower.includes('close') ||
            compLower.includes('tight') || compLower.includes('detail')
        ) {
            return 'intimate';
        }
        return 'editorial';
    }
    if (still.usage === 'email_header') return 'editorial';
    return 'supporting';
}

// ── Composition family (cluster detection) ───────────────────────────────

const COMPOSITION_CLUSTER_MAP: Array<[string[], string[], string]> = [
    [['rail', 'railing', 'balcony'], ['laugh', 'smile', 'couple', 'two', 'partner', 'together'], 'rail_couple_laugh'],
    [['porthole', 'round window', 'stateroom'], ['quiet', 'solo', 'single', 'alone', 'contempl', 'gaze'], 'quiet_window_solo'],
    [['dining', 'restaurant', 'dinner'], ['intimate', 'couple', 'candlelight', 'close', 'tender'], 'dining_intimacy'],
    // Active creative deck/balcony/solarium scenes should not collapse into the generic
    // deck_sea_wide bucket just because the composition remains wide and scenic context is present.
    [['deck', 'outdoor', 'pool', 'solarium', 'balcony'], ['camera', '35mm', 'point-and-shoot', 'point‑and‑shoot', 'film', 'postcard', 'zine', 'stamp', 'mini-print', 'mini‑print', 'notebook', 'thread', 'load'], 'creative_deck_activity'],
    // night_sky_deck must come before deck_sea_wide — stargazing scenes have 'deck' location and
    // 'view/horizon/sea' action, so without this earlier cluster they collapse into deck_sea_wide.
    [['deck', 'outdoor', 'bow', 'stern'], ['star', 'night sky', 'telescope', 'constellation', 'milky', 'astro', 'lunar', 'moon', 'stargazing', 'celestial'], 'night_sky_deck'],
    // music_deck_activity prevents festival/music scenes from collapsing into deck_sea_wide
    [['deck', 'outdoor', 'pool', 'solarium', 'balcony', 'bow', 'stern'], ['music', 'beat', 'dance', 'dancing', 'dj', 'speaker', 'stage', 'drop', 'track', 'audio', 'turntable', 'foam', 'bass'], 'music_deck_activity'],
    [['deck', 'outdoor', 'bow', 'stern'], ['couple', 'sea', 'sunset', 'horizon', 'distance', 'wide', 'far', 'view'], 'deck_sea_wide'],
    [['pool', 'lido'], ['relax', 'lounge', 'float', 'swim', 'splash'], 'poolside_relax'],
    [['lounge', 'bar'], ['drink', 'sip', 'cocktail', 'chat', 'talk'], 'lounge_social'],
];

function extractCompositionFamily(still: LandingStillSpec): string {
    const locationText = still.location.toLowerCase();
    const environmentText = still.environmentDetails.toLowerCase();
    const actionText = `${still.subjectAction} ${still.composition}`.toLowerCase();

    for (const [locKw, actKw, family] of COMPOSITION_CLUSTER_MAP) {
        const locationHit = locKw.some(kw => locationText.includes(kw));
        const actionHit = actKw.some(kw => actionText.includes(kw));
        if (locationHit && actionHit) return family;
    }

    for (const [locKw, actKw, family] of COMPOSITION_CLUSTER_MAP) {
        const locationHit = locKw.some(kw => environmentText.includes(kw));
        const actionHit = actKw.some(kw => actionText.includes(kw));
        if (locationHit && actionHit) return family;
    }

    return `${extractLocationFamily(still)}_${extractActionFamily(still)}`;
}

const GENERIC_FALLBACK_FAMILIES = new Set([
    'rail_couple_laugh',
    'quiet_window_solo',
    'dining_intimacy',
    'deck_sea_wide',
]);

// ── Niche cue detection ──────────────────────────────────────────────────

function detectCueStrength(
    still: LandingStillSpec,
    nicheKeywords: string[],
): 'explicit' | 'subtle' | 'absent' {
    const promptTokens = normalizeTokens(still.imagePrompt);
    const actionTokens = normalizeTokens(still.subjectAction);
    const envTokens = normalizeTokens(still.environmentDetails);
    const compTokens = normalizeTokens(still.composition);

    if (nicheKeywords.length > 0) {
        const lowerKw = nicheKeywords.map(k => k.toLowerCase());
        // Use full raw text for matching — single tokens can't contain multi-word phrases
        // like "sock heel", "stitch marker", "embroidery hoop", etc.
        const primaryText = `${still.imagePrompt} ${still.subjectAction}`.toLowerCase();
        const secondaryText = `${still.environmentDetails} ${still.composition}`.toLowerCase();
        if (lowerKw.some(kw => primaryText.includes(kw))) return 'explicit';
        if (lowerKw.some(kw => secondaryText.includes(kw))) return 'subtle';
        return 'absent';
    }

    // No niche keywords — negative check against generic cruise token set
    const allTokens = [...promptTokens, ...actionTokens, ...envTokens, ...compTokens];
    const nonGenericTokens = allTokens.filter(t => !GENERIC_CRUISE_TOKENS.has(t) && t.length > 3);

    if (nonGenericTokens.length >= 4) return 'explicit';
    if (nonGenericTokens.length >= 2) return 'subtle';
    return 'absent';
}

// ── Per-still diagnostic ─────────────────────────────────────────────────

function buildStillDiagnostic(
    still: LandingStillSpec,
    nicheKeywords: string[],
): ProductionBuildStillDiagnostic {
    const locationFamily = extractLocationFamily(still);
    const actionFamily = extractActionFamily(still);
    const moodFamily = extractMoodFamily(still);
    const shotRole = extractShotRole(still);
    const compositionFamily = extractCompositionFamily(still);
    const cueStrength = detectCueStrength(still, nicheKeywords);
    // A still with an explicit niche cue is niche-specific by definition —
    // its spatial composition cluster does not override that identity.
    // Only suppress generic flag when niche keywords are provided (context is available) AND cue is explicit.
    // Without niche keywords, preserve original spatial cluster detection (no context to redeem by).
    const nicheRedeems = nicheKeywords.length > 0 && cueStrength === 'explicit';
    const isGeneric = GENERIC_FALLBACK_FAMILIES.has(compositionFamily) && !nicheRedeems;

    const flags: string[] = [];
    if (isGeneric) flags.push('generic_fallback_template');
    if (cueStrength === 'absent') flags.push('no_niche_cue');
    if (cueStrength === 'subtle') flags.push('weak_niche_cue');

    return {
        stillId: still.stillId,
        usage: still.usage,
        locationFamily,
        actionFamily,
        moodFamily,
        shotRole,
        cueStrength,
        isGenericFallback: isGeneric,
        compositionFamily,
        flags,
    };
}

function buildPatternSummary(diagnostics: ProductionBuildStillDiagnostic[]): ProductionBuildPatternSummary {
    const locationClusters: Record<string, string[]> = {};
    const actionClusters: Record<string, string[]> = {};
    const moodClusters: Record<string, string[]> = {};

    for (const d of diagnostics) {
        locationClusters[d.locationFamily] = [...(locationClusters[d.locationFamily] ?? []), d.stillId];
        actionClusters[d.actionFamily] = [...(actionClusters[d.actionFamily] ?? []), d.stillId];
        moodClusters[d.moodFamily] = [...(moodClusters[d.moodFamily] ?? []), d.stillId];
    }

    return {
        locationClusters,
        actionClusters,
        moodClusters,
        genericFallbackStillIds: diagnostics.filter(d => d.isGenericFallback).map(d => d.stillId),
        noCueStillIds: diagnostics.filter(d => d.cueStrength === 'absent').map(d => d.stillId),
        subtleCueStillIds: diagnostics.filter(d => d.cueStrength === 'subtle').map(d => d.stillId),
        explicitCueStillIds: diagnostics.filter(d => d.cueStrength === 'explicit').map(d => d.stillId),
    };
}

// ── Lint input type ───────────────────────────────────────────────────────

export interface ProductionBuildLintInput {
    landingStillBible: LandingStillBible;
    productionBible?: ProductionBible;
    themeName?: string;
    nicheKeywords?: string[];
}

// ── Main lint function ────────────────────────────────────────────────────

export function lintProductionBuild(input: ProductionBuildLintInput): ProductionBuildLintReport {
    const { landingStillBible, themeName, nicheKeywords = [] } = input;
    const stills = landingStillBible.stillLibrary;

    const effectiveNicheKeywords = nicheKeywords.length > 0
        ? nicheKeywords
        : (themeName
            ? normalizeTokens(themeName).filter(t => !GENERIC_CRUISE_TOKENS.has(t) && t.length > 3)
            : []);

    const diagnostics = stills.map(still => buildStillDiagnostic(still, effectiveNicheKeywords));
    const patternSummary = buildPatternSummary(diagnostics);

    const blockingIssues: ProductionBuildLintIssue[] = [];
    const warnings: ProductionBuildLintIssue[] = [];

    // ── Rule A: Composition family clustering (slot differentiation) ──────
    const compositionGroups: Record<string, string[]> = {};
    for (const d of diagnostics) {
        compositionGroups[d.compositionFamily] = [
            ...(compositionGroups[d.compositionFamily] ?? []),
            d.stillId,
        ];
    }

    let maxCompositionFamilySize = 0;
    for (const [family, ids] of Object.entries(compositionGroups)) {
        if (ids.length > maxCompositionFamilySize) maxCompositionFamilySize = ids.length;
        if (ids.length >= 3) {
            // Downgrade to warning only when:
            // (a) actual niche keywords were supplied (so we have context to evaluate redemption)
            // (b) the family is NOT a known generic-fallback cluster (those should still block
            //     even with niche cues — visual diversity is a separate requirement)
            // (c) every still in the cluster has an explicit niche cue
            const allNicheRedeemed = effectiveNicheKeywords.length > 0
                && !GENERIC_FALLBACK_FAMILIES.has(family)
                && ids.every(id => {
                    const diag = diagnostics.find(d => d.stillId === id);
                    return diag?.cueStrength === 'explicit';
                });
            if (allNicheRedeemed) {
                warnings.push({
                    code: 'repeated_composition_family',
                    severity: 'warning',
                    message: `${ids.length} stills share composition family "${family}" — all have explicit niche cues so this is thematic consistency, not generic collapse.`,
                    affectedStillIds: ids,
                });
            } else {
                blockingIssues.push({
                    code: 'repeated_composition_family',
                    severity: 'blocker',
                    message: `${ids.length} stills share composition family "${family}" — set collapses into the same read.`,
                    affectedStillIds: ids,
                    details: `Vary location, subject action, and framing. Affected: ${ids.join(', ')}.`,
                });
            }
        } else if (ids.length === 2) {
            warnings.push({
                code: 'repeated_composition_family',
                severity: 'warning',
                message: `2 stills share composition family "${family}" — mild repetition.`,
                affectedStillIds: ids,
            });
        }
    }

    // ── Rule B: Niche signal floor ────────────────────────────────────────
    const noCueCount = patternSummary.noCueStillIds.length;
    const subtleCueCount = patternSummary.subtleCueStillIds.length;
    const explicitCueCount = patternSummary.explicitCueStillIds.length;
    const identityLegibleCount = stills.length - noCueCount;

    if (noCueCount >= 4) {
        blockingIssues.push({
            code: 'weak_niche_signal',
            severity: 'blocker',
            message: `${noCueCount}/${stills.length} stills have no legible niche cue — campaign identity is too weak across the set.`,
            affectedStillIds: patternSummary.noCueStillIds,
            details: 'At least 3 stills must show evidence of campaign-specific visual identity before spend.',
        });
    } else if (noCueCount === 3 || (noCueCount === 2 && subtleCueCount >= 2)) {
        warnings.push({
            code: 'weak_niche_signal',
            severity: 'warning',
            message: `${noCueCount} stills have no cue and ${subtleCueCount} have only subtle cues — identity could be stronger.`,
            affectedStillIds: [...patternSummary.noCueStillIds, ...patternSummary.subtleCueStillIds],
        });
    }

    // ── Rule C: Generic fallback overuse ──────────────────────────────────
    const genericFallbackCount = patternSummary.genericFallbackStillIds.length;
    if (genericFallbackCount >= 4) {
        blockingIssues.push({
            code: 'generic_fallback_overuse',
            severity: 'blocker',
            message: `${genericFallbackCount}/${stills.length} stills use generic cruise-lifestyle fallback templates.`,
            affectedStillIds: patternSummary.genericFallbackStillIds,
            details: 'Rewrite affected stills away from: rail-couple-laugh, quiet-window-solo, dining-intimacy, deck-sea-wide.',
        });
    } else if (genericFallbackCount === 3) {
        warnings.push({
            code: 'generic_fallback_overuse',
            severity: 'warning',
            message: `${genericFallbackCount} stills use generic cruise fallback templates — borderline overuse.`,
            affectedStillIds: patternSummary.genericFallbackStillIds,
        });
    }

    // ── Rule D: Distinct role coverage ────────────────────────────────────
    const heroRoleCount = diagnostics.filter(d => d.shotRole === 'hero').length;
    const editorialRoleCount = diagnostics.filter(d => d.shotRole === 'editorial').length;
    const intimateRoleCount = diagnostics.filter(d => d.shotRole === 'intimate').length;

    if (heroRoleCount < 2 || editorialRoleCount < 2 || intimateRoleCount < 1) {
        const missing: string[] = [];
        if (heroRoleCount < 2) missing.push(`hero-capable stills (have ${heroRoleCount}, need 2)`);
        if (editorialRoleCount < 2) missing.push(`editorial/concept stills (have ${editorialRoleCount}, need 2)`);
        if (intimateRoleCount < 1) missing.push(`intimate/tight stills (have ${intimateRoleCount}, need 1)`);
        blockingIssues.push({
            code: 'missing_role_coverage',
            severity: 'blocker',
            message: `Still set missing required roles: ${missing.join('; ')}.`,
            affectedStillIds: stills.map(s => s.stillId),
            details: 'Set must cover: 2+ hero_primary/hero_alt, 2+ concept/editorial, 1+ intimate/tight.',
        });
    }

    if (heroRoleCount >= stills.length - 1 && stills.length >= 3) {
        blockingIssues.push({
            code: 'hero_set_too_homogeneous',
            severity: 'blocker',
            message: `${heroRoleCount}/${stills.length} stills all read as hero-scale — no editorial or intimate range.`,
            affectedStillIds: diagnostics.filter(d => d.shotRole === 'hero').map(d => d.stillId),
            details: 'All stills reading as homepage heroes defeats a varied landing still pack.',
        });
    }

    // ── Rule E: Identity legibility floor ────────────────────────────────
    if (identityLegibleCount < 2 && stills.length >= 4) {
        blockingIssues.push({
            code: 'identity_legibility_too_low',
            severity: 'blocker',
            message: `Only ${identityLegibleCount} still(s) carry any discernible campaign identity — set cannot prove the niche.`,
            affectedStillIds: patternSummary.noCueStillIds,
            details: 'At least 2 stills must express campaign identity without reading copy.',
        });
    }

    // ── Verdict ───────────────────────────────────────────────────────────
    const verdict: ProductionBuildLintVerdict = blockingIssues.length > 0
        ? 'fail'
        : warnings.length > 0
            ? 'warn'
            : 'pass';

    return {
        verdict,
        blockingIssues,
        warnings,
        scoreSummary: {
            totalStills: stills.length,
            noCueCount,
            subtleCueCount,
            explicitCueCount,
            genericFallbackCount,
            heroRoleCount,
            editorialRoleCount,
            intimateRoleCount,
            maxCompositionFamilySize,
        },
        patternSummary,
        stillDiagnostics: diagnostics,
        evaluatedAt: new Date().toISOString(),
    };
}
