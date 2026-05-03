import type { CampaignAestheticBrief, SceneSpec, Storyboard } from '../../../schema';

// ────────────────────────────────────────────────────────────────────────────
// Organic TikTok Seed Format
//
// 4-shot structure optimised for stop-scroll, native-social feel.
// Campaign-specific values are injected into niche slots; everything else
// is format-constant so the output stays consistent across campaigns.
//
// Shot structure:
//   Shot 1 — HOOK       (~8s)  Ship-first identity + immediate emotional read
//   Shot 2 — BUILD      (~10s) Niche atmosphere woven into believable cruise life
//   Shot 3 — PEAK       (~10s) Emotional high point — aspiration, belonging, awe
//   Shot 4 — PAYOFF     (~12s) CTA-ready close; confident, forward-moving
// ────────────────────────────────────────────────────────────────────────────

export interface OrganicSeedShotTemplate {
    shotRole: 'hook' | 'build' | 'peak' | 'payoff';
    defaultDurationSeconds: number;
    motionEnergy: string;
    cameraDirective: string;
}

export const ORGANIC_SEED_SHOTS: readonly OrganicSeedShotTemplate[] = [
    {
        shotRole: 'hook',
        defaultDurationSeconds: 8,
        motionEnergy: 'Punchy, immediate — grab attention in the first two seconds with readable text and one clear frame',
        cameraDirective: 'Static or nearly static frame; ship structure plus one board-game cue or hand-in-frame detail; open ocean or porthole context if available',
    },
    {
        shotRole: 'build',
        defaultDurationSeconds: 10,
        motionEnergy: 'Slower, textured — let the niche atmosphere land naturally with text and subtle object emphasis',
        cameraDirective: 'Over-the-shoulder or tabletop composition; hands, cards, dice, or meeples visible; ship architecture remains in the frame as context',
    },
    {
        shotRole: 'peak',
        defaultDurationSeconds: 10,
        motionEnergy: 'Rising, expansive — emotional peak without becoming spectacle or camera motion',
        cameraDirective: 'Clean still frame with the strongest social cue; blurred guests or a small group around the table, with the ship and sea supporting the mood',
    },
    {
        shotRole: 'payoff',
        defaultDurationSeconds: 12,
        motionEnergy: 'Confident, forward — conversion-ready close with text overlay and a calm, readable finish',
        cameraDirective: 'CTA-safe static composition; ship-first, horizon-led, with clear headroom for text and a single anchored object or hand cue',
    },
];

export const ORGANIC_SEED_TARGET_DURATION_SECONDS = ORGANIC_SEED_SHOTS.reduce((sum, shot) => sum + shot.defaultDurationSeconds, 0);

function normalizeText(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
}

function firstSentence(value: string): string {
    const normalized = normalizeText(value);
    const sentence = normalized.split(/[.!?]/)[0] ?? normalized;
    return sentence.trim();
}

function isTabletopCampaign(brief: CampaignAestheticBrief): boolean {
    const corpus = [
        brief.themeName,
        brief.visual.plausibilityFramework.allowedProps.join(' '),
        brief.visual.plausibilityFramework.nicheEnhancedMoments.join(' '),
        brief.visual.plausibilityFramework.governingPrinciple,
        brief.messaging.heroSlogan,
        brief.messaging.elevatorPitch,
    ].join(' ');

    return /\b(board[- ]?game|tabletop|meeple|meeples|dice|cards?|game box|score sheet|playing pieces?|tile rack|azul|monopoly|sorry)\b/i.test(corpus);
}

function findStoryboardScene(storyboard: Storyboard | undefined, sceneLibrary: readonly SceneSpec[], shotIndex: number): SceneSpec | undefined {
    if (!storyboard) {
        return sceneLibrary[shotIndex];
    }

    const sceneId = storyboard.shotSequence[shotIndex]?.sceneId;
    if (!sceneId) {
        return sceneLibrary[shotIndex];
    }

    return sceneLibrary.find((scene) => scene.sceneId === sceneId) ?? sceneLibrary[shotIndex];
}

function buildSceneSourceLine(scene: SceneSpec | undefined, fallbackRole: OrganicSeedShotTemplate['shotRole']): string {
    if (!scene) {
        return `Storyboard source: choose the strongest existing scene-library frame for the ${fallbackRole} role; do not invent a new setting`;
    }

    return `Storyboard source: ${scene.sceneId} (${scene.referenceCategory}) — ${firstSentence(scene.imagePrompt)}`;
}

export function buildOrganicSeedShotPrompts(brief: CampaignAestheticBrief): string[] {
    const hook = brief.socialConcepts.tiktokOrganic.hook.trim();
    const cta = brief.socialConcepts.tiktokOrganic.callToAction.trim() || 'Link in bio';
    const { aestheticLabel, imageryMood, lightingStyle, colorPalette } = brief.visual;
    const { governingPrinciple, cruiseNativeMoments, nicheEnhancedMoments } = brief.visual.plausibilityFramework;
    const sceneLibrary = brief.productionBible?.sceneLibrary ?? [];
    const tiktokStoryboard = brief.productionBible?.storyboards.find((storyboard) => storyboard.deliverableId === 'tiktok_seed');
    const tabletopCampaign = isTabletopCampaign(brief);

    const roleAwareCue = tabletopCampaign
        ? 'Board-game campaigns should keep a playable object, table energy, or shared turn visible in the scene source, but the ship still leads the frame.'
        : 'Keep the scene source cruise-first and visually readable; avoid inventing a new setting that is not already in the scene library.';

    const hookScene = findStoryboardScene(tiktokStoryboard, sceneLibrary, 0);
    const buildScene = findStoryboardScene(tiktokStoryboard, sceneLibrary, 1);
    const peakScene = findStoryboardScene(tiktokStoryboard, sceneLibrary, 2);
    const payoffScene = findStoryboardScene(tiktokStoryboard, sceneLibrary, 3);

    return [
        // Shot 1 — HOOK
        [
            `${ORGANIC_SEED_SHOTS[0].cameraDirective}`,
            `${ORGANIC_SEED_SHOTS[0].motionEnergy}`,
            buildSceneSourceLine(hookScene, ORGANIC_SEED_SHOTS[0].shotRole),
            `Cruise-first hook: ${hook}`,
            `Aesthetic: ${aestheticLabel}, ${imageryMood}`,
            `Light: ${lightingStyle}`,
            `Color anchor: ${colorPalette.primary}`,
            `Governing principle: ${governingPrinciple}`,
            roleAwareCue,
            `Niche cue (subtle): ${cruiseNativeMoments[0] ?? 'a guest-carried prop secondary to the ship and sea'}`,
            'Avoid signage, workshop energy, staged demonstrations, walking cycles, object hand-offs, or camera movement',
        ].join('. '),

        // Shot 2 — BUILD
        [
            `${ORGANIC_SEED_SHOTS[1].cameraDirective}`,
            `${ORGANIC_SEED_SHOTS[1].motionEnergy}`,
            buildSceneSourceLine(buildScene, ORGANIC_SEED_SHOTS[1].shotRole),
            `Niche-enhanced moment: ${nicheEnhancedMoments[0] ?? 'the campaign niche present as a relaxed guest-carried cue'}`,
            `Warm ${colorPalette.secondary} tones with ${colorPalette.accent} highlights`,
            roleAwareCue,
            'Human presence calm and anchored; text overlays and object detail carry the frame',
            'Avoid empty deck, crowd takeover, event venue energy, or unnecessary camera motion',
        ].join('. '),

        // Shot 3 — PEAK
        [
            `${ORGANIC_SEED_SHOTS[2].cameraDirective}`,
            `${ORGANIC_SEED_SHOTS[2].motionEnergy}`,
            buildSceneSourceLine(peakScene, ORGANIC_SEED_SHOTS[2].shotRole),
            `Emotional register: awe, intimacy, freedom, or belonging — not spectacle`,
            `${lightingStyle} golden-hour or blue-hour energy`,
            `Color peak: ${colorPalette.accent}`,
            roleAwareCue,
            'Keep any visible people incidental — ship, sea, and light carry this shot',
            'Avoid repetitive motion from prior shots, festival energy, formal group choreography, or camera moves',
        ].join('. '),

        // Shot 4 — PAYOFF
        [
            `${ORGANIC_SEED_SHOTS[3].cameraDirective}`,
            `${ORGANIC_SEED_SHOTS[3].motionEnergy}`,
            buildSceneSourceLine(payoffScene, ORGANIC_SEED_SHOTS[3].shotRole),
            `CTA energy tied to: ${cta}`,
            `Keep the close cruise-first, horizon-led, and human`,
            roleAwareCue,
            'Fabric, lights, reflections, and background figures carry texture',
            'Avoid dead stillness, weak exit, staged promo energy, object-to-mouth finishes, or camera motion',
    ].join('. '),
    ];
}
