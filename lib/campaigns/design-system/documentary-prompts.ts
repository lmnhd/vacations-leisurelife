import type { CampaignAestheticBrief } from '../schema';
import type { Campaign } from '../types';
import type { DocumentaryDetailKind, DocumentaryDetailSpec, NicheTokens } from './types';

const PROMPT_RULES = [
    'No text, no readable labels, no logos, no signage, no typography, no ad layout',
    'Maximum one niche cue and maximum three objects',
    'No staged events, no full-band/performance/workshop/demo scenes, no conference setup',
    'Use cruise-native materials: teak, brass, glass, steel, cabin textiles, railings, portholes, sea light',
    'Leave strong negative space so the image can sit inside a designed ad module',
].join('. ');

const KIND_PROMPTS: Record<DocumentaryDetailKind, string> = {
    trust_photo: 'Documentary cruise travel image module. A believable cruise ship deck, lounge, cabin detail, or port-facing ship space, with accurate railings, teak, glass, steel, sea horizon, and marine materials. One subtle niche cue may appear as a small personal object, never as an event. No stage, no performers, no posed group, no workshop.',
    artifact_still_life: 'Close documentary still life. A small cluster of believable travel artifacts on a cruise cabin desk or lounge table: cabin key, folded itinerary paper, one niche-related personal object, warm porthole or window light, tactile paper and wood. Casual, specific, lived-in, not product photography, not staged.',
    texture_plate: 'Cruise-native texture plate. Close view of sunlit teak deck, brass railing detail, sea-blue reflection, paper shadow, cabin textile, or varnished wood. Designed as a quiet background layer for typography. Low subject complexity, strong negative space.',
    human_glimpse: 'Documentary travel detail, no full faces, no full-body posing. Cropped hands near a rail, a sleeve brushing a notebook, a shoulder silhouette by a ship window, or a quiet anonymous traveler detail. Human presence is felt but not performed. No staged activity, no props as the main subject.',
    motion_plate: 'Cinematic cruise source frame. Ocean horizon through lounge glass, warm light moving across wood, one subtle niche object, premium atmosphere, environment-led composition. No people in foreground, no action, no event setup.',
};

const DEFAULT_KINDS: DocumentaryDetailKind[] = [
    'trust_photo',
    'artifact_still_life',
    'texture_plate',
    'human_glimpse',
    'motion_plate',
];

function buildThemeCue(tokens: NicheTokens, brief: CampaignAestheticBrief): string {
    const allowedProps = (brief.visual.plausibilityFramework.allowedProps ?? [])
        .map((prop) => prop.trim())
        .filter(Boolean)
        .slice(0, 3);
    const propSignals = tokens.propSignals.slice(0, 5);
    const momentSignals = tokens.momentSignals.slice(0, 3);
    const vocabulary = tokens.nicheVocabulary.slice(0, 4);
    return [
        propSignals.length > 0 ? `Possible single visual cue: ${propSignals.join(' or ')}` : '',
        allowedProps.length > 0 ? `Approved personal cue from brief: ${allowedProps.join(' or ')}` : '',
        momentSignals.length > 0 ? `World signal: ${momentSignals.join(' / ')}` : '',
        vocabulary.length > 0 ? `Niche vocabulary mood: ${vocabulary.join(', ')}` : '',
    ].filter(Boolean).join('. ');
}

function looksLikeBoardGameCampaign(tokens: NicheTokens, brief: CampaignAestheticBrief, campaign: Campaign | null): boolean {
    const corpus = [
        brief.themeName,
        brief.visual.aestheticLabel,
        brief.messaging.heroSlogan,
        brief.messaging.subSlogan,
        brief.messaging.elevatorPitch,
        campaign?.name ?? '',
        campaign?.description ?? '',
        campaign?.targetingKeywords?.join(' ') ?? '',
        campaign?.allowedThemeSignals?.join(' ') ?? '',
        campaign?.optionalGatheringMoments?.join(' ') ?? '',
        tokens.nicheVocabulary.join(' '),
        tokens.propSignals.join(' '),
        tokens.momentSignals.join(' '),
    ].join(' ').toLowerCase();

    return /\b(board[- ]?game|tabletop|meeple|meeples|dice|cards?|card sleeves?|tile rack|score sheet|game box|playing pieces?|azul|monopoly|sorry|ticket to ride)\b/i.test(corpus)
        || (tokens.energyMode === 'playful_collective' && tokens.propSignals.some((signal) => /\b(dice|cards?|game box|meeple|tile|score)\b/i.test(signal)));
}

function buildBoardGameDirective(tokens: NicheTokens, brief: CampaignAestheticBrief, campaign: Campaign | null): string {
    if (!looksLikeBoardGameCampaign(tokens, brief, campaign)) {
        return '';
    }

    const visibleProps = tokens.propSignals
        .filter((signal) => /\b(dice|cards?|meeple|meeples|game box|tile|tile rack|score|board|pawns?|pieces?)\b/i.test(signal))
        .slice(0, 4);

    return [
        `Board-game visibility: one real playable object must be legible in-frame, such as ${visibleProps.length > 0 ? visibleProps.join(', ') : 'dice, cards, meeples, a board edge, or a score sheet'}`,
        'Board-game social texture: prefer hands near the table, over-the-shoulder framing, a small cluster around play, or a quiet seated moment with the game still obvious',
        'Do not let the ship become the whole story; the scene should still read as board-game life aboard the ship',
    ].join('. ');
}

function buildEnergyDirective(tokens: NicheTokens): string {
    if (tokens.energyMode === 'after_hours_electric') {
        return [
            `Energy alignment: ${tokens.visualTempo}`,
            'The image should feel like music culture is nearby through evidence and atmosphere, not a staged show',
            'Prefer after-hours amber light, chrome glints, higher contrast, and social residue after an event',
            'Keep the scene charged, nocturnal, and believable rather than serene or luxurious',
            tokens.antiMood.length > 0 ? `Avoid mood mismatch: ${tokens.antiMood.join(', ')}` : '',
        ].filter(Boolean).join('. ');
    }

    if (tokens.energyMode === 'nostalgic_kinetic') {
        return [
            `Energy alignment: ${tokens.visualTempo}`,
            'Make the image feel analog, social, and in motion without staging a performance',
            'Prefer tactile music residue, sharper emotional pulse, and cruise-native spaces carrying subcultural taste',
            tokens.antiMood.length > 0 ? `Avoid mood mismatch: ${tokens.antiMood.join(', ')}` : '',
        ].filter(Boolean).join('. ');
    }

    if (tokens.energyMode === 'subcultural_intimate') {
        return [
            `Energy alignment: ${tokens.visualTempo}`,
            'Make the niche feel specific through personal artifacts, margins, paper, texture, and collector detail',
            tokens.antiMood.length > 0 ? `Avoid mood mismatch: ${tokens.antiMood.join(', ')}` : '',
        ].filter(Boolean).join('. ');
    }

    if (tokens.energyMode === 'refined_premium') {
        return [
            `Energy alignment: ${tokens.visualTempo}`,
            'Use restraint, strong negative space, and one precise object or material cue',
            tokens.antiMood.length > 0 ? `Avoid mood mismatch: ${tokens.antiMood.join(', ')}` : '',
        ].filter(Boolean).join('. ');
    }

    if (tokens.energyMode === 'playful_collective') {
        return [
            `Energy alignment: ${tokens.visualTempo}`,
            'Favor bright social warmth, visible companionship, and lively but believable cruise rhythm',
            tokens.antiMood.length > 0 ? `Avoid mood mismatch: ${tokens.antiMood.join(', ')}` : '',
        ].filter(Boolean).join('. ');
    }

    return [
        `Energy alignment: ${tokens.visualTempo}`,
        tokens.antiMood.length > 0 ? `Avoid mood mismatch: ${tokens.antiMood.join(', ')}` : '',
    ].filter(Boolean).join('. ');
}

export function buildDocumentaryDetailPrompt(
    kind: DocumentaryDetailKind,
    brief: CampaignAestheticBrief,
    campaign: Campaign | null,
    tokens: NicheTokens,
): string {
    return [
        KIND_PROMPTS[kind],
        `Campaign world: ${brief.themeName}`,
        `Route/vessel context: ${tokens.route}; ${campaign?.shipTarget ?? tokens.vesselName}`,
        buildEnergyDirective(tokens),
        buildBoardGameDirective(tokens, brief, campaign),
        buildThemeCue(tokens, brief),
        PROMPT_RULES,
    ].filter(Boolean).join('. ');
}

export function buildDocumentaryDetailSpecs(
    brief: CampaignAestheticBrief,
    campaign: Campaign | null,
    tokens: NicheTokens,
    budget: number,
): DocumentaryDetailSpec[] {
    return DEFAULT_KINDS.slice(0, budget).map((kind, index) => ({
        kind,
        assetId: `doc_detail_${kind}_${String(index + 1).padStart(2, '0')}`,
        fileName: `images/documentary-details/${kind}_${String(index + 1).padStart(2, '0')}.png`,
        prompt: buildDocumentaryDetailPrompt(kind, brief, campaign, tokens),
    }));
}
