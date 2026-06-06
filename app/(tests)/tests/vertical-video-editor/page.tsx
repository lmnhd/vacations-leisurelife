'use client';

// ────────────────────────────────────────────────────────────────────────────
// Vertical Video Editor — Phase 2 (scene-by-scene editing)
//
// Canva-for-the-vertical-video. Renders the REAL TikTok/Reels beat sequence as a
// horizontal scene strip of true-coordinate 1080×1920 stages. Each beat can have
// its scene image, copy (headline/subline/badge/CTA/spoken), and grain edited;
// edits persist to manifest.tiktokVideoEdits and feed the production renderer.
//
// Sourced from GET /media/tiktok-sequence (saved-edit-resolved beats + per-beat
// synthesized baselines + selectable image pool). Unsaved draft edits are
// applied client-side via applyDraftToBeat, which mirrors applyBeatEdit's slot
// mapping so the live preview equals what a save would render. Save → PATCH
// /media/tiktok-edits, which returns the rebuilt sequence in one round-trip.
// ────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from 'react';
import type { AssetRecord } from '@/lib/campaigns/schema';
import { ThemeMusicPicker } from '@/components/campaign-media/theme-music-picker';
import { CampaignSelector } from '../media-generation/campaign-selector';

const LS_SLUG_KEY = 'vertical-video-editor:last-slug';

const FRAME_W = 1080;
const FRAME_H = 1920;
const SAFE_TOP = 200;
const SAFE_BOTTOM = 380;
const SAFE_RIGHT = 130;

type OverlayVariant = 'tag' | 'statement' | 'cta';
interface OverlayPlacement { x: number; y: number; width: number; height: number }

interface OverlaySpec {
    badge: string;
    headline: string;
    subline: string;
    accentColor: string;
    accentMuted?: string;
    variant?: OverlayVariant;
    placement: OverlayPlacement;
}
interface BrandLockupSpec {
    wordmark: string;
    tagline?: string;
    accentColor: string;
    placement: OverlayPlacement;
}
interface SequenceBeat {
    presetId: 'hook' | 'social' | 'cta';
    sceneId: string;
    imageAssetId?: string;
    overlaySpecs: OverlaySpec[];
    brandLockup: BrandLockupSpec;
    spokenText: string;
    durationSeconds: number;
}
interface ResolvedBeatImage {
    assetId: string | null;
    url: string | null;
    fromOverride: boolean;
    missing: boolean;
}
interface BeatBaseline {
    headline: string;
    subline: string;
    badge: string;
    cta: string;
    spokenText: string;
    sceneImageAssetId: string | null;
}
interface ResolvedBeat {
    index: number;
    beat: SequenceBeat;
    image: ResolvedBeatImage;
    baseline: BeatBaseline;
}
interface ImagePoolEntry {
    assetId: string;
    url: string;
    tags: string[];
    assetType: string;
    dimensions?: { width: number; height: number };
    selectionScore?: number;
}
interface SequenceResponse {
    status: string;
    error?: string;
    formatId?: string;
    distributionTag?: 'organic' | 'paid';
    storyboard?: { deliverableId: string; title?: string; totalDurationSeconds: number };
    grain?: { applyFilmGrain: boolean; grainStrength: number };
    themeMusicUrl?: string | null;
    beats?: ResolvedBeat[];
    imagePool?: ImagePoolEntry[];
    promotionStrategySummary?: string;
}

// Editable copy fields, by preset (drives which inputs show per beat).
type CopyField = 'headline' | 'subline' | 'badge' | 'cta' | 'spokenText';
const COPY_FIELDS_BY_PRESET: Record<SequenceBeat['presetId'], { field: CopyField; label: string }[]> = {
    hook: [
        { field: 'badge', label: 'Badge' },
        { field: 'headline', label: 'Headline (tag)' },
        { field: 'subline', label: 'Subline (tag)' },
        { field: 'spokenText', label: 'Narration' },
    ],
    social: [
        { field: 'badge', label: 'Badge' },
        { field: 'headline', label: 'Headline (top tag)' },
        { field: 'subline', label: 'Statement (bottom)' },
        { field: 'spokenText', label: 'Narration' },
    ],
    cta: [
        { field: 'badge', label: 'Badge' },
        { field: 'headline', label: 'Headline (statement)' },
        { field: 'subline', label: 'Subline (statement)' },
        { field: 'cta', label: 'Button label' },
        { field: 'spokenText', label: 'Narration' },
    ],
};

interface BeatEditDraft {
    imageAssetId?: string;
    headline?: string;
    subline?: string;
    badge?: string;
    cta?: string;
    spokenText?: string;
}
type DraftEdits = Record<string, BeatEditDraft>;

// ── client mirror of applyBeatEdit (package-template.ts) ───────────────────────
// Applies a draft onto a resolved beat for live preview. MUST match the server
// slot mapping or the preview lies. Also returns the effective image asset id.

function applyDraftToBeat(resolved: ResolvedBeat, draft: BeatEditDraft | undefined, pool: ImagePoolEntry[]): { beat: SequenceBeat; image: ResolvedBeatImage } {
    if (!draft || Object.keys(draft).length === 0) {
        return { beat: resolved.beat, image: resolved.image };
    }
    const beat = { ...resolved.beat, overlaySpecs: resolved.beat.overlaySpecs.map((s) => ({ ...s })) };
    const tag = beat.overlaySpecs.find((s) => s.variant === 'tag');
    const statement = beat.overlaySpecs.find((s) => s.variant === 'statement');
    const cta = beat.overlaySpecs.find((s) => s.variant === 'cta');
    const primary = beat.overlaySpecs[0];

    const headline = (draft.headline ?? '').trim();
    const subline = (draft.subline ?? '').trim();
    const badge = (draft.badge ?? '').trim();
    const ctaLabel = (draft.cta ?? '').trim();

    if (badge && primary) primary.badge = badge;
    switch (beat.presetId) {
        case 'hook': {
            const card = tag ?? primary;
            if (card) { if (headline) card.headline = headline; if (subline) card.subline = subline; }
            break;
        }
        case 'social':
            if (headline && tag) tag.headline = headline;
            if (subline && statement) statement.headline = subline;
            break;
        case 'cta':
            if (statement) { if (headline) statement.headline = headline; if (subline) statement.subline = subline; }
            if (ctaLabel && cta) cta.headline = ctaLabel;
            break;
    }
    if ((draft.spokenText ?? '').trim()) beat.spokenText = draft.spokenText!.trim();

    // image override
    let image = resolved.image;
    if (draft.imageAssetId) {
        const override = pool.find((p) => p.assetId === draft.imageAssetId);
        if (override) image = { assetId: override.assetId, url: override.url, fromOverride: true, missing: false };
    }
    return { beat, image };
}

// ── shared text helpers (mirror tiktok-overlay-cards.ts) ───────────────────────

function splitLines(value: string, maxLines: number): string[] {
    return value
        .replace(/\r\n/g, '\n').replace(/\r/g, '\n')
        .split(/\n|[/|]/)
        .map((part) => part.replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .slice(0, maxLines);
}
function withAlpha(hex: string, alpha: number): string {
    const t = hex.trim();
    if (!t.startsWith('#')) return t;
    const h = t.slice(1);
    const e = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.padEnd(6, '0').slice(0, 6);
    const r = parseInt(e.slice(0, 2), 16), g = parseInt(e.slice(2, 4), 16), b = parseInt(e.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function TagCard({ spec }: { spec: OverlaySpec }) {
    const accent = spec.accentColor || '#F2C450';
    const headlineLines = splitLines(spec.headline, 2);
    const sublineLines = splitLines(spec.subline, 2);
    return (
        <div style={{ width: spec.placement.width, height: spec.placement.height, position: 'relative', overflow: 'hidden', borderRadius: 14, padding: '22px 28px', backgroundImage: 'linear-gradient(180deg, rgba(8,10,16,0.62), rgba(8,10,16,0.40))', border: `1px solid ${withAlpha(accent, 0.55)}`, color: '#F6F1E5', boxSizing: 'border-box' }}>
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: accent, opacity: 0.95 }} />
            <div style={{ fontFamily: 'monospace', fontSize: 14, letterSpacing: '0.18em', color: accent, marginBottom: 10, textTransform: 'uppercase', fontWeight: 700 }}>{spec.badge}</div>
            <div style={{ fontSize: 34, lineHeight: 1.02, fontWeight: 800, marginBottom: sublineLines.length ? 8 : 0, whiteSpace: 'pre-line', color: 'rgba(246,241,229,0.96)' }}>{headlineLines.join('\n')}</div>
            {sublineLines.length > 0 && <div style={{ fontSize: 18, lineHeight: 1.22, color: 'rgba(246,241,229,0.78)', whiteSpace: 'pre-line' }}>{sublineLines.join('\n')}</div>}
        </div>
    );
}
function StatementCard({ spec }: { spec: OverlaySpec }) {
    const accent = spec.accentColor || '#F2C450';
    const headlineLines = splitLines(spec.headline, 3);
    const sublineLines = splitLines(spec.subline, 3);
    return (
        <div style={{ width: spec.placement.width, height: spec.placement.height, position: 'relative', overflow: 'hidden', borderRadius: 22, padding: '36px 38px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', backgroundImage: 'linear-gradient(180deg, rgba(6,8,14,0.78), rgba(6,8,14,0.62))', border: `1px solid ${withAlpha(accent, 0.45)}`, boxShadow: '0 22px 52px rgba(0,0,0,0.36)', color: '#F6F1E5', boxSizing: 'border-box' }}>
            <div style={{ position: 'absolute', left: 0, top: 0, right: 0, height: 6, background: accent, opacity: 0.95 }} />
            <div style={{ fontFamily: 'monospace', fontSize: 18, letterSpacing: '0.22em', color: accent, marginBottom: 14, textTransform: 'uppercase', fontWeight: 700 }}>{spec.badge}</div>
            <div style={{ fontSize: 64, lineHeight: 0.98, fontWeight: 900, marginBottom: sublineLines.length ? 16 : 0, whiteSpace: 'pre-line' }}>{headlineLines.join('\n')}</div>
            {sublineLines.length > 0 && <div style={{ fontSize: 24, lineHeight: 1.2, color: 'rgba(246,241,229,0.92)', whiteSpace: 'pre-line' }}>{sublineLines.join('\n')}</div>}
        </div>
    );
}
function CtaCard({ spec }: { spec: OverlaySpec }) {
    const accent = spec.accentColor || '#F2C450';
    const headlineLines = splitLines(spec.headline, 2);
    return (
        <div style={{ width: spec.placement.width, height: spec.placement.height, position: 'relative', overflow: 'hidden', borderRadius: Math.round(spec.placement.height / 2), padding: '0 28px 0 32px', display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: withAlpha(accent, 0.92), border: `1px solid ${withAlpha(accent, 0.95)}`, boxShadow: '0 18px 46px rgba(0,0,0,0.34)', color: '#0A0C12', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <div style={{ fontFamily: 'monospace', fontSize: 16, letterSpacing: '0.2em', color: 'rgba(10,12,18,0.78)', marginBottom: 6, textTransform: 'uppercase', fontWeight: 700 }}>{spec.badge}</div>
                <div style={{ fontSize: 38, lineHeight: 1, fontWeight: 900, whiteSpace: 'pre-line', color: '#0A0C12' }}>{headlineLines.join('\n')}</div>
            </div>
            <div style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: '#0A0C12', color: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, fontWeight: 900, flexShrink: 0, marginLeft: 18 }}>→</div>
        </div>
    );
}
function OverlayCard({ spec }: { spec: OverlaySpec }) {
    switch (spec.variant ?? 'statement') {
        case 'tag': return <TagCard spec={spec} />;
        case 'cta': return <CtaCard spec={spec} />;
        default: return <StatementCard spec={spec} />;
    }
}
function BrandLockup({ spec }: { spec: BrandLockupSpec }) {
    const accent = spec.accentColor || '#F2C450';
    return (
        <div style={{ width: spec.placement.width, height: spec.placement.height, display: 'flex', flexDirection: 'row', alignItems: 'center', color: '#F6F1E5', boxSizing: 'border-box' }}>
            <div style={{ width: 4, height: Math.min(28, spec.placement.height - 8), background: accent, marginRight: 12, borderRadius: 2 }} />
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <div style={{ fontSize: 20, lineHeight: 1, fontWeight: 800, letterSpacing: '0.02em', color: 'rgba(246,241,229,0.96)', textShadow: '0 2px 8px rgba(0,0,0,0.55)' }}>{spec.wordmark.toUpperCase()}</div>
                {spec.tagline && <div style={{ fontFamily: 'monospace', fontSize: 12, lineHeight: 1, letterSpacing: '0.24em', color: 'rgba(246,241,229,0.66)', marginTop: 6, textTransform: 'uppercase' }}>{spec.tagline}</div>}
            </div>
        </div>
    );
}

function BeatStage({ beat, image, scale, showGuides }: { beat: SequenceBeat; image: ResolvedBeatImage; scale: number; showGuides: boolean }) {
    return (
        <div style={{ width: FRAME_W * scale, height: FRAME_H * scale, overflow: 'hidden', flexShrink: 0, position: 'relative', borderRadius: 16 }}>
            <div style={{ width: FRAME_W, height: FRAME_H, transform: `scale(${scale})`, transformOrigin: 'top left', position: 'absolute', top: 0, left: 0, background: '#05070c' }}>
                {image.url && <img src={image.url} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(48px) brightness(0.45)', transform: 'scale(1.1)' }} />}
                {image.url ? (
                    <img src={image.url} alt={beat.sceneId} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }} />
                ) : (
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f43f5e', fontSize: 48, fontWeight: 700, textAlign: 'center', padding: 80 }}>Missing scene image<br />for {beat.sceneId}</div>
                )}
                {beat.overlaySpecs.map((spec, i) => (
                    <div key={i} style={{ position: 'absolute', left: spec.placement.x, top: spec.placement.y }}><OverlayCard spec={spec} /></div>
                ))}
                <div style={{ position: 'absolute', left: beat.brandLockup.placement.x, top: beat.brandLockup.placement.y }}><BrandLockup spec={beat.brandLockup} /></div>
                {showGuides && (
                    <>
                        <div style={{ position: 'absolute', left: 0, right: 0, top: SAFE_TOP, borderTop: '2px dashed rgba(244,63,94,0.7)' }} />
                        <div style={{ position: 'absolute', left: 0, right: 0, bottom: SAFE_BOTTOM, borderBottom: '2px dashed rgba(244,63,94,0.7)' }} />
                        <div style={{ position: 'absolute', top: 0, bottom: 0, right: SAFE_RIGHT, borderRight: '2px dashed rgba(244,63,94,0.7)' }} />
                    </>
                )}
            </div>
        </div>
    );
}

// ── image picker ──────────────────────────────────────────────────────────────

// Short human label for an asset type chip in the picker.
function shortAssetType(assetType: string): string {
    return assetType
        .replace(/_image$|_images$|_art$|_artifact$/i, '')
        .replace(/_/g, ' ')
        .slice(0, 10);
}

function ImagePicker({ beat, draftAssetId, baselineAssetId, pool, onChange }: {
    beat: SequenceBeat;
    draftAssetId: string | undefined;
    baselineAssetId: string | null;
    pool: ImagePoolEntry[];
    onChange: (assetId: string | null) => void;
}) {
    const [showAll, setShowAll] = useState(false);
    // Images tagged with this beat's sceneId surface first; the rest of the
    // FULL library are alternates, collapsed behind "all images" to keep the
    // common case (pick a scene shot) fast.
    const sceneMatches = pool.filter((p) => p.tags.includes(beat.sceneId));
    const others = pool.filter((p) => !p.tags.includes(beat.sceneId));
    const visible = showAll ? [...sceneMatches, ...others] : sceneMatches.length > 0 ? sceneMatches : others.slice(0, 8);
    const effective = draftAssetId ?? baselineAssetId ?? undefined;
    return (
        <div className="rounded border border-white/10 bg-white/[0.025] p-2">
            <div className="mb-1 flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-300">image</span>
                <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setShowAll((v) => !v)} className="text-[10px] text-cyan-300 hover:text-cyan-200">
                        {showAll ? 'scene only' : `all images (${pool.length})`}
                    </button>
                    {draftAssetId && <button type="button" onClick={() => onChange(null)} className="text-[10px] text-amber-300 hover:text-amber-200">reset</button>}
                </div>
            </div>
            <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
                {visible.map((p) => {
                    const selected = effective === p.assetId;
                    const isSceneDefault = !draftAssetId && baselineAssetId === p.assetId;
                    return (
                        <button
                            key={p.assetId}
                            type="button"
                            onClick={() => onChange(p.assetId)}
                            title={`${p.assetType} · ${p.tags.join(', ')}`}
                            className={`relative h-12 w-12 overflow-hidden rounded border ${selected ? 'border-emerald-400 ring-1 ring-emerald-400' : 'border-white/15 hover:border-white/40'}`}
                        >
                            <img src={p.url} alt={p.assetId} className="h-full w-full object-cover" />
                            {isSceneDefault && <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-center text-[8px] text-slate-300">scene</span>}
                            {showAll && !isSceneDefault && <span className="absolute bottom-0 left-0 right-0 truncate bg-black/60 px-0.5 text-center text-[7px] text-slate-400">{shortAssetType(p.assetType)}</span>}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

// ── page ────────────────────────────────────────────────────────────────────

export default function VerticalVideoEditorPage() {
    const [slug, setSlug] = useState('');
    const [data, setData] = useState<SequenceResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [showGuides, setShowGuides] = useState(true);
    const [scale, setScale] = useState(0.2);

    const [draft, setDraft] = useState<DraftEdits>({});
    const [savedDraft, setSavedDraft] = useState<DraftEdits>({});
    const [grain, setGrain] = useState<{ applyFilmGrain: boolean; grainStrength: number }>({ applyFilmGrain: true, grainStrength: 6 });
    const [savedGrain, setSavedGrain] = useState<{ applyFilmGrain: boolean; grainStrength: number }>({ applyFilmGrain: true, grainStrength: 6 });
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
    const [saveError, setSaveError] = useState<string | null>(null);

    const [musicBed, setMusicBed] = useState(true);
    const [previewState, setPreviewState] = useState<{ status: 'idle' | 'rendering' | 'done' | 'error'; url?: string; error?: string }>({ status: 'idle' });
    const [renderState, setRenderState] = useState<{ status: 'idle' | 'rendering' | 'done' | 'error'; message?: string; error?: string }>({ status: 'idle' });

    // On mount, resolve the campaign: ?campaign= query wins, else the last-saved
    // slug from localStorage. Empty ⇒ CampaignSelector falls back to its default.
    useEffect(() => {
        const requested = new URLSearchParams(window.location.search).get('campaign')?.trim();
        const remembered = (() => {
            try { return window.localStorage.getItem(LS_SLUG_KEY) ?? ''; } catch { return ''; }
        })();
        const resolved = requested || remembered;
        if (resolved) setSlug(resolved);
    }, []);

    // Persist the active campaign so the editor reopens where it left off.
    useEffect(() => {
        if (!slug.trim()) return;
        try { window.localStorage.setItem(LS_SLUG_KEY, slug.trim()); } catch { /* ignore */ }
    }, [slug]);

    // Convert a server tiktokVideoEdits.beats map into the local draft shape.
    const adoptServerEdits = useCallback((beats: ResolvedBeat[] | undefined, grainResp: SequenceResponse['grain']) => {
        const next: DraftEdits = {};
        for (const rb of beats ?? []) {
            const ia = rb.beat.imageAssetId;
            // Only treat as an override if it differs from the scene default.
            const draftBeat: BeatEditDraft = {};
            if (ia && ia !== rb.baseline.sceneImageAssetId) draftBeat.imageAssetId = ia;
            // Copy overrides: any slot whose current value differs from baseline.
            if (rb.baseline.headline !== readBeatField(rb.beat, 'headline')) draftBeat.headline = readBeatField(rb.beat, 'headline');
            if (rb.baseline.subline !== readBeatField(rb.beat, 'subline')) draftBeat.subline = readBeatField(rb.beat, 'subline');
            if (rb.baseline.badge !== readBeatField(rb.beat, 'badge')) draftBeat.badge = readBeatField(rb.beat, 'badge');
            if (rb.baseline.cta !== readBeatField(rb.beat, 'cta')) draftBeat.cta = readBeatField(rb.beat, 'cta');
            if (rb.baseline.spokenText !== rb.beat.spokenText) draftBeat.spokenText = rb.beat.spokenText;
            if (Object.keys(draftBeat).length > 0) next[String(rb.index)] = draftBeat;
        }
        const g = { applyFilmGrain: grainResp?.applyFilmGrain ?? true, grainStrength: grainResp?.grainStrength ?? 6 };
        setDraft(next);
        setSavedDraft(next);
        setGrain(g);
        setSavedGrain(g);
    }, []);

    const load = useCallback(async (s: string) => {
        if (!s.trim()) return;
        setLoading(true);
        setSaveStatus('idle');
        try {
            const res = await fetch(`/api/groups/campaign/${s}/media/tiktok-sequence?t=${Date.now()}`, { cache: 'no-store' });
            const json = (await res.json()) as SequenceResponse;
            setData(json);
            if (json.status === 'ok') adoptServerEdits(json.beats, json.grain);
        } catch (err) {
            setData({ status: 'error', error: err instanceof Error ? err.message : String(err) });
        } finally {
            setLoading(false);
        }
    }, [adoptServerEdits]);

    useEffect(() => { void load(slug); }, [slug, load]);

    const pool = data?.imagePool ?? [];
    const beats = data?.status === 'ok' ? data.beats ?? [] : [];

    const isDirty = JSON.stringify(draft) !== JSON.stringify(savedDraft)
        || JSON.stringify(grain) !== JSON.stringify(savedGrain);

    useEffect(() => {
        if (!isDirty) return;
        const handleBeforeUnload = (event: BeforeUnloadEvent) => {
            event.preventDefault();
            event.returnValue = '';
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [isDirty]);

    const handleCampaignChange = useCallback((nextSlug: string) => {
        if (isDirty) {
            const confirmed = window.confirm('You have unsaved video edits. Switch campaigns and discard those changes?');
            if (!confirmed) return;
        }
        setSlug(nextSlug);
    }, [isDirty]);

    const updateField = useCallback((index: number, field: CopyField | 'imageAssetId', value: string | null) => {
        setSaveStatus('idle');
        setDraft((cur) => {
            const key = String(index);
            const beatDraft: BeatEditDraft = { ...(cur[key] ?? {}) };
            if (value === null || value === '') delete beatDraft[field];
            else beatDraft[field] = value;
            const next = { ...cur };
            if (Object.keys(beatDraft).length === 0) delete next[key];
            else next[key] = beatDraft;
            return next;
        });
    }, []);

    const save = useCallback(async () => {
        setSaveStatus('saving');
        setSaveError(null);
        // Diff draft vs savedDraft → a patch of changed beats/fields (null clears).
        const beatsPayload: Record<string, Record<string, string> | null> = {};
        const keys = new Set([...Object.keys(savedDraft), ...Object.keys(draft)]);
        for (const key of keys) {
            const current = draft[key];
            if (!current || Object.keys(current).length === 0) {
                beatsPayload[key] = null;
                continue;
            }
            const beatPayload: Record<string, string> = {};
            for (const [field, value] of Object.entries(current)) {
                if (typeof value === 'string' && value.trim().length > 0) {
                    beatPayload[field] = value.trim();
                }
            }
            beatsPayload[key] = Object.keys(beatPayload).length > 0 ? beatPayload : null;
        }
        const body: Record<string, unknown> = {
            replace: true,
            beats: beatsPayload,
            applyFilmGrain: grain.applyFilmGrain,
            grainStrength: grain.grainStrength,
        };

        try {
            const res = await fetch(`/api/groups/campaign/${slug}/media/tiktok-edits`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const json = (await res.json()) as SequenceResponse & { error?: string };
            if (!res.ok || json.status !== 'ok') {
                setSaveStatus('error');
                setSaveError(json.error ?? `save failed (${res.status})`);
                return;
            }
            // Refresh from the authoritative rebuilt sequence.
            setData((cur) => cur ? { ...cur, beats: json.beats, grain: json.grain } : cur);
            adoptServerEdits(json.beats, json.grain);
            setSaveStatus('saved');
        } catch (err) {
            setSaveStatus('error');
            setSaveError(err instanceof Error ? err.message : String(err));
        }
    }, [draft, savedDraft, grain, slug, adoptServerEdits]);

    // Build the sequenceBeats[] payload the preview route consumes, from the
    // current draft-applied beats. Skips beats with no resolvable image.
    const buildPreviewPayload = useCallback(() => {
        const sequenceBeats = beats.map((rb) => {
            const { beat, image } = applyDraftToBeat(rb, draft[String(rb.index)], pool);
            return {
                backgroundImageUrl: image.url,
                overlaySpecs: beat.overlaySpecs,
                brandLockup: beat.brandLockup,
                spokenText: beat.spokenText,
                durationSeconds: beat.durationSeconds,
            };
        }).filter((b) => typeof b.backgroundImageUrl === 'string' && b.backgroundImageUrl.length > 0);
        return {
            sequenceBeats,
            durationSeconds: data?.storyboard?.totalDurationSeconds,
            applyFilmGrain: grain.applyFilmGrain,
            grainStrength: grain.grainStrength,
            // Mix the campaign theme-music bed so the preview matches production —
            // unless the operator turned the music bed off.
            themeMusicUrl: musicBed ? (data?.themeMusicUrl ?? null) : null,
        };
    }, [beats, draft, pool, grain, data, musicBed]);

    const previewMp4 = useCallback(async () => {
        setPreviewState({ status: 'rendering' });
        try {
            const payload = buildPreviewPayload();
            if (payload.sequenceBeats.length === 0) {
                setPreviewState({ status: 'error', error: 'No beats with a resolvable image to preview.' });
                return;
            }
            const res = await fetch('/api/tests/tiktok-playground/preview', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const json = await res.json();
            if (!res.ok || !json.previewUrl) {
                setPreviewState({ status: 'error', error: json.error ?? `preview failed (${res.status})` });
                return;
            }
            setPreviewState({ status: 'done', url: json.previewUrl });
        } catch (err) {
            setPreviewState({ status: 'error', error: err instanceof Error ? err.message : String(err) });
        }
    }, [buildPreviewPayload]);

    const renderProduction = useCallback(async () => {
        setRenderState({ status: 'rendering' });
        try {
            const body = musicBed
                ? data?.themeMusicUrl
                    ? {
                        // A campaign track already exists. Regenerate only the
                        // video so the renderer consumes that selected track.
                        assetTypes: ['tiktok_seed_video'],
                        forceRegenerateAssetTypes: ['tiktok_seed_video'],
                    }
                    : {
                        // No campaign track exists yet: ask the generator to
                        // select the free default-library music bed first.
                        assetTypes: ['tiktok_seed_video', 'theme_music'],
                        forceRegenerateAssetTypes: ['tiktok_seed_video'],
                        themeMusicSource: 'default',
                    }
                : {
                    // Music bed off — render narration only, even if a track exists.
                    assetTypes: ['tiktok_seed_video'],
                    forceRegenerateAssetTypes: ['tiktok_seed_video'],
                    disableThemeMusic: true,
                };
            const res = await fetch(`/api/groups/campaign/${slug}/media/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const json = await res.json();
            if (!res.ok) {
                setRenderState({ status: 'error', error: json.error ?? `render failed (${res.status})` });
                return;
            }
            setRenderState({ status: 'done', message: json.message ?? 'render complete' });
        } catch (err) {
            setRenderState({ status: 'error', error: err instanceof Error ? err.message : String(err) });
        }
    }, [slug, musicBed, data?.themeMusicUrl]);

    return (
        <div className="min-h-screen bg-[#080808] text-slate-200" style={{ fontFamily: 'Inter, sans-serif' }}>
            <div className="border-b border-white/[0.07] px-8 py-6">
                <h1 className="mb-1 text-xl font-bold tracking-tight text-slate-100">Vertical Video Editor</h1>
                <p className="mb-5 max-w-3xl text-sm text-slate-500">
                    Scene-by-scene studio for the 9:16 TikTok / Instagram Reels video. Each column is one beat of the real
                    production sequence at true 1080×1920. Swap the scene image and rewrite the copy; saved edits feed the
                    production renderer.
                </p>

                <div className="mb-4 flex flex-wrap items-center gap-4">
                    <div className="w-80"><CampaignSelector value={slug} onChange={handleCampaignChange} disabled={loading} defaultFilter="designed" /></div>
                    {loading && <span className="text-xs text-slate-500">loading…</span>}
                    {data?.status === 'ok' && <span className="text-xs text-emerald-400">{data.formatId} / {data.distributionTag} / {beats.length} beats / {data.storyboard?.totalDurationSeconds}s</span>}
                    {data && data.status !== 'ok' && <span className="text-xs text-amber-400">{data.status}{data.error ? ` — ${data.error}` : ''}</span>}

                    <div className="ml-auto flex items-center gap-4">
                        {beats.length > 0 && (
                            <>
                                <button
                                    type="button"
                                    onClick={save}
                                    disabled={!isDirty || saveStatus === 'saving'}
                                    className={`rounded px-3 py-1 text-xs font-semibold transition ${isDirty ? 'bg-amber-400 text-black hover:bg-amber-300' : 'bg-white/10 text-slate-500'}`}
                                >
                                    {saveStatus === 'saving' ? 'Saving…' : 'Save edits'}
                                </button>
                                {saveStatus === 'saved' && !isDirty && <span className="text-xs text-emerald-400">saved</span>}
                                {saveStatus === 'error' && <span className="text-xs text-red-400" title={saveError ?? ''}>save failed</span>}

                                <button
                                    type="button"
                                    onClick={previewMp4}
                                    disabled={previewState.status === 'rendering'}
                                    className="rounded border border-cyan-400/40 px-3 py-1 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-400/10 disabled:opacity-50"
                                    title="Render a quick preview MP4 from the current (unsaved) edits"
                                >
                                    {previewState.status === 'rendering' ? 'Rendering…' : 'Preview MP4'}
                                </button>
                                <button
                                    type="button"
                                    onClick={renderProduction}
                                    disabled={renderState.status === 'rendering' || isDirty}
                                    className="rounded border border-emerald-400/40 px-3 py-1 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-400/10 disabled:opacity-50"
                                    title={isDirty ? 'Save edits first' : 'Regenerate the production tiktok_seed_video with saved edits'}
                                >
                                    {renderState.status === 'rendering' ? 'Generating…' : 'Render production'}
                                </button>
                            </>
                        )}
                        <label className="flex items-center gap-2 text-xs text-slate-400">
                            <input type="checkbox" checked={showGuides} onChange={(e) => setShowGuides(e.target.checked)} /> safe-area guides
                        </label>
                        <div className="flex items-center gap-2">
                            <span className="text-xs uppercase tracking-widest text-slate-600">Zoom</span>
                            {([0.16, 0.2, 0.26] as const).map((z) => (
                                <button key={z} type="button" onClick={() => setScale(z)} className={`rounded px-3 py-1 text-xs font-semibold transition ${scale === z ? 'bg-white/10 text-slate-100' : 'text-slate-500 hover:text-slate-300'}`}>{Math.round(z * 100)}%</button>
                            ))}
                        </div>
                    </div>
                </div>

                {beats.length > 0 && (
                    <div className="flex flex-wrap items-center gap-5">
                        <label className="flex items-center gap-2 text-xs text-slate-400">
                            <input type="checkbox" checked={grain.applyFilmGrain} onChange={(e) => { setGrain((g) => ({ ...g, applyFilmGrain: e.target.checked })); setSaveStatus('idle'); }} /> film grain
                        </label>
                        {grain.applyFilmGrain && (
                            <label className="flex items-center gap-2 text-xs text-slate-400">
                                strength {grain.grainStrength}
                                <input type="range" min={0} max={20} value={grain.grainStrength} onChange={(e) => { setGrain((g) => ({ ...g, grainStrength: Number(e.target.value) })); setSaveStatus('idle'); }} />
                            </label>
                        )}
                        <label className="flex items-center gap-2 text-xs text-slate-400">
                            <input type="checkbox" checked={musicBed} onChange={(e) => setMusicBed(e.target.checked)} /> music bed
                        </label>
                        {musicBed ? (
                            <span className={`text-xs ${data?.themeMusicUrl ? 'text-slate-500' : 'text-amber-400'}`}>
                                {data?.themeMusicUrl
                                    ? '♪ campaign theme track'
                                    : '♪ no track yet — render picks a default'}
                            </span>
                        ) : (
                            <span className="text-xs text-slate-500">♪ muted — narration only</span>
                        )}
                        {data?.promotionStrategySummary && <span className="text-xs text-slate-500"><span className="font-semibold text-slate-400">Strategy:</span> {data.promotionStrategySummary}</span>}
                    </div>
                )}
                {beats.length > 0 && (
                    <div className="mt-4">
                        <ThemeMusicPicker
                            slug={slug}
                            compact
                            disabled={!musicBed || loading}
                            onTrackChanged={(track: AssetRecord) => {
                                setData((current) => current ? { ...current, themeMusicUrl: track.url } : current);
                            }}
                        />
                    </div>
                )}
            </div>

            {data && data.status === 'no_promotion_package' && (
                <div className="m-8 rounded border border-amber-500/40 bg-amber-500/[0.06] p-5 text-sm text-amber-200">
                    <strong>No TikTok promotion package yet.</strong> The vertical video copy is synthesized late-stage from the
                    mature campaign. Generate the TikTok promotion package before editing scenes. There is no brief-era fallback copy by design.
                </div>
            )}
            {data && (data.status === 'no_storyboard' || data.status === 'no_brief' || data.status === 'no_manifest') && (
                <div className="m-8 rounded border border-red-500/40 bg-red-500/[0.06] p-5 text-sm text-red-200"><strong>Not ready:</strong> {data.error}</div>
            )}

            {(previewState.status !== 'idle' || renderState.status !== 'idle') && (
                <div className="mx-8 mt-6 flex flex-wrap items-start gap-6">
                    {previewState.status !== 'idle' && (
                        <div className="rounded border border-cyan-400/30 bg-cyan-400/[0.05] p-3">
                            <div className="mb-2 text-xs font-semibold text-cyan-200">Preview MP4</div>
                            {previewState.status === 'rendering' && <div className="text-xs text-slate-400">rendering…</div>}
                            {previewState.status === 'error' && <div className="max-w-md text-xs text-red-300">{previewState.error}</div>}
                            {previewState.status === 'done' && previewState.url && (
                                <video src={previewState.url} controls className="w-48 rounded border border-white/10" style={{ aspectRatio: '9 / 16' }} />
                            )}
                        </div>
                    )}
                    {renderState.status !== 'idle' && (
                        <div className="rounded border border-emerald-400/30 bg-emerald-400/[0.05] p-3 text-xs">
                            <div className="mb-1 font-semibold text-emerald-200">Production render</div>
                            {renderState.status === 'rendering' && <div className="text-slate-400">generating tiktok_seed_video… (this can take a few minutes)</div>}
                            {renderState.status === 'error' && <div className="max-w-md text-red-300">{renderState.error}</div>}
                            {renderState.status === 'done' && <div className="max-w-md text-emerald-300">{renderState.message}</div>}
                        </div>
                    )}
                </div>
            )}

            {beats.length > 0 && (
                <div className="px-8 py-8">
                    <div className="flex flex-wrap items-start gap-8">
                        {beats.map((rb) => {
                            const beatDraft = draft[String(rb.index)];
                            const { beat, image } = applyDraftToBeat(rb, beatDraft, pool);
                            return (
                                <div key={rb.index} className="flex flex-col gap-3" style={{ width: Math.max(FRAME_W * scale, 280) }}>
                                    <BeatStage beat={beat} image={image} scale={scale} showGuides={showGuides} />
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="rounded bg-white/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-300">{rb.index + 1}. {rb.beat.presetId}</span>
                                        <span className="font-mono text-[11px] text-slate-600">{rb.beat.durationSeconds}s · {rb.beat.sceneId || '—'}</span>
                                    </div>

                                    <ImagePicker
                                        beat={rb.beat}
                                        draftAssetId={beatDraft?.imageAssetId}
                                        baselineAssetId={rb.baseline.sceneImageAssetId}
                                        pool={pool}
                                        onChange={(assetId) => updateField(rb.index, 'imageAssetId', assetId)}
                                    />

                                    <div className="flex flex-col gap-2">
                                        {COPY_FIELDS_BY_PRESET[rb.beat.presetId].map(({ field, label }) => {
                                            const draftValue = beatDraft?.[field] ?? '';
                                            const baseline = rb.baseline[field];
                                            const overridden = draftValue.length > 0;
                                            const isMulti = field === 'spokenText' || field === 'subline';
                                            return (
                                                <label key={field} className="block">
                                                    <span className="mb-0.5 flex items-center justify-between text-[10px] uppercase tracking-wide text-slate-500">
                                                        {label}
                                                        {overridden && <button type="button" onClick={() => updateField(rb.index, field, null)} className="text-amber-300 hover:text-amber-200">reset</button>}
                                                    </span>
                                                    {isMulti ? (
                                                        <textarea
                                                            value={draftValue}
                                                            placeholder={baseline}
                                                            onChange={(e) => updateField(rb.index, field, e.target.value)}
                                                            rows={2}
                                                            className={`w-full resize-none rounded border bg-black px-2 py-1 text-xs text-slate-200 outline-none focus:border-amber-400/70 ${overridden ? 'border-amber-400/40' : 'border-white/10'}`}
                                                        />
                                                    ) : (
                                                        <input
                                                            type="text"
                                                            value={draftValue}
                                                            placeholder={baseline}
                                                            onChange={(e) => updateField(rb.index, field, e.target.value)}
                                                            className={`w-full rounded border bg-black px-2 py-1 text-xs text-slate-200 outline-none focus:border-amber-400/70 ${overridden ? 'border-amber-400/40' : 'border-white/10'}`}
                                                        />
                                                    )}
                                                </label>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}

// Reads the effective value of an editable field from a resolved beat, using the
// same slot semantics as the server baseline reader. Used to detect which fields
// the server already has as overrides when adopting a freshly-loaded sequence.
function readBeatField(beat: SequenceBeat, field: CopyField): string {
    const tag = beat.overlaySpecs.find((s) => s.variant === 'tag');
    const statement = beat.overlaySpecs.find((s) => s.variant === 'statement');
    const cta = beat.overlaySpecs.find((s) => s.variant === 'cta');
    const primary = beat.overlaySpecs[0];
    switch (field) {
        case 'badge': return primary?.badge ?? '';
        case 'spokenText': return beat.spokenText;
        case 'cta': return cta?.headline ?? '';
        case 'headline':
            if (beat.presetId === 'hook') return tag?.headline ?? primary?.headline ?? '';
            if (beat.presetId === 'social') return tag?.headline ?? '';
            return statement?.headline ?? '';
        case 'subline':
            if (beat.presetId === 'hook') return tag?.subline ?? primary?.subline ?? '';
            if (beat.presetId === 'social') return statement?.headline ?? '';
            return statement?.subline ?? '';
    }
}
