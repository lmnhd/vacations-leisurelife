"use client";

import { useMemo, useState } from "react";
import type { DistributionCaller, DistributionPlatform, DistributionSchedule } from "@/lib/campaigns/schema";

type DistributionMode = "plan" | "dispatch";
type ProviderMode = "simulate" | "live";

interface DistributionSummary {
    plannedPosts: number;
    persistedPosts: number;
    dispatchedPosts: number;
    skippedPosts: number;
}

interface DistributionPreview {
    postId: string;
    platform: string;
    payload: Record<string, unknown>;
}

interface DistributionResponse {
    message?: string;
    executionId?: string;
    mode?: DistributionMode;
    dryRun?: boolean;
    providerMode?: ProviderMode;
    forceDispatch?: boolean;
    caller?: DistributionCaller;
    schedule?: DistributionSchedule;
    summary?: DistributionSummary;
    warnings?: string[];
    previews?: DistributionPreview[];
    error?: string;
}

const PLATFORM_OPTIONS: Array<{ value: DistributionPlatform; label: string }> = [
    { value: "facebook_ad", label: "Facebook Ad" },
    { value: "google_display", label: "Google Display" },
    { value: "instagram_feed", label: "Instagram Feed" },
    { value: "instagram_reels", label: "Instagram Reels" },
    { value: "instagram_story", label: "Instagram Story" },
    { value: "tiktok", label: "TikTok" },
    { value: "discord", label: "Discord" },
    { value: "email", label: "Email" },
    { value: "sms", label: "SMS" },
    { value: "youtube", label: "YouTube" },
    { value: "pinterest", label: "Pinterest" },
];

function readString(value: unknown): string | null {
    return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function readStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function cacheBust(url: string, version?: string): string {
    if (!version) {
        return url;
    }

    try {
        const parsed = new URL(url);
        parsed.searchParams.set('v', version);
        return parsed.toString();
    } catch {
        return `${url}${url.includes('?') ? '&' : '?'}v=${encodeURIComponent(version)}`;
    }
}

function renderPlatformPreview(preview: DistributionPreview, version?: string) {
    const payload = preview.payload;
    const mediaUrl = readString(payload.mediaUrl);
    const mediaUrls = readStringArray(payload.mediaUrls);
    const headline = readString(payload.headline);
    const primaryText = readString(payload.primaryText);
    const description = readString(payload.description);
    const caption = readString(payload.caption);
    const cta = readString(payload.cta);
    const destinationUrl = readString(payload.destinationUrl) ?? readString(payload.landingUrl);
    const mediaType = readString(payload.mediaType);

    if (preview.platform === "instagram_feed") {
        const slides = mediaUrls.length > 0 ? mediaUrls : mediaUrl ? [mediaUrl] : [];
        return (
            <div className="rounded-xl border border-fuchsia-400/20 bg-[linear-gradient(180deg,rgba(24,24,27,0.95),rgba(12,12,16,0.98))] p-4">
                <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.24em] text-fuchsia-200/80">
                    <span>Instagram Feed Mock</span>
                    <span>{mediaType ?? "IMAGE"}</span>
                </div>
                <div className="mt-4 space-y-3">
                    <div className="flex gap-3 overflow-x-auto pb-1">
                        {slides.length > 0 ? slides.map((url, index) => (
                            <div key={`${preview.postId}_${index}`} className="min-w-[220px] max-w-[220px] flex-none">
                                <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/20 shadow-[0_12px_40px_rgba(0,0,0,0.25)]">
                                    <img src={cacheBust(url, version)} alt={`Instagram slide ${index + 1}`} className="h-[275px] w-full object-contain bg-black/20" />
                                </div>
                                <div className="mt-2 text-center text-[11px] text-slate-400">Slide {index + 1}</div>
                            </div>
                        )) : (
                            <div className="rounded-xl border border-dashed border-white/15 px-4 py-10 text-sm text-slate-400">
                                No image URLs in payload.
                            </div>
                        )}
                    </div>
                    <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-slate-200">
                        <div className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Caption</div>
                        <p className="mt-2 leading-6">{caption ?? "No caption returned."}</p>
                    </div>
                </div>
            </div>
        );
    }

    if (preview.platform === "google_display") {
        return (
            <div className="rounded-xl border border-sky-400/20 bg-[linear-gradient(180deg,rgba(248,250,252,0.98),rgba(241,245,249,0.98))] p-4 text-slate-900 shadow-[0_12px_40px_rgba(15,23,42,0.18)]">
                <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.24em] text-sky-700/80">
                    <span>Google Display Mock</span>
                    <span>Responsive Display Draft</span>
                </div>
                    <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                    {mediaUrl ? (
                        <img src={cacheBust(mediaUrl, version)} alt={headline ?? "Google display creative"} className="h-[220px] w-full object-contain bg-slate-100" />
                    ) : (
                        <div className="flex h-[220px] items-center justify-center bg-slate-100 text-sm text-slate-500">
                            No media URL in payload.
                        </div>
                    )}
                    <div className="space-y-3 p-4">
                        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Sponsored</div>
                        <div>
                            <h3 className="text-xl font-semibold leading-tight text-slate-950">{headline ?? "No headline returned."}</h3>
                            <p className="mt-2 text-sm leading-6 text-slate-700">{primaryText ?? "No long headline / primary text returned."}</p>
                        </div>
                        <p className="text-sm leading-6 text-slate-500">{description ?? "No description returned."}</p>
                        <div className="flex items-center justify-between gap-3">
                            <button className="rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white">
                                {cta ?? "Learn more"}
                            </button>
                            <span className="truncate text-xs text-slate-400">{destinationUrl ?? "No destination URL"}</span>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (preview.platform === "facebook_ad") {
        return (
            <div className="rounded-xl border border-cyan-400/20 bg-[linear-gradient(180deg,rgba(15,23,42,0.98),rgba(2,6,23,0.98))] p-4">
                <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.24em] text-cyan-200/80">
                    <span>Meta Ad Mock</span>
                    <span>Paused Draft</span>
                </div>
                <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-slate-950/70">
                    <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
                        <div className="h-10 w-10 rounded-full bg-cyan-500/20" />
                        <div>
                            <div className="text-sm font-medium text-white">Leisure Life Interactive</div>
                            <div className="text-xs text-slate-400">Sponsored</div>
                        </div>
                    </div>
                    {mediaUrl ? (
                        <img src={cacheBust(mediaUrl, version)} alt={headline ?? "Meta creative"} className="h-[240px] w-full object-contain bg-slate-900" />
                    ) : (
                        <div className="flex h-[240px] items-center justify-center bg-slate-900 text-sm text-slate-400">
                            No media URL in payload.
                        </div>
                    )}
                    <div className="space-y-2 px-4 py-4">
                        <p className="text-sm leading-6 text-slate-200">{primaryText ?? "No primary text returned."}</p>
                        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                            <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">{destinationUrl ?? "Landing page"}</div>
                            <div className="mt-1 text-base font-semibold text-white">{headline ?? "No headline returned."}</div>
                            <div className="mt-1 text-sm text-slate-400">{description ?? "No description returned."}</div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return null;
}

function readErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }

    return "Unknown request error";
}

export default function DistributionTestDashboardPage() {
    const [slug, setSlug] = useState("wellness-and-nature-cruise");
    const [mode, setMode] = useState<DistributionMode>("dispatch");
    const [providerMode, setProviderMode] = useState<ProviderMode>("simulate");
    const [caller, setCaller] = useState<DistributionCaller>("human");
    const [dryRun, setDryRun] = useState(true);
    const [forceDispatch, setForceDispatch] = useState(true);
    const [selectedPlatforms, setSelectedPlatforms] = useState<DistributionPlatform[]>([
        "facebook_ad",
        "google_display",
        "instagram_feed",
        "tiktok",
    ]);
    const [loading, setLoading] = useState(false);
    const [response, setResponse] = useState<DistributionResponse | null>(null);
    const [requestError, setRequestError] = useState<string>("");

    const endpoint = useMemo(() => {
        const trimmedSlug = slug.trim();
        if (!trimmedSlug) {
            return "(enter campaign slug)";
        }

        return `/api/groups/campaign/${trimmedSlug}/media/distribute`;
    }, [slug]);

    const togglePlatform = (platform: DistributionPlatform) => {
        setSelectedPlatforms((current) => {
            if (current.includes(platform)) {
                return current.filter((item) => item !== platform);
            }

            return [...current, platform];
        });
    };

    const handleSubmit = async () => {
        const trimmedSlug = slug.trim();
        if (!trimmedSlug) {
            setRequestError("Campaign slug is required.");
            return;
        }

        setLoading(true);
        setRequestError("");

        try {
            const result = await fetch(`/api/groups/campaign/${trimmedSlug}/media/distribute`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    mode,
                    dryRun,
                    providerMode,
                    forceDispatch,
                    caller,
                    platforms: selectedPlatforms,
                }),
            });

            const data = await result.json() as DistributionResponse;
            setResponse(data);

            if (!result.ok) {
                setRequestError(data.error ?? `Request failed (${result.status})`);
            }
        } catch (error: unknown) {
            setResponse(null);
            setRequestError(readErrorMessage(error));
        } finally {
            setLoading(false);
        }
    };

    const fieldClassName = "w-full rounded-lg border border-white/20 bg-slate-900 px-3 py-2 text-slate-100 placeholder:text-slate-500 outline-none transition focus:border-cyan-400";
    const selectOptionClassName = "bg-slate-900 text-slate-100";

    return (
        <div className="min-h-[calc(100vh-56px)] bg-[radial-gradient(circle_at_20%_0%,rgba(14,116,144,0.25),transparent_45%),radial-gradient(circle_at_85%_10%,rgba(217,119,6,0.2),transparent_40%)] px-4 py-8 md:px-8">
            <div className="mx-auto max-w-6xl space-y-6">
                <section className="rounded-2xl border border-cyan-500/30 bg-slate-900/80 p-6 shadow-[0_0_80px_rgba(6,182,212,0.08)] backdrop-blur">
                    <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">Phase 4 Distribution Test</p>
                    <h1 className="mt-2 text-2xl font-semibold text-white md:text-3xl">Marketing Dispatch Dashboard</h1>
                    <p className="mt-2 text-sm text-slate-300">
                        Trigger distribution plans or dispatch runs from the same canonical route used by automation and external callers.
                    </p>
                    <p className="mt-4 rounded-lg border border-white/10 bg-black/20 px-3 py-2 font-mono text-xs text-emerald-300">
                        Endpoint: {endpoint}
                    </p>
                </section>

                <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
                    <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-5">
                        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-200">Request Builder</h2>

                        <div className="mt-4 grid gap-4 md:grid-cols-2">
                            <label className="space-y-2 text-sm text-slate-300 md:col-span-2">
                                Campaign Slug
                                <input
                                    value={slug}
                                    onChange={(event) => setSlug(event.target.value)}
                                    placeholder="salt-and-meadow-2026"
                                    className={fieldClassName}
                                />
                            </label>

                            <label className="space-y-2 text-sm text-slate-300">
                                Mode
                                <select
                                    value={mode}
                                    onChange={(event) => setMode(event.target.value as DistributionMode)}
                                    className={fieldClassName}
                                >
                                    <option className={selectOptionClassName} value="plan">plan</option>
                                    <option className={selectOptionClassName} value="dispatch">dispatch</option>
                                </select>
                            </label>

                            <label className="space-y-2 text-sm text-slate-300">
                                Provider Mode
                                <select
                                    value={providerMode}
                                    onChange={(event) => setProviderMode(event.target.value as ProviderMode)}
                                    className={fieldClassName}
                                >
                                    <option className={selectOptionClassName} value="simulate">simulate</option>
                                    <option className={selectOptionClassName} value="live">live</option>
                                </select>
                            </label>

                            <label className="space-y-2 text-sm text-slate-300">
                                Caller
                                <select
                                    value={caller}
                                    onChange={(event) => setCaller(event.target.value as DistributionCaller)}
                                    className={fieldClassName}
                                >
                                    <option className={selectOptionClassName} value="human">human</option>
                                    <option className={selectOptionClassName} value="agent">agent</option>
                                    <option className={selectOptionClassName} value="system">system</option>
                                </select>
                            </label>

                            <div className="space-y-3 rounded-lg border border-white/10 bg-slate-950/40 p-3 text-sm text-slate-300">
                                <p className="font-medium text-slate-100">Execution Flags</p>
                                <label className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={dryRun}
                                        onChange={(event) => setDryRun(event.target.checked)}
                                    />
                                    Dry Run
                                </label>
                                <label className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={forceDispatch}
                                        onChange={(event) => setForceDispatch(event.target.checked)}
                                    />
                                    Force Dispatch
                                </label>
                            </div>
                        </div>

                        <div className="mt-5">
                            <p className="text-sm font-medium text-slate-200">Platforms</p>
                            <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3">
                                {PLATFORM_OPTIONS.map((platformOption) => {
                                    const selected = selectedPlatforms.includes(platformOption.value);

                                    return (
                                        <label
                                            key={platformOption.value}
                                            className={`cursor-pointer rounded-lg border px-3 py-2 text-sm transition ${
                                                selected
                                                    ? "border-cyan-400 bg-cyan-500/15 text-cyan-100"
                                                    : "border-white/15 bg-slate-950/30 text-slate-300 hover:border-cyan-500/50"
                                            }`}
                                        >
                                            <input
                                                type="checkbox"
                                                className="mr-2"
                                                checked={selected}
                                                onChange={() => togglePlatform(platformOption.value)}
                                            />
                                            {platformOption.label}
                                        </label>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="mt-6 flex items-center gap-3">
                            <button
                                onClick={handleSubmit}
                                disabled={loading}
                                className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:bg-cyan-900"
                            >
                                {loading ? "Running..." : "Run Distribution Request"}
                            </button>
                            {requestError && <span className="text-sm text-rose-300">{requestError}</span>}
                        </div>
                    </div>

                    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5 text-sm text-amber-100">
                        <h2 className="text-sm font-semibold uppercase tracking-wider text-amber-200">Live Mode Safety</h2>
                        <p className="mt-3 text-amber-100/90">
                            Use <strong>simulate</strong> while validating schedule logic and payload shape.
                        </p>
                        <p className="mt-2 text-amber-100/90">
                            For <strong>live</strong>, Meta Ads requires configured environment variables and currently creates ads in paused state.
                        </p>
                        <p className="mt-4 rounded-md border border-amber-300/30 bg-black/20 px-3 py-2 font-mono text-xs">
                            META_ACCESS_TOKEN
                            <br />
                            META_AD_ACCOUNT_ID
                            <br />
                            META_AD_SET_ID
                            <br />
                            META_PAGE_ID
                        </p>
                    </div>
                </section>

                <section className="rounded-2xl border border-white/10 bg-slate-900/70 p-5">
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-200">Response Viewer</h2>

                    {!response && (
                        <p className="mt-3 text-sm text-slate-400">Submit a request to inspect summary, warnings, payload previews, and scheduled posts.</p>
                    )}

                    {response && (
                        <div className="mt-4 space-y-4">
                            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                                <div className="rounded-lg border border-white/10 bg-slate-950/40 p-3">
                                    <p className="text-xs text-slate-400">Execution ID</p>
                                    <p className="mt-1 break-all font-mono text-xs text-cyan-200">{response.executionId ?? "-"}</p>
                                </div>
                                <div className="rounded-lg border border-white/10 bg-slate-950/40 p-3">
                                    <p className="text-xs text-slate-400">Message</p>
                                    <p className="mt-1 text-sm text-slate-100">{response.message ?? "-"}</p>
                                </div>
                                <div className="rounded-lg border border-white/10 bg-slate-950/40 p-3">
                                    <p className="text-xs text-slate-400">Mode</p>
                                    <p className="mt-1 text-sm text-slate-100">{response.mode ?? "-"}</p>
                                </div>
                                <div className="rounded-lg border border-white/10 bg-slate-950/40 p-3">
                                    <p className="text-xs text-slate-400">Provider</p>
                                    <p className="mt-1 text-sm text-slate-100">{response.providerMode ?? "-"}</p>
                                </div>
                            </div>

                            {response.summary && (
                                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                                    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
                                        <p className="text-xs text-emerald-200">Planned</p>
                                        <p className="text-xl font-semibold text-white">{response.summary.plannedPosts}</p>
                                    </div>
                                    <div className="rounded-lg border border-sky-500/30 bg-sky-500/10 p-3">
                                        <p className="text-xs text-sky-200">Persisted</p>
                                        <p className="text-xl font-semibold text-white">{response.summary.persistedPosts}</p>
                                    </div>
                                    <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 p-3">
                                        <p className="text-xs text-cyan-200">Dispatched</p>
                                        <p className="text-xl font-semibold text-white">{response.summary.dispatchedPosts}</p>
                                    </div>
                                    <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3">
                                        <p className="text-xs text-rose-200">Skipped</p>
                                        <p className="text-xl font-semibold text-white">{response.summary.skippedPosts}</p>
                                    </div>
                                </div>
                            )}

                            {response.warnings && response.warnings.length > 0 && (
                                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
                                    <p className="mb-2 font-medium">Warnings</p>
                                    <ul className="list-disc space-y-1 pl-5">
                                        {response.warnings.map((warning) => (
                                            <li key={warning}>{warning}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {response.previews && response.previews.length > 0 && (
                                <div className="space-y-3">
                                    <p className="text-sm font-medium text-slate-200">Payload Previews</p>
                                    {response.previews.map((preview) => (
                                        <div key={`${preview.postId}_${preview.platform}`} className="rounded-lg border border-white/10 bg-slate-950/40 p-3">
                                            <p className="text-xs text-slate-400">{preview.postId} • {preview.platform}</p>
                                            {renderPlatformPreview(preview) && (
                                                <div className="mt-3">
                                                    {renderPlatformPreview(preview, response.executionId ?? response.schedule?.generatedAt ?? undefined)}
                                                </div>
                                            )}
                                            <pre className="mt-2 overflow-auto rounded bg-black/30 p-3 text-xs text-slate-200">
                                                {JSON.stringify(preview.payload, null, 2)}
                                            </pre>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {response.schedule && response.schedule.posts.length > 0 && (
                                <div className="overflow-auto rounded-lg border border-white/10 bg-slate-950/40">
                                    <table className="min-w-full text-left text-sm">
                                        <thead className="border-b border-white/10 text-xs uppercase tracking-wide text-slate-400">
                                            <tr>
                                                <th className="px-3 py-2">Post ID</th>
                                                <th className="px-3 py-2">Platform</th>
                                                <th className="px-3 py-2">Assets</th>
                                                <th className="px-3 py-2">Stage</th>
                                                <th className="px-3 py-2">Scheduled At</th>
                                                <th className="px-3 py-2">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {response.schedule.posts.map((post) => (
                                                <tr key={post.postId} className="border-b border-white/5 text-slate-200">
                                                    <td className="px-3 py-2 font-mono text-xs">{post.postId}</td>
                                                    <td className="px-3 py-2">{post.platform}</td>
                                                    <td className="px-3 py-2 font-mono text-xs">
                                                        {"assetIds" in post && Array.isArray((post as Record<string, unknown>).assetIds)
                                                            ? `${post.assetId} + ${((post as Record<string, unknown>).assetIds as unknown[]).length - 1}`
                                                            : post.assetId}
                                                    </td>
                                                    <td className="px-3 py-2">{post.campaignStage}</td>
                                                    <td className="px-3 py-2 font-mono text-xs">{post.scheduledAt}</td>
                                                    <td className="px-3 py-2">{post.status}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}
