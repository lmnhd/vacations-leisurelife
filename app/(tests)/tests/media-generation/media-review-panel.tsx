"use client";

import { useMemo, useState } from 'react';
import type { AssetRecord, CampaignMediaManifest } from '@/lib/campaigns/schema';
import { normalizeAssetCuration } from '@/lib/campaigns/media/image-selection';
import { ReviewAssetCard } from './review-asset-card';
import { Search, Image as ImageIcon, Layers, Film, Music, Shirt, Trash2, Loader2 } from 'lucide-react';

// ────────────────────────────────────────────────────────────────────────────
// Tab definitions
// ────────────────────────────────────────────────────────────────────────────

const TABS = [
    { id: 'references', label: 'References', icon: Search },
    { id: 'heroes',     label: 'Heroes & Concepts', icon: ImageIcon },
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

// ────────────────────────────────────────────────────────────────────────────
// Status summary helper
// ────────────────────────────────────────────────────────────────────────────

function countStatuses(entries: Array<{ asset: AssetRecord }>) {
    let approved = 0;
    let flagged = 0;
    let auto = 0;
    for (const e of entries) {
        if (e.asset.reviewStatus === 'human_approved') approved++;
        else if (e.asset.reviewStatus === 'needs_review') flagged++;
        else auto++;
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
    { slug, manifest, onManifestRefresh }: {
        slug: string;
        manifest: CampaignMediaManifest;
        onManifestRefresh: (targetSlug: string) => Promise<void>;
    }
) {
    const [activeTab, setActiveTab] = useState('references');
    const [bulkRemoving, setBulkRemoving] = useState(false);
    const [bulkError, setBulkError] = useState('');

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

    const activeEntries = tabEntryMap[activeTab] ?? [];
    const activeTabDef = TABS.find(t => t.id === activeTab) ?? TABS[0];
    const ActiveIcon = activeTabDef.icon;
    const removableEntries = activeEntries.filter((entry) => getDeleteEndpoint(slug, entry.asset.assetType) !== null);
    const removableUnapprovedEntries = removableEntries.filter((entry) => !isHumanApproved(entry.asset));

    const handleRefresh = async () => {
        await onManifestRefresh(slug);
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
            const settled = await Promise.allSettled(
                entriesToRemove.map(async (entry) => {
                    const endpoint = getDeleteEndpoint(slug, entry.asset.assetType);
                    if (!endpoint) return;

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
                })
            );

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

                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {activeEntries.map((entry) => (
                            <ReviewAssetCard
                                key={entry.entryKey}
                                slug={slug}
                                asset={entry.asset}
                                title={entry.title}
                                entryKey={entry.entryKey}
                                onRefresh={handleRefresh}
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
