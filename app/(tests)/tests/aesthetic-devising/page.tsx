"use client";

import { useState } from "react";
import { Loader2, Wand2 } from "lucide-react";

export default function AestheticDevisingTestPage() {
    const [slug, setSlug] = useState("");
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<any>(null);
    const [error, setError] = useState("");

    const handleGenerate = async () => {
        if (!slug.trim()) return;
        setLoading(true);
        setError("");
        setResult(null);

        try {
            const res = await fetch(`/api/campaigns/${slug.trim()}/media/aesthetic`, {
                method: "POST",
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Generation failed");
            setResult(data);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-950 text-white p-6 font-mono">
            <div className="max-w-4xl mx-auto space-y-6">

                {/* Header */}
                <div className="border border-white/10 rounded-xl p-4 bg-slate-900/50">
                    <h1 className="text-lg font-semibold text-cyan-400 tracking-wide">
                        🎨 Aesthetic Devising Test
                    </h1>
                    <p className="text-xs text-slate-500 mt-1">
                        Runs the 2-pass GPT-4o identity pipeline for a campaign slug: visual palette → slogans → social concepts → video briefs.
                    </p>
                </div>

                {/* Controls */}
                <div className="border border-white/10 rounded-xl p-4 bg-slate-900/50 space-y-3">
                    <div className="text-[10px] text-slate-500 uppercase tracking-widest">Campaign Slug</div>
                    <div className="flex gap-3">
                        <input
                            type="text"
                            placeholder="e.g. cat-lovers-cruise-2026"
                            value={slug}
                            onChange={(e) => setSlug(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
                            className="flex-1 bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500/40"
                        />
                        <button
                            onClick={handleGenerate}
                            disabled={loading || !slug.trim()}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-cyan-500/20 border border-cyan-500/40 text-cyan-400 hover:bg-cyan-500/30 transition-all disabled:opacity-40 disabled:pointer-events-none"
                        >
                            {loading
                                ? <Loader2 className="h-4 w-4 animate-spin" />
                                : <Wand2 className="h-4 w-4" />
                            }
                            {loading ? "Generating..." : "Generate Brief"}
                        </button>
                    </div>

                    {error && (
                        <div className="rounded-lg px-3 py-2 text-xs bg-red-500/10 border border-red-500/20 text-red-400">
                            {error}
                        </div>
                    )}
                </div>

                {/* Result: Summary */}
                {result && (
                    <>
                        <div className="border border-white/10 rounded-xl bg-slate-900/50 overflow-hidden">
                            <div className="px-4 py-2 border-b border-white/5 flex items-center justify-between">
                                <span className="text-xs text-slate-400 uppercase tracking-widest">Identity Summary</span>
                                <span className="text-[10px] text-slate-600">{result.humanReviewStatus}</span>
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
                                    <p className="text-slate-400 text-sm mt-1">{result.messaging?.subSlogan}</p>
                                </div>

                                {/* Voice persona */}
                                <div>
                                    <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Voice Persona</div>
                                    <p className="text-xs text-slate-300">{result.messaging?.voicePersona}</p>
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
