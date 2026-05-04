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

const VIDEO_WIDTH = 1080;
const VIDEO_HEIGHT = 1920;
const TOTAL_PREVIEW_SECONDS = 35;

// TikTok safe-area reserves (px @ 1080x1920). Conservative — keeps cards clear of
// status bar, top tabs, caption text, follow button, share rail.
const SAFE_AREA = {
    top: 200,
    bottom: 380,
    right: 130,
} as const;

type TemplatePresetId = "hook" | "social" | "cta";
type CardVariant = "tag" | "statement" | "cta";
const DEFAULT_SEQUENCE_LENGTH = 6;
const DEFAULT_SEQUENCE_PATTERN: readonly TemplatePresetId[] = ["hook", "social", "cta"];

interface OverlayCardSpec {
    badge: string;
    headline: string;
    subline: string;
    spokenText?: string;
    accentColor: string;
    accentMuted: string;
    variant: CardVariant;
    placement: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
}

interface BrandLockupSpec {
    wordmark: string;
    tagline: string;
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
    brandLockup: BrandLockupSpec;
}

interface SequenceBeatSpec {
    presetId: TemplatePresetId;
    sceneId: string;
    spokenText: string;
    durationSeconds: number;
    voiceEnabled: boolean;
}

const BRAND_LOCKUP_DEFAULT: BrandLockupSpec = {
    wordmark: "Leisure Life",
    tagline: "Cruises that fit",
    accentColor: "#F2C450",
    placement: { x: 70, y: 138, width: 420, height: 50 },
};

const TEMPLATE_PRESETS: readonly TemplatePreset[] = [
    {
        id: "hook",
        label: "Hook opener",
        description: "One tag at top, image owns the frame. First-beat punch.",
        overlayCards: [
            {
                badge: "OPENING",
                headline: "Board games\nat sea.",
                subline: "Social, warm, playable from the first frame.",
                spokenText: "Board games at sea.",
                accentColor: "#F2C450",
                accentMuted: "#8A6E2A",
                variant: "tag",
                placement: { x: 70, y: 220, width: 940, height: 220 },
            },
        ],
        brandLockup: { ...BRAND_LOCKUP_DEFAULT, accentColor: "#F2C450" },
    },
    {
        id: "social",
        label: "Social proof",
        description: "Tag hook + statement payoff. The two-card workhorse.",
        overlayCards: [
            {
                badge: "GROUP ENERGY",
                headline: "People first.\nGames second.",
                subline: "The right crowd makes the whole deck feel alive.",
                spokenText: "People first. Games second.",
                accentColor: "#8AD1C2",
                accentMuted: "#3F6E66",
                variant: "tag",
                placement: { x: 70, y: 220, width: 940, height: 200 },
            },
            {
                badge: "PROOF",
                headline: "This is what travel\nlooks like now.",
                subline: "A quieter, better kind of cruise social life.",
                spokenText: "This is what travel looks like now.",
                accentColor: "#8AD1C2",
                accentMuted: "#3F6E66",
                variant: "statement",
                placement: { x: 70, y: 1180, width: 940, height: 320 },
            },
        ],
        brandLockup: { ...BRAND_LOCKUP_DEFAULT, accentColor: "#8AD1C2" },
    },
    {
        id: "cta",
        label: "CTA close",
        description: "Statement + pill button. The closer.",
        overlayCards: [
            {
                badge: "BOOK NOW",
                headline: "Your next game night\nhas an ocean view.",
                subline: "Ship truth. Table energy. Clear CTA.",
                spokenText: "Your next game night has an ocean view.",
                accentColor: "#F39A5B",
                accentMuted: "#7A4A2C",
                variant: "statement",
                placement: { x: 70, y: 1100, width: 940, height: 320 },
            },
            {
                badge: "RESERVE",
                headline: "Reserve your seat",
                subline: "",
                spokenText: "Reserve your seat.",
                accentColor: "#F39A5B",
                accentMuted: "#7A4A2C",
                variant: "cta",
                placement: { x: 140, y: 1480, width: 800, height: 110 },
            },
        ],
        brandLockup: { ...BRAND_LOCKUP_DEFAULT, accentColor: "#F39A5B" },
    },
];

function getSceneIdFromAssetId(assetId: string): string | null {
    const match = assetId.match(/^img_scene_(.+?)(?:_\d+)?$/);
    return match?.[1] ?? null;
}

function getSceneImageSceneId(asset: AssetRecord): string | null {
    if (Array.isArray(asset.tags)) {
        const sceneTag = asset.tags.find((tag) => tag !== "scene" && tag !== "scene_image");
        if (sceneTag) return sceneTag;
    }
    return getSceneIdFromAssetId(asset.assetId);
}

function getStoryboardSceneId(storyboard: Storyboard | null): string | null {
    return storyboard?.shotSequence?.[0]?.sceneId ?? null;
}

function buildBeatSpokenText(preset: TemplatePreset): string {
    const spokenCards = preset.overlayCards.map((card) => {
        if (typeof card.spokenText === "string" && card.spokenText.trim().length > 0) {
            return card.spokenText.trim();
        }

        return [card.headline, card.subline].filter(Boolean).join(" ");
    });

    return spokenCards
        .join(" ")
        .replace(/\bclear cta\b/ig, "")
        .replace(/\s+/g, " ")
        .trim();
}

function getEvenBeatDuration(length: number): number {
    return Number((TOTAL_PREVIEW_SECONDS / Math.max(1, length)).toFixed(1));
}

function buildDefaultSequencePlan(
    sceneIds: readonly string[],
    shotDurations: readonly number[],
    length: number,
): SequenceBeatSpec[] {
    const safeLength = Math.max(3, Math.min(8, length));
    const normalizedSceneIds = sceneIds.filter(Boolean);
    const fallbackSceneId = normalizedSceneIds[0] ?? "";
    const evenDuration = getEvenBeatDuration(safeLength);

    return Array.from({ length: safeLength }, (_, index) => {
        const presetId = DEFAULT_SEQUENCE_PATTERN[index % DEFAULT_SEQUENCE_PATTERN.length];
        const preset = getPresetById(presetId);
        const sceneId = normalizedSceneIds.length > 0
            ? normalizedSceneIds[index % normalizedSceneIds.length]
            : fallbackSceneId;
        const spokenText = buildBeatSpokenText(preset);

        return {
            presetId,
            sceneId,
            spokenText,
            durationSeconds: evenDuration,
            voiceEnabled: index === 0 || index === Math.floor((safeLength - 1) / 2) || index === safeLength - 1,
        };
    });
}

function getPresetById(presetId: TemplatePresetId): TemplatePreset {
    return TEMPLATE_PRESETS.find((entry) => entry.id === presetId) ?? TEMPLATE_PRESETS[0];
}

function withAlpha(hex: string, alpha: number): string {
    const trimmed = hex.trim();
    if (!trimmed.startsWith("#")) return trimmed;
    const raw = trimmed.slice(1);
    const expanded = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw.padEnd(6, "0").slice(0, 6);
    const r = parseInt(expanded.slice(0, 2), 16);
    const g = parseInt(expanded.slice(2, 4), 16);
    const b = parseInt(expanded.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

interface PhonePreviewProps {
    backgroundUrl: string;
    overlayCards: OverlayCardSpec[];
    brandLockup: BrandLockupSpec | null;
    showSafeAreas: boolean;
    showGrain: boolean;
}

function CardPreview({ card, scale }: { card: OverlayCardSpec; scale: number }) {
    const accent = card.accentColor;
    if (card.variant === "tag") {
        return (
            <div
                className="absolute flex flex-col overflow-hidden"
                style={{
                    left: `${(card.placement.x / VIDEO_WIDTH) * 100}%`,
                    top: `${(card.placement.y / VIDEO_HEIGHT) * 100}%`,
                    width: `${(card.placement.width / VIDEO_WIDTH) * 100}%`,
                    height: `${(card.placement.height / VIDEO_HEIGHT) * 100}%`,
                    borderRadius: 14 * scale,
                    padding: `${22 * scale}px ${28 * scale}px`,
                    background: "linear-gradient(180deg, rgba(8,10,16,0.62) 0%, rgba(8,10,16,0.40) 100%)",
                    border: `1px solid ${withAlpha(accent, 0.55)}`,
                    color: "#F6F1E5",
                }}
            >
                <div
                    className="absolute"
                    style={{
                        left: 0, top: 0, bottom: 0,
                        width: 4 * scale,
                        background: accent,
                        opacity: 0.95,
                    }}
                />
                <div style={{ fontFamily: "monospace", fontSize: 14 * scale, letterSpacing: "0.18em", color: accent, marginBottom: 10 * scale, fontWeight: 700, textTransform: "uppercase" }}>
                    {card.badge}
                </div>
                <div style={{ fontSize: 34 * scale, lineHeight: 1.02, fontWeight: 800, letterSpacing: "-0.01em", marginBottom: 8 * scale, whiteSpace: "pre-line", color: "rgba(246,241,229,0.96)" }}>
                    {card.headline}
                </div>
                {card.subline ? (
                    <div style={{ fontSize: 18 * scale, lineHeight: 1.22, color: "rgba(246,241,229,0.78)", whiteSpace: "pre-line" }}>
                        {card.subline}
                    </div>
                ) : null}
            </div>
        );
    }

    if (card.variant === "cta") {
        return (
            <div
                className="absolute flex items-center justify-between overflow-hidden"
                style={{
                    left: `${(card.placement.x / VIDEO_WIDTH) * 100}%`,
                    top: `${(card.placement.y / VIDEO_HEIGHT) * 100}%`,
                    width: `${(card.placement.width / VIDEO_WIDTH) * 100}%`,
                    height: `${(card.placement.height / VIDEO_HEIGHT) * 100}%`,
                    borderRadius: 9999,
                    padding: `0 ${28 * scale}px 0 ${32 * scale}px`,
                    background: withAlpha(accent, 0.92),
                    border: `1px solid ${withAlpha(accent, 0.95)}`,
                    color: "#0A0C12",
                }}
            >
                <div className="flex flex-col justify-center">
                    <div style={{ fontFamily: "monospace", fontSize: 16 * scale, letterSpacing: "0.2em", color: "rgba(10,12,18,0.78)", marginBottom: 6 * scale, fontWeight: 700, textTransform: "uppercase" }}>
                        {card.badge}
                    </div>
                    <div style={{ fontSize: 38 * scale, lineHeight: 1.0, fontWeight: 900, letterSpacing: "-0.01em", color: "#0A0C12", whiteSpace: "pre-line" }}>
                        {card.headline}
                    </div>
                </div>
                <div
                    className="flex items-center justify-center"
                    style={{
                        width: 56 * scale,
                        height: 56 * scale,
                        borderRadius: 9999,
                        background: "#0A0C12",
                        color: accent,
                        fontSize: 30 * scale,
                        fontWeight: 900,
                        marginLeft: 18 * scale,
                        flexShrink: 0,
                    }}
                >
                    →
                </div>
            </div>
        );
    }

    // statement
    return (
        <div
            className="absolute flex flex-col justify-end overflow-hidden"
            style={{
                left: `${(card.placement.x / VIDEO_WIDTH) * 100}%`,
                top: `${(card.placement.y / VIDEO_HEIGHT) * 100}%`,
                width: `${(card.placement.width / VIDEO_WIDTH) * 100}%`,
                height: `${(card.placement.height / VIDEO_HEIGHT) * 100}%`,
                borderRadius: 22 * scale,
                padding: `${36 * scale}px ${38 * scale}px`,
                background: "linear-gradient(180deg, rgba(6,8,14,0.78) 0%, rgba(6,8,14,0.62) 100%)",
                border: `1px solid ${withAlpha(accent, 0.45)}`,
                boxShadow: `0 ${22 * scale}px ${52 * scale}px rgba(0,0,0,0.36)`,
                color: "#F6F1E5",
            }}
        >
            <div
                className="absolute"
                style={{
                    left: 0, top: 0, right: 0,
                    height: 6 * scale,
                    background: accent,
                    opacity: 0.95,
                }}
            />
            <div style={{ fontFamily: "monospace", fontSize: 18 * scale, letterSpacing: "0.22em", color: accent, marginBottom: 14 * scale, fontWeight: 700, textTransform: "uppercase" }}>
                {card.badge}
            </div>
            <div style={{ fontSize: 64 * scale, lineHeight: 0.98, fontWeight: 900, letterSpacing: "-0.015em", marginBottom: 16 * scale, whiteSpace: "pre-line" }}>
                {card.headline}
            </div>
            {card.subline ? (
                <div style={{ fontSize: 24 * scale, lineHeight: 1.2, color: "rgba(246,241,229,0.92)", whiteSpace: "pre-line" }}>
                    {card.subline}
                </div>
            ) : null}
        </div>
    );
}

function BrandLockupPreview({ lockup, scale }: { lockup: BrandLockupSpec; scale: number }) {
    return (
        <div
            className="absolute flex items-center"
            style={{
                left: `${(lockup.placement.x / VIDEO_WIDTH) * 100}%`,
                top: `${(lockup.placement.y / VIDEO_HEIGHT) * 100}%`,
                width: `${(lockup.placement.width / VIDEO_WIDTH) * 100}%`,
                height: `${(lockup.placement.height / VIDEO_HEIGHT) * 100}%`,
            }}
        >
            <div style={{ width: 4 * scale, height: 28 * scale, background: lockup.accentColor, marginRight: 12 * scale, borderRadius: 2 }} />
            <div className="flex flex-col">
                <div
                    style={{
                        fontSize: 20 * scale,
                        fontWeight: 800,
                        letterSpacing: "0.02em",
                        color: "rgba(246,241,229,0.96)",
                        textShadow: "0 2px 8px rgba(0,0,0,0.55)",
                        textTransform: "uppercase",
                        lineHeight: 1,
                    }}
                >
                    {lockup.wordmark}
                </div>
                {lockup.tagline ? (
                    <div
                        style={{
                            fontFamily: "monospace",
                            fontSize: 12 * scale,
                            letterSpacing: "0.24em",
                            color: "rgba(246,241,229,0.66)",
                            marginTop: 6 * scale,
                            textTransform: "uppercase",
                            textShadow: "0 1px 4px rgba(0,0,0,0.65)",
                            lineHeight: 1,
                        }}
                    >
                        {lockup.tagline}
                    </div>
                ) : null}
            </div>
        </div>
    );
}

function PhonePreview({ backgroundUrl, overlayCards, brandLockup, showSafeAreas, showGrain }: PhonePreviewProps) {
    // Browser preview width is ~360px. ffmpeg renders at 1080w. Scale factor ≈ 360/1080 = 0.333.
    // We expose this so card rendering uses scaled px values matching their final proportions.
    const scale = 360 / VIDEO_WIDTH;

    return (
        <div className="relative mx-auto w-full max-w-[360px] overflow-hidden rounded-[2rem] border border-slate-700 bg-black shadow-2xl" style={{ aspectRatio: "9 / 16" }}>
            {backgroundUrl ? (
                <>
                    {/* Backdrop: cover-fit, blurred + darkened (matches createContainedStillVerticalClip backdrop) */}
                    <div
                        className="absolute inset-0"
                        style={{
                            backgroundImage: `url(${backgroundUrl})`,
                            backgroundSize: "cover",
                            backgroundPosition: "center",
                            filter: "blur(18px) brightness(0.9) saturate(0.78)",
                            transform: "scale(1.06)",
                        }}
                    />
                    {/* Foreground: contained-fit (no crop), feathered edges via radial mask sim */}
                    <div className="absolute inset-0 flex items-center justify-center">
                        <img
                            src={backgroundUrl}
                            alt="foreground"
                            className="max-h-full max-w-full"
                            style={{
                                maskImage: "linear-gradient(to bottom, transparent 0%, black 4%, black 96%, transparent 100%)",
                                WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 4%, black 96%, transparent 100%)",
                            }}
                        />
                    </div>
                </>
            ) : (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-900 text-sm text-slate-500">
                    Pick a scene to preview the package.
                </div>
            )}

            {showSafeAreas ? (
                <>
                    <div
                        className="pointer-events-none absolute left-0 right-0 top-0 border-b border-dashed border-rose-400/55 bg-rose-400/10"
                        style={{ height: `${(SAFE_AREA.top / VIDEO_HEIGHT) * 100}%` }}
                    />
                    <div
                        className="pointer-events-none absolute bottom-0 left-0 right-0 border-t border-dashed border-rose-400/55 bg-rose-400/10"
                        style={{ height: `${(SAFE_AREA.bottom / VIDEO_HEIGHT) * 100}%` }}
                    />
                    <div
                        className="pointer-events-none absolute right-0 border-l border-dashed border-rose-400/45 bg-rose-400/8"
                        style={{
                            width: `${(SAFE_AREA.right / VIDEO_WIDTH) * 100}%`,
                            top: `${(SAFE_AREA.top / VIDEO_HEIGHT) * 100}%`,
                            bottom: `${(SAFE_AREA.bottom / VIDEO_HEIGHT) * 100}%`,
                        }}
                    />
                </>
            ) : null}

            {brandLockup ? <BrandLockupPreview lockup={brandLockup} scale={scale} /> : null}
            {overlayCards.map((card, i) => (
                <CardPreview key={`${i}-${card.badge}`} card={card} scale={scale} />
            ))}

            {showGrain ? (
                <div
                    className="pointer-events-none absolute inset-0 mix-blend-overlay opacity-30"
                    style={{
                        backgroundImage:
                            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' seed='3'/><feColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.5 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
                    }}
                />
            ) : null}
        </div>
    );
}

export default function BoardGamesAtSeaSandboxPage() {
    const [slug, setSlug] = useState(DEFAULT_SLUG);
    const [brief, setBrief] = useState<CampaignAestheticBrief | null>(null);
    const [manifest, setManifest] = useState<CampaignMediaManifest | null>(null);
    const [loading, setLoading] = useState(false);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [error, setError] = useState("");
    const [wasLoaded, setWasLoaded] = useState(false);
    const [selectedPresetId, setSelectedPresetId] = useState<TemplatePresetId>("social");
    const [selectedSceneId, setSelectedSceneId] = useState<string>("");
    const [previewUrl, setPreviewUrl] = useState("");
    const [overlayCards, setOverlayCards] = useState<OverlayCardSpec[]>(TEMPLATE_PRESETS[1].overlayCards);
    const [brandLockup, setBrandLockup] = useState<BrandLockupSpec>(TEMPLATE_PRESETS[1].brandLockup);
    const [sequenceLength, setSequenceLength] = useState<number>(DEFAULT_SEQUENCE_LENGTH);
    const [sequencePlan, setSequencePlan] = useState<SequenceBeatSpec[]>([]);
    const [showSafeAreas, setShowSafeAreas] = useState(false);
    const [showGrain, setShowGrain] = useState(true);
    const [includeBrandLockup, setIncludeBrandLockup] = useState(true);
    const [applyFilmGrain, setApplyFilmGrain] = useState(true);
    const [grainStrength, setGrainStrength] = useState(6);
    const [durationSeconds, setDurationSeconds] = useState(3);

    const sceneImages = useMemo(() => manifest?.images?.sceneImages ?? [], [manifest]);
    const sceneImageMap = useMemo(() => {
        const map = new Map<string, AssetRecord>();
        for (const asset of sceneImages) {
            const sceneId = getSceneImageSceneId(asset);
            if (sceneId) map.set(sceneId, asset);
        }
        return map;
    }, [sceneImages]);

    const storyboard = useMemo<Storyboard | null>(() => {
        return brief?.productionBible?.storyboards?.find((entry) => entry.deliverableId === KNOWN_STORYBOARD_ID) ?? null;
    }, [brief]);

    const storyboardShotIds = useMemo(() => storyboard?.shotSequence.map((shot) => shot.sceneId) ?? [], [storyboard]);
    const storyboardShotDurations = useMemo(() => storyboard?.shotSequence.map((shot) => shot.durationSeconds) ?? [], [storyboard]);
    const missingSceneIds = useMemo(
        () => storyboardShotIds.filter((sceneId) => !sceneImageMap.has(sceneId)),
        [sceneImageMap, storyboardShotIds],
    );
    const availableSequenceSceneIds = useMemo(
        () => (storyboardShotIds.length > 0 ? storyboardShotIds : Array.from(sceneImageMap.keys())),
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
            if (!briefRes.ok) throw new Error(`Failed to load aesthetic brief: ${briefRes.status}`);
            if (!manifestRes.ok) throw new Error(`Failed to load media manifest: ${manifestRes.status}`);
            const briefJson = await briefRes.json();
            const manifestJson = await manifestRes.json();
            setBrief((briefJson as { brief?: CampaignAestheticBrief })?.brief ?? (briefJson as CampaignAestheticBrief));
            setManifest((manifestJson as { manifest?: CampaignMediaManifest })?.manifest ?? (manifestJson as CampaignMediaManifest));
            setWasLoaded(true);
            setPreviewUrl("");
            setSequencePlan([]);
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
        const preset = getPresetById(presetId);
        setSelectedPresetId(presetId);
        setOverlayCards(preset.overlayCards);
        setBrandLockup(preset.brandLockup);
    };

    const rebuildSequencePlan = () => {
        setSequencePlan(buildDefaultSequencePlan(availableSequenceSceneIds, storyboardShotDurations, sequenceLength));
    };

    const updateOverlayCard = (index: number, updates: Partial<OverlayCardSpec>) => {
        setOverlayCards((current) => current.map((card, cardIndex) => (
            cardIndex === index ? { ...card, ...updates } : card
        )));
    };

    const updateSequenceBeat = (index: number, updates: Partial<SequenceBeatSpec>) => {
        setSequencePlan((current) => current.map((beat, beatIndex) => (
            beatIndex === index ? { ...beat, ...updates } : beat
        )));
    };

    const syncSequenceDurations = () => {
        setSequencePlan((current) => {
            const evenDuration = getEvenBeatDuration(current.length || 1);
            return current.map((beat) => ({
                ...beat,
                durationSeconds: evenDuration,
            }));
        });
    };

    const updatePlacement = (index: number, updates: Partial<OverlayCardSpec["placement"]>) => {
        setOverlayCards((current) => current.map((card, cardIndex) => (
            cardIndex === index
                ? { ...card, placement: { ...card.placement, ...updates } }
                : card
        )));
    };

    const updateBrandLockup = (updates: Partial<BrandLockupSpec>) => {
        setBrandLockup((current) => ({ ...current, ...updates }));
    };

    const generatePreview = async () => {
        if (!selectedSceneAsset?.url) {
            setError("Choose a scene image first.");
            return;
        }
        setPreviewLoading(true);
        setError("");

        try {
            const isSequenceRender = sequencePlan.length > 1;
            const sequenceBeats = isSequenceRender
                ? sequencePlan.map((beat) => {
                    const sceneAsset = sceneImageMap.get(beat.sceneId) ?? null;
                    const preset = getPresetById(beat.presetId);
                    const cards = beat.presetId === selectedPresetId ? overlayCards : preset.overlayCards;

                    return {
                        backgroundImageUrl: sceneAsset?.url ?? "",
                        overlaySpecs: cards,
                        brandLockup: includeBrandLockup ? brandLockup : null,
                        spokenText: beat.spokenText,
                        durationSeconds: beat.durationSeconds,
                        applyFilmGrain,
                        grainStrength,
                    };
                })
                : null;

            const response = await fetch("/api/tests/tiktok-playground/preview", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        ...(sequenceBeats ? { sequenceBeats } : {
                            overlaySpecs: overlayCards,
                            brandLockup: includeBrandLockup ? brandLockup : null,
                            backgroundImageUrl: selectedSceneAsset.url,
                            spokenText: buildBeatSpokenText(getPresetById(selectedPresetId)),
                            themeMusicUrl: manifest?.audio?.themeMusic?.url ?? null,
                            durationSeconds,
                            applyFilmGrain,
                            grainStrength,
                        }),
                        ...(sequenceBeats ? { themeMusicUrl: manifest?.audio?.themeMusic?.url ?? null } : {}),
                    }),
                });
            const result = await response.json();
            if (!response.ok) throw new Error(result?.error || `Preview generation failed (${response.status})`);
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
        if (initialSceneId) setSelectedSceneId(initialSceneId);
    }, [sceneImageMap, selectedSceneId, storyboard]);

    useEffect(() => {
        if (!selectedSceneId && sceneImageMap.size > 0) {
            setSelectedSceneId(sceneImageMap.keys().next().value as string);
        }
    }, [sceneImageMap, selectedSceneId]);

    useEffect(() => {
        if (sequencePlan.length === 0 && availableSequenceSceneIds.length > 0) {
            setSequencePlan(buildDefaultSequencePlan(availableSequenceSceneIds, storyboardShotDurations, sequenceLength));
        }
    }, [availableSequenceSceneIds, sequenceLength, sequencePlan.length, storyboardShotDurations]);

    const backgroundUrl = selectedSceneAsset?.url ?? "";
    const isSequenceRender = sequencePlan.length > 1;

    return (
        <div className="space-y-8 p-6 text-slate-100">
            <header className="space-y-4">
                <div>
                    <h1 className="text-3xl font-semibold">Board Games At Sea — TikTok Template Sandbox</h1>
                    <p className="max-w-4xl text-sm text-slate-400">
                        Phone-shaped preview matches the 1080×1920 final render. Cards use three variants — tag, statement, CTA pill —
                        plus a fixed brand lockup. Toggle safe-area guides to verify nothing collides with TikTok chrome.
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
                <div className="grid gap-6 xl:grid-cols-[1fr_1.05fr]">
                    {/* Phone preview column */}
                    <section className="space-y-6">
                        <div className="rounded border border-slate-700 bg-slate-950/80 p-5">
                            <div className="mb-3 flex items-center gap-2">
                                <Sparkles className="h-5 w-5 text-cyan-400" />
                                <h2 className="text-lg font-semibold text-slate-100">9:16 phone preview</h2>
                            </div>
                            <p className="text-sm text-slate-400">
                                Approximate render of the final TikTok frame. Backdrop is the same scene blurred + dimmed. The contained
                                photo edges are feathered to hide the seam against the backdrop.
                            </p>

                            <div className="mt-5">
                                <PhonePreview
                                    backgroundUrl={backgroundUrl}
                                    overlayCards={overlayCards}
                                    brandLockup={includeBrandLockup ? brandLockup : null}
                                    showSafeAreas={showSafeAreas}
                                    showGrain={showGrain}
                                />
                            </div>

                            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-300">
                                <label className="flex items-center gap-2">
                                    <input type="checkbox" checked={showSafeAreas} onChange={(e) => setShowSafeAreas(e.target.checked)} />
                                    Show safe-area guides
                                </label>
                                <label className="flex items-center gap-2">
                                    <input type="checkbox" checked={showGrain} onChange={(e) => setShowGrain(e.target.checked)} />
                                    Show grain (preview)
                                </label>
                                <label className="flex items-center gap-2">
                                    <input type="checkbox" checked={includeBrandLockup} onChange={(e) => setIncludeBrandLockup(e.target.checked)} />
                                    Include brand lockup
                                </label>
                            </div>

                            <div className="mt-5 flex flex-wrap items-center gap-3">
                                <button
                                    type="button"
                                    onClick={generatePreview}
                                    disabled={previewLoading || !selectedSceneAsset}
                                    className="inline-flex items-center gap-2 rounded bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {previewLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                                    {isSequenceRender ? "Render sequence" : "Render real video"}
                                </button>
                                <button
                                    type="button"
                                    onClick={syncSequenceDurations}
                                    className="inline-flex items-center gap-2 rounded border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-cyan-400 hover:text-cyan-200"
                                >
                                    Sync narration timing
                                </button>
                                <label className="flex items-center gap-2 text-xs text-slate-400">
                                    Duration
                                    <input
                                        type="number"
                                        min={1}
                                        max={15}
                                        step={1}
                                        value={durationSeconds}
                                        onChange={(e) => setDurationSeconds(Math.max(1, Math.min(15, Number(e.target.value) || 3)))}
                                        className="w-16 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100"
                                    />
                                    s
                                </label>
                                <label className="flex items-center gap-2 text-xs text-slate-400">
                                    <input type="checkbox" checked={applyFilmGrain} onChange={(e) => setApplyFilmGrain(e.target.checked)} />
                                    Bake grain
                                </label>
                                <label className="flex items-center gap-2 text-xs text-slate-400">
                                    Strength
                                    <input
                                        type="number"
                                        min={0}
                                        max={20}
                                        step={1}
                                        value={grainStrength}
                                        onChange={(e) => setGrainStrength(Math.max(0, Math.min(20, Number(e.target.value) || 6)))}
                                        className="w-14 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100"
                                        disabled={!applyFilmGrain}
                                    />
                                </label>
                            </div>

                            {previewUrl ? (
                                <div className="mt-5 rounded border border-emerald-500 bg-emerald-950/20 p-4">
                                    <p className="text-sm font-medium text-emerald-100">Rendered video</p>
                                    <div className="mt-3 flex justify-center">
                                        <div className="w-full max-w-[320px] overflow-hidden rounded-[2rem] border border-slate-700 bg-black shadow-2xl aspect-[9/16]">
                                            <video
                                                src={previewUrl}
                                                controls
                                                preload="metadata"
                                                playsInline
                                                className="h-full w-full bg-black object-contain"
                                            />
                                        </div>
                                    </div>
                                </div>
                            ) : null}

                            <div className="mt-6 rounded border border-slate-700 bg-slate-950/90 p-4">
                                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <div className="text-xs uppercase tracking-[0.3em] text-slate-500">Sequence plan</div>
                                        <p className="mt-1 text-sm text-slate-400">
                                            Use the same 3 template archetypes across a longer beat run. The plan is what makes the ad feel like a finished sequence.
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <label className="flex items-center gap-2 text-xs text-slate-400">
                                            Beats
                                            <input
                                                type="number"
                                                min={3}
                                                max={8}
                                                value={sequenceLength}
                                                onChange={(event) => setSequenceLength(Math.max(3, Math.min(8, Number(event.target.value) || DEFAULT_SEQUENCE_LENGTH)))}
                                                className="w-16 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100"
                                            />
                                        </label>
                                        <button
                                            type="button"
                                            onClick={rebuildSequencePlan}
                                            className="rounded border border-slate-700 px-3 py-1 text-xs font-semibold text-slate-200 transition hover:border-cyan-400 hover:text-cyan-200"
                                        >
                                            Rebuild plan
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    {sequencePlan.map((beat, index) => {
                                        const beatPreset = getPresetById(beat.presetId);
                                        const beatScene = beat.sceneId ? sceneImageMap.get(beat.sceneId) : null;
                                        return (
                                            <div key={`beat-${index}`} className="rounded border border-slate-800 bg-slate-900/80 p-3">
                                                <div className="mb-2 flex items-center justify-between gap-3">
                                                    <div className="text-sm font-semibold text-slate-100">Beat {index + 1}</div>
                                                    <span className="rounded-full border border-slate-700 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-slate-400">
                                                        {beat.durationSeconds}s
                                                    </span>
                                                </div>
                                                <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                                                    <label className="block space-y-1">
                                                        <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Preset</span>
                                                        <select
                                                            value={beat.presetId}
                                                            onChange={(event) => updateSequenceBeat(index, { presetId: event.target.value as TemplatePresetId })}
                                                            className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                                                        >
                                                            {TEMPLATE_PRESETS.map((preset) => (
                                                                <option key={preset.id} value={preset.id}>
                                                                    {preset.label}
                                                                </option>
                                                            ))}
                                                        </select>
                                                        <div className="text-[11px] text-slate-500">{beatPreset.description}</div>
                                                    </label>
                                                    <label className="block space-y-1">
                                                        <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Scene</span>
                                                        <select
                                                            value={beat.sceneId}
                                                            onChange={(event) => updateSequenceBeat(index, { sceneId: event.target.value })}
                                                            className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                                                        >
                                                            {sceneImages.map((asset) => {
                                                                const sceneId = getSceneImageSceneId(asset) ?? "unknown";
                                                                return (
                                                                    <option key={asset.assetId} value={sceneId}>
                                                                        {sceneId}
                                                                    </option>
                                                                );
                                                            })}
                                                        </select>
                                                        <div className="text-[11px] text-slate-500 truncate">{beatScene?.assetId ?? "No scene selected"}</div>
                                                    </label>
                                                    <label className="block space-y-1">
                                                        <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Seconds</span>
                                                        <input
                                                            type="number"
                                                            min={2}
                                                            max={8}
                                                            step={1}
                                                            value={beat.durationSeconds}
                                                            onChange={(event) => updateSequenceBeat(index, { durationSeconds: Math.max(2, Math.min(8, Number(event.target.value) || 3)) })}
                                                            className="w-24 rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                                                            />
                                                        </label>
                                                </div>
                                                <label className="mt-3 flex items-center gap-2 text-xs text-slate-400">
                                                    <input
                                                        type="checkbox"
                                                        checked={beat.voiceEnabled}
                                                        onChange={(event) => updateSequenceBeat(index, { voiceEnabled: event.target.checked })}
                                                    />
                                                    Voice on this beat
                                                </label>
                                                <label className="mt-3 block space-y-1">
                                                    <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Spoken text</span>
                                                    <textarea
                                                        value={beat.spokenText}
                                                        onChange={(event) => updateSequenceBeat(index, { spokenText: event.target.value })}
                                                        rows={2}
                                                        className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                                                    />
                                                </label>
                                                <div className="mt-2 text-[11px] text-slate-500">
                                                    This is the line ElevenLabs should speak for the beat.
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
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
                            <p className="mt-2 text-sm text-slate-400">Click a scene to use it in the package preview.</p>
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

                    {/* Editor column */}
                    <aside className="space-y-6">
                        <div className="rounded border border-slate-700 bg-slate-950/80 p-5">
                            <div className="mb-4 flex items-center gap-2">
                                <Settings className="h-5 w-5 text-slate-400" />
                                <h3 className="text-lg font-semibold text-slate-100">Template preset</h3>
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
                                                    {preset.overlayCards.length} card{preset.overlayCards.length === 1 ? "" : "s"}
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
                                <h3 className="text-lg font-semibold text-slate-100">Cards</h3>
                            </div>
                            <div className="space-y-5">
                                {overlayCards.map((card, index) => (
                                    <div key={`card-${index}`} className="rounded border border-slate-800 bg-slate-900/80 p-4">
                                        <div className="mb-3 flex items-center justify-between">
                                            <div className="text-sm font-semibold text-slate-100">Card {index + 1}</div>
                                            <select
                                                value={card.variant}
                                                onChange={(e) => updateOverlayCard(index, { variant: e.target.value as CardVariant })}
                                                className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200"
                                            >
                                                <option value="tag">tag</option>
                                                <option value="statement">statement</option>
                                                <option value="cta">cta pill</option>
                                            </select>
                                        </div>
                                        <div className="space-y-3">
                                            <label className="block space-y-2">
                                                <span className="text-sm font-medium text-slate-300">Badge</span>
                                                <input
                                                    type="text"
                                                    value={card.badge}
                                                    onChange={(e) => updateOverlayCard(index, { badge: e.target.value })}
                                                    className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none"
                                                />
                                            </label>
                                            <label className="block space-y-2">
                                                <span className="text-sm font-medium text-slate-300">Headline</span>
                                                <textarea
                                                    value={card.headline}
                                                    onChange={(e) => updateOverlayCard(index, { headline: e.target.value })}
                                                    rows={2}
                                                    className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none"
                                                />
                                            </label>
                                            <label className="block space-y-2">
                                                <span className="text-sm font-medium text-slate-300">Subline</span>
                                                <textarea
                                                    value={card.subline}
                                                    onChange={(e) => updateOverlayCard(index, { subline: e.target.value })}
                                                    rows={2}
                                                    className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none"
                                                />
                                            </label>
                                            <div className="grid grid-cols-2 gap-3">
                                                <label className="block space-y-2">
                                                    <span className="text-sm font-medium text-slate-300">Accent</span>
                                                    <input
                                                        type="color"
                                                        value={card.accentColor}
                                                        onChange={(e) => updateOverlayCard(index, { accentColor: e.target.value })}
                                                        className="h-10 w-full rounded border border-slate-700 bg-slate-950"
                                                    />
                                                </label>
                                                <label className="block space-y-2">
                                                    <span className="text-sm font-medium text-slate-300">Accent muted</span>
                                                    <input
                                                        type="color"
                                                        value={card.accentMuted}
                                                        onChange={(e) => updateOverlayCard(index, { accentMuted: e.target.value })}
                                                        className="h-10 w-full rounded border border-slate-700 bg-slate-950"
                                                    />
                                                </label>
                                            </div>
                                            <details className="rounded bg-slate-950/40">
                                                <summary className="cursor-pointer px-2 py-2 text-xs uppercase tracking-[0.2em] text-slate-500">Placement</summary>
                                                <div className="grid grid-cols-2 gap-3 p-3 pt-2">
                                                    <label className="block space-y-1">
                                                        <span className="text-xs text-slate-400">X</span>
                                                        <input type="number" value={card.placement.x} onChange={(e) => updatePlacement(index, { x: Number(e.target.value) })} className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100" />
                                                    </label>
                                                    <label className="block space-y-1">
                                                        <span className="text-xs text-slate-400">Y</span>
                                                        <input type="number" value={card.placement.y} onChange={(e) => updatePlacement(index, { y: Number(e.target.value) })} className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100" />
                                                    </label>
                                                    <label className="block space-y-1">
                                                        <span className="text-xs text-slate-400">Width</span>
                                                        <input type="number" value={card.placement.width} onChange={(e) => updatePlacement(index, { width: Number(e.target.value) })} className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100" />
                                                    </label>
                                                    <label className="block space-y-1">
                                                        <span className="text-xs text-slate-400">Height</span>
                                                        <input type="number" value={card.placement.height} onChange={(e) => updatePlacement(index, { height: Number(e.target.value) })} className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100" />
                                                    </label>
                                                </div>
                                            </details>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="rounded border border-slate-700 bg-slate-950/80 p-5">
                            <div className="mb-4 flex items-center gap-2">
                                <Type className="h-5 w-5 text-slate-400" />
                                <h3 className="text-lg font-semibold text-slate-100">Brand lockup</h3>
                            </div>
                            <div className="space-y-3">
                                <label className="block space-y-2">
                                    <span className="text-sm font-medium text-slate-300">Wordmark</span>
                                    <input
                                        type="text"
                                        value={brandLockup.wordmark}
                                        onChange={(e) => updateBrandLockup({ wordmark: e.target.value })}
                                        className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none"
                                    />
                                </label>
                                <label className="block space-y-2">
                                    <span className="text-sm font-medium text-slate-300">Tagline</span>
                                    <input
                                        type="text"
                                        value={brandLockup.tagline}
                                        onChange={(e) => updateBrandLockup({ tagline: e.target.value })}
                                        className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none"
                                    />
                                </label>
                                <label className="block space-y-2">
                                    <span className="text-sm font-medium text-slate-300">Accent</span>
                                    <input
                                        type="color"
                                        value={brandLockup.accentColor}
                                        onChange={(e) => updateBrandLockup({ accentColor: e.target.value })}
                                        className="h-10 w-full rounded border border-slate-700 bg-slate-950"
                                    />
                                </label>
                            </div>
                        </div>

                        {selectedSceneStoryBeat ? (
                            <div className="rounded border border-slate-700 bg-slate-950/80 p-5 text-sm text-slate-300">
                                <div className="text-xs uppercase tracking-[0.3em] text-slate-500">Scene context</div>
                                <div className="mt-2 text-slate-100">{selectedSceneId}</div>
                                <div className="mt-1 text-slate-400">
                                    Shot {selectedSceneStoryBeat.shotNumber} - {selectedSceneStoryBeat.emotionalBeat}
                                </div>
                                <div className="mt-2 text-slate-300">{selectedSceneStoryBeat.narrationSegment}</div>
                            </div>
                        ) : null}
                    </aside>
                </div>
            ) : null}
        </div>
    );
}
