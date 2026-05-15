"use client";

import { useEffect, useMemo, useState } from 'react';
import type { AssetRecord, CampaignAestheticBrief, CampaignMediaManifest } from '@/lib/campaigns/schema';
import { normalizeAssetCuration } from '@/lib/campaigns/media/image-selection';
import { TAB_HISTORY_ASSET_TYPES } from '@/lib/campaigns/media/asset-manifest-section';
import { ReviewAssetCard } from './review-asset-card';
import { Search, Image as ImageIcon, Layers, Film, Music, Shirt, Crop, Trash2, Loader2, CheckCheck, Newspaper, Clock, RotateCcw } from 'lucide-react';

// ────────────────────────────────────────────────────────────────────────────
// Tab definitions
// ────────────────────────────────────────────────────────────────────────────

const TABS = [
    { id: 'references', label: 'References', icon: Search },
    { id: 'designed_ads', label: 'Designed Ads', icon: Newspaper },
    { id: 'heroes',     label: 'Heroes & Concepts', icon: ImageIcon },
    { id: 'crops',      label: 'Crops', icon: Crop },
    { id: 'scenes',     label: 'Scenes', icon: Layers },
    { id: 'video',      label: 'Video', icon: Film },
    { id: 'audio',      label: 'Audio', icon: Music },
    { id: 'merch',      label: 'Merch', icon: Shirt },
] as const;

type DeletableAssetType = AssetRecord['assetType'];

const VIDEO_ASSET_TYPES = new Set<DeletableAssetType>([
    'tiktok_seed_video', 'hero_explainer_video', 'threshold_video',
    'countdown_video', 'broll_clip',
]);

const IMAGE_ARTIFACT_TYPES = new Set<DeletableAssetType>([
    'hero_image', 'aesthetic_concept', 'ship_reference_image', 'platform_crop',
    'documentary_detail_image', 'designed_ad_artifact',
]);

function getDeleteEndpoint(slug: string, assetType: DeletableAssetType): string | null {
    if (assetType === 'scene_image') return `/api/groups/campaign/${slug}/media/manifest/scene-image-artifact`;
    if (VIDEO_ASSET_TYPES.has(assetType)) return `/api/groups/campaign/${slug}/media/manifest/video-artifact`;
    if (IMAGE_ARTIFACT_TYPES.has(assetType)) return `/api/groups/campaign/${slug}/media/manifest/image-artifact`;
    return null;
}

// ────────────────────────────────────────────────────────────────────────────
// Extract tab entries from manifest
// ────────────────────────────────────────────────────────────────────────────

function getTabEntries(
    tabId: string,
    manifest: CampaignMediaManifest,
): Array<{ entryKey: string; title: string; asset: AssetRecord }> {
    const entries: Array<{ entryKey: string; title: string; asset: AssetRecord }> = [];

    const formatDesignedAdTitle = (asset: AssetRecord, index: number): string => {
        const tags = asset.tags.map((tag) => tag.toLowerCase());
        const has = (tag: string) => tags.includes(tag.toLowerCase());
        if (has('editorial_cover')) return 'IG Feed · Editorial Cover';
        if (has('postcard_hero')) return 'IG Feed · Postcard Hero';
        if (has('zine_cover')) return 'IG Feed · Zine Cover';
        if (has('quote')) return 'IG Square · Quote Card';
        if (has('air_mail')) return 'IG Square · Air-Mail';
        if (has('scribble')) return 'IG Square · Scribble Social';
        if (has('sticker_sheet')) return 'IG Square · Sticker Sheet';
        if (has('itinerary')) return 'Carousel · Itinerary Card';
        if (has('boarding_pass')) return 'Carousel · Boarding Pass';
        if (has('contributor')) return 'IG Square · Contributor Card';
        if (has('type_hook')) return 'Story/Reels · Type Hook';
        if (has('image_detail')) return 'FB/Google · Image Detail';
        if (has('baggage_tag')) return 'Social · Baggage Tag';
        return `Designed Ad ${index + 1}`;
    };

    const formatSourceDetailTitle = (asset: AssetRecord): string => {
        const detailKind = asset.tags.find((tag) =>
            ['trust_photo', 'artifact_still_life', 'texture_plate', 'human_glimpse', 'motion_plate'].includes(tag),
        );
        if (!detailKind) return 'Source Detail';
        return `Source · ${detailKind.replace(/_/g, ' ')}`;
    };

    switch (tabId) {
        case 'references':
            manifest.images.shipReferences.forEach((asset, i) => {
                entries.push({ entryKey: `ref::${i}::${asset.assetId}`, title: `Reference ${i + 1}`, asset });
            });
            break;

        case 'heroes':
            manifest.images.hero.forEach((asset, i) => {
                entries.push({ entryKey: `hero::${i}::${asset.assetId}`, title: `Hero ${i + 1}`, asset });
            });
            manifest.images.aestheticConcepts.forEach((asset, i) => {
                entries.push({ entryKey: `concept::${i}::${asset.assetId}`, title: `Concept ${i + 1}`, asset });
            });
            break;

        case 'designed_ads':
            (manifest.images.designedAdArtifacts ?? []).forEach((asset, i) => {
                entries.push({ entryKey: `designed::${i}::${asset.assetId}`, title: formatDesignedAdTitle(asset, i), asset });
            });
            (manifest.images.documentaryDetails ?? []).forEach((asset, i) => {
                entries.push({ entryKey: `detail::${i}::${asset.assetId}`, title: formatSourceDetailTitle(asset), asset });
            });
            break;

        case 'crops':
            Object.entries(manifest.images.platformCrops).forEach(([fmt, assets]) => {
                assets.forEach((asset, i) => {
                    entries.push({ entryKey: `crop::${fmt}::${i}::${asset.assetId}`, title: `${fmt} ${i + 1}`, asset });
                });
            });
            break;

        case 'scenes':
            (manifest.images.sceneImages ?? []).forEach((asset, i) => {
                const sceneId = asset.tags.find(t => t !== 'scene') ?? `scene_${i + 1}`;
                entries.push({ entryKey: `scene::${i}::${asset.assetId}`, title: sceneId, asset });
            });
            break;

        case 'video':
            if (manifest.videos.tiktokSeed) {
                entries.push({ entryKey: `vid::tiktok::${manifest.videos.tiktokSeed.assetId}`, title: 'TikTok Seed', asset: manifest.videos.tiktokSeed });
            }
            if (manifest.videos.heroExplainer) {
                entries.push({ entryKey: `vid::explainer::${manifest.videos.heroExplainer.assetId}`, title: 'Hero Explainer', asset: manifest.videos.heroExplainer });
            }
            if (manifest.videos.thresholdAnnouncement) {
                entries.push({ entryKey: `vid::threshold::${manifest.videos.thresholdAnnouncement.assetId}`, title: 'Threshold', asset: manifest.videos.thresholdAnnouncement });
            }
            manifest.videos.countdown.forEach((asset, i) => {
                entries.push({ entryKey: `vid::countdown::${i}::${asset.assetId}`, title: `Countdown ${i + 1}`, asset });
            });
            manifest.videos.broll.forEach((asset, i) => {
                entries.push({ entryKey: `vid::broll::${i}::${asset.assetId}`, title: `B-roll ${i + 1}`, asset });
            });
            break;

        case 'audio':
            if (manifest.audio.ambientNarration) {
                entries.push({ entryKey: `aud::narration::${manifest.audio.ambientNarration.assetId}`, title: 'Ambient Narration', asset: manifest.audio.ambientNarration });
            }
            if (manifest.audio.hypeClip) {
                entries.push({ entryKey: `aud::hype::${manifest.audio.hypeClip.assetId}`, title: 'Hype Clip', asset: manifest.audio.hypeClip });
            }
            if (manifest.audio.themeMusic) {
                entries.push({ entryKey: `aud::theme::${manifest.audio.themeMusic.assetId}`, title: 'Theme Music', asset: manifest.audio.themeMusic });
            }
            break;

        case 'merch':
            manifest.merch.designs.forEach((asset, i) => {
                entries.push({ entryKey: `merch::design::${i}::${asset.assetId}`, title: `Design ${i + 1}`, asset });
            });
            manifest.merch.mockups.forEach((asset, i) => {
                entries.push({ entryKey: `merch::mockup::${i}::${asset.assetId}`, title: `Mockup ${i + 1}`, asset });
            });
            break;
    }

    return entries;
}

function sortEntriesForDisplay(
    tabId: string,
    entries: Array<{ entryKey: string; title: string; asset: AssetRecord }>,
): Array<{ entryKey: string; title: string; asset: AssetRecord }> {
    if (tabId !== 'designed_ads') {
        return entries;
    }

    return [...entries].sort((left, right) => {
        const leftIsDesigned = left.asset.assetType === 'designed_ad_artifact';
        const rightIsDesigned = right.asset.assetType === 'designed_ad_artifact';
        if (leftIsDesigned !== rightIsDesigned) {
            return leftIsDesigned ? -1 : 1;
        }
        return 0;
    });
}

function countDesignedAdArtifacts(entries: Array<{ entryKey: string; title: string; asset: AssetRecord }>): number {
    return entries.filter((entry) => entry.asset.assetType === 'designed_ad_artifact').length;
}

function countDesignedAdSources(entries: Array<{ entryKey: string; title: string; asset: AssetRecord }>): number {
    return entries.filter((entry) => entry.asset.assetType === 'documentary_detail_image').length;
}

// ────────────────────────────────────────────────────────────────────────────
// Status summary helper
// ────────────────────────────────────────────────────────────────────────────

function countStatuses(entries: Array<{ asset: AssetRecord }>) {
    let approved = 0;
    let flagged = 0;
    let auto = 0;
    for (const e of entries) {
        const approvalState = normalizeAssetCuration(e.asset).approvalState;
        if (approvalState === 'human_approved') approved++;
        else if (approvalState === 'auto_approved') auto++;
        else flagged++;
    }
    return { approved, flagged, auto };
}

function isHumanApproved(asset: AssetRecord): boolean {
    return normalizeAssetCuration(asset).approvalState === 'human_approved';
}

// ────────────────────────────────────────────────────────────────────────────
// MediaReviewPanel — Tabbed asset review
// ────────────────────────────────────────────────────────────────────────────

export function MediaReviewPanel(
    { slug, manifest, brief, onManifestRefresh }: {
        slug: string;
        manifest: CampaignMediaManifest;
        brief?: CampaignAestheticBrief | null;
        onManifestRefresh: (targetSlug: string) => Promise<void>;
    }
) {
    const [activeTab, setActiveTab] = useState('references');
    const [bulkRemoving, setBulkRemoving] = useState(false);
    const [bulkApproving, setBulkApproving] = useState(false);
    const [bulkError, setBulkError] = useState('');

    // ── Version History state ─────────────────────────────────────────────
    const [historyOpen, setHistoryOpen] = useState(false);
    const [historyItems, setHistoryItems] = useState<AssetRecord[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyError, setHistoryError] = useState('');
    const [restoringId, setRestoringId] = useState<string | null>(null);

    const tabEntryMap = useMemo(() => {
        const map: Record<string, Array<{ entryKey: string; title: string; asset: AssetRecord }>> = {};
        for (const tab of TABS) {
            map[tab.id] = getTabEntries(tab.id, manifest);
        }
        return map;
    }, [manifest]);

    const totalEntries = useMemo(() => Object.values(tabEntryMap).reduce((sum, arr) => sum + arr.length, 0), [tabEntryMap]);
    const totalStatus = useMemo(() => {
        const all = Object.values(tabEntryMap).flat();
        return countStatuses(all);
    }, [tabEntryMap]);

    const activeEntries = useMemo(
        () => sortEntriesForDisplay(activeTab, tabEntryMap[activeTab] ?? []),
        [activeTab, tabEntryMap],
    );
    const designedAdArtifactCount = useMemo(
        () => countDesignedAdArtifacts(activeEntries),
        [activeEntries],
    );
    const designedAdSourceCount = useMemo(
        () => countDesignedAdSources(activeEntries),
        [activeEntries],
    );
    const activeTabDef = TABS.find(t => t.id === activeTab) ?? TABS[0];
    const ActiveIcon = activeTabDef.icon;
    const removableEntries = activeEntries.filter((entry) => getDeleteEndpoint(slug, entry.asset.assetType) !== null);
    const removableUnapprovedEntries = removableEntries.filter((entry) => !isHumanApproved(entry.asset));
    
    const pendingApprovalEntries = activeEntries.filter((entry) => {
        const s = normalizeAssetCuration(entry.asset).approvalState;
        return s !== 'human_approved' && s !== 'rejected' && s !== 'revision_required';
    });

    const handleRefresh = async () => {
        await onManifestRefresh(slug);
    };

    // Reset history whenever the active tab changes
    useEffect(() => {
        setHistoryOpen(false);
        setHistoryItems([]);
        setHistoryError('');
    }, [activeTab]);

    const tabHistoryAssetTypes = TAB_HISTORY_ASSET_TYPES[activeTab] ?? [];
    const tabSupportsHistory = tabHistoryAssetTypes.length > 0;

    const handleToggleHistory = async () => {
        if (historyOpen) {
            setHistoryOpen(false);
            return;
        }
        if (tabHistoryAssetTypes.length === 0) return;
        setHistoryOpen(true);
        setHistoryLoading(true);
        setHistoryError('');
        try {
            const fetches = tabHistoryAssetTypes.map((assetType) =>
                fetch(`/api/groups/campaign/${slug}/media/history?assetType=${encodeURIComponent(assetType)}`, { cache: 'no-store' })
                    .then((r) => r.json() as Promise<{ assets?: AssetRecord[]; error?: string }>)
            );
            const results = await Promise.all(fetches);
            const combined: AssetRecord[] = results.flatMap((r) => r.assets ?? []);
            combined.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
            setHistoryItems(combined.slice(0, 20));
        } catch {
            setHistoryError('Failed to load version history.');
        } finally {
            setHistoryLoading(false);
        }
    };

    const handleRestore = async (assetId: string) => {
        if (restoringId) return;
        setRestoringId(assetId);
        try {
            const res = await fetch(`/api/groups/campaign/${slug}/media/history/restore`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ assetId }),
            });
            const data = await res.json() as { error?: string };
            if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
            // Remove restored item from history list and refresh manifest
            setHistoryItems((prev) => prev.filter((a) => a.assetId !== assetId));
            await handleRefresh();
        } catch (err) {
            setHistoryError(err instanceof Error ? err.message : 'Restore failed.');
        } finally {
            setRestoringId(null);
        }
    };

    const handleBulkApprove = async () => {
        if (pendingApprovalEntries.length === 0 || bulkApproving) return;

        const confirmed = window.confirm(`Approve ${pendingApprovalEntries.length} pending assets in "${activeTabDef.label}"?`);
        if (!confirmed) return;

        setBulkApproving(true);
        setBulkError('');

        try {
            const settled: PromiseSettledResult<void>[] = [];
            for (const entry of pendingApprovalEntries) {
                try {
                    const response = await fetch(`/api/groups/campaign/${slug}/media/curation`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            assetId: entry.asset.assetId,
                            approvalState: 'human_approved',
                        }),
                    });
                    if (!response.ok) throw new Error('API Error');
                    settled.push({ status: 'fulfilled', value: undefined });
                } catch (err) {
                    settled.push({ status: 'rejected', reason: err });
                }
            }

            const failures = settled.filter((item): item is PromiseRejectedResult => item.status === 'rejected');
            if (failures.length > 0) {
                setBulkError(`Approved ${settled.length - failures.length}/${settled.length}. Some failed.`);
            }

            await handleRefresh();
        } catch (error: unknown) {
            setBulkError(error instanceof Error ? error.message : 'Bulk approve failed');
        } finally {
            setBulkApproving(false);
        }
    };

    const handleBulkRemove = async (
        entriesToRemove: Array<{ entryKey: string; title: string; asset: AssetRecord }>,
        confirmationMessage: string,
    ) => {
        if (entriesToRemove.length === 0 || bulkRemoving) return;

        const confirmed = window.confirm(confirmationMessage);
        if (!confirmed) return;

        setBulkRemoving(true);
        setBulkError('');

        try {
            const settled: PromiseSettledResult<void>[] = [];
            for (const entry of entriesToRemove) {
                const endpoint = getDeleteEndpoint(slug, entry.asset.assetType);
                if (!endpoint) continue;

                try {
                    const response = await fetch(endpoint, {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ assetId: entry.asset.assetId }),
                    });

                    if (!response.ok) {
                        const payload = await response.json().catch(() => ({}));
                        const message = payload?.error ?? `Delete failed (${response.status})`;
                        throw new Error(`${entry.asset.assetId}: ${message}`);
                    }

                    settled.push({ status: 'fulfilled', value: undefined });
                } catch (error) {
                    settled.push({
                        status: 'rejected',
                        reason: error,
                    });
                }
            }

            const failures = settled.filter((item): item is PromiseRejectedResult => item.status === 'rejected');
            if (failures.length > 0) {
                setBulkError(`Removed ${settled.length - failures.length}/${settled.length}. ${failures[0].reason instanceof Error ? failures[0].reason.message : 'Some deletions failed.'}`);
            }

            await handleRefresh();
        } catch (error: unknown) {
            setBulkError(error instanceof Error ? error.message : 'Bulk remove failed');
        } finally {
            setBulkRemoving(false);
        }
    };

    const handleRemoveAllInTab = async () => {
        await handleBulkRemove(
            removableEntries,
            `Remove all ${removableEntries.length} assets from "${activeTabDef.label}"?\n\nThis deactivates the asset records and removes them from the manifest.`
        );
    };

    const handleRemoveNotApprovedInTab = async () => {
        await handleBulkRemove(
            removableUnapprovedEntries,
            `Remove ${removableUnapprovedEntries.length} non-approved assets from "${activeTabDef.label}"?\n\nOnly human-approved assets will be kept in this tab.`
        );
    };

    if (totalEntries === 0) return null;

    return (
        <div className="border border-white/10 rounded-xl bg-slate-900/50 overflow-hidden">
            {/* ── Summary header ───────────────────────────────────────── */}
            <div className="px-4 py-2.5 border-b border-white/5 flex items-center justify-between">
                <span className="text-xs text-slate-400 uppercase tracking-widest">Review Assets</span>
                <div className="flex items-center gap-4 text-[10px] text-slate-500">
                    <span className="flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        {totalStatus.approved} approved
                    </span>
                    <span className="flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
                        {totalStatus.auto} auto
                    </span>
                    {totalStatus.flagged > 0 && (
                        <span className="flex items-center gap-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                            {totalStatus.flagged} flagged
                        </span>
                    )}
                    <span>{totalEntries} total</span>
                </div>
            </div>

            {/* ── Tab bar ──────────────────────────────────────────────── */}
            <div className="flex gap-0.5 overflow-x-auto border-b border-white/5 px-2">
                {TABS.map((tab) => {
                    const entries = tabEntryMap[tab.id] ?? [];
                    const count = entries.length;
                    const isActive = activeTab === tab.id;
                    const Icon = tab.icon;
                    const status = countStatuses(entries);
                    const dotColor = count === 0
                        ? 'bg-slate-700'
                        : status.flagged > 0
                            ? 'bg-amber-400'
                            : status.approved === count
                                ? 'bg-emerald-400'
                                : 'bg-cyan-400';

                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-1.5 px-3 py-2.5 text-[11px] font-medium border-b-2 transition-colors whitespace-nowrap ${
                                isActive
                                    ? 'border-cyan-400 text-white'
                                    : 'border-transparent text-slate-500 hover:text-slate-300'
                            }`}
                        >
                            <Icon className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">{tab.label}</span>
                            <span className={`min-w-[1.25rem] text-center px-1 py-0.5 rounded-full text-[9px] leading-none ${
                                isActive ? 'bg-white/10 text-white' : 'bg-white/5 text-slate-500'
                            }`}>
                                {count}
                            </span>
                            <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
                        </button>
                    );
                })}
            </div>

            {/* ── Tab content ──────────────────────────────────────────── */}
            {activeEntries.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-16 text-slate-600">
                    <ActiveIcon className="h-10 w-10 opacity-40" />
                    <span className="text-xs">No {activeTabDef.label.toLowerCase()} assets generated yet</span>
                </div>
            ) : (
                <div className="space-y-3 p-4">
                    <div className="flex items-center justify-between gap-3">
                        <div className="text-[11px] text-slate-500">
                            {activeEntries.length} assets in {activeTabDef.label}
                        </div>
                        <div className="flex items-center gap-2">
                            {tabSupportsHistory && (
                                <button
                                    onClick={() => void handleToggleHistory()}
                                    disabled={historyLoading}
                                    className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] transition disabled:opacity-40 ${
                                        historyOpen
                                            ? 'border-violet-500/40 bg-violet-500/15 text-violet-200 hover:bg-violet-500/25'
                                            : 'border-white/15 bg-white/5 text-slate-300 hover:bg-white/10'
                                    }`}
                                >
                                    {historyLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Clock className="h-3.5 w-3.5" />}
                                    {historyOpen ? 'Hide History' : 'History'}
                                </button>
                            )}
                            {pendingApprovalEntries.length > 0 && (
                                <button
                                    onClick={() => void handleBulkApprove()}
                                    disabled={bulkApproving}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-1.5 text-[11px] text-emerald-200 hover:bg-emerald-500/20 transition disabled:opacity-40"
                                >
                                    {bulkApproving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCheck className="h-3.5 w-3.5" />}
                                    {bulkApproving ? 'Approving…' : 'Approve All Pending'}
                                </button>
                            )}
                            {removableUnapprovedEntries.length > 0 && (
                                <button
                                    onClick={() => void handleRemoveNotApprovedInTab()}
                                    disabled={bulkRemoving}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-1.5 text-[11px] text-amber-200 hover:bg-amber-500/20 transition disabled:opacity-40"
                                >
                                    {bulkRemoving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                    {bulkRemoving ? 'Removing…' : 'Remove Not Approved'}
                                </button>
                            )}
                            {removableEntries.length > 0 && (
                                <button
                                    onClick={() => void handleRemoveAllInTab()}
                                    disabled={bulkRemoving}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-1.5 text-[11px] text-red-300 hover:bg-red-500/20 transition disabled:opacity-40"
                                >
                                    {bulkRemoving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                    {bulkRemoving ? 'Removing…' : 'Remove All In Tab'}
                                </button>
                            )}
                        </div>
                    </div>

                    {bulkError && (
                        <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-[11px] text-red-300">
                            {bulkError}
                        </div>
                    )}

                    {/* ── Version History Panel ──────────────────────── */}
                    {historyOpen && (
                        <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 overflow-hidden">
                            <div className="flex items-center justify-between border-b border-violet-500/10 px-4 py-2.5">
                                <div className="flex items-center gap-2 text-[11px] text-violet-200">
                                    <Clock className="h-3.5 w-3.5" />
                                    <span className="font-medium uppercase tracking-widest">Previous Versions</span>
                                    {!historyLoading && (
                                        <span className="text-violet-400">— {historyItems.length} found</span>
                                    )}
                                </div>
                                <p className="text-[10px] text-slate-500">Assets orphaned by prior generation runs. Restore adds them back to the manifest.</p>
                            </div>

                            {historyError && (
                                <div className="px-4 py-2 text-[11px] text-red-300 border-b border-red-500/10 bg-red-500/5">
                                    {historyError}
                                </div>
                            )}

                            {historyLoading ? (
                                <div className="flex items-center justify-center gap-2 py-8 text-slate-500 text-[11px]">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Loading history…
                                </div>
                            ) : historyItems.length === 0 ? (
                                <div className="py-8 text-center text-[11px] text-slate-500">
                                    No previous versions found for this tab.
                                </div>
                            ) : (
                                <div className="grid gap-3 p-4 md:grid-cols-3 xl:grid-cols-4">
                                    {historyItems.map((asset) => (
                                        <div
                                            key={asset.assetId}
                                            className="flex flex-col gap-2 rounded-lg border border-white/10 bg-slate-950/60 p-2"
                                        >
                                            {/* Preview */}
                                            {asset.mimeType.startsWith('image/') ? (
                                                <img
                                                    src={`${asset.assetType === 'ship_reference_image' && asset.sourceThumbnailUrl ? asset.sourceThumbnailUrl : asset.url}?v=${encodeURIComponent(asset.createdAt)}`}
                                                    alt={asset.assetId}
                                                    className="h-32 w-full rounded-md object-cover"
                                                />
                                            ) : asset.mimeType.startsWith('video/') ? (
                                                <video src={asset.url} className="h-32 w-full rounded-md bg-black object-cover" />
                                            ) : asset.mimeType.startsWith('audio/') ? (
                                                <div className="flex h-12 items-center justify-center rounded-md bg-slate-900 text-[10px] text-slate-400">
                                                    Audio — {asset.assetType.replace(/_/g, ' ')}
                                                </div>
                                            ) : (
                                                <div className="flex h-12 items-center justify-center rounded-md bg-slate-900 text-[10px] text-slate-400">
                                                    {asset.assetType.replace(/_/g, ' ')}
                                                </div>
                                            )}

                                            {/* Meta */}
                                            <div className="space-y-0.5 px-0.5">
                                                <p className="text-[10px] font-mono text-slate-400 truncate">{asset.assetId}</p>
                                                <p className="text-[10px] text-slate-500">
                                                    {new Date(asset.createdAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
                                                </p>
                                            </div>

                                            {/* Restore button */}
                                            <button
                                                onClick={() => void handleRestore(asset.assetId)}
                                                disabled={restoringId !== null}
                                                className="flex w-full items-center justify-center gap-1.5 rounded-md border border-violet-500/25 bg-violet-500/10 py-1.5 text-[11px] text-violet-200 hover:bg-violet-500/20 transition disabled:opacity-40"
                                            >
                                                {restoringId === asset.assetId
                                                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                    : <RotateCcw className="h-3.5 w-3.5" />}
                                                {restoringId === asset.assetId ? 'Restoring…' : 'Restore'}
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'designed_ads' && brief?.identityBlueprint && (
                        <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3 space-y-2">
                            <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-widest text-cyan-300">
                                <span>Identity Blueprint</span>
                                <span className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2 py-1 normal-case tracking-normal text-[11px]">
                                    {brief.identityBlueprint.energyMode.replace(/_/g, ' ')}
                                </span>
                                <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 normal-case tracking-normal text-[11px] text-slate-300">
                                    {brief.identityBlueprint.socialScale.replace(/_/g, ' ')}
                                </span>
                            </div>
                            <div className="text-[11px] text-slate-300">
                                {brief.identityBlueprint.summary}
                            </div>
                            <div className="text-[11px] text-slate-400">
                                Avoid defaults: {brief.identityBlueprint.forbiddenDefaults.join(', ')}
                            </div>
                        </div>
                    )}

                    {activeTab === 'designed_ads' && (
                        <div className="rounded-xl border border-fuchsia-500/20 bg-fuchsia-500/5 p-3 text-[11px] text-slate-300">
                            <span className="font-medium text-fuchsia-200">Designed Ads review:</span>{' '}
                            {designedAdArtifactCount} template-rendered ads, {designedAdSourceCount} documentary source modules.
                            Source modules are shown in this tab for traceability and appear after the final ads.
                        </div>
                    )}

                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {activeEntries.map((entry) => (
                            <ReviewAssetCard
                                key={entry.entryKey}
                                slug={slug}
                                asset={entry.asset}
                                title={entry.title}
                                entryKey={entry.entryKey}
                                identityBlueprint={brief?.identityBlueprint}
                                onRefresh={handleRefresh}
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

