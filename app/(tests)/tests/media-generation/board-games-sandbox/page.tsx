"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Palette, Play, Settings, Sparkles, Type } from "lucide-react";
import type {
    AssetRecord,
    CampaignAestheticBrief,
    CampaignMediaManifest,
    Storyboard,
} from "@/lib/campaigns/schema";

const DEFAULT_SLUG = "board-games-at-sea";
const KNOWN_STORYBOARD_ID = "tiktok_seed";

type TemplatePresetId = "hook" | "social" | "cta";

interface OverlayCardSpec {
    badge: string;
    headline: string;
    subline: string;
    accentColor: string;
    placement: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
}

interface TemplatePreset {
    id: TemplatePresetId;
    label: string;
    description: string;
    overlayCards: OverlayCardSpec[];
}

const TEMPLATE_PRESETS: readonly TemplatePreset[] = [
    {
        id: "hook",
        label: "Hook opener",
        description: "Big headline card for the first beat.",
        overlayCards: [
            {
                badge: "OPENING",
                headline: "Board games\nat sea",
                subline: "Social, warm, playable from the first frame.",
                accentColor: "#F2C450",
                placement: { x: 120, y: 78, width: 1680, height: 292 },
            },
            {
                badge: "CTA",
                headline: "Link in bio",
                subline: "Reserve the cruise that feels like your table, but at sea.",
                accentColor: "#F2C450",
                placement: { x: 120, y: 1546, width: 1680, height: 250 },
            },
        ],
    },
    {
        id: "social",
        label: "Social proof",
        description: "Friendlier, lighter beat for people and table energy.",
        overlayCards: [
            {
                badge: "GROUP ENERGY",
                headline: "People first.\nGames second.",
                subline: "The right crowd makes the whole deck feel alive.",
                accentColor: "#8AD1C2",
                placement: { x: 120, y: 78, width: 1680, height: 292 },
            },
            {
                badge: "PROOF",
                headline: "This is what\ntravel looks like now.",
                subline: "A quieter, better kind of cruise social life.",
                accentColor: "#8AD1C2",
                placement: { x: 120, y: 1546, width: 1680, height: 250 },
            },
        ],
    },
    {
        id: "cta",
        label: "CTA close",
        description: "Sharper ending card for the final beat.",
        overlayCards: [
            {
                badge: "BOOK NOW",
                headline: "Your next game night\nhas an ocean view.",
                subline: "Ship truth. Table energy. Clear CTA.",
                accentColor: "#F39A5B",
                placement: { x: 120, y: 78, width: 1680, height: 292 },
            },
            {
                badge: "FINAL",
                headline: "Bring the board.\nWe’ll bring the sea.",
                subline: "This is the cleanest kind of cruise ad.",
                accentColor: "#F39A5B",
                placement: { x: 120, y: 1546, width: 1680, height: 250 },
            },
        ],
    },
];

function getSceneIdFromAssetId(assetId: string): string | null {
    const match = assetId.match(/^img_scene_(.+?)(?:_\d+)?$/);
    return match?.[1] ?? null;
}

function getSceneImageSceneId(asset: AssetRecord): string | null {
    if (Array.isArray(asset.tags)) {
        const sceneTag = asset.tags.find((tag) => tag !== "scene" && tag !== "scene_image");
        if (sceneTag) {
            return sceneTag;
        }
    }

    return getSceneIdFromAssetId(asset.assetId);
}

function getStoryboardSceneId(storyboard: Storyboard | null): string | null {
    return storyboard?.shotSequence?.[0]?.sceneId ?? null;
}

export default function BoardGamesAtSeaSandboxPage() {
    const [slug, setSlug] = useState(DEFAULT_SLUG);
    const [brief, setBrief] = useState<CampaignAestheticBrief | null>(null);
    const [manifest, setManifest] = useState<CampaignMediaManifest | null>(null);
    const [loading, setLoading] = useState(false);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [error, setError] = useState("");
    const [wasLoaded, setWasLoaded] = useState(false);
    const [selectedPresetId, setSelectedPresetId] = useState<TemplatePresetId>("hook");
    const [selectedSceneId, setSelectedSceneId] = useState<string>("");
    const [previewUrl, setPreviewUrl] = useState("");
    const [overlayCards, setOverlayCards] = useState<OverlayCardSpec[]>(TEMPLATE_PRESETS[0].overlayCards);

    const sceneImages = useMemo(() => manifest?.images?.sceneImages ?? [], [manifest]);
    const sceneImageMap = useMemo(() => {
        const map = new Map<string, AssetRecord>();
        for (const asset of sceneImages) {
            const sceneId = getSceneImageSceneId(asset);
            if (sceneId) {
                map.set(sceneId, asset);
            }
        }
        return map;
    }, [sceneImages]);

    const storyboard = useMemo<Storyboard | null>(() => {
        return brief?.productionBible?.storyboards?.find((entry) => entry.deliverableId === KNOWN_STORYBOARD_ID) ?? null;
    }, [brief]);

    const storyboardShotIds = useMemo(() => storyboard?.shotSequence.map((shot) => shot.sceneId) ?? [], [storyboard]);
    const missingSceneIds = useMemo(
        () => storyboardShotIds.filter((sceneId) => !sceneImageMap.has(sceneId)),
        [sceneImageMap, storyboardShotIds],
    );

    const selectedSceneAsset = useMemo(() => {
        if (selectedSceneId && sceneImageMap.has(selectedSceneId)) {
            return sceneImageMap.get(selectedSceneId) ?? null;
        }

        return sceneImages[0] ?? null;
    }, [sceneImageMap, sceneImages, selectedSceneId]);

    const selectedSceneStoryBeat = useMemo(() => {
        if (!storyboard) return null;
        return storyboard.shotSequence.find((shot) => shot.sceneId === selectedSceneId) ?? storyboard.shotSequence[0] ?? null;
    }, [selectedSceneId, storyboard]);

    const loadCampaignAssets = async () => {
        setLoading(true);
        setError("");

        try {
            const [briefRes, manifestRes] = await Promise.all([
                fetch(`/api/groups/campaign/${slug}/media/aesthetic`, { cache: "no-store" }),
                fetch(`/api/groups/campaign/${slug}/media/manifest`, { cache: "no-store" }),
            ]);

            if (!briefRes.ok) {
                throw new Error(`Failed to load aesthetic brief: ${briefRes.status}`);
            }

            if (!manifestRes.ok) {
                throw new Error(`Failed to load media manifest: ${manifestRes.status}`);
            }

            const briefJson = await briefRes.json();
            const manifestJson = await manifestRes.json();

            setBrief((briefJson as { brief?: CampaignAestheticBrief })?.brief ?? (briefJson as CampaignAestheticBrief));
            setManifest((manifestJson as { manifest?: CampaignMediaManifest })?.manifest ?? (manifestJson as CampaignMediaManifest));
            setWasLoaded(true);
            setPreviewUrl("");
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : String(err));
            setBrief(null);
            setManifest(null);
            setWasLoaded(false);
        } finally {
            setLoading(false);
        }
    };

    const applyPreset = (presetId: TemplatePresetId) => {
        const preset = TEMPLATE_PRESETS.find((entry) => entry.id === presetId) ?? TEMPLATE_PRESETS[0];
        setSelectedPresetId(presetId);
        setOverlayCards(preset.overlayCards);
    };

    const updateOverlayCard = (index: number, updates: Partial<OverlayCardSpec>) => {
        setOverlayCards((current) => current.map((card, cardIndex) => (
            cardIndex === index ? { ...card, ...updates } : card
        )));
    };

    const updatePlacement = (index: number, updates: Partial<OverlayCardSpec["placement"]>) => {
        setOverlayCards((current) => current.map((card, cardIndex) => (
            cardIndex === index
                ? { ...card, placement: { ...card.placement, ...updates } }
                : card
        )));
    };

    const generatePreview = async () => {
        if (!selectedSceneAsset?.url) {
            setError("Choose a scene image first.");
            return;
        }

        setPreviewLoading(true);
        setError("");

        try {
            const response = await fetch("/api/tests/tiktok-playground/preview", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    overlaySpecs: overlayCards,
                    backgroundImageUrl: selectedSceneAsset.url,
                }),
            });

            const result = await response.json();
            if (!response.ok) {
                throw new Error(result?.error || `Preview generation failed (${response.status})`);
            }

            setPreviewUrl(result.previewUrl as string);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setPreviewLoading(false);
        }
    };

    useEffect(() => {
        void loadCampaignAssets();
    }, []);

    useEffect(() => {
        if (selectedSceneId) return;

        const initialSceneId = getStoryboardSceneId(storyboard) ?? sceneImageMap.keys().next().value ?? "";
        if (initialSceneId) {
            setSelectedSceneId(initialSceneId);
        }
    }, [sceneImageMap, selectedSceneId, storyboard]);

    useEffect(() => {
        if (!selectedSceneId && sceneImageMap.size > 0) {
            setSelectedSceneId(sceneImageMap.keys().next().value as string);
        }
    }, [sceneImageMap, selectedSceneId]);

    const backgroundUrl = selectedSceneAsset?.url ?? "";

    return (
        <div className="space-y-8 p-6 text-slate-100">
            <header className="space-y-4">
                <div>
                    <h1 className="text-3xl font-semibold">Board Games At Sea Sandbox</h1>
                    <p className="max-w-4xl text-sm text-slate-400">
                        This is the working surface for TikTok package exploration. It keeps the production Bible scenes visible,
                        but lets us shape a reusable ad template around them before we spend on another full render run.
                    </p>
                </div>

                <div className="grid max-w-4xl gap-3 sm:grid-cols-[1fr_auto]">
                    <label className="space-y-2 text-sm text-slate-300">
                        Campaign slug
                        <input
                            value={slug}
                            onChange={(event) => setSlug(event.target.value)}
                            className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none focus:border-cyan-500"
                        />
                    </label>
                    <button
                        type="button"
                        onClick={loadCampaignAssets}
                        disabled={loading}
                        className="inline-flex items-center justify-center rounded bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {loading ? "Loading..." : "Reload campaign"}
                    </button>
                </div>
            </header>

            {error ? (
                <div className="rounded border border-red-500 bg-red-950/50 p-4 text-sm text-red-200">
                    <strong>Error:</strong> {error}
                </div>
            ) : null}

            {!wasLoaded && !loading ? (
                <div className="rounded border border-slate-700 bg-slate-950/80 p-4 text-sm text-slate-400">
                    Fetching campaign data from the media APIs.
                </div>
            ) : null}

            {wasLoaded && brief && manifest ? (
                <div className="grid gap-6 xl:grid-cols-[1.25fr_0.95fr]">
                    <section className="space-y-6">
                        <div className="rounded border border-slate-700 bg-slate-950/80 p-5">
                            <div className="mb-3 flex items-center gap-2">
                                <Sparkles className="h-5 w-5 text-cyan-400" />
                                <h2 className="text-lg font-semibold text-slate-100">Package preview</h2>
                            </div>
                            <p className="text-sm text-slate-400">
                                Pick a scene, choose a template, and render a lightweight preview clip with text framing.
                                This is the place to decide whether the ad feels like a commercial or just another cruise reel.
                            </p>

                            <div className="mt-5 grid gap-4">
                                <div className="relative overflow-hidden rounded-lg border border-slate-700 bg-slate-900">
                                    {backgroundUrl ? (
                                        <img src={backgroundUrl} alt={selectedSceneId || "selected scene"} className="h-[640px] w-full object-cover" />
                                    ) : (
                                        <div className="flex h-[640px] items-center justify-center bg-slate-900 text-sm text-slate-500">
                                            Select a scene image to preview the package.
                                        </div>
                                    )}

                                    {overlayCards.map((card) => (
                                        <div
                                            key={`${card.badge}-${card.headline}`}
                                            className="absolute rounded-2xl border border-slate-800/80 bg-slate-950/82 p-8 shadow-2xl backdrop-blur-sm"
                                            style={{
                                                left: `${(card.placement.x / 1920) * 100}%`,
                                                top: `${(card.placement.y / 1920) * 100}%`,
                                                width: `${(card.placement.width / 1920) * 100}%`,
                                                minHeight: `${(card.placement.height / 1920) * 100}%`,
                                                borderColor: card.accentColor,
                                            }}
                                        >
                                            <div
                                                className="absolute left-0 top-0 h-2 w-full rounded-t-2xl"
                                                style={{ backgroundColor: card.accentColor }}
                                            />
                                            <div className="mb-3 pt-2 text-xs font-mono uppercase tracking-[0.28em]" style={{ color: card.accentColor }}>
                                                {card.badge}
                                            </div>
                                            <div className="mb-4 whitespace-pre-line text-4xl font-black leading-tight text-slate-100">
                                                {card.headline}
                                            </div>
                                            <div className="whitespace-pre-line max-w-md text-base leading-6 text-slate-300">
                                                {card.subline}
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <div className="flex flex-wrap items-center gap-3">
                                    <button
                                        type="button"
                                        onClick={generatePreview}
                                        disabled={previewLoading || !selectedSceneAsset}
                                        className="inline-flex items-center gap-2 rounded bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        {previewLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                                        Render preview
                                    </button>
                                    <div className="text-xs text-slate-500">
                                        Uses the selected scene image and the current template preset.
                                    </div>
                                </div>

                                {previewUrl ? (
                                    <div className="rounded border border-emerald-500 bg-emerald-950/20 p-4">
                                        <p className="text-sm font-medium text-emerald-100">Generated preview</p>
                                        <div className="mt-3 flex justify-center">
                                            <div className="w-full max-w-[320px] overflow-hidden rounded-[2rem] border border-slate-700 bg-black shadow-2xl aspect-[9/16]">
                                                <video
                                                    src={previewUrl}
                                                    autoPlay
                                                    loop
                                                    muted
                                                    playsInline
                                                    className="h-full w-full bg-black object-contain"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ) : null}
                            </div>
                        </div>

                        <div className="rounded border border-slate-700 bg-slate-950/80 p-5">
                            <div className="mb-4 flex items-center justify-between gap-3">
                                <div>
                                    <div className="text-xs uppercase tracking-[0.3em] text-slate-500">Storyboard</div>
                                    <h2 className="mt-1 text-lg font-semibold text-slate-100">{storyboard?.title ?? "tiktok_seed"}</h2>
                                </div>
                                <div className="rounded-full border border-slate-700 px-3 py-1 text-xs uppercase tracking-[0.24em] text-slate-400">
                                    {storyboard?.totalDurationSeconds ?? 0}s
                                </div>
                            </div>

                            {storyboard ? (
                                <div className="space-y-4">
                                    <div className="grid gap-3 sm:grid-cols-2">
                                        <div className="rounded bg-slate-950/90 p-3 text-sm text-slate-300">
                                            <p className="text-slate-100">Scene library</p>
                                            <p>{brief.productionBible?.sceneLibrary?.length ?? 0} scenes</p>
                                        </div>
                                        <div className="rounded bg-slate-950/90 p-3 text-sm text-slate-300">
                                            <p className="text-slate-100">Storyboards</p>
                                            <p>{brief.productionBible?.storyboards?.length ?? 0}</p>
                                        </div>
                                    </div>

                                    <div className="rounded border border-slate-700 bg-slate-950/90 p-3 text-sm text-slate-300">
                                        <p className="text-slate-100">Shot sequence</p>
                                        <ol className="mt-2 space-y-2">
                                            {storyboard.shotSequence.map((shot) => (
                                                <li
                                                    key={`${shot.sceneId}-${shot.shotNumber}`}
                                                    className="rounded border border-slate-800 bg-slate-900/90 p-3"
                                                >
                                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                                        <span className="text-sm font-semibold text-slate-100">{shot.sceneId}</span>
                                                        <span className="text-xs uppercase tracking-[0.2em] text-slate-500">{shot.durationSeconds}s</span>
                                                    </div>
                                                    <p className="mt-1 text-sm text-slate-400">
                                                        {shot.emotionalBeat} - {shot.cameraMovement}
                                                    </p>
                                                    <p className="mt-2 text-sm text-slate-300">{shot.narrationSegment}</p>
                                                </li>
                                            ))}
                                        </ol>
                                    </div>

                                    {missingSceneIds.length > 0 ? (
                                        <div className="rounded border border-amber-500 bg-amber-950/20 p-4 text-sm text-amber-100">
                                            <strong>Missing scene images:</strong>
                                            <div className="mt-2 flex flex-wrap gap-2 text-amber-200">
                                                {missingSceneIds.map((sceneId) => (
                                                    <span key={sceneId} className="rounded-full border border-amber-500 px-3 py-1 text-xs">
                                                        {sceneId}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="rounded border border-emerald-500 bg-emerald-950/20 p-4 text-sm text-emerald-100">
                                            All storyboard scenes are covered by scene imagery in the manifest.
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <p className="text-sm text-slate-400">
                                    No <code>tiktok_seed</code> storyboard was found in the production bible.
                                </p>
                            )}
                        </div>

                        <div className="rounded border border-slate-700 bg-slate-950/80 p-5">
                            <div className="text-xs uppercase tracking-[0.3em] text-slate-500">Scene gallery</div>
                            <p className="mt-2 text-sm text-slate-400">
                                Click a scene to use it in the package preview.
                            </p>
                            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                                {sceneImages.map((asset) => {
                                    const sceneId = getSceneImageSceneId(asset) ?? "unknown";
                                    const isSelected = sceneId === selectedSceneId;
                                    return (
                                        <button
                                            key={asset.assetId}
                                            type="button"
                                            onClick={() => setSelectedSceneId(sceneId)}
                                            className={`overflow-hidden rounded-lg border text-left transition ${
                                                isSelected ? "border-cyan-400 bg-cyan-950/20" : "border-slate-800 bg-slate-900"
                                            }`}
                                        >
                                            <img src={asset.url} alt={sceneId} className="h-44 w-full object-cover" />
                                            <div className="space-y-1 p-3 text-xs text-slate-300">
                                                <div className="flex items-center justify-between gap-2">
                                                    <div className="font-medium text-slate-100">{sceneId}</div>
                                                    {isSelected ? (
                                                        <span className="rounded-full border border-cyan-400 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-cyan-200">
                                                            selected
                                                        </span>
                                                    ) : null}
                                                </div>
                                                <div className="truncate text-slate-500">{asset.assetId}</div>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </section>

                    <aside className="space-y-6">
                        <div className="rounded border border-slate-700 bg-slate-950/80 p-5">
                            <div className="mb-4 flex items-center gap-2">
                                <Settings className="h-5 w-5 text-slate-400" />
                                <h3 className="text-lg font-semibold text-slate-100">Template</h3>
                            </div>
                            <div className="space-y-3">
                                {TEMPLATE_PRESETS.map((preset) => {
                                    const isActive = selectedPresetId === preset.id;
                                    return (
                                        <button
                                            key={preset.id}
                                            type="button"
                                            onClick={() => applyPreset(preset.id)}
                                            className={`w-full rounded border p-3 text-left transition ${
                                                isActive ? "border-cyan-400 bg-cyan-950/20" : "border-slate-800 bg-slate-900"
                                            }`}
                                        >
                                            <div className="flex items-center justify-between gap-3">
                                                <div className="text-sm font-semibold text-slate-100">{preset.label}</div>
                                                <div className="rounded-full border border-slate-700 px-2 py-0.5 text-[10px] uppercase tracking-[0.22em] text-slate-400">
                                                    preset
                                                </div>
                                            </div>
                                            <div className="mt-1 text-sm text-slate-400">{preset.description}</div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="rounded border border-slate-700 bg-slate-950/80 p-5">
                            <div className="mb-4 flex items-center gap-2">
                                <Palette className="h-5 w-5 text-slate-400" />
                                <h3 className="text-lg font-semibold text-slate-100">Overlay copy</h3>
                            </div>
                            <div className="space-y-5">
                                {overlayCards.map((card, index) => {
                                    const label = index === 0 ? "Top card" : "Bottom card";
                                    return (
                                        <div key={`${label}-${index}`} className="rounded border border-slate-800 bg-slate-900/80 p-4">
                                            <div className="mb-3 flex items-center justify-between">
                                                <div className="text-sm font-semibold text-slate-100">{label}</div>
                                                <div className="text-[10px] uppercase tracking-[0.24em] text-slate-500">block {index + 1}</div>
                                            </div>
                                            <div className="space-y-3">
                                                <label className="block space-y-2">
                                                    <span className="text-sm font-medium text-slate-300">Badge</span>
                                                    <input
                                                        type="text"
                                                        value={card.badge}
                                                        onChange={(event) => updateOverlayCard(index, { badge: event.target.value })}
                                                        className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none"
                                                    />
                                                </label>
                                                <label className="block space-y-2">
                                                    <span className="text-sm font-medium text-slate-300">Headline</span>
                                                    <textarea
                                                        value={card.headline}
                                                        onChange={(event) => updateOverlayCard(index, { headline: event.target.value })}
                                                        rows={2}
                                                        className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none"
                                                    />
                                                </label>
                                                <label className="block space-y-2">
                                                    <span className="text-sm font-medium text-slate-300">Subline</span>
                                                    <textarea
                                                        value={card.subline}
                                                        onChange={(event) => updateOverlayCard(index, { subline: event.target.value })}
                                                        rows={3}
                                                        className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none"
                                                    />
                                                </label>
                                                <label className="block space-y-2">
                                                    <span className="text-sm font-medium text-slate-300">Accent color</span>
                                                    <input
                                                        type="color"
                                                        value={card.accentColor}
                                                        onChange={(event) => updateOverlayCard(index, { accentColor: event.target.value })}
                                                        className="h-10 w-full rounded border border-slate-700 bg-slate-950"
                                                    />
                                                </label>
                                                <div className="grid grid-cols-2 gap-3">
                                                    <label className="block space-y-2">
                                                        <span className="text-sm font-medium text-slate-300">X</span>
                                                        <input
                                                            type="number"
                                                            value={card.placement.x}
                                                            onChange={(event) => updatePlacement(index, { x: Number(event.target.value) })}
                                                            className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none"
                                                        />
                                                    </label>
                                                    <label className="block space-y-2">
                                                        <span className="text-sm font-medium text-slate-300">Y</span>
                                                        <input
                                                            type="number"
                                                            value={card.placement.y}
                                                            onChange={(event) => updatePlacement(index, { y: Number(event.target.value) })}
                                                            className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none"
                                                        />
                                                    </label>
                                                    <label className="block space-y-2">
                                                        <span className="text-sm font-medium text-slate-300">Width</span>
                                                        <input
                                                            type="number"
                                                            value={card.placement.width}
                                                            onChange={(event) => updatePlacement(index, { width: Number(event.target.value) })}
                                                            className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none"
                                                        />
                                                    </label>
                                                    <label className="block space-y-2">
                                                        <span className="text-sm font-medium text-slate-300">Height</span>
                                                        <input
                                                            type="number"
                                                            value={card.placement.height}
                                                            onChange={(event) => updatePlacement(index, { height: Number(event.target.value) })}
                                                            className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none"
                                                        />
                                                    </label>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="rounded border border-slate-700 bg-slate-950/80 p-5">
                            <div className="mb-4 flex items-center gap-2">
                                <Type className="h-5 w-5 text-slate-400" />
                                <h3 className="text-lg font-semibold text-slate-100">Current scene</h3>
                            </div>
                            {selectedSceneAsset ? (
                                <div className="space-y-3">
                                    <img src={selectedSceneAsset.url} alt={selectedSceneId || "selected scene"} className="w-full rounded border border-slate-700 object-cover" />
                                    <div className="rounded border border-slate-800 bg-slate-900 p-3 text-sm text-slate-300">
                                        <div className="font-medium text-slate-100">{selectedSceneId || "selected"}</div>
                                        <div className="mt-1 text-slate-400">{selectedSceneAsset.assetId}</div>
                                        {selectedSceneStoryBeat ? (
                                            <div className="mt-2 text-slate-400">
                                                Shot {selectedSceneStoryBeat.shotNumber} - {selectedSceneStoryBeat.emotionalBeat}
                                            </div>
                                        ) : null}
                                    </div>
                                </div>
                            ) : (
                                <p className="text-sm text-slate-400">Choose a scene from the gallery to preview it here.</p>
                            )}
                        </div>
                    </aside>
                </div>
            ) : null}
        </div>
    );
}
