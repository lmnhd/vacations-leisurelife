"use client";

import { useState, useEffect, useMemo } from "react";
import type { CampaignAestheticBrief, Storyboard } from "@/lib/campaigns/schema";
import { Loader2, Play, Settings, Palette, Type, Move } from "lucide-react";

const DEFAULT_SLUG = "board-games-at-sea";
const SAMPLE_IMAGE_URL = "https://images.unsplash.com/photo-1552820728-8b83bb6b773f?w=400&h=600&fit=crop"; // Sample vertical image

interface TikTokFormatSpec {
    formatId: string;
    targetDurationSeconds: number;
    shotCount: number;
    renderMode: 'static_package' | 'motion_clip';
    distributionTag: 'organic' | 'paid';
}

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

interface PlaygroundState {
    selectedFormat: string;
    customCard: OverlayCardSpec;
    previewImage: string;
    isGenerating: boolean;
    generatedSnippet?: string;
}

export default function TikTokStylePlaygroundPage() {
    const [slug, setSlug] = useState(DEFAULT_SLUG);
    const [brief, setBrief] = useState<CampaignAestheticBrief | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const [playground, setPlayground] = useState<PlaygroundState>({
        selectedFormat: "organic_seed",
        customCard: {
            badge: "EXCLUSIVE",
            headline: "Board Games At Sea",
            subline: "Adventure awaits on the waves",
            accentColor: "#F2C450",
            placement: {
                x: 50,
                y: 200,
                width: 400,
                height: 300,
            },
        },
        previewImage: SAMPLE_IMAGE_URL,
        isGenerating: false,
    });

    const availableFormats: TikTokFormatSpec[] = [
        {
            formatId: "organic_seed",
            targetDurationSeconds: 15,
            shotCount: 3,
            renderMode: "static_package",
            distributionTag: "organic",
        },
        {
            formatId: "paid_variant",
            targetDurationSeconds: 30,
            shotCount: 5,
            renderMode: "static_package",
            distributionTag: "paid",
        },
    ];

    const selectedFormat = availableFormats.find(f => f.formatId === playground.selectedFormat) || availableFormats[0];

    const loadCampaignBrief = async () => {
        setLoading(true);
        setError("");

        try {
            const response = await fetch(`/api/groups/campaign/${slug}/media/aesthetic`, { cache: "no-store" });
            if (!response.ok) {
                throw new Error(`Failed to load campaign brief: ${response.status}`);
            }

            const data = await response.json();
            setBrief((data as { brief?: CampaignAestheticBrief })?.brief ?? (data as CampaignAestheticBrief));
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : String(err));
            setBrief(null);
        } finally {
            setLoading(false);
        }
    };

    const generateOverlayPreview = async () => {
        setPlayground(prev => ({ ...prev, isGenerating: true }));

        try {
            const response = await fetch("/api/tests/tiktok-playground/preview", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    overlaySpec: playground.customCard,
                    backgroundImageUrl: playground.previewImage,
                }),
            });

            if (!response.ok) {
                throw new Error(`Preview generation failed: ${response.status}`);
            }

            const result = await response.json();
            setPlayground(prev => ({
                ...prev,
                generatedSnippet: result.previewUrl,
                isGenerating: false,
            }));
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : String(err));
            setPlayground(prev => ({ ...prev, isGenerating: false }));
        }
    };

    const updateCustomCard = (updates: Partial<OverlayCardSpec>) => {
        setPlayground(prev => ({
            ...prev,
            customCard: { ...prev.customCard, ...updates },
        }));
    };

    const updatePlacement = (placementUpdates: Partial<OverlayCardSpec['placement']>) => {
        setPlayground(prev => ({
            ...prev,
            customCard: {
                ...prev.customCard,
                placement: { ...prev.customCard.placement, ...placementUpdates },
            },
        }));
    };

    useEffect(() => {
        void loadCampaignBrief();
    }, []);

    return (
        <div className="space-y-8 p-6 text-slate-100">
            <header className="space-y-4">
                <div>
                    <h1 className="text-3xl font-semibold">TikTok Style Playground</h1>
                    <p className="max-w-3xl text-sm text-slate-400">
                        Experiment with TikTok video styles, overlay cards, and text positioning.
                        Generate preview snippets without creating full videos.
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
                        onClick={loadCampaignBrief}
                        disabled={loading}
                        className="inline-flex items-center justify-center rounded bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {loading ? "Loading…" : "Reload campaign"}
                    </button>
                </div>
            </header>

            {error && (
                <div className="rounded border border-red-500 bg-red-950/50 p-4 text-sm text-red-200">
                    <strong>Error:</strong> {error}
                </div>
            )}

            <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
                {/* Preview Panel */}
                <div className="space-y-6">
                    <div className="rounded border border-slate-700 bg-slate-950/80 p-5">
                        <div className="mb-4 flex items-center justify-between">
                            <h2 className="text-lg font-semibold text-slate-100">Live Preview</h2>
                            <button
                                onClick={generateOverlayPreview}
                                disabled={playground.isGenerating}
                                className="inline-flex items-center gap-2 rounded bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {playground.isGenerating ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Play className="h-4 w-4" />
                                )}
                                Generate Preview
                            </button>
                        </div>

                        <div className="relative mx-auto max-w-sm overflow-hidden rounded-lg border border-slate-600 bg-slate-900">
                            <img
                                src={playground.previewImage}
                                alt="Preview background"
                                className="h-auto w-full"
                            />

                            {/* Overlay Card Preview */}
                            <div
                                className="absolute rounded-lg border border-yellow-400/50 bg-slate-900/80 p-6 shadow-2xl"
                                style={{
                                    left: `${playground.customCard.placement.x}px`,
                                    top: `${playground.customCard.placement.y}px`,
                                    width: `${playground.customCard.placement.width}px`,
                                    minHeight: `${playground.customCard.placement.height}px`,
                                    borderColor: playground.customCard.accentColor,
                                    boxShadow: `0 16px 38px rgba(0, 0, 0, 0.28), 0 0 0 2px ${playground.customCard.accentColor}40`,
                                }}
                            >
                                <div
                                    className="absolute left-0 top-0 h-2 w-full rounded-t-lg opacity-95"
                                    style={{ backgroundColor: playground.customCard.accentColor }}
                                />
                                <div
                                    className="mb-3 text-sm font-mono uppercase tracking-wider"
                                    style={{ color: playground.customCard.accentColor }}
                                >
                                    {playground.customCard.badge}
                                </div>
                                <div className="mb-4 text-4xl font-black leading-tight text-slate-100">
                                    {playground.customCard.headline}
                                </div>
                                <div className="text-sm text-slate-300">
                                    {playground.customCard.subline}
                                </div>
                            </div>
                        </div>

                        {playground.generatedSnippet && (
                            <div className="mt-4 rounded border border-emerald-500 bg-emerald-950/20 p-4">
                                <p className="text-sm text-emerald-100">
                                    <strong>Generated Snippet:</strong>
                                </p>
                                <video
                                    src={playground.generatedSnippet}
                                    controls
                                    className="mt-2 h-32 w-full rounded border border-slate-600"
                                />
                            </div>
                        )}
                    </div>
                </div>

                {/* Controls Panel */}
                <div className="space-y-6">
                    {/* Format Selection */}
                    <div className="rounded border border-slate-700 bg-slate-950/80 p-5">
                        <div className="mb-4 flex items-center gap-2">
                            <Settings className="h-5 w-5 text-slate-400" />
                            <h3 className="text-lg font-semibold text-slate-100">TikTok Format</h3>
                        </div>

                        <div className="space-y-3">
                            {availableFormats.map((format) => (
                                <label key={format.formatId} className="flex items-center gap-3">
                                    <input
                                        type="radio"
                                        name="format"
                                        value={format.formatId}
                                        checked={playground.selectedFormat === format.formatId}
                                        onChange={(e) => setPlayground(prev => ({ ...prev, selectedFormat: e.target.value }))}
                                        className="text-cyan-500"
                                    />
                                    <div className="text-sm">
                                        <div className="font-medium text-slate-100 capitalize">
                                            {format.formatId.replace('_', ' ')}
                                        </div>
                                        <div className="text-slate-400">
                                            {format.shotCount} shots • {format.targetDurationSeconds}s • {format.distributionTag}
                                        </div>
                                    </div>
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* Overlay Customization */}
                    <div className="rounded border border-slate-700 bg-slate-950/80 p-5">
                        <div className="mb-4 flex items-center gap-2">
                            <Palette className="h-5 w-5 text-slate-400" />
                            <h3 className="text-lg font-semibold text-slate-100">Overlay Card</h3>
                        </div>

                        <div className="space-y-4">
                            <label className="block space-y-2">
                                <span className="text-sm font-medium text-slate-300">Badge</span>
                                <input
                                    type="text"
                                    value={playground.customCard.badge}
                                    onChange={(e) => updateCustomCard({ badge: e.target.value })}
                                    className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none focus:border-cyan-500"
                                    maxLength={18}
                                />
                            </label>

                            <label className="block space-y-2">
                                <span className="text-sm font-medium text-slate-300">Headline</span>
                                <input
                                    type="text"
                                    value={playground.customCard.headline}
                                    onChange={(e) => updateCustomCard({ headline: e.target.value })}
                                    className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none focus:border-cyan-500"
                                    maxLength={46}
                                />
                            </label>

                            <label className="block space-y-2">
                                <span className="text-sm font-medium text-slate-300">Subline</span>
                                <input
                                    type="text"
                                    value={playground.customCard.subline}
                                    onChange={(e) => updateCustomCard({ subline: e.target.value })}
                                    className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none focus:border-cyan-500"
                                />
                            </label>

                            <label className="block space-y-2">
                                <span className="text-sm font-medium text-slate-300">Accent Color</span>
                                <input
                                    type="color"
                                    value={playground.customCard.accentColor}
                                    onChange={(e) => updateCustomCard({ accentColor: e.target.value })}
                                    className="h-10 w-full rounded border border-slate-700 bg-slate-950"
                                />
                            </label>
                        </div>
                    </div>

                    {/* Positioning Controls */}
                    <div className="rounded border border-slate-700 bg-slate-950/80 p-5">
                        <div className="mb-4 flex items-center gap-2">
                            <Move className="h-5 w-5 text-slate-400" />
                            <h3 className="text-lg font-semibold text-slate-100">Positioning</h3>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <label className="block space-y-2">
                                <span className="text-sm font-medium text-slate-300">X Position</span>
                                <input
                                    type="number"
                                    value={playground.customCard.placement.x}
                                    onChange={(e) => updatePlacement({ x: Number(e.target.value) })}
                                    className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none focus:border-cyan-500"
                                />
                            </label>

                            <label className="block space-y-2">
                                <span className="text-sm font-medium text-slate-300">Y Position</span>
                                <input
                                    type="number"
                                    value={playground.customCard.placement.y}
                                    onChange={(e) => updatePlacement({ y: Number(e.target.value) })}
                                    className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none focus:border-cyan-500"
                                />
                            </label>

                            <label className="block space-y-2">
                                <span className="text-sm font-medium text-slate-300">Width</span>
                                <input
                                    type="number"
                                    value={playground.customCard.placement.width}
                                    onChange={(e) => updatePlacement({ width: Number(e.target.value) })}
                                    className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none focus:border-cyan-500"
                                />
                            </label>

                            <label className="block space-y-2">
                                <span className="text-sm font-medium text-slate-300">Height</span>
                                <input
                                    type="number"
                                    value={playground.customCard.placement.height}
                                    onChange={(e) => updatePlacement({ height: Number(e.target.value) })}
                                    className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none focus:border-cyan-500"
                                />
                            </label>
                        </div>
                    </div>

                    {/* Background Image */}
                    <div className="rounded border border-slate-700 bg-slate-950/80 p-5">
                        <div className="mb-4 flex items-center gap-2">
                            <Type className="h-5 w-5 text-slate-400" />
                            <h3 className="text-lg font-semibold text-slate-100">Background Image</h3>
                        </div>

                        <label className="block space-y-2">
                            <span className="text-sm font-medium text-slate-300">Image URL</span>
                            <input
                                type="url"
                                value={playground.previewImage}
                                onChange={(e) => setPlayground(prev => ({ ...prev, previewImage: e.target.value }))}
                                className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none focus:border-cyan-500"
                                placeholder="https://example.com/image.jpg"
                            />
                        </label>
                    </div>
                </div>
            </div>
        </div>
    );
}