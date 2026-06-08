"use client";

// MULTI_MODEL_IMAGES (Phase F): Image Models controls — the shared active-image-
// backends selector governing the NON-flyer generated sections (hero/concepts,
// documentary details, scenes). Persisted to manifest.imageModelControls.models;
// read by the media orchestrator. Unset/empty ⇒ primary backend only (single-
// model). Flyers keep their own independent toggle in the Flyer Controls tab.

import { useCallback, useEffect, useState } from "react";
import { Loader2, RotateCcw, Save } from "lucide-react";
import { IMAGE_BACKEND_META, PRIMARY_IMAGE_BACKEND_ID } from "@/lib/campaigns/media/generators/image-backend-meta";

interface BackendAvailability { id: string; label: string; available: boolean; }

const SECTION_LABELS = "Hero · Concepts · Documentary · Scenes";

export function ImageModelControlsBody({ slug }: { slug: string }) {
    const [models, setModels] = useState<string[]>([PRIMARY_IMAGE_BACKEND_ID]);
    const [backendAvailability, setBackendAvailability] = useState<BackendAvailability[]>([]);
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
            const res = await fetch(`/api/groups/campaign/${s}/media/image-model-controls`, { cache: "no-store" });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
            setModels(Array.isArray(data.models) && data.models.length ? data.models : [PRIMARY_IMAGE_BACKEND_ID]);
            setBackendAvailability(Array.isArray(data.backendAvailability) ? data.backendAvailability : []);
            setUsingDefaults(Boolean(data.usingDefaults));
            setHasManifest(Boolean(data.hasManifest));
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
            setModels([PRIMARY_IMAGE_BACKEND_ID]);
            setBackendAvailability([]);
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
            const res = await fetch(`/api/groups/campaign/${slug}/media/image-model-controls`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ models: models.length ? models : [PRIMARY_IMAGE_BACKEND_ID] }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
            setUsingDefaults(false);
            setStatus("Saved — the next hero/concept/documentary/scene generation will use these models.");
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setSaving(false);
        }
    }, [slug, models]);

    const resetDefaults = () => {
        setModels([PRIMARY_IMAGE_BACKEND_ID]);
        setStatus("Reset to primary model only (not yet saved).");
    };

    const modelCount = models.length || 1;
    const availableMap = new Map(backendAvailability.map((backend) => [backend.id, backend.available]));
    const unavailableSelected = backendAvailability.filter((backend) => models.includes(backend.id) && !backend.available);

    return (
        <div className="space-y-4 px-4 py-3">
            <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] text-slate-500">
                    Image models for the non-flyer sections — <span className="text-slate-300">{SECTION_LABELS}</span>.
                    Pick one or both to A/B.
                </p>
                <span className="flex items-center gap-2 text-[10px] text-slate-500 whitespace-nowrap">
                    {loading && <Loader2 className="h-3 w-3 animate-spin" />}
                    {usingDefaults ? "using defaults" : "custom"}
                </span>
            </div>

            {!hasManifest && (
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300">
                    No manifest yet — generate media once (defaults will apply), then return here to tune and save.
                </div>
            )}

            <div className="space-y-2">
                <div className="text-[10px] uppercase tracking-widest text-slate-400">
                    Image Models <span className="text-slate-600">· {modelCount} model{modelCount === 1 ? '' : 's'} per logical image</span>
                </div>
                <div className="flex flex-wrap gap-2">
                    {IMAGE_BACKEND_META.map((m) => {
                        const checked = models.includes(m.id);
                        const isPrimary = m.id === PRIMARY_IMAGE_BACKEND_ID;
                        const isAvailable = availableMap.get(m.id) !== false;
                        return (
                            <button
                                key={m.id}
                                type="button"
                                onClick={() => setModels((prev) => prev.includes(m.id) ? prev.filter((x) => x !== m.id) : [...prev, m.id])}
                                title={isPrimary ? 'Primary backend' : undefined}
                                className={`rounded-full border px-3 py-1 text-[11px] transition ${checked
                                    ? 'border-violet-500/40 bg-violet-500/15 text-violet-200'
                                    : 'border-white/10 text-slate-500 hover:text-slate-300'}`}>
                                {checked ? '✓ ' : ''}{m.label}{isPrimary ? ' (primary)' : ''}{isAvailable ? '' : ' (unavailable)'}
                            </button>
                        );
                    })}
                </div>
                {backendAvailability.length > 0 && unavailableSelected.length > 0 && (
                    <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
                        {unavailableSelected.map((backend) => backend.label).join(', ')} is selected here, but it is not available in
                        this environment, so the pipeline can only render the available backend(s).
                    </div>
                )}
                <p className="text-[11px] text-slate-500">
                    Reference-grounded sections (hero, scenes) ground the <span className="text-slate-300">Gemini</span> version on the
                    ship reference; the <span className="text-slate-300">OpenAI</span> version is text-only (gpt-image-2 has no reference
                    input). More models = proportionally more cost/time.
                </p>
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
                    {saving ? "Saving…" : "Save Models"}
                </button>
                <button type="button" onClick={resetDefaults}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] text-slate-300 hover:bg-white/10 transition">
                    <RotateCcw className="h-3.5 w-3.5" />
                    Reset to Primary
                </button>
            </div>
        </div>
    );
}
