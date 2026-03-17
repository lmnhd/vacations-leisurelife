import type { CampaignAestheticBrief, VideoBrief, AestheticAppliedOperation } from '../schema';
import type { FixerResult } from './registry';

// ────────────────────────────────────────────────────────────────────────────
// Countdown Series Deterministic Fixer
// Strategy: open_window_triplet — replaces hard-scarcity countdown clips
// with evergreen conversion-window concepts.
// ────────────────────────────────────────────────────────────────────────────

// ── Banned pattern detection ─────────────────────────────────────────────

const BANNED_COUNTDOWN_PATTERNS = [
    /\bT-\d+\b/i,
    /\d+\s*cabin(s)?\s*(left|remain)/i,
    /last\s*\d+\s*cabin/i,
    /only\s*\d+/i,
    /\d{1,2}:\d{2}/,          // HH:MM exact time
    /countdown/i,
    /scarcity/i,
    /spots?\s*(left|remain)/i,
    /\bfinal\s*(hours?|seats?|spots?)\b/i,
    /\bselling\s*out\b/i,
];

function containsBannedPattern(text: string): boolean {
    return BANNED_COUNTDOWN_PATTERNS.some(re => re.test(text));
}

function seriesNeedsFix(series: VideoBrief[]): boolean {
    for (const concept of series) {
        if (
            containsBannedPattern(concept.title) ||
            containsBannedPattern(concept.scriptOrNarration) ||
            containsBannedPattern(concept.visualDirectionNotes) ||
            concept.avatarRequired ||
            concept.tool === 'heygen'
        ) {
            return true;
        }
    }
    return false;
}

// ── Replacement template: open_window_triplet ────────────────────────────

function buildOpenWindowTriplet(brief: CampaignAestheticBrief): VideoBrief[] {
    const { lightingStyle, colorPalette, referenceMoodboard, aestheticLabel } = brief.visual;
    const themeName = brief.themeName;
    const musicMood = brief.audio.musicMood;
    const shipContext = '';

    return [
        {
            title: 'Open Sailing Window',
            durationSeconds: 15,
            tool: 'runwayml' as const,
            scriptOrNarration: `There's still time to join us${shipContext}. Check what cabin options are available for the ${themeName} voyage.`,
            visualDirectionNotes: `${aestheticLabel} establishing shot of the ship at sea. ${lightingStyle}. Wide and inviting. ${colorPalette.primary} tones, minimal text overlay, no countdown or inventory copy.`,
            avatarRequired: false,
            backgroundDescription: `Open ocean with ship silhouette, ${referenceMoodboard[0] ?? 'cinematic'} atmosphere, ${colorPalette.accent} horizon accents`,
            musicMood: `${musicMood}, aspirational, unhurried`,
        },
        {
            title: 'Check Cabin Options',
            durationSeconds: 15,
            tool: 'runwayml' as const,
            scriptOrNarration: `Explore cabin categories for the ${themeName} sailing. Route and pricing available at the link below.`,
            visualDirectionNotes: `${aestheticLabel} interior cabin walkthrough or exterior cabin balcony view. ${lightingStyle}. Warm and relaxed energy. No urgency framing. ${colorPalette.primary} and ${colorPalette.secondary} palette.`,
            avatarRequired: false,
            backgroundDescription: `Ship cabin or deck setting, ${referenceMoodboard[1] ?? 'inviting'} mood, natural light`,
            musicMood: `${musicMood}, exploratory`,
        },
        {
            title: 'Plan Your Route',
            durationSeconds: 15,
            tool: 'runwayml' as const,
            scriptOrNarration: `Plan ahead for the ${themeName} cruise. Ports, activities, and onboard experiences — all worth exploring before you decide.`,
            visualDirectionNotes: `${aestheticLabel} destination montage or port arrival scene. ${lightingStyle}. Editorial pacing, destination-forward. No scarcity framing, no countdown language.`,
            avatarRequired: false,
            backgroundDescription: `Port destination or itinerary montage, ${referenceMoodboard[2] ?? 'adventure'} energy, ${colorPalette.accent} highlights`,
            musicMood: `${musicMood}, curious, forward-moving`,
        },
    ];
}

// ── Fixer entry point ────────────────────────────────────────────────────

export function fixCountdownSeries(brief: CampaignAestheticBrief): FixerResult {
    const existing = brief.videoConcepts.countdownSeries;
    const targetPath = 'videoConcepts.countdownSeries';

    if (!existing || existing.length === 0) {
        const operation: AestheticAppliedOperation = {
            kind: 'replace_countdown_series',
            targetPath,
            status: 'skipped',
            summary: 'No countdownSeries array found on brief — nothing to fix.',
        };
        return {
            brief,
            applied: false,
            touchedPaths: [],
            appliedOperations: [operation],
            followUps: [],
        };
    }

    if (!seriesNeedsFix(existing)) {
        const operation: AestheticAppliedOperation = {
            kind: 'replace_countdown_series',
            targetPath,
            status: 'no_op',
            summary: 'countdownSeries already free of banned patterns — no change applied.',
        };
        return {
            brief,
            applied: false,
            touchedPaths: [],
            appliedOperations: [operation],
            followUps: [],
        };
    }

    const replacement = buildOpenWindowTriplet(brief);

    const updatedBrief: CampaignAestheticBrief = {
        ...brief,
        videoConcepts: {
            ...brief.videoConcepts,
            countdownSeries: replacement,
        },
    };

    const operation: AestheticAppliedOperation = {
        kind: 'replace_countdown_series',
        targetPath,
        status: 'applied',
        summary: `Replaced ${existing.length} countdown concept(s) with open_window_triplet strategy. Removed hard-scarcity framing, T-numbering, and avatar/heygen requirements.`,
    };

    return {
        brief: updatedBrief,
        applied: true,
        touchedPaths: [targetPath],
        appliedOperations: [operation],
        followUps: [
            'Re-run red team to confirm countdown scarcity issue is resolved.',
            'Downstream video specs and generator prompts have been neutralized — no further action needed for countdown labels.',
        ],
    };
}
