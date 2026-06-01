'use client';

// /tests/flyer-lab — Flyer-Image Sandbox
//
// Generate flyer images from any campaign slug and weed out the negation rules
// one by one. Nothing here is persisted — when the rule set feels right, use
// "Copy DEFAULT_FLYER_NEGATIONS" and paste it into flyer-prompt.ts.
// (FLYER-IMAGE-REFACTOR plan, Phase 1.)

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CampaignSelector } from '../media-generation/campaign-selector';
import {
    buildFlyerPrompt,
    deriveBriefAnchors,
    DEFAULT_FLYER_NEGATIONS,
    DEFAULT_FLYER_VARIATION_AXES,
    type FlyerBriefLike,
} from '@/lib/campaigns/media/generators/flyer-prompt';

const DEFAULT_SLUG = 'glass-observatory-winter-sea-watchers';

interface Row { id: string; text: string; enabled: boolean; }
interface AnchorRow extends Row { label: string; }
interface Rendition { id: string; axis: string | null; prompt: string; dataUrl: string; steer: string; loading: boolean; }

let _idn = 0;
const nextId = () => `r${++_idn}`;
const toRows = (texts: string[]): Row[] => texts.map((t) => ({ id: nextId(), text: t, enabled: true }));

export default function FlyerLabPage() {
    const [slug, setSlug] = useState(DEFAULT_SLUG);
    const [negations, setNegations] = useState<Row[]>(() => toRows(DEFAULT_FLYER_NEGATIONS));
    const [axes, setAxes] = useState<Row[]>(() => toRows(DEFAULT_FLYER_VARIATION_AXES));
    const [anchors, setAnchors] = useState<AnchorRow[]>([]);
    const [fallbackCount, setFallbackCount] = useState(4);
    const [renditions, setRenditions] = useState<Rendition[]>([]);
    const [generating, setGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [briefStatus, setBriefStatus] = useState<'idle' | 'loading' | 'ok' | 'none'>('idle');
    const [copied, setCopied] = useState(false);
    const slugInputRef = useRef(slug);
    slugInputRef.current = slug;

    // Pull the brief to suggest light anchors. Free-text slugs with no campaign
    // simply yield no anchors — generation still works on the slug alone.
    const loadBrief = useCallback(async (s: string) => {
        if (!s.trim()) { setAnchors([]); setBriefStatus('idle'); return; }
        setBriefStatus('loading');
        try {
            const res = await fetch(`/api/groups/campaign/${s}/media/aesthetic?t=${Date.now()}`, { cache: 'no-store' });
            if (!res.ok) { setAnchors([]); setBriefStatus('none'); return; }
            const brief = await res.json() as FlyerBriefLike;
            const derived = deriveBriefAnchors(brief);
            setAnchors(derived.map((a) => ({ id: nextId(), label: a.label, text: a.text, enabled: true })));
            setBriefStatus(derived.length ? 'ok' : 'none');
        } catch {
            setAnchors([]); setBriefStatus('none');
        }
    }, []);

    useEffect(() => { void loadBrief(slug); }, [slug, loadBrief]);

    const enabledNegations = useMemo(() => negations.filter((r) => r.enabled && r.text.trim()).map((r) => r.text.trim()), [negations]);
    const enabledAxes = useMemo(() => axes.filter((r) => r.enabled && r.text.trim()).map((r) => r.text.trim()), [axes]);
    const enabledAnchors = useMemo(() => anchors.filter((r) => r.enabled && r.text.trim()).map((r) => r.text.trim()), [anchors]);

    // Representative prompt (uses the first enabled axis) so you see exactly what
    // is sent before spending a generation.
    const previewPrompt = useMemo(() => buildFlyerPrompt(slug, {
        anchors: enabledAnchors,
        axis: enabledAxes[0],
        negations: enabledNegations,
    }), [slug, enabledAnchors, enabledAxes, enabledNegations]);

    const renditionCount = enabledAxes.length || fallbackCount;

    const generate = useCallback(async () => {
        setGenerating(true);
        setError(null);
        try {
            const res = await fetch('/api/ads/flyer-lab/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    slug,
                    negations: enabledNegations,
                    anchors: enabledAnchors,
                    axes: enabledAxes,
                    count: enabledAxes.length ? undefined : fallbackCount,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
            setRenditions((data.renditions as Array<{ axis: string | null; prompt: string; dataUrl: string }>).map((r) => ({
                id: nextId(), axis: r.axis, prompt: r.prompt, dataUrl: r.dataUrl, steer: '', loading: false,
            })));
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setGenerating(false);
        }
    }, [slug, enabledNegations, enabledAnchors, enabledAxes, fallbackCount]);

    const regenerateTile = useCallback(async (id: string) => {
        const tile = renditions.find((r) => r.id === id);
        if (!tile) return;
        setRenditions((prev) => prev.map((r) => r.id === id ? { ...r, loading: true } : r));
        try {
            const res = await fetch('/api/ads/flyer-lab/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    slug,
                    negations: enabledNegations,
                    anchors: enabledAnchors,
                    axes: tile.axis ? [tile.axis] : [],
                    count: 1,
                    steer: tile.steer.trim() || undefined,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
            const next = data.renditions?.[0];
            if (next) {
                setRenditions((prev) => prev.map((r) => r.id === id ? { ...r, prompt: next.prompt, dataUrl: next.dataUrl, loading: false } : r));
            } else {
                setRenditions((prev) => prev.map((r) => r.id === id ? { ...r, loading: false } : r));
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
            setRenditions((prev) => prev.map((r) => r.id === id ? { ...r, loading: false } : r));
        }
    }, [renditions, slug, enabledNegations, enabledAnchors]);

    const copyNegations = useCallback(() => {
        const body = enabledNegations.map((n) => `    ${JSON.stringify(n)},`).join('\n');
        const snippet = `export const DEFAULT_FLYER_NEGATIONS: string[] = [\n${body}\n];`;
        void navigator.clipboard.writeText(snippet);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    }, [enabledNegations]);

    // ── Row editor helpers ────────────────────────────────────────────────────
    const setRow = (setter: React.Dispatch<React.SetStateAction<Row[]>>) => ({
        toggle: (id: string) => setter((prev) => prev.map((r) => r.id === id ? { ...r, enabled: !r.enabled } : r)),
        edit: (id: string, text: string) => setter((prev) => prev.map((r) => r.id === id ? { ...r, text } : r)),
        remove: (id: string) => setter((prev) => prev.filter((r) => r.id !== id)),
        add: () => setter((prev) => [...prev, { id: nextId(), text: '', enabled: true }]),
    });
    const negOps = setRow(setNegations);
    const axisOps = setRow(setAxes as React.Dispatch<React.SetStateAction<Row[]>>);

    const RuleList = ({ rows, ops, placeholder }: { rows: Row[]; ops: ReturnType<typeof setRow>; placeholder: string }) => (
        <div className="flex flex-col gap-2">
            {rows.map((r) => (
                <div key={r.id} className="flex items-start gap-2">
                    <input type="checkbox" checked={r.enabled} onChange={() => ops.toggle(r.id)} className="mt-2 accent-amber-500" />
                    <textarea
                        value={r.text}
                        onChange={(e) => ops.edit(r.id, e.target.value)}
                        placeholder={placeholder}
                        rows={1}
                        className={`flex-1 resize-y rounded border border-white/10 bg-black/30 px-2 py-1.5 text-xs leading-snug ${r.enabled ? 'text-slate-200' : 'text-slate-600 line-through'}`}
                    />
                    <button type="button" onClick={() => ops.remove(r.id)} className="mt-1 px-1.5 text-slate-600 hover:text-red-400" title="Remove">✕</button>
                </div>
            ))}
            <button type="button" onClick={ops.add} className="self-start rounded border border-dashed border-white/15 px-2 py-1 text-xs text-slate-400 hover:text-slate-200">+ add</button>
        </div>
    );

    return (
        <div className="min-h-screen bg-[#080808] text-slate-200" style={{ fontFamily: 'Inter, sans-serif' }}>
            <div className="border-b border-white/[0.07] px-8 py-6">
                <h1 className="text-xl font-bold tracking-tight text-slate-100 mb-1">Flyer-Image Sandbox</h1>
                <p className="text-sm text-slate-500 mb-5">
                    Generate flyer images from a slug and tune the negation rules one at a time. Nothing is saved — copy the rule set when it feels right.
                </p>
                <div className="flex flex-wrap items-center gap-4">
                    <div className="w-80"><CampaignSelector value={slug} onChange={setSlug} disabled={generating} defaultFilter="all" /></div>
                    <input
                        value={slug}
                        onChange={(e) => setSlug(e.target.value)}
                        placeholder="or type any slug…"
                        className="w-72 rounded border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-200"
                    />
                    {briefStatus === 'loading' && <span className="text-xs text-slate-500">loading brief…</span>}
                    {briefStatus === 'ok'      && <span className="text-xs text-emerald-400">✓ {anchors.length} anchor(s)</span>}
                    {briefStatus === 'none'    && <span className="text-xs text-slate-500">no brief anchors — slug only</span>}
                </div>
            </div>

            <div className="grid grid-cols-[380px_1fr] gap-8 px-8 py-6">
                {/* ── Controls ─────────────────────────────────────────────── */}
                <div className="flex flex-col gap-6">
                    <section>
                        <div className="mb-2 flex items-center justify-between">
                            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400">Negation rules</h2>
                            <button type="button" onClick={copyNegations} className="rounded bg-white/5 px-2 py-1 text-[11px] text-slate-300 hover:bg-white/10">
                                {copied ? 'copied ✓' : 'Copy DEFAULT_FLYER_NEGATIONS'}
                            </button>
                        </div>
                        <RuleList rows={negations} ops={negOps} placeholder="thing to avoid…" />
                    </section>

                    <section>
                        <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-400">Variation axes <span className="text-slate-600">· {enabledAxes.length} renditions</span></h2>
                        <RuleList rows={axes} ops={axisOps} placeholder="rendition direction…" />
                        {enabledAxes.length === 0 && (
                            <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                                no axes → generate
                                <input type="number" min={1} max={8} value={fallbackCount} onChange={(e) => setFallbackCount(Math.max(1, Math.min(8, Number(e.target.value) || 1)))}
                                    className="w-14 rounded border border-white/10 bg-black/30 px-2 py-1 text-slate-200" />
                                slug-only variations
                            </div>
                        )}
                    </section>

                    {anchors.length > 0 && (
                        <section>
                            <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-400">Brief anchors</h2>
                            <div className="flex flex-wrap gap-2">
                                {anchors.map((a) => (
                                    <button key={a.id} type="button" onClick={() => setAnchors((prev) => prev.map((x) => x.id === a.id ? { ...x, enabled: !x.enabled } : x))}
                                        className={`rounded-full border px-3 py-1 text-xs ${a.enabled ? 'border-amber-500/40 bg-amber-500/10 text-amber-300' : 'border-white/10 text-slate-500'}`}>
                                        {a.text}
                                    </button>
                                ))}
                            </div>
                        </section>
                    )}

                    <section>
                        <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-400">Prompt preview</h2>
                        <pre className="whitespace-pre-wrap rounded border border-white/10 bg-black/40 p-3 text-[11px] leading-relaxed text-slate-400">{previewPrompt}</pre>
                    </section>

                    <button type="button" onClick={generate} disabled={generating || !slug.trim()}
                        className="rounded bg-amber-500 px-4 py-3 text-sm font-bold text-black disabled:opacity-40">
                        {generating ? `Generating ${renditionCount}…` : `Generate ${renditionCount} flyer${renditionCount === 1 ? '' : 's'}`}
                    </button>
                    {error && <div className="rounded border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300">{error}</div>}
                </div>

                {/* ── Results ──────────────────────────────────────────────── */}
                <div>
                    {renditions.length === 0 ? (
                        <div className="flex h-64 items-center justify-center rounded border border-dashed border-white/10 text-sm text-slate-600">
                            No renditions yet — tune the rules and hit Generate.
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-5 xl:grid-cols-3">
                            {renditions.map((r) => (
                                <div key={r.id} className="flex flex-col gap-2 rounded border border-white/10 bg-white/[0.02] p-3">
                                    <div className="relative aspect-square overflow-hidden rounded bg-black/40">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={r.dataUrl} alt={r.axis ?? 'flyer'} className="h-full w-full object-cover" />
                                        {r.loading && <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-xs text-slate-300">regenerating…</div>}
                                    </div>
                                    {r.axis && <div className="text-[11px] font-medium text-slate-400">{r.axis}</div>}
                                    <details className="text-[10px] text-slate-500">
                                        <summary className="cursor-pointer">prompt</summary>
                                        <pre className="mt-1 whitespace-pre-wrap">{r.prompt}</pre>
                                    </details>
                                    <div className="flex items-center gap-2">
                                        <input
                                            value={r.steer}
                                            onChange={(e) => setRenditions((prev) => prev.map((x) => x.id === r.id ? { ...x, steer: e.target.value } : x))}
                                            placeholder="steer & regenerate…"
                                            className="flex-1 rounded border border-white/10 bg-black/30 px-2 py-1 text-[11px] text-slate-200"
                                        />
                                        <button type="button" onClick={() => regenerateTile(r.id)} disabled={r.loading}
                                            className="rounded bg-white/10 px-2 py-1 text-[11px] text-slate-200 hover:bg-white/20 disabled:opacity-40">↻</button>
                                        <a href={r.dataUrl} download={`flyer-${r.id}.png`} className="rounded bg-white/10 px-2 py-1 text-[11px] text-slate-200 hover:bg-white/20">↓</a>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
