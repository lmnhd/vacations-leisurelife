"use client";

import { useState, useRef, useEffect } from "react";
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

const KEY_META: Record<string, { label: string; cost: string }> = {
    OPENAI: { label: "OpenAI", cost: "" },
    ELEVENLABS: { label: "ElevenLabs", cost: "" },
    REPLICATE: { label: "Replicate", cost: "~$0.01" },
    SERPAPI: { label: "SerpAPI", cost: "~search" },
    STABILITY: { label: "Stability AI", cost: "~$0.05/img" },
    HEYGEN: { label: "HeyGen", cost: "~$1–3/video" },
    RUNWAYML: { label: "RunwayML", cost: "~$0.50/clip" },
    R2: { label: "Cloudflare R2", cost: "" },
};

type KeyStatus = Record<string, boolean>;

type ResultState = "idle" | "loading" | "success" | "error" | "not_implemented";

interface ShipReferenceCandidateResult {
    title: string;
    imageUrl: string;
    thumbnailUrl: string;
    contextUrl: string;
    width: number;
    height: number;
    category: string;
    query: string;
    selectionScore: number;
}

interface GeneratorResult {
    state: ResultState;
    data: Record<string, unknown> | null;
    error: string;
    cdnUrl: string; // CDN URL of uploaded asset (image, audio, video)
}

function makeResult(): GeneratorResult {
    return { state: "idle", data: null, error: "", cdnUrl: "" };
}

function KeyBadge({ apiKey, keyStatus }: { apiKey: string; keyStatus: KeyStatus }) {
    const meta = KEY_META[apiKey];
    const present = keyStatus[apiKey] ?? false;
    return (
        <span className={`flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full border ${present
            ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
            : "text-red-400 border-red-500/20 bg-red-500/5"
            }`}>
            <KeyRound className="h-2.5 w-2.5" />
            {meta?.label} {present ? "✓" : "missing"}
        </span>
    );
}

function ResultPanel({ result, previewType }: { result: GeneratorResult; previewType: "image" | "audio" | "video" | "json" | "none" }) {
    const [expanded, setExpanded] = useState(true);
    if (result.state === "idle") return null;

    const cdnUrl = result.cdnUrl || (result.data?.cdnUrl as string ?? "");
    const shipReferenceCandidates = Array.isArray(result.data?.candidates)
        ? result.data.candidates as ShipReferenceCandidateResult[]
        : [];

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
                    {result.state === "error" && `Error: ${result.error.slice(0, 80)}`}
                    {result.state === "not_implemented" && "Not Implemented (expected)"}
                </span>
                {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </button>

            {expanded && (
                <div className="border-t border-white/5 p-3 space-y-3">
                    {/* CDN URL link */}
                    {cdnUrl && (
                        <a href={cdnUrl} target="_blank" rel="noopener noreferrer"
                            className="block text-[10px] text-cyan-400 underline break-all">
                            {cdnUrl}
                        </a>
                    )}

                    {/* Image preview */}
                    {previewType === "image" && cdnUrl && !result.data?.crops && (
                        <img src={cdnUrl} alt="Generated" className="rounded-lg max-h-64 object-contain border border-white/10" />
                    )}

                    {shipReferenceCandidates.length > 0 && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {shipReferenceCandidates.map((candidate) => (
                                <div key={`${candidate.imageUrl}-${candidate.category}`} className="rounded-lg border border-white/10 bg-slate-900/60 overflow-hidden">
                                    <a href={candidate.imageUrl} target="_blank" rel="noopener noreferrer" className="block bg-slate-950">
                                        <img
                                            src={candidate.thumbnailUrl || candidate.imageUrl}
                                            alt={candidate.title}
                                            className="w-full h-40 object-cover border-b border-white/10"
                                        />
                                    </a>
                                    <div className="p-3 space-y-2">
                                        <div className="text-[11px] text-slate-200 line-clamp-2">{candidate.title}</div>
                                        <div className="flex flex-wrap gap-1 text-[9px]">
                                            <span className="px-1.5 py-0.5 rounded-full border border-cyan-500/20 text-cyan-300 bg-cyan-500/5">{candidate.category}</span>
                                            <span className="px-1.5 py-0.5 rounded-full border border-emerald-500/20 text-emerald-300 bg-emerald-500/5">score {candidate.selectionScore}</span>
                                            <span className="px-1.5 py-0.5 rounded-full border border-white/10 text-slate-400 bg-white/5">{candidate.width}×{candidate.height}</span>
                                        </div>
                                        <div className="text-[9px] text-slate-500 break-words">{candidate.query}</div>
                                        <div className="flex flex-col gap-1 text-[10px]">
                                            <a href={candidate.imageUrl} target="_blank" rel="noopener noreferrer" className="text-cyan-400 underline break-all">
                                                Open image
                                            </a>
                                            <a href={candidate.contextUrl} target="_blank" rel="noopener noreferrer" className="text-slate-400 underline break-all">
                                                Source page
                                            </a>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Crop grid from R2 */}
                    {previewType === "image" && result.data && "crops" in result.data && Array.isArray(result.data.crops) && (
                        <div className="grid grid-cols-4 gap-2">
                            {(result.data.crops as Array<{ format: string; width: number; height: number; cdnUrl: string; fileSizeBytes: number }>).map((crop) => (
                                <div key={crop.format} className="space-y-1">
                                    <img src={crop.cdnUrl} alt={crop.format} className="rounded w-full aspect-video object-cover border border-white/10" />
                                    <div className="text-[9px] text-slate-500 text-center">{crop.format}<br />{crop.width}×{crop.height}</div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Audio player via CDN URL */}
                    {previewType === "audio" && cdnUrl && (
                        <audio controls src={cdnUrl} className="w-full" />
                    )}

                    {/* Video player via CDN URL */}
                    {previewType === "video" && cdnUrl && (
                        <video controls src={cdnUrl} className="w-full rounded-lg border border-white/10 max-h-64" />
                    )}

                    {/* JSON output */}
                    {result.data && (
                        <pre className="text-[10px] text-slate-400 overflow-x-auto max-h-64 leading-relaxed whitespace-pre-wrap break-words">
                            {JSON.stringify(
                                Object.fromEntries(
                                    Object.entries(result.data).filter(([k]) => k !== "crops")
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
    const [keyStatus, setKeyStatus] = useState<KeyStatus>({});
    const [themeMusicSource, setThemeMusicSource] = useState<'replicate' | 'default'>('default');

    useEffect(() => {
        fetch('/api/groups/media/env-check')
            .then(r => r.json())
            .then((data: KeyStatus) => setKeyStatus(data))
            .catch(() => {/* silently fail — badges show missing */ });
    }, []);

    // Per-generator state
    const [shipReferenceResult, setShipReferenceResult] = useState<GeneratorResult>(makeResult());
    const [heroResult, setHeroResult] = useState<GeneratorResult>(makeResult());
    const [conceptResult, setConceptResult] = useState<GeneratorResult>(makeResult());
    const [cropResult, setCropResult] = useState<GeneratorResult>(makeResult());
    const [copyResult, setCopyResult] = useState<GeneratorResult>(makeResult());
    const [narrationResult, setNarrationResult] = useState<GeneratorResult>(makeResult());
    const [hypeResult, setHypeResult] = useState<GeneratorResult>(makeResult());
    const [replicateResult, setReplicateResult] = useState<GeneratorResult>(makeResult());
    const [merch0Result, setMerch0Result] = useState<GeneratorResult>(makeResult());
    const [heygenTiktokResult, setHeygenTiktokResult] = useState<GeneratorResult>(makeResult());
    const [heygenExplainerResult, setHeygenExplainerResult] = useState<GeneratorResult>(makeResult());
    const [heygenThresholdResult, setHeygenThresholdResult] = useState<GeneratorResult>(makeResult());
    const [runwayCountdownResult, setRunwayCountdownResult] = useState<GeneratorResult>(makeResult());
    const [runwayBrollResult, setRunwayBrollResult] = useState<GeneratorResult>(makeResult());

    // CDN URL of last uploaded hero image – passed to Sharp crops + video generators
    const lastHeroCdnUrl = useRef<string>("");
    // User-editable heroImageUrl for video generators (can paste any CDN URL)
    const [heroImageUrl, setHeroImageUrl] = useState("")

    async function runGenerator(
        url: string,
        body: Record<string, unknown>,
        setter: (r: GeneratorResult) => void,
    ) {
        setter({ state: "loading", data: null, error: "", cdnUrl: "" });
        try {
            const res = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const data = await res.json() as Record<string, unknown>;

            if (res.status === 501 || (data.notImplemented)) {
                setter({ state: "not_implemented", data, error: data.error as string ?? "", cdnUrl: "" });
                return;
            }
            if (!res.ok) {
                setter({ state: "error", data, error: data.error as string ?? `HTTP ${res.status}`, cdnUrl: "" });
                return;
            }

            const cdnUrl = data.cdnUrl as string ?? "";
            setter({ state: "success", data, error: "", cdnUrl });
        } catch (err) {
            setter({ state: "error", data: null, error: err instanceof Error ? err.message : "Unknown error", cdnUrl: "" });
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
                    {Object.keys(KEY_META).map(k => <KeyBadge key={k} apiKey={k} keyStatus={keyStatus} />)}
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

                <div className="border border-white/10 rounded-xl p-4 bg-slate-900/50">
                    <label className="text-[10px] text-slate-500 uppercase tracking-widest block mb-2">Theme Music Source</label>
                    <select
                        value={themeMusicSource}
                        onChange={event => setThemeMusicSource(event.target.value === 'replicate' ? 'replicate' : 'default')}
                        className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500/40"
                    >
                        <option value="default">Default Library</option>
                        <option value="replicate">Replicate MusicGen</option>
                    </select>
                    <p className="mt-2 text-[11px] text-slate-500">
                        Default Library reuses approved pre-made tracks with tags. Replicate generates a fresh track.
                    </p>
                </div>

                {/* ── Copy Generator ───────────────────────────────────── */}
                <GeneratorCard
                    id="gen-copy"
                    keyStatus={keyStatus}
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
                    keyStatus={keyStatus}
                    title="ElevenLabs — Ambient Narration"
                    icon={<Music className="h-4 w-4" />}
                    color="emerald"
                    description="30s ambient narration from brief.audio.ambientNarrationScript. Landing page hero audio."
                    cost="~$0.08"
                    apiKeys={["ELEVENLABS"]}
                    result={narrationResult}
                    previewType="audio"
                    onRun={() => runGenerator(`${base}/audio`, { generator: "elevenlabs_narration" }, setNarrationResult)}
                />

                {/* ── ElevenLabs Hype ──────────────────────────────────── */}
                <GeneratorCard
                    id="gen-hype"
                    keyStatus={keyStatus}
                    title="ElevenLabs — Hype Clip"
                    icon={<Music className="h-4 w-4" />}
                    color="emerald"
                    description="15s high-energy hype clip from brief.audio.hypeClipScript. Sent via MMS at THRESHOLD_MET."
                    cost="~$0.04"
                    apiKeys={["ELEVENLABS"]}
                    result={hypeResult}
                    previewType="audio"
                    onRun={() => runGenerator(`${base}/audio`, { generator: "elevenlabs_hype" }, setHypeResult)}
                />

                {/* ── Replicate MusicGen ──────────────────────────────────────────────────────── */}
                <GeneratorCard
                    id="gen-replicate"
                    keyStatus={keyStatus}
                    title={themeMusicSource === 'default' ? 'Default Library — Theme Music' : 'Replicate (MusicGen) — Theme Music'}
                    icon={<Music className="h-4 w-4" />}
                    color="slate"
                    description={themeMusicSource === 'default'
                        ? "Selects a tagged pre-made track from the shared library and records it as the campaign theme music."
                        : "30s instrumental loop from brief.visual.aestheticLabel and colors. Uploads directly to R2."}
                    cost={themeMusicSource === 'default' ? 'free' : '~$0.01'}
                    apiKeys={themeMusicSource === 'default' ? [] : ["REPLICATE"]}
                    result={replicateResult}
                    previewType="audio"
                    onRun={() => runGenerator(`${base}/audio`, { generator: themeMusicSource === 'default' ? "default_theme" : "replicate_theme" }, setReplicateResult)}
                />

                {/* ── SerpAPI Ship References ───────────────────────────── */}
                <GeneratorCard
                    id="gen-ship-references"
                    keyStatus={keyStatus}
                    title="SerpAPI — Ship Reference Search"
                    icon={<Image className="h-4 w-4" />}
                    color="cyan"
                    description="Searches for real photos of the matched ship across exterior, pool deck, dining, cabin, atrium, and destination-view categories. Returns ranked candidates only."
                    cost="~search"
                    apiKeys={["SERPAPI"]}
                    result={shipReferenceResult}
                    previewType="json"
                    onRun={() => runGenerator(`${base}/images`, { generator: "ship_reference_search" }, setShipReferenceResult)}
                />

                {/* ── Real Ship Hero ────────────────────────────────────── */}
                <GeneratorCard
                    id="gen-hero"
                    keyStatus={keyStatus}
                    title="SerpAPI — Real Ship Hero Image (×1)"
                    icon={<Image className="h-4 w-4" />}
                    color="cyan"
                    description="Imports the top-ranked real ship photo as the hero asset and uploads it to R2. CDN URL auto-filled into the video generator inputs below."
                    cost="~search + import"
                    apiKeys={["SERPAPI", "R2"]}
                    result={heroResult}
                    previewType="image"
                    onRun={async () => {
                        await runGenerator(
                            `${base}/images`,
                            { generator: "real_ship_hero" },
                            (r) => {
                                if (r.cdnUrl) {
                                    lastHeroCdnUrl.current = r.cdnUrl;
                                    setHeroImageUrl(r.cdnUrl);
                                }
                                setHeroResult(r);
                            },
                        );
                    }}
                />

                {/* ── Stability Concepts ───────────────────────────────── */}
                <GeneratorCard
                    id="gen-concepts"
                    keyStatus={keyStatus}
                    title="Stability AI — Aesthetic Concept (×1)"
                    icon={<Image className="h-4 w-4" />}
                    color="cyan"
                    description="Generates abstract mood/concept art only. This is no longer the ship-faithful hero path. Uploaded to R2."
                    cost="~$0.05"
                    apiKeys={["STABILITY", "R2"]}
                    result={conceptResult}
                    previewType="image"
                    onRun={() => runGenerator(`${base}/images`, { generator: "stability_concepts" }, setConceptResult)}
                />

                {/* ── Sharp Crops ──────────────────────────────────────── */}
                <GeneratorCard
                    id="gen-crops"
                    keyStatus={keyStatus}
                    title="Sharp — Platform Crops"
                    icon={<Crop className="h-4 w-4" />}
                    color="purple"
                    description="Crops the uploaded real-ship hero image into all 8 platform formats. Fetches source from R2 CDN and uploads all crops back to R2. Run after Real Ship Hero."
                    cost="free"
                    apiKeys={["R2"]}
                    result={cropResult}
                    previewType="image"
                    onRun={() => {
                        if (!lastHeroCdnUrl.current) {
                            setCropResult({ state: "error", data: null, error: "Run Real Ship Hero first — need a CDN URL.", cdnUrl: "" });
                            return;
                        }
                        runGenerator(`${base}/images`, { generator: "sharp_crops", sourceImageCdnUrl: lastHeroCdnUrl.current }, setCropResult);
                    }}
                />

                {/* ── Video: Hero Image URL input ──────────────────────── */}
                <div className="border border-white/10 rounded-xl p-4 bg-slate-900/50">
                    <label className="text-[10px] text-slate-500 uppercase tracking-widest block mb-2">Real Hero Image CDN URL — used by all video generators below</label>
                    <input
                        type="text"
                        value={heroImageUrl}
                        onChange={e => setHeroImageUrl(e.target.value)}
                        placeholder="Auto-filled when Real Ship Hero runs. Or paste any public image URL."
                        className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-violet-500/40"
                    />
                </div>

                {/* ── HeyGen TikTok Seed ───────────────────────────────── */}
                <GeneratorCard
                    id="gen-heygen-tiktok"
                    keyStatus={keyStatus}
                    title="HeyGen — TikTok Seed Video (9:16)"
                    icon={<Play className="h-4 w-4" />}
                    color="violet"
                    description="30–45s avatar video from brief.videoConcepts.tiktokSeed + TikTok hook. Uploaded to R2. Requires the hero CDN URL above as background."
                    cost="~$1–3"
                    apiKeys={["HEYGEN", "R2"]}
                    result={heygenTiktokResult}
                    previewType="video"
                    onRun={() => runGenerator(`${base}/video`, { generator: "heygen_tiktok", heroImageUrl }, setHeygenTiktokResult)}
                />

                {/* ── HeyGen Explainer ─────────────────────────────────── */}
                <GeneratorCard
                    id="gen-heygen-explainer"
                    keyStatus={keyStatus}
                    title="HeyGen — Hero Explainer Video (16:9)"
                    icon={<Play className="h-4 w-4" />}
                    color="violet"
                    description="60s avatar explainer from brief.videoConcepts.heroExplainer script. Uploaded to R2."
                    cost="~$2–4"
                    apiKeys={["HEYGEN", "R2"]}
                    result={heygenExplainerResult}
                    previewType="video"
                    onRun={() => runGenerator(`${base}/video`, { generator: "heygen_explainer", heroImageUrl }, setHeygenExplainerResult)}
                />

                {/* ── HeyGen Threshold ─────────────────────────────────── */}
                <GeneratorCard
                    id="gen-heygen-threshold"
                    keyStatus={keyStatus}
                    title="HeyGen — Threshold Announcement (16:9)"
                    icon={<Play className="h-4 w-4" />}
                    color="violet"
                    description="30s threshold announcement video. Pre-generated and sent when THRESHOLD_MET fires. Uploaded to R2."
                    cost="~$1–2"
                    apiKeys={["HEYGEN", "R2"]}
                    result={heygenThresholdResult}
                    previewType="video"
                    onRun={() => runGenerator(`${base}/video`, { generator: "heygen_threshold", heroImageUrl }, setHeygenThresholdResult)}
                />

                {/* ── RunwayML Countdown ───────────────────────────────── */}
                <GeneratorCard
                    id="gen-runway-countdown"
                    keyStatus={keyStatus}
                    title="RunwayML — Countdown Clip (1 of 3)"
                    icon={<Play className="h-4 w-4" />}
                    color="orange"
                    description="Gen-3 Alpha image-to-video. Slow zoom from hero image with urgency-building motion prompt. Test generates the first clip only. Uploaded to R2."
                    cost="~$0.50"
                    apiKeys={["RUNWAYML", "R2"]}
                    result={runwayCountdownResult}
                    previewType="video"
                    onRun={() => runGenerator(`${base}/video`, { generator: "runway_countdown", heroImageUrl }, setRunwayCountdownResult)}
                />

                {/* ── RunwayML B-roll ──────────────────────────────────── */}
                <GeneratorCard
                    id="gen-runway-broll"
                    keyStatus={keyStatus}
                    title="RunwayML — Cinematic B-roll (1 of 4)"
                    icon={<Play className="h-4 w-4" />}
                    color="orange"
                    description="Gen-3 Alpha cinematic atmospheric clip from hero image. Pool deck, dining, port arrival, or niche event motion. Test generates one clip. Uploaded to R2."
                    cost="~$0.50"
                    apiKeys={["RUNWAYML", "R2"]}
                    result={runwayBrollResult}
                    previewType="video"
                    onRun={() => runGenerator(`${base}/video`, { generator: "runway_broll", heroImageUrl }, setRunwayBrollResult)}
                />

                {/* ── DALL-E Merch ─────────────────────────────────────── */}
                <GeneratorCard
                    id="gen-merch"
                    keyStatus={keyStatus}
                    title="DALL-E 3 — Merch Design (Core Item)"
                    icon={<Shirt className="h-4 w-4" />}
                    color="pink"
                    description="Generates the core merch item design (index 0 = t-shirt) using brief.merch.coreItem.dallePrompt. DALL-E returns revised_prompt — useful to inspect what OpenAI actually used."
                    cost="~$0.12"
                    apiKeys={["OPENAI"]}
                    result={merch0Result}
                    previewType="image"
                    onRun={() => runGenerator(`${base}/merch`, { itemIndex: 0 }, setMerch0Result)}
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
    keyStatus: KeyStatus;
    result: GeneratorResult;
    previewType: "image" | "audio" | "video" | "json" | "none";
    onRun: () => void;
}

const colorMap: Record<string, { bg: string; border: string; text: string; btn: string }> = {
    cyan: { bg: "bg-cyan-500/5", border: "border-cyan-500/20", text: "text-cyan-400", btn: "bg-cyan-500/20 hover:bg-cyan-500/30 border-cyan-500/30 text-cyan-300" },
    emerald: { bg: "bg-emerald-500/5", border: "border-emerald-500/20", text: "text-emerald-400", btn: "bg-emerald-500/20 hover:bg-emerald-500/30 border-emerald-500/30 text-emerald-300" },
    amber: { bg: "bg-amber-500/5", border: "border-amber-500/20", text: "text-amber-400", btn: "bg-amber-500/20 hover:bg-amber-500/30 border-amber-500/30 text-amber-300" },
    purple: { bg: "bg-purple-500/5", border: "border-purple-500/20", text: "text-purple-400", btn: "bg-purple-500/20 hover:bg-purple-500/30 border-purple-500/30 text-purple-300" },
    pink: { bg: "bg-pink-500/5", border: "border-pink-500/20", text: "text-pink-400", btn: "bg-pink-500/20 hover:bg-pink-500/30 border-pink-500/30 text-pink-300" },
    violet: { bg: "bg-violet-500/5", border: "border-violet-500/20", text: "text-violet-400", btn: "bg-violet-500/20 hover:bg-violet-500/30 border-violet-500/30 text-violet-300" },
    orange: { bg: "bg-orange-500/5", border: "border-orange-500/20", text: "text-orange-400", btn: "bg-orange-500/20 hover:bg-orange-500/30 border-orange-500/30 text-orange-300" },
    slate: { bg: "bg-slate-500/5", border: "border-slate-500/20", text: "text-slate-400", btn: "bg-slate-700/60 hover:bg-slate-700 border-slate-500/30 text-slate-400" },
};

function GeneratorCard({ id, title, icon, color, description, cost, apiKeys, keyStatus, result, previewType, onRun }: GeneratorCardProps) {
    const c = colorMap[color] ?? colorMap.slate;
    const isLoading = result.state === "loading";
    const hasAllKeys = apiKeys.every(k => keyStatus[k] === true);

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
                            {apiKeys.map(k => <KeyBadge key={k} apiKey={k} keyStatus={keyStatus} />)}
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
