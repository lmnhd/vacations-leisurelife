"use client";

import { useState } from "react";
import { Loader2, Wand2, Download, Trash2, CheckCircle, AlertTriangle } from "lucide-react";
import { CampaignAestheticBrief } from "@/lib/campaigns/schema";

type BriefState = "idle" | "loading" | "generating" | "deleting" | "approving";

export default function AestheticDevisingTestPage() {
    const [slug, setSlug] = useState("");
    const [briefState, setBriefState] = useState<BriefState>("idle");
    const [result, setResult] = useState<CampaignAestheticBrief | null>(null);
    const [error, setError] = useState("");
    const [confirmOverwrite, setConfirmOverwrite] = useState(false);

    const isBusy = briefState !== "idle";

    // ── LOAD ─────────────────────────────────────────────────────────────────
    const handleLoad = async () => {
        if (!slug.trim()) return;
        setBriefState("loading");
        setError("");
        setConfirmOverwrite(false);

        try {
            const res = await fetch(`/api/groups/campaign/${slug.trim()}/media/aesthetic`);
            if (res.status === 404) {
                setResult(null);
                setError("No brief found for this slug.");
                return;
            }
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Load failed");
            setResult(data as CampaignAestheticBrief);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Unknown error");
        } finally {
            setBriefState("idle");
        }
    };

    // ── GENERATE ─────────────────────────────────────────────────────────────
    const handleGenerate = async () => {
        if (!slug.trim()) return;

        // If a result is already loaded, require confirmation before overwriting
        if (result && !confirmOverwrite) {
            setConfirmOverwrite(true);
            return;
        }

        setBriefState("generating");
        setError("");
        setConfirmOverwrite(false);

        try {
            const res = await fetch(`/api/groups/campaign/${slug.trim()}/media/aesthetic`, {
                method: "POST",
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Generation failed");
            setResult(data as CampaignAestheticBrief);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Unknown error");
        } finally {
            setBriefState("idle");
        }
    };

    // ── DELETE ────────────────────────────────────────────────────────────────
    const handleDelete = async () => {
        if (!slug.trim() || !result) return;
        setBriefState("deleting");
        setError("");

        try {
            const res = await fetch(`/api/groups/campaign/${slug.trim()}/media/aesthetic`, {
                method: "DELETE",
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Delete failed");
            setResult(null);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Unknown error");
        } finally {
            setBriefState("idle");
        }
    };

    // ── APPROVE ───────────────────────────────────────────────────────────────
    const handleApprove = async () => {
        if (!slug.trim() || !result) return;
        setBriefState("approving");
        setError("");

        try {
            const updatedBrief: CampaignAestheticBrief = { ...result, humanReviewStatus: "approved" };
            const res = await fetch(`/api/groups/campaign/${slug.trim()}/media/aesthetic/approve`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(updatedBrief),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Approval failed");
            setResult(data.brief as CampaignAestheticBrief);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Unknown error");
        } finally {
            setBriefState("idle");
        }
    };

    const statusBadgeColor = (status: string) => {
        if (status === "approved") return "text-emerald-400 border-emerald-500/30 bg-emerald-500/10";
        if (status === "revised") return "text-yellow-400 border-yellow-500/30 bg-yellow-500/10";
        return "text-slate-400 border-white/10 bg-white/5";
    };

    return (
        <div className="min-h-screen bg-slate-950 text-white p-6 font-mono">
            <div className="max-w-4xl mx-auto space-y-4">

                {/* Header */}
                <div className="border border-white/10 rounded-xl p-4 bg-slate-900/50">
                    <h1 className="text-lg font-semibold text-cyan-400 tracking-wide">
                        🎨 Aesthetic Devising — Phase 1
                    </h1>
                    <p className="text-xs text-slate-500 mt-1">
                        Load an existing brief, generate a new one, approve, or delete. Run against a campaign slug.
                    </p>
                </div>

                {/* Slug + Load */}
                <div className="border border-white/10 rounded-xl p-4 bg-slate-900/50 space-y-3">
                    <div className="text-[10px] text-slate-500 uppercase tracking-widest">Campaign Slug</div>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            placeholder="e.g. cat-lovers-cruise-2026"
                            value={slug}
                            onChange={(e) => { setSlug(e.target.value); setConfirmOverwrite(false); }}
                            onKeyDown={(e) => e.key === "Enter" && handleLoad()}
                            disabled={isBusy}
                            className="flex-1 bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500/40 disabled:opacity-40"
                        />
                        <button
                            id="btn-load"
                            onClick={handleLoad}
                            disabled={isBusy || !slug.trim()}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-slate-700/50 border border-white/10 text-slate-300 hover:bg-slate-700 transition-all disabled:opacity-40 disabled:pointer-events-none"
                        >
                            {briefState === "loading"
                                ? <Loader2 className="h-4 w-4 animate-spin" />
                                : <Download className="h-4 w-4" />
                            }
                            {briefState === "loading" ? "Loading..." : "Load"}
                        </button>
                    </div>

                    {error && (
                        <div className="rounded-lg px-3 py-2 text-xs bg-red-500/10 border border-red-500/20 text-red-400">
                            {error}
                        </div>
                    )}
                </div>

                {/* Action Bar — only shown when slug is entered */}
                {slug.trim() && (
                    <div className="border border-white/10 rounded-xl p-4 bg-slate-900/50">
                        <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-3">Actions</div>
                        <div className="flex flex-wrap gap-2 items-center">

                            {/* Generate / Overwrite */}
                            {confirmOverwrite ? (
                                <div className="flex items-center gap-2 flex-wrap">
                                    <div className="flex items-center gap-1 text-xs text-amber-400">
                                        <AlertTriangle className="h-3.5 w-3.5" />
                                        This will overwrite the existing brief. Confirm?
                                    </div>
                                    <button
                                        id="btn-confirm-overwrite"
                                        onClick={handleGenerate}
                                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-500/20 border border-amber-500/40 text-amber-400 hover:bg-amber-500/30 transition-all"
                                    >
                                        Yes, overwrite
                                    </button>
                                    <button
                                        onClick={() => setConfirmOverwrite(false)}
                                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-700/50 border border-white/10 text-slate-400 hover:bg-slate-700 transition-all"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            ) : (
                                <button
                                    id="btn-generate"
                                    onClick={handleGenerate}
                                    disabled={isBusy || !slug.trim()}
                                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-cyan-500/20 border border-cyan-500/40 text-cyan-400 hover:bg-cyan-500/30 transition-all disabled:opacity-40 disabled:pointer-events-none"
                                >
                                    {briefState === "generating"
                                        ? <Loader2 className="h-4 w-4 animate-spin" />
                                        : <Wand2 className="h-4 w-4" />
                                    }
                                    {briefState === "generating" ? "Generating..." : result ? "Re-generate" : "Generate Brief"}
                                </button>
                            )}

                            {/* Approve */}
                            {result && result.humanReviewStatus !== "approved" && (
                                <button
                                    id="btn-approve"
                                    onClick={handleApprove}
                                    disabled={isBusy}
                                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/30 transition-all disabled:opacity-40 disabled:pointer-events-none"
                                >
                                    {briefState === "approving"
                                        ? <Loader2 className="h-4 w-4 animate-spin" />
                                        : <CheckCircle className="h-4 w-4" />
                                    }
                                    {briefState === "approving" ? "Approving..." : "Approve"}
                                </button>
                            )}

                            {/* Delete */}
                            {result && (
                                <button
                                    id="btn-delete"
                                    onClick={handleDelete}
                                    disabled={isBusy}
                                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-all disabled:opacity-40 disabled:pointer-events-none ml-auto"
                                >
                                    {briefState === "deleting"
                                        ? <Loader2 className="h-4 w-4 animate-spin" />
                                        : <Trash2 className="h-4 w-4" />
                                    }
                                    {briefState === "deleting" ? "Deleting..." : "Delete Brief"}
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {/* Result */}
                {result && (
                    <>
                        {/* Identity Summary */}
                        <div className="border border-white/10 rounded-xl bg-slate-900/50 overflow-hidden">
                            <div className="px-4 py-2 border-b border-white/5 flex items-center justify-between">
                                <span className="text-xs text-slate-400 uppercase tracking-widest">Identity Summary</span>
                                <span className={`text-[10px] px-2 py-0.5 rounded-full border ${statusBadgeColor(result.humanReviewStatus)}`}>
                                    {result.humanReviewStatus}
                                </span>
                            </div>
                            <div className="p-4 space-y-4">
                                {/* Color swatches */}
                                <div>
                                    <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-2">Color Palette</div>
                                    <div className="flex gap-2 h-10 rounded-lg overflow-hidden">
                                        {Object.entries(result.visual?.colorPalette ?? {}).map(([key, hex]) => (
                                            <div
                                                key={key}
                                                className="flex-1"
                                                style={{ backgroundColor: hex as string }}
                                                title={`${key}: ${hex}`}
                                            />
                                        ))}
                                    </div>
                                </div>

                                {/* Slogans */}
                                <div>
                                    <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Hero Slogan</div>
                                    <p className="text-emerald-400 text-base">{result.messaging?.heroSlogan}</p>
                                    <p className="text-slate-400 text-sm mt-0.5">{result.messaging?.subSlogan}</p>
                                </div>

                                {/* Voice persona */}
                                <div>
                                    <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Voice Persona</div>
                                    <p className="text-xs text-slate-300">{result.messaging?.voicePersona}</p>
                                </div>

                                {/* Meta */}
                                <div className="pt-2 border-t border-white/5 flex gap-6 text-[10px] text-slate-600">
                                    <span>Generated: {result.generatedAt ? new Date(result.generatedAt).toLocaleString() : "—"}</span>
                                    <span>By: {result.generatedBy}</span>
                                </div>
                            </div>
                        </div>

                        {/* Full JSON */}
                        <div className="border border-white/10 rounded-xl bg-slate-900/50 overflow-hidden">
                            <div className="px-4 py-2 border-b border-white/5">
                                <span className="text-xs text-slate-400 uppercase tracking-widest">Full JSON Output</span>
                            </div>
                            <div className="p-4 max-h-[600px] overflow-y-auto">
                                <pre className="text-[11px] text-slate-300 leading-relaxed whitespace-pre-wrap break-words">
                                    {JSON.stringify(result, null, 2)}
                                </pre>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
