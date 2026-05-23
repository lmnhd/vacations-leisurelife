// lib/ads/types.ts
//
// Reusable ad render/copy core types. Workflow-agnostic — campaigns and CB
// Deals both translate their native records into NormalizedAdInput via
// thin adapters that live OUTSIDE lib/ads (see lib/campaigns/media/ad-pack-adapter.ts
// and lib/cb/deal-to-ad-input.ts).

import type { VisualFlavor } from '@/lib/campaigns/schema';

// ─── Format catalog ──────────────────────────────────────────────────────────

export type AdFormat =
    | 'ig_square'
    | 'fb_google_display'
    | 'story_reel'
    | 'carousel';

export const AD_FORMATS: readonly AdFormat[] = ['ig_square', 'fb_google_display', 'story_reel', 'carousel'] as const;

export type AdWorkflow = 'group_campaign' | 'cb_deal';

// ─── Template anatomy ────────────────────────────────────────────────────────

export type SlotZone =
    | 'header'
    | 'hero'
    | 'tile_grid'
    | 'body'
    | 'footer'
    | 'overlay';

export type SlotKind = 'text' | 'image' | 'color';

export interface SlotDescriptor {
    name: string;
    type: SlotKind;
    visualOrder: number;
    zone: SlotZone;
    maxChars?: number;
    maxWords?: number;
    maxLines?: number;
    copyRole?: string;
    copyInstruction?: string;
    disallow?: string[];
    preferredAssetTypes?: AdAssetType[];
}

export interface TemplateLayout {
    description: string;
    slotDescriptors: SlotDescriptor[];
}

export interface TemplateRef {
    templatedId: string;
    templatedIdPrevious: string | null;
    dimensions: { width: number; height: number };
    layout: TemplateLayout;
    pages?: number; // carousel
}

// ─── Asset inventory ─────────────────────────────────────────────────────────

export type AdAssetType =
    | 'scene_image'
    | 'ship_reference'
    | 'hero'
    | 'aesthetic_concept'
    | 'still'
    | 'merch';

export interface AvailableImageInventory {
    scene_image: number;
    ship_reference: number;
    hero: number;
    aesthetic_concept: number;
    still: number;
    merch: number;
}

// ─── Copy Forge: input ──────────────────────────────────────────────────────

export interface CopyForgeBriefSlice {
    heroSlogan: string;
    subSlogan: string;
    elevatorPitch: string;
    avoidDirectives: string[];
    propFamilies: string[];
    nicheSignals: string[];
    emotionalPromise: string;
    energyMode: string;
    toneKeywords: string[];
    cruiseNativeMoments: string[];
}

export interface CopyForgeCampaignSlice {
    name: string;
    vessel: string;
    route: string;
    departure: string;
    theme: string;
}

export interface CopyForgeDossierSlice {
    audienceRoutineInsights: string[];
    specificExamples: string[];
    allowedSignals: string[];
    discouragedSignals: string[];
}

export interface NormalizedAdInput {
    workflow: AdWorkflow;
    slug: string;
    visualFlavor: VisualFlavor;
    formats: AdFormat[];
    brief: CopyForgeBriefSlice;
    campaign: CopyForgeCampaignSlice;
    dossier: CopyForgeDossierSlice | null;
    templateLayouts: Partial<Record<AdFormat, TemplateLayout>>;
    availableImages: AvailableImageInventory;
}

export type CopyForgeInput = NormalizedAdInput;

// ─── Copy Forge: output ─────────────────────────────────────────────────────

export interface ImageSlotDirective {
    assetType: AdAssetType;
    narrativeRole: string;
    moodCue: string;
    preferTags: string[];
}

export interface SlotPack {
    compositionNote: string;
    headline: string;
    subhead: string;
    microcopy: string;
    cta: string;
    imageSlotDirectives: Record<string, ImageSlotDirective>;
}

export interface AdCopySet {
    creativeTerritory: string;
    compositionIntent: string;
    formats: Partial<Record<AdFormat, SlotPack | SlotPack[]>>;
}

// ─── Quality gate ───────────────────────────────────────────────────────────

export type QualityCheckKey =
    | 'specificity'
    | 'niche_visibility'
    | 'theme_dominance'
    | 'image_copy_dependency'
    | 'non_genericity'
    | 'visual_arc_coherence'
    | 'image_diversity'
    | 'cta_fit'
    | 'compliance'
    | 'slot_fit';

export interface QualityCheckResult {
    key: QualityCheckKey;
    passed: boolean;
    severity: 'blocker' | 'warning';
    message: string;
}

export interface QualityGateResult {
    passed: boolean;
    blockerCount: number;
    warningCount: number;
    checks: QualityCheckResult[];
}

// ─── Copy Forge orchestrator result ─────────────────────────────────────────

export interface CopyForgeResult {
    copySet: AdCopySet;
    qualityGate: QualityGateResult;
    warnings: string[];
    modelId: string;
    regenerated: boolean;
}

// ─── Templated render path ────────────────────────────────────────────────────

export type TemplatedRenderFormat = 'jpg' | 'png' | 'webp' | 'pdf' | 'mp4';

export interface TemplatedLayerOverride {
    text?: string;
    image_url?: string;
    video_url?: string;
    color?: string;
    color_2?: string;
    background?: string;
    font_family?: string;
    font_family_2?: string;
    font_size?: string;
    font_weight?: string | number;
    letter_spacing?: string;
    hide?: boolean;
    opacity?: number;
    link?: string;
    x?: number;
    y?: number;
    rotation?: number;
    width?: number;
    height?: number;
    flip_x?: boolean;
    flip_y?: boolean;
    object_fit?: 'cover' | 'contain' | 'fill' | 'none';
    object_position?: string;
    animation?: Record<string, unknown>;
    start?: number;
    end?: number;
}

export interface TemplatedRenderPageInput {
    page: string;
    layers: Record<string, TemplatedLayerOverride>;
    width?: number;
    height?: number;
}

export interface TemplatedRenderRequest {
    template: string;
    format?: TemplatedRenderFormat;
    transparent?: boolean;
    async?: boolean;
    name?: string;
    external_id?: string;
    merge?: boolean;
    background?: string;
    width?: number;
    height?: number;
    scale?: number;
    layers?: Record<string, TemplatedLayerOverride>;
    pages?: TemplatedRenderPageInput[];
}

export interface TemplatedRenderResponsePage {
    id: string;
    url: string;
    width: number;
    height: number;
    format: string;
    templateId: string;
    templateName: string;
    createdAt: string;
    externalId?: string | null;
    status?: string;
    page?: string;
}

export interface AdRenderImageSelection {
    slotName: string;
    assetId: string;
    assetType: AdAssetType | string;
    sourceUrl: string;
    publicUrl: string;
    tags: string[];
    rehosted: boolean;
}

export interface AdRenderPageArtifact {
    page: string;
    layers: Record<string, TemplatedLayerOverride>;
    selectedImages: AdRenderImageSelection[];
}

export interface AdRenderPack {
    format: AdFormat;
    templateRef: TemplateRef;
    request: TemplatedRenderRequest;
    pages: AdRenderPageArtifact[];
    selectedImages: AdRenderImageSelection[];
}

export interface AdRenderResult {
    format: AdFormat;
    templateRef: TemplateRef;
    request: TemplatedRenderRequest;
    pages: Array<AdRenderPageArtifact & { render: TemplatedRenderResponsePage }>;
    selectedImages: AdRenderImageSelection[];
}
