"use client";

// Flyer Generation Controls — edit the negation rules + variation axes that the
// production pipeline uses when generating flyer_image assets for this campaign.
// Persisted to manifest.flyerControls; read by the media orchestrator. Falls back
// to the finalized code defaults (DEFAULT_FLYER_*) when nothing is saved.

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, RotateCcw, Save, Sparkles, X } from "lucide-react";
import {
    DEFAULT_FLYER_NEGATIONS,
    DEFAULT_FLYER_VARIATION_AXES,
} from "@/lib/campaigns/media/generators/flyer-prompt";
import { IMAGE_BACKEND_META, PRIMARY_IMAGE_BACKEND_ID } from "@/lib/campaigns/media/generators/image-backend-meta";

interface Row { id: string; text: string; }

let _seq = 0;
const nextId = () => `fc${++_seq}`;
const toRows = (texts: string[]): Row[] => texts.map((t) => ({ id: nextId(), text: t }));

function RuleList({ rows, setRows, placeholder }: {
    rows: Row[];
    setRows: React.Dispatch<React.SetStateAction<Row[]>>;
    placeholder: string;
}) {
    return (
        <div className="space-y-1.5">
            {rows.map((r) => (
                <div key={r.id} className="flex items-start gap-2">
                    <textarea
                        value={r.text}
                        onChange={(e) => setRows((prev) => prev.map((x) => x.id === r.id ? { ...x, text: e.target.value } : x))}
                        placeholder={placeholder}
                        rows={1}
                        className="flex-1 resize-y rounded-lg border border-white/10 bg-slate-950 px-2.5 py-1.5 text-[11px] leading-snug text-slate-200 focus:outline-none focus:border-fuchsia-500/40"
                    />
                    <button type="button" onClick={() => setRows((prev) => prev.filter((x) => x.id !== r.id))}
                        className="mt-1.5 px-1 text-slate-600 hover:text-red-400" title="Remove">
                        <X className="h-3.5 w-3.5" />
                    </button>
                </div>
            ))}
            <button type="button" onClick={() => setRows((prev) => [...prev, { id: nextId(), text: "" }])}
                className="inline-flex items-center gap-1 rounded-lg border border-dashed border-white/15 px-2 py-1 text-[11px] text-slate-400 hover:text-slate-200">
                <Plus className="h-3 w-3" /> add
            </button>
        </div>
    );
}

export function FlyerControlsEditor({ slug }: { slug: string }) {
    const [negations, setNegations] = useState<Row[]>([]);
    const [axes, setAxes] = useState<Row[]>([]);
    const [models, setModels] = useState<string[]>([PRIMARY_IMAGE_BACKEND_ID]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [usingDefaults, setUsingDefaults] = useState(true);
    const [hasManifest, setHasManifest] = useState(true);
    const [status, setStatus] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async (s: string) => {
        if (!s) return;
        setLoading(true);
        setError(null);
        setStatus(null);
        try {
            const res = await fetch(`/api/groups/campaign/${s}/media/flyer-controls`, { cache: "no-store" });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
            setNegations(toRows(data.negations ?? DEFAULT_FLYER_NEGATIONS));
            setAxes(toRows(data.axes ?? DEFAULT_FLYER_VARIATION_AXES));
            setModels(Array.isArray(data.models) && data.models.length ? data.models : [PRIMARY_IMAGE_BACKEND_ID]);
            setUsingDefaults(Boolean(data.usingDefaults));
            setHasManifest(Boolean(data.hasManifest));
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
            setNegations(toRows(DEFAULT_FLYER_NEGATIONS));
            setAxes(toRows(DEFAULT_FLYER_VARIATION_AXES));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void load(slug); }, [slug, load]);

    const save = useCallback(async () => {
        setSaving(true);
        setError(null);
        setStatus(null);
        try {
            const res = await fetch(`/api/groups/campaign/${slug}/media/flyer-controls`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    negations: negations.map((r) => r.text.trim()).filter(Boolean),
                    axes: axes.map((r) => r.text.trim()).filter(Boolean),
                    models: models.length ? models : [PRIMARY_IMAGE_BACKEND_ID],
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
            setUsingDefaults(false);
            setStatus("Saved — the next flyer generation for this campaign will use these rules.");
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setSaving(false);
        }
    }, [slug, negations, axes]);

    const resetDefaults = () => {
        setNegations(toRows(DEFAULT_FLYER_NEGATIONS));
        setAxes(toRows(DEFAULT_FLYER_VARIATION_AXES));
        setModels([PRIMARY_IMAGE_BACKEND_ID]);
        setStatus("Reset to defaults (not yet saved).");
    };

    const axisCount = axes.filter((r) => r.text.trim()).length;
    const modelCount = models.length || 1;

    return (
        <details className="border border-white/10 rounded-xl bg-slate-900/50">
            <summary className="flex cursor-pointer select-none items-center justify-between gap-2 px-4 py-3 list-none">
                <span className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-violet-400">
                    <Sparkles className="h-3.5 w-3.5" />
                    Flyer Generation Controls
                </span>
                <span className="flex items-center gap-2 text-[10px] text-slate-500">
                    {loading && <Loader2 className="h-3 w-3 animate-spin" />}
                    {usingDefaults ? "using defaults" : "custom"}
                    <span className="text-slate-600">· {axisCount} renditions</span>
                </span>
            </summary>

            <div className="space-y-4 border-t border-white/5 px-4 py-3">
                <p className="text-[11px] text-slate-500">
                    These steer the production flyer prompt for <span className="text-slate-300">{slug || "this campaign"}</span>.
                    The pipeline generates one flyer per variation axis. Saved rules are used by both the Flyers
                    category button and Generate All. Leave on defaults to use the finalized rule set.
                </p>

                {!hasManifest && (
                    <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300">
                        No manifest yet — generate media once (defaults will apply), then return here to tune and save.
                    </div>
                )}

                <div className="space-y-2">
                    <div className="text-[10px] uppercase tracking-widest text-slate-400">
                        Image Models <span className="text-slate-600">· {modelCount} model{modelCount === 1 ? '' : 's'} × {axisCount} axes = {modelCount * axisCount} images/run</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {IMAGE_BACKEND_META.map((m) => {
                            const checked = models.includes(m.id);
                            const isPrimary = m.id === PRIMARY_IMAGE_BACKEND_ID;
                            return (
                                <button key={m.id} type="button" disabled={isPrimary}
                                    onClick={() => setModels((prev) => prev.includes(m.id) ? prev.filter((x) => x !== m.id) : [...prev, m.id])}
                                    title={isPrimary ? 'Primary backend — always on' : undefined}
                                    className={`rounded-full border px-3 py-1 text-[11px] transition ${checked
                                        ? 'border-violet-500/40 bg-violet-500/15 text-violet-200'
                                        : 'border-white/10 text-slate-500 hover:text-slate-300'} ${isPrimary ? 'opacity-80 cursor-default' : ''}`}>
                                    {checked ? '✓ ' : ''}{m.label}{isPrimary ? ' (primary)' : ''}
                                </button>
                            );
                        })}
                    </div>
                    <p className="text-[11px] text-slate-500">
                        Enable a second model to generate the same prompt across both — you can switch each item&apos;s
                        viewed version with the per-image source toggle. More models = proportionally more cost/time.
                    </p>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                    <div className="space-y-2">
                        <div className="text-[10px] uppercase tracking-widest text-slate-400">Negation Rules</div>
                        <RuleList rows={negations} setRows={setNegations} placeholder="thing to avoid…" />
                    </div>
                    <div className="space-y-2">
                        <div className="text-[10px] uppercase tracking-widest text-slate-400">
                            Variation Axes <span className="text-slate-600">· {axisCount} renditions</span>
                        </div>
                        <RuleList rows={axes} setRows={setAxes} placeholder="rendition direction…" />
                    </div>
                </div>

                {error && (
                    <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-[11px] text-red-300">{error}</div>
                )}
                {status && !error && (
                    <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-300">{status}</div>
                )}

                <div className="flex items-center gap-2">
                    <button type="button" onClick={() => void save()} disabled={saving || !hasManifest || !slug}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-violet-500/40 bg-violet-500/15 px-3 py-1.5 text-[11px] font-medium text-violet-200 hover:bg-violet-500/25 transition disabled:opacity-40">
                        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                        {saving ? "Saving…" : "Save Controls"}
                    </button>
                    <button type="button" onClick={resetDefaults}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] text-slate-300 hover:bg-white/10 transition">
                        <RotateCcw className="h-3.5 w-3.5" />
                        Reset to Defaults
                    </button>
                </div>
            </div>
        </details>
    );
}
