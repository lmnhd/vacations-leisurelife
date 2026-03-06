"use client";

import { useState, useEffect, useCallback } from "react";
import type { CampaignMediaManifest } from "@/lib/campaigns/schema";
import { MediaReviewPanel } from "./media-review-panel";
import {
    Loader2, Wand2, Image, Film, Music, Type, Shirt,
    Zap, Download, Eye, AlertTriangle
} from "lucide-react";

// ────────────────────────────────────────────────────────────────────────────
// Media Generation Test Page
// /tests/media-generation
// Per-category generation + full pipeline execution + manifest viewer.
// ────────────────────────────────────────────────────────────────────────────

type PageState = "idle" | "generating" | "loading";

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

const CATEGORIES = [
    { key: "images", label: "Images", icon: Image, color: "cyan", types: ["ship_reference_image", "hero_image", "aesthetic_concept", "platform_crop"] },
    { key: "video", label: "Video", icon: Film, color: "purple", types: ["tiktok_seed_video", "hero_explainer_video", "threshold_video", "countdown_video", "broll_clip"] },
    { key: "audio", label: "Audio", icon: Music, color: "emerald", types: ["ambient_narration", "hype_clip", "theme_music"] },
    { key: "copy", label: "Copy", icon: Type, color: "amber", types: ["ad_creative", "carousel_slide", "email_header"] },
    { key: "merch", label: "Merch", icon: Shirt, color: "pink", types: ["merch_design"] },
] as const;

const COST_ESTIMATES: Record<string, string> = {
    images: "~search + Nano-Banana image generation",
    video: "~$5–$15 (HeyGen × 3 + RunwayML × 6–7)",
    audio: "~$0.20 (ElevenLabs × 2 clips)",
    copy: "~$0.05 (GPT-4o single call)",
    merch: "~$0.40 (Nano-Banana × 3–5 designs)",
    all: "~$6–$16 total",
};

const LS_SLUG_KEY = "mediaGen_slug";
const getManifestStorageKey = (targetSlug: string) => `mediaGen_manifest_${targetSlug}`;

export default function MediaGenerationTestPage() {
    const [slug, setSlug] = useState("analog-film-and-darkroom-odyssey-2026");
    const [themeMusicSource, setThemeMusicSource] = useState<'replicate' | 'default'>('default');
    const [pageState, setPageState] = useState<PageState>("idle");
    const [activeCategory, setActiveCategory] = useState<string | null>(null);
    const [result, setResult] = useState<GenerateResult | null>(null);
    const [manifest, setManifest] = useState<CampaignMediaManifest | null>(null);
    const [error, setError] = useState("");

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
            const res = await fetch(`/api/groups/campaign/${targetSlug}/media/manifest`);
            if (res.status === 404) {
                setManifest(null);
                setError("No manifest found. Run generation first.");
                localStorage.removeItem(getManifestStorageKey(targetSlug));
                return;
            }
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Load failed");
            setManifest(data as CampaignMediaManifest);
            localStorage.setItem(getManifestStorageKey(targetSlug), JSON.stringify(data));
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Unknown error");
        } finally {
            setPageState("idle");
        }
    }, []);

    useEffect(() => {
        const savedSlug = localStorage.getItem(LS_SLUG_KEY);
        if (savedSlug) {
            setSlug(savedSlug);
            const savedManifest = localStorage.getItem(getManifestStorageKey(savedSlug));
            if (savedManifest) {
                try {
                    setManifest(JSON.parse(savedManifest) as CampaignMediaManifest);
                } catch { /* ignore malformed cache */ }
            }
            void handleLoadManifestRef(savedSlug);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        const trimmedSlug = slug.trim();
        if (!trimmedSlug) {
            setManifest(null);
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
    }, [slug]);

    const handleGenerate = async (assetTypes?: string[]) => {
        if (!slug.trim()) return;
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
            purple: { bg: "bg-purple-500/20", text: "text-purple-400", border: "border-purple-500/40" },
            emerald: { bg: "bg-emerald-500/20", text: "text-emerald-400", border: "border-emerald-500/40" },
            amber: { bg: "bg-amber-500/20", text: "text-amber-400", border: "border-amber-500/40" },
            pink: { bg: "bg-pink-500/20", text: "text-pink-400", border: "border-pink-500/40" },
        };
        return map[color]?.[part] || "";
    };

    return (
        <div className="min-h-screen bg-slate-950 text-white p-6 font-mono">
            <div className="max-w-5xl mx-auto space-y-4">

                {/* Header */}
                <div className="border border-white/10 rounded-xl p-4 bg-slate-900/50">
                    <h1 className="text-lg font-semibold text-cyan-400 tracking-wide">
                        🎬 Media Generation — Phase 2B
                    </h1>
                    <p className="text-xs text-slate-500 mt-1">
                        Generate real-ship reference imagery, Nano-Banana-powered image assets, cinematic video, audio, copy, and merch from an approved aesthetic brief.
                        Each category can be run independently. Requires approved brief and a resolved ship target.
                    </p>
                </div>

                {/* Slug Input */}
                <div className="border border-white/10 rounded-xl p-4 bg-slate-900/50 space-y-3">
                    <div className="text-[10px] text-slate-500 uppercase tracking-widest">Campaign Slug</div>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            placeholder="e.g. analog-film-and-darkroom-odyssey-2026"
                            value={slug}
                            onChange={(e) => setSlug(e.target.value)}
                            disabled={isBusy}
                            className="flex-1 bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500/40 disabled:opacity-40"
                        />
                        <button
                            id="btn-load-manifest"
                            onClick={handleLoadManifest}
                            disabled={isBusy || !slug.trim()}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-slate-700/50 border border-white/10 text-slate-300 hover:bg-slate-700 transition-all disabled:opacity-40 disabled:pointer-events-none"
                        >
                            {pageState === "loading"
                                ? <Loader2 className="h-4 w-4 animate-spin" />
                                : <Download className="h-4 w-4" />
                            }
                            {pageState === "loading" ? "Loading..." : "Load Manifest"}
                        </button>
                    </div>

                    <div>
                        <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-2">Theme Music Source</div>
                        <select
                            value={themeMusicSource}
                            onChange={(event) => setThemeMusicSource(event.target.value === 'replicate' ? 'replicate' : 'default')}
                            disabled={isBusy}
                            className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500/40 disabled:opacity-40"
                        >
                            <option value="default">Default Library</option>
                            <option value="replicate">Replicate MusicGen</option>
                        </select>
                        <p className="mt-2 text-[11px] text-slate-500">
                            Audio generation will either reuse a tagged shared library track or call Replicate for a new one.
                        </p>
                    </div>

                    {error && (
                        <div className="rounded-lg px-3 py-2 text-xs bg-red-500/10 border border-red-500/20 text-red-400">
                            {error}
                        </div>
                    )}
                </div>

                {/* Per-Category Generator Buttons */}
                <div className="border border-white/10 rounded-xl p-4 bg-slate-900/50">
                    <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-3">Generate by Category</div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {CATEGORIES.map((cat) => {
                            const Icon = cat.icon;
                            const isActive = activeCategory === cat.key;
                            return (
                                <button
                                    key={cat.key}
                                    id={`btn-gen-${cat.key}`}
                                    onClick={() => handleGenerate(cat.types as unknown as string[])}
                                    disabled={isBusy || !slug.trim()}
                                    className={`flex flex-col items-center gap-2 px-4 py-4 rounded-xl text-sm font-medium ${colorClass(cat.color, "bg")} border ${colorClass(cat.color, "border")} ${colorClass(cat.color, "text")} hover:brightness-125 transition-all disabled:opacity-40 disabled:pointer-events-none`}
                                >
                                    {isActive
                                        ? <Loader2 className="h-6 w-6 animate-spin" />
                                        : <Icon className="h-6 w-6" />
                                    }
                                    <span>{isActive ? "Generating..." : cat.label}</span>
                                    <span className="text-[9px] opacity-60">{COST_ESTIMATES[cat.key]}</span>
                                </button>
                            );
                        })}

                        {/* Full Pipeline Button */}
                        <button
                            id="btn-gen-all"
                            onClick={() => handleGenerate()}
                            disabled={isBusy || !slug.trim()}
                            className="flex flex-col items-center gap-2 px-4 py-4 rounded-xl text-sm font-medium bg-gradient-to-br from-cyan-500/20 via-purple-500/20 to-pink-500/20 border border-white/20 text-white hover:brightness-125 transition-all disabled:opacity-40 disabled:pointer-events-none col-span-2 md:col-span-3"
                        >
                            {activeCategory === "all"
                                ? <Loader2 className="h-6 w-6 animate-spin" />
                                : <Zap className="h-6 w-6" />
                            }
                            <span>{activeCategory === "all" ? "Generating All..." : "⚡ Generate All Media"}</span>
                            <span className="text-[9px] opacity-60">{COST_ESTIMATES["all"]}</span>
                        </button>
                    </div>
                </div>

                {/* Generation Result */}
                {result && (
                    <div className="border border-white/10 rounded-xl bg-slate-900/50 overflow-hidden">
                        <div className="px-4 py-2 border-b border-white/5 flex items-center justify-between">
                            <span className="text-xs text-slate-400 uppercase tracking-widest">Generation Result</span>
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
                    <MediaReviewPanel slug={slug.trim()} manifest={manifest} onManifestRefresh={handleLoadManifestRef} />
                )}

                {manifest?.copy && (
                    <div className="border border-white/10 rounded-xl bg-slate-900/50 overflow-hidden">
                        <div className="px-4 py-2 border-b border-white/5 flex items-center justify-between">
                            <span className="text-xs text-slate-400 uppercase tracking-widest">Copy Results</span>
                            <div className="flex items-center gap-3 text-[10px] text-slate-500">
                                <span>{manifest.copy.carouselSlides.length} slides</span>
                                <span>{manifest.copy.adVariants.length} ad variants</span>
                                <span>{manifest.copy.emailSubjectLines.length} email subjects</span>
                            </div>
                        </div>

                        <div className="grid gap-4 p-4 md:grid-cols-2">
                            <div className="space-y-2 rounded-lg border border-white/10 bg-slate-950/40 p-3">
                                <div className="text-[10px] uppercase tracking-widest text-slate-500">Carousel Slides</div>
                                {manifest.copy.carouselSlides.map((slide, index) => (
                                    <div key={`carousel-${index}`} className="rounded-md border border-white/5 bg-slate-900/60 px-3 py-2 text-xs text-slate-200">
                                        <span className="mr-2 text-slate-500">{index + 1}.</span>
                                        {slide}
                                    </div>
                                ))}
                            </div>

                            <div className="space-y-2 rounded-lg border border-white/10 bg-slate-950/40 p-3">
                                <div className="text-[10px] uppercase tracking-widest text-slate-500">Email Subject Lines</div>
                                {manifest.copy.emailSubjectLines.map((subjectLine, index) => (
                                    <div key={`subject-${index}`} className="rounded-md border border-white/5 bg-slate-900/60 px-3 py-2 text-xs text-slate-200 space-y-2">
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

                            <div className="space-y-2 rounded-lg border border-white/10 bg-slate-950/40 p-3 md:col-span-2">
                                <div className="text-[10px] uppercase tracking-widest text-slate-500">Ad Variants</div>
                                <div className="grid gap-3 md:grid-cols-2">
                                    {manifest.copy.adVariants.map((adVariant, index) => (
                                        <div key={`ad-${index}`} className="rounded-md border border-white/5 bg-slate-900/60 p-3 text-xs text-slate-200 space-y-2">
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

                            <div className="space-y-2 rounded-lg border border-white/10 bg-slate-950/40 p-3 md:col-span-2">
                                <div className="text-[10px] uppercase tracking-widest text-slate-500">Captions</div>
                                <div className="grid gap-3 md:grid-cols-2">
                                    <div className="rounded-md border border-white/5 bg-slate-900/60 p-3 text-xs text-slate-200 space-y-2">
                                        <div className="text-[10px] uppercase tracking-widest text-slate-500">TikTok</div>
                                        <div className="space-y-2">
                                            {manifest.copy.captions.tiktok.map((captionSet, index) => (
                                                <div key={`tiktok-${index}`} className="rounded-md border border-white/5 bg-slate-950/40 px-3 py-2">
                                                    <div>{captionSet.caption}</div>
                                                    <div className="mt-2 text-[10px] text-slate-500">{captionSet.hashtags.join(' ')}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="rounded-md border border-white/5 bg-slate-900/60 p-3 text-xs text-slate-200 space-y-2">
                                        <div className="text-[10px] uppercase tracking-widest text-slate-500">Pinterest</div>
                                        <div className="space-y-2">
                                            {manifest.copy.captions.pinterest.map((pinSet, index) => (
                                                <div key={`pinterest-${index}`} className="rounded-md border border-white/5 bg-slate-950/40 px-3 py-2">
                                                    <div><span className="text-slate-500">Title:</span> {pinSet.title}</div>
                                                    <div><span className="text-slate-500">Description:</span> {pinSet.description}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="rounded-md border border-white/5 bg-slate-900/60 p-3 text-xs text-slate-200 space-y-2 md:col-span-2">
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
                    <div className="border border-white/10 rounded-xl bg-slate-900/50 overflow-hidden">
                        <div className="px-4 py-2 border-b border-white/5 flex items-center justify-between">
                            <span className="text-xs text-slate-400 uppercase tracking-widest">Media Manifest</span>
                            <div className="flex items-center gap-3 text-[10px] text-slate-500">
                                <span>{manifest.totalAssets} assets</span>
                                <span>{manifest.completionStatus}</span>
                                <span>{new Date(manifest.generatedAt).toLocaleString()}</span>
                            </div>
                        </div>

                        {/* Asset count summary */}
                        <div className="p-4 grid grid-cols-5 gap-3">
                            <div className="text-center p-3 rounded-lg bg-cyan-500/5 border border-cyan-500/10">
                                <div className="text-lg font-bold text-cyan-400">
                                    {manifest.images.shipReferences.length + manifest.images.hero.length + manifest.images.aestheticConcepts.length}
                                </div>
                                <div className="text-[9px] text-slate-500">Images + References</div>
                            </div>
                            <div className="text-center p-3 rounded-lg bg-purple-500/5 border border-purple-500/10">
                                <div className="text-lg font-bold text-purple-400">
                                    {[manifest.videos.tiktokSeed, manifest.videos.heroExplainer, manifest.videos.thresholdAnnouncement].filter(Boolean).length + manifest.videos.countdown.length + manifest.videos.broll.length}
                                </div>
                                <div className="text-[9px] text-slate-500">Videos</div>
                            </div>
                            <div className="text-center p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
                                <div className="text-lg font-bold text-emerald-400">
                                    {[manifest.audio.ambientNarration, manifest.audio.hypeClip, manifest.audio.themeMusic].filter(Boolean).length}
                                </div>
                                <div className="text-[9px] text-slate-500">Audio</div>
                            </div>
                            <div className="text-center p-3 rounded-lg bg-amber-500/5 border border-amber-500/10">
                                <div className="text-lg font-bold text-amber-400">
                                    {manifest.copy ? "✓" : "—"}
                                </div>
                                <div className="text-[9px] text-slate-500">Copy</div>
                            </div>
                            <div className="text-center p-3 rounded-lg bg-pink-500/5 border border-pink-500/10">
                                <div className="text-lg font-bold text-pink-400">{manifest.merch.designs.length}</div>
                                <div className="text-[9px] text-slate-500">Merch</div>
                            </div>
                        </div>

                        {/* Full JSON */}
                        <div className="border-t border-white/5">
                            <div className="px-4 py-2 border-b border-white/5">
                                <span className="text-xs text-slate-400 uppercase tracking-widest">Full Manifest JSON</span>
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
