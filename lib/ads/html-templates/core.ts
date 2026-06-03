// lib/ads/html-templates/core.ts
//
// Shared data layer for the HTML ad templates. Used by the test page (client)
// and the server render route — no server-only imports here.

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Palette {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    textOnDark: string;
    textOnLight: string;
}

export interface HtmlTemplateBrief {
    visual?: {
        colorPalette?: Partial<Palette>;
        aestheticLabel?: string;
        typographyDirection?: { suggestedFonts?: string[] };
        referenceMoodboard?: string[];
    };
    messaging?: {
        heroSlogan?: string;
        subSlogan?: string;
        elevatorPitch?: string;
        ctaVariants?: { waitlist?: string; bookNow?: string };
    };
    themeName?: string;
}

export interface HtmlTemplateManifest {
    imageSelections?: Record<string, string>;
    imageSlotControls?: ImageSlotControls;
    copySelections?: Record<string, string>;
    /** MULTI_MODEL_IMAGES: variantGroupId -> canonical generator. */
    modelVersionSelections?: Record<string, string>;
    images?: {
        hero?: HtmlTemplateAsset[];
        flyerImages?: HtmlTemplateAsset[];
        sceneImages?: HtmlTemplateAsset[];
        aestheticConcepts?: HtmlTemplateAsset[];
        documentaryDetails?: HtmlTemplateAsset[];
        shipReferences?: HtmlTemplateAsset[];
        platformCrops?: Record<string, HtmlTemplateAsset[]>;
    };
}

export interface HtmlTemplateAsset {
    assetId?: string;
    assetType?: string;
    url: string;
    active?: boolean;
    reviewStatus?: string;
    eligibilityRole?: string;
    /** MULTI_MODEL_IMAGES: which model produced this asset. */
    generator?: string;
    /** MULTI_MODEL_IMAGES: links per-model renditions of one logical item. */
    variantGroupId?: string;
    tags?: string[];
    curation?: {
        approvalState?: string;
        blockedContexts?: string[];
    };
}

export type AdAssetType = 'hero' | 'scene_image' | 'aesthetic_concept' | 'still' | 'ship_reference';
export type ImagePool = Record<AdAssetType, string[]>;
export type Imgs = Record<string, string>;
export type ImageSlotPosition = 'left' | 'center' | 'right';
export interface ImageSlotControl {
    hidden?: boolean;
    flipX?: boolean;
    position?: ImageSlotPosition;
    /** Object-fit for the Single Image Override only. Defaults to 'cover'. */
    fit?: 'cover' | 'contain';
}
export type ImageSlotControls = Record<string, ImageSlotControl>;

// Formats that can render as a single dominant image (vs. their multi-facet
// default). When `ad:<format>:flyer` is set, only the primary image slot below is
// filled — facet tiles are intentionally dropped so the one image carries it.
export const SINGLE_IMAGE_CAPABLE_FORMATS: Record<string, string> = {
    google_display_landscape: 'image-bg',
    google_display_square:    'hero_image',
    meta_carousel_square:     'hero_image',
};

export interface ResolveSlotOptions {
    /** Persisted operator selections keyed by `ad:<format>:<slotName>`. */
    selections?: Record<string, string>;
    /** Persisted operator transforms keyed by the same image-use point keys. */
    slotControls?: ImageSlotControls;
    /** Full selectable asset lookup, keyed by assetId. */
    assetById?: Map<string, HtmlTemplateAsset>;
}

// ── Campaign-specific fallbacks ───────────────────────────────────────────────

export const HTML_TEMPLATE_FALLBACKS = {
    palette: {
        primary: '#0D2137',
        secondary: '#1A4A6E',
        accent: '#C9902A',
        background: '#061520',
        textOnDark: '#F0EDE8',
        textOnLight: '#0D2137',
    } as Palette,
    headline:      'The Glass\nThat Holds\nThe Sea.',
    subhead:       'A Caribbean sailing for people who stare at the water — not just float above it.',
    elevatorPitch: 'Deep-sea enthusiasts, panoramic glass observatory, Brilliance of the Seas.',
    cta:           'Reserve Your Spot',
    waitlist:      'Join the Waitlist',
    price:         '$989 / person',
    ship:          'Brilliance of the Seas',
    aesthetic:     'Glass Observatory · Caribbean',
    themeName:     'Glass Observatory',
};

// ── Data resolver ─────────────────────────────────────────────────────────────

export interface ResolvedTemplateData {
    p: Palette;
    headline: string;
    subhead: string;
    elevatorPitch: string;
    cta: string;
    waitlist: string;
    aestheticLabel: string;
    fonts: string[];
    themeName: string;
}

export type CopyHeadlineSource = 'auto' | 'heroSlogan' | 'subSlogan' | 'themeName' | 'elevatorPitch';

export interface ResolveTemplateDataOptions {
    formatKey?: string;
    copySelections?: Record<string, string>;
}

const DEFAULT_HEADLINE_SOURCE_BY_FORMAT: Record<string, Exclude<CopyHeadlineSource, 'auto'>> = {
    story_reel: 'themeName',
    meta_story_reel: 'subSlogan',
};

function resolveHeadlineSource(
    formatKey: string | undefined,
    copySelections: Record<string, string> | undefined,
): Exclude<CopyHeadlineSource, 'auto'> {
    const selected = copySelections?.[`copy:${formatKey ?? ''}:headlineSource`];
    if (selected === 'heroSlogan' || selected === 'subSlogan' || selected === 'themeName' || selected === 'elevatorPitch') {
        return selected;
    }
    return (formatKey && DEFAULT_HEADLINE_SOURCE_BY_FORMAT[formatKey]) || 'heroSlogan';
}

function resolveHeadlineText(
    brief: HtmlTemplateBrief | null,
    formatKey?: string,
    copySelections?: Record<string, string>,
): string {
    const fb = HTML_TEMPLATE_FALLBACKS;
    const source = resolveHeadlineSource(formatKey, copySelections);
    switch (source) {
        case 'subSlogan':
            return brief?.messaging?.subSlogan ?? fb.subhead;
        case 'themeName':
            return brief?.themeName ?? fb.themeName;
        case 'elevatorPitch':
            return brief?.messaging?.elevatorPitch ?? fb.elevatorPitch;
        case 'heroSlogan':
        default:
            return brief?.messaging?.heroSlogan ?? fb.headline;
    }
}

export function resolveTemplateData(
    brief: HtmlTemplateBrief | null,
    options: ResolveTemplateDataOptions = {},
): ResolvedTemplateData {
    const fb = HTML_TEMPLATE_FALLBACKS;
    const p: Palette = { ...fb.palette, ...brief?.visual?.colorPalette };
    return {
        p,
        headline:      resolveHeadlineText(brief, options.formatKey, options.copySelections),
        subhead:       brief?.messaging?.subSlogan     ?? fb.subhead,
        elevatorPitch: brief?.messaging?.elevatorPitch ?? fb.elevatorPitch,
        cta:           brief?.messaging?.ctaVariants?.bookNow  ?? fb.cta,
        waitlist:      brief?.messaging?.ctaVariants?.waitlist ?? fb.waitlist,
        aestheticLabel: brief?.visual?.aestheticLabel  ?? fb.aesthetic,
        fonts:         brief?.visual?.typographyDirection?.suggestedFonts ?? ['Inter'],
        themeName:     brief?.themeName ?? fb.themeName,
    };
}

// ── Image slot definitions (mirrors templates.json preferredAssetTypes) ───────

export const SLOT_TYPES: Record<string, Record<string, AdAssetType[]>> = {
    google_display_landscape: {
        'image-bg':         ['scene_image', 'hero'],
        // Right-column facets — distinct supporting scenes beside the headline.
        'tile_image_1':     ['aesthetic_concept', 'still', 'scene_image'],
        'tile_image_2':     ['ship_reference', 'scene_image', 'still'],
    },
    story_reel: {
        'background-image': ['aesthetic_concept', 'hero', 'still'],
        'hero_image':       ['hero', 'scene_image', 'still'],
        'tile_image_1':     ['scene_image', 'still'],
        'tile_image_2':     ['scene_image', 'hero', 'still'],
        'tile_image_3':     ['still', 'aesthetic_concept', 'scene_image'],
        'tile_image_4':     ['ship_reference', 'scene_image', 'hero'],
    },
    google_display_square: {
        'hero_image':       ['hero', 'scene_image'],
        // Editorial image column gains two facets beneath the dominant hero.
        'tile_image_1':     ['scene_image', 'still', 'aesthetic_concept'],
        'tile_image_2':     ['still', 'aesthetic_concept', 'ship_reference'],
    },
    meta_carousel_square: {
        'hero_image':       ['scene_image', 'hero', 'aesthetic_concept'],
        // Supporting facet strip — hero stays dominant, these hint at the range.
        'tile_image_1':     ['still', 'scene_image'],
        'tile_image_2':     ['aesthetic_concept', 'scene_image', 'still'],
        'tile_image_3':     ['ship_reference', 'scene_image', 'hero'],
    },
    meta_story_reel: {
        'hero_image':       ['scene_image', 'hero'],
        'tile_image_1':     ['still', 'scene_image'],
        'tile_image_2':     ['hero', 'scene_image', 'still'],
        'tile_image_3':     ['aesthetic_concept', 'ship_reference', 'scene_image'],
    },
    meta_feed_square: {
        'hero_image':       ['hero', 'scene_image'],
        'tile_image_1':     ['still', 'aesthetic_concept'],
        'tile_image_2':     ['still', 'aesthetic_concept'],
        'tile_image_3':     ['scene_image', 'aesthetic_concept'],
        'tile_image_4':     ['scene_image', 'aesthetic_concept'],
        'tile_image_5':     ['scene_image', 'hero'],
        'tile_image_6':     ['still', 'aesthetic_concept'],
    },
    meta_feed_portrait: {
        'hero_image':       ['hero', 'scene_image'],
        'tile_image_1':     ['scene_image', 'still'],
        'tile_image_2':     ['scene_image', 'still'],
        'tile_image_3':     ['still', 'scene_image'],
        'tile_image_4':     ['still', 'scene_image'],
        'tile_image_5':     ['still', 'scene_image'],
        'tile_image_6':     ['scene_image', 'hero'],
    },
};

// ── Image pool helpers ────────────────────────────────────────────────────────

export function buildImagePool(manifest: HtmlTemplateManifest): ImagePool {
    const active = (assets: HtmlTemplateAsset[] = []) =>
        assets.filter((a) => a.active !== false).map((a) => a.url);
    return {
        // Flyer images live in their own manifest section now, so the grounded
        // hero pool here is just the heroes — no tag filtering needed. Flyers are
        // surfaced separately via getFlyerImages() for the single-image path.
        hero:              active(manifest.images?.hero),
        scene_image:       active(manifest.images?.sceneImages),
        aesthetic_concept: active(manifest.images?.aestheticConcepts),
        still:             active(manifest.images?.documentaryDetails),
        ship_reference:    active(manifest.images?.shipReferences),
    };
}

/**
 * MULTI_MODEL_IMAGES: collapse variant groups to one canonical asset per group.
 * Assets without a variantGroupId pass through untouched. Within a group the
 * canonical is the model in modelVersionSelections[groupId], else the
 * first-stored member (the primary backend, by generation order). Original order
 * is preserved (first appearance of each group wins its slot).
 */
export function collapseVariantGroups(
    assets: HtmlTemplateAsset[],
    selections?: Record<string, string>,
): HtmlTemplateAsset[] {
    const groups = new Map<string, HtmlTemplateAsset[]>();
    for (const asset of assets) {
        if (!asset.variantGroupId) continue;
        const list = groups.get(asset.variantGroupId) ?? [];
        list.push(asset);
        groups.set(asset.variantGroupId, list);
    }
    if (groups.size === 0) return assets;

    const emitted = new Set<string>();
    const out: HtmlTemplateAsset[] = [];
    for (const asset of assets) {
        if (!asset.variantGroupId) { out.push(asset); continue; }
        if (emitted.has(asset.variantGroupId)) continue;
        emitted.add(asset.variantGroupId);
        const members = groups.get(asset.variantGroupId)!;
        const wantGenerator = selections?.[asset.variantGroupId];
        const canonical = (wantGenerator && members.find((m) => m.generator === wantGenerator)) || members[0];
        out.push(canonical);
    }
    return out;
}

/** Active flyer images (manifest.images.flyerImages), collapsed to one canonical
 *  model-version per variant group. */
export function getFlyerImages(manifest: HtmlTemplateManifest): string[] {
    const active = (manifest.images?.flyerImages ?? []).filter((a) => a.active !== false);
    return collapseVariantGroups(active, manifest.modelVersionSelections).map((a) => a.url);
}

const IMAGE_SELECTION_BLOCKED_ROLES = new Set([
    'alternate_art',
    'final.ad_artifact',
    'final.channel_deliverable',
    'review_only',
]);

function isSelectableImageAsset(asset: HtmlTemplateAsset): boolean {
    if (!asset.assetId) return false;
    if (!asset.url) return false;
    if (asset.active === false) return false;
    if (asset.eligibilityRole && IMAGE_SELECTION_BLOCKED_ROLES.has(asset.eligibilityRole)) return false;
    if (asset.reviewStatus === 'rejected') return false;
    const approvalState = asset.curation?.approvalState;
    if (approvalState === 'rejected' || approvalState === 'revision_required' || approvalState === 'hold') {
        return false;
    }
    return true;
}

export function collectSelectableImageAssets(manifest: HtmlTemplateManifest | null | undefined): HtmlTemplateAsset[] {
    if (!manifest?.images) return [];
    const imageSections: HtmlTemplateAsset[][] = [
        manifest.images.hero ?? [],
        manifest.images.flyerImages ?? [],
        manifest.images.sceneImages ?? [],
        manifest.images.aestheticConcepts ?? [],
        manifest.images.documentaryDetails ?? [],
        manifest.images.shipReferences ?? [],
        ...Object.values(manifest.images.platformCrops ?? {}),
    ];

    const seen = new Set<string>();
    const assets: HtmlTemplateAsset[] = [];
    for (const asset of imageSections.flat()) {
        if (!isSelectableImageAsset(asset)) continue;
        if (seen.has(asset.assetId!)) continue;
        seen.add(asset.assetId!);
        assets.push(asset);
    }
    return assets;
}

export function buildImageAssetIndex(manifest: HtmlTemplateManifest | null | undefined): Map<string, HtmlTemplateAsset> {
    // Index ALL selectable variants (uncollapsed) so an already-selected
    // non-canonical model-version still resolves at render time.
    return new Map(collectSelectableImageAssets(manifest).map((asset) => [asset.assetId!, asset]));
}

/**
 * MULTI_MODEL_IMAGES: picker-facing pool — one canonical asset per variant group
 * (vs. collectSelectableImageAssets which returns every variant for the index).
 * Use this where the UI OFFERS image choices so duplicate model-versions of the
 * same logical item don't appear as separate options.
 */
export function collectSelectableImageGroups(manifest: HtmlTemplateManifest | null | undefined): HtmlTemplateAsset[] {
    return collapseVariantGroups(collectSelectableImageAssets(manifest), manifest?.modelVersionSelections);
}

export function imageUsePointKey(formatKey: string, slot: string): string {
    return `ad:${formatKey}:${slot}`;
}

/**
 * SINGLE IMAGE OVERRIDE — flyer-as-whole-ad.
 *
 * The override is a normal image selection at the reserved `:override` slot. When
 * set (and not hidden), the renderer skips the template component entirely and
 * paints just this one image full-bleed at the format's native dimensions — every
 * headline, CTA, and facet tile is muted because the template never mounts. This
 * is the counterpart to (not the same as) SINGLE_IMAGE_CAPABLE_FORMATS, which
 * fills one slot but keeps the template chrome.
 */
export function adOverrideKey(formatKey: string): string {
    return `ad:${formatKey}:override`;
}

export interface AdOverrideResolution {
    url: string;
    fit: 'cover' | 'contain';
    position: ImageSlotPosition;
    flipX: boolean;
}

/** Resolve the active Single Image Override for a format, or null to render the
 *  normal template. Hidden control = override parked (selection kept, template wins). */
export function resolveAdOverride(
    formatKey: string,
    opts: ResolveSlotOptions = {},
): AdOverrideResolution | null {
    const assetId = opts.selections?.[adOverrideKey(formatKey)];
    if (!assetId) return null;
    const asset = opts.assetById?.get(assetId);
    if (!asset || !asset.url || !isSelectableImageAsset(asset)) return null;
    const control = opts.slotControls?.[adOverrideKey(formatKey)] ?? {};
    if (control.hidden) return null;
    return {
        url: asset.url,
        fit: control.fit === 'contain' ? 'contain' : 'cover',
        position: control.position ?? 'center',
        flipX: control.flipX === true,
    };
}

/** Flyer images as selectable assets, collapsed to one canonical model-version per
 *  variant group. Source pool for the flyers-only Single Image Override picker. */
export function collectFlyerImageGroups(
    manifest: HtmlTemplateManifest | null | undefined,
): HtmlTemplateAsset[] {
    const active = (manifest?.images?.flyerImages ?? []).filter(isSelectableImageAsset);
    return collapseVariantGroups(active, manifest?.modelVersionSelections);
}

export function getImageSlotControl(
    controls: ImageSlotControls | undefined,
    formatKey: string,
    slot: string,
): ImageSlotControl {
    const direct = controls?.[imageUsePointKey(formatKey, slot)];
    if (direct) return direct;
    if (SINGLE_IMAGE_CAPABLE_FORMATS[formatKey] === slot) {
        return controls?.[imageUsePointKey(formatKey, 'flyer')] ?? {};
    }
    return {};
}

function slotIsHidden(controls: ImageSlotControls | undefined, formatKey: string, slot: string): boolean {
    return getImageSlotControl(controls, formatKey, slot).hidden === true;
}

export function resolveSlotImages(
    formatKey: string,
    pool: ImagePool,
    opts: ResolveSlotOptions = {},
): Imgs {
    const primarySlot = SINGLE_IMAGE_CAPABLE_FORMATS[formatKey];
    const singleImageAssetId = opts.selections?.[`ad:${formatKey}:flyer`];
    const singleImageAsset = singleImageAssetId ? opts.assetById?.get(singleImageAssetId) : undefined;
    if (
        primarySlot
        && singleImageAsset
        && isSelectableImageAsset(singleImageAsset)
        && !slotIsHidden(opts.slotControls, formatKey, primarySlot)
        && !slotIsHidden(opts.slotControls, formatKey, 'flyer')
    ) {
        return { [primarySlot]: singleImageAsset.url };
    }

    // Single-image mode: for a single-image-capable format, fill only the primary
    // slot with one flyer image and drop every facet tile. The components already
    // gate facets on slot presence, so omitting them reverts the layout to a
    // clean single image automatically.
    const slotDefs = SLOT_TYPES[formatKey] ?? {};
    const used = new Set<string>();
    const out: Imgs = {};

    for (const [slot, preferred] of Object.entries(slotDefs)) {
        if (slotIsHidden(opts.slotControls, formatKey, slot)) {
            continue;
        }

        const selectedAssetId = opts.selections?.[`ad:${formatKey}:${slot}`];
        const selectedAsset = selectedAssetId ? opts.assetById?.get(selectedAssetId) : undefined;
        if (selectedAsset && isSelectableImageAsset(selectedAsset)) {
            out[slot] = selectedAsset.url;
            used.add(selectedAsset.url);
            continue;
        }

        let picked: string | null = null;

        for (const type of preferred) {
            const fresh = pool[type].filter((u) => !used.has(u));
            if (fresh.length) { picked = fresh[0]; break; }
        }
        if (!picked) {
            for (const type of preferred) {
                if (pool[type].length) { picked = pool[type][0]; break; }
            }
        }

        if (picked) {
            out[slot] = picked;
            used.add(picked);
        }
    }

    return out;
}

// ── Template dimensions ───────────────────────────────────────────────────────

export const TEMPLATE_DIMENSIONS: Record<string, { width: number; height: number }> = {
    google_display_landscape: { width: 1200, height: 628  },
    story_reel:               { width: 1080, height: 1920 },
    google_display_square:    { width: 1080, height: 1080 },
    meta_carousel_square:     { width: 1080, height: 1080 },
    meta_story_reel:          { width: 1080, height: 1920 },
    meta_feed_square:         { width: 1080, height: 1080 },
    meta_feed_portrait:       { width: 1080, height: 1350 },
};

// ── CSS helpers ───────────────────────────────────────────────────────────────

export function imgOrGrad(
    url: string | undefined,
    gradient: string,
    control: ImageSlotControl = {},
): React.CSSProperties {
    if (url) {
        // Layer the gradient *under* the image. If the image fails to load
        // or paints in late (slow S3, screenshot timing), the gradient is
        // still visible underneath instead of leaving a transparent gap.
        return {
            backgroundImage: `url(${url}), ${gradient}`,
            backgroundSize: 'cover, auto',
            backgroundPosition: `${control.position ?? 'center'}, center`,
            backgroundRepeat: 'no-repeat, no-repeat',
        };
    }
    return { background: gradient };
}

// ── Gradient helpers ──────────────────────────────────────────────────────────

export const coldSea = (p: Palette) =>
    `linear-gradient(160deg, ${p.background} 0%, ${p.primary} 55%, ${p.secondary}99 100%)`;

export const obsGlow = (p: Palette) =>
    `radial-gradient(ellipse at 38% 68%, ${p.accent}44 0%, transparent 55%), ${coldSea(p)}`;

export const warmCore = (p: Palette) =>
    `radial-gradient(ellipse at 50% 80%, ${p.accent}66 0%, ${p.primary} 55%, ${p.background} 100%)`;

export const glassGrid =
    'repeating-linear-gradient(0deg, transparent, transparent 59px, rgba(255,255,255,0.03) 60px), ' +
    'repeating-linear-gradient(90deg, transparent, transparent 59px, rgba(255,255,255,0.03) 60px)';
