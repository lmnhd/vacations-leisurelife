"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CampaignSelector } from "../media-generation/campaign-selector";
import { useVideoModelPreference } from "@/lib/campaigns/media/use-video-model-preference";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import {
    BookOpen,
    Clapperboard,
    ExternalLink,
    Film,
    Loader2,
    Play,
    RefreshCw,
    Sparkles,
    Target,
    Wand2,
} from "lucide-react";

interface AssetRecord {
    assetId: string;
    url: string;
    tags: string[];
    createdAt: string;
}

interface CampaignManifest {
    images: {
        sceneImages?: AssetRecord[];
        hero?: AssetRecord[];
    };
}

interface ShotSpec {
    shotNumber: number;
    sceneId: string;
    durationSeconds: number;
    cameraMovement: string;
    subjectMotion: string;
    environmentMotion: string;
    emotionalBeat: string;
    narrationSegment: string;
}

interface Storyboard {
    deliverableId: string;
    title: string;
    shotSequence: ShotSpec[];
}

interface CampaignBrief {
    productionBible?: {
        storyboards: Storyboard[];
    };
}

interface StoryboardShotPreview {
    deliverableId: string;
    storyboardTitle: string;
    shotNumber: number;
    sceneId: string;
    sourceImageUrl: string;
    basePrompt: string;
    effectivePrompt: string;
    effectiveDurationSeconds: number;
    presetId: string;
    presetLabel: string;
    shot: ShotSpec;
}

interface TestClipResult {
    assetId: string;
    videoUrl: string;
    taskId: string;
    durationSeconds: number;
    estimatedCostUsd: number;
    estimatedCreditsUsed: number | null;
    creditsUsed: number | null;
    videoModelPresetId: string;
    videoModelLabel: string;
    label: string;
    motionPrompt: string;
    submittedMotionPrompt?: string;
    sourceImageUrl: string;
    createdAt: string;
    deliverableId?: string;
    shotNumber?: number;
    sceneId?: string;
}

type LabMode = "storyboard_shot" | "custom_prompt";

const STORYBOARD_TEST_BASELINE_DURATION_SECONDS = 10;

const PROMPT_PRESETS = [
    {
        id: "ambient",
        label: "Ambient realism",
        prompt: "Preserve the exact source frame. Motion should come from camera glide, ocean shimmer, haze drift, reflections, and subtle environmental movement only. If people are visible, keep them completely still. No prop warping, no duplicate objects, no extra limbs.",
    },
    {
        id: "deck",
        label: "Deck reveal",
        prompt: "Slow cinematic push forward through the scene with premium cruise realism. Preserve architecture, horizon line, lighting, and object fidelity. Favor sea texture, wind in fabric, moving light, and camera drift over subject animation. Keep visible people frozen.",
    },
    {
        id: "golden",
        label: "Golden-hour travel ad",
        prompt: "Luxury travel-ad motion with elegant camera movement and believable physical detail. Preserve the exact image composition. Add only gentle environmental motion: glow shifts, wake texture, reflections, and atmosphere. No walking cycles, no hand choreography, no cup or mug distortion.",
    },
] as const;

function Thumbnail({
    record,
    selected,
    onSelect,
}: {
    record: AssetRecord;
    selected: boolean;
    onSelect: () => void;
}) {
    const label = record.tags.find((tag) => tag !== "scene" && tag !== "scene_image") ?? record.assetId;

    return (
        <button
            type="button"
            onClick={onSelect}
            className={`overflow-hidden rounded-lg border transition ${selected ? "border-blue-500 shadow-[0_0_0_1px_rgba(41,98,255,0.45)]" : "border-neutral-700 hover:border-neutral-500"}`}
        >
            <AspectRatio ratio={16 / 9}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`${record.url}?v=${encodeURIComponent(record.createdAt)}`} alt={label} className="h-full w-full object-cover" />
            </AspectRatio>
            <div className="border-t border-neutral-800 bg-neutral-950 px-3 py-2 text-left text-xs text-neutral-300">{label}</div>
        </button>
    );
}

function getClosestSupportedDuration(supportedDurationsSeconds: readonly number[], requestedDurationSeconds: number): number {
    if (supportedDurationsSeconds.includes(requestedDurationSeconds)) {
        return requestedDurationSeconds;
    }

    return supportedDurationsSeconds.reduce((closest, candidate) => {
        return Math.abs(candidate - requestedDurationSeconds) < Math.abs(closest - requestedDurationSeconds)
            ? candidate
            : closest;
    }, supportedDurationsSeconds[0]);
}

export default function VideoModelLabPage() {
    const { presetId, presets, loading: preferenceLoading, updatePreference } = useVideoModelPreference();
    const [slug, setSlug] = useState("");
    const [manifest, setManifest] = useState<CampaignManifest | null>(null);
    const [brief, setBrief] = useState<CampaignBrief | null>(null);
    const [labMode, setLabMode] = useState<LabMode>("storyboard_shot");
    const [selectedSourceUrl, setSelectedSourceUrl] = useState("");
    const [prompt, setPrompt] = useState<string>(PROMPT_PRESETS[0].prompt);
    const [durationSeconds, setDurationSeconds] = useState("5");
    const [selectedPresetIds, setSelectedPresetIds] = useState<string[]>([]);
    const [results, setResults] = useState<TestClipResult[]>([]);
    const [loadingManifest, setLoadingManifest] = useState(false);
    const [runningPresetIds, setRunningPresetIds] = useState<string[]>([]);
    const [selectedStoryboardId, setSelectedStoryboardId] = useState("");
    const [selectedShotNumber, setSelectedShotNumber] = useState("");
    const [storyboardPreview, setStoryboardPreview] = useState<StoryboardShotPreview | null>(null);
    const [storyboardPreviewLoading, setStoryboardPreviewLoading] = useState(false);
    const [error, setError] = useState("");

    const availablePresets = useMemo(() => presets.filter((entry) => entry.available), [presets]);
    const storyboards = useMemo(() => brief?.productionBible?.storyboards ?? [], [brief]);
    const selectedStoryboard = useMemo(() => storyboards.find((entry) => entry.deliverableId === selectedStoryboardId) ?? null, [selectedStoryboardId, storyboards]);
    const requestedPreviewDurationSeconds = useMemo(() => {
        if (labMode === "storyboard_shot") {
            return STORYBOARD_TEST_BASELINE_DURATION_SECONDS;
        }

        const parsed = Number(durationSeconds);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 5;
    }, [durationSeconds, labMode]);
    const sourceImages = useMemo(() => [
        ...(manifest?.images.sceneImages ?? []),
        ...(manifest?.images.hero ?? []),
    ], [manifest]);

    const loadManifest = useCallback(async (targetSlug: string) => {
        if (!targetSlug.trim()) return;
        setLoadingManifest(true);
        setError("");
        try {
            const [manifestResponse, briefResponse] = await Promise.all([
                fetch(`/api/groups/campaign/${targetSlug.trim()}/media/manifest`),
                fetch(`/api/groups/campaign/${targetSlug.trim()}/media/aesthetic`),
            ]);

            const manifestData = await manifestResponse.json() as CampaignManifest | { error?: string };
            if (!manifestResponse.ok) {
                throw new Error((manifestData as { error?: string }).error ?? `HTTP ${manifestResponse.status}`);
            }

            const briefData = await briefResponse.json() as CampaignBrief | { error?: string };
            if (!briefResponse.ok) {
                throw new Error((briefData as { error?: string }).error ?? `HTTP ${briefResponse.status}`);
            }

            const nextManifest = manifestData as CampaignManifest;
            const nextBrief = briefData as CampaignBrief;
            setManifest(nextManifest);
            setBrief(nextBrief);
            const firstImage = nextManifest.images.sceneImages?.[0]?.url ?? nextManifest.images.hero?.[0]?.url ?? "";
            setSelectedSourceUrl(firstImage);
            setSlug(targetSlug.trim());
            const firstStoryboard = nextBrief.productionBible?.storyboards?.[0];
            setSelectedStoryboardId(firstStoryboard?.deliverableId ?? "");
            setSelectedShotNumber(firstStoryboard?.shotSequence?.[0] ? String(firstStoryboard.shotSequence[0].shotNumber) : "");
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setLoadingManifest(false);
        }
    }, []);

    const loadStoryboardPreview = useCallback(async () => {
        if (!slug.trim() || !selectedStoryboardId || !selectedShotNumber) {
            setStoryboardPreview(null);
            return;
        }

        setStoryboardPreviewLoading(true);
        try {
            const searchParams = new URLSearchParams({
                deliverableId: selectedStoryboardId,
                shotNumber: selectedShotNumber,
            });
            if (presetId) {
                searchParams.set("videoModelPresetId", presetId);
            }

            const response = await fetch(`/api/groups/campaign/${slug.trim()}/media/test/storyboard-shot?${searchParams.toString()}`);
            const data = await response.json() as StoryboardShotPreview | { error?: string };
            if (!response.ok) {
                throw new Error((data as { error?: string }).error ?? `HTTP ${response.status}`);
            }

            const preview = data as StoryboardShotPreview;
            setStoryboardPreview(preview);
            setSelectedSourceUrl(preview.sourceImageUrl);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
            setStoryboardPreview(null);
        } finally {
            setStoryboardPreviewLoading(false);
        }
    }, [presetId, selectedShotNumber, selectedStoryboardId, slug]);

    useEffect(() => {
        if (labMode === "storyboard_shot") {
            void loadStoryboardPreview();
        }
    }, [labMode, loadStoryboardPreview]);

    const togglePreset = useCallback((id: string) => {
        setSelectedPresetIds((current) => {
            if (current.includes(id)) {
                return current.filter((entry) => entry !== id);
            }
            return [...current, id];
        });
    }, []);

    const runPreset = useCallback(async (targetPresetId: string) => {
        if (!slug.trim()) {
            setError("Campaign is required.");
            return;
        }

        if (labMode === "storyboard_shot") {
            if (!selectedStoryboardId || !selectedShotNumber) {
                setError("Storyboard and shot selection are required.");
                return;
            }
        } else if (!selectedSourceUrl || !prompt.trim()) {
            setError("Campaign, source image, and motion prompt are required.");
            return;
        }

        setRunningPresetIds((current) => [...current, targetPresetId]);
        setError("");
        try {
            const routePath = labMode === "storyboard_shot"
                ? `/api/groups/campaign/${slug.trim()}/media/test/storyboard-shot`
                : `/api/groups/campaign/${slug.trim()}/media/runway-test`;
            const body = labMode === "storyboard_shot"
                ? {
                    deliverableId: selectedStoryboardId,
                    shotNumber: Number(selectedShotNumber),
                    label: `${targetPresetId}_${selectedStoryboardId}_${selectedShotNumber}`,
                    videoModelPresetId: targetPresetId,
                }
                : {
                    sourceImageUrl: selectedSourceUrl,
                    motionPrompt: prompt.trim(),
                    durationSeconds: Number(durationSeconds),
                    label: `${targetPresetId}_${Date.now()}`,
                    videoModelPresetId: targetPresetId,
                };

            const response = await fetch(routePath, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });

            const data = await response.json() as TestClipResult | { error?: string };
            if (!response.ok) {
                throw new Error((data as { error?: string }).error ?? `HTTP ${response.status}`);
            }

            setResults((current) => [data as TestClipResult, ...current.filter((entry) => entry.videoModelPresetId !== targetPresetId)]);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setRunningPresetIds((current) => current.filter((entry) => entry !== targetPresetId));
        }
    }, [durationSeconds, labMode, prompt, selectedShotNumber, selectedSourceUrl, selectedStoryboardId, slug]);

    const runSelectedPresets = useCallback(async () => {
        for (const targetPresetId of selectedPresetIds) {
            // eslint-disable-next-line no-await-in-loop
            await runPreset(targetPresetId);
        }
    }, [runPreset, selectedPresetIds]);

    return (
        <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(41,98,255,0.18),_transparent_30%),linear-gradient(180deg,_#09090b_0%,_#111827_45%,_#050816_100%)] px-6 py-8 text-neutral-50">
            <div className="mx-auto flex max-w-7xl flex-col gap-6">
                <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
                    <Card className="border-neutral-800 bg-neutral-950/90">
                        <CardHeader>
                            <div className="flex items-center justify-between gap-4">
                                <div className="space-y-2">
                                    <Badge className="bg-blue-600/20 text-blue-300 hover:bg-blue-600/20">Short-Clip Lab</Badge>
                                    <CardTitle className="flex items-center gap-3 text-3xl text-neutral-50">
                                        <Clapperboard className="h-7 w-7 text-blue-400" />
                                        Video Model Comparison
                                    </CardTitle>
                                    <CardDescription className="max-w-2xl text-sm text-neutral-400">
                                        Run the same source frame and motion brief across every configured short-video model, then promote the winner to the shared preference used by the other media pages.
                                    </CardDescription>
                                </div>
                                <div className="grid gap-3 sm:grid-cols-2">
                                    <Card className="border-neutral-800 bg-neutral-900">
                                        <CardContent className="p-5">
                                            <div className="text-xs uppercase tracking-[0.24em] text-neutral-500">Shared default</div>
                                            <div className="mt-2 text-sm font-medium text-neutral-100">{preferenceLoading ? "Loading…" : presets.find((entry) => entry.id === presetId)?.label ?? "Unknown"}</div>
                                            <div className="mt-1 text-xs text-neutral-500">Applied to generate and credit-check requests through a browser cookie.</div>
                                        </CardContent>
                                    </Card>
                                    <Card className="border-neutral-800 bg-neutral-900">
                                        <CardContent className="flex h-full items-center gap-2 p-5 text-xs text-neutral-400">
                                            <BookOpen className="h-4 w-4 text-amber-300" />
                                            This lab can now run a real Production Bible shot using the exact scene image and exact storyboard-derived prompt synthesis path, or fall back to a custom prompt mode when you want isolated experiments.
                                        </CardContent>
                                    </Card>
                                </div>
                            </div>
                        </CardHeader>
                    </Card>

                    <div className="grid gap-6 lg:grid-cols-2">
                        <Card className="border-neutral-800 bg-neutral-950/90">
                            <CardContent className="flex h-full flex-col justify-between gap-4 p-6">
                                <div>
                                    <div className="text-xs uppercase tracking-[0.24em] text-neutral-500">Routes</div>
                                    <div className="mt-2 text-sm text-neutral-300">Use the existing media pages with the same chosen model.</div>
                                </div>
                                <div className="flex gap-3">
                                    <Button asChild variant="outline" className="flex-1 border-neutral-700 bg-neutral-900 text-neutral-100">
                                        <a href="/tests/production-bible">
                                            <BookOpen className="mr-2 h-4 w-4" />
                                            Production Bible
                                        </a>
                                    </Button>
                                    <Button asChild variant="outline" className="flex-1 border-neutral-700 bg-neutral-900 text-neutral-100">
                                        <a href="/tests/media-generation">
                                            <ExternalLink className="mr-2 h-4 w-4" />
                                            Media Generation
                                        </a>
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                        <Card className="border-neutral-800 bg-neutral-950/90">
                            <CardContent className="flex h-full flex-col justify-between gap-4 p-6">
                                <div>
                                    <div className="text-xs uppercase tracking-[0.24em] text-neutral-500">Method</div>
                                    <div className="mt-2 text-sm text-neutral-300">Keep clips short, keep subjects frozen, and compare on object fidelity, limb stability, camera realism, and background coherence.</div>
                                </div>
                                <div className="flex items-center gap-2 text-xs text-neutral-500">
                                    <Sparkles className="h-4 w-4 text-blue-300" />
                                    Start with 4-5 seconds, then only extend the winner.
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>

                <div className="grid gap-6 xl:grid-cols-[1.1fr_1.2fr_1.2fr]">
                    <Card className="border-neutral-800 bg-neutral-950/90">
                        <CardHeader>
                            <CardTitle className="text-lg text-neutral-50">1. Campaign + Source</CardTitle>
                            <CardDescription>Load an existing campaign manifest and select the image you want to animate.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid gap-4 sm:grid-cols-[1.3fr_0.7fr]">
                                <CampaignSelector value={slug} onChange={setSlug} disabled={loadingManifest} />
                                <Button onClick={() => void loadManifest(slug)} disabled={!slug.trim() || loadingManifest} className="h-10">
                                    {loadingManifest ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                                    Load
                                </Button>
                            </div>

                            <div className="grid gap-3 sm:grid-cols-2">
                                {sourceImages.slice(0, 6).map((record) => (
                                    <Thumbnail
                                        key={record.assetId}
                                        record={record}
                                        selected={selectedSourceUrl === record.url}
                                        onSelect={() => setSelectedSourceUrl(record.url)}
                                    />
                                ))}
                            </div>

                            <div className="space-y-2">
                                <div className="text-xs uppercase tracking-[0.24em] text-neutral-500">Selected source URL</div>
                                <Input value={selectedSourceUrl} onChange={(event) => setSelectedSourceUrl(event.target.value)} placeholder="Paste a hosted image URL if you want to test an external source frame." />
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-neutral-800 bg-neutral-950/90">
                        <CardHeader>
                            <CardTitle className="text-lg text-neutral-50">2. Motion Brief</CardTitle>
                            <CardDescription>Default to real storyboard-shot fidelity. Use custom mode only when you intentionally want a non-production experiment.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid gap-3 sm:grid-cols-2">
                                <Button type="button" variant={labMode === "storyboard_shot" ? "default" : "outline"} onClick={() => setLabMode("storyboard_shot")} className={labMode === "storyboard_shot" ? "bg-blue-600 hover:bg-blue-500" : "border-neutral-700 bg-neutral-900 text-neutral-100"}>
                                    <Target className="mr-2 h-4 w-4" />
                                    Exact storyboard shot
                                </Button>
                                <Button type="button" variant={labMode === "custom_prompt" ? "default" : "outline"} onClick={() => setLabMode("custom_prompt")} className={labMode === "custom_prompt" ? "bg-blue-600 hover:bg-blue-500" : "border-neutral-700 bg-neutral-900 text-neutral-100"}>
                                    <Wand2 className="mr-2 h-4 w-4" />
                                    Custom prompt experiment
                                </Button>
                            </div>

                            {labMode === "storyboard_shot" ? (
                                <div className="space-y-4">
                                    <div className="grid gap-4 sm:grid-cols-2">
                                        <div className="space-y-2">
                                            <div className="text-xs uppercase tracking-[0.24em] text-neutral-500">Storyboard</div>
                                            <Select value={selectedStoryboardId} onValueChange={(value) => {
                                                setSelectedStoryboardId(value);
                                                const storyboard = storyboards.find((entry) => entry.deliverableId === value);
                                                setSelectedShotNumber(storyboard?.shotSequence?.[0] ? String(storyboard.shotSequence[0].shotNumber) : "");
                                            }}>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select a storyboard" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {storyboards.map((storyboard) => (
                                                        <SelectItem key={storyboard.deliverableId} value={storyboard.deliverableId}>{storyboard.title}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-2">
                                            <div className="text-xs uppercase tracking-[0.24em] text-neutral-500">Shot</div>
                                            <Select value={selectedShotNumber} onValueChange={setSelectedShotNumber}>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select a shot" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {(selectedStoryboard?.shotSequence ?? []).map((shot) => (
                                                        <SelectItem key={shot.shotNumber} value={String(shot.shotNumber)}>
                                                            Shot {shot.shotNumber} · {shot.sceneId}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>

                                    <div className="grid gap-4 sm:grid-cols-2">
                                        <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4 text-xs text-neutral-400">
                                            <div className="uppercase tracking-[0.24em] text-neutral-500">Storyboard-derived prompt</div>
                                            <div className="mt-2 whitespace-pre-wrap leading-6 text-neutral-200">
                                                {storyboardPreviewLoading ? "Loading exact shot prompt..." : storyboardPreview?.basePrompt ?? "Load a campaign and select a storyboard shot."}
                                            </div>
                                        </div>
                                        <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4 text-xs text-neutral-400">
                                            <div className="uppercase tracking-[0.24em] text-neutral-500">Effective prompt sent to model</div>
                                            <div className="mt-2 whitespace-pre-wrap leading-6 text-neutral-200">
                                                {storyboardPreviewLoading ? "Loading exact production prompt..." : storyboardPreview?.effectivePrompt ?? "Exact production-safe prompt will appear here."}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4 text-xs text-neutral-400">
                                        {storyboardPreview
                                            ? `This shot will use scene ${storyboardPreview.sceneId} and ${storyboardPreview.effectiveDurationSeconds}s, which matches the current production storyboard clip duration behavior for the selected model.`
                                            : "This mode uses the actual storyboard shot, actual scene image, and exact production prompt synthesis path."}
                                    </div>
                                </div>
                            ) : (
                                <>
                            <div className="grid gap-3 sm:grid-cols-3">
                                {PROMPT_PRESETS.map((preset) => (
                                    <Button key={preset.id} type="button" variant="outline" className="justify-start border-neutral-700 bg-neutral-900 text-left text-neutral-200" onClick={() => setPrompt(preset.prompt)}>
                                        <Wand2 className="mr-2 h-4 w-4 text-blue-300" />
                                        {preset.label}
                                    </Button>
                                ))}
                            </div>

                            <div className="grid gap-4 sm:grid-cols-[1.4fr_0.6fr]">
                                <div className="space-y-2">
                                    <div className="text-xs uppercase tracking-[0.24em] text-neutral-500">Motion prompt</div>
                                    <Textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} className="min-h-[220px] bg-neutral-950 text-neutral-100" />
                                </div>
                                <div className="space-y-2">
                                    <div className="text-xs uppercase tracking-[0.24em] text-neutral-500">Requested length</div>
                                    <Select value={durationSeconds} onValueChange={setDurationSeconds}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Pick a short duration" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {[4, 5, 6, 8, 10].map((seconds) => (
                                                <SelectItem key={seconds} value={String(seconds)}>{seconds}s</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4 text-xs text-neutral-400">
                                        Each model will snap to its nearest supported duration if it cannot run the exact requested length. This lab is now comparable to production for provider-level guardrails, duration normalization, and prompt trimming, but not for storyboard-specific shot synthesis.
                                    </div>
                                </div>
                            </div>
                                </>
                            )}
                        </CardContent>
                    </Card>

                    <Card className="border-neutral-800 bg-neutral-950/90">
                        <CardHeader>
                            <CardTitle className="text-lg text-neutral-50">3. Models + Shared Winner</CardTitle>
                            <CardDescription>Pick the models you want to compare, run them, then promote the winner to the shared preference.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid gap-3">
                                {presets.map((entry) => {
                                    const selected = selectedPresetIds.includes(entry.id);
                                    const running = runningPresetIds.includes(entry.id);
                                    const active = presetId === entry.id;
                                    const previewDurationSeconds = getClosestSupportedDuration(entry.supportedDurationsSeconds, requestedPreviewDurationSeconds);
                                    const previewEstimatedCostUsd = previewDurationSeconds * entry.estimatedUsdPerSecond;
                                    const previewEstimatedCredits = entry.estimatedCreditsPerSecond !== null
                                        ? previewDurationSeconds * entry.estimatedCreditsPerSecond
                                        : null;
                                    return (
                                        <div
                                            key={entry.id}
                                            role="button"
                                            tabIndex={entry.available ? 0 : -1}
                                            aria-pressed={selected}
                                            onClick={() => entry.available && togglePreset(entry.id)}
                                            onKeyDown={(event) => {
                                                if (!entry.available) return;
                                                if (event.key === "Enter" || event.key === " ") {
                                                    event.preventDefault();
                                                    togglePreset(entry.id);
                                                }
                                            }}
                                            className={`rounded-xl border p-4 text-left transition ${selected ? "border-blue-500 bg-blue-500/10" : "border-neutral-800 bg-neutral-900/80"} ${!entry.available ? "opacity-50" : "hover:border-neutral-600"}`}
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm font-semibold text-neutral-100">{entry.label}</span>
                                                        {active && <Badge className="bg-blue-600 text-white hover:bg-blue-600">Shared default</Badge>}
                                                    </div>
                                                    <div className="mt-1 text-xs text-neutral-500">{entry.compareSummary}</div>
                                                </div>
                                                <Badge variant="outline" className="border-neutral-700 text-neutral-300">{entry.available ? "ready" : entry.availabilityReason}</Badge>
                                            </div>
                                            <div className="mt-3 text-xs text-neutral-400">{entry.description}</div>
                                            <div className="mt-3 flex items-center justify-between text-xs text-neutral-500">
                                                <span>{entry.shortLabel}</span>
                                                <span>{previewDurationSeconds}s test clip</span>
                                            </div>
                                            <div className="mt-1 flex items-center justify-between text-xs text-neutral-500">
                                                <span>{previewEstimatedCredits !== null ? `${previewEstimatedCredits} credits est.` : "cost estimate only"}</span>
                                                <span>${previewEstimatedCostUsd.toFixed(2)} total est.</span>
                                            </div>
                                            <div className="mt-1 text-[11px] text-neutral-600">
                                                Based on ${entry.estimatedUsdPerSecond.toFixed(3)}/s and the current requested test length.
                                            </div>
                                            <div className="mt-3 flex gap-2">
                                                <Button type="button" size="sm" variant="outline" disabled={!entry.available || running} onClick={(event) => { event.stopPropagation(); void runPreset(entry.id); }} className="border-neutral-700 bg-neutral-950 text-neutral-100">
                                                    {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                                                    Run
                                                </Button>
                                                <Button type="button" size="sm" variant={active ? "default" : "secondary"} disabled={!entry.available || active} onClick={(event) => { event.stopPropagation(); void updatePreference(entry.id); }}>
                                                    {active ? "Current default" : "Make default"}
                                                </Button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="grid gap-3 sm:grid-cols-2">
                                <Button onClick={() => setSelectedPresetIds(availablePresets.map((entry) => entry.id))} variant="outline" className="border-neutral-700 bg-neutral-900 text-neutral-100">Select all ready models</Button>
                                <Button onClick={() => void runSelectedPresets()} disabled={selectedPresetIds.length === 0 || runningPresetIds.length > 0 || !selectedSourceUrl} className="bg-blue-600 hover:bg-blue-500">
                                    {runningPresetIds.length > 0 ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Film className="mr-2 h-4 w-4" />}
                                    Run selected set
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {error && (
                    <Card className="border-red-800 bg-red-950/40">
                        <CardContent className="p-4 text-sm text-red-200">{error}</CardContent>
                    </Card>
                )}

                <div className="grid gap-6 lg:grid-cols-2">
                    {results.map((result) => (
                        <Card key={result.videoModelPresetId} className="border-neutral-800 bg-neutral-950/90">
                            <CardHeader>
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <CardTitle className="text-xl text-neutral-50">{result.videoModelLabel}</CardTitle>
                                        <CardDescription>
                                            {result.durationSeconds}s clip · {result.estimatedCreditsUsed !== null ? `${result.estimatedCreditsUsed} credits` : "estimate only"} · ${result.estimatedCostUsd.toFixed(2)}
                                        </CardDescription>
                                    </div>
                                    <Button size="sm" variant={presetId === result.videoModelPresetId ? "default" : "outline"} onClick={() => void updatePreference(result.videoModelPresetId as never)} className={presetId === result.videoModelPresetId ? "bg-blue-600 hover:bg-blue-500" : "border-neutral-700 bg-neutral-900 text-neutral-100"}>
                                        {presetId === result.videoModelPresetId ? "Shared default" : "Set winner"}
                                    </Button>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <AspectRatio ratio={16 / 9}>
                                    <video src={result.videoUrl} controls className="h-full w-full rounded-lg border border-neutral-800 bg-black object-cover" />
                                </AspectRatio>
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4 text-xs text-neutral-400">
                                        <div className="uppercase tracking-[0.24em] text-neutral-500">Effective prompt sent to model</div>
                                        <div className="mt-2 whitespace-pre-wrap leading-6 text-neutral-200">{result.motionPrompt}</div>
                                    </div>
                                    <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4 text-xs text-neutral-400">
                                        <div className="uppercase tracking-[0.24em] text-neutral-500">Underlying source prompt</div>
                                        <div className="mt-2 whitespace-pre-wrap leading-6 text-neutral-200">{result.submittedMotionPrompt ?? "Not available"}</div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>
        </div>
    );
}