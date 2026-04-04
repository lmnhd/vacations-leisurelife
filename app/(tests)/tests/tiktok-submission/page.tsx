'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

interface TikTokProviderStatusResponse {
    ready: boolean;
    reason?: string;
    detail?: string;
    expiredAt?: string;
    canRefresh?: boolean;
    openId?: string;
    accountLabel?: string;
    isPersonalTestAccount?: boolean;
    accessTokenExpiresAt?: string | null;
    scope?: string | null;
    requestedScopes?: string[];
    grantedScopes?: string[];
    hasVideoUploadScope?: boolean;
    hasVideoPublishScope?: boolean;
    zeroManualPostingReady?: boolean;
}

interface AssetPreviewRecord {
    assetId: string;
    url: string;
    mimeType?: string;
}

interface ManifestPreviewResponse {
    videos?: {
        tiktokSeed?: AssetPreviewRecord | null;
    };
    images?: {
        hero?: AssetPreviewRecord[];
    };
    error?: string;
}

interface TikTokScheduledPostRecord {
    postId: string;
    platform: string;
    assetId: string;
    copyVariant: string;
    scheduledAt: string;
    campaignStage: string;
    status: string;
    externalPostId?: string;
    notes?: string[];
}

interface DistributionStatusResponse {
    schedule?: {
        posts: TikTokScheduledPostRecord[];
    };
    error?: string;
}

interface DistributionDispatchResponse {
    message?: string;
    error?: string;
    warnings?: string[];
}

interface SyncTikTokResponse {
    message?: string;
    error?: string;
    summary?: {
        checked: number;
        posted: number;
        draftCreated: number;
        failed: number;
    };
}

const DEFAULT_SLUG = 'bp-opendeck-icon-2027-7n-caribbean';

function readProviderMessage(status: TikTokProviderStatusResponse | null): string {
    if (!status) {
        return 'Loading TikTok provider state...';
    }

    if (!status.ready) {
        if (status.reason === 'token_expired') {
            return `Token expired at ${status.expiredAt ?? 'unknown'}${status.canRefresh ? ' with refresh available.' : ' and cannot be refreshed.'}`;
        }

        return status.detail ?? status.reason ?? 'Provider not configured.';
    }

    if (status.zeroManualPostingReady) {
        return 'Direct Post capable: the token includes video.publish.';
    }

    return 'Upload-only mode: the token includes video.upload but not video.publish yet.';
}

function readRecordingBlocker(status: TikTokProviderStatusResponse | null): string | null {
    if (!status) {
        return 'Provider status is still loading.';
    }

    if (!status.ready) {
        if (status.reason === 'token_expired') {
            return 'Do not record yet: the TikTok access token is expired. Refresh or re-authorize first so the demo starts from a healthy connected state.';
        }

        return 'Do not record yet: TikTok provider status is not ready.';
    }

    return null;
}

export default function TikTokSubmissionDemoPage() {
    const [slug, setSlug] = useState(DEFAULT_SLUG);
    const [providerStatus, setProviderStatus] = useState<TikTokProviderStatusResponse | null>(null);
    const [statusMessage, setStatusMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const [refreshingToken, setRefreshingToken] = useState(false);
    const [manifestPreview, setManifestPreview] = useState<ManifestPreviewResponse | null>(null);
    const [mediaMessage, setMediaMessage] = useState('');
    const [loadingMedia, setLoadingMedia] = useState(false);
    const [recordingMode, setRecordingMode] = useState(false);
    const [runningDraft, setRunningDraft] = useState(false);
    const [syncingUpload, setSyncingUpload] = useState(false);
    const [hasSyncedUpload, setHasSyncedUpload] = useState(false);
    const [loadingUploadRecord, setLoadingUploadRecord] = useState(false);
    const [uploadMessage, setUploadMessage] = useState('');
    const [uploadRecord, setUploadRecord] = useState<TikTokScheduledPostRecord | null>(null);

    const trimmedSlug = slug.trim();
    const reviewRoute = useMemo(() => `/tests/campaign-landing/${trimmedSlug}`, [trimmedSlug]);
    const distributionRoute = useMemo(() => '/tests/distribution', []);
    const distributionStatusRoute = useMemo(() => `/api/groups/campaign/${trimmedSlug}/media/distribution`, [trimmedSlug]);
    const manifestRoute = useMemo(() => `/api/groups/campaign/${trimmedSlug}/media/manifest`, [trimmedSlug]);
    const blocker = readRecordingBlocker(providerStatus);
    const tiktokVideo = manifestPreview?.videos?.tiktokSeed ?? null;
    const posterImage = manifestPreview?.images?.hero?.[0] ?? null;

    async function loadStatus() {
        setLoading(true);
        setStatusMessage('');

        try {
            const response = await fetch('/api/integrations/tiktok/status', { cache: 'no-store' });
            const data = await response.json() as TikTokProviderStatusResponse;
            setProviderStatus(data);
            if (!response.ok && !data.ready) {
                setStatusMessage(readProviderMessage(data));
                return;
            }

            setStatusMessage(readProviderMessage(data));
        } catch (error) {
            setProviderStatus(null);
            setStatusMessage(error instanceof Error ? error.message : 'Failed to load provider status.');
        } finally {
            setLoading(false);
        }
    }

    async function handleRefreshToken() {
        setRefreshingToken(true);
        setStatusMessage('');

        try {
            const response = await fetch('/api/integrations/tiktok/refresh', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            });

            const data = await response.json() as {
                ok?: boolean;
                error?: string;
                message?: string;
                status?: TikTokProviderStatusResponse;
            };

            if (!response.ok || !data.ok) {
                throw new Error(data.error ?? 'Failed to refresh TikTok token.');
            }

            if (data.status) {
                setProviderStatus(data.status);
                setStatusMessage(`${data.message ?? 'TikTok token refreshed.'} ${readProviderMessage(data.status)}`);
            } else {
                setStatusMessage(data.message ?? 'TikTok token refreshed.');
                await loadStatus();
            }
        } catch (error) {
            setStatusMessage(error instanceof Error ? error.message : 'Failed to refresh TikTok token.');
        } finally {
            setRefreshingToken(false);
        }
    }

    async function loadMediaPreview() {
        if (!trimmedSlug) {
            setManifestPreview(null);
            setMediaMessage('Enter a campaign slug first.');
            return;
        }

        setLoadingMedia(true);
        setMediaMessage('');

        try {
            const response = await fetch(`/api/groups/campaign/${trimmedSlug}/media/manifest`, { cache: 'no-store' });
            const data = await response.json() as ManifestPreviewResponse;

            if (!response.ok) {
                throw new Error(data.error ?? 'Failed to load campaign media manifest.');
            }

            setManifestPreview(data);

            if (data.videos?.tiktokSeed?.url) {
                setMediaMessage('Generated TikTok seed video is loaded and visible for the recording.');
            } else {
                setMediaMessage('No TikTok seed video found for this campaign yet.');
            }
        } catch (error) {
            setManifestPreview(null);
            setMediaMessage(error instanceof Error ? error.message : 'Failed to load campaign media preview.');
        } finally {
            setLoadingMedia(false);
        }
    }

    async function loadUploadRecord() {
        if (!trimmedSlug) {
            setUploadRecord(null);
            setUploadMessage('Enter a campaign slug first.');
            return;
        }

        setLoadingUploadRecord(true);

        try {
            const response = await fetch(`/api/groups/campaign/${trimmedSlug}/media/distribution`, { cache: 'no-store' });
            const data = await response.json() as DistributionStatusResponse;

            if (!response.ok) {
                throw new Error(data.error ?? 'Failed to load TikTok upload record.');
            }

            const latestTikTokPost = (data.schedule?.posts ?? []).find((post) => post.platform === 'tiktok') ?? null;
            setUploadRecord(latestTikTokPost);
            setUploadMessage(latestTikTokPost
                ? `TikTok upload record loaded. Current status: ${latestTikTokPost.status}.`
                : 'No TikTok upload record found for this campaign yet.');
        } catch (error) {
            setUploadRecord(null);
            setUploadMessage(error instanceof Error ? error.message : 'Failed to load TikTok upload record.');
        } finally {
            setLoadingUploadRecord(false);
        }
    }

    async function handleCreateTikTokDraft() {
        if (!trimmedSlug) {
            setUploadMessage('Enter a campaign slug first.');
            return;
        }

        setRunningDraft(true);
        setUploadMessage('');

        try {
            const response = await fetch(`/api/groups/campaign/${trimmedSlug}/media/distribute`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mode: 'dispatch',
                    dryRun: false,
                    providerMode: 'live',
                    forceDispatch: true,
                    caller: 'human',
                    platforms: ['tiktok'],
                }),
            });

            const data = await response.json() as DistributionDispatchResponse;
            if (!response.ok) {
                throw new Error(data.error ?? 'Failed to create TikTok draft.');
            }

            setUploadMessage(data.message ?? 'TikTok draft request completed.');
            await loadUploadRecord();
        } catch (error) {
            setUploadMessage(error instanceof Error ? error.message : 'Failed to create TikTok draft.');
        } finally {
            setRunningDraft(false);
        }
    }

    async function handleSyncTikTokUpload() {
        if (!trimmedSlug) {
            setUploadMessage('Enter a campaign slug first.');
            return;
        }

        setSyncingUpload(true);
        setHasSyncedUpload(true);

        try {
            const response = await fetch(`/api/groups/campaign/${trimmedSlug}/media/distribution/sync`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ platform: 'tiktok' }),
            });

            const data = await response.json() as SyncTikTokResponse;
            if (!response.ok) {
                throw new Error(data.error ?? 'Failed to sync TikTok upload status.');
            }

            const summary = data.summary;
            setUploadMessage(summary
                ? `Sync complete. Checked ${summary.checked}, posted ${summary.posted}, drafts ${summary.draftCreated}, failed ${summary.failed}.`
                : (data.message ?? 'TikTok sync complete.'));
            await loadUploadRecord();
        } catch (error) {
            setUploadMessage(error instanceof Error ? error.message : 'Failed to sync TikTok upload status.');
        } finally {
            setSyncingUpload(false);
        }
    }

    useEffect(() => {
        void loadStatus();
    }, []);

    useEffect(() => {
        void loadMediaPreview();
        void loadUploadRecord();
    }, [trimmedSlug]);

    const recordingSteps = [
        'Click Refresh Provider Status.',
        'Click Refresh TikTok Token only if the page says the token is expired.',
        'Keep the video visible on screen.',
        'Click Create TikTok Draft.',
        'Click Sync TikTok Upload.',
        'Show the Upload Record panel on this same page after Sync finishes.',
    ];

    return (
        <div className="min-h-[calc(100vh-56px)] bg-[radial-gradient(circle_at_top_left,rgba(244,114,182,0.14),transparent_35%),radial-gradient(circle_at_top_right,rgba(34,197,94,0.12),transparent_30%),linear-gradient(180deg,#0f172a_0%,#111827_100%)] px-4 py-8 md:px-8">
            <div className="mx-auto max-w-6xl space-y-6">
                <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-2xl backdrop-blur">
                    <p className="text-xs uppercase tracking-[0.24em] text-emerald-300">TikTok Submission Demo</p>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                        <h1 className="text-3xl font-semibold text-white">{recordingMode ? 'TikTok Submission View' : 'Screen-Recordable Review Flow'}</h1>
                        <Button onClick={() => setRecordingMode((value) => !value)} variant="outline" className="border-white/20 bg-transparent text-white hover:bg-white/10">
                            {recordingMode ? 'Exit Recording Mode' : 'Enter Recording Mode'}
                        </Button>
                    </div>
                    {recordingMode ? null : (
                        <p className="mt-3 max-w-3xl text-sm text-slate-300">
                            This route is the clean operator-facing wrapper for TikTok app-review recording. It shows the exact current capability split:
                            upload-to-TikTok is working, while zero-manual profile posting remains gated on <span className="font-semibold text-white">video.publish</span> approval.
                        </p>
                    )}
                </section>

                {recordingMode ? null : (
                    <section className={`rounded-2xl border p-5 ${blocker ? 'border-rose-500/30 bg-rose-500/10 text-rose-50' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-50'}`}>
                        <p className="text-xs uppercase tracking-[0.22em]">Recording Status</p>
                        <h2 className="mt-2 text-xl font-semibold">{blocker ? 'Not Ready To Record' : 'Ready To Record'}</h2>
                        <p className="mt-2 text-sm">
                            {blocker ?? 'The provider is connected. You can record the app-review walkthrough now.'}
                        </p>
                    </section>
                )}

                {recordingMode ? null : (
                    <section className="grid gap-6 lg:grid-cols-3">
                        <Card className="border-white/10 bg-slate-900/75 text-white lg:col-span-2">
                            <CardHeader>
                                <CardTitle>Record Only This</CardTitle>
                                <CardDescription className="text-slate-300">
                                    Do not improvise. Record these exact moments in this order.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3 text-sm text-slate-300">
                                {recordingSteps.map((step, index) => (
                                    <div key={step} className="rounded-xl border border-white/10 bg-slate-950/60 p-4">
                                        <p className="font-medium text-white">Recording Step {index + 1}</p>
                                        <p className="mt-1">{step}</p>
                                    </div>
                                ))}
                            </CardContent>
                        </Card>

                        <Card className="border-amber-500/20 bg-amber-500/5 text-amber-50">
                            <CardHeader>
                                <CardTitle>What Reviewers Need</CardTitle>
                                <CardDescription className="text-amber-100/80">
                                    Keep the video focused on these three facts.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3 text-sm">
                                <div className="rounded-xl border border-amber-300/15 bg-black/20 p-3">1. The app authenticates and targets the real Leisure Life business TikTok account.</div>
                                <div className="rounded-xl border border-amber-300/15 bg-black/20 p-3">2. The app generates and sends the campaign video to TikTok from the website workflow.</div>
                                <div className="rounded-xl border border-amber-300/15 bg-black/20 p-3">3. Zero-manual posting is the requested upgrade, and video.publish approval is the remaining blocker.</div>
                            </CardContent>
                        </Card>
                    </section>
                )}

                <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
                    <Card className="border-white/10 bg-slate-900/75 text-white">
                        <CardHeader>
                            <CardTitle>{recordingMode ? 'Controls' : 'Demo Controls'}</CardTitle>
                            {recordingMode ? null : (
                                <CardDescription className="text-slate-300">
                                    Use this campaign slug for the recording or swap it if you want a different campaign on camera.
                                </CardDescription>
                            )}
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <label className="block text-sm text-slate-300">
                                <span className="mb-2 block">Campaign Slug</span>
                                <input
                                    value={slug}
                                    onChange={(event) => setSlug(event.target.value)}
                                    className="w-full rounded-xl border border-white/15 bg-slate-950 px-3 py-2 text-white outline-none transition focus:border-emerald-400"
                                />
                            </label>
                            <div className="grid gap-3">
                                <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">1. Provider</p>
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        <Button onClick={() => void loadStatus()} disabled={loading}>
                                            {loading ? 'Refreshing Status...' : 'Refresh Provider Status'}
                                        </Button>
                                        <Button onClick={() => void handleRefreshToken()} disabled={refreshingToken} variant="secondary">
                                            {refreshingToken ? 'Refreshing Token...' : 'Refresh TikTok Token'}
                                        </Button>
                                        <Button asChild variant="outline" className="border-white/20 bg-transparent text-white hover:bg-white/10">
                                            <a href="/api/integrations/tiktok/connect" target="_blank" rel="noreferrer">Start TikTok OAuth</a>
                                        </Button>
                                    </div>
                                </div>

                                <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">2. Upload Demo</p>
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        <Button onClick={() => void handleCreateTikTokDraft()} disabled={runningDraft} variant="secondary">
                                            {runningDraft ? 'Creating Draft...' : 'Create TikTok Draft'}
                                        </Button>
                                        <Button onClick={() => void handleSyncTikTokUpload()} disabled={syncingUpload} variant="outline" className="border-white/20 bg-transparent text-white hover:bg-white/10">
                                            {syncingUpload ? 'Syncing Upload...' : 'Sync TikTok Upload'}
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {recordingMode ? null : (
                        <Card className="border-emerald-500/20 bg-emerald-500/5 text-emerald-50">
                            <CardHeader>
                                <CardTitle>Short Spoken Script</CardTitle>
                                <CardDescription className="text-emerald-100/80">
                                    Read this almost verbatim while recording.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3 text-sm">
                                <div className="rounded-xl border border-emerald-400/15 bg-black/20 p-4 text-emerald-50/90">
                                    <p>This is our internal campaign publishing workflow for the Leisure Life business TikTok account.</p>
                                    <p className="mt-2">The website validates the connected account, triggers a TikTok upload from a generated campaign video, and persists the TikTok publish identifier and status in our distribution record.</p>
                                    <p className="mt-2">We are requesting video.publish approval so this same workflow can complete a direct post without the current manual TikTok step.</p>
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </section>

                <section className="grid gap-6 md:grid-cols-2">
                    <Card className="h-full border-white/10 bg-slate-900/75 text-white">
                        <CardHeader>
                            <CardTitle>{recordingMode ? 'Provider Status' : 'Current Provider Readiness'}</CardTitle>
                        </CardHeader>
                        <CardContent className="text-sm text-slate-300">
                            <p>{statusMessage || 'No status loaded yet.'}</p>
                            {providerStatus?.ready ? (
                                <div className="mt-3 space-y-1 text-xs text-slate-400">
                                    <p className={hasSyncedUpload ? 'text-emerald-300' : 'text-slate-400'}>accountLabel: {providerStatus.accountLabel}</p>
                                    <p className={hasSyncedUpload ? 'text-emerald-300' : 'text-slate-400'}>openId: {providerStatus.openId}</p>
                                    <p className={hasSyncedUpload ? 'text-emerald-300' : 'text-slate-400'}>grantedScopes: {(providerStatus.grantedScopes ?? []).join(', ') || 'none'}</p>
                                    <p className={hasSyncedUpload ? 'text-emerald-300' : 'text-slate-400'}>requestedScopes: {(providerStatus.requestedScopes ?? []).join(', ') || 'none'}</p>
                                    <p className={providerStatus.zeroManualPostingReady ? 'text-emerald-300' : hasSyncedUpload ? 'font-semibold text-rose-400' : 'text-slate-400'}>
                                        zeroManualPostingReady: {String(Boolean(providerStatus.zeroManualPostingReady))}
                                    </p>
                                </div>
                            ) : null}
                        </CardContent>
                    </Card>

                    <Card className="h-full border-white/10 bg-slate-900/75 text-white">
                        <CardHeader>
                            <CardTitle>Upload Record</CardTitle>
                        </CardHeader>
                        <CardContent className="text-sm text-slate-300">
                            <p>{uploadMessage || 'The upload record updates automatically after Create TikTok Draft and Sync TikTok Upload.'}</p>
                            {uploadRecord ? (
                                <div className="mt-3 space-y-2 text-xs text-slate-400">
                                    <p>status: {uploadRecord.status}</p>
                                    <p>campaignStage: {uploadRecord.campaignStage}</p>
                                    <p>copyVariant: {uploadRecord.copyVariant}</p>
                                    <p>assetId: {uploadRecord.assetId}</p>
                                    <p>publishId: {uploadRecord.externalPostId ?? 'none'}</p>
                                    {uploadRecord.notes && uploadRecord.notes.length > 0 ? <p>notes: {uploadRecord.notes.join(' | ')}</p> : null}
                                </div>
                            ) : null}
                        </CardContent>
                    </Card>
                </section>

                <section>
                    <Card className="border-white/10 bg-slate-900/75 text-white">
                        <CardHeader>
                            <CardTitle>Video In View</CardTitle>
                        </CardHeader>
                        <CardContent className="text-sm text-slate-300">
                            <p>{mediaMessage || 'No media preview loaded yet.'}</p>
                            {tiktokVideo?.url ? (
                                <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-black/40 p-3">
                                    <div className="mx-auto max-w-[360px]">
                                        <video
                                            className="max-h-[460px] w-full rounded-xl object-cover"
                                            controls
                                            preload="metadata"
                                            poster={posterImage?.url}
                                            src={tiktokVideo.url}
                                        />
                                    </div>
                                    <div className="mt-3 space-y-1 text-xs text-slate-400">
                                        <p>videoAssetId: {tiktokVideo.assetId}</p>
                                        <p className="break-all">videoUrl: {tiktokVideo.url}</p>
                                        {posterImage?.url ? <p className="break-all">posterStill: {posterImage.assetId}</p> : null}
                                    </div>
                                </div>
                            ) : posterImage?.url ? (
                                <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-black/40 p-3">
                                    <div className="mx-auto max-w-[360px]">
                                        <img src={posterImage.url} alt="Generated campaign still" className="max-h-[460px] w-full rounded-xl object-cover" />
                                    </div>
                                    <div className="mt-3 space-y-1 text-xs text-slate-400">
                                        <p>stillAssetId: {posterImage.assetId}</p>
                                        <p className="break-all">stillUrl: {posterImage.url}</p>
                                    </div>
                                </div>
                            ) : null}
                        </CardContent>
                    </Card>
                </section>

                <section className="grid gap-6 lg:grid-cols-3">
                    <Card className="border-white/10 bg-slate-900/75 text-white">
                        <CardHeader>
                            <CardTitle>{recordingMode ? 'Campaign Review Route' : 'Review Surface'}</CardTitle>
                            {recordingMode ? null : <CardDescription className="text-slate-300">Optional fallback only. You should not need this page for the recording anymore.</CardDescription>}
                        </CardHeader>
                        <CardContent className="space-y-2 text-sm text-slate-300">
                            <p className="font-mono text-xs text-emerald-300">{reviewRoute}</p>
                            {recordingMode ? null : <p>Keep this only as a backup route. The single-page recording flow now lives above.</p>}
                        </CardContent>
                    </Card>

                    <Card className="border-white/10 bg-slate-900/75 text-white">
                        <CardHeader>
                            <CardTitle>Show TikTok Upload Record</CardTitle>
                            {recordingMode ? null : <CardDescription className="text-slate-300">Optional raw API view only. The Upload Record panel above should be enough.</CardDescription>}
                        </CardHeader>
                        <CardContent className="space-y-2 text-sm text-slate-300">
                            <p className="font-mono text-xs text-emerald-300 break-all">{distributionStatusRoute}</p>
                            {recordingMode ? null : <p>This raw route stays available as a backup, but you should not need it on camera.</p>}
                        </CardContent>
                    </Card>

                    <Card className="border-white/10 bg-slate-900/75 text-white">
                        <CardHeader>
                            <CardTitle>Show Generated Video Record</CardTitle>
                            {recordingMode ? null : <CardDescription className="text-slate-300">Optional raw API view only. The embedded video above should be enough.</CardDescription>}
                        </CardHeader>
                        <CardContent className="space-y-2 text-sm text-slate-300">
                            <p className="font-mono text-xs text-emerald-300 break-all">{manifestRoute}</p>
                            {recordingMode ? null : <p>This raw route stays available as a backup, but you should not need it on camera.</p>}
                        </CardContent>
                    </Card>
                </section>
            </div>
        </div>
    );
}