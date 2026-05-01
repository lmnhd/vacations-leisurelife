import type { Campaign } from '../types';
import type { CampaignAestheticBrief, CampaignEnergyMode, VisualFlavor } from '../schema';
import type { CampaignEnergyProfile, NicheTokens, VisualSystem } from './types';

const STOPWORDS = new Set([
    'the', 'and', 'for', 'with', 'from', 'into', 'your', 'this', 'that', 'cruise', 'voyage',
    'travel', 'trip', 'sea', 'aboard', 'group', 'life', 'escape', 'experience',
]);

const MERCH_LABELS = new Set([
    'shirt',
    't-shirt',
    'tee',
    'tee shirt',
    'hoodie',
    'mug',
    'tote',
    'poster',
    'pin',
    'enamel pin',
    'merch',
    'merchandise',
]);

const BAD_LABEL_PATTERNS = [
    /\bworkshop\b/i,
    /\bseminar\b/i,
    /\bconference\b/i,
    /\bdemo\b/i,
    /\bclass\b/i,
    /\blecture\b/i,
];

function cleanWords(value: string): string[] {
    return value
        .replace(/[^a-zA-Z0-9\s'-]/g, ' ')
        .split(/\s+/)
        .map((word) => word.trim())
        .filter((word) => word.length > 2 && !STOPWORDS.has(word.toLowerCase()));
}

function uniqueByLowercase(values: string[]): string[] {
    const seen = new Set<string>();
    const output: string[] = [];
    for (const value of values) {
        const cleaned = value.trim().replace(/\s+/g, ' ');
        const key = cleaned.toLowerCase();
        if (!cleaned || seen.has(key)) continue;
        seen.add(key);
        output.push(cleaned);
    }
    return output;
}

function pickItalicWord(headline: string, themeName: string): string {
    const priority = ['beat', 'waves', 'rock', 'vinyl', 'sound', 'rhythm', 'groove', 'sleeve', 'side'];
    const candidates = uniqueByLowercase([...cleanWords(headline), ...cleanWords(themeName)]);
    const prioritized = candidates
        .map((word) => ({ word, priorityIndex: priority.indexOf(word.toLowerCase()) }))
        .filter((candidate) => candidate.priorityIndex >= 0)
        .sort((left, right) => left.priorityIndex - right.priorityIndex);
    if (prioritized[0]) return prioritized[0].word;

    candidates.sort((left, right) => right.length - left.length);
    return candidates[0] ?? 'Voyage';
}

function safeHex(value: string | undefined, fallback: string): string {
    if (value && /^#[0-9a-f]{6}$/i.test(value.trim())) {
        return value.trim();
    }
    return fallback;
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
        brief.messaging.toneKeywords.join(' '),
        brief.merch.tagline,
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
    ].filter(Boolean).join(' ');
}

function visualFlavorToSystem(flavor: VisualFlavor | undefined): VisualSystem {
    if (flavor === 'editorial_magazine') return 'system_1_editorial';
    if (flavor === 'travel_nostalgia') return 'system_2_nostalgia';
    if (flavor === 'indie_zine') return 'system_3_zine';
    return 'system_4_modular';
}

function issueLabelForSystem(system: VisualSystem): string {
    if (system === 'system_1_editorial') return 'Issue 01';
    if (system === 'system_2_nostalgia') return 'Voyage 01';
    if (system === 'system_3_zine') return 'Vol. 1';
    return 'Campaign';
}

function profileFromMode(mode: CampaignEnergyMode): CampaignEnergyProfile {
    if (mode === 'after_hours_electric' || mode === 'nostalgic_kinetic') return 'energetic';
    if (mode === 'refined_premium') return 'premium';
    if (mode === 'subcultural_intimate') return 'subculture';
    if (mode === 'warm_social' || mode === 'playful_collective') return 'warm';
    return 'calm';
}

function isMusicCampaign(corpus: string): boolean {
    return /\b(rock|roll|beat|band|music|vinyl|record|dj|dance|song|sound|rhythm|guitar|listening|open mic|jam)\b/i.test(corpus);
}

function isHighEnergyMusicCampaign(corpus: string): boolean {
    return /\b(rock|roll|beat|band|dance|dancing|live music|tribute|party|open mic|jam|concert|gala)\b/i.test(corpus);
}

function inferEnergyProfile(brief: CampaignAestheticBrief, campaign?: Campaign | null): CampaignEnergyProfile {
    if (brief.identityBlueprint) return profileFromMode(brief.identityBlueprint.energyMode);
    const corpus = textCorpus(brief, campaign);
    if (isHighEnergyMusicCampaign(corpus)) return 'energetic';
    if (/\b(zine|punk|underground|fan|subculture|liner notes|indie)\b/i.test(corpus)) return 'subculture';
    if (/\b(luxury|premium|refined|quiet|gallery|editorial|boutique)\b/i.test(corpus)) return 'premium';
    if (isMusicCampaign(corpus) || /\b(warm|nostalgia|analog|cozy|golden)\b/i.test(corpus)) return 'warm';
    return 'calm';
}

function visualTempoFor(profile: CampaignEnergyProfile, brief: CampaignAestheticBrief): string {
    if (brief.identityBlueprint?.imageBehavior?.length) {
        return brief.identityBlueprint.imageBehavior.join(', ');
    }
    if (profile === 'energetic') return 'upbeat, after-hours, amber-lit, sea-air social energy without staged performance';
    if (profile === 'subculture') return 'specific, handmade, lived-in, collector culture, intimate but not messy';
    if (profile === 'premium') return 'restrained, editorial, crisp, gallery-like, quietly confident';
    if (profile === 'warm') return 'warm, tactile, nostalgic, socially inviting, unforced';
    return 'calm, open, cruise-native, believable, lightly atmospheric';
}

function splitCandidateLabels(value: string): string[] {
    return value
        .split(/[.:;|]/)
        .map((item) => item.trim())
        .filter((item) => item.length > 3);
}

function musicLabelFromPhrase(value: string): string | null {
    if (/\b(vinyl|record|sleeve|listening)\b/i.test(value)) return 'Vinyl Lounge';
    if (/\b(after|open mic|jam|late|night|club)\b/i.test(value)) return 'After Hours';
    if (/\b(dance|party|gala)\b/i.test(value)) return 'Dance Deck';
    if (/\b(stargazing|open deck)\b/i.test(value)) return 'Late Deck';
    if (/\b(trivia|memorabilia|history|showcase|exhibit|decor)\b/i.test(value)) return 'Backbeat Notes';
    if (/\b(live|band|performance|music|cocktail|sunset|sail)\b/i.test(value)) return 'Sailaway Set';
    return null;
}

function isUsableLabel(value: string): boolean {
    const lower = value.toLowerCase();
    if (MERCH_LABELS.has(lower)) return false;
    if (BAD_LABEL_PATTERNS.some((pattern) => pattern.test(value))) return false;
    return value.length <= 48;
}

function buildSectionLabels(brief: CampaignAestheticBrief, campaign: Campaign | null | undefined, profile: CampaignEnergyProfile): string[] {
    const raw = [
        ...(brief.identityBlueprint?.evidenceOfBelonging ?? []),
        brief.socialConcepts.instagramFeed.caption,
        brief.socialConcepts.facebookAd.headline,
        brief.merch.tagline,
        brief.visual.aestheticLabel,
        ...(brief.visual.plausibilityFramework.nicheEnhancedMoments ?? []),
        ...(campaign?.allowedThemeSignals ?? []),
        ...(campaign?.optionalGatheringMoments ?? []),
        ...(campaign?.cruiseNativeMoments ?? []),
        ...(campaign?.highlightEvents ?? []),
    ];

    const music = isMusicCampaign(textCorpus(brief, campaign));
    const labels = raw
        .flatMap((item) => splitCandidateLabels(item))
        .map((item) => music ? (musicLabelFromPhrase(item) ?? item) : item)
        .map((item) => item.trim())
        .filter(isUsableLabel);

    const fallback = profile === 'energetic' && music
        ? ['Sailaway Set', 'Vinyl Lounge', 'After Hours', 'Dance Deck', 'Backbeat Notes']
        : ['Field Notes', 'At Sea', 'Port Call', 'After Hours', 'Deck Notes'];

    return uniqueByLowercase([...labels, ...fallback]).slice(0, 5);
}

function buildNicheVocabulary(brief: CampaignAestheticBrief, campaign?: Campaign | null): string[] {
    return uniqueByLowercase([
        ...cleanWords(brief.themeName),
        ...cleanWords(brief.messaging.heroSlogan),
        ...cleanWords(brief.messaging.subSlogan),
        ...brief.messaging.toneKeywords.flatMap(cleanWords),
        ...cleanWords(brief.merch.tagline),
        ...(brief.identityBlueprint?.evidenceOfBelonging ?? []).flatMap(cleanWords),
        ...(campaign?.targetingKeywords ?? []).flatMap(cleanWords),
        ...(campaign?.allowedThemeSignals ?? []).flatMap(cleanWords),
    ]).slice(0, 12);
}

function normalizePropSignal(signal: string): string | null {
    if (/\b(live|band|performance|performances|concert|stage)\b/i.test(signal)) {
        return 'amber lounge light from nearby music';
    }
    if (/\btrivia\b/i.test(signal)) return 'blank folded game card';
    if (/\bdecor\b/i.test(signal)) return 'retro color accent';
    if (/\bworkshop|seminar|conference|lecture|class\b/i.test(signal)) return null;
    return signal;
}

function buildPropSignals(brief: CampaignAestheticBrief, campaign: Campaign | null | undefined, profile: CampaignEnergyProfile): string[] {
    const corpus = textCorpus(brief, campaign);
    const source = [
        ...(brief.identityBlueprint?.propFamilies ?? []),
        ...(brief.visual.plausibilityFramework.allowedProps ?? []),
        ...(campaign?.allowedThemeSignals ?? []),
    ].map(normalizePropSignal).filter((signal): signal is string => Boolean(signal));
    const musicProps = isMusicCampaign(corpus)
        ? [
            'record sleeve',
            'guitar pick',
            'retro sunglasses',
            'leather jacket over a chair',
            'cocktail glass near a rail',
            'coiled audio cable as incidental detail',
        ]
        : [];
    const energeticProps = profile === 'energetic' ? ['amber lounge light', 'dance-floor light reflection'] : [];
    return uniqueByLowercase([...musicProps, ...energeticProps, ...source])
        .filter((signal) => !/\b(performances?|workshop|stage|performer|band on deck)\b/i.test(signal))
        .slice(0, 7);
}

function buildMomentSignals(brief: CampaignAestheticBrief, campaign: Campaign | null | undefined, profile: CampaignEnergyProfile): string[] {
    const source = [
        ...(brief.identityBlueprint?.evidenceOfBelonging ?? []),
        ...(brief.visual.plausibilityFramework.cruiseNativeMoments ?? []),
        ...(brief.visual.plausibilityFramework.nicheEnhancedMoments ?? []),
        ...(campaign?.cruiseNativeMoments ?? []),
        ...(campaign?.optionalGatheringMoments ?? []),
    ];
    const corpus = textCorpus(brief, campaign);
    const musicMoments = isMusicCampaign(corpus)
        ? ['music heard from nearby deck', 'after-hours lounge energy', 'vinyl listening table by the sea']
        : [];
    const energeticMoments = profile === 'energetic' ? ['sunset sailaway with rhythm nearby', 'post-set traces without performers'] : [];
    return uniqueByLowercase([...source, ...musicMoments, ...energeticMoments])
        .filter((signal) => !/\b(workshop|formal|conference|lecture)\b/i.test(signal))
        .slice(0, 6);
}

function buildAntiMood(profile: CampaignEnergyProfile): string[] {
    if (profile === 'energetic') {
        return ['spa retreat', 'breakfast balcony', 'towel-and-mug table', 'empty relaxation scene', 'generic serenity', 'sleepy resort calm'];
    }
    if (profile === 'subculture') return ['generic travel stock', 'polished corporate event', 'random prop display'];
    if (profile === 'premium') return ['loud themed party', 'busy staged scene', 'tourist clutter'];
    if (profile === 'warm') return ['cold showroom', 'literal costume staging', 'empty generic deck'];
    return ['event setup', 'posed group', 'generic niche props'];
}

function buildAntiMoodForBrief(brief: CampaignAestheticBrief, profile: CampaignEnergyProfile): string[] {
    if (brief.identityBlueprint?.forbiddenDefaults?.length) {
        return brief.identityBlueprint.forbiddenDefaults;
    }
    return buildAntiMood(profile);
}

function fallbackEnergyMode(profile: CampaignEnergyProfile): CampaignEnergyMode {
    if (profile === 'energetic') return 'nostalgic_kinetic';
    if (profile === 'premium') return 'refined_premium';
    if (profile === 'subculture') return 'subcultural_intimate';
    if (profile === 'warm') return 'warm_social';
    return 'calm_contemplative';
}

export function extractNicheTokens(
    brief: CampaignAestheticBrief,
    campaign?: Campaign | null,
): NicheTokens {
    const headline = brief.messaging.heroSlogan || brief.themeName;
    const energyProfile = inferEnergyProfile(brief, campaign);
    const energyMode = brief.identityBlueprint?.energyMode ?? fallbackEnergyMode(energyProfile);
    const vesselName = campaign?.shipTarget ?? 'Selected vessel';
    const route = campaign?.targetDestination ?? 'At sea';
    const departure = campaign?.targetDates ?? 'Departure TBA';
    const quoteSource = brief.socialConcepts.facebookAd.primaryText || brief.messaging.subSlogan || brief.messaging.elevatorPitch;
    const quote = quoteSource.length > 140 ? `${quoteSource.slice(0, 137).trimEnd()}...` : quoteSource;
    const propSignals = buildPropSignals(brief, campaign, energyProfile);

    return {
        headline,
        italicWord: pickItalicWord(headline, brief.themeName),
        subhead: brief.messaging.subSlogan || brief.messaging.elevatorPitch,
        vesselName,
        route,
        departure,
        issueLabel: issueLabelForSystem(visualFlavorToSystem(brief.identityBlueprint?.visualFlavor)),
        sectionLabels: buildSectionLabels(brief, campaign, energyProfile),
        quote,
        quoteCite: brief.messaging.voicePersona || 'Campaign voice',
        cta: brief.messaging.ctaVariants.bookNow || brief.messaging.ctaVariants.waitlist || 'Reserve a cabin',
        accentHex: safeHex(brief.visual.colorPalette.accent, '#ff5a3d'),
        system: visualFlavorToSystem(brief.identityBlueprint?.visualFlavor),
        nicheVocabulary: buildNicheVocabulary(brief, campaign),
        energyProfile,
        energyMode,
        visualTempo: visualTempoFor(energyProfile, brief),
        propSignals,
        momentSignals: buildMomentSignals(brief, campaign, energyProfile),
        antiMood: buildAntiMoodForBrief(brief, energyProfile),
        alignmentSummary: brief.identityBlueprint?.summary ?? brief.messaging.elevatorPitch,
    };
}
