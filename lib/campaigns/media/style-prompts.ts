import type { VisualFlavor } from '../schema';

export type StyleId = 'sketched' | 'realistic';

export type MediaStyleAssetKind = 'hero' | 'concept' | 'scene' | 'merch' | 'probe' | 'ref_hero' | 'documentary_detail';

export interface MediaStyleResolutionInput {
    hasPeople: boolean;
    assetKind: MediaStyleAssetKind;
    seed: string;
    themeAnchorProps?: readonly string[];
    /**
     * When provided, overrides the hasPeople heuristic for hero/scene/ref_hero assets.
     * indie_zine → sketched (handmade polaroid aesthetic).
     * All other flavors → realistic (trust-image photo pool).
     * Concepts and merch are always sketched regardless of flavor.
     */
    visualFlavor?: VisualFlavor;
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
    'Keep editorial restraint with no over-processing; the image should feel like a professional cruise line brochure or travel photographer portfolio',
    'Use subtle depth of field only where appropriate, and do not apply illustrative treatment',
].join('. ');

// Film grades removed from prompts — visual effects live in image-filter-registry.ts

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
    // Concepts and merch are always artistic/sketched regardless of campaign flavor.
    if (input.assetKind === 'concept' || input.assetKind === 'merch') {
        return 'sketched';
    }

    // Trust-facing assets always stay realistic. Heroes and ref_heroes are source
    // images for ads and landing pages — they must never be watercolor/illustration.
    // Scenes, probes, and documentary details also stay realistic.
    if (
        input.assetKind === 'hero' ||
        input.assetKind === 'ref_hero' ||
        input.assetKind === 'scene' ||
        input.assetKind === 'probe' ||
        input.assetKind === 'documentary_detail'
    ) {
        // indie_zine is the only flavor that intentionally uses handmade/sketch aesthetic.
        if (input.visualFlavor === 'indie_zine') return 'sketched';
        return 'realistic';
    }

    // For any remaining kinds (should not occur in practice), default realistic.
    return 'realistic';
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

    return {
        style,
        promptBlock: [
            REALISTIC_BASE_STYLE,
            buildThemeAnchorInstruction(input.themeAnchorProps),
        ].join('. '),
        allowPhotographicReinforcers: true,
    };
}
