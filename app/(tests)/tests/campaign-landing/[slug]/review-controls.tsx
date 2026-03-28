'use client';

import { useEffect, useMemo, useState } from 'react';
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
        }>;
    };
    summary?: {
        totalPosts: number;
    };
    error?: string;
}

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
    const [plannedPosts, setPlannedPosts] = useState<DistributionStatusResponse['schedule']['posts']>([]);
    const [dispatchPreviews, setDispatchPreviews] = useState<Array<{ postId: string; platform: string; payload: Record<string, unknown> }>>([]);

    const publicPreviewHref = useMemo(() => `/groups/${slug}?preview=1`, [slug]);
    const publicHref = useMemo(() => `/groups/${slug}`, [slug]);

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
            setDispatchMessage(`Preview ready: ${(data.previews ?? []).length} dispatch payloads.`);
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
            setDispatchMessage(data.message ?? 'Dispatch completed.');
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
                                {planning ? 'Planning Ads...' : 'Plan Ads'}
                            </Button>
                            <Button onClick={loadAdPlan} disabled={reviewing} variant="outline" className="border-amber-300 bg-white">
                                {reviewing ? 'Loading Plan...' : 'Review Ad Plan'}
                            </Button>
                            <Button onClick={handlePreviewDispatch} disabled={previewing} variant="outline" className="border-amber-300 bg-white">
                                {previewing ? 'Previewing...' : 'Preview Dispatch'}
                            </Button>
                            <Button onClick={handleDispatchAds} disabled={dispatching} variant="secondary">
                                {dispatching ? 'Dispatching...' : 'Dispatch Ads'}
                            </Button>
                        </div>
                        {statusMessage ? <p className="text-sm text-amber-950">{statusMessage}</p> : null}
                        {planMessage ? <p className="text-sm text-slate-700">{planMessage}</p> : null}
                        {reviewMessage ? <p className="text-sm text-slate-700">{reviewMessage}</p> : null}
                        {dispatchMessage ? <p className="text-sm text-slate-700">{dispatchMessage}</p> : null}
                        {plannedPosts.length > 0 ? (
                            <div className="grid gap-2 border border-stone-200 bg-stone-50 p-3">
                                <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Saved Ad Plan</p>
                                {plannedPosts.map((post) => (
                                    <div key={post.postId} className="grid gap-1 border border-stone-200 bg-white p-3 text-sm text-slate-700 md:grid-cols-[1fr_1fr_1fr_1fr]">
                                        <span>{post.platform}</span>
                                        <span>{post.campaignStage}</span>
                                        <span>{post.copyVariant}</span>
                                        <span>{post.status}</span>
                                    </div>
                                ))}
                            </div>
                        ) : null}
                        {dispatchPreviews.length > 0 ? (
                            <div className="grid gap-2 border border-stone-200 bg-stone-50 p-3">
                                <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Dispatch Preview</p>
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