import type { CampaignAestheticBrief, SceneSpec, Storyboard } from '../../../schema';
import type { TikTokOverlayCardSpec } from '../tiktok-overlay-cards';

// ────────────────────────────────────────────────────────────────────────────
// Organic TikTok Seed Format
//
// 6-shot structure optimised for stop-scroll, native-social feel.
// Campaign-specific values are injected into niche slots; everything else
// is format-constant so the output stays consistent across campaigns.
//
// Shot structure:
//   Shot 1 — HOOK       (~5s)  Ship-first identity + immediate emotional read
//   Shot 2 — BUILD      (~6s)  Niche atmosphere woven into believable cruise life
//   Shot 3 — PROOF      (~6s)  Visible play object + table life, still cruise-led
//   Shot 4 — SOCIAL     (~6s)  Small group energy, blurred guests, belonging
//   Shot 5 — PEAK       (~6s)  Emotional high point — aspiration, belonging, awe
//   Shot 6 — PAYOFF     (~6s)  CTA-ready close; confident, forward-moving
// ────────────────────────────────────────────────────────────────────────────

export interface OrganicSeedShotTemplate {
    shotRole: 'hook' | 'build' | 'proof' | 'social' | 'peak' | 'payoff';
    defaultDurationSeconds: number;
    motionEnergy: string;
    cameraDirective: string;
}

export const ORGANIC_SEED_SHOTS: readonly OrganicSeedShotTemplate[] = [
    {
        shotRole: 'hook',
        defaultDurationSeconds: 5,
        motionEnergy: 'Punchy, immediate — grab attention in the first two seconds with readable text and one clear frame',
        cameraDirective: 'Static or nearly static frame; ship structure plus one board-game cue or hand-in-frame detail; open ocean or porthole context if available',
    },
    {
        shotRole: 'build',
        defaultDurationSeconds: 6,
        motionEnergy: 'Slower, textured — let the niche atmosphere land naturally with text and subtle object emphasis',
        cameraDirective: 'Over-the-shoulder or tabletop composition; hands, cards, dice, or meeples visible; ship architecture remains in the frame as context',
    },
    {
        shotRole: 'proof',
        defaultDurationSeconds: 6,
        motionEnergy: 'Credible, lived-in — show the table is real, not staged, and the people feel relaxed',
        cameraDirective: 'Medium still frame with a playable object in clear view and a relaxed social arrangement around it; ship and sea remain the backdrop',
    },
    {
        shotRole: 'social',
        defaultDurationSeconds: 6,
        motionEnergy: 'Warm, communal — a small social cluster makes the room feel inhabited',
        cameraDirective: 'Anonymous seated cluster or over-the-shoulder framing; blurred background figures, hands near the table, and soft ship context',
    },
    {
        shotRole: 'peak',
        defaultDurationSeconds: 6,
        motionEnergy: 'Rising, expansive — emotional peak without becoming spectacle or camera motion',
        cameraDirective: 'Clean still frame with the strongest social cue; blurred guests or a small group around the table, with the ship and sea supporting the mood',
    },
    {
        shotRole: 'payoff',
        defaultDurationSeconds: 6,
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

function buildOverlayPlacements(): ReadonlyArray<TikTokOverlayCardSpec['placement']> {
    return [
        { x: 44, y: 92, width: 996, height: 296 },
        { x: 44, y: 114, width: 996, height: 296 },
        { x: 44, y: 146, width: 996, height: 296 },
        { x: 44, y: 138, width: 996, height: 296 },
        { x: 44, y: 126, width: 996, height: 296 },
        { x: 44, y: 156, width: 996, height: 296 },
    ];
}

export function buildOrganicSeedOverlayCards(brief: CampaignAestheticBrief, _storyboard?: Storyboard): TikTokOverlayCardSpec[] {
    const hook = brief.socialConcepts.tiktokOrganic.hook.trim();
    const hero = brief.messaging.heroSlogan.trim();
    const pitch = brief.messaging.elevatorPitch.trim();
    const narrativeTitle = brief.socialConcepts.tiktokOrganic.narrative.title.trim();
    const cta = brief.socialConcepts.tiktokOrganic.callToAction.trim() || 'Link in bio';
    const { colorPalette, plausibilityFramework } = brief.visual;

    const placements = buildOverlayPlacements();

    return ORGANIC_SEED_SHOTS.map((shot, index) => {
        const overlayCopy: Record<OrganicSeedShotTemplate['shotRole'], { headline: string; subline: string }> = {
            hook: {
                headline: hook || 'You can skip the explanation.',
                subline: pitch || 'A real ship, a real table, and a real reason to stay.',
            },
            build: {
                headline: hero || 'Cards, dice, sea air.',
                subline: plausibilityFramework.allowedProps.slice(0, 3).join(' · ') || 'cards · dice · meeples',
            },
            proof: {
                headline: 'Real people, real turns.',
                subline: narrativeTitle || 'The table is not a prop. It is the point.',
            },
            social: {
                headline: 'This is the group chat.',
                subline: "But everybody's on deck.",
            },
            peak: {
                headline: 'The best seat is at the table.',
                subline: 'People, play, and the sea all read in one frame.',
            },
            payoff: {
                headline: cta,
                subline: 'Board games at sea, without the cruise brochure mush.',
            },
        };

        const content = overlayCopy[shot.shotRole];
        return {
            badge: `${String(index + 1).padStart(2, '0')} / ${shot.shotRole.toUpperCase()}`,
            headline: content.headline,
            subline: content.subline,
            spokenText: `${content.headline} ${content.subline}`.replace(/\s+/g, ' ').trim(),
            accentColor: colorPalette.primary,
            placement: placements[index] ?? placements[0],
        };
    }).map((card, index) => ({
        ...card,
        placement: {
            ...card.placement,
            // Stagger each card slightly so the text doesn't feel mechanically identical.
            y: card.placement.y + (index === 0 ? 0 : index === 1 ? 8 : index === 2 ? 16 : index === 3 ? 12 : index === 4 ? 18 : 14),
        },
    }));
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
    const proofScene = findStoryboardScene(tiktokStoryboard, sceneLibrary, 2);
    const socialScene = findStoryboardScene(tiktokStoryboard, sceneLibrary, 3);
    const peakScene = findStoryboardScene(tiktokStoryboard, sceneLibrary, 4);
    const payoffScene = findStoryboardScene(tiktokStoryboard, sceneLibrary, 5);

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

        // Shot 3 — PROOF
        [
            `${ORGANIC_SEED_SHOTS[2].cameraDirective}`,
            `${ORGANIC_SEED_SHOTS[2].motionEnergy}`,
            buildSceneSourceLine(proofScene, ORGANIC_SEED_SHOTS[2].shotRole),
            `Proof cue: ${brief.visual.plausibilityFramework.allowedProps.slice(0, 2).join(' and ') || 'cards and dice'} visible as a real play surface`,
            `The scene should feel lived-in rather than staged`,
            roleAwareCue,
            'Keep the frame readable and make the table the reason the scene exists',
            'Avoid empty deck energy, brochure symmetry, or motion that competes with the ad copy',
        ].join('. '),

        // Shot 4 — SOCIAL
        [
            `${ORGANIC_SEED_SHOTS[3].cameraDirective}`,
            `${ORGANIC_SEED_SHOTS[3].motionEnergy}`,
            buildSceneSourceLine(socialScene, ORGANIC_SEED_SHOTS[3].shotRole),
            'Social cue: blurred companions, a hand passing near the board, and a small cluster around the table',
            `Belonging cue: ${brief.messaging.heroSlogan.trim() || 'the table is where the group becomes real'}`,
            roleAwareCue,
            'Keep faces soft or out of frame; let the group energy live in posture and proximity',
            'Avoid stiff portraits, staged grin shots, or the feel of a posed tourism photo',
        ].join('. '),

        // Shot 5 — PEAK
        [
            `${ORGANIC_SEED_SHOTS[4].cameraDirective}`,
            `${ORGANIC_SEED_SHOTS[4].motionEnergy}`,
            buildSceneSourceLine(peakScene, ORGANIC_SEED_SHOTS[4].shotRole),
            `Emotional register: awe, intimacy, freedom, or belonging — not spectacle`,
            `${lightingStyle} golden-hour or blue-hour energy`,
            `Color peak: ${colorPalette.accent}`,
            roleAwareCue,
            'Keep any visible people incidental — ship, sea, and light carry this shot',
            'Avoid repetitive motion from prior shots, festival energy, formal group choreography, or camera moves',
        ].join('. '),

        // Shot 6 — PAYOFF
        [
            `${ORGANIC_SEED_SHOTS[5].cameraDirective}`,
            `${ORGANIC_SEED_SHOTS[5].motionEnergy}`,
            buildSceneSourceLine(payoffScene, ORGANIC_SEED_SHOTS[5].shotRole),
            `CTA energy tied to: ${cta}`,
            `Keep the close cruise-first, horizon-led, and human`,
            roleAwareCue,
            'Fabric, lights, reflections, and background figures carry texture',
            'Avoid dead stillness, weak exit, staged promo energy, object-to-mouth finishes, or camera motion',
    ].join('. '),
    ];
}
