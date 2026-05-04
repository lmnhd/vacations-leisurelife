"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { VoicePreferencePanel } from "@/components/voice-preference-panel";
import type { AssetType, CampaignAestheticBrief, CampaignMediaManifest, ProbeRunRecord } from "@/lib/campaigns/schema";
import { ProbeResultsPanel } from "./probe-results-panel";
import { useVideoModelPreference } from "@/lib/campaigns/media/use-video-model-preference";
import { MediaReviewPanel } from "./media-review-panel";
import { CampaignSelector } from "./campaign-selector";
import { approveAestheticBrief } from "@/lib/campaigns/aesthetic-workflow-client";
import {
    Loader2, Wand2, Image, Film, Music, Type, Shirt,
    Zap, Download, Eye, AlertTriangle, BookOpen, Layers, ExternalLink
} from "lucide-react";

// ────────────────────────────────────────────────────────────────────────────
// Media Generation Test Page
// /tests/media-generation
// Per-category generation + full pipeline execution + manifest viewer.
// ────────────────────────────────────────────────────────────────────────────

type PageState = "idle" | "generating" | "loading";

interface DiscoveryCampaignSnapshot {
    id: string;
    name: string;
    description: string;
    aesthetic: string | null;
    status: string;
    targetDates: string;
    targetDestination: string | null;
    shipTarget: string | null;
    highlightEvents: string[];
    targetingKeywords: string[];
    startingPrice: number | null;
    priceSource: string | null;
    pricingStatus: string | null;
    cbagenttoolsBookingLink: string | null;
    createdAt: string;
    updatedAt: string;
}

interface JobSummary {
    total: number;
    completed: number;
    failed: number;
    errors: string[];
}

interface GenerateResult {
    message: string;
    slug: string;
    totalAssets: number;
    completionStatus: "partial" | "complete";
    jobSummary: JobSummary;
}

interface PreflightStoryboardPlan {
    deliverableId: string;
    assetType: string;
    alreadyInManifest: boolean;
    totalShots: number;
    shotsWithMissingImage: number;
    missingShotSceneIds: string[];
    readyForStoryboardGeneration: boolean;
    willFailVideoGeneration: boolean;
}

interface PreflightData {
    slug: string;
    sceneLibraryCount: number;
    sceneImagesInManifest: number;
    missingScenes: string[];
    readyForStoryboardGeneration: boolean;
    storyboards: PreflightStoryboardPlan[];
}

interface CategoryConfig {
    key: string;
    label: string;
    icon: typeof Layers;
    color: string;
    types: readonly AssetType[];
}

const CATEGORIES: readonly CategoryConfig[] = [
    { key: "references", label: "References", icon: Eye, color: "cyan", types: ["ship_reference_image"] },
    { key: "images", label: "Images", icon: Image, color: "cyan", types: ["hero_image", "aesthetic_concept", "platform_crop"] },
    { key: "scenes", label: "Scene Images", icon: Layers, color: "teal", types: ["scene_image"] },
    { key: "tiktok", label: "TikTok Package", icon: Film, color: "purple", types: ["tiktok_seed_video"] },
    { key: "audio", label: "Audio", icon: Music, color: "emerald", types: ["ambient_narration", "hype_clip", "theme_music"] },
    { key: "copy", label: "Copy", icon: Type, color: "amber", types: ["ad_creative", "carousel_slide", "email_header"] },
    { key: "merch", label: "Merch", icon: Shirt, color: "pink", types: ["merch_design"] },
];

const COST_ESTIMATES: Record<string, string> = {
    references: "~SerpAPI search + import only",
    images: "~Nano-Banana × heroes + concepts + crops (uses approved refs)",
    scenes: "~Nano-Banana × 8–12 scene images (Production Bible)",
    tiktok: "~Production Bible scenes + ElevenLabs",
    audio: "~$0.20 (ElevenLabs × 2 clips)",
    copy: "~$0.05 (GPT-4o single call)",
    merch: "~$0.40 (Nano-Banana × 3–5 designs)",
    all: "~full pipeline (storyboard path if Production Bible exists)",
};

const LS_SLUG_KEY = "mediaGen_slug";
const getManifestStorageKey = (targetSlug: string) => `mediaGen_manifest_${targetSlug}`;

export default function MediaGenerationTestPage() {
    const searchParams = useSearchParams();
    const { presetId, presets } = useVideoModelPreference();
    const [slug, setSlug] = useState("");
    const [initialSlugHydrated, setInitialSlugHydrated] = useState(false);
    const [themeMusicSource, setThemeMusicSource] = useState<'replicate' | 'default'>('default');
    const [preflightEnabled, setPreflightEnabled] = useState(false);
    const [preflightLoading, setPreflightLoading] = useState(false);
    const [preflightData, setPreflightData] = useState<PreflightData | null>(null);
    const [pageState, setPageState] = useState<PageState>("idle");
    const [activeCategory, setActiveCategory] = useState<string | null>(null);
    const [result, setResult] = useState<GenerateResult | null>(null);
    const [manifest, setManifest] = useState<CampaignMediaManifest | null>(null);
    const [brief, setBrief] = useState<CampaignAestheticBrief | null>(null);
    const [campaign, setCampaign] = useState<DiscoveryCampaignSnapshot | null>(null);
    const [probeResult, setProbeResult] = useState<ProbeRunRecord | null>(null);
    const [probeLoading, setProbeLoading] = useState(false);
    const [error, setError] = useState("");
    const requestedSlug = searchParams.get("slug")?.trim() ?? "";
    const handoffSource = searchParams.get("from")?.trim() ?? "";

    const isBusy = pageState !== "idle";

    // ── Persist slug whenever it changes ──────────────────────────────────────
    useEffect(() => {
        if (slug.trim()) localStorage.setItem(LS_SLUG_KEY, slug.trim());
    }, [slug]);

    // ── On mount: restore slug + manifest from localStorage ──────────────────
    const handleLoadManifestRef = useCallback(async (targetSlug: string) => {
        setPageState("loading");
        setError("");
        try {
            const cacheBuster = `?t=${Date.now()}`;
            const [manifestRes, briefRes, campaignRes] = await Promise.all([
                fetch(`/api/groups/campaign/${targetSlug}/media/manifest${cacheBuster}`, { cache: 'no-store' }),
                fetch(`/api/groups/campaign/${targetSlug}/media/aesthetic${cacheBuster}`, { cache: 'no-store' }),
                fetch(`/api/groups/campaign/${targetSlug}${cacheBuster}`, { cache: 'no-store' }),
            ]);
            if (manifestRes.status === 404) {
                setManifest(null);
                setError("No media outputs exist for this campaign yet. Generate media to create the manifest.");
                localStorage.removeItem(getManifestStorageKey(targetSlug));
            } else {
                const data = await manifestRes.json();
                if (!manifestRes.ok) throw new Error(data.error || "Load failed");
                setManifest(data as CampaignMediaManifest);
                localStorage.setItem(getManifestStorageKey(targetSlug), JSON.stringify(data));
            }
            if (briefRes.ok) {
                const briefData = await briefRes.json();
                setBrief(briefData.brief ?? briefData);
            } else {
                setBrief(null);
            }
            if (campaignRes.ok) {
                const campaignData = await campaignRes.json();
                setCampaign(campaignData.campaign ?? null);
            } else {
                setCampaign(null);
            }
            // ── Hydrate last probe run (404 is expected if none exists yet) ──
            const probeRes = await fetch(`/api/groups/campaign/${targetSlug}/media/probe`, { cache: 'no-store' });
            if (probeRes.ok) {
                setProbeResult(await probeRes.json() as ProbeRunRecord);
            } else {
                setProbeResult(null);
            }
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Unknown error");
        } finally {
            setPageState("idle");
        }
    }, []);

    const handleRunProbes = async () => {
        const trimmedSlug = slug.trim();
        if (!trimmedSlug) return;
        const confirmed = window.confirm(
            `Run probe renders for "${trimmedSlug}"?\n\nEstimated cost: 6 × Gemini Flash Image (cheap preview renders).`
        );
        if (!confirmed) return;
        setProbeLoading(true);
        setError("");
        try {
            const res = await fetch(`/api/groups/campaign/${trimmedSlug}/media/probe`, { method: 'POST' });
            const data = await res.json();
            if (!res.ok) throw new Error((data as { error?: string }).error ?? `Probe failed (${res.status})`);
            setProbeResult(data as ProbeRunRecord);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Probe run failed");
        } finally {
            setProbeLoading(false);
        }
    };

    useEffect(() => {
        if (initialSlugHydrated) return;

        const initialSlug = requestedSlug || localStorage.getItem(LS_SLUG_KEY) || "";
        if (!initialSlug) {
            setInitialSlugHydrated(true);
            return;
        }

        setSlug(initialSlug);
        const savedManifest = localStorage.getItem(getManifestStorageKey(initialSlug));
        if (savedManifest) {
            try {
                setManifest(JSON.parse(savedManifest) as CampaignMediaManifest);
            } catch { /* ignore malformed cache */ }
        }
        void handleLoadManifestRef(initialSlug);
        setInitialSlugHydrated(true);
    }, [handleLoadManifestRef, initialSlugHydrated, requestedSlug]);

    useEffect(() => {
        const trimmedSlug = slug.trim();
        if (!trimmedSlug) {
            setManifest(null);
            setPreflightData(null);
            return;
        }

        const cachedManifest = localStorage.getItem(getManifestStorageKey(trimmedSlug));
        if (cachedManifest) {
            try {
                setManifest(JSON.parse(cachedManifest) as CampaignMediaManifest);
                return;
            } catch {
                localStorage.removeItem(getManifestStorageKey(trimmedSlug));
            }
        }

        setManifest(null);
        setPreflightData(null);
    }, [slug]);

    const handlePreflight = async () => {
        if (!slug.trim()) return;

        setPreflightLoading(true);
        setPreflightData(null);
        setError("");

        try {
            const res = await fetch(`/api/groups/campaign/${slug.trim()}/media/generate-plan`);
            const data = await res.json() as PreflightData | { error?: string };
            if (!res.ok) {
                throw new Error((data as { error?: string }).error || `Preflight failed (${res.status})`);
            }

            setPreflightData(data as PreflightData);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Unknown error");
        } finally {
            setPreflightLoading(false);
        }
    };

    // ── Quick Approve Brief (for test efficiency) ─────────────────────────
    const handleApproveBrief = async () => {
        setPageState("generating");
        setError("");
        try {
            const { response: res, data } = await approveAestheticBrief(slug);
            if (!res.ok) throw new Error((data.error as string | undefined) ?? `HTTP ${res.status}`);
            await handleLoadManifestRef(slug);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setPageState("idle");
        }
    };

    const handleGenerate = async (assetTypes?: readonly AssetType[]) => {
        if (!slug.trim()) return;

        if (assetTypes?.includes('scene_image') && !hasProductionBible) {
            setError('Scene image generation requires a saved Production Bible. Open /tests/production-bible, regenerate the Production Bible, then retry Scene Images.');
            return;
        }

        const VIDEO_ASSET_TYPES: readonly AssetType[] = ['tiktok_seed_video'];
        const willGenerateVideo = !assetTypes || assetTypes.some(t => VIDEO_ASSET_TYPES.includes(t));
        const hasMusicTrack = !!(manifest?.audio?.themeMusic);

        if (willGenerateVideo && !hasMusicTrack) {
            const proceedWithoutMusic = window.confirm(
                `⚠️ No music track in manifest\n\nVideos will be generated without music.\n\nTo add music first, cancel and generate the Audio category.\n\nProceed without music?`
            );
            if (!proceedWithoutMusic) return;
        }

        const categoryLabel = assetTypes ? CATEGORIES.find(c => c.types.some(t => assetTypes.includes(t)))?.key || "targeted" : "all";
        const costStr = COST_ESTIMATES[categoryLabel] || COST_ESTIMATES["all"];

        const confirmed = window.confirm(
            `Generate ${categoryLabel.toUpperCase()} media for "${slug}"?\n\nEstimated cost: ${costStr}\n\nThis will call third-party APIs.`
        );
        if (!confirmed) return;

        setPageState("generating");
        setActiveCategory(categoryLabel);
        setError("");
        setResult(null);

        try {
            const body = JSON.stringify({
                ...(assetTypes ? { assetTypes } : {}),
                themeMusicSource,
            });
            const res = await fetch(`/api/groups/campaign/${slug.trim()}/media/generate`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body,
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || `Generation failed (${res.status})`);
            setResult(data as GenerateResult);
            // Auto-refresh manifest so the latest state is cached for next reload
            await handleLoadManifestRef(slug.trim());
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Unknown error");
        } finally {
            setPageState("idle");
            setActiveCategory(null);
        }
    };

    const handleLoadManifest = async () => {
        if (!slug.trim()) return;
        await handleLoadManifestRef(slug.trim());
    };

    const colorClass = (color: string, part: "bg" | "text" | "border") => {
        const map: Record<string, Record<string, string>> = {
            cyan: { bg: "bg-cyan-500/20", text: "text-cyan-400", border: "border-cyan-500/40" },
            teal: { bg: "bg-teal-500/20", text: "text-teal-400", border: "border-teal-500/40" },
            purple: { bg: "bg-purple-500/20", text: "text-purple-400", border: "border-purple-500/40" },
            emerald: { bg: "bg-emerald-500/20", text: "text-emerald-400", border: "border-emerald-500/40" },
            amber: { bg: "bg-amber-500/20", text: "text-amber-400", border: "border-amber-500/40" },
            pink: { bg: "bg-pink-500/20", text: "text-pink-400", border: "border-pink-500/40" },
        };
        return map[color]?.[part] || "";
    };

    const hasProductionBible = !!(brief?.productionBible);
    const sceneCount = brief?.productionBible?.sceneLibrary?.length ?? 0;
    const storyboardCount = brief?.productionBible?.storyboards?.length ?? 0;
    const activeVideoPresetLabel = presets.find((entry) => entry.id === presetId)?.label ?? 'Loading video model...';
    const manifestImageCount = manifest
        ? manifest.images.shipReferences.length
            + manifest.images.hero.length
            + manifest.images.aestheticConcepts.length
            + (manifest.images.sceneImages?.length ?? 0)
        : 0;
    const discoveryFactsReady = campaign !== null;
    const creativeReady = brief !== null;
    const outputsReady = manifest !== null;
    const briefApproved = brief?.humanReviewStatus === 'approved';
    const showBriefStudioHandoff = handoffSource === 'brief-studio' && briefApproved && slug.trim().length > 0;

    return (
        <div className="min-h-screen p-6 font-mono text-white bg-slate-950">
            <div className="max-w-5xl mx-auto space-y-4">

                {/* Header */}
                <div className="p-4 border border-white/10 rounded-xl bg-slate-900/50">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <h1 className="text-lg font-semibold tracking-wide text-cyan-400">
                            🎬 Media Generation — Phase 2
                        </h1>
                        <div className="flex flex-wrap gap-2">
                            <a
                                href="/tests/video-model-lab"
                                className="flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 rounded-lg transition"
                            >
                                <Film className="w-3.5 h-3.5" />
                                Video Model Lab
                                <ExternalLink className="w-3 h-3" />
                            </a>
                            <a
                                href="/tests/production-bible"
                                className="flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 rounded-lg transition"
                            >
                                <BookOpen className="w-3.5 h-3.5" />
                                Production Bible
                                <ExternalLink className="w-3 h-3" />
                            </a>
                        </div>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                        Generate real-ship reference imagery, scene images, storyboard-driven video, audio, copy, and merch from an approved aesthetic brief.
                        Each category can be run independently. Requires an approved brief with Production Bible for the storyboard path.
                    </p>
                    <p className="mt-2 text-xs text-cyan-300/80">
                        Shared video model preference: <span className="text-cyan-200">{activeVideoPresetLabel}</span>
                    </p>
                </div>

                <VoicePreferencePanel />

                {/* Slug Input */}
                <div className="p-4 space-y-3 border border-white/10 rounded-xl bg-slate-900/50">
                    <div className="text-[10px] text-slate-500 uppercase tracking-widest">Campaign</div>
                    <CampaignSelector
                        value={slug}
                        onChange={(s) => { setSlug(s); if (s.trim()) void handleLoadManifestRef(s.trim()); }}
                        disabled={isBusy}
                    />
                    <button
                        id="btn-load-manifest"
                        onClick={handleLoadManifest}
                        disabled={isBusy || !slug.trim()}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium transition-all border rounded-lg bg-slate-700/50 border-white/10 text-slate-300 hover:bg-slate-700 disabled:opacity-40 disabled:pointer-events-none"
                    >
                        {pageState === "loading"
                            ? <Loader2 className="w-4 h-4 animate-spin" />
                            : <Download className="w-4 h-4" />
                        }
                        {pageState === "loading" ? "Loading..." : "Load Manifest"}
                    </button>

                    <div>
                        <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-2">Music Source</div>
                        <select
                            value={themeMusicSource}
                            onChange={(event) => setThemeMusicSource(event.target.value === 'replicate' ? 'replicate' : 'default')}
                            disabled={isBusy}
                            className="w-full px-3 py-2 text-sm border rounded-lg bg-slate-800 border-white/10 text-slate-200 focus:outline-none focus:border-cyan-500/40 disabled:opacity-40"
                        >
                            <option value="default">Shared Music Library</option>
                            <option value="replicate">Replicate MusicGen</option>
                        </select>
                        <p className="mt-2 text-[11px] text-slate-500">
                            Choose whether theme music should reuse a tagged library track or generate a new track with Replicate.
                        </p>
                    </div>

                    {error && (
                        <div className="px-3 py-2 text-xs text-red-400 border rounded-lg bg-red-500/10 border-red-500/20">
                            {error}
                        </div>
                    )}
                </div>

                {showBriefStudioHandoff && (
                    <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-xs text-emerald-200">
                        <div className="text-[10px] uppercase tracking-widest text-emerald-300">Brief Studio Handoff</div>
                        <p className="mt-2">
                            Approved brief loaded for <span className="text-emerald-100">{slug.trim()}</span>. This is the next step after Brief Studio. Generate by category or run <span className="text-emerald-100">Generate All Media</span> when you are ready.
                        </p>
                    </div>
                )}

                <div className="p-4 space-y-3 border border-white/10 rounded-xl bg-slate-900/50">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <div className="text-[10px] text-slate-500 uppercase tracking-widest">What Each Layer Controls</div>
                            <p className="mt-1 text-xs text-slate-400">
                                Discovery holds campaign facts. Aesthetic Design holds the approved creative direction. The manifest holds the media files currently generated for this campaign.
                            </p>
                        </div>
                        <div className="text-[10px] text-slate-500">
                            {slug.trim() ? `Campaign: ${slug.trim()}` : 'Select a campaign'}
                        </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-3">
                        <div className={`rounded-xl border p-3 ${discoveryFactsReady ? 'border-cyan-500/30 bg-cyan-500/5' : 'border-white/10 bg-slate-950/40'}`}>
                            <div className="flex items-center justify-between gap-2">
                                <div className="text-[10px] uppercase tracking-widest text-cyan-400">Discovery</div>
                                <div className={`text-[9px] px-2 py-0.5 rounded-full border ${discoveryFactsReady ? 'border-cyan-500/30 text-cyan-300 bg-cyan-500/10' : 'border-white/10 text-slate-500'}`}>
                                    {discoveryFactsReady ? 'facts' : 'missing'}
                                </div>
                            </div>
                            <div className="mt-2 space-y-1 text-xs text-slate-300">
                                <div>{campaign?.name ?? 'No campaign loaded'}</div>
                                <div className="text-slate-500">{campaign?.shipTarget ?? 'Ship unknown'} · {campaign?.targetDates ?? 'Dates unknown'}</div>
                                <div className="text-slate-500">{campaign?.pricingStatus ?? 'No pricing status'}{campaign?.startingPrice ? ` · From $${campaign.startingPrice.toLocaleString()}` : ''}</div>
                            </div>
                            <div className="mt-3 text-[11px] text-slate-400">
                                Use this card for ship, itinerary, pricing, booking link, and audience facts.
                            </div>
                        </div>

                        <div className={`rounded-xl border p-3 ${creativeReady ? 'border-teal-500/30 bg-teal-500/5' : 'border-white/10 bg-slate-950/40'}`}>
                            <div className="flex items-center justify-between gap-2">
                                <div className="text-[10px] uppercase tracking-widest text-teal-400">Aesthetic Design</div>
                                <div className={`text-[9px] px-2 py-0.5 rounded-full border ${creativeReady ? 'border-teal-500/30 text-teal-300 bg-teal-500/10' : 'border-white/10 text-slate-500'}`}>
                                    {creativeReady ? 'creative' : 'missing'}
                                </div>
                            </div>
                            <div className="mt-2 space-y-1 text-xs text-slate-300">
                                <div>{brief?.visual.aestheticLabel ?? 'No approved brief loaded'}</div>
                                <div className="text-slate-500">{brief?.messaging.heroSlogan ?? 'No hero slogan'}</div>
                                <div className="text-slate-500">{hasProductionBible ? `${sceneCount} scenes · ${storyboardCount} storyboards` : 'No Production Bible attached'}</div>
                            </div>
                            <div className="mt-3 text-[11px] text-slate-400">
                                Use this card for the creative brief, image prompts, visual language, and the Production Bible.
                            </div>
                        </div>

                        <div className={`rounded-xl border p-3 ${outputsReady ? 'border-purple-500/30 bg-purple-500/5' : 'border-white/10 bg-slate-950/40'}`}>
                            <div className="flex items-center justify-between gap-2">
                                <div className="text-[10px] uppercase tracking-widest text-purple-400">Media Manifest</div>
                                <div className={`text-[9px] px-2 py-0.5 rounded-full border ${outputsReady ? 'border-purple-500/30 text-purple-300 bg-purple-500/10' : 'border-white/10 text-slate-500'}`}>
                                    {outputsReady ? 'outputs' : 'missing'}
                                </div>
                            </div>
                            <div className="mt-2 space-y-1 text-xs text-slate-300">
                                <div>{outputsReady ? `${manifest?.totalAssets ?? 0} total active assets` : 'No manifest loaded'}</div>
                                <div className="text-slate-500">{outputsReady ? `${manifestImageCount} images · ${manifest?.completionStatus ?? 'unknown'}` : 'Generate or load manifest first'}</div>
                                <div className="text-slate-500">{manifest?.generatedAt ? new Date(manifest.generatedAt).toLocaleString() : 'No generation timestamp'}</div>
                            </div>
                            <div className="mt-3 text-[11px] text-slate-400">
                                Use this card to see which generated assets currently exist and which ones are active for review.
                            </div>
                        </div>
                    </div>
                </div>

                {/* Production Bible status strip */}
                <div className={`border rounded-xl p-3 flex items-center gap-3 text-xs ${
                    hasProductionBible
                        ? "border-teal-500/30 bg-teal-500/5 text-teal-300"
                        : "border-amber-500/30 bg-amber-500/5 text-amber-400"
                }`}>
                    <BookOpen className="w-4 h-4 shrink-0" />
                    {hasProductionBible ? (
                        <span>
                            Production Bible ready — <strong>{sceneCount} scenes</strong>, <strong>{storyboardCount} storyboards</strong>.
                            Video generation will use storyboard-driven assembly with per-shot scene images.
                        </span>
                    ) : brief ? (
                        <span>
                            No Production Bible on this brief. TikTok video generation is blocked until the brief is regenerated with storyboard scenes.
                            Use /tests/production-bible to create the Production Bible, then rerun media generation.
                        </span>
                    ) : (
                        <span className="text-slate-500">Load a campaign to see Production Bible status.</span>
                    )}
                </div>

                {/* Per-Category Generator Buttons */}
                <div className="p-4 border border-white/10 rounded-xl bg-slate-900/50">
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                        <div className="text-[10px] text-slate-500 uppercase tracking-widest">Generate by Category</div>
                        <label className="flex items-center gap-2 text-[11px] text-slate-400 select-none">
                            <input
                                type="checkbox"
                                checked={preflightEnabled}
                                onChange={(event) => {
                                    setPreflightEnabled(event.target.checked);
                                    if (!event.target.checked) {
                                        setPreflightData(null);
                                    }
                                }}
                                disabled={isBusy}
                                className="h-3.5 w-3.5 rounded border-white/20 bg-slate-900 text-cyan-400 focus:ring-cyan-500/40"
                            />
                            Enable storyboard preflight
                        </label>
                    </div>

                    {preflightEnabled && (
                        <div className="p-3 mb-4 space-y-3 border rounded-xl border-cyan-500/20 bg-cyan-500/5">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <div className="text-[10px] uppercase tracking-widest text-cyan-400">Preflight</div>
                                    <p className="mt-1 text-[11px] text-slate-400">
                                        Validate storyboard scene coverage without calling Runway or spending credits.
                                    </p>
                                </div>
                                <button
                                    onClick={() => void handlePreflight()}
                                    disabled={preflightLoading || isBusy || !slug.trim() || !hasProductionBible}
                                    className="flex items-center gap-2 px-3 py-2 text-xs font-medium transition border rounded-lg bg-cyan-500/10 border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/15 disabled:opacity-40 disabled:pointer-events-none"
                                    title={!hasProductionBible ? "No Production Bible on this brief" : "Run storyboard preflight"}
                                >
                                    {preflightLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                                    {preflightLoading ? "Running Preflight..." : "Run Preflight"}
                                </button>
                            </div>

                            {preflightData && (
                                <div className="space-y-3">
                                    <div className="flex items-center gap-3 flex-wrap text-[11px]">
                                        <span className={`px-2 py-1 rounded-full border ${preflightData.readyForStoryboardGeneration ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-amber-500/30 bg-amber-500/10 text-amber-300'}`}>
                                            {preflightData.readyForStoryboardGeneration ? 'Ready for storyboard generation' : 'Storyboard generation blocked'}
                                        </span>
                                        <span className="text-slate-400">
                                            {preflightData.sceneImagesInManifest}/{preflightData.sceneLibraryCount} scene images present
                                        </span>
                                        {preflightData.missingScenes.length > 0 && (
                                            <span className="text-red-400">
                                                Missing scenes: {preflightData.missingScenes.join(', ')}
                                            </span>
                                        )}
                                    </div>

                                    <div className="grid gap-2 md:grid-cols-2">
                                        {preflightData.storyboards.map((storyboard) => (
                                            <div key={storyboard.deliverableId} className="p-3 space-y-2 text-xs border rounded-lg border-white/10 bg-slate-950/40">
                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                    <div className="font-medium text-slate-200">{storyboard.deliverableId}</div>
                                                    <span className={`px-2 py-0.5 rounded-full border ${storyboard.readyForStoryboardGeneration ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-red-500/30 bg-red-500/10 text-red-300'}`}>
                                                        {storyboard.readyForStoryboardGeneration ? 'ready' : 'missing scene images'}
                                                    </span>
                                                </div>
                                                <div className="text-slate-500">
                                                    {storyboard.totalShots} shots · {storyboard.assetType}{storyboard.alreadyInManifest ? ' · already in manifest' : ''}
                                                </div>
                                                {storyboard.shotsWithMissingImage > 0 ? (
                                                    <div className="text-red-400">
                                                        Missing shot scenes: {storyboard.missingShotSceneIds.join(', ')}
                                                    </div>
                                                ) : (
                                                    <div className="text-emerald-400">All shot scene images resolved.</div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                        {CATEGORIES.map((cat) => {
                            const Icon = cat.icon;
                            const isActive = activeCategory === cat.key;
                            const requiresProductionBible = cat.types.includes('scene_image');
                            const requiresTikTokStoryboard = cat.types.includes('tiktok_seed_video');
                            const isBlocked = (requiresProductionBible || requiresTikTokStoryboard) && !hasProductionBible;
                            return (
                                <button
                                    key={cat.key}
                                    id={`btn-gen-${cat.key}`}
                                    onClick={() => handleGenerate(cat.types)}
                                    disabled={isBusy || !slug.trim() || isBlocked}
                                    title={isBlocked ? (requiresTikTokStoryboard ? 'TikTok seed video requires a saved Production Bible and storyboard scene images.' : 'Scene Images require a saved Production Bible. Regenerate it from /tests/production-bible first.') : ''}
                                    className={`flex flex-col items-center gap-2 px-4 py-4 rounded-xl text-sm font-medium ${colorClass(cat.color, "bg")} border ${colorClass(cat.color, "border")} ${colorClass(cat.color, "text")} hover:brightness-125 transition-all disabled:opacity-40 disabled:pointer-events-none`}
                                >
                                    {isActive
                                        ? <Loader2 className="w-6 h-6 animate-spin" />
                                        : <Icon className="w-6 h-6" />
                                    }
                                    <span>{isActive ? "Generating..." : cat.label}</span>
                                    <span className="text-[9px] opacity-60">{COST_ESTIMATES[cat.key]}</span>
                                    {isBlocked && (
                                        <span className="text-[9px] opacity-80 text-amber-300">Production Bible required</span>
                                    )}
                                </button>
                            );
                        })}

                        {/* Full Pipeline Button */}
                        <button
                            id="btn-gen-all"
                            onClick={() => handleGenerate()}
                            disabled={isBusy || !slug.trim()}
                            className="flex flex-col items-center col-span-2 gap-2 px-4 py-4 text-sm font-medium text-white transition-all border rounded-xl bg-gradient-to-br from-cyan-500/20 via-purple-500/20 to-pink-500/20 border-white/20 hover:brightness-125 disabled:opacity-40 disabled:pointer-events-none md:col-span-3"
                        >
                            {activeCategory === "all"
                                ? <Loader2 className="w-6 h-6 animate-spin" />
                                : <Zap className="w-6 h-6" />
                            }
                            <span>{activeCategory === "all" ? "Generating All..." : "⚡ Generate All Media"}</span>
                            <span className="text-[9px] opacity-60 text-center px-2">{COST_ESTIMATES["all"]}</span>
                        </button>
                        {brief?.humanReviewStatus !== 'approved' && (
                            <button
                                onClick={handleApproveBrief}
                                disabled={isBusy || !slug.trim()}
                                className="flex flex-col items-center col-span-2 gap-2 px-4 py-4 text-sm font-medium transition-all border rounded-xl bg-amber-500/20 border-amber-500/40 text-amber-400 hover:brightness-125 disabled:opacity-40 disabled:pointer-events-none md:col-span-3"
                            >
                                {pageState === "generating"
                                    ? <Loader2 className="w-6 h-6 animate-spin" />
                                    : <Zap className="w-6 h-6" />
                                }
                                <span>{brief?.humanReviewStatus === 'revised' ? '⚡ Re-Approve Brief' : '⚡ Quick Approve Brief'}</span>
                                <span className="text-[9px] opacity-60 text-center px-2">
                                    {brief?.humanReviewStatus === 'revised'
                                        ? 'Production Bible changed; re-approve before media generation.'
                                        : 'Bypasses aesthetic review lock'}
                                </span>
                            </button>
                        )}
                    </div>

                </div>

                {/* Generation Result */}
                {result && (
                    <div className="overflow-hidden border border-white/10 rounded-xl bg-slate-900/50">
                        <div className="flex items-center justify-between px-4 py-2 border-b border-white/5">
                            <span className="text-xs tracking-widest uppercase text-slate-400">Generation Result</span>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full border ${result.completionStatus === "complete"
                                    ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                                    : "text-amber-400 border-amber-500/30 bg-amber-500/10"
                                }`}>
                                {result.completionStatus}
                            </span>
                        </div>
                        <div className="p-4 space-y-3">
                            <div className="grid grid-cols-3 gap-4 text-center">
                                <div>
                                    <div className="text-2xl font-bold text-emerald-400">{result.jobSummary.completed}</div>
                                    <div className="text-[10px] text-slate-500">Completed</div>
                                </div>
                                <div>
                                    <div className="text-2xl font-bold text-red-400">{result.jobSummary.failed}</div>
                                    <div className="text-[10px] text-slate-500">Failed</div>
                                </div>
                                <div>
                                    <div className="text-2xl font-bold text-slate-300">{result.totalAssets}</div>
                                    <div className="text-[10px] text-slate-500">Total Assets</div>
                                </div>
                            </div>

                            {result.jobSummary.errors.length > 0 && (
                                <div className="space-y-1">
                                    <div className="flex items-center gap-1 text-xs text-amber-400">
                                        <AlertTriangle className="h-3.5 w-3.5" />
                                        Errors
                                    </div>
                                    {result.jobSummary.errors.map((err, i) => (
                                        <div key={i} className="text-[10px] text-red-400/80 bg-red-500/5 rounded px-2 py-1 border border-red-500/10">
                                            {err}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {manifest && (
                    <MediaReviewPanel slug={slug.trim()} manifest={manifest} brief={brief} onManifestRefresh={handleLoadManifestRef} />
                )}

                {/* Probe Renders — gated on landingStillBible existence */}
                {brief?.landingStillBible && (
                    <div className="overflow-hidden border border-white/10 rounded-xl bg-slate-900/50">
                        <div className="flex items-center justify-between px-4 py-2 border-b border-white/5">
                            <span className="text-xs tracking-widest uppercase text-slate-400">Probe Renders</span>
                            <button
                                onClick={handleRunProbes}
                                disabled={probeLoading || isBusy}
                                className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-white transition rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {probeLoading ? (
                                    <><Loader2 className="w-3 h-3 animate-spin" /> Running…</>
                                ) : (
                                    <><Eye className="w-3 h-3" /> Run Probes</>
                                )}
                            </button>
                        </div>
                        <div className="px-4 pb-2">
                            <p className="mt-2 text-[11px] text-slate-500">
                                Generates one cheap preview image per still spec, scores each with Claude vision, and returns a direction verdict before full production.
                                Run this before generating hero or scene images to catch weak directions early.
                            </p>
                            {probeResult ? (
                                <ProbeResultsPanel record={probeResult} />
                            ) : (
                                <p className="py-4 text-xs text-center text-slate-600">No probe run yet. Click Run Probes to validate still directions.</p>
                            )}
                        </div>
                    </div>
                )}

                {manifest?.copy && (
                    <div className="overflow-hidden border border-white/10 rounded-xl bg-slate-900/50">
                        <div className="flex items-center justify-between px-4 py-2 border-b border-white/5">
                            <span className="text-xs tracking-widest uppercase text-slate-400">Copy Results</span>
                            <div className="flex items-center gap-3 text-[10px] text-slate-500">
                                <span>{manifest.copy.carouselSlides.length} slides</span>
                                <span>{manifest.copy.adVariants.length} ad variants</span>
                                <span>{manifest.copy.emailSubjectLines.length} email subjects</span>
                            </div>
                        </div>

                        <div className="grid gap-4 p-4 md:grid-cols-2">
                            <div className="p-3 space-y-2 border rounded-lg border-white/10 bg-slate-950/40">
                                <div className="text-[10px] uppercase tracking-widest text-slate-500">Carousel Slides</div>
                                {manifest.copy.carouselSlides.map((slide, index) => (
                                    <div key={`carousel-${index}`} className="px-3 py-2 text-xs border rounded-md border-white/5 bg-slate-900/60 text-slate-200">
                                        <span className="mr-2 text-slate-500">{index + 1}.</span>
                                        {slide}
                                    </div>
                                ))}
                            </div>

                            <div className="p-3 space-y-2 border rounded-lg border-white/10 bg-slate-950/40">
                                <div className="text-[10px] uppercase tracking-widest text-slate-500">Email Subject Lines</div>
                                {manifest.copy.emailSubjectLines.map((subjectLine, index) => (
                                    <div key={`subject-${index}`} className="px-3 py-2 space-y-2 text-xs border rounded-md border-white/5 bg-slate-900/60 text-slate-200">
                                        <div className="text-[10px] uppercase tracking-widest text-slate-500">{subjectLine.stage}</div>
                                        <div className="space-y-1">
                                            {subjectLine.variants.map((variant, variantIndex) => (
                                                <div key={`subject-${index}-variant-${variantIndex}`}>
                                                    <span className="mr-2 text-slate-500">{variantIndex + 1}.</span>
                                                    {variant}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="p-3 space-y-2 border rounded-lg border-white/10 bg-slate-950/40 md:col-span-2">
                                <div className="text-[10px] uppercase tracking-widest text-slate-500">Ad Variants</div>
                                <div className="grid gap-3 md:grid-cols-2">
                                    {manifest.copy.adVariants.map((adVariant, index) => (
                                        <div key={`ad-${index}`} className="p-3 space-y-2 text-xs border rounded-md border-white/5 bg-slate-900/60 text-slate-200">
                                            <div className="text-[10px] uppercase tracking-widest text-slate-500">Variant {index + 1}</div>
                                            <div><span className="text-slate-500">Headline:</span> {adVariant.headline}</div>
                                            <div><span className="text-slate-500">Primary Text:</span> {adVariant.primaryText}</div>
                                            <div><span className="text-slate-500">Description:</span> {adVariant.description}</div>
                                            <div><span className="text-slate-500">CTA:</span> {adVariant.cta}</div>
                                            <div><span className="text-slate-500">Variant Key:</span> {adVariant.variant}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="p-3 space-y-2 border rounded-lg border-white/10 bg-slate-950/40 md:col-span-2">
                                <div className="text-[10px] uppercase tracking-widest text-slate-500">Captions</div>
                                <div className="grid gap-3 md:grid-cols-2">
                                    <div className="p-3 space-y-2 text-xs border rounded-md border-white/5 bg-slate-900/60 text-slate-200">
                                        <div className="text-[10px] uppercase tracking-widest text-slate-500">TikTok</div>
                                        <div className="space-y-2">
                                            {manifest.copy.captions.tiktok.map((captionSet, index) => (
                                                <div key={`tiktok-${index}`} className="px-3 py-2 border rounded-md border-white/5 bg-slate-950/40">
                                                    <div>{captionSet.caption}</div>
                                                    <div className="mt-2 text-[10px] text-slate-500">{captionSet.hashtags.join(' ')}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="p-3 space-y-2 text-xs border rounded-md border-white/5 bg-slate-900/60 text-slate-200">
                                        <div className="text-[10px] uppercase tracking-widest text-slate-500">Pinterest</div>
                                        <div className="space-y-2">
                                            {manifest.copy.captions.pinterest.map((pinSet, index) => (
                                                <div key={`pinterest-${index}`} className="px-3 py-2 border rounded-md border-white/5 bg-slate-950/40">
                                                    <div><span className="text-slate-500">Title:</span> {pinSet.title}</div>
                                                    <div><span className="text-slate-500">Description:</span> {pinSet.description}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="p-3 space-y-2 text-xs border rounded-md border-white/5 bg-slate-900/60 text-slate-200 md:col-span-2">
                                        <div className="text-[10px] uppercase tracking-widest text-slate-500">Discord</div>
                                        <div>{manifest.copy.captions.discord}</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Manifest Viewer */}
                {manifest && (
                    <div className="overflow-hidden border border-white/10 rounded-xl bg-slate-900/50">
                        <div className="flex items-center justify-between px-4 py-2 border-b border-white/5">
                            <span className="text-xs tracking-widest uppercase text-slate-400">Media Manifest</span>
                            <div className="flex items-center gap-3 text-[10px] text-slate-500">
                                <span>{manifest.totalAssets} assets</span>
                                <span>{manifest.completionStatus}</span>
                                <span>{new Date(manifest.generatedAt).toLocaleString()}</span>
                            </div>
                        </div>

                        {/* Asset count summary */}
                        <div className="grid grid-cols-3 gap-3 p-4 md:grid-cols-6">
                            <div className="p-3 text-center border rounded-lg bg-cyan-500/5 border-cyan-500/10">
                                <div className="text-lg font-bold text-cyan-400">
                                    {manifest.images.shipReferences.length + manifest.images.hero.length + manifest.images.aestheticConcepts.length}
                                </div>
                                <div className="text-[9px] text-slate-500">Hero + Refs</div>
                            </div>
                            <div className="p-3 text-center border rounded-lg bg-teal-500/5 border-teal-500/10">
                                <div className="text-lg font-bold text-teal-400">
                                    {manifest.images.sceneImages?.length ?? 0}
                                </div>
                                <div className="text-[9px] text-slate-500">Scene Images</div>
                            </div>
                            <div className="p-3 text-center border rounded-lg bg-purple-500/5 border-purple-500/10">
                                <div className="text-lg font-bold text-purple-400">
                                    {[manifest.videos.tiktokSeed, manifest.videos.heroExplainer, manifest.videos.thresholdAnnouncement].filter(Boolean).length + manifest.videos.countdown.length + manifest.videos.broll.length}
                                </div>
                                <div className="text-[9px] text-slate-500">Videos</div>
                            </div>
                            <div className="p-3 text-center border rounded-lg bg-emerald-500/5 border-emerald-500/10">
                                <div className="text-lg font-bold text-emerald-400">
                                    {[manifest.audio.ambientNarration, manifest.audio.hypeClip, manifest.audio.themeMusic].filter(Boolean).length}
                                </div>
                                <div className="text-[9px] text-slate-500">Audio</div>
                            </div>
                            <div className="p-3 text-center border rounded-lg bg-amber-500/5 border-amber-500/10">
                                <div className="text-lg font-bold text-amber-400">
                                    {manifest.copy ? "✓" : "—"}
                                </div>
                                <div className="text-[9px] text-slate-500">Copy</div>
                            </div>
                            <div className="p-3 text-center border rounded-lg bg-pink-500/5 border-pink-500/10">
                                <div className="text-lg font-bold text-pink-400">{manifest.merch.designs.length}</div>
                                <div className="text-[9px] text-slate-500">Merch</div>
                            </div>
                        </div>

                        {/* Full JSON */}
                        <div className="border-t border-white/5">
                            <div className="px-4 py-2 border-b border-white/5">
                                <span className="text-xs tracking-widest uppercase text-slate-400">Full Manifest JSON</span>
                            </div>
                            <div className="p-4 max-h-[500px] overflow-y-auto">
                                <pre className="text-[11px] text-slate-300 leading-relaxed whitespace-pre-wrap break-words">
                                    {JSON.stringify(manifest, null, 2)}
                                </pre>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
