import type {
    CampaignAestheticBrief,
    CampaignEnergyMode,
    CampaignIdentityBlueprint,
    CampaignSocialScale,
    VisualFlavor,
} from '../schema';
import type { Campaign } from '../types';
import { callLLM, modelForTask } from '@/lib/ai/llm-gateway';

function unique(values: string[]): string[] {
    return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function textCorpus(brief: CampaignAestheticBrief, campaign?: Campaign | null): string {
    return [
        brief.themeName,
        brief.visual.aestheticLabel,
        brief.visual.imageryMood,
        brief.visual.lightingStyle,
        brief.visual.compositionNotes,
        brief.messaging.heroSlogan,
        brief.messaging.subSlogan,
        brief.messaging.elevatorPitch,
        brief.messaging.voicePersona,
        brief.messaging.toneKeywords.join(' '),
        brief.communityExpression.corePromise,
        brief.communityExpression.participationStyle,
        brief.communityExpression.socialGravity,
        brief.communityExpression.optionalGatherings.join(' '),
        brief.communityExpression.belongingSignals.join(' '),
        brief.merch.tagline,
        brief.audio.musicMood,
        campaign?.name,
        campaign?.description,
        campaign?.aesthetic,
        campaign?.highlightEvents?.join(' '),
        campaign?.targetingKeywords?.join(' '),
        campaign?.vacationFitRationale,
        campaign?.cruiseNativeMoments?.join(' '),
        campaign?.nicheExpressionMode,
        campaign?.allowedThemeSignals?.join(' '),
        campaign?.optionalGatheringMoments?.join(' '),
    ].filter(Boolean).join(' ').toLowerCase();
}

function hasAny(text: string, patterns: RegExp[]): boolean {
    return patterns.some((pattern) => pattern.test(text));
}

const ENERGY_MODES: CampaignEnergyMode[] = [
    'after_hours_electric',
    'nostalgic_kinetic',
    'subcultural_intimate',
    'refined_premium',
    'playful_collective',
    'warm_social',
    'calm_contemplative',
];

const ENERGY_SIGNAL_PATTERNS: Record<CampaignEnergyMode, RegExp[]> = {
    after_hours_electric: [
        /\bdj\b/i,
        /\bafter[- ]hours\b/i,
        /\blate[- ]night\b/i,
        /\bnightclub\b/i,
        /\bmusic club\b/i,
        /\bafter[- ]hours club\b/i,
        /\b(?:bass|beat)\s+drop\b/i,
        /\bdance floor\b/i,
        /\bopen mic\b/i,
        /\bjam session\b/i,
        /\bcrowd(?:ed)?\s+(?:deck|set|floor)\b/i,
    ],
    nostalgic_kinetic: [
        /\bvintage\b/i,
        /\bretro\b/i,
        /\bnostalgi(?:a|c)\b/i,
        /\brecords?\b/i,
        /\bvinyl\b/i,
        /\bplaylist\b/i,
        /\bgroove\b/i,
        /\brhythm\b/i,
        /\bbeat\b/i,
        /\bband\b/i,
        /\btribute\b/i,
        /\brock\s*(?:and|&)\s*roll\b/i,
        /\brock[- ]n[- ]roll\b/i,
    ],
    subcultural_intimate: [
        /\bzine\b/i,
        /\bpunk\b/i,
        /\bindie\b/i,
        /\bunderground\b/i,
        /\bfan[- ]made\b/i,
        /\bliner notes\b/i,
        /\bsubculture\b/i,
        /\b(?:subculture|underground)\s+scene\b/i,
    ],
    refined_premium: [
        /\bluxury\b/i,
        /\bpremium\b/i,
        /\brefined\b/i,
        /\beditorial\b/i,
        /\bgallery\b/i,
        /\bquiet luxury\b/i,
        /\bboutique\b/i,
        /\bconsidered editorial\b/i,
        /\bconsidered design\b/i,
    ],
    playful_collective: [
        /\bplayful\b/i,
        /\bcamp\b/i,
        /\bgame(?:s|play)?\b/i,
        /\btrivia\b/i,
        /\bboard[- ]game\b/i,
        /\bdice\b/i,
        /\bcolorful\b/i,
        /\bjoyful\b/i,
        /\bcollective\b/i,
    ],
    warm_social: [
        /\bwarm\b/i,
        /\bwelcoming\b/i,
        /\bfriendly\b/i,
        /\bsocial\b/i,
        /\banalog\b/i,
        /\bcozy\b/i,
        /\bpostcard\b/i,
        /\bgathering\b/i,
    ],
    calm_contemplative: [],
};

function scoreEnergyModes(corpus: string): Map<CampaignEnergyMode, number> {
    const scores = new Map<CampaignEnergyMode, number>();
    for (const mode of ENERGY_MODES) {
        const patterns = ENERGY_SIGNAL_PATTERNS[mode];
        const score = patterns.reduce((sum, pattern) => sum + (pattern.test(corpus) ? 1 : 0), 0);
        scores.set(mode, score);
    }
    return scores;
}

function inferEnergyModeHeuristic(brief: CampaignAestheticBrief, campaign?: Campaign | null): CampaignEnergyMode {
    const corpus = textCorpus(brief, campaign);
    const scores = scoreEnergyModes(corpus);
    if (hasAny(corpus, [
        /\bdj\b/i,
        /\bafter[- ]hours\b/i,
        /\blate[- ]night\b/i,
        /\bdance floor\b/i,
        /\bdance part(?:y|ies)\b/i,
        /\b(?:bass|beat)\s+drop\b/i,
        /\bjam sessions?\b/i,
        /\blive music\b/i,
        /\bnightclub\b/i,
        /\bmusic club\b/i,
    ])) {
        return 'after_hours_electric';
    }

    const rankedModes = ENERGY_MODES
        .map((mode) => ({ mode, score: scores.get(mode) ?? 0 }))
        .sort((a, b) => b.score - a.score);

    const top = rankedModes[0];
    if (top && top.score > 0) {
        return top.mode;
    }

    if (hasAny(corpus, [/\b(warm|welcoming|friendly|social|analog|cozy|postcard|gathering)\b/i])) {
        return 'warm_social';
    }

    return 'calm_contemplative';
}

function isValidEnergyMode(value: string): value is CampaignEnergyMode {
    return ENERGY_MODES.includes(value as CampaignEnergyMode);
}

function shouldUseAiEnergyClassifier(): boolean {
    if (process.env.NODE_ENV === 'test') return false;
    if (process.env.CAMPAIGN_IDENTITY_AI_MODE === 'off') return false;
    if (!process.env.OPENAI_API_KEY) return false;
    return process.env.CAMPAIGN_IDENTITY_AI_MODE !== 'deterministic_only';
}

function tryExtractJsonObject(rawText: string): Record<string, unknown> {
    const trimmed = rawText.trim();
    if (!trimmed) throw new Error('Empty model response');

    let cleaned = trimmed;
    if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
    else if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
    if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
    cleaned = cleaned.trim();

    try {
        return JSON.parse(cleaned) as Record<string, unknown>;
    } catch {
        const firstBrace = cleaned.indexOf('{');
        const lastBrace = cleaned.lastIndexOf('}');
        if (firstBrace >= 0 && lastBrace > firstBrace) {
            return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1)) as Record<string, unknown>;
        }
        throw new Error(`Model did not return parseable JSON: ${trimmed.slice(0, 200)}`);
    }
}

async function inferEnergyModeWithModel(
    brief: CampaignAestheticBrief,
    campaign?: Campaign | null,
): Promise<CampaignEnergyMode> {
    const heuristicMode = inferEnergyModeHeuristic(brief, campaign);
    if (!shouldUseAiEnergyClassifier()) return heuristicMode;

    const corpus = textCorpus(brief, campaign);
    const promptPayload = {
        task: 'classify_campaign_energy_mode',
        candidates: ENERGY_MODES,
        heuristicMode,
        campaign: {
            name: campaign?.name ?? brief.themeName,
            description: campaign?.description ?? '',
            targetingKeywords: campaign?.targetingKeywords ?? [],
            allowedThemeSignals: campaign?.allowedThemeSignals ?? [],
            optionalGatheringMoments: campaign?.optionalGatheringMoments ?? [],
            merchTagline: brief.merch.tagline,
        },
        textSamples: {
            heroSlogan: brief.messaging.heroSlogan,
            subSlogan: brief.messaging.subSlogan,
            elevatorPitch: brief.messaging.elevatorPitch,
            imageryMood: brief.visual.imageryMood,
            compositionNotes: brief.visual.compositionNotes,
            community: brief.communityExpression,
        },
        corpusSnippet: corpus.slice(0, 2500),
        outputSchema: {
            energyMode: ENERGY_MODES,
            confidence: 'number 0..1',
            rationale: 'short string',
        },
    };

    try {
        const { content } = await callLLM(modelForTask('extraction'), JSON.stringify(promptPayload), {
            systemPrompt: 'Classify campaign energy mode from text context. Respond only as strict JSON.',
            jsonMode: true,
            temperature: 0,
            maxTokens: 400,
        });
        const parsed = tryExtractJsonObject(content);
        const energyMode = typeof parsed.energyMode === 'string' ? parsed.energyMode : '';
        const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0;
        if (isValidEnergyMode(energyMode) && confidence >= 0.55) {
            return energyMode;
        }
    } catch (error) {
        console.warn('[identity-blueprint] AI energy classifier fallback to heuristic:', error);
    }

    return heuristicMode;
}

function inferSocialScale(mode: CampaignEnergyMode, corpus: string): CampaignSocialScale {
    if (mode === 'after_hours_electric') return 'crowd_ok';
    if (mode === 'refined_premium' || mode === 'subcultural_intimate' || mode === 'calm_contemplative') return 'solo_pair';
    if (/\b(crowd|festival|party|packed|dance floor)\b/i.test(corpus)) return 'crowd_ok';
    if (/\b(pair|two friends|couple|small group|table for four)\b/i.test(corpus)) return 'pair_small_group';
    return 'mixed';
}

function themeSpecificProps(mode: CampaignEnergyMode, corpus: string): string[] {
    if (mode === 'after_hours_electric' || mode === 'nostalgic_kinetic') {
        return [
            'record sleeve',
            'guitar pick',
            'retro sunglasses',
            'leather jacket over a chair',
            'ticket-stub paper',
            'dance-floor light reflection',
        ];
    }

    if (mode === 'subcultural_intimate') {
        return ['folded zine', 'annotated paper edge', 'worn tote', 'photobooth strip', 'taped note'];
    }

    if (mode === 'refined_premium') {
        return ['gallery-like print piece', 'considered stationery', 'precise textile detail', 'single polished object'];
    }

    if (mode === 'playful_collective') {
        return ['bright paper token', 'souvenir pin', 'color accent object', 'playful badge'];
    }

    if (/\b(reading|book|literary)\b/i.test(corpus)) {
        return ['dog-eared paperback', 'bookmark ribbon', 'closed book on a lounger', 'folded note'];
    }

    return ['small paper artifact', 'textile accent', 'personal object with cruise context'];
}

function forbiddenDefaultsFor(mode: CampaignEnergyMode): string[] {
    if (mode === 'after_hours_electric') {
        return ['spa retreat', 'breakfast balcony serenity', 'towel-and-mug table', 'empty relaxation scene', 'generic premium calm'];
    }
    if (mode === 'nostalgic_kinetic') {
        return ['sleepy luxury balcony', 'generic sunset contemplation', 'tasteful but inert lounge image', 'props without pulse'];
    }
    if (mode === 'refined_premium') {
        return ['festival chaos', 'crowd-surge energy', 'noisy collage clutter', 'touristy novelty props'];
    }
    if (mode === 'subcultural_intimate') {
        return ['generic brand polish', 'corporate event energy', 'mainstream travel stock'];
    }
    if (mode === 'playful_collective') {
        return ['sterile editorial distance', 'quiet prestige mood', 'lonely solo default'];
    }
    if (mode === 'warm_social') {
        return ['cold showroom mood', 'formal event staging', 'isolated luxury silence'];
    }
    return ['staged theme spectacle', 'generic cruise brochure calm', 'prop-heavy demo scene'];
}

function imageBehaviorFor(mode: CampaignEnergyMode): string[] {
    if (mode === 'after_hours_electric') {
        return ['charged but believable', 'music nearby through residue not performance', 'contrast and rhythm over serenity'];
    }
    if (mode === 'nostalgic_kinetic') {
        return ['warm but alive', 'analog culture with movement', 'specific taste shaping the space'];
    }
    if (mode === 'refined_premium') {
        return ['restrained composition', 'negative space', 'gallery-object treatment'];
    }
    if (mode === 'subcultural_intimate') {
        return ['specific and handmade', 'lived-in margins', 'collector detail without cosplay'];
    }
    if (mode === 'playful_collective') {
        return ['bright social warmth', 'friendly shared ritual', 'energy through people and timing'];
    }
    if (mode === 'warm_social') {
        return ['human-scaled warmth', 'open sociability', 'cruise-first recognition cues'];
    }
    return ['quiet ship life', 'horizon-led calm', 'small meaningful details'];
}

function lightBehaviorFor(mode: CampaignEnergyMode): string[] {
    if (mode === 'after_hours_electric') {
        return ['after-hours amber light', 'chrome glints', 'high-contrast evening spill', 'deck light reflection'];
    }
    if (mode === 'nostalgic_kinetic') {
        return ['late-afternoon deck light', 'sunset warmth with sharper contrast', 'analog amber and ocean blue'];
    }
    if (mode === 'refined_premium') {
        return ['soft museum-like daylight', 'window-side precision', 'clean restrained contrast'];
    }
    if (mode === 'subcultural_intimate') {
        return ['dim tactile interior light', 'paper-shadow contrast', 'mixed practical light'];
    }
    if (mode === 'playful_collective') {
        return ['bright daytime deck light', 'colorful reflections', 'open-air social brightness'];
    }
    if (mode === 'warm_social') {
        return ['warm natural ship light', 'golden-to-neutral cruise daylight', 'friendly window light'];
    }
    return ['overcast sea light', 'morning deck light', 'quiet horizon light'];
}

function adFormatBiasFor(mode: CampaignEnergyMode): string[] {
    if (mode === 'after_hours_electric') {
        return ['type_hook_card', 'quote_card', 'itinerary_toc_card', 'poster-like editorial_cover_ad'];
    }
    if (mode === 'nostalgic_kinetic') {
        return ['type_hook_card', 'image_detail_ad', 'quote_card', 'editorial_cover_ad'];
    }
    if (mode === 'refined_premium') {
        return ['editorial_cover_ad', 'image_detail_ad', 'quote_card'];
    }
    if (mode === 'subcultural_intimate') {
        return ['quote_card', 'itinerary_toc_card', 'type_hook_card'];
    }
    if (mode === 'playful_collective') {
        return ['type_hook_card', 'itinerary_toc_card', 'quote_card'];
    }
    if (mode === 'warm_social') {
        return ['image_detail_ad', 'quote_card', 'itinerary_toc_card'];
    }
    return ['editorial_cover_ad', 'image_detail_ad', 'quote_card'];
}

function evidenceOfBelongingFor(mode: CampaignEnergyMode, brief: CampaignAestheticBrief, campaign?: Campaign | null): string[] {
    const source = unique([
        ...brief.communityExpression.belongingSignals,
        ...(campaign?.optionalGatheringMoments ?? []),
        ...(campaign?.allowedThemeSignals ?? []),
    ]);

    if (mode === 'after_hours_electric') {
        return unique([
            'people moving toward the same sound without instruction',
            'recognizable fan-coded clothing or object cues',
            'shared anticipation before a set or afterglow after it',
            ...source,
        ]).slice(0, 6);
    }

    if (mode === 'nostalgic_kinetic') {
        return unique([
            'taste recognition through small analog cues',
            'conversation opening through sleeves, songs, or shared references',
            'social residue of music culture rather than staged performance',
            ...source,
        ]).slice(0, 6);
    }

    if (mode === 'refined_premium') {
        return unique([
            'quiet recognition between people with the same taste',
            'specificity carried by copy and object choice',
            ...source,
        ]).slice(0, 6);
    }

    return unique(source).slice(0, 6);
}

function emotionalPromiseFor(mode: CampaignEnergyMode): string {
    if (mode === 'after_hours_electric') return 'The ship feels charged by your kind of people and the night never has to be explained.';
    if (mode === 'nostalgic_kinetic') return 'This is a real cruise carrying the pulse of a shared music culture, not a brochure with a prop.';
    if (mode === 'refined_premium') return 'This feels designed for people with quiet confidence and specific taste, not generic luxury.';
    if (mode === 'subcultural_intimate') return 'You are stepping into a small but vivid world that already knows how it talks, dresses, and notices.';
    if (mode === 'playful_collective') return 'The campaign feels bright, social, and participatory without becoming forced or cheesy.';
    if (mode === 'warm_social') return 'People like you seem easy to find here, and the cruise still comes first.';
    return 'The campaign feels quietly right for a particular kind of traveler without having to overstate itself.';
}

/**
 * Maps CampaignEnergyMode to the appropriate Claude Design visual flavor.
 * System 4 (modern brand) is always the structural foundation. This selects
 * the expressive overlay layer that gets added on top.
 *
 * editorial_magazine  → premium / intellectual (System 1)
 * travel_nostalgia    → warm / sentimental (System 2)
 * indie_zine          → subcultural / fandom (System 3)
 * none                → System 4 only (calm, neutral, or high-volume)
 */
function selectVisualFlavor(mode: CampaignEnergyMode): VisualFlavor {
    if (mode === 'refined_premium' || mode === 'nostalgic_kinetic') return 'editorial_magazine';
    if (mode === 'warm_social' || mode === 'playful_collective') return 'travel_nostalgia';
    if (mode === 'after_hours_electric' || mode === 'subcultural_intimate') return 'indie_zine';
    return 'none';
}

export function buildCampaignIdentityBlueprint(
    brief: CampaignAestheticBrief,
    campaign?: Campaign | null,
): CampaignIdentityBlueprint {
    const corpus = textCorpus(brief, campaign);
    const energyMode = inferEnergyModeHeuristic(brief, campaign);
    const socialScale = inferSocialScale(energyMode, corpus);
    const propFamilies = unique([
        ...themeSpecificProps(energyMode, corpus),
        ...brief.visual.plausibilityFramework.allowedProps,
    ]).slice(0, 8);
    const evidenceOfBelonging = evidenceOfBelongingFor(energyMode, brief, campaign);
    const imageBehavior = imageBehaviorFor(energyMode);
    const lightBehavior = lightBehaviorFor(energyMode);
    const forbiddenDefaults = forbiddenDefaultsFor(energyMode);
    const adFormatBias = adFormatBiasFor(energyMode);
    const emotionalPromise = emotionalPromiseFor(energyMode);
    const visualFlavor = selectVisualFlavor(energyMode);

    return {
        energyMode,
        emotionalPromise,
        socialScale,
        imageBehavior,
        propFamilies,
        forbiddenDefaults,
        lightBehavior,
        adFormatBias,
        evidenceOfBelonging,
        visualFlavor,
        summary: `${energyMode.replace(/_/g, ' ')} campaign; favor ${imageBehavior[0]} with ${socialScale.replace(/_/g, ' ')} social scale and avoid ${forbiddenDefaults[0]}.`,
    };
}

export async function buildCampaignIdentityBlueprintAsync(
    brief: CampaignAestheticBrief,
    campaign?: Campaign | null,
): Promise<CampaignIdentityBlueprint> {
    const corpus = textCorpus(brief, campaign);
    const energyMode = await inferEnergyModeWithModel(brief, campaign);
    const socialScale = inferSocialScale(energyMode, corpus);
    const propFamilies = unique([
        ...themeSpecificProps(energyMode, corpus),
        ...brief.visual.plausibilityFramework.allowedProps,
    ]).slice(0, 8);
    const evidenceOfBelonging = evidenceOfBelongingFor(energyMode, brief, campaign);
    const imageBehavior = imageBehaviorFor(energyMode);
    const lightBehavior = lightBehaviorFor(energyMode);
    const forbiddenDefaults = forbiddenDefaultsFor(energyMode);
    const adFormatBias = adFormatBiasFor(energyMode);
    const emotionalPromise = emotionalPromiseFor(energyMode);
    const visualFlavor = selectVisualFlavor(energyMode);

    return {
        energyMode,
        emotionalPromise,
        socialScale,
        imageBehavior,
        propFamilies,
        forbiddenDefaults,
        lightBehavior,
        adFormatBias,
        evidenceOfBelonging,
        visualFlavor,
        summary: `${energyMode.replace(/_/g, ' ')} campaign; favor ${imageBehavior[0]} with ${socialScale.replace(/_/g, ' ')} social scale and avoid ${forbiddenDefaults[0]}.`,
    };
}
