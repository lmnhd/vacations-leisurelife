"use client";

import { useState, useEffect, useCallback } from "react";
import type {
    CampaignAestheticBrief,
    CampaignMediaManifest,
    ProductionBible,
    SceneSpec,
    Storyboard,
    ShotSpec,
    AssetRecord,
} from "@/lib/campaigns/schema";
import {
    Loader2, BookOpen, Film, Image, Eye, RefreshCw,
    ChevronDown, ChevronRight, Play, Layers, Camera,
    AlertTriangle, CheckCircle2, Zap, Wand2
} from "lucide-react";
import { CampaignSelector } from "../media-generation/campaign-selector";

// ────────────────────────────────────────────────────────────────────────────
// Production Bible Test Page
// /tests/production-bible
// Preview Production Bible, scene library, storyboards.
// All actions use the SAME manifest + API routes as the real pipeline.
// ────────────────────────────────────────────────────────────────────────────

type PageState = "idle" | "loading" | "generating";

const LS_SLUG_KEY = "prodBible_slug";

export default function ProductionBibleTestPage() {
    const [slug, setSlug] = useState("");
    const [pageState, setPageState] = useState<PageState>("idle");
    const [brief, setBrief] = useState<CampaignAestheticBrief | null>(null);
    const [manifest, setManifest] = useState<CampaignMediaManifest | null>(null);
    const [error, setError] = useState("");
    const [expandedScenes, setExpandedScenes] = useState<Set<string>>(new Set());
    const [expandedStoryboards, setExpandedStoryboards] = useState<Set<string>>(new Set());
    const [generateLog, setGenerateLog] = useState<string[]>([]);

    const isBusy = pageState !== "idle";
    const bible: ProductionBible | undefined = brief?.productionBible ?? undefined;

    // ── Persist slug ──────────────────────────────────────────────────────
    useEffect(() => {
        const saved = localStorage.getItem(LS_SLUG_KEY);
        if (saved) setSlug(saved);
    }, []);
    useEffect(() => {
        if (slug.trim()) localStorage.setItem(LS_SLUG_KEY, slug.trim());
    }, [slug]);

    // ── Load brief + manifest ─────────────────────────────────────────────
    const loadData = useCallback(async (targetSlug: string) => {
        setPageState("loading");
        setError("");
        try {
            const [briefRes, manifestRes] = await Promise.all([
                fetch(`/api/groups/campaign/${targetSlug}/media/aesthetic`),
                fetch(`/api/groups/campaign/${targetSlug}/media/manifest`),
            ]);

            if (briefRes.ok) {
                const data = await briefRes.json();
                setBrief(data.brief ?? data);
            } else {
                setBrief(null);
                setError("No aesthetic brief found. Generate one first.");
            }

            if (manifestRes.ok) {
                const data = await manifestRes.json();
                setManifest(data.manifest ?? data);
            } else {
                setManifest(null);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setPageState("idle");
        }
    }, []);

    useEffect(() => {
        if (slug.trim()) loadData(slug.trim());
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Generate scene images via the REAL pipeline ───────────────────────
    const handleGenerateSceneImages = async () => {
        setPageState("generating");
        setError("");
        setGenerateLog(["Starting scene image generation via real pipeline..."]);
        try {
            const res = await fetch(`/api/groups/campaign/${slug}/media/generate`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ assetTypes: ["scene_image"] }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
            setGenerateLog(prev => [...prev, `Done: ${data.totalAssets} assets, status: ${data.completionStatus}`]);
            if (data.jobSummary?.errors?.length > 0) {
                setGenerateLog(prev => [...prev, ...data.jobSummary.errors.map((e: string) => `ERROR: ${e}`)]);
            }
            await loadData(slug);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setPageState("idle");
        }
    };

    // ── Generate storyboard videos via the REAL pipeline ──────────────────
    const handleGenerateVideos = async () => {
        setPageState("generating");
        setError("");
        setGenerateLog(["Starting storyboard video generation via real pipeline..."]);
        try {
            const res = await fetch(`/api/groups/campaign/${slug}/media/generate`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    assetTypes: ["tiktok_seed_video", "hero_explainer_video", "threshold_video", "countdown_video"],
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
            setGenerateLog(prev => [...prev, `Done: ${data.totalAssets} assets, status: ${data.completionStatus}`]);
            if (data.jobSummary?.errors?.length > 0) {
                setGenerateLog(prev => [...prev, ...data.jobSummary.errors.map((e: string) => `ERROR: ${e}`)]);
            }
            await loadData(slug);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setPageState("idle");
        }
    };

    // ── Generate full pipeline ────────────────────────────────────────────
    const handleGenerateAll = async () => {
        setPageState("generating");
        setError("");
        setGenerateLog(["Starting full media generation via real pipeline..."]);
        try {
            const res = await fetch(`/api/groups/campaign/${slug}/media/generate`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ themeMusicSource: "default" }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
            setGenerateLog(prev => [...prev, `Done: ${data.totalAssets} assets, status: ${data.completionStatus}`]);
            if (data.jobSummary?.errors?.length > 0) {
                setGenerateLog(prev => [...prev, ...data.jobSummary.errors.map((e: string) => `ERROR: ${e}`)]);
            }
            await loadData(slug);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setPageState("idle");
        }
    };

    // ── Regenerate Production Bible (rewrites scene specs) ─────────────────
    const handleRegenerateBible = async () => {
        if (!slug.trim()) return;
        setPageState("generating");
        setError("");
        setGenerateLog(["Regenerating Production Bible scene specs with updated creative direction..."]);
        try {
            const res = await fetch(`/api/groups/campaign/${slug}/media/aesthetic/production-bible`, {
                method: "POST",
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
            setGenerateLog(prev => [...prev, `Done — ${data.brief?.productionBible?.sceneLibrary?.length ?? 0} new scenes generated`]);
            await loadData(slug.trim());
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setPageState("idle");
        }
    };

    // ── Toggle helpers ────────────────────────────────────────────────────
    const toggleScene = (sceneId: string) => {
        setExpandedScenes(prev => {
            const next = new Set(prev);
            if (next.has(sceneId)) next.delete(sceneId); else next.add(sceneId);
            return next;
        });
    };
    const toggleStoryboard = (delivId: string) => {
        setExpandedStoryboards(prev => {
            const next = new Set(prev);
            if (next.has(delivId)) next.delete(delivId); else next.add(delivId);
            return next;
        });
    };

    // ── Find scene image from manifest by sceneId ─────────────────────────
    const getSceneImageUrl = (sceneId: string): string | null => {
        if (!manifest?.images.sceneImages) return null;
        const rec = manifest.images.sceneImages.find(
            (r: AssetRecord) => r.tags.includes(sceneId)
        );
        return rec?.url ?? null;
    };

    return (
        <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6">
            <div className="max-w-6xl mx-auto space-y-6">
                {/* Header */}
                <div className="flex items-center gap-3">
                    <BookOpen className="w-6 h-6 text-amber-400" />
                    <h1 className="text-2xl font-bold">Production Bible</h1>
                    <span className="text-xs bg-zinc-800 px-2 py-1 rounded text-zinc-400">
                        /tests/production-bible
                    </span>
                </div>

                {/* Campaign selector + load */}
                <div className="space-y-2">
                    <CampaignSelector
                        value={slug}
                        onChange={(s) => { setSlug(s); if (s.trim()) void loadData(s.trim()); }}
                        disabled={isBusy}
                    />
                    <div className="flex gap-2">
                        <button
                            className="bg-zinc-800 hover:bg-zinc-700 px-4 py-2 rounded text-sm flex items-center gap-2 disabled:opacity-40"
                            onClick={() => loadData(slug.trim())}
                            disabled={isBusy || !slug.trim()}
                        >
                            {pageState === "loading" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                            {pageState === "loading" ? "Loading..." : "Load"}
                        </button>
                        <button
                            className="bg-zinc-800 hover:bg-zinc-700 px-4 py-2 rounded text-sm flex items-center gap-2 disabled:opacity-40"
                            onClick={() => loadData(slug.trim())}
                            disabled={isBusy || !slug.trim()}
                        >
                            <RefreshCw className="w-4 h-4" />
                            Refresh
                        </button>
                    </div>
                </div>

                {error && (
                    <div className="bg-red-900/30 border border-red-800 text-red-300 rounded p-3 text-sm flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        {error}
                    </div>
                )}

                {/* Brief status */}
                {brief && (
                    <div className="bg-zinc-900 border border-zinc-800 rounded p-4 space-y-2">
                        <div className="flex items-center justify-between">
                            <div>
                                <h2 className="font-semibold">{brief.themeName}</h2>
                                <p className="text-xs text-zinc-400">
                                    Status: <span className={brief.humanReviewStatus === "approved" ? "text-green-400" : "text-amber-400"}>
                                        {brief.humanReviewStatus}
                                    </span>
                                    {" • "}Production Bible: {bible ? (
                                        <span className="text-green-400">{bible.sceneLibrary.length} scenes, {bible.storyboards.length} storyboards</span>
                                    ) : (
                                        <span className="text-red-400">Not generated</span>
                                    )}
                                </p>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-zinc-500">
                                {manifest && (
                                    <span className="bg-zinc-800 px-2 py-1 rounded">
                                        Manifest: {manifest.totalAssets} assets ({manifest.completionStatus})
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Action buttons */}
                <div className="space-y-2">
                    <div className="text-xs text-zinc-500 font-medium uppercase tracking-wide">Step 1 — Scene Specs</div>
                    <div className="flex gap-2 flex-wrap">
                        <button
                            className="bg-rose-900/50 hover:bg-rose-800/50 border border-rose-700 text-rose-300 px-4 py-2 rounded text-sm flex items-center gap-2 disabled:opacity-40"
                            onClick={handleRegenerateBible}
                            disabled={isBusy || !slug.trim()}
                            title="Rewrites all scene specs using updated creative direction — do this before generating images"
                        >
                            {pageState === "generating" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                            Regenerate Production Bible
                        </button>
                    </div>
                    <div className="text-xs text-zinc-500 font-medium uppercase tracking-wide pt-1">Step 2 — Generate Assets</div>
                    <div className="flex gap-2 flex-wrap">
                        <button
                            className="bg-cyan-900/50 hover:bg-cyan-800/50 border border-cyan-700 text-cyan-300 px-4 py-2 rounded text-sm flex items-center gap-2 disabled:opacity-40"
                            onClick={handleGenerateSceneImages}
                            disabled={isBusy || !bible}
                            title={!bible ? "No Production Bible — regenerate scene specs first" : ""}
                        >
                            {pageState === "generating" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Image className="w-4 h-4" />}
                            Generate Scene Images
                        </button>
                        <button
                            className="bg-purple-900/50 hover:bg-purple-800/50 border border-purple-700 text-purple-300 px-4 py-2 rounded text-sm flex items-center gap-2 disabled:opacity-40"
                            onClick={handleGenerateVideos}
                            disabled={isBusy || !bible}
                        >
                            {pageState === "generating" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Film className="w-4 h-4" />}
                            Generate Storyboard Videos
                        </button>
                        <button
                            className="bg-amber-900/50 hover:bg-amber-800/50 border border-amber-700 text-amber-300 px-4 py-2 rounded text-sm flex items-center gap-2 disabled:opacity-40"
                            onClick={handleGenerateAll}
                            disabled={isBusy}
                        >
                            {pageState === "generating" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                            Full Pipeline
                        </button>
                    </div>
                </div>

                {/* Generation log */}
                {generateLog.length > 0 && (
                    <div className="bg-zinc-900 border border-zinc-800 rounded p-3 text-xs font-mono space-y-1 max-h-40 overflow-y-auto">
                        {generateLog.map((line, i) => (
                            <div key={i} className={line.startsWith("ERROR") ? "text-red-400" : "text-zinc-400"}>
                                {line}
                            </div>
                        ))}
                    </div>
                )}

                {/* Scene Library */}
                {bible && (
                    <section className="space-y-3">
                        <h2 className="text-lg font-semibold flex items-center gap-2">
                            <Layers className="w-5 h-5 text-cyan-400" />
                            Scene Library ({bible.sceneLibrary.length} scenes)
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {bible.sceneLibrary.map((scene: SceneSpec) => {
                                const imageUrl = getSceneImageUrl(scene.sceneId);
                                const isExpanded = expandedScenes.has(scene.sceneId);
                                return (
                                    <div key={scene.sceneId} className="bg-zinc-900 border border-zinc-800 rounded overflow-hidden">
                                        {/* Scene header */}
                                        <button
                                            className="w-full flex items-center gap-3 p-3 text-left hover:bg-zinc-800/50"
                                            onClick={() => toggleScene(scene.sceneId)}
                                        >
                                            {isExpanded ? <ChevronDown className="w-4 h-4 text-zinc-500" /> : <ChevronRight className="w-4 h-4 text-zinc-500" />}
                                            <div className="flex-1 min-w-0">
                                                <div className="font-medium text-sm truncate">{scene.sceneId}</div>
                                                <div className="text-xs text-zinc-400 truncate">{scene.location} • {scene.timeOfDay}</div>
                                            </div>
                                            <span className="text-xs bg-zinc-800 px-2 py-0.5 rounded text-zinc-400">
                                                {scene.referenceCategory}
                                            </span>
                                            {imageUrl ? (
                                                <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                                            ) : (
                                                <div className="w-4 h-4 rounded-full border border-zinc-600 shrink-0" />
                                            )}
                                        </button>

                                        {/* Expanded detail */}
                                        {isExpanded && (
                                            <div className="border-t border-zinc-800 p-3 space-y-2 text-xs">
                                                {imageUrl && (
                                                    <img
                                                        src={imageUrl}
                                                        alt={scene.sceneId}
                                                        className="w-full rounded border border-zinc-700"
                                                    />
                                                )}
                                                <div className="grid grid-cols-2 gap-2 text-zinc-400">
                                                    <div><span className="text-zinc-500">Lighting:</span> {scene.lighting}</div>
                                                    <div><span className="text-zinc-500">Camera:</span> {scene.cameraAngle}</div>
                                                    <div><span className="text-zinc-500">Subject:</span> {scene.subjectAction}</div>
                                                    <div><span className="text-zinc-500">Mood:</span> {scene.mood}</div>
                                                </div>
                                                <div className="text-zinc-500">
                                                    <span className="text-zinc-600">Environment:</span> {scene.environmentDetails}
                                                </div>
                                                <details className="text-zinc-500">
                                                    <summary className="cursor-pointer text-zinc-600 hover:text-zinc-400">Image Prompt</summary>
                                                    <p className="mt-1 whitespace-pre-wrap">{scene.imagePrompt}</p>
                                                </details>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                )}

                {/* Storyboards */}
                {bible && (
                    <section className="space-y-3">
                        <h2 className="text-lg font-semibold flex items-center gap-2">
                            <Film className="w-5 h-5 text-purple-400" />
                            Storyboards ({bible.storyboards.length})
                        </h2>
                        <div className="space-y-3">
                            {bible.storyboards.map((sb: Storyboard) => {
                                const isExpanded = expandedStoryboards.has(sb.deliverableId);
                                return (
                                    <div key={sb.deliverableId} className="bg-zinc-900 border border-zinc-800 rounded">
                                        <button
                                            className="w-full flex items-center gap-3 p-3 text-left hover:bg-zinc-800/50"
                                            onClick={() => toggleStoryboard(sb.deliverableId)}
                                        >
                                            {isExpanded ? <ChevronDown className="w-4 h-4 text-zinc-500" /> : <ChevronRight className="w-4 h-4 text-zinc-500" />}
                                            <Play className="w-4 h-4 text-purple-400" />
                                            <div className="flex-1 min-w-0">
                                                <div className="font-medium text-sm">{sb.title}</div>
                                                <div className="text-xs text-zinc-400">
                                                    {sb.deliverableId} • {sb.totalDurationSeconds}s • {sb.shotSequence.length} shots • {sb.editingStyle}
                                                </div>
                                            </div>
                                        </button>

                                        {isExpanded && (
                                            <div className="border-t border-zinc-800 p-3 space-y-3">
                                                {/* Narration script */}
                                                <div className="text-xs text-zinc-400">
                                                    <span className="text-zinc-500 font-medium">Narration:</span>{" "}
                                                    {sb.narrationScript}
                                                </div>
                                                <div className="text-xs text-zinc-400">
                                                    <span className="text-zinc-500 font-medium">Music:</span>{" "}
                                                    {sb.musicDirection}
                                                </div>

                                                {/* Shot timeline */}
                                                <div className="space-y-2">
                                                    {sb.shotSequence.map((shot: ShotSpec, idx: number) => {
                                                        const sceneImageUrl = getSceneImageUrl(shot.sceneId);
                                                        return (
                                                            <div key={idx} className="flex gap-3 bg-zinc-800/50 rounded p-2">
                                                                {/* Thumbnail */}
                                                                <div className="w-24 h-14 bg-zinc-700 rounded overflow-hidden shrink-0 flex items-center justify-center">
                                                                    {sceneImageUrl ? (
                                                                        <img src={sceneImageUrl} alt={shot.sceneId} className="w-full h-full object-cover" />
                                                                    ) : (
                                                                        <Camera className="w-5 h-5 text-zinc-500" />
                                                                    )}
                                                                </div>
                                                                {/* Shot details */}
                                                                <div className="flex-1 min-w-0 text-xs space-y-0.5">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="font-medium text-zinc-200">Shot {shot.shotNumber}</span>
                                                                        <span className="text-zinc-500">{shot.durationSeconds}s</span>
                                                                        <span className="bg-zinc-700 px-1.5 py-0.5 rounded text-zinc-400">{shot.sceneId}</span>
                                                                        <span className="bg-purple-900/50 px-1.5 py-0.5 rounded text-purple-300">{shot.emotionalBeat}</span>
                                                                    </div>
                                                                    <div className="text-zinc-400"><span className="text-zinc-500">Camera:</span> {shot.cameraMovement}</div>
                                                                    <div className="text-zinc-400"><span className="text-zinc-500">Motion:</span> {shot.subjectMotion}</div>
                                                                    <div className="text-zinc-400"><span className="text-zinc-500">Transition:</span> {shot.transitionIn} → {shot.transitionOut}</div>
                                                                    <div className="text-zinc-500 italic">"{shot.narrationSegment}"</div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                )}

                {/* Global direction */}
                {bible && (
                    <section className="bg-zinc-900 border border-zinc-800 rounded p-4 space-y-2">
                        <h3 className="text-sm font-semibold text-zinc-300">Global Direction Notes</h3>
                        <p className="text-xs text-zinc-400">{bible.globalDirectionNotes}</p>
                        {bible.avoidDirectives.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-2">
                                {bible.avoidDirectives.map((d: string, i: number) => (
                                    <span key={i} className="text-xs bg-red-900/30 text-red-400 px-2 py-0.5 rounded">
                                        {d}
                                    </span>
                                ))}
                            </div>
                        )}
                    </section>
                )}

                {/* Scene images from manifest */}
                {manifest && (manifest.images.sceneImages?.length ?? 0) > 0 && (
                    <section className="space-y-3">
                        <h2 className="text-lg font-semibold flex items-center gap-2">
                            <Image className="w-5 h-5 text-green-400" />
                            Generated Scene Images ({manifest.images.sceneImages.length})
                        </h2>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                            {manifest.images.sceneImages.map((rec: AssetRecord) => (
                                <div key={rec.assetId} className="bg-zinc-900 border border-zinc-800 rounded overflow-hidden">
                                    <img src={`${rec.url}?v=${encodeURIComponent(rec.createdAt)}`} alt={rec.assetId} className="w-full aspect-video object-cover" />
                                    <div className="p-2 text-xs space-y-1">
                                        <div className="font-medium text-zinc-300 truncate">{rec.assetId}</div>
                                        <div className="flex flex-wrap gap-1">
                                            {rec.tags.map((tag: string) => (
                                                <span key={tag} className="bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-500">{tag}</span>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {/* No bible message */}
                {brief && !bible && (
                    <div className="bg-amber-900/20 border border-amber-800/50 rounded p-4 text-sm text-amber-300 flex items-center gap-3">
                        <AlertTriangle className="w-5 h-5 shrink-0" />
                        <div>
                            <p className="font-medium">No Production Bible found on this brief.</p>
                            <p className="text-xs text-amber-400 mt-1">
                                Regenerate the aesthetic brief to include the Production Bible (Pass 3).
                                The brief was generated before the Production Bible architecture was added.
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
