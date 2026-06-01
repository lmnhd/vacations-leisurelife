'use client';

// /tests/landing-studio — Landing Image Studio
//
// Manually control a campaign's landing-page images. Hero = single-asset override
// (imageSelections["section:landingHero:primary"]). Gallery = curated ordered set
// (manifest.landingImageSets.gallery, FULL-REPLACE). Live preview via iframe over
// /tests/campaign-landing/[slug]?chrome=0, with scroll-position preserved across
// the reloads that follow a change. (LANDING_IMAGE_STUDIO/MASTER_PLAN.md)

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CampaignSelector } from '../media-generation/campaign-selector';
import { ImageThumbPicker } from '@/components/campaign-media/image-thumb-picker';
import {
    collectSelectableImageGroups,
    buildImageAssetIndex,
    type HtmlTemplateManifest,
} from '@/lib/ads/html-templates/core';
import { Loader2, ExternalLink, ChevronUp, ChevronDown, X, Check } from 'lucide-react';

const HERO_KEY = 'section:landingHero:primary';

const FLAVORS: { id: string; label: string }[] = [
    { id: '', label: 'Production' },
    { id: 'editorial_magazine', label: 'Editorial' },
    { id: 'travel_nostalgia', label: 'Nostalgia' },
    { id: 'indie_zine', label: 'Zine' },
    { id: 'none', label: 'Plain' },
];

export default function LandingStudioPage() {
    const [slug, setSlug] = useState('');
    const [manifest, setManifest] = useState<HtmlTemplateManifest | null>(null);
    const [flavor, setFlavor] = useState('');
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Gallery curated set: local draft vs. saved (so editing is instant; one reload on Apply).
    const [galleryDraft, setGalleryDraft] = useState<string[]>([]);
    const [gallerySaved, setGallerySaved] = useState<string[]>([]);

    const iframeRef = useRef<HTMLIFrameElement | null>(null);
    const pendingScrollRef = useRef<number | null>(null);

    const load = useCallback(async (s: string) => {
        if (!s) { setManifest(null); setGalleryDraft([]); setGallerySaved([]); return; }
        setLoading(true);
        setError(null);
        try {
            const [mRes, lRes] = await Promise.all([
                fetch(`/api/groups/campaign/${s}/media/manifest?t=${Date.now()}`, { cache: 'no-store' }),
                fetch(`/api/groups/campaign/${s}/media/landing-images?t=${Date.now()}`, { cache: 'no-store' }),
            ]);
            setManifest(mRes.ok ? (await mRes.json() as HtmlTemplateManifest) : null);
            const sets = lRes.ok ? await lRes.json() as { gallery?: string[] } : {};
            setGalleryDraft(sets.gallery ?? []);
            setGallerySaved(sets.gallery ?? []);
        } catch {
            setManifest(null);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void load(slug); }, [slug, load]);

    const pool = useMemo(() => (manifest ? collectSelectableImageGroups(manifest) : []), [manifest]);
    const assetIndex = useMemo(() => buildImageAssetIndex(manifest), [manifest]);
    const heroValue = manifest?.imageSelections?.[HERO_KEY];
    const galleryDirty = JSON.stringify(galleryDraft) !== JSON.stringify(gallerySaved);

    // ── Preview reload with scroll preservation ──────────────────────────────
    const reloadPreview = useCallback(() => {
        const win = iframeRef.current?.contentWindow;
        try { pendingScrollRef.current = win ? (win.scrollY || 0) : null; } catch { pendingScrollRef.current = null; }
        try { win?.location.reload(); } catch { /* cross-origin shouldn't happen (same host) */ }
    }, []);

    const handleIframeLoad = useCallback(() => {
        const y = pendingScrollRef.current;
        if (y == null) return;
        pendingScrollRef.current = null;
        const apply = () => { try { iframeRef.current?.contentWindow?.scrollTo(0, y); } catch { /* noop */ } };
        apply();
        setTimeout(apply, 200);
        setTimeout(apply, 600); // late image layout can change height
    }, []);

    // ── Hero (immediate apply) ───────────────────────────────────────────────
    const updateHero = useCallback(async (assetId: string | null) => {
        if (!slug) return;
        setSaving(true); setError(null);
        try {
            const res = await fetch(`/api/groups/campaign/${slug}/media/selections`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ selections: { [HERO_KEY]: assetId } }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
            if (data.manifest) setManifest(data.manifest as HtmlTemplateManifest);
            reloadPreview();
        } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
        finally { setSaving(false); }
    }, [slug, reloadPreview]);

    // ── Gallery (batch; Apply commits + one reload) ──────────────────────────
    const toggleGallery = (id: string) =>
        setGalleryDraft((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
    const removeGallery = (id: string) => setGalleryDraft((prev) => prev.filter((x) => x !== id));
    const moveGallery = (i: number, dir: -1 | 1) => setGalleryDraft((prev) => {
        const next = [...prev];
        const j = i + dir;
        if (j < 0 || j >= next.length) return prev;
        [next[i], next[j]] = [next[j], next[i]];
        return next;
    });

    const saveGallery = useCallback(async (ids: string[]) => {
        if (!slug) return;
        setSaving(true); setError(null);
        try {
            const res = await fetch(`/api/groups/campaign/${slug}/media/landing-images`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ gallery: ids }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
            setGallerySaved(ids);
            setGalleryDraft(ids);
            reloadPreview();
        } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
        finally { setSaving(false); }
    }, [slug, reloadPreview]);

    const previewSrc = slug ? `/tests/campaign-landing/${slug}?chrome=0${flavor ? `&flavor=${flavor}` : ''}` : '';

    return (
        <div className="flex h-screen flex-col bg-[#080808] text-slate-200" style={{ fontFamily: 'Inter, sans-serif' }}>
            <div className="flex items-center gap-4 border-b border-white/[0.07] px-6 py-3">
                <h1 className="text-sm font-bold tracking-tight text-slate-100">Landing Image Studio</h1>
                <span className="text-xs text-slate-500">Hero + gallery. Scan thumbnails, pick, apply.</span>
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-400" />}
                {slug && (
                    <a href={previewSrc} target="_blank" rel="noreferrer"
                        className="ml-auto inline-flex items-center gap-1.5 rounded border border-white/10 px-2.5 py-1 text-xs text-slate-300 hover:bg-white/5">
                        Open preview <ExternalLink className="h-3 w-3" />
                    </a>
                )}
            </div>

            <div className="flex min-h-0 flex-1">
                {/* ── Controls ─────────────────────────────────────────────── */}
                <div className="w-[440px] shrink-0 space-y-5 overflow-y-auto border-r border-white/[0.07] p-5">
                    <div>
                        <div className="mb-2 text-[10px] uppercase tracking-widest text-slate-500">Campaign</div>
                        <CampaignSelector value={slug} onChange={setSlug} disabled={loading} defaultFilter="all" />
                    </div>

                    <div>
                        <div className="mb-2 text-[10px] uppercase tracking-widest text-slate-500">Preview System</div>
                        <div className="flex flex-wrap gap-1.5">
                            {FLAVORS.map((f) => (
                                <button key={f.id} type="button" onClick={() => setFlavor(f.id)}
                                    className={`rounded px-2.5 py-1 text-xs transition ${flavor === f.id ? 'bg-white/10 text-slate-100' : 'text-slate-500 hover:text-slate-300'}`}>
                                    {f.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {error && <div className="rounded border border-red-500/20 bg-red-500/10 p-2 text-[11px] text-red-300">{error}</div>}

                    {!slug ? (
                        <div className="rounded border border-dashed border-white/10 p-3 text-xs text-slate-600">Select a campaign.</div>
                    ) : loading ? (
                        <div className="flex items-center gap-2 text-xs text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" /> loading…</div>
                    ) : !manifest ? (
                        <div className="rounded border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-300">No media manifest for this campaign yet.</div>
                    ) : (
                        <>
                            {/* Hero */}
                            <section>
                                <div className="mb-2 text-[10px] uppercase tracking-widest text-slate-500">Hero Image</div>
                                <div className="max-h-72 overflow-y-auto pr-1">
                                    <ImageThumbPicker
                                        assets={pool}
                                        selectedId={heroValue}
                                        autoActive={!heroValue}
                                        disabled={saving}
                                        onPick={(id) => void updateHero(id)}
                                        onAuto={() => void updateHero(null)}
                                    />
                                </div>
                            </section>

                            {/* Gallery */}
                            <section>
                                <div className="mb-2 flex items-center justify-between">
                                    <div className="text-[10px] uppercase tracking-widest text-slate-500">
                                        Gallery <span className="text-slate-600">· {galleryDraft.length} {gallerySaved.length === 0 && galleryDraft.length === 0 ? '(automatic)' : ''}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        {galleryDraft.length > 0 && (
                                            <button type="button" onClick={() => setGalleryDraft([])} disabled={saving}
                                                className="rounded border border-white/10 px-2 py-0.5 text-[10px] text-slate-400 hover:bg-white/5 disabled:opacity-40">Clear</button>
                                        )}
                                        <button type="button" onClick={() => void saveGallery(galleryDraft)} disabled={saving || !galleryDirty}
                                            className={`rounded px-2.5 py-0.5 text-[10px] font-semibold transition disabled:opacity-40 ${galleryDirty ? 'bg-violet-500/25 text-violet-100 hover:bg-violet-500/35' : 'bg-white/5 text-slate-500'}`}>
                                            {galleryDirty ? 'Apply' : 'Applied'}
                                        </button>
                                    </div>
                                </div>

                                {/* Current ordered set */}
                                {galleryDraft.length === 0 ? (
                                    <p className="mb-2 text-[11px] text-slate-500">Automatic — the system picks the gallery. Click images below to take control (your exact set, in order).</p>
                                ) : (
                                    <div className="mb-2 space-y-1">
                                        {galleryDraft.map((id, i) => {
                                            const a = assetIndex.get(id);
                                            return (
                                                <div key={id} className="flex items-center gap-2 rounded border border-white/10 bg-white/[0.02] p-1">
                                                    <span className="w-4 text-center text-[10px] text-slate-500">{i + 1}</span>
                                                    <div className="h-9 w-12 shrink-0 overflow-hidden rounded bg-slate-900">
                                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                                        {a?.url ? <img src={a.url} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-[8px] text-amber-400">missing</div>}
                                                    </div>
                                                    <span className="min-w-0 flex-1 truncate text-[10px] text-slate-400">{a?.assetType ?? 'unavailable'} · {id.slice(-10)}</span>
                                                    <button type="button" onClick={() => moveGallery(i, -1)} disabled={i === 0} className="p-0.5 text-slate-500 hover:text-slate-200 disabled:opacity-20"><ChevronUp className="h-3.5 w-3.5" /></button>
                                                    <button type="button" onClick={() => moveGallery(i, 1)} disabled={i === galleryDraft.length - 1} className="p-0.5 text-slate-500 hover:text-slate-200 disabled:opacity-20"><ChevronDown className="h-3.5 w-3.5" /></button>
                                                    <button type="button" onClick={() => removeGallery(id)} className="p-0.5 text-slate-500 hover:text-red-400"><X className="h-3.5 w-3.5" /></button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}

                                {/* Add from pool */}
                                <div className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-widest text-slate-600"><Check className="h-3 w-3" /> in gallery · click to toggle</div>
                                <div className="max-h-72 overflow-y-auto pr-1">
                                    <ImageThumbPicker
                                        assets={pool}
                                        selectedIds={galleryDraft}
                                        onToggle={toggleGallery}
                                        disabled={saving}
                                    />
                                </div>
                            </section>
                        </>
                    )}
                </div>

                {/* ── Live preview ─────────────────────────────────────────── */}
                <div className="min-w-0 flex-1 bg-slate-200">
                    {previewSrc ? (
                        <iframe ref={iframeRef} src={previewSrc} onLoad={handleIframeLoad} title="Landing preview" className="h-full w-full border-0" />
                    ) : (
                        <div className="flex h-full items-center justify-center text-sm text-slate-500">Select a campaign to preview its landing page.</div>
                    )}
                </div>
            </div>
        </div>
    );
}
