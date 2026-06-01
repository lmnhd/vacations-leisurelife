'use client';

import { useState, useEffect, useCallback } from 'react';
import { CampaignSelector } from '../media-generation/campaign-selector';
import {
    resolveTemplateData,
    buildImagePool,
    buildImageAssetIndex,
    collectSelectableImageGroups,
    resolveSlotImages,
    SLOT_TYPES,
    SINGLE_IMAGE_CAPABLE_FORMATS,
    TEMPLATE_DIMENSIONS,
    type HtmlTemplateBrief,
    type HtmlTemplateManifest,
    type CopyHeadlineSource,
    type ImageSlotControl,
    type AdAssetType,
} from '@/lib/ads/html-templates/core';
import { ImageSlotPicker } from '@/components/campaign-media/image-slot-picker';
import {
    T1GoogleLandscape,
    T2ElegantStory,
    T3GoogleSquare,
    T4MetaCarousel,
    T5MetaStory,
    T6MetaFeedSquare,
    T7MetaFeedPortrait,
    T8IGStoryGrid,
} from '@/lib/ads/html-templates/components';

const DEFAULT_SLUG = 'glass-observatory-winter-sea-watchers';

function Scaled({ w, h, scale, children }: { w: number; h: number; scale: number; children: React.ReactNode }) {
    return (
        <div style={{ width: w * scale, height: h * scale, overflow: 'hidden', flexShrink: 0, position: 'relative' }}>
            <div style={{ width: w, height: h, transform: `scale(${scale})`, transformOrigin: 'top left', position: 'absolute', top: 0, left: 0 }}>
                {children}
            </div>
        </div>
    );
}

const TEMPLATES = [
    { id: 'google_display_landscape', label: 'Google Display - Landscape', dims: '1200 x 628', scale: 0.42 },
    { id: 'story_reel', label: 'Elegant Story', dims: '1080 x 1920', scale: 0.265 },
    { id: 'google_display_square', label: 'Google Display - Square', dims: '1080 x 1080', scale: 0.42 },
    { id: 'meta_carousel_square', label: 'Meta Carousel Card', dims: '1080 x 1080', scale: 0.42 },
    { id: 'meta_story_reel', label: 'Meta Story / Reel', dims: '1080 x 1920', scale: 0.265 },
    { id: 'meta_feed_square', label: 'Meta Feed - Square', dims: '1080 x 1080', scale: 0.42 },
    { id: 'meta_feed_portrait', label: 'Meta Feed - Portrait', dims: '1080 x 1350', scale: 0.37 },
    { id: 'ig_story_grid', label: 'IG Story Grid', dims: '1080 x 1920', scale: 0.265 },
] as const;

type FormatId = (typeof TEMPLATES)[number]['id'];

const COPY_SOURCE_OPTIONS: Array<{ value: CopyHeadlineSource; label: string }> = [
    { value: 'heroSlogan', label: 'Hero slogan' },
    { value: 'subSlogan', label: 'Sub slogan' },
    { value: 'themeName', label: 'Theme name' },
    { value: 'elevatorPitch', label: 'Elevator pitch' },
];

const COPY_SOURCE_LABELS: Record<CopyHeadlineSource, string> = {
    auto: 'Automatic',
    heroSlogan: 'Hero slogan',
    subSlogan: 'Sub slogan',
    themeName: 'Theme name',
    elevatorPitch: 'Elevator pitch',
};

function copySelectionKey(formatId: FormatId): string {
    return `copy:${formatId}:headlineSource`;
}

function renderTemplate(
    id: FormatId,
    d: ReturnType<typeof resolveTemplateData>,
    imgs: Record<string, string>,
    slotControls: Record<string, ImageSlotControl>,
) {
    const props = { d, imgs, slotControls };
    switch (id) {
        case 'google_display_landscape': return <T1GoogleLandscape {...props} />;
        case 'story_reel': return <T2ElegantStory {...props} />;
        case 'google_display_square': return <T3GoogleSquare {...props} />;
        case 'meta_carousel_square': return <T4MetaCarousel {...props} />;
        case 'meta_story_reel': return <T5MetaStory {...props} />;
        case 'meta_feed_square': return <T6MetaFeedSquare {...props} />;
        case 'meta_feed_portrait': return <T7MetaFeedPortrait {...props} />;
        case 'ig_story_grid': return <T8IGStoryGrid {...props} />;
    }
}

export default function CanvasTemplatesPage() {
    const [slug, setSlug] = useState(DEFAULT_SLUG);
    const [brief, setBrief] = useState<HtmlTemplateBrief | null>(null);
    const [manifest, setManifest] = useState<HtmlTemplateManifest | null>(null);
    const [loading, setLoading] = useState(true);
    const [manifestStatus, setManifestStatus] = useState<'loading' | 'ok' | 'none' | 'error'>('loading');
    const [error, setError] = useState<string | null>(null);
    const [zoom, setZoom] = useState(1);
    const [draftSelections, setDraftSelections] = useState<Record<string, string>>({});
    const [draftSlotControls, setDraftSlotControls] = useState<Record<string, ImageSlotControl>>({});
    const [draftCopySelections, setDraftCopySelections] = useState<Record<string, string>>({});
    const [selectionStatus, setSelectionStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

    useEffect(() => {
        const campaign = new URLSearchParams(window.location.search).get('campaign');
        if (campaign?.trim()) {
            setSlug(campaign.trim());
        }
    }, []);

    const loadData = useCallback(async (s: string) => {
        if (!s.trim()) return;
        setLoading(true);
        setError(null);
        setManifestStatus('loading');

        const t = Date.now();
        const [briefRes, manifestRes] = await Promise.allSettled([
            fetch(`/api/groups/campaign/${s}/media/aesthetic?t=${t}`, { cache: 'no-store' }),
            fetch(`/api/groups/campaign/${s}/media/manifest?t=${t}`, { cache: 'no-store' }),
        ]);

        if (briefRes.status === 'fulfilled' && briefRes.value.ok) {
            setBrief(await briefRes.value.json() as HtmlTemplateBrief);
        } else {
            setError('Brief fetch failed - using defaults');
            setBrief(null);
        }

        if (manifestRes.status === 'fulfilled') {
            if (manifestRes.value.ok) {
                const nextManifest = await manifestRes.value.json() as HtmlTemplateManifest;
                setManifest(nextManifest);
                setDraftSelections(nextManifest.imageSelections ?? {});
                setDraftSlotControls(nextManifest.imageSlotControls ?? {});
                setDraftCopySelections(nextManifest.copySelections ?? {});
                setSelectionStatus('idle');
                setManifestStatus('ok');
            } else if (manifestRes.value.status === 404) {
                setManifest(null);
                setDraftSelections({});
                setDraftSlotControls({});
                setDraftCopySelections({});
                setManifestStatus('none');
            } else {
                setManifest(null);
                setDraftSelections({});
                setDraftSlotControls({});
                setDraftCopySelections({});
                setManifestStatus('error');
            }
        } else {
            setManifest(null);
            setDraftSelections({});
            setDraftSlotControls({});
            setDraftCopySelections({});
            setManifestStatus('error');
        }

        setLoading(false);
    }, []);

    useEffect(() => { void loadData(slug); }, [slug, loadData]);

    const baseData = resolveTemplateData(brief);
    const pool = manifest ? buildImagePool(manifest) : null;
    const assetById = manifest ? buildImageAssetIndex(manifest) : undefined;
    const selectableAssets = manifest ? collectSelectableImageGroups(manifest) : [];
    const imgCount = pool ? Object.values(pool).reduce((n, arr) => n + arr.length, 0) : 0;
    const savedSelections = manifest?.imageSelections ?? {};
    const savedSlotControls = manifest?.imageSlotControls ?? {};
    const savedCopySelections = manifest?.copySelections ?? {};
    const isDirty = JSON.stringify(draftSelections) !== JSON.stringify(savedSelections)
        || JSON.stringify(draftSlotControls) !== JSON.stringify(savedSlotControls)
        || JSON.stringify(draftCopySelections) !== JSON.stringify(savedCopySelections);

    const updateSelection = useCallback((usePointKey: string, assetId: string | null) => {
        setDraftSelections((current) => {
            const next = { ...current };
            if (assetId) next[usePointKey] = assetId;
            else delete next[usePointKey];
            return next;
        });
        setSelectionStatus('idle');
    }, []);

    const updateSlotControl = useCallback((usePointKey: string, control: ImageSlotControl) => {
        setDraftSlotControls((current) => {
            const next = { ...current };
            const normalized: ImageSlotControl = {
                ...(control.hidden ? { hidden: true } : {}),
                ...(control.flipX ? { flipX: true } : {}),
                ...(control.position && control.position !== 'center' ? { position: control.position } : {}),
            };
            if (Object.keys(normalized).length === 0) delete next[usePointKey];
            else next[usePointKey] = normalized;
            return next;
        });
        setSelectionStatus('idle');
    }, []);

    const updateCopySelection = useCallback((usePointKey: string, source: string | null) => {
        setDraftCopySelections((current) => {
            const next = { ...current };
            if (source) next[usePointKey] = source;
            else delete next[usePointKey];
            return next;
        });
        setSelectionStatus('idle');
    }, []);

    const saveSelections = useCallback(async () => {
        if (!manifest) return;
        setSelectionStatus('saving');
        const keys = new Set([...Object.keys(savedSelections), ...Object.keys(draftSelections)]);
        const changes: Record<string, string | null> = {};
        for (const key of keys) {
            const next = draftSelections[key];
            if (next !== savedSelections[key]) {
                changes[key] = next ?? null;
            }
        }
        const controlKeys = new Set([...Object.keys(savedSlotControls), ...Object.keys(draftSlotControls)]);
        const slotControls: Record<string, ImageSlotControl | null> = {};
        for (const key of controlKeys) {
            const next = draftSlotControls[key];
            if (JSON.stringify(next ?? null) !== JSON.stringify(savedSlotControls[key] ?? null)) {
                slotControls[key] = next ?? null;
            }
        }

        const copyKeys = new Set([...Object.keys(savedCopySelections), ...Object.keys(draftCopySelections)]);
        const copySelections: Record<string, string | null> = {};
        for (const key of copyKeys) {
            const next = draftCopySelections[key];
            if (next !== savedCopySelections[key]) {
                copySelections[key] = next ?? null;
            }
        }

        const response = await fetch(`/api/groups/campaign/${slug}/media/selections`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ selections: changes, slotControls, copySelections }),
        });

        if (!response.ok) {
            setSelectionStatus('error');
            return;
        }

        const data = await response.json() as { manifest?: HtmlTemplateManifest; imageSelections?: Record<string, string> };
        const nextManifest = data.manifest ?? {
            ...manifest,
            imageSelections: data.imageSelections ?? draftSelections,
            copySelections: draftCopySelections,
        };
        setManifest(nextManifest);
        setDraftSelections(nextManifest.imageSelections ?? {});
        setDraftSlotControls(nextManifest.imageSlotControls ?? {});
        setDraftCopySelections(nextManifest.copySelections ?? {});
        setSelectionStatus('saved');
    }, [draftCopySelections, draftSelections, draftSlotControls, manifest, savedCopySelections, savedSelections, savedSlotControls, slug]);

    return (
        <div className="min-h-screen bg-[#080808] text-slate-200" style={{ fontFamily: 'Inter, sans-serif' }}>
            <div className="border-b border-white/[0.07] px-8 py-6">
                <h1 className="mb-1 text-xl font-bold tracking-tight text-slate-100">HTML Ad Image Studio</h1>
                <p className="mb-5 text-sm text-slate-500">
                    Compose the image slots used by the HTML ad templates. Saved picks are persisted to the campaign manifest and used by production rendering.
                </p>

                <div className="mb-4 flex flex-wrap items-center gap-4">
                    <div className="w-80">
                        <CampaignSelector value={slug} onChange={setSlug} disabled={loading} defaultFilter="designed" />
                    </div>
                    {loading && <span className="text-xs text-slate-500">loading...</span>}
                    {error && <span className="text-xs text-red-400">{error}</span>}
                    {!loading && !error && <span className="text-xs text-emerald-400">brief loaded</span>}
                    {manifestStatus === 'ok' && <span className="text-xs text-emerald-400">manifest / {imgCount} auto-pool images / {selectableAssets.length} selectable</span>}
                    {manifestStatus === 'none' && <span className="text-xs text-slate-500">no manifest - using gradients</span>}
                    {manifestStatus === 'error' && <span className="text-xs text-amber-400">manifest error - using gradients</span>}
                    {manifestStatus === 'loading' && <span className="text-xs text-slate-500">loading manifest...</span>}

                    <div className="ml-auto flex items-center gap-2">
                        <button
                            type="button"
                            onClick={saveSelections}
                            disabled={!manifest || !isDirty || selectionStatus === 'saving'}
                            className={`rounded px-3 py-1 text-xs font-semibold transition ${isDirty ? 'bg-amber-400 text-black hover:bg-amber-300' : 'bg-white/10 text-slate-500'}`}
                        >
                            {selectionStatus === 'saving' ? 'Saving...' : 'Save picks'}
                        </button>
                        {selectionStatus === 'saved' && <span className="text-xs text-emerald-400">saved</span>}
                        {selectionStatus === 'error' && <span className="text-xs text-red-400">save failed</span>}
                    </div>

                    <div className="flex items-center gap-2">
                        <span className="text-xs uppercase tracking-widest text-slate-600">Zoom</span>
                        {([0.75, 1, 1.25] as const).map((z) => (
                            <button
                                key={z}
                                type="button"
                                onClick={() => setZoom(z)}
                                className={`rounded px-3 py-1 text-xs font-semibold transition ${zoom === z ? 'bg-white/10 text-slate-100' : 'text-slate-500 hover:text-slate-300'}`}
                            >
                                {z === 1 ? '100%' : `${z * 100}%`}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex flex-wrap gap-5">
                    <div className="flex flex-wrap gap-4">
                        {([['Primary', baseData.p.primary], ['Secondary', baseData.p.secondary], ['Accent', baseData.p.accent], ['Background', baseData.p.background], ['Text', baseData.p.textOnDark]] as [string, string][]).map(([name, color]) => (
                            <div key={name} className="flex items-center gap-2">
                                <div style={{ width: 13, height: 13, background: color, border: '1px solid rgba(255,255,255,0.12)' }} />
                                <span className="text-xs text-slate-500">{name}</span>
                                <span className="font-mono text-xs text-slate-600">{color}</span>
                            </div>
                        ))}
                    </div>
                    {pool && (
                        <div className="ml-4 flex flex-wrap gap-3 border-l border-white/10 pl-4">
                            {(Object.entries(pool) as [AdAssetType, string[]][]).map(([type, urls]) => (
                                <span key={type} className={`font-mono text-xs ${urls.length > 0 ? 'text-emerald-400' : 'text-slate-600'}`}>
                                    {type}:{urls.length}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <div className="px-8 py-8" style={{ zoom }}>
                <div className="flex flex-wrap items-start gap-10">
                    {TEMPLATES.map(({ id, label, dims, scale }) => {
                        const { width: w, height: h } = TEMPLATE_DIMENSIONS[id] ?? { width: 1080, height: 1080 };
                        const d = resolveTemplateData(brief, { formatKey: id, copySelections: draftCopySelections });
                        const imgs = pool ? resolveSlotImages(id, pool, {
                            selections: draftSelections,
                            slotControls: draftSlotControls,
                            assetById,
                        }) : {};
                        const slotCount = Object.keys(imgs).length;
                        const slotDefs = SLOT_TYPES[id] ?? {};
                        const singleImageKey = SINGLE_IMAGE_CAPABLE_FORMATS[id] ? `ad:${id}:flyer` : null;
                        const copyKey = copySelectionKey(id);
                        return (
                            <div key={id} className="flex w-[500px] flex-col gap-3">
                                <Scaled w={w} h={h} scale={scale}>
                                    {renderTemplate(id, d, imgs, draftSlotControls)}
                                </Scaled>
                                <div>
                                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-300">
                                        {label}
                                    </div>
                                    <div className="font-mono text-xs text-slate-600">
                                        {dims}{slotCount > 0 ? ` / ${slotCount} slot${slotCount === 1 ? '' : 's'} filled` : ''}
                                    </div>
                                </div>
                                <div className="rounded border border-white/10 bg-white/[0.025] p-2">
                                    <div className="mb-1 flex items-center justify-between gap-2">
                                        <span className="text-[11px] font-semibold text-slate-300">headline source</span>
                                        <span className="text-[10px] uppercase tracking-wide text-slate-600">
                                            {COPY_SOURCE_LABELS[(draftCopySelections[copyKey] as CopyHeadlineSource) ?? 'auto']}
                                        </span>
                                    </div>
                                    <select
                                        value={draftCopySelections[copyKey] ?? ''}
                                        onChange={(event) => updateCopySelection(copyKey, event.target.value || null)}
                                        className="w-full rounded border border-white/10 bg-black px-2 py-1 text-xs text-slate-300 outline-none focus:border-amber-400/70"
                                    >
                                        <option value="">Automatic</option>
                                        {COPY_SOURCE_OPTIONS.map((option) => (
                                            <option key={option.value} value={option.value}>
                                                {option.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                {Object.keys(slotDefs).length > 0 && (
                                    <div className="grid gap-2">
                                        {singleImageKey && (
                                            <ImageSlotPicker
                                                label="single image"
                                                usePointKey={singleImageKey}
                                                value={draftSelections[singleImageKey]}
                                                assets={selectableAssets}
                                                autoUrl={imgs[SINGLE_IMAGE_CAPABLE_FORMATS[id]]}
                                                onChange={updateSelection}
                                                control={draftSlotControls[singleImageKey]}
                                                onControlChange={updateSlotControl}
                                            />
                                        )}
                                        {Object.keys(slotDefs).map((slot) => {
                                            const usePointKey = `ad:${id}:${slot}`;
                                            return (
                                                <ImageSlotPicker
                                                    key={usePointKey}
                                                    label={slot}
                                                    usePointKey={usePointKey}
                                                    value={draftSelections[usePointKey]}
                                                    assets={selectableAssets}
                                                    autoUrl={imgs[slot]}
                                                    onChange={updateSelection}
                                                    control={draftSlotControls[usePointKey]}
                                                    onControlChange={updateSlotControl}
                                                />
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
