'use client';

// /tests/flyer-lab — Flyer-Image Sandbox
//
// Generate flyer images from any campaign slug and weed out the negation rules
// one by one. Nothing here is persisted — when the rule set feels right, use
// "Copy DEFAULT_FLYER_NEGATIONS" and paste it into flyer-prompt.ts.
// (FLYER-IMAGE-REFACTOR plan, Phase 1.)

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { CampaignSelector } from '../media-generation/campaign-selector';
import {
    buildFlyerPrompt,
    deriveBriefAnchors,
    DEFAULT_FLYER_BASE_TEMPLATE,
    DEFAULT_FLYER_NEGATIONS,
    DEFAULT_FLYER_VARIATION_AXES,
    type FlyerBriefLike,
} from '@/lib/campaigns/media/generators/flyer-prompt';
import { IMAGE_BACKEND_META, PRIMARY_IMAGE_BACKEND_ID, imageBackendLabel } from '@/lib/campaigns/media/generators/image-backend-meta';
import type { GeneratorService } from '@/lib/campaigns/schema';

const DEFAULT_SLUG = 'glass-observatory-winter-sea-watchers';
const LAST_SLUG_STORAGE_KEY = 'flyer-lab:last-slug';
const LEGACY_BASE_PROMPT_STORAGE_KEY = 'flyer-lab:base-prompt-template';
const CAMPAIGN_SETTINGS_STORAGE_PREFIX = 'flyer-lab:campaign-settings:';
const DEFAULT_FALLBACK_COUNT = 4;

interface Row { id: string; text: string; enabled: boolean; }
interface AnchorRow extends Row { label: string; }
interface RenditionVariant { generator: GeneratorService; dataUrl: string; }
interface Rendition { id: string; axis: string | null; prompt: string; variants: RenditionVariant[]; selectedGenerator: GeneratorService; steer: string; loading: boolean; committing?: boolean; committed?: string; }
interface ExistingFlyer { assetId: string; url: string; variantGroupId?: string; generator?: string }
interface StoredRow { text: string; enabled: boolean; }
interface StoredAnchor { text: string; enabled: boolean; }
interface LightboxImage {
    src: string;
    alt: string;
    label?: string;
}
interface FlyerLabCampaignSettings {
    basePromptTemplate?: string;
    negations?: StoredRow[];
    axes?: StoredRow[];
    talkingPoints?: StoredRow[];
    talkingPointsEnabled?: boolean;
    selectedModels?: string[];
    fallbackCount?: number;
    anchors?: StoredAnchor[];
    updatedAt?: number;
}
interface SavedCampaignState {
    slug: string;
    settings: FlyerLabCampaignSettings;
}

let _idn = 0;
const nextId = () => `r${++_idn}`;
const toRows = (texts: string[]): Row[] => texts.map((t) => ({ id: nextId(), text: t, enabled: true }));
const toStoredRows = (rows: Row[]): StoredRow[] => rows
    .map((r) => ({ text: r.text, enabled: r.enabled }))
    .filter((r) => r.text.trim());
const toRowsFromStored = (stored: StoredRow[] | undefined, fallbackTexts: string[]): Row[] => {
    const source = stored?.length ? stored : fallbackTexts.map((text) => ({ text, enabled: true }));
    return source.map((r) => ({ id: nextId(), text: r.text, enabled: r.enabled }));
};
const getCampaignSettingsStorageKey = (targetSlug: string) =>
    `${CAMPAIGN_SETTINGS_STORAGE_PREFIX}${encodeURIComponent(targetSlug.trim())}`;
const validModelIds = new Set<string>(IMAGE_BACKEND_META.map((backend) => backend.id));
const sanitizeSelectedModels = (value: unknown): GeneratorService[] => {
    if (!Array.isArray(value)) return [PRIMARY_IMAGE_BACKEND_ID];
    const models = value.filter((model): model is GeneratorService =>
        typeof model === 'string' && validModelIds.has(model),
    );
    return models.length ? models : [PRIMARY_IMAGE_BACKEND_ID];
};
const readCampaignSettings = (targetSlug: string): FlyerLabCampaignSettings | null => {
    try {
        const raw = window.localStorage.getItem(getCampaignSettingsStorageKey(targetSlug));
        if (!raw) return null;
        const parsed = JSON.parse(raw) as FlyerLabCampaignSettings;
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
        return null;
    }
};
const listSavedCampaignSettings = (): SavedCampaignState[] => {
    try {
        const saved: SavedCampaignState[] = [];
        for (let index = 0; index < window.localStorage.length; index += 1) {
            const key = window.localStorage.key(index);
            if (!key || !key.startsWith(CAMPAIGN_SETTINGS_STORAGE_PREFIX)) continue;
            const slug = decodeURIComponent(key.slice(CAMPAIGN_SETTINGS_STORAGE_PREFIX.length));
            const settings = readCampaignSettings(slug);
            if (!slug || !settings) continue;
            saved.push({ slug, settings });
        }
        return saved.sort((left, right) => (right.settings.updatedAt ?? 0) - (left.settings.updatedAt ?? 0) || left.slug.localeCompare(right.slug));
    } catch {
        return [];
    }
};

function CollapsibleSection({
    title,
    meta,
    children,
    defaultOpen = true,
    className = '',
}: {
    title: string;
    meta?: string;
    children: ReactNode;
    defaultOpen?: boolean;
    className?: string;
}) {
    return (
        <section className={className}>
            <details open={defaultOpen} className="group rounded border border-white/10 bg-white/[0.015] p-3">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-bold uppercase tracking-widest text-slate-400">
                    <span>{title}{meta && <span className="text-slate-600"> - {meta}</span>}</span>
                    <span className="text-slate-600 transition group-open:rotate-90">›</span>
                </summary>
                <div className="mt-3">{children}</div>
            </details>
        </section>
    );
}

export default function FlyerLabPage() {
    const [slug, setSlug] = useState(DEFAULT_SLUG);
    const [slugReady, setSlugReady] = useState(false);
    const [basePromptTemplate, setBasePromptTemplate] = useState(DEFAULT_FLYER_BASE_TEMPLATE);
    const [negations, setNegations] = useState<Row[]>(() => toRows(DEFAULT_FLYER_NEGATIONS));
    const [axes, setAxes] = useState<Row[]>(() => toRows(DEFAULT_FLYER_VARIATION_AXES));
    const [talkingPoints, setTalkingPoints] = useState<Row[]>([]);
    const [talkingPointsEnabled, setTalkingPointsEnabled] = useState(true);
    const [talkingPointDraft, setTalkingPointDraft] = useState('');
    const [generatingTalkingPoints, setGeneratingTalkingPoints] = useState(false);
    const [anchors, setAnchors] = useState<AnchorRow[]>([]);
    const [selectedModels, setSelectedModels] = useState<GeneratorService[]>([PRIMARY_IMAGE_BACKEND_ID]);
    const [fallbackCount, setFallbackCount] = useState(DEFAULT_FALLBACK_COUNT);
    const [settingsLoadedForSlug, setSettingsLoadedForSlug] = useState<string | null>(null);
    const [renditions, setRenditions] = useState<Rendition[]>([]);
    const [generating, setGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [warnings, setWarnings] = useState<string[]>([]);
    const [briefStatus, setBriefStatus] = useState<'idle' | 'loading' | 'ok' | 'none'>('idle');
    const [copied, setCopied] = useState(false);
    const [existingFlyers, setExistingFlyers] = useState<ExistingFlyer[]>([]);
    const [removingId, setRemovingId] = useState<string | null>(null);
    const [lightboxImage, setLightboxImage] = useState<LightboxImage | null>(null);
    const [savedCampaignStates, setSavedCampaignStates] = useState<SavedCampaignState[]>([]);

    useEffect(() => {
        try {
            const storedSlug = window.localStorage.getItem(LAST_SLUG_STORAGE_KEY);
            if (storedSlug && storedSlug.trim()) {
                setSlug(storedSlug.trim());
            }
        } catch {
            // Ignore storage access failures and fall back to the default slug.
        } finally {
            setSlugReady(true);
        }
    }, []);

    useEffect(() => {
        if (!slugReady) return;
        try {
            window.localStorage.setItem(LAST_SLUG_STORAGE_KEY, slug);
        } catch {
            // Ignore persistence failures in private mode or storage-restricted contexts.
        }
    }, [slug, slugReady]);

    useEffect(() => {
        if (!lightboxImage) return;

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setLightboxImage(null);
            }
        };

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        window.addEventListener('keydown', onKeyDown);

        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener('keydown', onKeyDown);
        };
    }, [lightboxImage]);

    const refreshSavedCampaignStates = useCallback(() => {
        if (typeof window === 'undefined') return;
        setSavedCampaignStates(listSavedCampaignSettings());
    }, []);

    useEffect(() => {
        if (!slugReady) return;
        const trimmedSlug = slug.trim();
        setSettingsLoadedForSlug(null);
        const savedSettings = trimmedSlug ? readCampaignSettings(trimmedSlug) : null;
        const legacyBasePrompt = (() => {
            try {
                return window.localStorage.getItem(LEGACY_BASE_PROMPT_STORAGE_KEY);
            } catch {
                return null;
            }
        })();

        setBasePromptTemplate(savedSettings?.basePromptTemplate?.trim() || legacyBasePrompt?.trim() || DEFAULT_FLYER_BASE_TEMPLATE);
        setNegations(toRowsFromStored(savedSettings?.negations, DEFAULT_FLYER_NEGATIONS));
        setAxes(toRowsFromStored(savedSettings?.axes, DEFAULT_FLYER_VARIATION_AXES));
        setTalkingPoints(toRowsFromStored(savedSettings?.talkingPoints, []));
        setTalkingPointsEnabled(savedSettings?.talkingPointsEnabled ?? true);
        setTalkingPointDraft('');
        setSelectedModels(sanitizeSelectedModels(savedSettings?.selectedModels));
        setFallbackCount(typeof savedSettings?.fallbackCount === 'number'
            ? Math.max(1, Math.min(8, Math.floor(savedSettings.fallbackCount)))
            : DEFAULT_FALLBACK_COUNT);
        setAnchors([]);
        setRenditions([]);
        setWarnings([]);
        setError(null);
        setSettingsLoadedForSlug(trimmedSlug || null);
        refreshSavedCampaignStates();
    }, [slug, slugReady, refreshSavedCampaignStates]);

    useEffect(() => {
        const trimmedSlug = slug.trim();
        if (!slugReady || settingsLoadedForSlug !== trimmedSlug || !trimmedSlug) return;
        try {
            const existingSettings = readCampaignSettings(trimmedSlug);
            const settings: FlyerLabCampaignSettings = {
                basePromptTemplate,
                negations: toStoredRows(negations),
                axes: toStoredRows(axes),
                talkingPoints: toStoredRows(talkingPoints),
                talkingPointsEnabled,
                selectedModels,
                fallbackCount,
                anchors: anchors.length
                    ? anchors.map((a) => ({ text: a.text, enabled: a.enabled }))
                    : existingSettings?.anchors,
                updatedAt: Date.now(),
            };
            window.localStorage.setItem(getCampaignSettingsStorageKey(trimmedSlug), JSON.stringify(settings));
            refreshSavedCampaignStates();
        } catch {
            // Ignore persistence failures in private mode or storage-restricted contexts.
        }
    }, [slug, slugReady, settingsLoadedForSlug, basePromptTemplate, negations, axes, talkingPoints, talkingPointsEnabled, selectedModels, fallbackCount, anchors, refreshSavedCampaignStates]);

    // Load the campaign's current flyer_image assets so the operator can replace
    // a specific one (or just see what already exists in the manifest).
    const loadFlyers = useCallback(async (s: string) => {
        if (!s.trim()) { setExistingFlyers([]); return; }
        try {
            const res = await fetch(`/api/groups/campaign/${s}/media/manifest?t=${Date.now()}`, { cache: 'no-store' });
            if (!res.ok) { setExistingFlyers([]); return; }
            const m = await res.json() as { images?: { flyerImages?: Array<{ assetId: string; url: string; active?: boolean; variantGroupId?: string; generator?: string }> } };
            setExistingFlyers((m.images?.flyerImages ?? [])
                .filter((f) => f.assetId && f.url && f.active !== false)
                .map((f) => ({ assetId: f.assetId, url: f.url, variantGroupId: f.variantGroupId, generator: f.generator })));
        } catch {
            setExistingFlyers([]);
        }
    }, []);

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
            const savedAnchors = readCampaignSettings(s)?.anchors ?? [];
            setAnchors(derived.map((a) => {
                const saved = savedAnchors.find((entry) => entry.text === a.text);
                return { id: nextId(), label: a.label, text: a.text, enabled: saved?.enabled ?? true };
            }));
            setBriefStatus(derived.length ? 'ok' : 'none');
        } catch {
            setAnchors([]); setBriefStatus('none');
        }
    }, []);

    useEffect(() => {
        if (!slugReady) return;
        void loadBrief(slug);
        void loadFlyers(slug);
    }, [slug, slugReady, loadBrief, loadFlyers]);

    // Persist a generated rendition into the real manifest. 'add' creates a new
    // flyer; 'assign' sets it as the chosen model-version (generator) of an
    // existing flyer's variant group — that's how it lands in the GPT Image 2 slot.
    const commit = useCallback(async (renditionId: string, mode: 'add' | 'assign', targetAssetId?: string) => {
        const tile = renditions.find((r) => r.id === renditionId);
        if (!tile || !slug.trim()) return;
        const selectedVariant = tile.variants.find((v) => v.generator === tile.selectedGenerator) ?? tile.variants[0];
        if (!selectedVariant) {
            setError('This rendition has no generated model output to save.');
            return;
        }
        setRenditions((prev) => prev.map((r) => r.id === renditionId ? { ...r, committing: true, committed: undefined } : r));
        try {
            const res = await fetch('/api/ads/flyer-lab/commit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ slug, dataUrl: selectedVariant.dataUrl, prompt: tile.prompt, mode, generator: selectedVariant.generator, targetAssetId }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
            await loadFlyers(slug);
            const modelLabel = imageBackendLabel(data.asset?.generator ?? selectedVariant.generator);
            setRenditions((prev) => prev.map((r) => r.id === renditionId
                ? { ...r, committing: false, committed: mode === 'add' ? `Added as ${modelLabel} ✓` : `Assigned as ${modelLabel} ✓` }
                : r));
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
            setRenditions((prev) => prev.map((r) => r.id === renditionId ? { ...r, committing: false } : r));
        }
    }, [renditions, slug, loadFlyers]);

    const removeExistingFlyer = useCallback(async (assetId: string) => {
        if (!slug.trim() || !window.confirm(`Remove flyer ${assetId} from the manifest?`)) return;
        setRemovingId(assetId);
        try {
            const res = await fetch(`/api/groups/campaign/${slug}/media/manifest/image-artifact`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ assetId }),
            });
            if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? `HTTP ${res.status}`); }
            await loadFlyers(slug);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setRemovingId(null);
        }
    }, [slug, loadFlyers]);

    const enabledNegations = useMemo(() => negations.filter((r) => r.enabled && r.text.trim()).map((r) => r.text.trim()), [negations]);
    const enabledAxes = useMemo(() => axes.filter((r) => r.enabled && r.text.trim()).map((r) => r.text.trim()), [axes]);
    const enabledTalkingPoints = useMemo(() => {
        if (!talkingPointsEnabled) return [];
        return talkingPoints.filter((r) => r.enabled && r.text.trim()).map((r) => r.text.trim());
    }, [talkingPoints, talkingPointsEnabled]);
    const enabledAnchors = useMemo(() => anchors.filter((r) => r.enabled && r.text.trim()).map((r) => r.text.trim()), [anchors]);
    const reusableCampaignStates = useMemo(
        () => savedCampaignStates.filter((entry) => entry.slug !== slug.trim()),
        [savedCampaignStates, slug],
    );
    const reusableBasePromptStates = useMemo(
        () => reusableCampaignStates.filter((entry) => entry.settings.basePromptTemplate?.trim()),
        [reusableCampaignStates],
    );

    // Representative prompt (uses the first enabled axis) so you see exactly what
    // is sent before spending a generation.
    const previewPrompt = useMemo(() => buildFlyerPrompt(slug, {
        basePromptTemplate,
        anchors: enabledAnchors,
        talkingPoints: enabledTalkingPoints,
        axis: enabledAxes[0],
        negations: enabledNegations,
    }), [slug, basePromptTemplate, enabledAnchors, enabledTalkingPoints, enabledAxes, enabledNegations]);

    const renditionCount = enabledAxes.length || fallbackCount;
    const modelCount = selectedModels.length || 1;
    const generatedImageCount = renditionCount * modelCount;

    const generate = useCallback(async () => {
        setGenerating(true);
        setError(null);
        setWarnings([]);
        try {
            const res = await fetch('/api/ads/flyer-lab/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    slug,
                    basePromptTemplate,
                    negations: enabledNegations,
                    anchors: enabledAnchors,
                    talkingPoints: enabledTalkingPoints,
                    axes: enabledAxes,
                    count: enabledAxes.length ? undefined : fallbackCount,
                    models: selectedModels.length ? selectedModels : [PRIMARY_IMAGE_BACKEND_ID],
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
            setWarnings(Array.isArray(data.warnings) ? data.warnings.filter((w: unknown): w is string => typeof w === 'string') : []);
            setRenditions((data.renditions as Array<{ axis: string | null; prompt: string; variants: RenditionVariant[] }>).map((r) => {
                const variants = Array.isArray(r.variants) ? r.variants : [];
                const selectedGenerator = variants.find((v) => v.generator === selectedModels[0])?.generator ?? variants[0]?.generator ?? PRIMARY_IMAGE_BACKEND_ID;
                return {
                    id: nextId(), axis: r.axis, prompt: r.prompt, variants, selectedGenerator, steer: '', loading: false,
                };
            }));
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setGenerating(false);
        }
    }, [slug, basePromptTemplate, enabledNegations, enabledAnchors, enabledTalkingPoints, enabledAxes, fallbackCount, selectedModels]);

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
                    basePromptTemplate,
                    negations: enabledNegations,
                    anchors: enabledAnchors,
                    talkingPoints: enabledTalkingPoints,
                    axes: tile.axis ? [tile.axis] : [],
                    count: 1,
                    steer: tile.steer.trim() || undefined,
                    models: selectedModels.length ? selectedModels : [PRIMARY_IMAGE_BACKEND_ID],
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
            setWarnings(Array.isArray(data.warnings) ? data.warnings.filter((w: unknown): w is string => typeof w === 'string') : []);
            const next = data.renditions?.[0];
            if (next) {
                const variants = Array.isArray(next.variants) ? next.variants as RenditionVariant[] : [];
                const selectedGenerator = variants.find((v) => v.generator === tile.selectedGenerator)?.generator
                    ?? variants.find((v) => v.generator === selectedModels[0])?.generator
                    ?? variants[0]?.generator
                    ?? tile.selectedGenerator;
                setRenditions((prev) => prev.map((r) => r.id === id ? { ...r, prompt: next.prompt, variants, selectedGenerator, loading: false } : r));
            } else {
                setRenditions((prev) => prev.map((r) => r.id === id ? { ...r, loading: false } : r));
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
            setRenditions((prev) => prev.map((r) => r.id === id ? { ...r, loading: false } : r));
        }
    }, [renditions, slug, basePromptTemplate, enabledNegations, enabledAnchors, enabledTalkingPoints, selectedModels]);

    const addTalkingPoint = useCallback((text: string) => {
        const clean = text.replace(/\s+/g, ' ').trim();
        if (!clean) return;
        setTalkingPoints((prev) => {
            if (prev.some((point) => point.text.trim().toLowerCase() === clean.toLowerCase())) return prev;
            return [...prev, { id: nextId(), text: clean, enabled: true }];
        });
    }, []);

    const applySavedCampaignState = useCallback((sourceSlug: string) => {
        const sourceSettings = readCampaignSettings(sourceSlug);
        if (!sourceSettings) return;

        setBasePromptTemplate(sourceSettings.basePromptTemplate?.trim() || DEFAULT_FLYER_BASE_TEMPLATE);
        setNegations(toRowsFromStored(sourceSettings.negations, DEFAULT_FLYER_NEGATIONS));
        setAxes(toRowsFromStored(sourceSettings.axes, DEFAULT_FLYER_VARIATION_AXES));
        setTalkingPoints(toRowsFromStored(sourceSettings.talkingPoints, []));
        setTalkingPointsEnabled(sourceSettings.talkingPointsEnabled ?? true);
        setTalkingPointDraft('');
        setSelectedModels(sanitizeSelectedModels(sourceSettings.selectedModels));
        setFallbackCount(typeof sourceSettings.fallbackCount === 'number'
            ? Math.max(1, Math.min(8, Math.floor(sourceSettings.fallbackCount)))
            : DEFAULT_FALLBACK_COUNT);
        setAnchors((prev) => prev.map((anchor) => {
            const matched = sourceSettings.anchors?.find((entry) => entry.text === anchor.text);
            return matched ? { ...anchor, enabled: matched.enabled } : anchor;
        }));
        setRenditions([]);
        setWarnings([]);
        setError(null);
    }, []);

    const applySavedBasePromptTemplate = useCallback((sourceSlug: string) => {
        const sourceSettings = readCampaignSettings(sourceSlug);
        const nextTemplate = sourceSettings?.basePromptTemplate?.trim();
        if (!nextTemplate) return;
        setBasePromptTemplate(nextTemplate);
        setError(null);
    }, []);

    const generateTalkingPoints = useCallback(async () => {
        if (!slug.trim()) return;
        setGeneratingTalkingPoints(true);
        setError(null);
        try {
            const res = await fetch('/api/ads/flyer-lab/talking-points', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    slug,
                    existing: talkingPoints.map((point) => point.text),
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
            const nextPoints: string[] = Array.isArray(data.talkingPoints)
                ? data.talkingPoints.filter((point: unknown): point is string => typeof point === 'string')
                : [];
            setTalkingPoints((prev) => {
                const seen = new Set(prev.map((point) => point.text.trim().toLowerCase()));
                const additions = nextPoints
                    .map((point) => point.replace(/\s+/g, ' ').trim())
                    .filter((point) => point && !seen.has(point.toLowerCase()))
                    .map((point) => {
                        seen.add(point.toLowerCase());
                        return { id: nextId(), text: point, enabled: true };
                    });
                return [...prev, ...additions];
            });
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setGeneratingTalkingPoints(false);
        }
    }, [slug, talkingPoints]);

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
            {lightboxImage && (
                <div
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-6"
                    onClick={() => setLightboxImage(null)}
                    role="dialog"
                    aria-modal="true"
                    aria-label={lightboxImage.label ?? lightboxImage.alt}
                >
                    <div
                        className="relative flex max-h-full w-full max-w-7xl flex-col gap-3"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="flex items-center justify-between gap-4 text-xs uppercase tracking-[0.24em] text-slate-300">
                            <span className="truncate">{lightboxImage.label ?? lightboxImage.alt}</span>
                            <div className="flex items-center gap-2">
                                <a
                                    href={lightboxImage.src}
                                    download
                                    className="rounded border border-white/15 px-3 py-1.5 text-[11px] text-slate-200 hover:bg-white/10"
                                >
                                    Download
                                </a>
                                <button
                                    type="button"
                                    onClick={() => setLightboxImage(null)}
                                    className="rounded border border-white/15 px-3 py-1.5 text-[11px] text-slate-200 hover:bg-white/10"
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto rounded border border-white/10 bg-black/40 p-3">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={lightboxImage.src}
                                alt={lightboxImage.alt}
                                className="max-h-[calc(100vh-8rem)] w-auto max-w-full object-contain"
                            />
                        </div>
                    </div>
                </div>
            )}
            <div className="border-b border-white/[0.07] px-8 py-6">
                <h1 className="text-xl font-bold tracking-tight text-slate-100 mb-1">Flyer-Image Sandbox</h1>
                <p className="text-sm text-slate-500 mb-5">
                    Generate flyer images from a slug and tune the negation rules. Generation is throwaway — but you can commit any rendition to the campaign manifest: <span className="text-slate-400">+ Add to campaign</span> creates a new flyer, or <span className="text-slate-400">Replace</span> swaps an existing one in place.
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
                <CollapsibleSection title="Controls">
                    <div className="flex flex-col gap-4">
                    <CollapsibleSection title="Saved campaign states" meta={`${reusableCampaignStates.length} reusable`}>
                        {reusableCampaignStates.length === 0 ? (
                            <div className="rounded border border-dashed border-white/10 p-3 text-[11px] text-slate-600">
                                As other campaigns are used in Flyer Lab, their latest saved state will show up here as reusable templates.
                            </div>
                        ) : (
                            <div className="flex max-h-64 flex-col gap-2 overflow-y-auto pr-1">
                                {reusableCampaignStates.map((entry) => (
                                    <div key={entry.slug} className="flex items-center justify-between gap-3 rounded border border-white/10 bg-black/20 px-2 py-2">
                                        <div className="min-w-0">
                                            <div className="truncate text-xs text-slate-200">{entry.slug}</div>
                                            <div className="text-[10px] text-slate-500">
                                                {entry.settings.updatedAt
                                                    ? `saved ${new Date(entry.settings.updatedAt).toLocaleString()}`
                                                    : 'saved state available'}
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => applySavedCampaignState(entry.slug)}
                                            className="shrink-0 rounded border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-[11px] text-cyan-200 hover:bg-cyan-500/20"
                                        >
                                            Use as template
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CollapsibleSection>

                    <CollapsibleSection title="Negation rules" meta={`${enabledNegations.length} active`}>
                        <div className="mb-2 flex items-center justify-between">
                            <button type="button" onClick={copyNegations} className="rounded bg-white/5 px-2 py-1 text-[11px] text-slate-300 hover:bg-white/10">
                                {copied ? 'copied ✓' : 'Copy DEFAULT_FLYER_NEGATIONS'}
                            </button>
                        </div>
                        <RuleList rows={negations} ops={negOps} placeholder="thing to avoid…" />
                    </CollapsibleSection>

                    <CollapsibleSection title="Variation axes" meta={`${enabledAxes.length} renditions`}>
                        <RuleList rows={axes} ops={axisOps} placeholder="rendition direction…" />
                        {enabledAxes.length === 0 && (
                            <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                                no axes → generate
                                <input type="number" min={1} max={8} value={fallbackCount} onChange={(e) => setFallbackCount(Math.max(1, Math.min(8, Number(e.target.value) || 1)))}
                                    className="w-14 rounded border border-white/10 bg-black/30 px-2 py-1 text-slate-200" />
                                slug-only variations
                            </div>
                        )}
                    </CollapsibleSection>

                    <CollapsibleSection title="Image models" meta={`${modelCount} active`}>
                        <div className="flex flex-wrap gap-2">
                            {IMAGE_BACKEND_META.map((backend) => {
                                const checked = selectedModels.includes(backend.id);
                                return (
                                    <button
                                        key={backend.id}
                                        type="button"
                                        onClick={() => setSelectedModels((prev) => {
                                            if (prev.includes(backend.id)) {
                                                const next = prev.filter((id) => id !== backend.id);
                                                return next.length ? next : [PRIMARY_IMAGE_BACKEND_ID];
                                            }
                                            return [...prev, backend.id];
                                        })}
                                        className={`rounded border px-3 py-1.5 text-xs transition ${checked ? 'border-cyan-400/50 bg-cyan-400/10 text-cyan-200' : 'border-white/10 text-slate-500 hover:text-slate-300'}`}
                                    >
                                        {backend.label}
                                    </button>
                                );
                            })}
                        </div>
                        <p className="mt-2 text-[11px] text-slate-500">
                            Generates every rendition with the selected model(s), then lets each tile switch between the real outputs.
                        </p>
                    </CollapsibleSection>

                    {anchors.length > 0 && (
                        <CollapsibleSection title="Brief anchors" meta={`${enabledAnchors.length} active`}>
                            <div className="flex flex-wrap gap-2">
                                {anchors.map((a) => (
                                    <button key={a.id} type="button" onClick={() => setAnchors((prev) => prev.map((x) => x.id === a.id ? { ...x, enabled: !x.enabled } : x))}
                                        className={`rounded-full border px-3 py-1 text-xs ${a.enabled ? 'border-amber-500/40 bg-amber-500/10 text-amber-300' : 'border-white/10 text-slate-500'}`}>
                                        {a.text}
                                    </button>
                                ))}
                            </div>
                        </CollapsibleSection>
                    )}

                    <CollapsibleSection title="Talking points" meta={talkingPointsEnabled ? `${enabledTalkingPoints.length} active` : 'disabled'}>
                        <div className="mb-2 flex items-center justify-between gap-3">
                            <div className="flex flex-wrap items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setTalkingPointsEnabled((prev) => !prev)}
                                    className={`rounded px-2 py-1 text-[11px] font-medium transition ${talkingPointsEnabled ? 'bg-cyan-500/15 text-cyan-200 hover:bg-cyan-500/25' : 'border border-white/10 text-slate-400 hover:text-slate-200'}`}
                                >
                                    {talkingPointsEnabled ? 'Disable all' : 'Enable all'}
                                </button>
                                <button
                                    type="button"
                                    onClick={generateTalkingPoints}
                                    disabled={generatingTalkingPoints || !slug.trim()}
                                    className="rounded bg-cyan-500/15 px-2 py-1 text-[11px] font-medium text-cyan-200 hover:bg-cyan-500/25 disabled:opacity-40"
                                >
                                    {generatingTalkingPoints ? 'Generating...' : 'Generate'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setTalkingPoints([]);
                                        setTalkingPointDraft('');
                                    }}
                                    disabled={talkingPoints.length === 0}
                                    className="rounded border border-white/10 px-2 py-1 text-[11px] text-slate-400 hover:text-slate-200 disabled:opacity-40"
                                >
                                    Clear all
                                </button>
                            </div>
                        </div>
                        {!talkingPointsEnabled && (
                            <div className="mb-2 rounded border border-dashed border-white/10 p-2 text-[11px] text-slate-500">
                                Talking points are saved for this campaign, but they are currently excluded from the prompt preview and generation.
                            </div>
                        )}
                        <div className="mb-2 flex gap-2">
                            <input
                                value={talkingPointDraft}
                                onChange={(e) => setTalkingPointDraft(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        addTalkingPoint(talkingPointDraft);
                                        setTalkingPointDraft('');
                                    }
                                }}
                                placeholder="add a callout..."
                                className="min-w-0 flex-1 rounded border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-slate-200"
                            />
                            <button
                                type="button"
                                onClick={() => {
                                    addTalkingPoint(talkingPointDraft);
                                    setTalkingPointDraft('');
                                }}
                                className="rounded border border-dashed border-white/15 px-2 py-1 text-xs text-slate-400 hover:text-slate-200"
                            >
                                + add
                            </button>
                        </div>
                        {talkingPoints.length === 0 ? (
                            <div className="rounded border border-dashed border-white/10 p-3 text-[11px] text-slate-600">
                                Generate campaign-specific callouts from the brief and manifest, or add your own.
                            </div>
                        ) : (
                            <div className="flex flex-wrap gap-2">
                                {talkingPoints.map((point) => (
                                    <span
                                        key={point.id}
                                        className={`inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-1 text-xs ${point.enabled ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200' : 'border-white/10 text-slate-500'}`}
                                    >
                                        <button
                                            type="button"
                                            onClick={() => setTalkingPoints((prev) => prev.map((entry) => entry.id === point.id ? { ...entry, enabled: !entry.enabled } : entry))}
                                            className="max-w-[260px] truncate"
                                            title={point.text}
                                        >
                                            {point.text}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setTalkingPoints((prev) => prev.filter((entry) => entry.id !== point.id))}
                                            className="text-slate-500 hover:text-red-300"
                                            title="Remove"
                                        >
                                            x
                                        </button>
                                    </span>
                                ))}
                            </div>
                        )}
                    </CollapsibleSection>

                    <CollapsibleSection title="Base prompt">
                        <div className="mb-2 flex items-center justify-between gap-3">
                            <button
                                type="button"
                                onClick={() => setBasePromptTemplate(DEFAULT_FLYER_BASE_TEMPLATE)}
                                className="rounded bg-white/5 px-2 py-1 text-[11px] text-slate-300 hover:bg-white/10"
                            >
                                Reset
                            </button>
                        </div>
                        {reusableBasePromptStates.length > 0 && (
                            <div className="mb-3 flex max-h-40 flex-col gap-2 overflow-y-auto rounded border border-white/10 bg-black/20 p-2">
                                {reusableBasePromptStates.map((entry) => (
                                    <div key={entry.slug} className="flex items-center justify-between gap-3 rounded border border-white/10 bg-black/20 px-2 py-2">
                                        <div className="min-w-0">
                                            <div className="truncate text-xs text-slate-200">{entry.slug}</div>
                                            <div className="line-clamp-2 text-[10px] text-slate-500">
                                                {entry.settings.basePromptTemplate?.trim()}
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => applySavedBasePromptTemplate(entry.slug)}
                                            className="shrink-0 rounded border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-[11px] text-cyan-200 hover:bg-cyan-500/20"
                                        >
                                            Use prompt
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                        <textarea
                            value={basePromptTemplate}
                            onChange={(e) => setBasePromptTemplate(e.target.value)}
                            rows={5}
                            className="w-full resize-y rounded border border-white/10 bg-black/30 px-3 py-2 text-xs leading-relaxed text-slate-200"
                        />
                        <p className="mt-1 text-[11px] text-slate-500">Use {'{slug}'} where the selected campaign slug should be inserted.</p>
                    </CollapsibleSection>

                    <CollapsibleSection title="Prompt preview">
                        <pre className="whitespace-pre-wrap rounded border border-white/10 bg-black/40 p-3 text-[11px] leading-relaxed text-slate-400">{previewPrompt}</pre>
                    </CollapsibleSection>

                    <CollapsibleSection title="Generation" meta={`${generatedImageCount} images`}>
                        <button type="button" onClick={generate} disabled={generating || !slug.trim()}
                            className="w-full rounded bg-amber-500 px-4 py-3 text-sm font-bold text-black disabled:opacity-40">
                            {generating ? `Generating ${generatedImageCount} image${generatedImageCount === 1 ? '' : 's'}...` : `Generate ${renditionCount} flyer${renditionCount === 1 ? '' : 's'} x ${modelCount} model${modelCount === 1 ? '' : 's'}`}
                        </button>
                        {error && <div className="mt-3 rounded border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300">{error}</div>}
                        {warnings.length > 0 && (
                            <div className="mt-3 rounded border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-200">
                                <div className="mb-1 font-semibold">Model warning(s)</div>
                                {warnings.map((warning) => <div key={warning}>{warning}</div>)}
                            </div>
                        )}
                    </CollapsibleSection>
                    </div>
                </CollapsibleSection>

                {/* ── Results ──────────────────────────────────────────────── */}
                <CollapsibleSection title="Results" meta={`${renditions.length} renditions`}>
                    <div className="flex min-w-0 flex-col gap-4">
                    {/* Existing campaign flyers in the manifest */}
                    <CollapsibleSection title="Campaign flyers" meta={`${existingFlyers.length} in manifest`}>
                        <div className="mb-2 flex items-center gap-2">
                            <span className="text-[11px] text-slate-600">· {existingFlyers.length} in manifest for {slug || '—'}</span>
                        </div>
                        {existingFlyers.length === 0 ? (
                            <div className="rounded border border-dashed border-white/10 p-3 text-[11px] text-slate-600">
                                No flyer images in this campaign&apos;s manifest yet. Generate below, then click <span className="text-slate-400">+ Add to campaign</span> on one to create the first.
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                                {existingFlyers.map((f) => (
                                    <div key={f.assetId} className="group relative aspect-square overflow-hidden rounded-lg border border-white/10 bg-black/40">
                                        <button
                                            type="button"
                                            onClick={() => setLightboxImage({
                                                src: f.url,
                                                alt: f.assetId,
                                                label: `Campaign flyer ${f.assetId.slice(-16)}`,
                                            })}
                                            className="block h-full w-full text-left"
                                            title="Open fullscreen"
                                        >
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img src={f.url} alt={f.assetId} className="h-full w-full object-cover transition duration-150 group-hover:scale-[1.01]" />
                                        </button>
                                        {f.generator && (
                                            <span className={`absolute left-1.5 top-1.5 rounded px-1.5 py-0.5 text-[9px] font-medium ${f.generator === 'gpt_image_2' ? 'bg-emerald-500/80 text-white' : 'bg-black/70 text-slate-200'}`}>
                                                {imageBackendLabel(f.generator)}
                                            </span>
                                        )}
                                        <button type="button" onClick={() => removeExistingFlyer(f.assetId)} disabled={removingId === f.assetId}
                                            title="Remove from manifest"
                                            className="absolute right-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 text-xs text-slate-300 opacity-0 transition group-hover:opacity-100 hover:text-red-400 disabled:opacity-100">
                                            {removingId === f.assetId ? '…' : '✕'}
                                        </button>
                                        <div className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-1.5 py-1 text-[9px] text-slate-400">{f.assetId.slice(-16)}</div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CollapsibleSection>

                    <CollapsibleSection title="Generated renditions" meta={`${renditions.length} visible`}>
                    {renditions.length === 0 ? (
                        <div className="flex h-64 items-center justify-center rounded border border-dashed border-white/10 text-sm text-slate-600">
                            No renditions yet — tune the rules and hit Generate.
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-5 xl:grid-cols-3">
                            {renditions.map((r) => {
                                const selectedVariant = r.variants.find((v) => v.generator === r.selectedGenerator) ?? r.variants[0];
                                return (
                                <details key={r.id} open className="rounded border border-white/10 bg-white/[0.02] p-3">
                                    <summary className="mb-2 flex cursor-pointer list-none items-center justify-between gap-3 text-[11px] font-medium text-slate-400">
                                        <span className="truncate">{r.axis ?? 'Slug-only rendition'}</span>
                                        <span className="shrink-0 text-slate-600">{selectedVariant ? imageBackendLabel(selectedVariant.generator) : 'no image'}</span>
                                    </summary>
                                    <div className="flex flex-col gap-2">
                                    <div className="relative aspect-square overflow-hidden rounded bg-black/40">
                                        {selectedVariant ? (
                                            <button
                                                type="button"
                                                onClick={() => setLightboxImage({
                                                    src: selectedVariant.dataUrl,
                                                    alt: r.axis ?? 'flyer',
                                                    label: `${r.axis ?? 'Slug-only rendition'} - ${imageBackendLabel(selectedVariant.generator)}`,
                                                })}
                                                className="block h-full w-full text-left"
                                                title="Open fullscreen"
                                            >
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img src={selectedVariant.dataUrl} alt={r.axis ?? 'flyer'} className="h-full w-full object-cover transition duration-150 hover:scale-[1.01]" />
                                            </button>
                                        ) : (
                                            <div className="flex h-full w-full items-center justify-center p-4 text-center text-xs text-slate-500">No selected model returned an image.</div>
                                        )}
                                        {r.loading && <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-xs text-slate-300">regenerating…</div>}
                                    </div>
                                    {r.variants.length > 0 && (
                                        <div className="flex flex-wrap items-center gap-1 text-[10px] text-slate-500">
                                            <span className="uppercase tracking-wide">source</span>
                                            {r.variants.map((variant) => (
                                                <button
                                                    key={variant.generator}
                                                    type="button"
                                                    onClick={() => setRenditions((prev) => prev.map((x) => x.id === r.id ? { ...x, selectedGenerator: variant.generator } : x))}
                                                    className={`rounded px-1.5 py-0.5 transition ${r.selectedGenerator === variant.generator ? 'bg-cyan-500/25 text-cyan-100' : 'text-slate-400 hover:bg-white/10'}`}
                                                >
                                                    {imageBackendLabel(variant.generator)}
                                                </button>
                                            ))}
                                        </div>
                                    )}
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
                                            className="rounded bg-white/10 px-2 py-1 text-[11px] text-slate-200 hover:bg-white/20 disabled:opacity-40">regen</button>
                                        {selectedVariant && (
                                            <a href={selectedVariant.dataUrl} download={`flyer-${r.id}-${selectedVariant.generator}.png`} className="rounded bg-white/10 px-2 py-1 text-[11px] text-slate-200 hover:bg-white/20">down</a>
                                        )}
                                    </div>

                                    {/* commit to the real manifest */}
                                    <div className="space-y-1.5 border-t border-white/5 pt-2">
                                        <div className="text-[10px] text-slate-500">Saving selected source: <span className="text-cyan-200">{selectedVariant ? imageBackendLabel(selectedVariant.generator) : 'none'}</span></div>
                                        <div className="flex items-center gap-2">
                                            <button type="button" onClick={() => commit(r.id, 'add')} disabled={r.committing || !selectedVariant}
                                                className="flex-1 rounded bg-violet-500/20 px-2 py-1 text-[11px] font-medium text-violet-200 hover:bg-violet-500/30 disabled:opacity-40">
                                                {r.committing ? 'saving…' : '+ Add as new'}
                                            </button>
                                            <details className="relative">
                                                <summary className="cursor-pointer list-none rounded bg-white/10 px-2 py-1 text-[11px] text-slate-200 hover:bg-white/20">Assign to ▾</summary>
                                                <div className="absolute right-0 z-20 mt-1 max-h-64 w-64 overflow-y-auto rounded border border-white/10 bg-slate-900 p-2 shadow-xl shadow-black/50">
                                                    <div className="mb-1 px-1 text-[10px] text-slate-500">Set as the <span className="text-violet-300">{selectedVariant ? imageBackendLabel(selectedVariant.generator) : 'selected'}</span> version of:</div>
                                                    {existingFlyers.length === 0 ? (
                                                        <div className="p-2 text-[11px] text-slate-500">No existing flyers.</div>
                                                    ) : existingFlyers.map((f) => (
                                                        <button key={f.assetId} type="button" onClick={() => commit(r.id, 'assign', f.assetId)} disabled={!selectedVariant}
                                                            className="flex w-full items-center gap-2 rounded p-1 text-left hover:bg-white/10">
                                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                                            <img src={f.url} alt="" className="h-8 w-8 shrink-0 rounded object-cover" />
                                                            <span className="min-w-0 flex-1 truncate text-[10px] text-slate-300">…{f.assetId.slice(-16)}</span>
                                                            {f.generator && <span className="shrink-0 text-[8px] text-slate-500">{imageBackendLabel(f.generator)}</span>}
                                                        </button>
                                                    ))}
                                                </div>
                                            </details>
                                        </div>
                                        {r.committed && <div className="text-[10px] text-emerald-400">{r.committed}</div>}
                                    </div>
                                    </div>
                                </details>
                                );
                            })}
                        </div>
                    )}
                    </CollapsibleSection>
                    </div>
                </CollapsibleSection>
            </div>
        </div>
    );
}
