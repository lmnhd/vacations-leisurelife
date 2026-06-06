"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useParams } from "next/navigation";
import {
    Activity,
    CalendarClock,
    ExternalLink,
    Loader2,
    Radio,
    RefreshCw,
    Send,
    ShieldCheck,
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
    previews?: Array<{
        postId: string;
        platform: string;
        payload: Record<string, unknown>;
    }>;
};

type DistributionPreviewEntry = NonNullable<DistributionActionResponse["previews"]>[number];

type ProviderStatusResponse = {
    google?: string;
    meta?: string;
    tiktokOrganic?: string;
    tiktokPaid?: string;
};

const PLATFORM_LABELS: Record<string, string> = {
    discord: "Discord",
    email: "Email",
    facebook_ad: "Meta Ads",
    google_display: "Google Display",
    instagram_feed: "Instagram Feed",
    instagram_reels: "Instagram Reels",
    instagram_story: "Instagram Story",
    pinterest: "Pinterest",
    sms: "SMS",
    tiktok: "TikTok",
    tiktok_paid: "TikTok Paid",
    youtube: "YouTube",
};

function stringValue(value: unknown): string | null {
    return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function objectValue(value: unknown): Record<string, unknown> | null {
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function stringArrayValue(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
}

function arrayLength(value: unknown): number {
    return Array.isArray(value) ? value.length : 0;
}

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

function getNoteValue(notes: string[] | undefined, key: string): string | undefined {
    const prefix = `${key}=`;
    return notes?.find((note) => note.startsWith(prefix))?.slice(prefix.length);
}

function findLatestGoogleDraft(posts: ScheduledPost[]): ScheduledPost | undefined {
    return [...posts].reverse().find((post) => post.platform === "google_display");
}

function findLatestMetaDraft(posts: ScheduledPost[]): ScheduledPost | undefined {
    return [...posts].reverse().find((post) => post.platform === "facebook_ad");
}

function StatTile({ label, value }: { label: string; value: string | number }) {
    return (
        <div className="rounded-md border border-neutral-800 bg-neutral-950/70 p-3">
            <div className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">{label}</div>
            <div className="mt-1 truncate text-sm font-medium text-neutral-100">{value}</div>
        </div>
    );
}

function DetailPanel({ title, summary, children }: { title: string; summary: string; children: ReactNode }) {
    return (
        <details className="rounded-lg border border-neutral-800 bg-neutral-900 text-neutral-50">
            <summary className="cursor-pointer list-none p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <div className="text-sm font-semibold text-neutral-100">{title}</div>
                        <div className="mt-1 text-xs text-neutral-400">{summary}</div>
                    </div>
                    <Badge variant="outline" className="border-neutral-700 text-neutral-300">Open details</Badge>
                </div>
            </summary>
            <div className="border-t border-neutral-800 p-4">
                {children}
            </div>
        </details>
    );
}

function PreviewPayloadCard({ entry }: { entry: DistributionPreviewEntry }) {
    const payload = entry.payload;
    const endpoint = stringValue(payload.endpoint);
    const mediaType = stringValue(payload.mediaType);
    const workflow = stringValue(payload.workflow);
    const providerDraftType = stringValue(payload.providerDraftType);
    const mediaUrl = stringValue(payload.mediaUrl);
    const destinationUrl = stringValue(payload.destinationUrl) ?? stringValue(payload.landingUrl);
    const headline = stringValue(payload.headline);
    const primaryText = stringValue(payload.primaryText);
    const caption = stringValue(payload.caption);
    const description = stringValue(payload.description);
    const cta = stringValue(payload.cta);
    const campaignStage = stringValue(payload.campaignStage);
    const googleTargeting = objectValue(payload.googleTargeting);
    const metaTargeting = objectValue(payload.metaTargeting);
    const googleKeywords = stringArrayValue(googleTargeting?.keywords);
    const googlePlacements = stringArrayValue(googleTargeting?.placements);
    const googleNegatives = stringArrayValue(googleTargeting?.negativeKeywords);
    const metaInterestQueries = arrayLength(metaTargeting?.interestQueries);
    const metaResolvedInterests = arrayLength(metaTargeting?.resolvedInterests);
    const metaUnresolvedQueries = arrayLength(metaTargeting?.unresolvedQueries);
    const summary = stringValue(googleTargeting?.summary) ?? stringValue(metaTargeting?.summary);
    const adSetMode = stringValue(metaTargeting?.adSetMode);
    const visibleCopy = caption ?? primaryText ?? description;

    return (
        <div className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <div className="text-sm font-semibold text-neutral-100">{PLATFORM_LABELS[entry.platform] ?? entry.platform}</div>
                    <div className="mt-1 text-xs text-neutral-500">Post {entry.postId}</div>
                </div>
                <Badge variant="outline" className="border-cyan-500/40 bg-cyan-500/10 text-cyan-200">
                    {mediaType ?? providerDraftType ?? workflow ?? "payload"}
                </Badge>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <StatTile label="Endpoint" value={endpoint ?? "simulated adapter"} />
                <StatTile label="Stage" value={campaignStage ?? "n/a"} />
                <StatTile label="Workflow" value={workflow ?? providerDraftType ?? "n/a"} />
                <StatTile label="CTA" value={cta ?? "n/a"} />
            </div>

            {(mediaUrl || destinationUrl) ? (
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {mediaUrl ? (
                        <a href={mediaUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-xs text-cyan-300 hover:text-cyan-200">
                            <ExternalLink className="h-3.5 w-3.5" />
                            Open media URL
                        </a>
                    ) : null}
                    {destinationUrl ? (
                        <a href={destinationUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-xs text-cyan-300 hover:text-cyan-200">
                            <ExternalLink className="h-3.5 w-3.5" />
                            Open destination
                        </a>
                    ) : null}
                </div>
            ) : null}

            {headline ? (
                <div className="mt-3 rounded-md border border-neutral-800 bg-neutral-900 p-3">
                    <div className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">Headline</div>
                    <div className="mt-1 text-sm text-neutral-100">{headline}</div>
                </div>
            ) : null}

            {visibleCopy ? (
                <div className="mt-3 rounded-md border border-neutral-800 bg-neutral-900 p-3">
                    <div className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">
                        {caption ? "Caption" : primaryText ? "Primary Text" : "Copy"}
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-neutral-200">{visibleCopy}</p>
                </div>
            ) : null}

            {summary ? (
                <div className="mt-3 rounded-md border border-neutral-800 bg-neutral-900 p-3">
                    <div className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">Targeting Summary</div>
                    <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-neutral-300">{summary}</p>
                </div>
            ) : null}

            {(googleTargeting || metaTargeting) ? (
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    {googleTargeting ? (
                        <>
                            <StatTile label="Keywords" value={googleKeywords.length} />
                            <StatTile label="Placements" value={googlePlacements.length} />
                            <StatTile label="Negatives" value={googleNegatives.length} />
                        </>
                    ) : null}
                    {metaTargeting ? (
                        <>
                            <StatTile label="Ad Set Mode" value={adSetMode ?? "n/a"} />
                            <StatTile label="Resolved" value={metaResolvedInterests} />
                            <StatTile label="Unresolved" value={`${metaUnresolvedQueries} of ${metaInterestQueries}`} />
                        </>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}

export default function CampaignDistributionPage() {
    const params = useParams();
    const slug = params.slug as string;

    const [data, setData] = useState<DistributionStatusResponse | null>(null);
    const [preview, setPreview] = useState<DistributionActionResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [providerStatus, setProviderStatus] = useState<ProviderStatusResponse | null>(null);
    const [syncMessage, setSyncMessage] = useState("");
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

    async function validateProviders(): Promise<void> {
        setActionState("validate-providers");
        setError("");
        setProviderStatus(null);
        try {
            const [organicResponse, paidResponse, googleResponse, metaResponse] = await Promise.all([
                fetch("/api/integrations/tiktok/status", { cache: "no-store" }),
                fetch("/api/integrations/tiktok/advertiser-status", { cache: "no-store" }),
                fetch("/api/integrations/google/status", { cache: "no-store" }),
                fetch("/api/integrations/meta/status", { cache: "no-store" }),
            ]);

            const organic = await organicResponse.json() as {
                ready?: boolean;
                reason?: string;
                detail?: string;
                accountLabel?: string;
                openId?: string;
                zeroManualPostingReady?: boolean;
            };
            const paid = await paidResponse.json() as {
                ready?: boolean;
                reason?: string;
                requiredVars?: string[];
                advertiserAccountId?: string;
            };
            const google = await googleResponse.json() as {
                ready?: boolean;
                reason?: string;
                detail?: string;
                accountLabel?: string;
            };
            const meta = await metaResponse.json() as {
                status?: string;
                accountLabel?: string;
                accountId?: string;
                instagramActorId?: string;
                warnings?: string[];
            };

            setProviderStatus({
                google: google.ready
                    ? `Ready: ${google.accountLabel ?? "Google Ads connected"}`
                    : `Not ready: ${google.detail ?? google.reason ?? "unknown"}`,
                meta: meta.status === "connected"
                    ? `Ready: ${meta.accountLabel ?? meta.accountId ?? "Meta connected"}${meta.instagramActorId ? " + Instagram" : ""}`
                    : `${meta.status ?? "unknown"}${meta.warnings?.length ? `: ${meta.warnings.join("; ")}` : ""}`,
                tiktokOrganic: organic.ready
                    ? `Ready: ${organic.accountLabel ?? organic.openId ?? "organic account"}${organic.zeroManualPostingReady ? " + direct publish" : ""}`
                    : `Not ready: ${organic.detail ?? organic.reason ?? "unknown"}`,
                tiktokPaid: paid.ready
                    ? `Ready: ${paid.advertiserAccountId ?? "advertiser connected"}`
                    : `Not ready: ${(paid.requiredVars ?? []).join(", ") || paid.reason || "unknown"}`,
            });
        } catch (nextError: unknown) {
            setError(nextError instanceof Error ? nextError.message : "Provider validation failed");
        } finally {
            setActionState(null);
        }
    }

    async function syncTikTokStatus(): Promise<void> {
        setActionState("sync-tiktok");
        setError("");
        setSyncMessage("");
        try {
            const response = await fetch(`/api/groups/campaign/${slug}/media/distribution/sync`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ platform: "tiktok" }),
            });
            const payload = await response.json() as {
                message?: string;
                error?: string;
                summary?: { checked: number; posted: number; draftCreated: number; failed: number };
            };
            if (!response.ok) {
                throw new Error(payload.error ?? "Failed to sync TikTok status");
            }
            setSyncMessage(
                payload.summary
                    ? `TikTok sync: checked ${payload.summary.checked}, posted ${payload.summary.posted}, drafts ${payload.summary.draftCreated}, failed ${payload.summary.failed}.`
                    : payload.message ?? "TikTok sync complete.",
            );
            await loadDistributionStatus();
        } catch (nextError: unknown) {
            setError(nextError instanceof Error ? nextError.message : "TikTok sync failed");
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

    const googleDraftPost = findLatestGoogleDraft(data?.schedule.posts ?? []);
    const googleNotes = googleDraftPost?.notes ?? [];
    const googleCampaignId = getNoteValue(googleNotes, "campaign_id");
    const googleAdGroupId = getNoteValue(googleNotes, "ad_group_id");
    const googleAdId = getNoteValue(googleNotes, "ad_id");
    const googleVerificationMatches = getNoteValue(googleNotes, "verification_matches");
    const googleKeywordsRequested = getNoteValue(googleNotes, "keywords_requested");
    const googleKeywordsApplied = getNoteValue(googleNotes, "keywords_applied");
    const googlePlacementsRequested = getNoteValue(googleNotes, "placements_requested");
    const googlePlacementsApplied = getNoteValue(googleNotes, "placements_applied");
    const googleNegativesRequested = getNoteValue(googleNotes, "negatives_requested");
    const googleNegativesApplied = getNoteValue(googleNotes, "negatives_applied");
    const googleTargetingSummary = getNoteValue(googleNotes, "targeting_summary");
    const googleReviewUrl = googleDraftPost?.externalReviewUrl;
    const googlePreview = preview?.previews?.find((entry) => entry.platform === "google_display")?.payload as
        | {
            googleTargeting?: {
                keywords?: string[];
                placements?: string[];
                negativeKeywords?: string[];
                summary?: string;
                rationale?: string;
                seedKeywords?: string[];
                placementSources?: string[];
            };
        }
        | undefined;
    const googleTargeting = googlePreview?.googleTargeting;
    const metaDraftPost = findLatestMetaDraft(data?.schedule.posts ?? []);
    const metaNotes = metaDraftPost?.notes ?? [];
    const metaCampaignId = getNoteValue(metaNotes, "meta_campaign_id");
    const metaAdSetId = getNoteValue(metaNotes, "meta_ad_set_id");
    const metaAdSetMode = getNoteValue(metaNotes, "meta_ad_set_mode");
    const metaCreativeId = getNoteValue(metaNotes, "meta_ad_creative_id");
    const metaAdId = getNoteValue(metaNotes, "meta_ad_id");
    const metaInterestsResolved = getNoteValue(metaNotes, "meta_interests_resolved");
    const metaInterestQueries = getNoteValue(metaNotes, "meta_interest_queries");
    const metaUnresolvedQueries = getNoteValue(metaNotes, "meta_unresolved_queries");
    const metaTargetingSummary = getNoteValue(metaNotes, "meta_targeting_summary");
    const metaReviewUrl = metaDraftPost?.externalReviewUrl;
    const metaPreview = preview?.previews?.find((entry) => entry.platform === "facebook_ad")?.payload as
        | {
            metaTargeting?: {
                seedKeywords?: string[];
                audienceSignals?: string[];
                parentNodes?: string[];
                interestQueries?: string[];
                resolvedInterests?: Array<{ id: string; name: string; sourceQuery?: string }>;
                unresolvedQueries?: string[];
                summary?: string;
                rationale?: string;
                warnings?: string[];
                adSetMode?: string;
                campaignId?: string;
                adSetId?: string;
            };
        }
        | undefined;
    const metaTargeting = metaPreview?.metaTargeting;
    const actionBusy = actionState !== null;
    const posts = data?.schedule.posts ?? [];
    const platformEntries = Object.entries(data?.summary.perPlatform ?? {}).sort(([left], [right]) => {
        const order = ["facebook_ad", "google_display", "instagram_reels", "tiktok_paid", "instagram_feed", "email", "sms", "pinterest", "discord"];
        return (order.indexOf(left) === -1 ? 999 : order.indexOf(left)) - (order.indexOf(right) === -1 ? 999 : order.indexOf(right));
    });
    const reelPost = posts.find((post) => post.platform === "instagram_reels");
    const metaReady = Boolean(metaDraftPost?.externalPostId);
    const googleReady = Boolean(googleDraftPost?.externalPostId);
    const reelReady = reelPost?.status === "posted" || Boolean(reelPost?.externalPostId);
    const scheduleReady = posts.length > 0;
    const providerChecked = Boolean(providerStatus);
    const targetingChecked = Boolean(googleTargeting || metaTargeting || googleTargetingSummary || metaTargetingSummary);
    const suggestedNextStep = !scheduleReady
        ? "Persist the distribution schedule."
        : !providerChecked
            ? "Validate provider connections."
            : !targetingChecked
                ? "Preview Google and Meta targeting."
                : !googleReady
                    ? "Rebuild the Google draft."
                    : !metaReady
                        ? "Build the Meta draft."
                        : !reelReady
                            ? "Preview or post the Instagram Reel."
                            : "Review native platform drafts.";
    const checklistItems = [
        {
            label: "Schedule",
            status: scheduleReady ? "Ready" : "Needs plan",
            detail: scheduleReady ? `${posts.length} posts in the saved plan` : "No persisted schedule yet",
            tone: scheduleReady ? "emerald" : "amber",
        },
        {
            label: "Providers",
            status: providerChecked ? "Checked" : "Unchecked",
            detail: providerChecked ? "Connection results are visible below" : "Run Validate Providers first",
            tone: providerChecked ? "emerald" : "amber",
        },
        {
            label: "Targeting",
            status: targetingChecked ? "Previewed" : "Not previewed",
            detail: targetingChecked ? "Google or Meta targeting evidence exists" : "Preview Google and Meta before live drafts",
            tone: targetingChecked ? "emerald" : "amber",
        },
        {
            label: "Native Drafts",
            status: googleReady || metaReady || reelReady ? "Started" : "Not built",
            detail: `${googleReady ? "Google" : "Google pending"} | ${metaReady ? "Meta" : "Meta pending"} | ${reelReady ? "Reel" : "Reel pending"}`,
            tone: googleReady && metaReady && reelReady ? "emerald" : "amber",
        },
    ];

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
                            <CardTitle className="text-lg">Operator Console</CardTitle>
                            <CardDescription className="text-neutral-400">The same launch controls from the landing review panel, grouped for faster use.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid gap-3 sm:grid-cols-2">
                                <Button className="justify-start gap-2" onClick={() => void loadDistributionStatus()} disabled={actionBusy}>
                                    <RefreshCw className="h-4 w-4" />
                                    Refresh Status
                                </Button>
                                <Button variant="outline" className="justify-start gap-2 border-neutral-700 bg-neutral-950 text-neutral-50 hover:bg-neutral-800" onClick={() => void validateProviders()} disabled={actionBusy}>
                                    {actionState === "validate-providers" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                                    Validate Providers
                                </Button>
                            </div>

                            <div className="rounded-lg border border-neutral-800 bg-neutral-950/60 p-3">
                                <div className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-400">Schedule</div>
                                <div className="grid gap-2 sm:grid-cols-2">
                                    <Button variant="outline" className="justify-start gap-2 border-neutral-700 bg-neutral-950 text-neutral-50 hover:bg-neutral-800" onClick={() => void runAction("preview", { caller: "human", mode: "plan", dryRun: true })} disabled={actionBusy}>
                                        {actionState === "preview" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                                        Preview Plan
                                    </Button>
                                    <Button variant="outline" className="justify-start gap-2 border-neutral-700 bg-neutral-950 text-neutral-50 hover:bg-neutral-800" onClick={() => void runAction("persist", { caller: "human", mode: "plan", dryRun: false })} disabled={actionBusy}>
                                        {actionState === "persist" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />}
                                        Persist Schedule
                                    </Button>
                                </div>
                            </div>

                            <div className="rounded-lg border border-neutral-800 bg-neutral-950/60 p-3">
                                <div className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-400">Preview Payloads</div>
                                <div className="grid gap-2 sm:grid-cols-2">
                                    <Button variant="outline" className="justify-start gap-2 border-neutral-700 bg-neutral-950 text-neutral-50 hover:bg-neutral-800" onClick={() => void runAction("preview-google", { caller: "human", mode: "dispatch", dryRun: true, providerMode: "simulate", forceDispatch: true, platforms: ["google_display"] })} disabled={actionBusy}>
                                        {actionState === "preview-google" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radio className="h-4 w-4" />}
                                        Preview Google
                                    </Button>
                                    <Button variant="outline" className="justify-start gap-2 border-neutral-700 bg-neutral-950 text-neutral-50 hover:bg-neutral-800" onClick={() => void runAction("preview-meta", { caller: "human", mode: "dispatch", dryRun: true, providerMode: "simulate", forceDispatch: true, platforms: ["facebook_ad"] })} disabled={actionBusy}>
                                        {actionState === "preview-meta" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radio className="h-4 w-4" />}
                                        Preview Meta
                                    </Button>
                                    <Button variant="outline" className="justify-start gap-2 border-neutral-700 bg-neutral-950 text-neutral-50 hover:bg-neutral-800" onClick={() => void runAction("preview-instagram-reel", { caller: "human", mode: "dispatch", dryRun: true, providerMode: "simulate", forceDispatch: true, platforms: ["instagram_reels"] })} disabled={actionBusy}>
                                        {actionState === "preview-instagram-reel" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radio className="h-4 w-4" />}
                                        Preview Reel Payload
                                    </Button>
                                    <Button variant="outline" className="justify-start gap-2 border-neutral-700 bg-neutral-950 text-neutral-50 hover:bg-neutral-800" onClick={() => void runAction("preview-all", { caller: "human", mode: "dispatch", dryRun: true, providerMode: "simulate", forceDispatch: true })} disabled={actionBusy}>
                                        {actionState === "preview-all" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                                        Preview All
                                    </Button>
                                </div>
                            </div>

                            <div className="rounded-lg border border-red-500/20 bg-red-950/20 p-3">
                                <div className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-red-200">Live Drafts</div>
                                <div className="grid gap-2 sm:grid-cols-2">
                                    <Button variant="destructive" className="justify-start gap-2" onClick={() => void runAction("rebuild-google-live", { caller: "human", mode: "dispatch", dryRun: false, providerMode: "live", forceDispatch: true, replaceExisting: true, platforms: ["google_display"] })} disabled={actionBusy}>
                                        {actionState === "rebuild-google-live" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                        Rebuild Google
                                    </Button>
                                    <Button variant="destructive" className="justify-start gap-2" onClick={() => void runAction("dispatch-meta-live", { caller: "human", mode: "dispatch", dryRun: false, providerMode: "live", forceDispatch: true, replaceExisting: true, platforms: ["facebook_ad"] })} disabled={actionBusy}>
                                        {actionState === "dispatch-meta-live" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                        Build Meta
                                    </Button>
                                    <Button variant="destructive" className="justify-start gap-2" onClick={() => void runAction("dispatch-instagram-reel-live", { caller: "human", mode: "dispatch", dryRun: false, providerMode: "live", forceDispatch: true, replaceExisting: true, platforms: ["instagram_reels"] })} disabled={actionBusy}>
                                        {actionState === "dispatch-instagram-reel-live" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                        Post Reel
                                    </Button>
                                    <Button className="justify-start gap-2 bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => void runAction("dispatch-discord", { caller: "human", mode: "dispatch", dryRun: false, platforms: ["discord"] })} disabled={actionBusy}>
                                        {actionState === "dispatch-discord" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                        Dispatch Discord
                                    </Button>
                                </div>
                            </div>

                            <div className="grid gap-2 sm:grid-cols-2">
                                <Button asChild variant="outline" className="justify-start gap-2 border-neutral-700 bg-neutral-950 text-neutral-50 hover:bg-neutral-800">
                                    <a href="/api/integrations/google/connect" target="_blank" rel="noreferrer">
                                        <ExternalLink className="h-4 w-4" />
                                        Reconnect Google
                                    </a>
                                </Button>
                                <Button variant="outline" className="justify-start gap-2 border-neutral-700 bg-neutral-950 text-neutral-50 hover:bg-neutral-800" onClick={() => void syncTikTokStatus()} disabled={actionBusy}>
                                    {actionState === "sync-tiktok" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                                    Sync TikTok Status
                                </Button>
                            </div>
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

                {(providerStatus || syncMessage || preview?.warnings?.length) ? (
                    <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
                        {providerStatus ? (
                            <Card className="border-neutral-800 bg-neutral-900 text-neutral-50">
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2 text-lg"><ShieldCheck className="h-4 w-4 text-emerald-300" /> Provider Readiness</CardTitle>
                                    <CardDescription className="text-neutral-400">Latest connection check for channels used by this campaign.</CardDescription>
                                </CardHeader>
                                <CardContent className="grid gap-3 sm:grid-cols-2">
                                    <StatTile label="Google Ads" value={providerStatus.google ?? "not checked"} />
                                    <StatTile label="Meta / Instagram" value={providerStatus.meta ?? "not checked"} />
                                    <StatTile label="TikTok Organic" value={providerStatus.tiktokOrganic ?? "not checked"} />
                                    <StatTile label="TikTok Paid" value={providerStatus.tiktokPaid ?? "not checked"} />
                                </CardContent>
                            </Card>
                        ) : null}

                        <Card className="border-neutral-800 bg-neutral-900 text-neutral-50">
                            <CardHeader>
                                <CardTitle className="text-lg">Action Feedback</CardTitle>
                                <CardDescription className="text-neutral-400">Warnings and status from the most recent operation.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3 text-sm text-neutral-300">
                                {syncMessage ? (
                                    <div className="rounded-lg border border-emerald-500/20 bg-emerald-950/20 p-4 text-emerald-100">{syncMessage}</div>
                                ) : null}
                                {preview?.warnings?.length ? preview.warnings.map((warning) => (
                                    <div key={warning} className="rounded-lg border border-amber-500/20 bg-amber-950/20 p-4 text-amber-100">{warning}</div>
                                )) : null}
                                {!syncMessage && !preview?.warnings?.length ? (
                                    <div className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-4 text-neutral-400">No warnings from the latest action.</div>
                                ) : null}
                            </CardContent>
                        </Card>
                    </div>
                ) : null}

                {preview?.previews?.length ? (
                    <Card className="border-cyan-500/25 bg-neutral-900 text-neutral-50">
                        <CardHeader>
                            <CardTitle className="text-lg">Preview Payloads</CardTitle>
                            <CardDescription className="text-neutral-400">
                                Dry-run output from the latest preview action. These cards show what would be sent before a live draft or post.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-4 lg:grid-cols-2">
                            {preview.previews.map((entry) => (
                                <PreviewPayloadCard key={`${entry.platform}-${entry.postId}`} entry={entry} />
                            ))}
                        </CardContent>
                    </Card>
                ) : preview ? (
                    <Card className="border-neutral-800 bg-neutral-900 text-neutral-50">
                        <CardHeader>
                            <CardTitle className="text-lg">Preview Payloads</CardTitle>
                            <CardDescription className="text-neutral-400">
                                The latest action did not return channel payloads. Use Preview Google, Preview Meta, Preview Reel Payload, or Preview All.
                            </CardDescription>
                        </CardHeader>
                    </Card>
                ) : null}

                <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
                    <Card className="border-neutral-800 bg-neutral-900 text-neutral-50">
                        <CardHeader>
                            <CardTitle className="text-lg">Launch Checklist</CardTitle>
                            <CardDescription className="text-neutral-400">A plain-language read on where this campaign stands.</CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-3 sm:grid-cols-2">
                            {checklistItems.map((item) => (
                                <div key={item.label} className={`rounded-lg border p-4 ${item.tone === "emerald" ? "border-emerald-500/25 bg-emerald-950/20" : "border-amber-500/25 bg-amber-950/20"}`}>
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="text-xs uppercase tracking-[0.16em] text-neutral-400">{item.label}</div>
                                        <Badge variant="outline" className={item.tone === "emerald" ? "border-emerald-500/40 text-emerald-200" : "border-amber-500/40 text-amber-200"}>{item.status}</Badge>
                                    </div>
                                    <div className="mt-3 text-sm text-neutral-200">{item.detail}</div>
                                </div>
                            ))}
                        </CardContent>
                    </Card>

                    <Card className="border-neutral-800 bg-neutral-900 text-neutral-50">
                        <CardHeader>
                            <CardTitle className="text-lg">Suggested Next Step</CardTitle>
                            <CardDescription className="text-neutral-400">The page should answer this before anything else.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="rounded-lg border border-cyan-500/25 bg-cyan-950/20 p-4 text-lg font-semibold text-cyan-100">
                                {suggestedNextStep}
                            </div>
                            <div className="grid gap-2 sm:grid-cols-2">
                                <StatTile label="Meta Draft" value={metaReady ? "Created" : "Pending"} />
                                <StatTile label="Google Draft" value={googleReady ? "Created" : "Pending"} />
                                <StatTile label="Instagram Reel" value={reelReady ? "Posted / ID saved" : "Pending"} />
                                <StatTile label="Last Action" value={preview?.mode ?? "No preview yet"} />
                            </div>
                        </CardContent>
                    </Card>
                </div>

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
                            <CardDescription className="text-neutral-400">Live Ad Drafts</CardDescription>
                            <CardTitle className="text-3xl">
                                {(data?.summary.perPlatform.facebook_ad?.draftCreated ?? 0)
                                    + (data?.summary.perPlatform.google_display?.draftCreated ?? 0)
                                    + (data?.summary.perPlatform.tiktok_paid?.draftCreated ?? 0)}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="text-sm text-neutral-400">Meta, Google, and TikTok paid draft records.</CardContent>
                    </Card>
                </div>

                <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
                    <Card className="border-neutral-800 bg-neutral-900 text-neutral-50">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-lg"><Radio className="h-4 w-4 text-cyan-300" /> Channel Status</CardTitle>
                            <CardDescription className="text-neutral-400">Compact view of every planned channel.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            {platformEntries.map(([platform, stats]) => (
                                <div key={platform} className="grid gap-3 rounded-lg border border-neutral-800 bg-neutral-950/70 p-3 sm:grid-cols-[1.2fr_0.8fr] sm:items-center">
                                    <div>
                                        <div className="text-sm font-medium text-neutral-100">{PLATFORM_LABELS[platform] ?? platform}</div>
                                        <div className="mt-1 text-xs text-neutral-500">{stats.total} planned post{stats.total === 1 ? "" : "s"}</div>
                                    </div>
                                    <div className="flex flex-wrap gap-2 text-xs">
                                        <Badge variant={stats.draftCreated || stats.posted ? "default" : "outline"}>ready {stats.draftCreated + stats.posted}</Badge>
                                        <Badge variant="secondary">queued {stats.scheduled}</Badge>
                                        {stats.failed ? <Badge variant="destructive">failed {stats.failed}</Badge> : null}
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

                <DetailPanel
                    title="Targeting And Native Proof"
                    summary="Google and Meta IDs, native review links, targeting summaries, and resolved audience details."
                >
                <div className="grid gap-6 lg:grid-cols-2">
                    <Card className="border-neutral-800 bg-neutral-900 text-neutral-50">
                        <CardHeader>
                            <CardTitle className="text-lg">Google Draft Audit</CardTitle>
                            <CardDescription className="text-neutral-400">Persisted proof of the last Google Display draft.</CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-3 text-sm text-neutral-300">
                            <div className="grid gap-2 sm:grid-cols-2">
                                <div className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-4">Campaign ID {googleCampaignId ?? "n/a"}</div>
                                <div className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-4">Ad Group ID {googleAdGroupId ?? "n/a"}</div>
                                <div className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-4">Ad ID {googleAdId ?? "n/a"}</div>
                                <div className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-4">Verification {googleVerificationMatches ?? "n/a"}</div>
                            </div>
                            <div className="grid gap-2 sm:grid-cols-2">
                                <div className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-4">Keywords {googleKeywordsApplied ?? 0}/{googleKeywordsRequested ?? 0}</div>
                                <div className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-4">Placements {googlePlacementsApplied ?? 0}/{googlePlacementsRequested ?? 0}</div>
                                <div className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-4">Negatives {googleNegativesApplied ?? 0}/{googleNegativesRequested ?? 0}</div>
                                <div className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-4">
                                    {googleReviewUrl ? (
                                        <a href={googleReviewUrl} target="_blank" rel="noreferrer" className="text-cyan-300 hover:text-cyan-200">
                                            Open native review
                                        </a>
                                    ) : (
                                        "No native review URL"
                                    )}
                                </div>
                            </div>
                            {googleTargetingSummary ? (
                                <div className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-4">
                                    <div className="text-xs uppercase tracking-[0.2em] text-neutral-500">Targeting Summary</div>
                                    <pre className="mt-2 whitespace-pre-wrap text-xs text-neutral-200">{googleTargetingSummary}</pre>
                                </div>
                            ) : null}
                        </CardContent>
                    </Card>

                    <Card className="border-neutral-800 bg-neutral-900 text-neutral-50">
                        <CardHeader>
                            <CardTitle className="text-lg">Current Google Targeting</CardTitle>
                            <CardDescription className="text-neutral-400">Live preview payload when you use Preview Google Targeting or a simulated dispatch.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4 text-sm text-neutral-300">
                            <div className="grid gap-2 sm:grid-cols-2">
                                <div className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-4">Sources {googleTargeting?.placementSources?.join(" + ") ?? "n/a"}</div>
                                <div className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-4">Seed keywords {googleTargeting?.seedKeywords?.join(", ") ?? "n/a"}</div>
                            </div>
                            {googleTargeting?.summary ? (
                                <div className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-4">
                                    <div className="text-xs uppercase tracking-[0.2em] text-neutral-500">Summary</div>
                                    <pre className="mt-2 whitespace-pre-wrap text-xs text-neutral-200">{googleTargeting.summary}</pre>
                                </div>
                            ) : null}
                            {googleTargeting?.keywords?.length ? (
                                <div className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-4">
                                    <div className="text-xs uppercase tracking-[0.2em] text-neutral-500">Keywords</div>
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        {googleTargeting.keywords.map((keyword) => (
                                            <span key={keyword} className="rounded-full border border-neutral-700 bg-neutral-900 px-2.5 py-1 text-xs text-neutral-100">
                                                {keyword}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            ) : null}
                            {googleTargeting?.placements?.length ? (
                                <div className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-4">
                                    <div className="text-xs uppercase tracking-[0.2em] text-neutral-500">Placements</div>
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        {googleTargeting.placements.map((placement) => (
                                            <span key={placement} className="rounded-full border border-neutral-700 bg-neutral-900 px-2.5 py-1 text-xs text-neutral-100">
                                                {placement}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            ) : null}
                            {googleTargeting?.negativeKeywords?.length ? (
                                <div className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-4">
                                    <div className="text-xs uppercase tracking-[0.2em] text-neutral-500">Negative Keywords</div>
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        {googleTargeting.negativeKeywords.map((keyword) => (
                                            <span key={keyword} className="rounded-full border border-rose-500/40 bg-rose-500/10 px-2.5 py-1 text-xs text-rose-200">
                                                {keyword}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            ) : null}
                            {!googleTargeting ? (
                                <div className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-4 text-neutral-400">
                                    Run Preview Google Targeting or Rebuild Google Draft to surface the targeting payload here.
                                </div>
                            ) : null}
                        </CardContent>
                    </Card>
                </div>

                <div className="grid gap-6 lg:grid-cols-2">
                    <Card className="border-neutral-800 bg-neutral-900 text-neutral-50">
                        <CardHeader>
                            <CardTitle className="text-lg">Meta Draft Audit</CardTitle>
                            <CardDescription className="text-neutral-400">Persisted proof of the last Meta Ads draft and its audience container.</CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-3 text-sm text-neutral-300">
                            <div className="grid gap-2 sm:grid-cols-2">
                                <div className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-4">Campaign ID {metaCampaignId ?? "n/a"}</div>
                                <div className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-4">Ad Set ID {metaAdSetId ?? "n/a"}</div>
                                <div className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-4">Ad Set Mode {metaAdSetMode ?? "n/a"}</div>
                                <div className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-4">Creative ID {metaCreativeId ?? "n/a"}</div>
                                <div className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-4">Ad ID {metaAdId ?? "n/a"}</div>
                                <div className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-4">
                                    {metaReviewUrl ? (
                                        <a href={metaReviewUrl} target="_blank" rel="noreferrer" className="text-cyan-300 hover:text-cyan-200">
                                            Open native review
                                        </a>
                                    ) : (
                                        "No native review URL"
                                    )}
                                </div>
                            </div>
                            <div className="grid gap-2 sm:grid-cols-3">
                                <div className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-4">Queries {metaInterestQueries ?? "n/a"}</div>
                                <div className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-4">Resolved {metaInterestsResolved ?? "n/a"}</div>
                                <div className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-4">Unresolved {metaUnresolvedQueries ?? "n/a"}</div>
                            </div>
                            {metaTargetingSummary ? (
                                <div className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-4">
                                    <div className="text-xs uppercase tracking-[0.2em] text-neutral-500">Targeting Summary</div>
                                    <pre className="mt-2 whitespace-pre-wrap text-xs text-neutral-200">{metaTargetingSummary}</pre>
                                </div>
                            ) : null}
                        </CardContent>
                    </Card>

                    <Card className="border-neutral-800 bg-neutral-900 text-neutral-50">
                        <CardHeader>
                            <CardTitle className="text-lg">Current Meta Targeting</CardTitle>
                            <CardDescription className="text-neutral-400">Preview payload from a simulated Meta targeting run or live draft creation.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4 text-sm text-neutral-300">
                            <div className="grid gap-2 sm:grid-cols-2">
                                <div className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-4">Ad Set Mode {metaTargeting?.adSetMode ?? "n/a"}</div>
                                <div className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-4">Seed keywords {metaTargeting?.seedKeywords?.join(", ") ?? "n/a"}</div>
                            </div>
                            {metaTargeting?.summary ? (
                                <div className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-4">
                                    <div className="text-xs uppercase tracking-[0.2em] text-neutral-500">Summary</div>
                                    <pre className="mt-2 whitespace-pre-wrap text-xs text-neutral-200">{metaTargeting.summary}</pre>
                                </div>
                            ) : null}
                            {metaTargeting?.parentNodes?.length ? (
                                <div className="rounded-lg border border-blue-500/20 bg-blue-950/20 p-4">
                                    <div className="text-xs uppercase tracking-[0.2em] text-blue-400">AI-Resolved Parent Nodes</div>
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        {metaTargeting.parentNodes.map((node) => (
                                            <span key={node} className="rounded-full border border-blue-500/40 bg-blue-500/10 px-2.5 py-1 text-xs text-blue-200">
                                                {node}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            ) : null}
                            {metaTargeting?.interestQueries?.length ? (
                                <div className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-4">
                                    <div className="text-xs uppercase tracking-[0.2em] text-neutral-500">Interest Queries</div>
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        {metaTargeting.interestQueries.map((query) => (
                                            <span key={query} className="rounded-full border border-neutral-700 bg-neutral-900 px-2.5 py-1 text-xs text-neutral-100">
                                                {query}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            ) : null}
                            {metaTargeting?.resolvedInterests?.length ? (
                                <div className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-4">
                                    <div className="text-xs uppercase tracking-[0.2em] text-neutral-500">Resolved Interests</div>
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        {metaTargeting.resolvedInterests.map((interest) => (
                                            <span key={`${interest.id}-${interest.name}`} className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-200">
                                                {interest.name} [{interest.id}]
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            ) : null}
                            {metaTargeting?.unresolvedQueries?.length ? (
                                <div className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-4">
                                    <div className="text-xs uppercase tracking-[0.2em] text-neutral-500">Unresolved Queries</div>
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        {metaTargeting.unresolvedQueries.map((query) => (
                                            <span key={query} className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-200">
                                                {query}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            ) : null}
                            {metaTargeting?.warnings?.length ? (
                                <div className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-4">
                                    <div className="text-xs uppercase tracking-[0.2em] text-neutral-500">Warnings</div>
                                    <div className="mt-3 grid gap-2">
                                        {metaTargeting.warnings.map((warning) => (
                                            <div key={warning} className="rounded-md bg-neutral-900 p-2 text-xs text-neutral-300">
                                                {warning}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : null}
                            {!metaTargeting ? (
                                <div className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-4 text-neutral-400">
                                    Run Preview Meta Targeting to surface the planned Meta audience package here.
                                </div>
                            ) : null}
                        </CardContent>
                    </Card>
                </div>
                </DetailPanel>

                <DetailPanel
                    title="Schedule Timeline And Execution History"
                    summary="Every planned post by campaign stage plus prior planning and dispatch runs."
                >
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
                </DetailPanel>

            </div>
        </div>
    );
}
