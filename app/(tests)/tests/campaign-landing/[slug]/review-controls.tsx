'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

type ReviewState = 'DRAFT' | 'GATHERING_INTEREST' | 'THRESHOLD_MET' | 'CONVERTED' | 'EXPIRED';

interface ReviewControlsProps {
    slug: string;
    title: string;
    state: ReviewState;
}

interface DistributionPlanResponse {
    message?: string;
    summary?: {
        plannedPosts: number;
    };
    previews?: Array<{ postId: string; platform: string; payload: Record<string, unknown> }>;
    error?: string;
}

interface DistributionStatusResponse {
    schedule?: {
        posts: Array<{
            postId: string;
            platform: string;
            copyVariant: string;
            scheduledAt: string;
            campaignStage: string;
            status: string;
            externalPostId?: string;
            providerDraftType?: 'organic_post' | 'paid_lead_gen_ad';
            notes?: string[];
        }>;
    };
    summary?: {
        totalPosts: number;
    };
    error?: string;
}

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

interface TikTokAdvertiserStatusResponse {
    ready: boolean;
    reason?: string;
    requiredVars?: string[];
    advertiserAccountId?: string;
}

type PlannedPost = NonNullable<DistributionStatusResponse['schedule']>['posts'][number];

interface StatusFlipResponse {
    message?: string;
    campaign?: {
        status: ReviewState;
    };
    error?: string;
}

export function ReviewControls({ slug, title, state }: ReviewControlsProps) {
    const router = useRouter();
    const [currentState, setCurrentState] = useState(state);
    const [collapsed, setCollapsed] = useState(false);
    const [statusMessage, setStatusMessage] = useState<string>('');
    const [planMessage, setPlanMessage] = useState<string>('');
    const [reviewMessage, setReviewMessage] = useState<string>('');
    const [dispatchMessage, setDispatchMessage] = useState<string>('');
    const [publishing, setPublishing] = useState(false);
    const [planning, setPlanning] = useState(false);
    const [reviewing, setReviewing] = useState(false);
    const [previewing, setPreviewing] = useState(false);
    const [dispatching, setDispatching] = useState(false);
    const [validating, setValidating] = useState(false);
    const [syncingTikTok, setSyncingTikTok] = useState(false);
    const [validateMessage, setValidateMessage] = useState<string>('');
    const [plannedPosts, setPlannedPosts] = useState<PlannedPost[]>([]);
    const [dispatchPreviews, setDispatchPreviews] = useState<Array<{ postId: string; platform: string; payload: Record<string, unknown> }>>([]);

    const publicPreviewHref = useMemo(() => `/groups/${slug}?preview=1`, [slug]);
    const publicHref = useMemo(() => `/groups/${slug}`, [slug]);

    const resolvePostDisplayStatus = useCallback((post: PlannedPost): string => {
        if (post.externalPostId?.startsWith('sim_')) return 'simulated';
        if (post.providerDraftType === 'paid_lead_gen_ad' && post.status === 'draft_created') return 'paid_draft_created';
        if (post.providerDraftType === 'organic_post' && post.status === 'draft_created') return 'organic_draft_created';
        if (post.status === 'posted') return 'posted';
        if (post.status === 'draft_created') return 'draft_created';
        return post.status;
    }, []);

    async function handleSyncTikTokStatus() {
        setSyncingTikTok(true);
        setDispatchMessage('');

        try {
            const response = await fetch(`/api/groups/campaign/${slug}/media/distribution/sync`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ platform: 'tiktok' }),
            });

            const data = await response.json() as { message?: string; error?: string; summary?: { checked: number; posted: number; draftCreated: number; failed: number } };
            if (!response.ok) {
                throw new Error(data.error ?? 'Failed to sync TikTok publish status.');
            }

            const summary = data.summary;
            setDispatchMessage(
                summary
                    ? `Organic TikTok sync complete: checked ${summary.checked}, posted ${summary.posted}, drafts ${summary.draftCreated}, failed ${summary.failed}.`
                    : (data.message ?? 'TikTok sync complete.'),
            );
            await loadAdPlan();
        } catch (error) {
            setDispatchMessage(error instanceof Error ? error.message : 'Failed to sync TikTok publish status.');
        } finally {
            setSyncingTikTok(false);
        }
    }

    async function loadAdPlan() {
        setReviewing(true);
        setReviewMessage('');

        try {
            const response = await fetch(`/api/groups/campaign/${slug}/media/distribution`, { cache: 'no-store' });
            const data = await response.json() as DistributionStatusResponse;
            if (!response.ok) {
                throw new Error(data.error ?? 'No saved ad plan found yet.');
            }

            setPlannedPosts(data.schedule?.posts ?? []);
            setReviewMessage(data.summary?.totalPosts ? `Loaded ${data.summary.totalPosts} planned posts.` : 'Ad plan loaded.');
        } catch (error) {
            setPlannedPosts([]);
            setReviewMessage(error instanceof Error ? error.message : 'Failed to load ad plan.');
        } finally {
            setReviewing(false);
        }
    }

    useEffect(() => {
        void loadAdPlan();
    }, [slug]);

    async function handlePublish() {
        setPublishing(true);
        setStatusMessage('');

        try {
            const response = await fetch(`/api/groups/campaign/${slug}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'GATHERING_INTEREST' }),
            });

            const data = await response.json() as StatusFlipResponse;
            if (!response.ok) {
                throw new Error(data.error ?? 'Failed to publish campaign.');
            }

            const nextState = data.campaign?.status ?? 'GATHERING_INTEREST';
            setCurrentState(nextState);
            setStatusMessage(data.message ?? `Campaign moved to ${nextState}.`);
            router.refresh();
        } catch (error) {
            setStatusMessage(error instanceof Error ? error.message : 'Failed to publish campaign.');
        } finally {
            setPublishing(false);
        }
    }

    async function handleValidateProviders() {
        setValidating(true);
        setValidateMessage('');

        try {
            const [organicResponse, paidResponse] = await Promise.all([
                fetch('/api/integrations/tiktok/status', { cache: 'no-store' }),
                fetch('/api/integrations/tiktok/advertiser-status', { cache: 'no-store' }),
            ]);

            const organic = await organicResponse.json() as TikTokProviderStatusResponse;
            const paid = await paidResponse.json() as TikTokAdvertiserStatusResponse;

            let organicMessage: string;
            if (organic.ready) {
                const accountType = organic.isPersonalTestAccount ? 'personal test account' : 'business account';
                const expiry = organic.accessTokenExpiresAt ? ` · expires ${organic.accessTokenExpiresAt}` : '';
                const directPost = organic.zeroManualPostingReady
                    ? ' · direct post ready'
                    : ' · upload-only, video.publish not granted yet';
                organicMessage = `Organic TikTok: ready — ${accountType} (${organic.openId ?? ''})${expiry}${directPost}`;
            } else if (organic.reason === 'token_expired') {
                const refresh = organic.canRefresh ? ' · refresh token available' : ' · refresh token also expired';
                organicMessage = `Organic TikTok: token expired at ${organic.expiredAt ?? 'unknown'}${refresh}`;
            } else {
                organicMessage = `Organic TikTok: not configured — ${organic.detail ?? organic.reason ?? 'unknown'}`;
            }

            const paidMessage = paid.ready
                ? `Paid TikTok: advertiser ready — ${paid.advertiserAccountId}`
                : `Paid TikTok: advertiser not ready — ${(paid.requiredVars ?? []).join(', ') || paid.reason || 'unknown'}`;

            setValidateMessage(`${organicMessage} | ${paidMessage}`);
        } catch (error) {
            setValidateMessage(error instanceof Error ? error.message : 'Provider validation failed.');
        } finally {
            setValidating(false);
        }
    }

    async function handlePlanAds() {
        setPlanning(true);
        setPlanMessage('');

        try {
            const response = await fetch(`/api/groups/campaign/${slug}/media/distribute`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mode: 'plan', dryRun: false }),
            });

            const data = await response.json() as DistributionPlanResponse;
            if (!response.ok) {
                throw new Error(data.error ?? 'Failed to build ad plan.');
            }

            const plannedPosts = data.summary?.plannedPosts;
            setPlanMessage(plannedPosts ? `Ad plan ready: ${plannedPosts} scheduled posts.` : (data.message ?? 'Ad plan ready.'));
            await loadAdPlan();
        } catch (error) {
            setPlanMessage(error instanceof Error ? error.message : 'Failed to build ad plan.');
        } finally {
            setPlanning(false);
        }
    }

    async function handlePreviewDispatch() {
        setPreviewing(true);
        setDispatchMessage('');

        try {
            const response = await fetch(`/api/groups/campaign/${slug}/media/distribute`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mode: 'dispatch', dryRun: true, providerMode: 'simulate', forceDispatch: true }),
            });

            const data = await response.json() as DistributionPlanResponse;
            if (!response.ok) {
                throw new Error(data.error ?? 'Failed to preview ad dispatch.');
            }

            setDispatchPreviews(data.previews ?? []);
            setDispatchMessage(`Simulation preview ready: ${(data.previews ?? []).length} payloads. No live TikTok upload or paid-ad API call was sent.`);
        } catch (error) {
            setDispatchMessage(error instanceof Error ? error.message : 'Failed to preview ad dispatch.');
        } finally {
            setPreviewing(false);
        }
    }

    async function handleDispatchAds() {
        setDispatching(true);
        setDispatchMessage('');

        try {
            const response = await fetch(`/api/groups/campaign/${slug}/media/distribute`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mode: 'dispatch', dryRun: false, providerMode: 'simulate', forceDispatch: true }),
            });

            const data = await response.json() as DistributionPlanResponse;
            if (!response.ok) {
                throw new Error(data.error ?? 'Failed to dispatch ads.');
            }

            setDispatchPreviews(data.previews ?? []);
            setDispatchMessage(data.message ?? 'Simulated dispatch completed. No live provider API was called.');
            await loadAdPlan();
        } catch (error) {
            setDispatchMessage(error instanceof Error ? error.message : 'Failed to dispatch ads.');
        } finally {
            setDispatching(false);
        }
    }

    return (
        <Card className="border-amber-300 bg-white/80 shadow-sm">
            <CardContent className="flex flex-col gap-4 p-4">
                <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-900">Review Mode Route</p>
                        <p className="text-sm text-amber-950">Viewing <span className="font-semibold">{title}</span> • State: {currentState}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <p className="max-w-sm text-xs text-amber-800">
                            This view is not public. Collapse this bar for a cleaner preview of the landing page.
                        </p>
                        <Button
                            type="button"
                            variant="outline"
                            className="border-amber-300 bg-white"
                            onClick={() => setCollapsed((value) => !value)}
                        >
                            {collapsed ? 'Show Review Panel' : 'Hide Review Panel'}
                        </Button>
                    </div>
                </div>
                {collapsed ? null : (
                    <>
                        <div className="flex flex-wrap gap-2">
                            <Button asChild variant="outline" className="border-amber-300 bg-white">
                                <a href={publicPreviewHref} target="_blank" rel="noreferrer">Open Main Preview</a>
                            </Button>
                            <Button asChild variant="outline" className="border-amber-300 bg-white">
                                <a href={publicHref} target="_blank" rel="noreferrer">Open Public Route</a>
                            </Button>
                            <Button onClick={handlePublish} disabled={publishing || currentState !== 'DRAFT'}>
                                {publishing ? 'Publishing...' : 'Publish Landing'}
                            </Button>
                            <Button onClick={handlePlanAds} disabled={planning} variant="secondary">
                                {planning ? 'Planning Distribution...' : 'Plan Distribution'}
                            </Button>
                            <Button onClick={loadAdPlan} disabled={reviewing} variant="outline" className="border-amber-300 bg-white">
                                {reviewing ? 'Loading Schedule...' : 'Review Schedule'}
                            </Button>
                            <Button onClick={handleValidateProviders} disabled={validating} variant="outline" className="border-amber-300 bg-white">
                                {validating ? 'Validating...' : 'Validate TikTok Paths'}
                            </Button>
                            <Button onClick={handlePreviewDispatch} disabled={previewing} variant="outline" className="border-amber-300 bg-white">
                                {previewing ? 'Previewing...' : 'Preview Simulated Dispatch'}
                            </Button>
                            <Button onClick={handleDispatchAds} disabled={dispatching} variant="secondary">
                                {dispatching ? 'Simulating...' : 'Run Simulated Dispatch'}
                            </Button>
                            <Button onClick={handleSyncTikTokStatus} disabled={syncingTikTok} variant="outline" className="border-amber-300 bg-white">
                                {syncingTikTok ? 'Syncing Organic TikTok...' : 'Sync Organic TikTok Status'}
                            </Button>
                        </div>
                        {statusMessage ? <p className="text-sm text-amber-950">{statusMessage}</p> : null}
                        {validateMessage ? <p className="text-sm text-slate-700">{validateMessage}</p> : null}
                        {planMessage ? <p className="text-sm text-slate-700">{planMessage}</p> : null}
                        {reviewMessage ? <p className="text-sm text-slate-700">{reviewMessage}</p> : null}
                        {dispatchMessage ? <p className="text-sm text-slate-700">{dispatchMessage}</p> : null}
                        {plannedPosts.length > 0 ? (
                            <div className="grid gap-2 border border-stone-200 bg-stone-50 p-3">
                                <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Saved Distribution Schedule</p>
                                {plannedPosts.map((post) => (
                                    <div key={post.postId} className="grid gap-2 border border-stone-200 bg-white p-3 text-sm text-slate-700">
                                        <div className="grid gap-1 md:grid-cols-[1fr_1fr_1fr_1fr]">
                                        <span>{post.platform}</span>
                                        <span>{post.campaignStage}</span>
                                        <span>{post.copyVariant}</span>
                                        <span>{resolvePostDisplayStatus(post)}</span>
                                        </div>
                                        {post.externalPostId ? <p className="text-xs text-slate-500">externalId: {post.externalPostId}</p> : null}
                                        {post.providerDraftType ? <p className="text-xs text-slate-500">providerDraftType: {post.providerDraftType}</p> : null}
                                        {post.notes && post.notes.length > 0 ? <p className="text-xs text-slate-500">notes: {post.notes.join(' | ')}</p> : null}
                                    </div>
                                ))}
                            </div>
                        ) : null}
                        {dispatchPreviews.length > 0 ? (
                            <div className="grid gap-2 border border-stone-200 bg-stone-50 p-3">
                                <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Simulated Dispatch Preview</p>
                                {dispatchPreviews.map((preview) => (
                                    <div key={preview.postId} className="grid gap-1 border border-stone-200 bg-white p-3 text-sm text-slate-700">
                                        <p><span className="font-semibold">{preview.platform}</span> • {preview.postId}</p>
                                        <pre className="overflow-x-auto whitespace-pre-wrap text-xs text-slate-600">{JSON.stringify(preview.payload, null, 2)}</pre>
                                    </div>
                                ))}
                            </div>
                        ) : null}
                    </>
                )}
            </CardContent>
        </Card>
    );
}