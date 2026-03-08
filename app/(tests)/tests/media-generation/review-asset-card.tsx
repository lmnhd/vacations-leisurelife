"use client";

import { useState } from 'react';
import type { AssetApprovalState, AssetRecord, AssetType, ReviewStatus } from '@/lib/campaigns/schema';
import { IMAGE_CONTEXT_VALUES } from '@/lib/campaigns/schema';
import { normalizeAssetCuration } from '@/lib/campaigns/media/image-selection';
import { Check, AlertTriangle, Trash2, RefreshCw, Loader2, ExternalLink, SlidersHorizontal } from 'lucide-react';

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

function reviewStatusClasses(status: ReviewStatus): string {
    if (status === 'human_approved') return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300';
    if (status === 'auto_approved') return 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300';
    return 'border-amber-500/40 bg-amber-500/10 text-amber-300';
}

function renderPreview(asset: AssetRecord) {
    if (asset.mimeType.startsWith('image/')) {
        return <img src={`${asset.url}?v=${encodeURIComponent(asset.createdAt)}`} alt={asset.assetId} className="h-44 w-full rounded-lg object-cover" />;
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
    const [regenMode, setRegenMode] = useState<'append_note' | 'manual_override'>('append_note');
    const [regenText, setRegenText] = useState('');
    const [editablePrompt, setEditablePrompt] = useState(asset.promptUsed);
    const [approvalState, setApprovalState] = useState<AssetApprovalState>(initialCuration.approvalState);
    const [globalPriority, setGlobalPriority] = useState(String(initialCuration.globalPriority));
    const [approvedContexts, setApprovedContexts] = useState(initialCuration.approvedContexts.join(', '));
    const [blockedContexts, setBlockedContexts] = useState(initialCuration.blockedContexts.join(', '));
    const [suitabilityTags, setSuitabilityTags] = useState(initialCuration.suitabilityTags.join(', '));
    const [antiTags, setAntiTags] = useState(initialCuration.antiTags.join(', '));
    const [curatorNotes, setCuratorNotes] = useState(initialCuration.curatorNotes ?? '');
    const [downstreamLocked, setDownstreamLocked] = useState(initialCuration.downstreamLocked);
    const [error, setError] = useState('');

    const deleteEndpoint = getDeleteEndpoint(slug, asset.assetType);
    const canRegen = isRegenerableType(asset.assetType);
    const isBusy = saving || deleting || regenerating || savingCuration;

    const parseCommaList = (value: string): string[] => value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);

    const handleSaveCuration = async () => {
        setSavingCuration(true);
        setError('');
        try {
            const approvedContextList = parseCommaList(approvedContexts);
            const blockedContextList = parseCommaList(blockedContexts);
            const invalidContexts = [...approvedContextList, ...blockedContextList]
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
                    approvedContexts: approvedContextList,
                    blockedContexts: blockedContextList,
                    suitabilityTags: parseCommaList(suitabilityTags),
                    antiTags: parseCommaList(antiTags),
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
            await onRefresh();
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Unknown error');
        } finally {
            setSaving(false);
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
        if (!regenText.trim() && regenMode === 'append_note') return;
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
                <div className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${reviewStatusClasses(asset.reviewStatus)}`}>
                    {asset.reviewStatus.replace(/_/g, ' ')}
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
            <div className="flex gap-1.5">
                <button onClick={() => void handleReview('human_approved')} disabled={isBusy}
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-1.5 text-[11px] font-medium text-emerald-300 hover:bg-emerald-500/20 transition disabled:opacity-40">
                    {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                    Approve
                </button>
                <button onClick={() => void handleReview('needs_review')} disabled={isBusy}
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[11px] font-medium text-amber-300 hover:bg-amber-500/20 transition disabled:opacity-40">
                    {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <AlertTriangle className="h-3 w-3" />}
                    Flag
                </button>
            </div>

            {/* ── Secondary actions: Delete / Revise / Open ────────────── */}
            <div className="flex gap-1.5">
                {deleteEndpoint && (
                    <button onClick={() => void handleDelete()} disabled={isBusy}
                        className="flex items-center justify-center gap-1 rounded-lg border border-red-500/20 bg-red-500/5 px-2.5 py-1.5 text-[11px] text-red-400 hover:bg-red-500/15 transition disabled:opacity-40">
                        {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                        Remove
                    </button>
                )}
                {canRegen && (
                    <button onClick={() => setShowRegenForm(!showRegenForm)} disabled={isBusy}
                        className="flex items-center justify-center gap-1 rounded-lg border border-purple-500/20 bg-purple-500/5 px-2.5 py-1.5 text-[11px] text-purple-400 hover:bg-purple-500/15 transition disabled:opacity-40">
                        <RefreshCw className="h-3 w-3" />
                        Revise
                    </button>
                )}
                <button onClick={() => setShowCurationForm(!showCurationForm)} disabled={isBusy}
                    className="flex items-center justify-center gap-1 rounded-lg border border-fuchsia-500/20 bg-fuchsia-500/5 px-2.5 py-1.5 text-[11px] text-fuchsia-300 hover:bg-fuchsia-500/15 transition disabled:opacity-40">
                    <SlidersHorizontal className="h-3 w-3" />
                    Curate
                </button>
                <button onClick={() => setShowPromptViewer(!showPromptViewer)} disabled={isBusy}
                    className="flex items-center justify-center gap-1 rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-2.5 py-1.5 text-[11px] text-cyan-400 hover:bg-cyan-500/15 transition disabled:opacity-40">
                    Prompt
                </button>
                <a href={asset.url} target="_blank" rel="noreferrer"
                    className="flex items-center justify-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] text-slate-400 hover:text-white transition ml-auto">
                    <ExternalLink className="h-3 w-3" />
                    Open
                </a>
            </div>

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
                        <input
                            value={approvedContexts}
                            onChange={(e) => setApprovedContexts(e.target.value)}
                            placeholder="landing_hero_primary, email_header"
                            className="w-full bg-slate-900 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-fuchsia-500/40"
                        />
                    </div>

                    <div className="space-y-1">
                        <div className="text-[10px] text-slate-400">Blocked Contexts</div>
                        <input
                            value={blockedContexts}
                            onChange={(e) => setBlockedContexts(e.target.value)}
                            placeholder="landing_hero_primary, storyboard_fallback"
                            className="w-full bg-slate-900 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-fuchsia-500/40"
                        />
                    </div>

                    <div className="space-y-1">
                        <div className="text-[10px] text-slate-400">Suitability Tags</div>
                        <input
                            value={suitabilityTags}
                            onChange={(e) => setSuitabilityTags(e.target.value)}
                            placeholder="minimal, travel-first, ocean-forward, headline-safe"
                            className="w-full bg-slate-900 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-fuchsia-500/40"
                        />
                    </div>

                    <div className="space-y-1">
                        <div className="text-[10px] text-slate-400">Anti Tags</div>
                        <input
                            value={antiTags}
                            onChange={(e) => setAntiTags(e.target.value)}
                            placeholder="busy, interior-heavy, workshop-like"
                            className="w-full bg-slate-900 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-fuchsia-500/40"
                        />
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
                        Valid contexts: {IMAGE_CONTEXT_VALUES.join(', ')}
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
                            placeholder="Describe what to change (e.g., 'make it more vibrant', 'add sunset lighting')..."
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
                    
                    <button onClick={() => void handleRegenerate()} disabled={regenerating || (regenMode === 'append_note' ? !regenText.trim() : !editablePrompt.trim())}
                        className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-purple-500/30 bg-purple-500/10 px-3 py-2 text-xs font-medium text-purple-300 hover:bg-purple-500/20 transition disabled:opacity-40">
                        {regenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                        {regenerating ? 'Regenerating…' : regenMode === 'append_note' ? 'Regenerate with Note' : 'Regenerate with Edited Prompt'}
                    </button>
                </div>
            )}
        </div>
    );
}
