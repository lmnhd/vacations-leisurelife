"use client";

import { KeyboardEvent, useEffect, useState } from 'react';
import { getElevenLabsVoiceRoleLabel, parseElevenLabsVoiceTags } from '@/lib/campaigns/media/elevenlabs-voices';
import type { AssetApprovalState, AssetRecord, AssetType, ReviewStatus } from '@/lib/campaigns/schema';
import { IMAGE_CONTEXT_VALUES } from '@/lib/campaigns/schema';
import { normalizeAssetCuration } from '@/lib/campaigns/media/image-selection';
import { metadataContainsKnownShipLandscapeFeature } from '@/lib/campaigns/media/ship-environment-profile';
import { Check, AlertTriangle, Trash2, RefreshCw, Loader2, ExternalLink, SlidersHorizontal, MoreHorizontal, X, Plus } from 'lucide-react';

// ────────────────────────────────────────────────────────────────────────────
// Asset types that support delete / regenerate-with-revision
// ────────────────────────────────────────────────────────────────────────────

const VIDEO_ASSET_TYPES = new Set<AssetType>([
    'tiktok_seed_video', 'hero_explainer_video', 'threshold_video',
    'countdown_video', 'broll_clip',
]);

const IMAGE_ARTIFACT_TYPES = new Set<AssetType>([
    'hero_image', 'aesthetic_concept', 'ship_reference_image', 'platform_crop',
]);

const AUDIO_ARTIFACT_TYPES = new Set<AssetType>([
    'ambient_narration', 'hype_clip',
]);

const SUGGESTED_SUITABILITY_TAGS = [
    'minimal',
    'travel-first',
    'ocean-forward',
    'headline-safe',
    'quiet',
    'iconic',
    'welcoming',
    'brandable',
];

const SUGGESTED_ANTI_TAGS = [
    'busy',
    'interior-heavy',
    'workshop-like',
    'literal-activity',
    'crowded',
    'cluttered',
    'muddy',
    'off-brief',
];

function getDeleteEndpoint(slug: string, assetType: AssetType): string | null {
    if (assetType === 'scene_image') return `/api/groups/campaign/${slug}/media/manifest/scene-image-artifact`;
    if (VIDEO_ASSET_TYPES.has(assetType)) return `/api/groups/campaign/${slug}/media/manifest/video-artifact`;
    if (IMAGE_ARTIFACT_TYPES.has(assetType)) return `/api/groups/campaign/${slug}/media/manifest/image-artifact`;
    return null;
}

function isRegenerableType(assetType: AssetType): boolean {
    return assetType === 'scene_image'
        || assetType === 'hero_image'
        || assetType === 'aesthetic_concept'
    || AUDIO_ARTIFACT_TYPES.has(assetType)
        || VIDEO_ASSET_TYPES.has(assetType);
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function approvalStateClasses(state: AssetApprovalState): string {
    if (state === 'human_approved') return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300';
    if (state === 'auto_approved') return 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300';
    if (state === 'rejected') return 'border-red-500/40 bg-red-500/10 text-red-300';
    if (state === 'hold') return 'border-violet-500/40 bg-violet-500/10 text-violet-300';
    return 'border-amber-500/40 bg-amber-500/10 text-amber-300';
}

function approvalStateLabel(state: AssetApprovalState): string {
    return state.replace(/_/g, ' ');
}

function renderPreview(asset: AssetRecord) {
    if (asset.mimeType.startsWith('image/')) {
        const previewUrl = asset.assetType === 'ship_reference_image' && asset.sourceThumbnailUrl
            ? asset.sourceThumbnailUrl
            : asset.url;
        return <img src={`${previewUrl}?v=${encodeURIComponent(asset.createdAt)}`} alt={asset.assetId} className="h-44 w-full rounded-lg object-cover" />;
    }
    if (asset.mimeType.startsWith('video/')) {
        return <video controls src={asset.url} className="h-44 w-full rounded-lg bg-black" />;
    }
    if (asset.mimeType.startsWith('audio/')) {
        return <audio controls src={asset.url} className="w-full" />;
    }
    return (
        <a href={asset.url} target="_blank" rel="noreferrer"
            className="flex h-20 items-center justify-center rounded-lg border border-white/10 bg-slate-950 text-xs text-cyan-400 hover:text-cyan-300">
            Open asset
        </a>
    );
}

function formatContextLabel(value: string): string {
    return value
        .split('_')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

function toggleArrayValue(values: string[], value: string): string[] {
    return values.includes(value)
        ? values.filter((item) => item !== value)
        : [...values, value];
}

function normalizeTagValue(value: string): string {
    return value.trim().toLowerCase().replace(/\s+/g, '-');
}

function getReferenceCategory(asset: AssetRecord): string {
    return asset.tags.find((tag) => tag !== 'ship-reference' && tag !== 'reference') ?? 'unknown';
}

function getReferenceMatchLevel(asset: AssetRecord): 'exact_ship' | 'same_class' | 'generic_cruise' {
    const taggedMatchLevel = asset.tags.find((tag) => tag.startsWith('match:'));
    if (taggedMatchLevel === 'match:exact_ship') return 'exact_ship';
    if (taggedMatchLevel === 'match:same_class') return 'same_class';
    return 'generic_cruise';
}

function getHostnameLabel(url?: string): string {
    if (!url) return 'Unknown source';

    try {
        return new URL(url).hostname.replace(/^www\./, '');
    } catch {
        return url;
    }
}

function detectReferenceConcerns(asset: AssetRecord): string[] {
    const haystack = [asset.promptUsed, asset.sourcePageUrl, asset.sourceQuery, asset.url]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
    const knownShipLandscapeFeature = metadataContainsKnownShipLandscapeFeature(haystack);

    const concernTerms = [
        { term: 'hotel', label: 'hotel wording' },
        { term: 'resort', label: 'resort wording' },
        { term: 'villa', label: 'villa wording' },
        { term: 'courtyard', label: 'courtyard wording' },
        { term: 'garden', label: 'garden wording', suppressWhenShipNative: true },
        { term: 'lawn', label: 'lawn wording', suppressWhenShipNative: true },
        { term: 'backyard', label: 'backyard wording' },
        { term: 'patio', label: 'patio wording' },
        { term: 'render', label: 'render wording' },
        { term: 'illustration', label: 'illustration wording' },
    ];

    return concernTerms
        .filter((entry) => haystack.includes(entry.term))
        .filter((entry) => !(entry.suppressWhenShipNative && knownShipLandscapeFeature))
        .map((entry) => entry.label);
}

function getReferenceConfidence(asset: AssetRecord): 'high' | 'medium' | 'low' {
    const metadataHaystack = [asset.promptUsed, asset.sourcePageUrl, asset.sourceQuery]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

    const hasShipSignal = ['cruise', 'ship', 'deck', 'stateroom', 'cabin', 'atrium', 'pool', 'ocean', 'sea', 'voyage', 'port']
        .some((term) => metadataHaystack.includes(term));
    const concerns = detectReferenceConcerns(asset);

    const matchLevel = getReferenceMatchLevel(asset);

    if (concerns.length > 0 || matchLevel === 'generic_cruise') return 'low';
    if (matchLevel === 'exact_ship') return 'high';
    if (hasShipSignal && (asset.selectionScore ?? 0) >= 120) return 'high';
    return 'medium';
}

function buildReferenceSummary(asset: AssetRecord): string {
    const category = getReferenceCategory(asset).replace(/_/g, ' ');
    const confidence = getReferenceConfidence(asset);
    const matchLevel = getReferenceMatchLevel(asset);
    const title = asset.promptUsed || 'the source result';
    const query = asset.sourceQuery || 'the saved search query';

    if (confidence === 'low') {
        return `Low-confidence ${category} reference. It was selected from the query "${query}", but the source metadata for "${title}" contains signals that may point to a non-ship environment. Verify this manually before approval.`;
    }

    if (matchLevel === 'same_class') {
        return `Same-class ${category} reference. It lines up with the cruise-line and ship-family search for "${query}", but the metadata does not prove it is the exact named ship. Approve only if the space is still operationally representative.`;
    }

    if (confidence === 'high') {
        return `High-confidence ${category} reference. It was selected because the source metadata for "${title}" lines up strongly with the ship-focused query "${query}" and includes cruise or ship signals.`;
    }

    return `Medium-confidence ${category} reference. It matches the ship-focused query "${query}", but the metadata alone is not strong enough to guarantee that the image is truly the correct ship space.`;
}

function renderReferenceContext(asset: AssetRecord) {
    if (asset.assetType !== 'ship_reference_image') {
        return null;
    }

    const category = getReferenceCategory(asset);
    const matchLevel = getReferenceMatchLevel(asset);
    const concerns = detectReferenceConcerns(asset);
    const confidence = getReferenceConfidence(asset);
    const confidenceClasses = confidence === 'high'
        ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200'
        : confidence === 'low'
            ? 'border-amber-500/20 bg-amber-500/10 text-amber-200'
            : 'border-sky-500/20 bg-sky-500/10 text-sky-200';
    const matchClasses = matchLevel === 'exact_ship'
        ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200'
        : matchLevel === 'same_class'
            ? 'border-violet-500/20 bg-violet-500/10 text-violet-200'
            : 'border-amber-500/20 bg-amber-500/10 text-amber-200';
    const matchLabel = matchLevel === 'exact_ship'
        ? 'Exact Ship'
        : matchLevel === 'same_class'
            ? 'Same Class'
            : 'Generic Cruise';

    return (
        <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
                <div className="text-[10px] uppercase tracking-widest text-cyan-400">Reference Context</div>
                <div className="text-[10px] text-slate-400">score {asset.selectionScore ?? 0}</div>
            </div>

            <div className={`rounded-lg border px-2.5 py-2 text-[11px] ${confidenceClasses}`}>
                {buildReferenceSummary(asset)}
            </div>

            <div className="flex flex-wrap gap-2">
                <div className={`rounded-full border px-2 py-1 text-[10px] ${matchClasses}`}>
                    {matchLabel}
                </div>
            </div>

            <div className="space-y-1 text-[11px] text-slate-300">
                <div><span className="text-slate-500">Category:</span> {category}</div>
                <div><span className="text-slate-500">Confidence:</span> {confidence}</div>
                <div><span className="text-slate-500">Ship match:</span> {matchLabel}</div>
                <div><span className="text-slate-500">Source title:</span> {asset.promptUsed || 'No title captured'}</div>
                <div><span className="text-slate-500">Search query:</span> {asset.sourceQuery || 'No query captured'}</div>
                <div><span className="text-slate-500">Source site:</span> {getHostnameLabel(asset.sourcePageUrl)}</div>
                <div className="text-slate-400">
                    Search result only. Human approval should confirm this is actually the correct ship space or a believable ship-adjacent view.
                </div>
            </div>

            {concerns.length > 0 && (
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-200">
                    Potential mismatch signals: {concerns.join(', ')}
                </div>
            )}

            <div className="flex gap-2">
                {asset.sourcePageUrl && (
                    <a
                        href={asset.sourcePageUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-2 py-1 text-[10px] text-cyan-300 hover:bg-cyan-500/20"
                    >
                        <ExternalLink className="h-3 w-3" />
                        Open source page
                    </a>
                )}
                <a
                    href={asset.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-slate-300 hover:text-white hover:bg-white/10"
                >
                    <ExternalLink className="h-3 w-3" />
                    Open full image
                </a>
            </div>
        </div>
    );
}

function renderVoiceContext(asset: AssetRecord) {
    const voice = parseElevenLabsVoiceTags(asset.tags);
    if (!voice.voiceId) {
        return null;
    }

    return (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 space-y-1.5">
            <div className="text-[10px] uppercase tracking-widest text-emerald-400">Voice Metadata</div>
            <div className="text-[11px] text-slate-300">
                {voice.role ? getElevenLabsVoiceRoleLabel(voice.role) : 'Narration'}
            </div>
            <div className="text-xs text-white">{voice.voiceName ?? 'Selected ElevenLabs voice'}</div>
            <div className="text-[11px] text-slate-500 break-all">{voice.voiceId}</div>
        </div>
    );
}

// ────────────────────────────────────────────────────────────────────────────
// ReviewAssetCard
// ────────────────────────────────────────────────────────────────────────────

export function ReviewAssetCard({ slug, asset, title, entryKey, onRefresh }: {
    slug: string;
    asset: AssetRecord;
    title: string;
    entryKey: string;
    onRefresh: () => Promise<void>;
}) {
    const initialCuration = normalizeAssetCuration(asset);
    const [notes, setNotes] = useState(asset.reviewNotes ?? '');
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [regenerating, setRegenerating] = useState(false);
    const [savingCuration, setSavingCuration] = useState(false);
    const [showRegenForm, setShowRegenForm] = useState(false);
    const [showPromptViewer, setShowPromptViewer] = useState(false);
    const [showCurationForm, setShowCurationForm] = useState(false);
    const [showMoreActions, setShowMoreActions] = useState(false);
    const [regenMode, setRegenMode] = useState<'append_note' | 'manual_override'>('append_note');
    const [regenText, setRegenText] = useState('');
    const [editablePrompt, setEditablePrompt] = useState(asset.promptUsed);
    const [approvalState, setApprovalState] = useState<AssetApprovalState>(initialCuration.approvalState);
    const [globalPriority, setGlobalPriority] = useState(String(initialCuration.globalPriority));
    const [approvedContexts, setApprovedContexts] = useState<string[]>(initialCuration.approvedContexts);
    const [blockedContexts, setBlockedContexts] = useState<string[]>(initialCuration.blockedContexts);
    const [suitabilityTags, setSuitabilityTags] = useState<string[]>(initialCuration.suitabilityTags);
    const [antiTags, setAntiTags] = useState<string[]>(initialCuration.antiTags);
    const [suitabilityInput, setSuitabilityInput] = useState('');
    const [antiInput, setAntiInput] = useState('');
    const [curatorNotes, setCuratorNotes] = useState(initialCuration.curatorNotes ?? '');
    const [downstreamLocked, setDownstreamLocked] = useState(initialCuration.downstreamLocked);
    const [error, setError] = useState('');

    const deleteEndpoint = getDeleteEndpoint(slug, asset.assetType);
    const canRegen = isRegenerableType(asset.assetType);
    const allowsSharedVoiceRerender = AUDIO_ARTIFACT_TYPES.has(asset.assetType);
    const isBusy = saving || deleting || regenerating || savingCuration;
    const effectiveApprovalState = approvalState;

    useEffect(() => {
        const nextCuration = normalizeAssetCuration(asset);
        setNotes(asset.reviewNotes ?? '');
        setEditablePrompt(asset.promptUsed);
        setApprovalState(nextCuration.approvalState);
        setGlobalPriority(String(nextCuration.globalPriority));
        setApprovedContexts(nextCuration.approvedContexts);
        setBlockedContexts(nextCuration.blockedContexts);
        setSuitabilityTags(nextCuration.suitabilityTags);
        setAntiTags(nextCuration.antiTags);
        setCuratorNotes(nextCuration.curatorNotes ?? '');
        setDownstreamLocked(nextCuration.downstreamLocked);
    }, [asset]);

    const addTag = (kind: 'suitability' | 'anti', rawValue: string) => {
        const nextTag = normalizeTagValue(rawValue);
        if (!nextTag) return;

        if (kind === 'suitability') {
            setSuitabilityTags((current) => current.includes(nextTag) ? current : [...current, nextTag]);
            setSuitabilityInput('');
            return;
        }

        setAntiTags((current) => current.includes(nextTag) ? current : [...current, nextTag]);
        setAntiInput('');
    };

    const removeTag = (kind: 'suitability' | 'anti', tag: string) => {
        if (kind === 'suitability') {
            setSuitabilityTags((current) => current.filter((item) => item !== tag));
            return;
        }
        setAntiTags((current) => current.filter((item) => item !== tag));
    };

    const handleTagInputKeyDown = (event: KeyboardEvent<HTMLInputElement>, kind: 'suitability' | 'anti') => {
        if (event.key !== 'Enter' && event.key !== ',') return;
        event.preventDefault();
        addTag(kind, kind === 'suitability' ? suitabilityInput : antiInput);
    };

    const toggleContextSelection = (context: string, kind: 'approved' | 'blocked') => {
        if (kind === 'approved') {
            setApprovedContexts((current) => toggleArrayValue(current, context));
            setBlockedContexts((current) => current.filter((item) => item !== context));
            return;
        }

        setBlockedContexts((current) => toggleArrayValue(current, context));
        setApprovedContexts((current) => current.filter((item) => item !== context));
    };

    const handleSaveCuration = async () => {
        setSavingCuration(true);
        setError('');
        try {
            const invalidContexts = [...approvedContexts, ...blockedContexts]
                .filter((context) => !IMAGE_CONTEXT_VALUES.includes(context as typeof IMAGE_CONTEXT_VALUES[number]));
            if (invalidContexts.length > 0) {
                throw new Error(`Invalid contexts: ${invalidContexts.join(', ')}`);
            }

            const response = await fetch(`/api/groups/campaign/${slug}/media/curation`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    assetId: asset.assetId,
                    approvalState,
                    globalPriority: Number(globalPriority),
                    approvedContexts,
                    blockedContexts,
                    suitabilityTags,
                    antiTags,
                    curatorNotes: curatorNotes.trim() || undefined,
                    downstreamLocked,
                }),
            });

            if (!response.ok) {
                const payload = await response.json().catch(() => ({}));
                throw new Error(payload?.error ?? 'Failed to save curation');
            }

            await onRefresh();
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Unknown error');
        } finally {
            setSavingCuration(false);
        }
    };

    // ── Review (Approve / Flag) ──────────────────────────────────────────────
    const handleReview = async (reviewStatus: ReviewStatus) => {
        setSaving(true);
        setError('');
        try {
            const res = await fetch(`/api/groups/campaign/${slug}/media/review`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    assetId: asset.assetId,
                    reviewStatus,
                    ...(notes.trim() ? { reviewNotes: notes.trim() } : {}),
                }),
            });
            if (!res.ok) {
                const d = await res.json();
                throw new Error(d.error || 'Review update failed');
            }
            setApprovalState(reviewStatus === 'human_approved' ? 'human_approved' : 'revision_required');
            await onRefresh();
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Unknown error');
        } finally {
            setSaving(false);
        }
    };

    const handleQuickApprovalState = async (nextApprovalState: AssetApprovalState) => {
        setSavingCuration(true);
        setError('');
        try {
            const response = await fetch(`/api/groups/campaign/${slug}/media/curation`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    assetId: asset.assetId,
                    approvalState: nextApprovalState,
                }),
            });

            if (!response.ok) {
                const payload = await response.json().catch(() => ({}));
                throw new Error(payload?.error ?? 'Failed to update approval state');
            }

            setApprovalState(nextApprovalState);
            await onRefresh();
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Unknown error');
        } finally {
            setSavingCuration(false);
        }
    };

    // ── Delete ───────────────────────────────────────────────────────────────
    const handleDelete = async () => {
        if (!deleteEndpoint) return;
        if (!window.confirm(`Remove "${title}" (${asset.assetId})? The asset record will be deactivated.`)) return;
        setDeleting(true);
        setError('');
        try {
            const res = await fetch(deleteEndpoint, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ assetId: asset.assetId }),
            });
            if (!res.ok) {
                const d = await res.json();
                throw new Error(d.error || 'Delete failed');
            }
            await onRefresh();
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Unknown error');
        } finally {
            setDeleting(false);
        }
    };

    // ── Regenerate with Revision ─────────────────────────────────────────────
    const handleRegenerate = async () => {
        if (!allowsSharedVoiceRerender && !regenText.trim() && regenMode === 'append_note') return;
        if (regenMode === 'manual_override' && !editablePrompt.trim()) return;
        
        setRegenerating(true);
        setError('');
        try {
            const body = {
                assetId: asset.assetId,
                applyMode: regenMode,
                ...(regenMode === 'append_note'
                    ? { revisionNote: regenText.trim() }
                    : { revisedPrompt: editablePrompt.trim() }),
            };
            const res = await fetch(`/api/groups/campaign/${slug}/media/regenerate-with-revision`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!res.ok) {
                const d = await res.json();
                throw new Error(d.error || 'Regeneration failed');
            }
            setShowRegenForm(false);
            setRegenText('');
            await onRefresh();
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Unknown error');
        } finally {
            setRegenerating(false);
        }
    };

    return (
        <div className="rounded-xl border border-white/10 bg-slate-950/60 p-3 space-y-3">
            {/* ── Header ───────────────────────────────────────────────── */}
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <div className="text-sm font-medium text-white truncate">{title}</div>
                    <div className="text-[10px] text-slate-500">
                        {asset.assetType} · {asset.generator} · v{asset.version ?? 1}
                    </div>
                </div>
                <div className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${approvalStateClasses(effectiveApprovalState)}`}>
                    {approvalStateLabel(effectiveApprovalState)}
                </div>
            </div>

            {/* ── Preview ──────────────────────────────────────────────── */}
            {renderPreview(asset)}

            {/* ── Metadata row ─────────────────────────────────────────── */}
            <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[10px] text-slate-500">
                <span>{formatBytes(asset.fileSizeBytes)}</span>
                {asset.dimensions && <span>{asset.dimensions.width}×{asset.dimensions.height}</span>}
                {asset.durationSeconds !== undefined && <span>{asset.durationSeconds.toFixed(1)}s</span>}
                <span>{new Date(asset.createdAt).toLocaleDateString()}</span>
            </div>

            {renderReferenceContext(asset)}
            {renderVoiceContext(asset)}

            {/* ── Notes ────────────────────────────────────────────────── */}
            <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Review notes..."
                className="w-full min-h-14 rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/40 resize-y"
            />

            {/* ── Error ────────────────────────────────────────────────── */}
            {error && (
                <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-[11px] text-red-300">{error}</div>
            )}

            {/* ── Primary actions: Approve / Flag ──────────────────────── */}
            <div className="grid grid-cols-3 gap-1.5">
                <button onClick={() => void handleReview('human_approved')} disabled={isBusy}
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-1.5 text-[11px] font-medium text-emerald-300 hover:bg-emerald-500/20 transition disabled:opacity-40">
                    {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                    Approve
                </button>
                <button onClick={() => void handleReview('needs_review')} disabled={isBusy}
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[11px] font-medium text-amber-300 hover:bg-amber-500/20 transition disabled:opacity-40">
                    {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <AlertTriangle className="h-3 w-3" />}
                    Revise
                </button>
                <button onClick={() => void handleQuickApprovalState('rejected')} disabled={isBusy}
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-[11px] font-medium text-red-300 hover:bg-red-500/20 transition disabled:opacity-40">
                    {savingCuration ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                    Reject
                </button>
            </div>

            {/* ── Secondary actions: Curate + More ────────────────────── */}
            <div className="flex gap-1.5">
                <button onClick={() => setShowCurationForm(!showCurationForm)} disabled={isBusy}
                    className="flex-1 flex items-center justify-center gap-1 rounded-lg border border-fuchsia-500/20 bg-fuchsia-500/5 px-2.5 py-1.5 text-[11px] text-fuchsia-300 hover:bg-fuchsia-500/15 transition disabled:opacity-40">
                    <SlidersHorizontal className="h-3 w-3" />
                    Curate
                </button>
                <button onClick={() => setShowMoreActions(!showMoreActions)} disabled={isBusy}
                    className="flex items-center justify-center gap-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] text-slate-300 hover:text-white hover:bg-white/10 transition disabled:opacity-40">
                    <MoreHorizontal className="h-3.5 w-3.5" />
                    More
                </button>
            </div>

            {showMoreActions && (
                <div className="rounded-lg border border-white/10 bg-slate-900/80 p-3 space-y-2">
                    <div className="text-[10px] uppercase tracking-widest text-slate-500">More Actions</div>
                    <div className="grid grid-cols-2 gap-2">
                        {canRegen && (
                            <button onClick={() => { setShowRegenForm(!showRegenForm); setShowMoreActions(false); }} disabled={isBusy}
                                className="flex items-center justify-center gap-1 rounded-lg border border-purple-500/20 bg-purple-500/5 px-2.5 py-1.5 text-[11px] text-purple-400 hover:bg-purple-500/15 transition disabled:opacity-40">
                                <RefreshCw className="h-3 w-3" />
                                Revise
                            </button>
                        )}
                        <button onClick={() => { setShowPromptViewer(!showPromptViewer); setShowMoreActions(false); }} disabled={isBusy}
                            className="flex items-center justify-center gap-1 rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-2.5 py-1.5 text-[11px] text-cyan-400 hover:bg-cyan-500/15 transition disabled:opacity-40">
                            Prompt
                        </button>
                        <a href={asset.url} target="_blank" rel="noreferrer"
                            className="flex items-center justify-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] text-slate-400 hover:text-white transition">
                            <ExternalLink className="h-3 w-3" />
                            Open
                        </a>
                        {deleteEndpoint && (
                            <button onClick={() => void handleDelete()} disabled={isBusy}
                                className="flex items-center justify-center gap-1 rounded-lg border border-red-500/20 bg-red-500/5 px-2.5 py-1.5 text-[11px] text-red-400 hover:bg-red-500/15 transition disabled:opacity-40">
                                {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                                Remove
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* ── Prompt Viewer (expandable) ───────────────────────────── */}
            {showPromptViewer && (
                <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                        <div className="text-[10px] uppercase tracking-widest text-cyan-400">Generation Prompt</div>
                        <button 
                            onClick={() => { setEditablePrompt(asset.promptUsed); }}
                            className="text-[10px] text-cyan-400 hover:text-cyan-300 underline"
                        >
                            Reset to original
                        </button>
                    </div>
                    <textarea 
                        value={editablePrompt}
                        onChange={(e) => setEditablePrompt(e.target.value)}
                        readOnly={regenMode === 'append_note' && !showRegenForm}
                        className={`w-full min-h-32 rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500/40 resize-y font-mono leading-relaxed ${regenMode === 'append_note' && !showRegenForm ? 'opacity-60 cursor-not-allowed' : ''}`}
                    />
                    <div className="flex gap-2">
                        <button 
                            onClick={() => { navigator.clipboard.writeText(editablePrompt); }}
                            className="text-[10px] px-2 py-1 rounded bg-slate-800 text-slate-300 hover:bg-slate-700"
                        >
                            Copy to clipboard
                        </button>
                        <button 
                            onClick={() => { setRegenMode('manual_override'); setShowRegenForm(true); }}
                            className="text-[10px] px-2 py-1 rounded bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30"
                        >
                            Use for regeneration →
                        </button>
                    </div>
                </div>
            )}

            {showCurationForm && (
                <div className="rounded-lg border border-fuchsia-500/20 bg-fuchsia-500/5 p-3 space-y-3">
                    <div className="text-[10px] uppercase tracking-widest text-fuchsia-300">Image Governance</div>

                    <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                            <div className="text-[10px] text-slate-400">Approval State</div>
                            <select
                                value={approvalState}
                                onChange={(e) => setApprovalState(e.target.value as AssetApprovalState)}
                                className="w-full bg-slate-900 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-fuchsia-500/40"
                            >
                                <option value="pending_review">pending_review</option>
                                <option value="auto_approved">auto_approved</option>
                                <option value="human_approved">human_approved</option>
                                <option value="rejected">rejected</option>
                                <option value="revision_required">revision_required</option>
                                <option value="hold">hold</option>
                            </select>
                        </div>
                        <div className="space-y-1">
                            <div className="text-[10px] text-slate-400">Global Priority (0-100)</div>
                            <input
                                value={globalPriority}
                                onChange={(e) => setGlobalPriority(e.target.value)}
                                inputMode="numeric"
                                className="w-full bg-slate-900 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-fuchsia-500/40"
                            />
                        </div>
                    </div>

                    <label className="flex items-center gap-2 text-xs text-slate-300">
                        <input
                            type="checkbox"
                            checked={downstreamLocked}
                            onChange={(e) => setDownstreamLocked(e.target.checked)}
                            className="rounded border-white/20 bg-slate-900"
                        />
                        Lock from downstream usage until explicitly approved
                    </label>

                    <div className="space-y-1">
                        <div className="text-[10px] text-slate-400">Approved Contexts</div>
                        <div className="flex flex-wrap gap-1.5 rounded-lg border border-white/10 bg-slate-900/60 p-2">
                            {IMAGE_CONTEXT_VALUES.map((context) => {
                                const selected = approvedContexts.includes(context);
                                return (
                                    <button
                                        key={`approved-${context}`}
                                        type="button"
                                        onClick={() => toggleContextSelection(context, 'approved')}
                                        className={`rounded-full border px-2.5 py-1 text-[10px] transition ${selected
                                            ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200'
                                            : 'border-white/10 bg-slate-950 text-slate-400 hover:border-emerald-500/30 hover:text-emerald-200'
                                        }`}
                                    >
                                        {formatContextLabel(context)}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="space-y-1">
                        <div className="text-[10px] text-slate-400">Blocked Contexts</div>
                        <div className="flex flex-wrap gap-1.5 rounded-lg border border-white/10 bg-slate-900/60 p-2">
                            {IMAGE_CONTEXT_VALUES.map((context) => {
                                const selected = blockedContexts.includes(context);
                                return (
                                    <button
                                        key={`blocked-${context}`}
                                        type="button"
                                        onClick={() => toggleContextSelection(context, 'blocked')}
                                        className={`rounded-full border px-2.5 py-1 text-[10px] transition ${selected
                                            ? 'border-amber-500/40 bg-amber-500/15 text-amber-200'
                                            : 'border-white/10 bg-slate-950 text-slate-400 hover:border-amber-500/30 hover:text-amber-200'
                                        }`}
                                    >
                                        {formatContextLabel(context)}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="space-y-1">
                        <div className="text-[10px] text-slate-400">Suitability Tags</div>
                        <div className="rounded-lg border border-white/10 bg-slate-900/60 p-2 space-y-2">
                            <div className="flex flex-wrap gap-1.5">
                                {suitabilityTags.map((tag) => (
                                    <button
                                        key={`suitability-chip-${tag}`}
                                        type="button"
                                        onClick={() => removeTag('suitability', tag)}
                                        className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] text-emerald-200"
                                    >
                                        {tag}
                                        <X className="h-3 w-3" />
                                    </button>
                                ))}
                            </div>
                            <div className="flex gap-2">
                                <input
                                    value={suitabilityInput}
                                    onChange={(e) => setSuitabilityInput(e.target.value)}
                                    onKeyDown={(e) => handleTagInputKeyDown(e, 'suitability')}
                                    placeholder="Add tag"
                                    className="flex-1 bg-slate-950 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-fuchsia-500/40"
                                />
                                <button
                                    type="button"
                                    onClick={() => addTag('suitability', suitabilityInput)}
                                    className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] text-slate-300 hover:text-white"
                                >
                                    <Plus className="h-3 w-3" />
                                    Add
                                </button>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                {SUGGESTED_SUITABILITY_TAGS.map((tag) => (
                                    <button
                                        key={`suggested-suitability-${tag}`}
                                        type="button"
                                        onClick={() => addTag('suitability', tag)}
                                        className="rounded-full border border-white/10 bg-slate-950 px-2.5 py-1 text-[10px] text-slate-400 hover:border-emerald-500/30 hover:text-emerald-200"
                                    >
                                        {tag}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="space-y-1">
                        <div className="text-[10px] text-slate-400">Anti Tags</div>
                        <div className="rounded-lg border border-white/10 bg-slate-900/60 p-2 space-y-2">
                            <div className="flex flex-wrap gap-1.5">
                                {antiTags.map((tag) => (
                                    <button
                                        key={`anti-chip-${tag}`}
                                        type="button"
                                        onClick={() => removeTag('anti', tag)}
                                        className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[10px] text-amber-200"
                                    >
                                        {tag}
                                        <X className="h-3 w-3" />
                                    </button>
                                ))}
                            </div>
                            <div className="flex gap-2">
                                <input
                                    value={antiInput}
                                    onChange={(e) => setAntiInput(e.target.value)}
                                    onKeyDown={(e) => handleTagInputKeyDown(e, 'anti')}
                                    placeholder="Add anti tag"
                                    className="flex-1 bg-slate-950 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-fuchsia-500/40"
                                />
                                <button
                                    type="button"
                                    onClick={() => addTag('anti', antiInput)}
                                    className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] text-slate-300 hover:text-white"
                                >
                                    <Plus className="h-3 w-3" />
                                    Add
                                </button>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                {SUGGESTED_ANTI_TAGS.map((tag) => (
                                    <button
                                        key={`suggested-anti-${tag}`}
                                        type="button"
                                        onClick={() => addTag('anti', tag)}
                                        className="rounded-full border border-white/10 bg-slate-950 px-2.5 py-1 text-[10px] text-slate-400 hover:border-amber-500/30 hover:text-amber-200"
                                    >
                                        {tag}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="space-y-1">
                        <div className="text-[10px] text-slate-400">Curator Notes</div>
                        <textarea
                            value={curatorNotes}
                            onChange={(e) => setCuratorNotes(e.target.value)}
                            placeholder="Why this image should or should not be used downstream"
                            className="w-full min-h-16 rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-fuchsia-500/40 resize-y"
                        />
                    </div>

                    <div className="text-[10px] text-slate-500">
                        Click context chips to add or remove them. Click selected tags to remove them.
                    </div>

                    <button onClick={() => void handleSaveCuration()} disabled={savingCuration}
                        className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-fuchsia-500/30 bg-fuchsia-500/10 px-3 py-2 text-xs font-medium text-fuchsia-200 hover:bg-fuchsia-500/20 transition disabled:opacity-40">
                        {savingCuration ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <SlidersHorizontal className="h-3.5 w-3.5" />}
                        {savingCuration ? 'Saving Governance…' : 'Save Governance'}
                    </button>
                </div>
            )}

            {/* ── Regeneration form (expandable) ───────────────────────── */}
            {showRegenForm && (
                <div className="rounded-lg border border-purple-500/20 bg-purple-500/5 p-3 space-y-2">
                    <div className="text-[10px] uppercase tracking-widest text-purple-400">Regenerate with Revision</div>
                    <select value={regenMode}
                        onChange={(e) => {
                            const mode = e.target.value as 'append_note' | 'manual_override';
                            setRegenMode(mode);
                            if (mode === 'manual_override') {
                                setEditablePrompt(asset.promptUsed);
                            }
                        }}
                        className="w-full bg-slate-900 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-purple-500/40">
                        <option value="append_note">Append revision note to original</option>
                        <option value="manual_override">Edit full prompt manually</option>
                    </select>
                    
                    {regenMode === 'append_note' ? (
                        <textarea value={regenText} onChange={(e) => setRegenText(e.target.value)}
                            placeholder={allowsSharedVoiceRerender
                                ? "Optional: append extra spoken text. Leave blank to re-render this script with the current shared voice."
                                : "Describe what to change (e.g., 'make it more vibrant', 'add sunset lighting')..."}
                            className="w-full min-h-16 rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-purple-500/40 resize-y"
                        />
                    ) : (
                        <div className="space-y-2">
                            <div className="text-[10px] text-slate-400">Edit the full prompt below:</div>
                            <textarea 
                                value={editablePrompt} 
                                onChange={(e) => setEditablePrompt(e.target.value)}
                                placeholder="Full replacement prompt..."
                                className="w-full min-h-32 rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-purple-500/40 resize-y font-mono leading-relaxed"
                            />
                        </div>
                    )}

                    {allowsSharedVoiceRerender && regenMode === 'append_note' && (
                        <div className="text-[11px] text-slate-400">
                            Leave the note blank to re-synthesize this same script with the current global ElevenLabs voice.
                        </div>
                    )}
                    
                    <button onClick={() => void handleRegenerate()} disabled={regenerating || (regenMode === 'append_note' ? (!allowsSharedVoiceRerender && !regenText.trim()) : !editablePrompt.trim())}
                        className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-purple-500/30 bg-purple-500/10 px-3 py-2 text-xs font-medium text-purple-300 hover:bg-purple-500/20 transition disabled:opacity-40">
                        {regenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                        {regenerating ? 'Regenerating…' : regenMode === 'append_note' ? 'Regenerate with Note' : 'Regenerate with Edited Prompt'}
                    </button>
                </div>
            )}
        </div>
    );
}
