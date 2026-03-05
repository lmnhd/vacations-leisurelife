"use client";

import { useState, useRef } from "react";
import {
    Loader2, Image, Music, Type, Shirt, Crop, ChevronDown,
    ChevronRight, CheckCircle2, XCircle, AlertTriangle, KeyRound, Play
} from "lucide-react";

// ────────────────────────────────────────────────────────────────────────────
// Phase 2B — Per-Generator Test Page
// /tests/media-generation/test
// Each generator is an independent card. Run one at a time. See raw results.
// ────────────────────────────────────────────────────────────────────────────

const DEFAULT_SLUG = "analog-film-and-darkroom-odyssey-2026";

// Key availability — determined from what's in .env.local
const API_KEYS: Record<string, { label: string; present: boolean; cost: string }> = {
    OPENAI: { label: "OpenAI", present: true, cost: "" },
    ELEVENLABS: { label: "ElevenLabs", present: true, cost: "" },
    STABILITY: { label: "Stability AI", present: false, cost: "~$0.05/img" },
    HEYGEN: { label: "HeyGen", present: false, cost: "~$1–3/video" },
    RUNWAYML: { label: "RunwayML", present: false, cost: "~$0.50/clip" },
    R2: { label: "Cloudflare R2", present: false, cost: "" },
};

type ResultState = "idle" | "loading" | "success" | "error" | "not_implemented";

interface GeneratorResult {
    state: ResultState;
    data: Record<string, unknown> | null;
    error: string;
    preview: string; // data URL for image/audio previews
}

function makeResult(): GeneratorResult {
    return { state: "idle", data: null, error: "", preview: "" };
}

function KeyBadge({ apiKey }: { apiKey: string }) {
    const k = API_KEYS[apiKey];
    return (
        <span className={`flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full border ${k.present
                ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                : "text-red-400 border-red-500/20 bg-red-500/5"
            }`}>
            <KeyRound className="h-2.5 w-2.5" />
            {k.label} {k.present ? "✓" : "missing"}
        </span>
    );
}

function ResultPanel({ result, previewType }: { result: GeneratorResult; previewType: "image" | "audio" | "json" | "none" }) {
    const [expanded, setExpanded] = useState(true);
    if (result.state === "idle") return null;

    return (
        <div className="mt-3 rounded-lg border border-white/10 bg-slate-950/60 overflow-hidden">
            <button
                onClick={() => setExpanded(v => !v)}
                className="w-full flex items-center justify-between px-3 py-2 text-xs text-slate-400 hover:bg-white/5"
            >
                <span className="flex items-center gap-2">
                    {result.state === "success" && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />}
                    {result.state === "error" && <XCircle className="h-3.5 w-3.5 text-red-400" />}
                    {result.state === "not_implemented" && <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />}
                    {result.state === "success" && "Result"}
                    {result.state === "error" && `Error: ${result.error.slice(0, 60)}`}
                    {result.state === "not_implemented" && "Not Implemented (expected)"}
                </span>
                {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </button>

            {expanded && (
                <div className="border-t border-white/5 p-3 space-y-3">
                    {/* Image preview */}
                    {previewType === "image" && result.preview && (
                        <img src={result.preview} alt="Generated" className="rounded-lg max-h-64 object-contain border border-white/10" />
                    )}

                    {/* Crop grid */}
                    {previewType === "image" && result.data && "crops" in result.data && Array.isArray(result.data.crops) && (
                        <div className="grid grid-cols-4 gap-2">
                            {(result.data.crops as Array<{ format: string; width: number; height: number; preview: string; sizeBytes: number }>).map((crop) => (
                                <div key={crop.format} className="space-y-1">
                                    <img src={crop.preview} alt={crop.format} className="rounded w-full aspect-video object-cover border border-white/10" />
                                    <div className="text-[9px] text-slate-500 text-center">{crop.format}<br />{crop.width}×{crop.height}</div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Audio preview */}
                    {previewType === "audio" && result.preview && (
                        <audio controls src={result.preview} className="w-full h-8" />
                    )}

                    {/* JSON output */}
                    {result.data && (
                        <pre className="text-[10px] text-slate-400 overflow-x-auto max-h-64 leading-relaxed whitespace-pre-wrap break-words">
                            {JSON.stringify(
                                // strip preview from json display (already shown above)
                                Object.fromEntries(
                                    Object.entries(result.data).filter(([k]) => k !== "preview" && k !== "crops")
                                ),
                                null, 2
                            )}
                        </pre>
                    )}

                    {result.error && (
                        <p className="text-[10px] text-red-400 break-words">{result.error}</p>
                    )}
                </div>
            )}
        </div>
    );
}

export default function MediaGenerationTestPage() {
    const [slug, setSlug] = useState(DEFAULT_SLUG);

    // Per-generator state
    const [heroResult, setHeroResult] = useState<GeneratorResult>(makeResult());
    const [conceptResult, setConceptResult] = useState<GeneratorResult>(makeResult());
    const [cropResult, setCropResult] = useState<GeneratorResult>(makeResult());
    const [copyResult, setCopyResult] = useState<GeneratorResult>(makeResult());
    const [narrationResult, setNarrationResult] = useState<GeneratorResult>(makeResult());
    const [hypeResult, setHypeResult] = useState<GeneratorResult>(makeResult());
    const [sunoResult, setSunoResult] = useState<GeneratorResult>(makeResult());
    const [merch0Result, setMerch0Result] = useState<GeneratorResult>(makeResult());

    // For sharp crops: last hero preview to use as source
    const lastHeroPreview = useRef<string>("");

    async function runGenerator(
        url: string,
        body: Record<string, unknown>,
        setter: (r: GeneratorResult) => void,
        previewKey?: string
    ) {
        setter({ state: "loading", data: null, error: "", preview: "" });
        try {
            const res = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const data = await res.json() as Record<string, unknown>;

            if (res.status === 501 || (data.notImplemented)) {
                setter({ state: "not_implemented", data, error: data.error as string ?? "", preview: "" });
                return;
            }
            if (!res.ok) {
                setter({ state: "error", data, error: data.error as string ?? `HTTP ${res.status}`, preview: "" });
                return;
            }

            const preview = previewKey ? (data[previewKey] as string ?? "") : "";
            setter({ state: "success", data, error: "", preview });
        } catch (err) {
            setter({ state: "error", data: null, error: err instanceof Error ? err.message : "Unknown error", preview: "" });
        }
    }

    const base = `/api/groups/campaign/${slug}/media/test`;

    return (
        <div className="min-h-screen bg-slate-950 text-white p-6 font-mono">
            <div className="max-w-4xl mx-auto space-y-4">

                {/* Header */}
                <div className="border border-white/10 rounded-xl p-4 bg-slate-900/50">
                    <h1 className="text-lg font-semibold text-cyan-400">⚙️ Phase 2B — Per-Generator Tests</h1>
                    <p className="text-xs text-slate-500 mt-1">
                        Each card hits one API call. Test individually to verify results before running the full pipeline.
                        Requires an approved aesthetic brief for the selected campaign.
                    </p>
                </div>

                {/* API Key status bar */}
                <div className="border border-white/10 rounded-xl p-3 bg-slate-900/50 flex flex-wrap gap-2 items-center">
                    <span className="text-[10px] text-slate-500 uppercase tracking-widest mr-1">API Keys</span>
                    {Object.entries(API_KEYS).map(([k]) => <KeyBadge key={k} apiKey={k} />)}
                </div>

                {/* Slug */}
                <div className="border border-white/10 rounded-xl p-4 bg-slate-900/50">
                    <label className="text-[10px] text-slate-500 uppercase tracking-widest block mb-2">Campaign Slug</label>
                    <input
                        type="text"
                        value={slug}
                        onChange={e => setSlug(e.target.value)}
                        className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500/40"
                    />
                </div>

                {/* ── Copy Generator ───────────────────────────────────── */}
                <GeneratorCard
                    id="gen-copy"
                    title="GPT-4o Copy Batch"
                    icon={<Type className="h-4 w-4" />}
                    color="amber"
                    description="Generates all platform copy in one call: carousel slides, 3 ad variants (A/B/C), TikTok + Pinterest captions, email subject lines."
                    cost="~$0.05"
                    apiKeys={["OPENAI"]}
                    result={copyResult}
                    previewType="json"
                    onRun={() => runGenerator(`${base}/copy`, {}, setCopyResult)}
                />

                {/* ── ElevenLabs Narration ─────────────────────────────── */}
                <GeneratorCard
                    id="gen-narration"
                    title="ElevenLabs — Ambient Narration"
                    icon={<Music className="h-4 w-4" />}
                    color="emerald"
                    description="30s ambient narration from brief.audio.ambientNarrationScript. Landing page hero audio."
                    cost="~$0.08"
                    apiKeys={["ELEVENLABS"]}
                    result={narrationResult}
                    previewType="audio"
                    onRun={() => runGenerator(`${base}/audio`, { generator: "elevenlabs_narration" }, setNarrationResult, "preview")}
                />

                {/* ── ElevenLabs Hype ──────────────────────────────────── */}
                <GeneratorCard
                    id="gen-hype"
                    title="ElevenLabs — Hype Clip"
                    icon={<Music className="h-4 w-4" />}
                    color="emerald"
                    description="15s high-energy hype clip from brief.audio.hypeClipScript. Sent via MMS at THRESHOLD_MET."
                    cost="~$0.04"
                    apiKeys={["ELEVENLABS"]}
                    result={hypeResult}
                    previewType="audio"
                    onRun={() => runGenerator(`${base}/audio`, { generator: "elevenlabs_hype" }, setHypeResult, "preview")}
                />

                {/* ── Suno ─────────────────────────────────────────────── */}
                <GeneratorCard
                    id="gen-suno"
                    title="Suno AI — Theme Music"
                    icon={<Music className="h-4 w-4" />}
                    color="slate"
                    description="60–120s instrumental loop from brief.audio.musicMood. NOT IMPLEMENTED — Suno API in limited beta. Expected: 501 response."
                    cost="TBD"
                    apiKeys={["OPENAI"]}
                    result={sunoResult}
                    previewType="none"
                    onRun={() => runGenerator(`${base}/audio`, { generator: "suno_theme" }, setSunoResult)}
                />

                {/* ── Stability Hero ───────────────────────────────────── */}
                <GeneratorCard
                    id="gen-hero"
                    title="Stability AI — Hero Image (×1)"
                    icon={<Image className="h-4 w-4" />}
                    color="cyan"
                    description="Generates the first hero image variant: wide exterior deck shot. Requires STABILITY_API_KEY."
                    cost="~$0.05"
                    apiKeys={["STABILITY"]}
                    result={heroResult}
                    previewType="image"
                    onRun={async () => {
                        await runGenerator(
                            `${base}/images`,
                            { generator: "stability_hero", shipName: "Norwegian Gem" },
                            (r) => {
                                if (r.preview) lastHeroPreview.current = r.preview;
                                setHeroResult(r);
                            },
                            "preview"
                        );
                    }}
                />

                {/* ── Stability Concepts ───────────────────────────────── */}
                <GeneratorCard
                    id="gen-concepts"
                    title="Stability AI — Aesthetic Concept (×1)"
                    icon={<Image className="h-4 w-4" />}
                    color="cyan"
                    description="Generates first aesthetic concept art image. Square 1:1, abstract representation of campaign aesthetic."
                    cost="~$0.05"
                    apiKeys={["STABILITY"]}
                    result={conceptResult}
                    previewType="image"
                    onRun={() => runGenerator(`${base}/images`, { generator: "stability_concepts" }, setConceptResult, "preview")}
                />

                {/* ── Sharp Crops ──────────────────────────────────────── */}
                <GeneratorCard
                    id="gen-crops"
                    title="Sharp — Platform Crops"
                    icon={<Crop className="h-4 w-4" />}
                    color="purple"
                    description="Crops the last generated hero image into all 8 platform formats (16:9, 4:5, 9:16, 1:1, banner, email, OG, thumbnail). Run after Stability Hero."
                    cost="free"
                    apiKeys={[]}
                    result={cropResult}
                    previewType="image"
                    onRun={() => {
                        if (!lastHeroPreview.current) {
                            setCropResult({ state: "error", data: null, error: "Run Stability Hero first to generate a source image.", preview: "" });
                            return;
                        }
                        runGenerator(`${base}/images`, { generator: "sharp_crops", sourceImageBase64: lastHeroPreview.current }, setCropResult);
                    }}
                />

                {/* ── DALL-E Merch ─────────────────────────────────────── */}
                <GeneratorCard
                    id="gen-merch"
                    title="DALL-E 3 — Merch Design (Core Item)"
                    icon={<Shirt className="h-4 w-4" />}
                    color="pink"
                    description="Generates the core merch item design (index 0 = t-shirt) using brief.merch.coreItem.dallePrompt. DALL-E returns revised_prompt — useful to inspect what OpenAI actually used."
                    cost="~$0.12"
                    apiKeys={["OPENAI"]}
                    result={merch0Result}
                    previewType="image"
                    onRun={() => runGenerator(`${base}/merch`, { itemIndex: 0 }, setMerch0Result, "preview")}
                />

            </div>
        </div>
    );
}

// ── Generator Card component ────────────────────────────────────────────────

interface GeneratorCardProps {
    id: string;
    title: string;
    icon: React.ReactNode;
    color: string;
    description: string;
    cost: string;
    apiKeys: string[];
    result: GeneratorResult;
    previewType: "image" | "audio" | "json" | "none";
    onRun: () => void;
}

const colorMap: Record<string, { bg: string; border: string; text: string; btn: string }> = {
    cyan: { bg: "bg-cyan-500/5", border: "border-cyan-500/20", text: "text-cyan-400", btn: "bg-cyan-500/20 hover:bg-cyan-500/30 border-cyan-500/30 text-cyan-300" },
    emerald: { bg: "bg-emerald-500/5", border: "border-emerald-500/20", text: "text-emerald-400", btn: "bg-emerald-500/20 hover:bg-emerald-500/30 border-emerald-500/30 text-emerald-300" },
    amber: { bg: "bg-amber-500/5", border: "border-amber-500/20", text: "text-amber-400", btn: "bg-amber-500/20 hover:bg-amber-500/30 border-amber-500/30 text-amber-300" },
    purple: { bg: "bg-purple-500/5", border: "border-purple-500/20", text: "text-purple-400", btn: "bg-purple-500/20 hover:bg-purple-500/30 border-purple-500/30 text-purple-300" },
    pink: { bg: "bg-pink-500/5", border: "border-pink-500/20", text: "text-pink-400", btn: "bg-pink-500/20 hover:bg-pink-500/30 border-pink-500/30 text-pink-300" },
    slate: { bg: "bg-slate-500/5", border: "border-slate-500/20", text: "text-slate-400", btn: "bg-slate-700/60 hover:bg-slate-700 border-slate-500/30 text-slate-400" },
};

function GeneratorCard({ id, title, icon, color, description, cost, apiKeys, result, previewType, onRun }: GeneratorCardProps) {
    const c = colorMap[color] ?? colorMap.slate;
    const isLoading = result.state === "loading";
    const missingKeys = apiKeys.filter(k => !API_KEYS[k]?.present);
    const hasAllKeys = missingKeys.length === 0;

    return (
        <div className={`border ${c.border} rounded-xl p-4 ${c.bg}`}>
            <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-1.5">
                    <div className="flex items-center gap-2">
                        <span className={c.text}>{icon}</span>
                        <span className={`text-sm font-medium ${c.text}`}>{title}</span>
                        {cost && (
                            <span className="text-[9px] text-slate-500 border border-white/10 rounded px-1.5 py-0.5">{cost}</span>
                        )}
                        {!hasAllKeys && (
                            <span className="text-[9px] text-red-400 border border-red-500/20 rounded px-1.5 py-0.5">
                                missing key
                            </span>
                        )}
                    </div>
                    <p className="text-[11px] text-slate-500 leading-relaxed">{description}</p>
                    {apiKeys.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                            {apiKeys.map(k => <KeyBadge key={k} apiKey={k} />)}
                        </div>
                    )}
                </div>

                <button
                    id={id}
                    onClick={onRun}
                    disabled={isLoading}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border ${c.btn} transition-all shrink-0 disabled:opacity-50 disabled:pointer-events-none`}
                >
                    {isLoading
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <Play className="h-4 w-4" />
                    }
                    {isLoading ? "Running…" : "Run"}
                </button>
            </div>

            <ResultPanel result={result} previewType={previewType} />
        </div>
    );
}
