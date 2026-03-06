"use client";

import { useMemo, useState } from 'react';
import type { AssetRecord, CampaignMediaManifest, ReviewStatus } from '@/lib/campaigns/schema';

function formatReviewStatus(reviewStatus: ReviewStatus): string {
    return reviewStatus.replace(/_/g, ' ');
}

function formatFileSize(fileSizeBytes: number): string {
    if (fileSizeBytes < 1024) {
        return `${fileSizeBytes} B`;
    }

    if (fileSizeBytes < 1024 * 1024) {
        return `${(fileSizeBytes / 1024).toFixed(1)} KB`;
    }

    return `${(fileSizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function buildReviewEntries(manifest: CampaignMediaManifest): Array<{ section: string; title: string; asset: AssetRecord; }> {
    const reviewEntries: Array<{ section: string; title: string; asset: AssetRecord; }> = [];

    manifest.images.shipReferences.forEach((asset, index) => {
        reviewEntries.push({ section: 'Images', title: `Reference ${index + 1}`, asset });
    });
    manifest.images.hero.forEach((asset, index) => {
        reviewEntries.push({ section: 'Images', title: `Hero ${index + 1}`, asset });
    });
    manifest.images.aestheticConcepts.forEach((asset, index) => {
        reviewEntries.push({ section: 'Images', title: `Concept ${index + 1}`, asset });
    });
    Object.entries(manifest.images.platformCrops).forEach(([formatKey, assets]) => {
        assets.forEach((asset, index) => {
            reviewEntries.push({ section: 'Images', title: `${formatKey} ${index + 1}`, asset });
        });
    });

    if (manifest.videos.tiktokSeed) {
        reviewEntries.push({ section: 'Video', title: 'TikTok Seed', asset: manifest.videos.tiktokSeed });
    }
    if (manifest.videos.heroExplainer) {
        reviewEntries.push({ section: 'Video', title: 'Hero Explainer', asset: manifest.videos.heroExplainer });
    }
    if (manifest.videos.thresholdAnnouncement) {
        reviewEntries.push({ section: 'Video', title: 'Threshold Announcement', asset: manifest.videos.thresholdAnnouncement });
    }
    manifest.videos.countdown.forEach((asset, index) => {
        reviewEntries.push({ section: 'Video', title: `Countdown ${index + 1}`, asset });
    });
    manifest.videos.broll.forEach((asset, index) => {
        reviewEntries.push({ section: 'Video', title: `B-roll ${index + 1}`, asset });
    });

    if (manifest.audio.ambientNarration) {
        reviewEntries.push({ section: 'Audio', title: 'Ambient Narration', asset: manifest.audio.ambientNarration });
    }
    if (manifest.audio.hypeClip) {
        reviewEntries.push({ section: 'Audio', title: 'Hype Clip', asset: manifest.audio.hypeClip });
    }
    if (manifest.audio.themeMusic) {
        reviewEntries.push({ section: 'Audio', title: 'Theme Music', asset: manifest.audio.themeMusic });
    }

    manifest.merch.designs.forEach((asset, index) => {
        reviewEntries.push({ section: 'Merch', title: `Design ${index + 1}`, asset });
    });
    manifest.merch.mockups.forEach((asset, index) => {
        reviewEntries.push({ section: 'Merch', title: `Mockup ${index + 1}`, asset });
    });

    return reviewEntries;
}

function renderAssetPreview(asset: AssetRecord) {
    if (asset.mimeType.startsWith('image/')) {
        return <img src={asset.url} alt={asset.assetId} className="h-40 w-full rounded-lg object-cover" />;
    }

    if (asset.mimeType.startsWith('audio/')) {
        return <audio controls src={asset.url} className="w-full" />;
    }

    if (asset.mimeType.startsWith('video/')) {
        return <video controls src={asset.url} className="h-40 w-full rounded-lg bg-slate-950" />;
    }

    return (
        <a
            href={asset.url}
            target="_blank"
            rel="noreferrer"
            className="flex h-24 items-center justify-center rounded-lg border border-white/10 bg-slate-950 text-xs text-cyan-400 hover:text-cyan-300"
        >
            Open asset
        </a>
    );
}

export function MediaReviewPanel(
    { slug, manifest, onManifestRefresh }: { slug: string; manifest: CampaignMediaManifest; onManifestRefresh: (targetSlug: string) => Promise<void>; }
) {
    const reviewEntries = useMemo(() => buildReviewEntries(manifest), [manifest]);
    const [noteValues, setNoteValues] = useState<Record<string, string>>({});
    const [savingState, setSavingState] = useState<Record<string, boolean>>({});
    const [errorState, setErrorState] = useState<Record<string, string>>({});

    const handleReviewUpdate = async (asset: AssetRecord, reviewStatus: ReviewStatus) => {
        setSavingState((currentState) => ({ ...currentState, [asset.assetId]: true }));
        setErrorState((currentState) => ({ ...currentState, [asset.assetId]: '' }));

        try {
            const reviewNotes = noteValues[asset.assetId]?.trim();
            const response = await fetch(`/api/groups/campaign/${slug}/media/review`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    assetId: asset.assetId,
                    reviewStatus,
                    ...(reviewNotes ? { reviewNotes } : {}),
                }),
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || 'Review update failed');
            }
            await onManifestRefresh(slug);
        } catch (error: unknown) {
            setErrorState((currentState) => ({
                ...currentState,
                [asset.assetId]: error instanceof Error ? error.message : 'Unknown error',
            }));
        } finally {
            setSavingState((currentState) => ({ ...currentState, [asset.assetId]: false }));
        }
    };

    if (reviewEntries.length === 0) {
        return null;
    }

    return (
        <div className="border border-white/10 rounded-xl bg-slate-900/50 overflow-hidden">
            <div className="px-4 py-2 border-b border-white/5 flex items-center justify-between">
                <span className="text-xs text-slate-400 uppercase tracking-widest">Review Assets</span>
                <span className="text-[10px] text-slate-500">{reviewEntries.length} reviewable assets</span>
            </div>
            <div className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-3">
                {reviewEntries.map((entry) => {
                    const isSaving = savingState[entry.asset.assetId] === true;
                    const errorMessage = errorState[entry.asset.assetId];
                    const currentNotes = noteValues[entry.asset.assetId] ?? entry.asset.reviewNotes ?? '';

                    return (
                        <div key={entry.asset.assetId} className="rounded-xl border border-white/10 bg-slate-950/60 p-3 space-y-3">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <div className="text-[10px] uppercase tracking-widest text-slate-500">{entry.section}</div>
                                    <div className="text-sm font-medium text-white">{entry.title}</div>
                                    <div className="text-[10px] text-slate-500">{entry.asset.assetType} · {entry.asset.generator}</div>
                                </div>
                                <div className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-wide ${entry.asset.reviewStatus === 'human_approved'
                                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                                    : entry.asset.reviewStatus === 'auto_approved'
                                        ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300'
                                        : 'border-amber-500/40 bg-amber-500/10 text-amber-300'}`}>
                                    {formatReviewStatus(entry.asset.reviewStatus)}
                                </div>
                            </div>

                            {renderAssetPreview(entry.asset)}

                            <div className="space-y-1 text-[11px] text-slate-400">
                                <div>Size: {formatFileSize(entry.asset.fileSizeBytes)}</div>
                                <div>Created: {new Date(entry.asset.createdAt).toLocaleString()}</div>
                                {entry.asset.reviewedAt ? <div>Reviewed: {new Date(entry.asset.reviewedAt).toLocaleString()}</div> : null}
                            </div>

                            <textarea
                                value={currentNotes}
                                onChange={(event) => setNoteValues((currentState) => ({ ...currentState, [entry.asset.assetId]: event.target.value }))}
                                placeholder="Optional review notes"
                                className="min-h-20 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/40"
                            />

                            {errorMessage ? (
                                <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-[11px] text-red-300">
                                    {errorMessage}
                                </div>
                            ) : null}

                            <div className="flex gap-2">
                                <button
                                    onClick={() => void handleReviewUpdate(entry.asset, 'human_approved')}
                                    disabled={isSaving}
                                    className="flex-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-50"
                                >
                                    {isSaving ? 'Saving...' : 'Approve'}
                                </button>
                                <button
                                    onClick={() => void handleReviewUpdate(entry.asset, 'needs_review')}
                                    disabled={isSaving}
                                    className="flex-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-300 transition hover:bg-amber-500/20 disabled:opacity-50"
                                >
                                    {isSaving ? 'Saving...' : 'Needs Review'}
                                </button>
                            </div>

                            <a
                                href={entry.asset.url}
                                target="_blank"
                                rel="noreferrer"
                                className="block text-center text-[11px] text-cyan-400 hover:text-cyan-300"
                            >
                                Open original asset
                            </a>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
