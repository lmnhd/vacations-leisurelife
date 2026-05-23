'use client';

import { useCallback, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Image as ImageIcon, Loader2, Sparkles, Type } from 'lucide-react';
import { CampaignSelector } from '../media-generation/campaign-selector';

// ────────────────────────────────────────────────────────────────────────────
// /tests/canva-ads — P1 Creative Audition Room
//
// Purpose: pick a campaign, choose one or more formats, generate an
// AdCopySet via Copy Forge, and inspect the deterministic quality gate
// verdict before render, then hand the approved copy set to Templated.io in P3.
//
// See: .github/DOCS/Implementation/GROUP_STRATEGY/CAMPAIGN_MEDIA/
//      PHASE_2_MEDIA_GENERATION/CANVA_TEMPLATE_BASED_ADS/TEMPLATED_IO/MASTER_PLAN.md
// ────────────────────────────────────────────────────────────────────────────

const ALL_FORMATS = [
    { id: 'story_reel', label: 'Story / Reel', dims: '1080×1920' },
    { id: 'ig_square', label: 'IG Square', dims: '1080×1080' },
    { id: 'fb_google_display', label: 'FB / Google Display', dims: '1200×628' },
    { id: 'carousel', label: 'Carousel', dims: '1080×1080 × N' },
] as const;

type FormatId = (typeof ALL_FORMATS)[number]['id'];

interface SlotDescriptor {
    name: string;
    type: 'text' | 'image' | 'color';
    visualOrder: number;
    zone: string;
    maxChars?: number;
}

interface TemplateLayout {
    description: string;
    slotDescriptors: SlotDescriptor[];
}

interface ImageSlotDirective {
    assetType: string;
    narrativeRole: string;
    moodCue: string;
    preferTags?: string[];
}

interface SlotPack {
    compositionNote: string;
    headline: string;
    subhead?: string;
    microcopy?: string;
    cta: string;
    imageSlotDirectives: Record<string, ImageSlotDirective>;
}

interface AdCopySet {
    creativeTerritory?: string;
    compositionIntent: string;
    formats: Record<string, SlotPack | SlotPack[]>;
}

interface QualityCheck {
    key: string;
    passed: boolean;
    severity: 'blocker' | 'warning';
    message: string;
}

interface QualityGate {
    passed: boolean;
    blockerCount: number;
    warningCount: number;
    checks: QualityCheck[];
}

interface CopyForgeResponse {
    slug: string;
    visualFlavor: string;
    requestedFormats: FormatId[];
    supportedFormats: FormatId[];
    skippedFormats: FormatId[];
    availableImages: Record<string, number>;
    templateLayouts: Partial<Record<FormatId, TemplateLayout>>;
    templateRefs: Record<string, { templatedId: string; dimensions: { width: number; height: number } } | null>;
    copySet: AdCopySet;
    qualityGate: QualityGate;
    warnings: string[];
    modelId: string;
    regenerated: boolean;
    briefInputs: {
        avoidDirectives: string[];
        nicheSignals: string[];
        propFamilies: string[];
        cruiseNativeMoments: string[];
    };
}

interface TemplatedRenderResponsePage {
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

interface RenderImageSelection {
    slotName: string;
    assetId: string;
    assetType: string;
    sourceUrl: string;
    publicUrl: string;
    tags: string[];
    rehosted: boolean;
}

interface RenderPageArtifact {
    page: string;
    layers: Record<string, unknown>;
    selectedImages: RenderImageSelection[];
    render: TemplatedRenderResponsePage;
}

interface RenderTemplateRef {
    templatedId: string;
    templatedIdPrevious: string | null;
    dimensions: { width: number; height: number };
    layout: TemplateLayout;
    pages?: number;
}

interface RenderGroupResult {
    format: FormatId;
    templateRef: RenderTemplateRef;
    request: {
        template: string;
        format?: string;
        transparent?: boolean;
        async?: boolean;
        name?: string;
        external_id?: string;
        merge?: boolean;
        background?: string;
        width?: number;
        height?: number;
        scale?: number;
        layers?: Record<string, unknown>;
        pages?: Array<{ page: string; layers: Record<string, unknown>; width?: number; height?: number }>;
    };
    pages: RenderPageArtifact[];
    selectedImages: RenderImageSelection[];
}

interface RenderResponse {
    slug: string;
    visualFlavor: string;
    requestedFormats: FormatId[];
    supportedFormats: FormatId[];
    skippedFormats: FormatId[];
    renderGroups: RenderGroupResult[];
    qualityGate: QualityGate;
}

interface ErrorResponse {
    error: string;
    visualFlavor?: string;
    requestedFormats?: string[];
}

async function parseApiPayload<T>(res: Response): Promise<T | ErrorResponse> {
    const contentType = res.headers.get('content-type')?.toLowerCase() ?? '';

    if (contentType.includes('application/json')) {
        return (await res.json()) as T | ErrorResponse;
    }

    const raw = await res.text();
    const normalized = raw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const preview = normalized.slice(0, 240) || raw.slice(0, 240) || 'No response body.';
    return {
        error: `Server returned non-JSON (${res.status} ${res.statusText}). ${preview}`,
    };
}

const SEVERITY_STYLES: Record<'blocker' | 'warning', string> = {
    blocker: 'border-rose-500/30 bg-rose-500/10 text-rose-100',
    warning: 'border-amber-500/30 bg-amber-500/10 text-amber-100',
};

function isSlotPackArray(value: SlotPack | SlotPack[]): value is SlotPack[] {
    return Array.isArray(value);
}

export default function CanvaAdsPage() {
    const [slug, setSlug] = useState('');
    const [selectedFormats, setSelectedFormats] = useState<FormatId[]>(['story_reel']);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<CopyForgeResponse | null>(null);
    const [renderLoading, setRenderLoading] = useState(false);
    const [renderResult, setRenderResult] = useState<RenderResponse | null>(null);
    const [renderError, setRenderError] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [errorMeta, setErrorMeta] = useState<{ visualFlavor?: string } | null>(null);

    const toggleFormat = useCallback((id: FormatId) => {
        setSelectedFormats((prev) =>
            prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id],
        );
    }, []);

    const generate = useCallback(async () => {
        if (!slug.trim()) {
            setError('Pick a campaign before generating.');
            return;
        }
        if (selectedFormats.length === 0) {
            setError('Select at least one format.');
            return;
        }
        setLoading(true);
        setError(null);
        setErrorMeta(null);
        setResult(null);
        setRenderResult(null);
        setRenderError(null);
        try {
            const res = await fetch('/api/ads/copy-forge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ slug: slug.trim(), formats: selectedFormats }),
            });
            const data = await parseApiPayload<CopyForgeResponse>(res);
            if (!res.ok || 'error' in data) {
                const err = data as ErrorResponse;
                setError(err.error || `Request failed with status ${res.status}`);
                setErrorMeta(err.visualFlavor ? { visualFlavor: err.visualFlavor } : null);
                return;
            }
            setResult(data as CopyForgeResponse);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Network error');
        } finally {
            setLoading(false);
        }
    }, [slug, selectedFormats]);

    const render = useCallback(async () => {
        if (!result) return;
        if (!result.qualityGate.passed) {
            setRenderError('Copy Forge must pass the quality gate before rendering.');
            return;
        }

        setRenderLoading(true);
        setRenderError(null);
        try {
            const res = await fetch('/api/ads/render', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    slug: result.slug,
                    formats: result.supportedFormats,
                    copySet: result.copySet,
                }),
            });
            const data = await parseApiPayload<RenderResponse>(res);
            if (!res.ok || 'error' in data) {
                const err = data as ErrorResponse;
                setRenderError(err.error || `Render failed with status ${res.status}`);
                return;
            }
            setRenderResult(data as RenderResponse);
        } catch (e) {
            setRenderError(e instanceof Error ? e.message : 'Network error');
        } finally {
            setRenderLoading(false);
        }
    }, [result]);

    const recheck = useCallback(async () => {
        if (!result) return;
        setLoading(true);
        setRenderResult(null);
        setRenderError(null);
        try {
            const res = await fetch('/api/ads/copy-forge', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    slug: result.slug,
                    formats: result.supportedFormats,
                    copySet: result.copySet,
                }),
            });
            const data = await parseApiPayload<{ qualityGate?: QualityGate }>(res);
            if (res.ok && !('error' in data) && data.qualityGate) {
                setResult({ ...result, qualityGate: data.qualityGate });
            } else if ('error' in data) {
                setError(data.error);
            }
        } finally {
            setLoading(false);
        }
    }, [result]);

    const generateDisabled = loading || !slug.trim() || selectedFormats.length === 0;

    return (
        <div className="min-h-screen bg-slate-950 px-6 py-10 text-slate-200">
            <div className="mx-auto max-w-6xl space-y-6">
                <Header />

                <ControlPanel
                    slug={slug}
                    setSlug={setSlug}
                    selectedFormats={selectedFormats}
                    toggleFormat={toggleFormat}
                    onGenerate={generate}
                    onRecheck={result ? recheck : undefined}
                    loading={loading}
                    disabled={generateDisabled}
                />

                {error && (
                    <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-100">
                        <div className="flex items-start gap-3">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                            <div className="space-y-1">
                                <div className="font-semibold">Copy Forge failed</div>
                                <div>{error}</div>
                                {errorMeta?.visualFlavor && (
                                    <div className="text-xs text-rose-200/70">
                                        Resolved visual flavor: <code className="rounded bg-slate-900/60 px-1.5 py-0.5">{errorMeta.visualFlavor}</code>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {loading && !result && (
                    <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-6 text-sm text-slate-400">
                        <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                        Running Copy Forge — single structured LLM call + deterministic quality gate. ~10–25s.
                    </div>
                )}

                {result && (
                    <div className="space-y-6">
                        <RunSummary result={result} />
                        <QualityGatePanel gate={result.qualityGate} />
                        <CompositionIntent set={result.copySet} />
                        <RenderPanel
                            result={result}
                            renderResult={renderResult}
                            renderError={renderError}
                            renderLoading={renderLoading}
                            onRender={render}
                        />
                        {result.supportedFormats.map((format) => {
                            const pack = result.copySet.formats[format];
                            const layout = result.templateLayouts[format];
                            if (!pack || !layout) return null;
                            return (
                                <FormatPanel
                                    key={format}
                                    format={format}
                                    pack={pack}
                                    layout={layout}
                                    templateRef={result.templateRefs[format] ?? null}
                                />
                            );
                        })}
                        <RawJsonPanel result={result} />
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Subcomponents ───────────────────────────────────────────────────────────

function Header() {
    return (
        <div className="space-y-2">
            <div className="flex items-center gap-3">
                <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-2 text-cyan-200">
                    <Sparkles className="h-5 w-5" />
                </div>
                <div>
                    <h1 className="text-xl font-semibold text-slate-100">Canva Ads — Creative Audition</h1>
                    <p className="text-sm text-slate-400">
                        P1 surface: Copy Forge + deterministic quality gate, with a follow-on P3 render path for the approved set in Templated.io.
                    </p>
                </div>
            </div>
            <div className="rounded-xl border border-white/5 bg-slate-900/40 px-4 py-3 text-xs text-slate-400">
                Each request reads the approved aesthetic brief + dossier + manifest, asks a single structured LLM call
                to design a complete composition (intent → image arc → copy), then runs a deterministic rubric over the
                result. The page is a <em>creative audition room</em>, not just a generate button.
            </div>
        </div>
    );
}

function ControlPanel(props: {
    slug: string;
    setSlug: (s: string) => void;
    selectedFormats: FormatId[];
    toggleFormat: (id: FormatId) => void;
    onGenerate: () => void;
    onRecheck?: () => void;
    loading: boolean;
    disabled: boolean;
}) {
    return (
        <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-5 space-y-4">
            <div className="space-y-2">
                <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Campaign</label>
                <CampaignSelector value={props.slug} onChange={props.setSlug} disabled={props.loading} defaultFilter="designed" />
            </div>

            <div className="space-y-2">
                <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Formats</label>
                <div className="flex flex-wrap gap-2">
                    {ALL_FORMATS.map((fmt) => {
                        const active = props.selectedFormats.includes(fmt.id);
                        return (
                            <button
                                key={fmt.id}
                                type="button"
                                onClick={() => props.toggleFormat(fmt.id)}
                                disabled={props.loading}
                                className={`rounded-xl border px-3 py-2 text-left transition ${active
                                    ? 'border-cyan-400/60 bg-cyan-500/10 text-cyan-100'
                                    : 'border-white/10 bg-slate-900 text-slate-400 hover:text-slate-200'
                                    }`}
                            >
                                <div className="text-sm font-semibold">{fmt.label}</div>
                                <div className="text-[10px] uppercase tracking-widest text-slate-500">{fmt.dims}</div>
                            </button>
                        );
                    })}
                </div>
                <div className="text-[11px] text-slate-500">
                    Formats not yet registered for this campaign&apos;s visual flavor will be skipped silently.
                </div>
            </div>

            <div className="flex flex-wrap gap-3">
                <button
                    type="button"
                    onClick={props.onGenerate}
                    disabled={props.disabled}
                    className="inline-flex items-center gap-2 rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-100 transition hover:border-cyan-400/60 hover:bg-cyan-500/15 disabled:opacity-40"
                >
                    {props.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    Run Copy Forge
                </button>
                {props.onRecheck && (
                    <button
                        type="button"
                        onClick={props.onRecheck}
                        disabled={props.loading}
                        className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900 px-4 py-2 text-sm text-slate-300 transition hover:border-white/20 disabled:opacity-40"
                    >
                        Re-run quality gate only
                    </button>
                )}
            </div>
        </div>
    );
}

function RunSummary({ result }: { result: CopyForgeResponse }) {
    return (
        <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-5 space-y-3">
            <div className="grid gap-3 md:grid-cols-3">
                <Stat label="Visual flavor" value={result.visualFlavor} />
                <Stat label="Model" value={result.modelId} />
                <Stat label="Regenerated" value={result.regenerated ? 'yes (1 retry)' : 'no'} />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                    <div className="text-xs uppercase tracking-widest text-slate-500">Supported formats</div>
                    <div className="text-sm text-slate-200">{result.supportedFormats.join(', ') || '-'}</div>
                </div>
                <div className="space-y-1">
                    <div className="text-xs uppercase tracking-widest text-slate-500">Skipped (no template)</div>
                    <div className="text-sm text-slate-400">{result.skippedFormats.join(', ') || '-'}</div>
                </div>
            </div>
            <div className="space-y-1">
                <div className="text-xs uppercase tracking-widest text-slate-500">Available image pools</div>
                <div className="flex flex-wrap gap-2 text-xs">
                    {Object.entries(result.availableImages).map(([k, v]) => (
                        <span
                            key={k}
                            className={`rounded-full border px-2 py-0.5 ${v > 0 ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100' : 'border-white/10 bg-slate-900 text-slate-500'
                                }`}
                        >
                            {k}: {v}
                        </span>
                    ))}
                </div>
            </div>
            {result.warnings.length > 0 && (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-100">
                    <div className="mb-1 font-semibold uppercase tracking-widest">Warnings</div>
                    <ul className="list-disc space-y-0.5 pl-4">
                        {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
                    </ul>
                </div>
            )}
        </div>
    );
}

function Stat({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-xl border border-white/5 bg-slate-900 p-3">
            <div className="text-[10px] uppercase tracking-widest text-slate-500">{label}</div>
            <div className="mt-1 text-sm text-slate-200">{value}</div>
        </div>
    );
}

function QualityGatePanel({ gate }: { gate: QualityGate }) {
    const verdictClass = gate.passed
        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'
        : 'border-rose-500/30 bg-rose-500/10 text-rose-100';

    return (
        <div className={`rounded-2xl border p-5 ${verdictClass}`}>
            <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    {gate.passed
                        ? <CheckCircle2 className="h-5 w-5" />
                        : <AlertTriangle className="h-5 w-5" />}
                    <div className="text-sm font-semibold uppercase tracking-widest">
                        Quality gate - {gate.passed ? 'pass' : 'blocked'}
                    </div>
                </div>
                <div className="text-xs">
                    {gate.blockerCount} blocker{gate.blockerCount === 1 ? '' : 's'} | {gate.warningCount} warning{gate.warningCount === 1 ? '' : 's'}
                </div>
            </div>
            <div className="space-y-2">
                {gate.checks.map((c) => (
                    <div
                        key={c.key}
                        className={`rounded-xl border p-3 text-xs ${c.passed
                            ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-100'
                            : SEVERITY_STYLES[c.severity]
                            }`}
                    >
                        <div className="mb-0.5 flex items-center justify-between">
                            <span className="font-semibold uppercase tracking-widest">{c.key.replace(/_/g, ' ')}</span>
                            <span className="text-[10px] opacity-70">
                                {c.passed ? 'passed' : c.severity.toUpperCase()}
                            </span>
                        </div>
                        <div className="opacity-90">{c.message}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function CompositionIntent({ set }: { set: AdCopySet }) {
    return (
        <div className="rounded-2xl border border-purple-500/20 bg-purple-500/5 p-5">
            <div className="mb-1 text-xs uppercase tracking-widest text-purple-300">Composition intent</div>
            {set.creativeTerritory && (
                <div className="mb-2 text-[11px] text-purple-200/80">
                    Territory: <em>{set.creativeTerritory}</em>
                </div>
            )}
            <p className="text-sm leading-relaxed text-purple-50/90">{set.compositionIntent}</p>
        </div>
    );
}

function FormatPanel({
    format,
    pack,
    layout,
    templateRef,
}: {
    format: FormatId;
    pack: SlotPack | SlotPack[];
    layout: TemplateLayout;
    templateRef: { templatedId: string; dimensions: { width: number; height: number } } | null;
}) {
    const packs: SlotPack[] = isSlotPackArray(pack) ? pack : [pack];
    return (
        <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <div className="text-xs uppercase tracking-widest text-slate-500">Format</div>
                    <div className="text-lg font-semibold text-slate-100">{format}</div>
                    {templateRef && (
                        <div className="text-[11px] text-slate-500">
                            template <code className="rounded bg-slate-900 px-1.5 py-0.5">{templateRef.templatedId.slice(0, 8)}...</code>
                            {' | '}
                            {templateRef.dimensions.width} x {templateRef.dimensions.height}
                        </div>
                    )}
                </div>
                <div className="max-w-[40%] text-right text-[11px] text-slate-400">
                    <div className="uppercase tracking-widest text-slate-500">Layout</div>
                    <div className="leading-snug">{layout.description}</div>
                </div>
            </div>

            {packs.map((p, i) => (
                <div key={i} className="space-y-3 rounded-xl border border-white/5 bg-slate-950/50 p-4">
                    {packs.length > 1 && (
                        <div className="text-[11px] uppercase tracking-widest text-slate-500">Page {i + 1}</div>
                    )}
                    <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-100">
                        <div className="mb-0.5 font-semibold uppercase tracking-widest">Composition note</div>
                        <div>{p.compositionNote}</div>
                    </div>

                    <CopySlots pack={p} />
                    <ImageDirectiveSlots pack={p} layout={layout} />
                </div>
            ))}
        </div>
    );
}

function CopySlots({ pack }: { pack: SlotPack }) {
    return (
        <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-slate-500">
                <Type className="h-3.5 w-3.5" />
                Copy
            </div>
            <div className="grid gap-2 md:grid-cols-2">
                <CopyRow label={`Headline (${pack.headline.length}/50)`} value={pack.headline} />
                <CopyRow label={`CTA (${pack.cta.length}/20)`} value={pack.cta} />
                {pack.subhead && <CopyRow label={`Subhead (${pack.subhead.length}/80)`} value={pack.subhead} />}
                {pack.microcopy && <CopyRow label={`Microcopy (${pack.microcopy.length}/30)`} value={pack.microcopy} />}
            </div>
        </div>
    );
}

function CopyRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-lg border border-white/5 bg-slate-900 p-3">
            <div className="text-[10px] uppercase tracking-widest text-slate-500">{label}</div>
            <div className="mt-1 text-sm text-slate-100">{value}</div>
        </div>
    );
}

function ImageDirectiveSlots({ pack, layout }: { pack: SlotPack; layout: TemplateLayout }) {
    const slotOrder = layout.slotDescriptors
        .filter((s) => s.type === 'image')
        .sort((a, b) => a.visualOrder - b.visualOrder);
    if (slotOrder.length === 0) return null;

    return (
        <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-slate-500">
                <ImageIcon className="h-3.5 w-3.5" />
                Image directives
            </div>
            <div className="space-y-1.5">
                {slotOrder.map((slot) => {
                    const directive = pack.imageSlotDirectives[slot.name];
                    return (
                        <div key={slot.name} className="rounded-lg border border-white/5 bg-slate-900 p-3 text-xs">
                            <div className="flex items-center justify-between">
                                <span className="font-mono text-slate-300">{slot.name}</span>
                                <span className="text-[10px] uppercase tracking-widest text-slate-500">{slot.zone}</span>
                            </div>
                            {directive ? (
                                <div className="mt-1 space-y-0.5 text-slate-300">
                                    <div>
                                        <span className="text-slate-500">assetType:</span>{' '}
                                        <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-cyan-200">{directive.assetType}</span>
                                    </div>
                                    <div><span className="text-slate-500">role:</span> {directive.narrativeRole}</div>
                                    <div><span className="text-slate-500">mood:</span> {directive.moodCue}</div>
                                    {directive.preferTags && directive.preferTags.length > 0 && (
                                        <div>
                                            <span className="text-slate-500">tags:</span>{' '}
                                            {directive.preferTags.join(', ')}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="mt-1 text-rose-300">
                                    <AlertTriangle className="mr-1 inline h-3 w-3" />
                                    No directive returned for this slot - quality gate should have caught this.
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function RenderPanel({
    result,
    renderResult,
    renderError,
    renderLoading,
    onRender,
}: {
    result: CopyForgeResponse;
    renderResult: RenderResponse | null;
    renderError: string | null;
    renderLoading: boolean;
    onRender: () => void;
}) {
    return (
        <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <div className="text-xs uppercase tracking-widest text-cyan-300">P3 render</div>
                    <div className="text-sm text-cyan-50/90">
                        Send the approved copy set into Templated.io using the live manifest image selections.
                    </div>
                </div>
                <button
                    type="button"
                    onClick={onRender}
                    disabled={renderLoading || !result.qualityGate.passed}
                    className="inline-flex items-center gap-2 rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-100 transition hover:border-cyan-400/60 hover:bg-cyan-500/15 disabled:opacity-40"
                >
                    {renderLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    Render with Templated
                </button>
            </div>

            {renderError && (
                <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-100">
                    {renderError}
                </div>
            )}

            {renderResult ? (
                <div className="space-y-4">
                    <div className="grid gap-3 md:grid-cols-3">
                        <Stat label="Rendered slug" value={renderResult.slug} />
                        <Stat label="Visual flavor" value={renderResult.visualFlavor} />
                        <Stat label="Supported formats" value={renderResult.supportedFormats.join(', ') || '-'} />
                    </div>
                    {renderResult.renderGroups.map((group) => (
                        <div key={group.format} className="rounded-xl border border-white/10 bg-slate-950/50 p-4 space-y-4">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                    <div className="text-xs uppercase tracking-widest text-slate-500">Format</div>
                                    <div className="text-lg font-semibold text-slate-100">{group.format}</div>
                                    <div className="text-[11px] text-slate-500">
                                        template <code className="rounded bg-slate-900 px-1.5 py-0.5">{group.templateRef.templatedId.slice(0, 8)}...</code>
                                        {' | '}
                                        {group.templateRef.dimensions.width} x {group.templateRef.dimensions.height}
                                    </div>
                                </div>
                                <div className="text-right text-[11px] text-slate-400">
                                    <div className="uppercase tracking-widest text-slate-500">Templated request</div>
                                    <div>{group.request.external_id ?? '-'}</div>
                                    <div>{group.pages.length} page{group.pages.length === 1 ? '' : 's'}</div>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <div className="text-xs uppercase tracking-widest text-slate-500">Selected images</div>
                                <div className="flex flex-wrap gap-2 text-[11px] text-slate-300">
                                    {group.selectedImages.map((image) => (
                                        <span key={`${group.format}:${image.slotName}:${image.assetId}`} className="rounded-full border border-white/10 bg-slate-900 px-2 py-1">
                                            {`${image.slotName} -> ${image.assetId}${image.rehosted ? ' (rehosted)' : ''}`}
                                        </span>
                                    ))}
                                </div>
                            </div>

                            <div className="grid gap-4">
                                {group.pages.map((page) => (
                                    <div key={page.page} className="rounded-xl border border-white/5 bg-slate-900 p-3 space-y-3">
                                        <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
                                            <span className="uppercase tracking-widest">{page.page}</span>
                                            <span>{page.render.width} x {page.render.height} | {page.render.format}</span>
                                        </div>
                                        <a
                                            href={page.render.url}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="block overflow-hidden rounded-lg border border-white/10 bg-slate-950"
                                        >
                                            <img
                                                src={page.render.url}
                                                alt={`${group.format} ${page.page}`}
                                                className="h-auto w-full object-contain"
                                            />
                                        </a>
                                        <div className="grid gap-2 text-[11px] text-slate-400 md:grid-cols-2">
                                            <div>
                                                <div className="uppercase tracking-widest text-slate-500">Render URL</div>
                                                <a href={page.render.url} target="_blank" rel="noreferrer" className="break-all text-cyan-200 hover:text-cyan-100">
                                                    {page.render.url}
                                                </a>
                                            </div>
                                            <div>
                                                <div className="uppercase tracking-widest text-slate-500">Status</div>
                                                <div>{page.render.status ?? 'complete'}</div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="text-sm text-slate-400">
                    Render the approved copy set to see real Templated output and manifest-backed image resolution here.
                </div>
            )}
        </div>
    );
}

function RawJsonPanel({ result }: { result: CopyForgeResponse }) {
    const [open, setOpen] = useState(false);
    const json = useMemo(() => JSON.stringify(result, null, 2), [result]);
    return (
        <div className="rounded-2xl border border-white/10 bg-slate-900/40">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="flex w-full items-center justify-between px-5 py-3 text-xs uppercase tracking-widest text-slate-400 hover:text-slate-200"
            >
                <span>Raw response JSON</span>
                <span>{open ? 'hide' : 'show'}</span>
            </button>
            {open && (
                <pre className="max-h-[60vh] overflow-auto border-t border-white/5 px-5 py-4 text-[11px] text-slate-300">
                    {json}
                </pre>
            )}
        </div>
    );
}
