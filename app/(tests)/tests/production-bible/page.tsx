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
    AssetType,
} from "@/lib/campaigns/schema";
import { ReviseRegenerateModal } from "./ReviseRegenerateModal";
import {
    Loader2, BookOpen, Film, Image, Eye, RefreshCw,
    ChevronDown, ChevronRight, Play, Layers, Camera,
    AlertTriangle, CheckCircle2, Zap, Wand2, DollarSign, ShieldCheck, ShieldAlert, Trash2
} from "lucide-react";
import { CampaignSelector } from "../media-generation/campaign-selector";

// ────────────────────────────────────────────────────────────────────────────
// Production Bible Test Page
// /tests/production-bible
// Preview Production Bible, scene library, storyboards.
// All actions use the SAME manifest + API routes as the real pipeline.
// ────────────────────────────────────────────────────────────────────────────

type PageState = "idle" | "loading" | "generating";

interface DeliverableEstimate {
    id: string;
    title: string;
    shotCount: number;
    clipDurationSeconds: number;
    runwayCredits: number;
    usd: number;
}

interface ServiceBalance {
    service: string;
    available: number | null;
    unit: string;
    fetchError: string | null;
    unverifiable: boolean;
}

interface CreditCheckData {
    canProceed: boolean | null;
    estimate: {
        runwayCreditsRequired: number;
        runwayClipCount: number;
        runwayUsd: number;
        geminiUsd: number;
        elevenlabsUsd: number;
        totalUsd: number;
        deliverables: DeliverableEstimate[];
    };
    balances: ServiceBalance[];
    blockers: string[];
}

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
    const [creditCheck, setCreditCheck] = useState<CreditCheckData | null>(null);
    const [creditCheckLoading, setCreditCheckLoading] = useState(false);
    const [deletingAssetId, setDeletingAssetId] = useState<string | null>(null);
    const [revisionModal, setRevisionModal] = useState<{ assetId: string; assetType: AssetType; promptUsed: string } | null>(null);

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

    const handleRevisionComplete = useCallback(async () => {
        setRevisionModal(null);
        setGenerateLog(prev => [...prev, 'Revision regeneration complete — manifest refreshed.']);
        await loadData(slug.trim());
    }, [slug, loadData]);

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

    const handleDeleteVideoArtifact = useCallback(async (assetId: string) => {
        if (!slug.trim()) return;
        if (!window.confirm(`Delete video artifact ${assetId}?`)) return;

        setDeletingAssetId(assetId);
        setError("");

        try {
            const res = await fetch(`/api/groups/campaign/${slug}/media/manifest/video-artifact`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ assetId }),
            });

            const data = await res.json() as { error?: string };
            if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);

            setGenerateLog(prev => [...prev, `Deleted video artifact: ${assetId}`]);
            await loadData(slug.trim());
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setDeletingAssetId(null);
        }
    }, [slug, loadData]);

    const handleDeleteSceneImageArtifact = useCallback(async (assetId: string) => {
        if (!slug.trim()) return;
        if (!window.confirm(`Delete scene image artifact ${assetId}?`)) return;

        setDeletingAssetId(assetId);
        setError("");

        try {
            const res = await fetch(`/api/groups/campaign/${slug}/media/manifest/scene-image-artifact`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ assetId }),
            });

            const data = await res.json() as { error?: string };
            if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);

            setGenerateLog(prev => [...prev, `Deleted scene image artifact: ${assetId}`]);
            await loadData(slug.trim());
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setDeletingAssetId(null);
        }
    }, [slug, loadData]);

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
                    assetTypes: ["tiktok_seed_video", "hero_explainer_video", "threshold_video", "countdown_video", "broll_clip"],
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

    // ── Credit check ──────────────────────────────────────────────────
    const handleCreditCheck = async () => {
        if (!slug.trim()) return;
        setCreditCheckLoading(true);
        try {
            const sceneCount = bible?.sceneLibrary.length ?? 10;
            const res = await fetch(`/api/groups/campaign/${slug}/media/credit-check?sceneCount=${sceneCount}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
            setCreditCheck(data as CreditCheckData);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setCreditCheckLoading(false);
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

                {/* Credit Check Panel */}
                <div className="bg-zinc-900 border border-zinc-800 rounded p-4 space-y-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <DollarSign className="w-4 h-4 text-green-400" />
                            <span className="text-sm font-semibold">Cost Estimate &amp; Balance Check</span>
                        </div>
                        <button
                            className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs px-3 py-1.5 rounded flex items-center gap-1.5 disabled:opacity-40"
                            onClick={handleCreditCheck}
                            disabled={creditCheckLoading || !slug.trim()}
                        >
                            {creditCheckLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                            {creditCheck ? "Refresh" : "Check Now"}
                        </button>
                    </div>

                    {!creditCheck && !creditCheckLoading && (
                        <p className="text-xs text-zinc-500">Click &quot;Check Now&quot; to see cost estimate and verify you have enough credits before generating videos.</p>
                    )}

                    {creditCheck && (
                        <div className="space-y-3">
                            {/* Status banner */}
                            <div className={`flex items-center gap-2 text-sm px-3 py-2 rounded ${
                                creditCheck.canProceed === true ? "bg-green-900/30 border border-green-800 text-green-300"
                                : creditCheck.canProceed === false ? "bg-red-900/30 border border-red-800 text-red-300"
                                : "bg-zinc-800 text-zinc-400"
                            }`}>
                                {creditCheck.canProceed === true && <ShieldCheck className="w-4 h-4 shrink-0" />}
                                {creditCheck.canProceed === false && <ShieldAlert className="w-4 h-4 shrink-0" />}
                                {creditCheck.canProceed === true && "Ready to proceed"}
                                {creditCheck.canProceed === false && `Blocked: ${creditCheck.blockers[0]}`}
                                {creditCheck.canProceed === null && "Estimate only"}
                            </div>

                            {/* Cost breakdown */}
                            <div className="space-y-1">
                                <div className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-1">Video Generation (RunwayML)</div>
                                {creditCheck.estimate.deliverables.map((d: DeliverableEstimate) => (
                                    <div key={d.id} className="flex justify-between text-xs text-zinc-400">
                                        <span>{d.title} ({d.shotCount} shots × {d.clipDurationSeconds}s)</span>
                                        <span className="text-zinc-300">{d.runwayCredits.toLocaleString()} cr / ${d.usd.toFixed(2)}</span>
                                    </div>
                                ))}
                                <div className="flex justify-between text-xs font-semibold text-zinc-200 border-t border-zinc-700 pt-1 mt-1">
                                    <span>Runway subtotal</span>
                                    <span>{creditCheck.estimate.runwayCreditsRequired.toLocaleString()} cr / ${creditCheck.estimate.runwayUsd.toFixed(2)}</span>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-xs">
                                <div className="bg-zinc-800 rounded px-2 py-1.5">
                                    <div className="text-zinc-500">Gemini images (est.)</div>
                                    <div className="text-zinc-200 font-medium">${creditCheck.estimate.geminiUsd.toFixed(2)}</div>
                                </div>
                                <div className="bg-zinc-800 rounded px-2 py-1.5">
                                    <div className="text-zinc-500">ElevenLabs narration (est.)</div>
                                    <div className="text-zinc-200 font-medium">${creditCheck.estimate.elevenlabsUsd.toFixed(2)}</div>
                                </div>
                            </div>

                            <div className="flex justify-between text-sm font-bold border-t border-zinc-700 pt-2">
                                <span>Total Estimated Cost</span>
                                <span className="text-amber-300">~${creditCheck.estimate.totalUsd.toFixed(2)}</span>
                            </div>

                            {/* Balances */}
                            <div className="space-y-1">
                                <div className="text-xs font-medium text-zinc-400 uppercase tracking-wide">Live Balances</div>
                                {creditCheck.balances.map((b: ServiceBalance) => (
                                    <div key={b.service} className="flex justify-between text-xs">
                                        <span className="text-zinc-400">{b.service}</span>
                                        <span className={b.fetchError ? "text-red-400" : b.unverifiable ? "text-zinc-500 italic" : "text-zinc-200"}>
                                            {b.unverifiable ? "not queryable via API" :
                                             b.fetchError ? `error: ${b.fetchError}` :
                                             `${(b.available ?? 0).toLocaleString()} ${b.unit}`}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

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
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="font-medium text-zinc-300 truncate">{rec.assetId}</div>
                                            <div className="flex items-center gap-1 shrink-0">
                                                <button
                                                    className="bg-amber-900/40 hover:bg-amber-800/50 border border-amber-700 text-amber-300 px-2 py-1 rounded text-xs flex items-center gap-1 disabled:opacity-40"
                                                    onClick={() => setRevisionModal({ assetId: rec.assetId, assetType: 'scene_image', promptUsed: rec.promptUsed })}
                                                    disabled={isBusy}
                                                    title="Revise prompt and regenerate"
                                                >
                                                    <Wand2 className="w-3 h-3" />
                                                </button>
                                                <button
                                                    className="bg-red-900/40 hover:bg-red-800/50 border border-red-700 text-red-300 px-2 py-1 rounded text-xs flex items-center gap-1 disabled:opacity-40"
                                                    onClick={() => void handleDeleteSceneImageArtifact(rec.assetId)}
                                                    disabled={deletingAssetId === rec.assetId || isBusy}
                                                    title="Delete"
                                                >
                                                    {deletingAssetId === rec.assetId ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                                                </button>
                                            </div>
                                        </div>
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

                {/* Generated Videos from manifest */}
                {manifest && (() => {
                    const videos = [
                        manifest.videos.tiktokSeed     ? { label: 'TikTok Seed',             rec: manifest.videos.tiktokSeed }            : null,
                        manifest.videos.heroExplainer  ? { label: 'Hero Explainer',           rec: manifest.videos.heroExplainer }         : null,
                        manifest.videos.thresholdAnnouncement ? { label: 'Threshold Announcement', rec: manifest.videos.thresholdAnnouncement } : null,
                        ...(manifest.videos.countdown ?? []).map((rec: AssetRecord, i: number) => ({ label: `Countdown ${i + 1}`, rec })),
                        ...(manifest.videos.broll ?? []).map((rec: AssetRecord, i: number) => ({ label: `B-roll ${i + 1}`, rec })),
                    ].filter(Boolean) as { label: string; rec: AssetRecord }[];

                    if (videos.length === 0) return null;

                    return (
                        <section className="space-y-3">
                            <h2 className="text-lg font-semibold flex items-center gap-2">
                                <Film className="w-5 h-5 text-purple-400" />
                                Generated Videos ({videos.length})
                            </h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {videos.map(({ label, rec }) => (
                                    <div key={rec.assetId} className="bg-zinc-900 border border-zinc-800 rounded overflow-hidden">
                                        <video
                                            controls
                                            src={`${rec.url}?v=${encodeURIComponent(rec.createdAt)}`}
                                            className="w-full aspect-video bg-black"
                                        />
                                        <div className="p-3 space-y-1">
                                            <div className="flex items-center justify-between">
                                                <span className="text-sm font-medium text-zinc-200">{label}</span>
                                                <div className="flex items-center gap-2">
                                                    {rec.durationSeconds && (
                                                        <span className="text-xs text-zinc-500">{rec.durationSeconds}s</span>
                                                    )}
                                                    <button
                                                        className="bg-amber-900/40 hover:bg-amber-800/50 border border-amber-700 text-amber-300 px-2 py-1 rounded text-xs flex items-center gap-1 disabled:opacity-40"
                                                        onClick={() => setRevisionModal({ assetId: rec.assetId, assetType: rec.assetType, promptUsed: rec.promptUsed })}
                                                        disabled={isBusy}
                                                        title="Revise prompt and regenerate"
                                                    >
                                                        <Wand2 className="w-3 h-3" />
                                                    </button>
                                                    <button
                                                        className="bg-red-900/40 hover:bg-red-800/50 border border-red-700 text-red-300 px-2 py-1 rounded text-xs flex items-center gap-1 disabled:opacity-40"
                                                        onClick={() => void handleDeleteVideoArtifact(rec.assetId)}
                                                        disabled={deletingAssetId === rec.assetId || isBusy}
                                                        title="Delete"
                                                    >
                                                        {deletingAssetId === rec.assetId ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="text-xs text-zinc-500 truncate">{rec.assetId}</div>
                                            <div className="flex flex-wrap gap-1">
                                                {rec.tags.map((tag: string) => (
                                                    <span key={tag} className="bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-500 text-xs">{tag}</span>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    );
                })()}

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

            {/* Revise & Regenerate modal */}
            {revisionModal && (
                <ReviseRegenerateModal
                    slug={slug}
                    assetId={revisionModal.assetId}
                    assetType={revisionModal.assetType}
                    currentPrompt={revisionModal.promptUsed}
                    onComplete={() => void handleRevisionComplete()}
                    onClose={() => setRevisionModal(null)}
                />
            )}
        </div>
    );
}
