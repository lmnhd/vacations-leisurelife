"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
    Activity,
    CalendarClock,
    Loader2,
    MessageSquare,
    Radio,
    RefreshCw,
    Send,
    Sparkles,
    Webhook,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type ScheduledPost = {
    postId: string;
    platform: string;
    assetId: string;
    copyVariant: string;
    scheduledAt: string;
    campaignStage: string;
    status: string;
    externalPostId?: string;
    externalReviewUrl?: string;
    notes?: string[];
};

type DistributionSchedule = {
    campaignSlug: string;
    timezone: string;
    generatedAt: string;
    generatedBy: string;
    version: number;
    posts: ScheduledPost[];
};

type DistributionExecution = {
    executionId: string;
    caller: string;
    mode: string;
    dryRun: boolean;
    status: string;
    createdAt: string;
    completedAt?: string;
    error?: string;
    summary: {
        plannedPosts: number;
        persistedPosts: number;
        dispatchedPosts: number;
        skippedPosts: number;
    };
};

type DistributionStatusResponse = {
    campaign: {
        slug: string;
        status: string;
        distributionStatus?: string;
    };
    schedule: DistributionSchedule;
    executions: DistributionExecution[];
    summary: {
        totalPosts: number;
        perPlatform: Record<string, { total: number; posted: number; draftCreated: number; scheduled: number; failed: number }>;
    };
};

type DistributionActionResponse = {
    message: string;
    executionId: string;
    mode: string;
    dryRun: boolean;
    caller: string;
    schedule: DistributionSchedule;
    summary: {
        plannedPosts: number;
        persistedPosts: number;
        dispatchedPosts: number;
        skippedPosts: number;
    };
    warnings: string[];
};

const PLATFORM_LABELS: Record<string, string> = {
    discord: "Discord",
    email: "Email",
    facebook_ad: "Meta Ads",
    instagram_feed: "Instagram Feed",
    instagram_reels: "Instagram Reels",
    instagram_story: "Instagram Story",
    pinterest: "Pinterest",
    sms: "SMS",
    tiktok: "TikTok",
    youtube: "YouTube",
};

function formatTimestamp(value: string | undefined): string {
    if (!value) return "Not recorded";
    if (value.startsWith("ON_")) return value.replaceAll("_", " ");

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return date.toLocaleString();
}

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
    if (status === "posted" || status === "active" || status === "completed") return "default";
    if (status === "failed" || status === "halted") return "destructive";
    if (status === "scheduled" || status === "planned") return "secondary";
    return "outline";
}

function stageLabel(stage: string): string {
    return stage.replaceAll("_", " ");
}

export default function CampaignDistributionPage() {
    const params = useParams();
    const slug = params.slug as string;

    const [data, setData] = useState<DistributionStatusResponse | null>(null);
    const [preview, setPreview] = useState<DistributionActionResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [actionState, setActionState] = useState<string | null>(null);

    useEffect(() => {
        void loadDistributionStatus();
    }, [slug]);

    async function loadDistributionStatus(): Promise<void> {
        setLoading(true);
        setError("");
        try {
            const response = await fetch(`/api/groups/campaign/${slug}/media/distribution`);
            if (response.status === 404) {
                setData(null);
                return;
            }
            if (!response.ok) {
                throw new Error("Failed to load distribution status");
            }

            const nextData = await response.json() as DistributionStatusResponse;
            setData(nextData);
        } catch (nextError: unknown) {
            setError(nextError instanceof Error ? nextError.message : "Unknown error");
        } finally {
            setLoading(false);
        }
    }

    async function runAction(label: string, body: Record<string, unknown>): Promise<void> {
        setActionState(label);
        setError("");
        try {
            const response = await fetch(`/api/groups/campaign/${slug}/media/distribute`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });

            const payload = await response.json() as DistributionActionResponse | { error?: string };
            if (!response.ok) {
                throw new Error("error" in payload && payload.error ? payload.error : `Action failed: ${label}`);
            }

            setPreview(payload as DistributionActionResponse);
            await loadDistributionStatus();
        } catch (nextError: unknown) {
            setError(nextError instanceof Error ? nextError.message : "Unknown error");
        } finally {
            setActionState(null);
        }
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-neutral-950 text-neutral-50">
                <div className="mx-auto flex max-w-6xl items-center justify-center px-6 py-24">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            </div>
        );
    }

    if (!data) {
        return (
            <div className="min-h-screen bg-neutral-950 text-neutral-50">
                <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8">
                    <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
                        <Card className="border-neutral-800 bg-neutral-900 text-neutral-50">
                            <CardHeader>
                                <CardTitle className="text-4xl font-semibold tracking-tight">Distribution Control Deck</CardTitle>
                                <CardDescription className="max-w-2xl text-sm text-neutral-400">
                                    No persisted distribution schedule exists for campaign {slug} yet. Use the shared backend route to preview or persist the first schedule.
                                </CardDescription>
                            </CardHeader>
                        </Card>
                        <Card className="border-neutral-800 bg-gradient-to-br from-blue-950/70 via-neutral-900 to-neutral-900 text-neutral-50">
                            <CardHeader>
                                <CardTitle className="text-lg">First Actions</CardTitle>
                                <CardDescription className="text-neutral-400">These buttons call the same endpoint the agent uses.</CardDescription>
                            </CardHeader>
                            <CardContent className="grid gap-3 sm:grid-cols-2">
                                <Button variant="outline" className="justify-start gap-2 border-neutral-700 bg-neutral-950 text-neutral-50 hover:bg-neutral-800" onClick={() => void runAction("preview", { caller: "human", mode: "plan", dryRun: true })} disabled={actionState !== null}>
                                    {actionState === "preview" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                                    Preview Plan
                                </Button>
                                <Button className="justify-start gap-2" onClick={() => void runAction("persist", { caller: "human", mode: "plan", dryRun: false })} disabled={actionState !== null}>
                                    {actionState === "persist" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />}
                                    Persist Schedule
                                </Button>
                            </CardContent>
                        </Card>
                    </div>

                    <div className="grid gap-6 lg:grid-cols-2">
                        <Card className="border-neutral-800 bg-neutral-900 text-neutral-50">
                            <CardHeader>
                                <CardTitle className="text-lg">What Exists</CardTitle>
                                <CardDescription className="text-neutral-400">The backend distribution layer is already available.</CardDescription>
                            </CardHeader>
                            <CardContent className="grid gap-3 sm:grid-cols-2 text-sm text-neutral-300">
                                <div className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-4">Schedule planner and persistence</div>
                                <div className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-4">Execution history records</div>
                                <div className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-4">Targeted dispatch route</div>
                                <div className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-4">Discord webhook adapter</div>
                            </CardContent>
                        </Card>

                        <Card className="border-neutral-800 bg-neutral-900 text-neutral-50">
                            <CardHeader>
                                <CardTitle className="text-lg">What Happens Next</CardTitle>
                                <CardDescription className="text-neutral-400">Persist a schedule first, then the status timeline becomes available here.</CardDescription>
                            </CardHeader>
                            <CardContent className="grid gap-3 sm:grid-cols-2 text-sm text-neutral-300">
                                <div className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-4">Stage timeline rendering</div>
                                <div className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-4">Per-platform status cards</div>
                                <div className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-4">Execution history ledger</div>
                                <div className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-4">Manual Discord dispatch control</div>
                            </CardContent>
                        </Card>
                    </div>

                    {preview ? (
                        <div className="grid gap-6 lg:grid-cols-2">
                            <Card className="border-neutral-800 bg-neutral-900 text-neutral-50">
                                <CardHeader>
                                    <CardTitle className="text-lg">Latest Preview</CardTitle>
                                    <CardDescription className="text-neutral-400">Response from the distribute endpoint.</CardDescription>
                                </CardHeader>
                                <CardContent className="grid gap-3 sm:grid-cols-2 text-sm text-neutral-300">
                                    <div className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-4">Mode {preview.mode}</div>
                                    <div className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-4">Planned {preview.summary.plannedPosts}</div>
                                    <div className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-4">Persisted {preview.summary.persistedPosts}</div>
                                    <div className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-4">Dispatched {preview.summary.dispatchedPosts}</div>
                                </CardContent>
                            </Card>
                            <Card className="border-neutral-800 bg-neutral-900 text-neutral-50">
                                <CardHeader>
                                    <CardTitle className="text-lg">Warnings</CardTitle>
                                    <CardDescription className="text-neutral-400">Adapter limitations or schedule notes from the last run.</CardDescription>
                                </CardHeader>
                                <CardContent className="grid gap-3 sm:grid-cols-2 text-sm text-neutral-300">
                                    {(preview.warnings.length > 0 ? preview.warnings : ["No warnings returned.", "Persist the schedule to activate the full timeline view."]).map((warning) => (
                                        <div key={warning} className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-4">{warning}</div>
                                    ))}
                                </CardContent>
                            </Card>
                        </div>
                    ) : null}
                </div>
            </div>
        );
    }

    const stageBuckets = (data?.schedule.posts ?? []).reduce<Record<string, ScheduledPost[]>>((accumulator, post) => {
        const current = accumulator[post.campaignStage] ?? [];
        current.push(post);
        accumulator[post.campaignStage] = current;
        return accumulator;
    }, {});

    return (
        <div className="min-h-screen bg-neutral-950 text-neutral-50">
            <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8">
                <div className="grid gap-6 lg:grid-cols-[1.35fr_0.95fr]">
                    <Card className="border-neutral-800 bg-neutral-900 text-neutral-50 shadow-[0_0_0_1px_rgba(255,255,255,0.03)]">
                        <CardHeader className="space-y-4">
                            <div className="flex flex-wrap items-center gap-3">
                                <Badge variant="outline" className="border-cyan-500/40 bg-cyan-500/10 text-cyan-200">Campaign Media Studio</Badge>
                                <Badge variant={statusVariant(data?.campaign.status ?? "unknown")}>{data?.campaign.status ?? "Unknown"}</Badge>
                                <Badge variant={statusVariant(data?.campaign.distributionStatus ?? "not_started")}>{data?.campaign.distributionStatus ?? "not_started"}</Badge>
                            </div>
                            <div className="space-y-2">
                                <CardTitle className="text-4xl font-semibold tracking-tight">Distribution Control Deck</CardTitle>
                                <CardDescription className="max-w-2xl text-sm text-neutral-400">
                                    Agent-first distribution planning and channel dispatch for campaign {slug}. The UI reads and triggers the same contracts used by automation.
                                </CardDescription>
                            </div>
                        </CardHeader>
                    </Card>

                    <Card className="border-neutral-800 bg-gradient-to-br from-blue-950/70 via-neutral-900 to-neutral-900 text-neutral-50">
                        <CardHeader>
                            <CardTitle className="text-lg">Operator Actions</CardTitle>
                            <CardDescription className="text-neutral-400">Preview, persist, or dispatch through the shared endpoint.</CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-3 sm:grid-cols-2">
                            <Button className="justify-start gap-2" onClick={() => void loadDistributionStatus()} disabled={actionState !== null}>
                                <RefreshCw className="h-4 w-4" />
                                Refresh Status
                            </Button>
                            <Button variant="outline" className="justify-start gap-2 border-neutral-700 bg-neutral-950 text-neutral-50 hover:bg-neutral-800" onClick={() => void runAction("preview", { caller: "human", mode: "plan", dryRun: true })} disabled={actionState !== null}>
                                {actionState === "preview" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                                Preview Plan
                            </Button>
                            <Button variant="outline" className="justify-start gap-2 border-neutral-700 bg-neutral-950 text-neutral-50 hover:bg-neutral-800" onClick={() => void runAction("persist", { caller: "human", mode: "plan", dryRun: false })} disabled={actionState !== null}>
                                {actionState === "persist" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />}
                                Persist Schedule
                            </Button>
                            <Button className="justify-start gap-2 bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => void runAction("dispatch-discord", { caller: "human", mode: "dispatch", dryRun: false, platforms: ["discord"] })} disabled={actionState !== null}>
                                {actionState === "dispatch-discord" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                Dispatch Discord
                            </Button>
                        </CardContent>
                    </Card>
                </div>

                {error ? (
                    <div className="grid gap-6 lg:grid-cols-2">
                        <Card className="border-red-500/30 bg-red-950/30 text-red-100">
                            <CardHeader>
                                <CardTitle className="text-lg">Action Error</CardTitle>
                                <CardDescription className="text-red-200/80">The backend contract returned an error.</CardDescription>
                            </CardHeader>
                            <CardContent className="text-sm">{error}</CardContent>
                        </Card>
                        <Card className="border-neutral-800 bg-neutral-900 text-neutral-50">
                            <CardHeader>
                                <CardTitle className="text-lg">Troubleshooting Note</CardTitle>
                                <CardDescription className="text-neutral-400">UI actions are wrappers around the same route the agent uses.</CardDescription>
                            </CardHeader>
                            <CardContent className="text-sm text-neutral-300">
                                Validate campaign metadata, manifest availability, and Discord webhook presence before dispatch.
                            </CardContent>
                        </Card>
                    </div>
                ) : null}

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <Card className="border-neutral-800 bg-neutral-900 text-neutral-50">
                        <CardHeader className="pb-2">
                            <CardDescription className="text-neutral-400">Total Scheduled Posts</CardDescription>
                            <CardTitle className="text-3xl">{data?.summary.totalPosts ?? 0}</CardTitle>
                        </CardHeader>
                        <CardContent className="text-sm text-neutral-400">Version {data?.schedule.version ?? 0} in {data?.schedule.timezone ?? "UTC"}</CardContent>
                    </Card>
                    <Card className="border-neutral-800 bg-neutral-900 text-neutral-50">
                        <CardHeader className="pb-2">
                            <CardDescription className="text-neutral-400">Generated By</CardDescription>
                            <CardTitle className="text-3xl">{data?.schedule.generatedBy ?? "n/a"}</CardTitle>
                        </CardHeader>
                        <CardContent className="text-sm text-neutral-400">{formatTimestamp(data?.schedule.generatedAt)}</CardContent>
                    </Card>
                    <Card className="border-neutral-800 bg-neutral-900 text-neutral-50">
                        <CardHeader className="pb-2">
                            <CardDescription className="text-neutral-400">Execution Runs</CardDescription>
                            <CardTitle className="text-3xl">{data?.executions.length ?? 0}</CardTitle>
                        </CardHeader>
                        <CardContent className="text-sm text-neutral-400">Latest run is shown in execution history.</CardContent>
                    </Card>
                    <Card className="border-neutral-800 bg-neutral-900 text-neutral-50">
                        <CardHeader className="pb-2">
                            <CardDescription className="text-neutral-400">Discord Ready</CardDescription>
                            <CardTitle className="text-3xl">{data?.summary.perPlatform.discord?.total ?? 0}</CardTitle>
                        </CardHeader>
                        <CardContent className="text-sm text-neutral-400">Eligible entries can dispatch through the current adapter.</CardContent>
                    </Card>
                </div>

                <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
                    <Card className="border-neutral-800 bg-neutral-900 text-neutral-50">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-lg"><Radio className="h-4 w-4 text-cyan-300" /> Platform Status</CardTitle>
                            <CardDescription className="text-neutral-400">Per-platform totals from the persisted schedule.</CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-4 sm:grid-cols-2">
                            {Object.entries(data?.summary.perPlatform ?? {}).map(([platform, stats]) => (
                                <div key={platform} className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-4">
                                    <div className="mb-3 flex items-center justify-between gap-3">
                                        <div className="text-sm font-medium text-neutral-100">{PLATFORM_LABELS[platform] ?? platform}</div>
                                        <Badge variant="outline" className="border-neutral-700 text-neutral-300">{stats.total} total</Badge>
                                    </div>
                                    <div className="grid grid-cols-4 gap-2 text-xs text-neutral-400">
                                        <div className="rounded-md bg-neutral-900 p-2">
                                            <div className="text-neutral-500">Posted</div>
                                            <div className="mt-1 text-base font-semibold text-neutral-50">{stats.posted}</div>
                                        </div>
                                        <div className="rounded-md bg-neutral-900 p-2">
                                            <div className="text-neutral-500">Drafts</div>
                                            <div className="mt-1 text-base font-semibold text-neutral-50">{stats.draftCreated}</div>
                                        </div>
                                        <div className="rounded-md bg-neutral-900 p-2">
                                            <div className="text-neutral-500">Queued</div>
                                            <div className="mt-1 text-base font-semibold text-neutral-50">{stats.scheduled}</div>
                                        </div>
                                        <div className="rounded-md bg-neutral-900 p-2">
                                            <div className="text-neutral-500">Failed</div>
                                            <div className="mt-1 text-base font-semibold text-neutral-50">{stats.failed}</div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </CardContent>
                    </Card>

                    <Card className="border-neutral-800 bg-neutral-900 text-neutral-50">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-lg"><Sparkles className="h-4 w-4 text-amber-300" /> Latest Preview</CardTitle>
                            <CardDescription className="text-neutral-400">Most recent action response from the distribute endpoint.</CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-4 sm:grid-cols-2">
                            <div className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-4">
                                <div className="text-xs uppercase tracking-[0.2em] text-neutral-500">Mode</div>
                                <div className="mt-2 text-2xl font-semibold text-neutral-50">{preview?.mode ?? "n/a"}</div>
                            </div>
                            <div className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-4">
                                <div className="text-xs uppercase tracking-[0.2em] text-neutral-500">Execution</div>
                                <div className="mt-2 truncate text-sm text-neutral-200">{preview?.executionId ?? "No preview yet"}</div>
                            </div>
                            <div className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-4">
                                <div className="text-xs uppercase tracking-[0.2em] text-neutral-500">Planned</div>
                                <div className="mt-2 text-2xl font-semibold text-neutral-50">{preview?.summary.plannedPosts ?? 0}</div>
                            </div>
                            <div className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-4">
                                <div className="text-xs uppercase tracking-[0.2em] text-neutral-500">Dispatched</div>
                                <div className="mt-2 text-2xl font-semibold text-neutral-50">{preview?.summary.dispatchedPosts ?? 0}</div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
                    <Card className="border-neutral-800 bg-neutral-900 text-neutral-50">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-lg"><Activity className="h-4 w-4 text-emerald-300" /> Stage Timeline</CardTitle>
                            <CardDescription className="text-neutral-400">Scheduled posts grouped by campaign stage.</CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-4 lg:grid-cols-2">
                            {Object.entries(stageBuckets).map(([stage, posts]) => (
                                <div key={stage} className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-4">
                                    <div className="mb-4 flex items-center justify-between gap-3">
                                        <div className="text-sm font-semibold text-neutral-100">{stageLabel(stage)}</div>
                                        <Badge variant="outline" className="border-neutral-700 text-neutral-300">{posts.length} posts</Badge>
                                    </div>
                                    <div className="space-y-3">
                                        {posts.map((post) => (
                                            <div key={post.postId} className="rounded-md border border-neutral-800 bg-neutral-900/80 p-3">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div>
                                                        <div className="text-sm font-medium text-neutral-100">{PLATFORM_LABELS[post.platform] ?? post.platform}</div>
                                                        <div className="text-xs text-neutral-500">Asset {post.assetId}</div>
                                                    </div>
                                                    <Badge variant={statusVariant(post.status)}>{post.status}</Badge>
                                                </div>
                                                <div className="mt-3 grid gap-2 sm:grid-cols-2 text-xs text-neutral-400">
                                                    <div className="rounded-md bg-neutral-950 p-2">Copy {post.copyVariant}</div>
                                                    <div className="rounded-md bg-neutral-950 p-2">{formatTimestamp(post.scheduledAt)}</div>
                                                </div>
                                                {(post.externalPostId || post.externalReviewUrl) ? (
                                                    <div className="mt-3 grid gap-2 text-xs text-neutral-400">
                                                        {post.externalPostId ? (
                                                            <div className="rounded-md bg-neutral-950 p-2">Native ID {post.externalPostId}</div>
                                                        ) : null}
                                                        {post.externalReviewUrl ? (
                                                            <a
                                                                href={post.externalReviewUrl}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                className="rounded-md bg-neutral-950 p-2 text-cyan-300 hover:text-cyan-200"
                                                            >
                                                                Open native review
                                                            </a>
                                                        ) : null}
                                                    </div>
                                                ) : null}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </CardContent>
                    </Card>

                    <Card className="border-neutral-800 bg-neutral-900 text-neutral-50">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-lg"><Webhook className="h-4 w-4 text-fuchsia-300" /> Execution History</CardTitle>
                            <CardDescription className="text-neutral-400">Planner and dispatch runs recorded in DynamoDB.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {(data?.executions ?? []).map((execution) => (
                                <div key={execution.executionId} className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-4">
                                    <div className="mb-3 flex items-center justify-between gap-3">
                                        <div>
                                            <div className="text-sm font-medium text-neutral-100">{execution.mode} via {execution.caller}</div>
                                            <div className="text-xs text-neutral-500">{execution.executionId}</div>
                                        </div>
                                        <Badge variant={statusVariant(execution.status)}>{execution.status}</Badge>
                                    </div>
                                    <div className="grid gap-2 sm:grid-cols-2 text-xs text-neutral-400">
                                        <div className="rounded-md bg-neutral-900 p-2">Created {formatTimestamp(execution.createdAt)}</div>
                                        <div className="rounded-md bg-neutral-900 p-2">Completed {formatTimestamp(execution.completedAt)}</div>
                                        <div className="rounded-md bg-neutral-900 p-2">Planned {execution.summary.plannedPosts}</div>
                                        <div className="rounded-md bg-neutral-900 p-2">Dispatched {execution.summary.dispatchedPosts}</div>
                                    </div>
                                    {execution.error ? <div className="mt-3 text-xs text-red-300">{execution.error}</div> : null}
                                </div>
                            ))}

                            {!data?.executions.length ? (
                                <div className="grid gap-3 sm:grid-cols-2">
                                    <div className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-4 text-sm text-neutral-400">No executions recorded yet.</div>
                                    <div className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-4 text-sm text-neutral-400">Run Preview Plan or Persist Schedule to create the first execution record.</div>
                                </div>
                            ) : null}
                        </CardContent>
                    </Card>
                </div>

                <div className="grid gap-6 lg:grid-cols-2">
                    <Card className="border-neutral-800 bg-neutral-900 text-neutral-50">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-lg"><MessageSquare className="h-4 w-4 text-cyan-300" /> Dispatch Scope</CardTitle>
                            <CardDescription className="text-neutral-400">The current UI only exposes a safe, targeted Discord dispatch action.</CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-3 sm:grid-cols-2 text-sm text-neutral-300">
                            <div className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-4">Shared backend contract for agents and humans</div>
                            <div className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-4">Dry-run planning without side effects</div>
                            <div className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-4">Persisted schedule and execution history</div>
                            <div className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-4">Discord webhook dispatch for eligible posts</div>
                        </CardContent>
                    </Card>

                    <Card className="border-neutral-800 bg-neutral-900 text-neutral-50">
                        <CardHeader>
                            <CardTitle className="text-lg">Backend Gaps</CardTitle>
                            <CardDescription className="text-neutral-400">What still needs to be added below this dashboard.</CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-3 sm:grid-cols-2 text-sm text-neutral-300">
                            <div className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-4">Provider validation layer for Meta, TikTok, and Google</div>
                            <div className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-4">Manifest-submission and expiry trigger handling</div>
                            <div className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-4">Kill switch and halt controls</div>
                            <div className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-4">Asset swap and per-post manual override tools</div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}