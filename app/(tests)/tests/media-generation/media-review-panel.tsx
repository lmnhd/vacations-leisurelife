"use client";

import { useMemo, useState } from 'react';
import type { AssetRecord, CampaignMediaManifest } from '@/lib/campaigns/schema';
import { ReviewAssetCard } from './review-asset-card';
import { Search, Image as ImageIcon, Layers, Film, Music, Shirt } from 'lucide-react';

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

    const handleRefresh = async () => {
        await onManifestRefresh(slug);
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
                <div className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-3">
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
            )}
        </div>
    );
}
