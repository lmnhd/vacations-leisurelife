export type StyleId = 'sketched' | 'realistic';

export type MediaStyleAssetKind = 'hero' | 'concept' | 'scene' | 'merch' | 'probe' | 'ref_hero' | 'documentary_detail';

export interface MediaStyleResolutionInput {
    hasPeople: boolean;
    assetKind: MediaStyleAssetKind;
    seed: string;
    themeAnchorProps?: readonly string[];
}

export interface ResolvedMediaStyle {
    style: StyleId;
    promptBlock: string;
    allowPhotographicReinforcers: boolean;
}

export const SKETCHED_STYLE = [
    'Style: Hand-illustrated travel editorial in watercolor-and-ink style',
    'Use loose, expressive linework with vivid color washes; human figures are idealized and gestural with warm, readable faces',
    'Render human figures loosely and expressively, but keep ship architecture, deck railings, windows, teak planks, and marine materials structurally accurate and perspective-consistent',
    'The mood should feel like a best-day-of-vacation memory, not literal documentation',
    'Do not literalize the campaign theme as an onboard event; show a normal cruise moment lightly inflected by the theme',
    'Theme cues should be personal, incidental, and small: an accessory, notebook, case, wardrobe detail, quiet habit, or subtle object near the traveler rather than a programmed activity',
    'Use rich saturated color, warm light, and visible textural brushstrokes',
    'Avoid visible stages, risers, performance platforms, PA speakers, drum kits, full bands, formal concerts, organized demonstrations, workshops, and staged activity setups',
    'Do not render as photorealistic photography, plastic skin, anime, flat vector art, or a generic stock-photo scene',
].join('. ');

export const REALISTIC_BASE_STYLE = [
    'Style: Documentary-grade cruise photography',
    'Use sharp detail, accurate ship architecture, natural marine lighting, and believable materials such as teak, steel, glass, pool tile, painted deck surfaces, and ocean haze',
    'Keep editorial restraint with no over-processing; the image should feel like a professional cruise line brochure or travel photographer portfolio shot on a modern mirrorless camera',
    'Use subtle depth of field only where appropriate, and do not apply illustrative treatment',
].join('. ');

export const FILM_GRADES = [
    'Kodachrome 1970s warmth with natural reds, amber sunlight, and gentle highlight rolloff',
    'late-1980s Ektachrome saturation with crisp blue water, clean whites, and slide-film contrast',
    'expired Polaroid color shift with softened shadows, creamy highlights, and tactile analog imperfection',
    'cross-processed slide film with restrained cyan shadows, warm highlights, and real optical character',
] as const;

function stableHash(value: string): number {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function chooseRealisticFilmGrade(seed: string): string {
    return FILM_GRADES[stableHash(seed) % FILM_GRADES.length];
}

function buildThemeAnchorInstruction(themeAnchorProps: readonly string[] | undefined): string {
    const props = (themeAnchorProps ?? [])
        .map((prop) => prop.trim())
        .filter(Boolean)
        .slice(0, 2);

    if (props.length === 0) {
        return 'Theme anchoring: if a niche cue is needed, use one small naturally placed travel object as a faint environmental detail, never as the subject';
    }

    return `Theme anchoring: let ${props.join(' or ')} appear only as a small naturally placed environmental detail, secondary to the ship, sea, and architecture`;
}

function resolveStyleId(input: MediaStyleResolutionInput): StyleId {
    if (input.assetKind === 'concept' || input.assetKind === 'merch') {
        return 'sketched';
    }

    return input.hasPeople ? 'sketched' : 'realistic';
}

export function resolveMediaStyle(input: MediaStyleResolutionInput): ResolvedMediaStyle {
    const style = resolveStyleId(input);

    if (style === 'sketched') {
        return {
            style,
            promptBlock: SKETCHED_STYLE,
            allowPhotographicReinforcers: false,
        };
    }

    const filmGrade = chooseRealisticFilmGrade(input.seed || input.assetKind);
    return {
        style,
        promptBlock: [
            REALISTIC_BASE_STYLE,
            `Analog film character: ${filmGrade}; make this feel like physical film stock or lens behavior, not a digital overlay`,
            buildThemeAnchorInstruction(input.themeAnchorProps),
        ].join('. '),
        allowPhotographicReinforcers: true,
    };
}
