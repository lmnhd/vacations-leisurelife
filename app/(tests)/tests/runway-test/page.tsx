"use client";

import { useState, useCallback } from "react";
import {
    Film, Image, RefreshCw, Play, DollarSign, ChevronDown,
    Copy, Check, AlertTriangle, Zap, Info, Trash2
} from "lucide-react";

// ────────────────────────────────────────────────────────────────────────────
// Types (local — not imported from schema to keep this page self-contained)
// ────────────────────────────────────────────────────────────────────────────

interface AssetRecord {
    assetId: string;
    assetType: string;
    url: string;
    tags: string[];
    createdAt: string;
    promptUsed?: string;
}

const PROMOTION_TARGETS = [
    { value: "tiktokSeed", label: "TikTok Seed" },
    { value: "heroExplainer", label: "Hero Explainer" },
    { value: "thresholdAnnouncement", label: "Threshold Announcement" },
    { value: "countdown", label: "Countdown" },
    { value: "broll", label: "B-roll" },
] as const;

interface ManifestVideos {
    tiktokSeed?: AssetRecord | null;
    heroExplainer?: AssetRecord | null;
    thresholdAnnouncement?: AssetRecord | null;
    countdown?: AssetRecord[];
    broll?: AssetRecord[];
}

interface ManifestImages {
    sceneImages?: AssetRecord[];
    hero?: AssetRecord[];
    shipReferences?: AssetRecord[];
}

interface CampaignManifest {
    slug: string;
    images: ManifestImages;
    videos: ManifestVideos;
}

interface TestResult {
    assetId: string;
    videoUrl: string;
    taskId: string;
    durationSeconds: number;
    creditsUsed: number;
    fileSizeBytes: number;
    mimeType: string;
    label: string;
    motionPrompt: string;
    sourceImageUrl: string;
    createdAt: string;
    generatedAt: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Motion prompt templates — starting points for iteration
// ────────────────────────────────────────────────────────────────────────────

const PROMPT_TEMPLATES: { label: string; prompt: string }[] = [
    {
        label: "Slow cinematic push",
        prompt: "Slow cinematic push-in toward the subject. Keep all elements from the source image exactly as shown — same people, same environment, same lighting. Subtle ambient motion: gentle waves, fabric movement, soft light flicker. No camera shake. Warm golden hour color grade.",
    },
    {
        label: "Gentle orbit + parallax",
        prompt: "Slow orbital camera movement around the central subject, revealing depth and environment. Preserve all visual elements from source image — faces, architecture, ocean, lighting. Gentle parallax layers. No morphing, no warped anatomy. Aspirational vacation mood.",
    },
    {
        label: "Crane rise reveal",
        prompt: "Dramatic slow crane rise starting low and lifting to reveal the full environment. Source image composition preserved — same subjects, same ship deck, same horizon. Atmospheric haze, golden light. Crowd energy builds. Premium editorial travel feel.",
    },
    {
        label: "Tracking dolly",
        prompt: "Smooth lateral dolly track moving across the scene. All subjects and environment from the source image remain grounded and real. Natural human motion — walking, gesturing, laughing. Ocean in background with natural wave motion. Luxury expedition aesthetic.",
    },
    {
        label: "Subtle ambient (cheapest test)",
        prompt: "Nearly static frame with only micro-ambient motion: gentle ocean sway, soft fabric ripple, light shimmer on water. The source image is the complete scene — preserve every element exactly. No camera movement. Meditative, aspirational.",
    },
];

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function creditCost(seconds: number): string {
    const credits = seconds * 5;
    return `${credits} credits ($${(credits * 0.01).toFixed(2)})`;
}

function SceneImageThumbnail({
    rec,
    selected,
    onSelect,
}: {
    rec: AssetRecord;
    selected: boolean;
    onSelect: () => void;
}) {
    const sceneId = rec.tags.find(t => t !== "scene" && t !== "scene_image") ?? rec.assetId;
    return (
        <button
            onClick={onSelect}
            className={`relative rounded overflow-hidden border-2 transition-all ${
                selected
                    ? "border-purple-500 shadow-lg shadow-purple-500/30"
                    : "border-zinc-700 hover:border-zinc-500"
            }`}
        >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src={`${rec.url}?v=${encodeURIComponent(rec.createdAt)}`}
                alt={sceneId}
                className="w-full aspect-video object-cover"
            />
            {selected && (
                <div className="absolute inset-0 bg-purple-500/20 flex items-center justify-center">
                    <div className="bg-purple-500 rounded-full p-1">
                        <Check className="w-3 h-3 text-white" />
                    </div>
                </div>
            )}
            <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1.5 py-0.5 text-xs text-zinc-300 truncate">
                {sceneId}
            </div>
        </button>
    );
}

// ────────────────────────────────────────────────────────────────────────────
// Main page
// ────────────────────────────────────────────────────────────────────────────

export default function RunwayTestPage() {
    const [slug, setSlug] = useState("");
    const [slugInput, setSlugInput] = useState("");
    const [manifest, setManifest] = useState<CampaignManifest | null>(null);
    const [manifestLoading, setManifestLoading] = useState(false);
    const [manifestError, setManifestError] = useState<string | null>(null);

    const [selectedImage, setSelectedImage] = useState<AssetRecord | null>(null);
    const [customImageUrl, setCustomImageUrl] = useState("");

    const [motionPrompt, setMotionPrompt] = useState(PROMPT_TEMPLATES[0].prompt);
    const [durationSeconds, setDurationSeconds] = useState<5 | 10>(5);
    const [label, setLabel] = useState("test_v1");

    const [generating, setGenerating] = useState(false);
    const [generateError, setGenerateError] = useState<string | null>(null);
    const [results, setResults] = useState<TestResult[]>([]);

    // ── Load manifest ────────────────────────────────────────────────────────

    const loadManifest = useCallback(async (targetSlug: string) => {
        if (!targetSlug.trim()) return;
        setManifestLoading(true);
        setManifestError(null);
        setManifest(null);
        setSelectedImage(null);
        try {
            const res = await fetch(`/api/groups/campaign/${targetSlug.trim()}/media/manifest`);
            if (!res.ok) {
                const err = await res.json() as { error?: string };
                throw new Error(err.error ?? `HTTP ${res.status}`);
            }
            const data = await res.json() as CampaignManifest;
            setManifest(data);
            setSlug(targetSlug.trim());
            // Auto-select first scene image
            const firstScene = data.images.sceneImages?.[0];
            if (firstScene) setSelectedImage(firstScene);
        } catch (err) {
            setManifestError(err instanceof Error ? err.message : String(err));
        } finally {
            setManifestLoading(false);
        }
    }, []);

    // ── Generate test clip ────────────────────────────────────────────────────

    const handleGenerate = useCallback(async () => {
        const sourceUrl = selectedImage?.url ?? customImageUrl.trim();
        if (!sourceUrl) {
            setGenerateError("Select a scene image or paste an image URL first.");
            return;
        }
        if (!motionPrompt.trim()) {
            setGenerateError("Motion prompt is required.");
            return;
        }
        const estimatedCost = creditCost(durationSeconds);
        const confirmed = window.confirm(
            `Generate a ${durationSeconds}s paid RunwayML test clip?\n\nEstimated cost: ${estimatedCost}\nThis hits live RunwayML and will consume credits.\n\nContinue?`
        );
        if (!confirmed) return;

        setGenerating(true);
        setGenerateError(null);

        try {
            const effectiveSlug = slug || "test";
            const res = await fetch(`/api/groups/campaign/${effectiveSlug}/media/runway-test`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    sourceImageUrl: sourceUrl,
                    motionPrompt: motionPrompt.trim(),
                    durationSeconds,
                    label: label.trim() || "test",
                }),
            });

            const data = await res.json() as { error?: string } & Partial<TestResult>;

            if (!res.ok || data.error) {
                throw new Error(data.error ?? `HTTP ${res.status}`);
            }

            const result: TestResult = {
                assetId: data.assetId!,
                videoUrl: data.videoUrl!,
                taskId: data.taskId!,
                durationSeconds: data.durationSeconds!,
                creditsUsed: data.creditsUsed!,
                fileSizeBytes: data.fileSizeBytes!,
                mimeType: data.mimeType!,
                label: data.label!,
                motionPrompt: data.motionPrompt!,
                sourceImageUrl: data.sourceImageUrl!,
                createdAt: data.createdAt!,
                generatedAt: data.createdAt!,
            };

            setResults(prev => [result, ...prev]);
        } catch (err) {
            setGenerateError(err instanceof Error ? err.message : String(err));
        } finally {
            setGenerating(false);
        }
    }, [slug, selectedImage, customImageUrl, motionPrompt, durationSeconds, label]);

    const handlePromote = useCallback(async (result: TestResult, target: string) => {
        if (!slug) {
            throw new Error("Load a campaign manifest before promoting a test clip.");
        }

        const response = await fetch(`/api/groups/campaign/${slug}/media/runway-test/promote`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                assetId: result.assetId,
                videoUrl: result.videoUrl,
                durationSeconds: result.durationSeconds,
                fileSizeBytes: result.fileSizeBytes,
                mimeType: result.mimeType,
                motionPrompt: result.motionPrompt,
                label: result.label,
                createdAt: result.createdAt,
                target,
            }),
        });

        const data = await response.json() as { error?: string };
        if (!response.ok || data.error) {
            throw new Error(data.error ?? `HTTP ${response.status}`);
        }

        await loadManifest(slug);
    }, [slug, loadManifest]);

    // ── Derived values ────────────────────────────────────────────────────────

    const allSceneImages: AssetRecord[] = manifest?.images.sceneImages ?? [];
    const heroImages: AssetRecord[] = manifest?.images.hero ?? [];
    const activeSourceUrl = selectedImage?.url ?? customImageUrl.trim();

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6">
            <div className="max-w-7xl mx-auto space-y-6">

                {/* Header */}
                <div className="flex items-center gap-3">
                    <Film className="w-6 h-6 text-purple-400" />
                    <div>
                        <h1 className="text-2xl font-bold">RunwayML Prompt Lab</h1>
                        <p className="text-sm text-zinc-500">
                            Test motion prompts against Nano scene images — 5s clips at $0.25 each
                        </p>
                    </div>
                </div>

                {/* Cost callout */}
                <div className="flex items-start gap-2 bg-amber-950/40 border border-amber-800/50 rounded-lg p-3 text-sm">
                    <Info className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                    <div className="text-amber-200">
                        <strong>5s = 25 credits ($0.25) · 10s = 50 credits ($0.50).</strong>
                        {" "}Use 5s for prompt tuning. Only switch to 10s when the motion is right.
                        Every generate call hits live RunwayML.
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                    {/* LEFT — Campaign + Scene Picker */}
                    <div className="space-y-4">

                        {/* Campaign slug */}
                        <section className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3">
                            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide">
                                1 · Campaign
                            </h2>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    placeholder="campaign-slug"
                                    value={slugInput}
                                    onChange={e => setSlugInput(e.target.value)}
                                    onKeyDown={e => e.key === "Enter" && loadManifest(slugInput)}
                                    className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm font-mono placeholder-zinc-600 focus:outline-none focus:border-purple-500"
                                />
                                <button
                                    onClick={() => loadManifest(slugInput)}
                                    disabled={manifestLoading || !slugInput.trim()}
                                    className="px-3 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 rounded text-sm font-medium transition-colors flex items-center gap-1"
                                >
                                    {manifestLoading
                                        ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                        : <ChevronDown className="w-3.5 h-3.5" />
                                    }
                                    Load
                                </button>
                            </div>
                            {manifestError && (
                                <div className="flex items-center gap-2 text-red-400 text-xs">
                                    <AlertTriangle className="w-3.5 h-3.5" />
                                    {manifestError}
                                </div>
                            )}
                            {manifest && (
                                <div className="text-xs text-zinc-500">
                                    Loaded: <span className="text-zinc-300 font-mono">{manifest.slug}</span>
                                    {" · "}{allSceneImages.length} scene images
                                    {" · "}{heroImages.length} hero images
                                </div>
                            )}
                        </section>

                        {/* Scene image picker */}
                        {allSceneImages.length > 0 && (
                            <section className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3">
                                <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide flex items-center gap-2">
                                    <Image className="w-4 h-4" />
                                    2 · Pick Source Image (Scene Images)
                                </h2>
                                <div className="grid grid-cols-3 gap-2">
                                    {allSceneImages.map((rec, index) => (
                                        <SceneImageThumbnail
                                            key={`${rec.assetId}_${rec.createdAt}_${index}`}
                                            rec={rec}
                                            selected={selectedImage?.assetId === rec.assetId}
                                            onSelect={() => {
                                                setSelectedImage(rec);
                                                setCustomImageUrl("");
                                            }}
                                        />
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* Hero images if available */}
                        {heroImages.length > 0 && (
                            <section className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3">
                                <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide flex items-center gap-2">
                                    <Image className="w-4 h-4" />
                                    2b · Hero Images
                                </h2>
                                <div className="grid grid-cols-3 gap-2">
                                    {heroImages.map((rec, index) => (
                                        <SceneImageThumbnail
                                            key={`${rec.assetId}_${rec.createdAt}_${index}`}
                                            rec={rec}
                                            selected={selectedImage?.assetId === rec.assetId}
                                            onSelect={() => {
                                                setSelectedImage(rec);
                                                setCustomImageUrl("");
                                            }}
                                        />
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* Custom image URL fallback */}
                        <section className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-2">
                            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide">
                                2c · Or paste any image URL
                            </h2>
                            <input
                                type="text"
                                placeholder="https://cdn.leisurelifeinteractive.com/..."
                                value={customImageUrl}
                                onChange={e => {
                                    setCustomImageUrl(e.target.value);
                                    setSelectedImage(null);
                                }}
                                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-xs font-mono placeholder-zinc-600 focus:outline-none focus:border-purple-500"
                            />
                        </section>

                        {/* Active source preview */}
                        {activeSourceUrl && (
                            <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
                                <div className="px-3 py-2 text-xs text-zinc-500 border-b border-zinc-800">
                                    Active source image
                                </div>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={activeSourceUrl}
                                    alt="Source"
                                    className="w-full max-h-64 object-contain bg-black"
                                />
                                {selectedImage?.promptUsed && (
                                    <div className="px-3 py-2 text-xs text-zinc-600 border-t border-zinc-800 line-clamp-2">
                                        Gen prompt: {selectedImage.promptUsed}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* RIGHT — Prompt editor + Generate */}
                    <div className="space-y-4">

                        {/* Template picker */}
                        <section className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3">
                            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide">
                                3 · Motion Prompt
                            </h2>
                            <div className="flex flex-wrap gap-2">
                                {PROMPT_TEMPLATES.map(t => (
                                    <button
                                        key={t.label}
                                        onClick={() => setMotionPrompt(t.prompt)}
                                        className="px-2.5 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded transition-colors"
                                    >
                                        {t.label}
                                    </button>
                                ))}
                            </div>
                            <textarea
                                value={motionPrompt}
                                onChange={e => setMotionPrompt(e.target.value)}
                                rows={8}
                                maxLength={512}
                                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm font-mono text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-purple-500 resize-none"
                                placeholder="Describe the camera motion and scene movement..."
                            />
                            <div className="flex justify-between text-xs text-zinc-600">
                                <span>{motionPrompt.length}/512 chars</span>
                                <button
                                    onClick={() => setMotionPrompt("")}
                                    className="hover:text-zinc-400 transition-colors"
                                >
                                    Clear
                                </button>
                            </div>
                        </section>

                        {/* Config */}
                        <section className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3">
                            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide">
                                4 · Options
                            </h2>
                            <div className="flex gap-4 flex-wrap">
                                <div className="space-y-1">
                                    <label className="text-xs text-zinc-500">Duration</label>
                                    <div className="flex gap-2">
                                        {([5, 10] as const).map(s => (
                                            <button
                                                key={s}
                                                onClick={() => setDurationSeconds(s)}
                                                className={`px-4 py-1.5 rounded text-sm font-medium border transition-colors ${
                                                    durationSeconds === s
                                                        ? "bg-purple-600 border-purple-500 text-white"
                                                        : "bg-zinc-800 border-zinc-700 hover:border-zinc-500"
                                                }`}
                                            >
                                                {s}s
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="space-y-1 flex-1 min-w-32">
                                    <label className="text-xs text-zinc-500">Label (for tracking)</label>
                                    <input
                                        type="text"
                                        value={label}
                                        onChange={e => setLabel(e.target.value)}
                                        className="w-full bg-zinc-800 border border-zinc-700 rounded px-2.5 py-1.5 text-sm font-mono focus:outline-none focus:border-purple-500"
                                        placeholder="test_v1"
                                    />
                                </div>
                            </div>

                            {/* Cost preview */}
                            <div className="flex items-center gap-2 bg-zinc-800/60 rounded px-3 py-2">
                                <DollarSign className="w-3.5 h-3.5 text-amber-400" />
                                <span className="text-sm">
                                    This clip: <strong className="text-amber-300">{creditCost(durationSeconds)}</strong>
                                </span>
                            </div>
                        </section>

                        {/* Generate button */}
                        <button
                            onClick={handleGenerate}
                            disabled={generating || !activeSourceUrl || !motionPrompt.trim()}
                            className="w-full py-3 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg font-semibold flex items-center justify-center gap-2 transition-colors text-sm"
                        >
                            {generating ? (
                                <>
                                    <RefreshCw className="w-4 h-4 animate-spin" />
                                    Generating… (may take 2–3 min)
                                </>
                            ) : (
                                <>
                                    <Zap className="w-4 h-4" />
                                    Generate Paid {durationSeconds}s Test Clip · {creditCost(durationSeconds)}
                                </>
                            )}
                        </button>

                        {generateError && (
                            <div className="flex items-start gap-2 bg-red-950/40 border border-red-800/50 rounded p-3 text-sm text-red-300">
                                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                                {generateError}
                            </div>
                        )}

                        {/* Prompt tip */}
                        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-2 text-xs text-zinc-500">
                            <div className="font-semibold text-zinc-400">Prompt tips for image fidelity:</div>
                            <ul className="space-y-1 list-disc list-inside">
                                <li>Lead with: <em>"Keep all elements from the source image exactly as shown"</em></li>
                                <li>Name what to preserve: faces, ship architecture, lighting, ocean</li>
                                <li>Say what NOT to do: <em>"No morphing, no warped anatomy, no scene replacement"</em></li>
                                <li>Describe <strong>camera</strong> motion, not scene content — RunwayML reads the image for content</li>
                                <li>Less dramatic motion = more image fidelity. Start with "subtle ambient"</li>
                            </ul>
                        </div>
                    </div>
                </div>

                {/* Results */}
                {results.length > 0 && (
                    <section className="space-y-4">
                        <h2 className="text-lg font-semibold flex items-center gap-2 border-t border-zinc-800 pt-6">
                            <Play className="w-5 h-5 text-purple-400" />
                            Generated Clips ({results.length})
                            <span className="ml-auto text-sm font-normal text-zinc-500">
                                Session total: {results.reduce((a, r) => a + r.creditsUsed, 0)} credits
                                (${(results.reduce((a, r) => a + r.creditsUsed, 0) * 0.01).toFixed(2)})
                            </span>
                        </h2>

                        <div className="space-y-4">
                            {results.map((result, i) => (
                                <ResultCard
                                    key={`${result.taskId}_${i}`}
                                    result={result}
                                    index={results.length - i}
                                    onDelete={() => setResults(prev => prev.filter((_, idx) => idx !== i))}
                                    onReusePrompt={() => setMotionPrompt(result.motionPrompt)}
                                    onPromote={handlePromote}
                                />
                            ))}
                        </div>
                    </section>
                )}
            </div>
        </div>
    );
}

// ────────────────────────────────────────────────────────────────────────────
// Result card component
// ────────────────────────────────────────────────────────────────────────────

function ResultCard({
    result,
    index,
    onDelete,
    onReusePrompt,
    onPromote,
}: {
    result: TestResult;
    index: number;
    onDelete: () => void;
    onReusePrompt: () => void;
    onPromote: (result: TestResult, target: string) => Promise<void>;
}) {
    const [copied, setCopied] = useState(false);
    const [promotionTarget, setPromotionTarget] = useState<string>("tiktokSeed");
    const [promoting, setPromoting] = useState(false);
    const [promotionMessage, setPromotionMessage] = useState<string | null>(null);

    const copyPrompt = async () => {
        await navigator.clipboard.writeText(result.motionPrompt);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    const promoteClip = async () => {
        const confirmed = window.confirm(
            `Promote this test clip into ${PROMOTION_TARGETS.find(target => target.value === promotionTarget)?.label ?? promotionTarget}?\n\nThis writes the clip into the campaign manifest.`
        );
        if (!confirmed) return;
        setPromoting(true);
        setPromotionMessage(null);
        try {
            await onPromote(result, promotionTarget);
            setPromotionMessage(`Promoted to ${PROMOTION_TARGETS.find(target => target.value === promotionTarget)?.label ?? promotionTarget}`);
        } catch (err) {
            setPromotionMessage(err instanceof Error ? err.message : String(err));
        } finally {
            setPromoting(false);
        }
    };

    return (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-zinc-500">#{index}</span>
                    <span className="text-sm font-medium">{result.label}</span>
                    <span className="text-xs text-zinc-600">
                        {result.durationSeconds}s · {result.creditsUsed} credits (${(result.creditsUsed * 0.01).toFixed(2)})
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={onReusePrompt}
                        className="text-xs text-purple-400 hover:text-purple-300 transition-colors"
                    >
                        Reuse prompt
                    </button>
                    <select
                        value={promotionTarget}
                        onChange={event => setPromotionTarget(event.target.value)}
                        className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-300"
                    >
                        {PROMOTION_TARGETS.map((target) => (
                            <option key={target.value} value={target.value}>{target.label}</option>
                        ))}
                    </select>
                    <button
                        onClick={promoteClip}
                        disabled={promoting}
                        className="text-xs bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 rounded px-2 py-1 transition-colors"
                    >
                        {promoting ? "Promoting…" : "Promote"}
                    </button>
                    <button
                        onClick={onDelete}
                        className="text-zinc-600 hover:text-red-400 transition-colors"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
                {/* Source image */}
                <div className="relative">
                    <div className="absolute top-2 left-2 bg-black/70 rounded px-1.5 py-0.5 text-xs text-zinc-400 z-10">
                        Source (Nano)
                    </div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={result.sourceImageUrl}
                        alt="Source"
                        className="w-full aspect-video object-cover bg-black"
                    />
                </div>

                {/* Generated video */}
                <div className="relative">
                    <div className="absolute top-2 left-2 bg-black/70 rounded px-1.5 py-0.5 text-xs text-zinc-400 z-10">
                        RunwayML output
                    </div>
                    <video
                        controls
                        src={result.videoUrl}
                        className="w-full aspect-video bg-black"
                        preload="metadata"
                    />
                </div>
            </div>

            {/* Prompt used */}
            <div className="px-4 py-3 border-t border-zinc-800">
                <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-zinc-500 font-medium">Motion prompt used</span>
                    <button onClick={copyPrompt} className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
                        {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                        {copied ? "Copied" : "Copy"}
                    </button>
                </div>
                <p className="text-xs text-zinc-400 font-mono leading-relaxed whitespace-pre-wrap">
                    {result.motionPrompt}
                </p>
                <div className="mt-2 text-xs text-zinc-600">
                    Task ID: <span className="font-mono">{result.taskId}</span>
                    {" · "}{new Date(result.generatedAt).toLocaleTimeString()}
                </div>
                {promotionMessage && (
                    <div className="mt-2 text-xs text-zinc-500">
                        {promotionMessage}
                    </div>
                )}
            </div>
        </div>
    );
}
