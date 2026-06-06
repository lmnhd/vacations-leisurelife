"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AssetRecord } from "@/lib/campaigns/schema";

interface ThemeMusicTrackPayload {
    assetId: string;
    url: string;
    generator: string;
    promptUsed: string;
    tags: string[];
    durationSeconds?: number;
    fileSizeBytes: number;
    mimeType: string;
    createdAt: string;
}

interface ThemeMusicResponse {
    currentTrack: AssetRecord | null;
    selectedLibraryTrackAssetId: string | null;
    libraryTracks: ThemeMusicTrackPayload[];
}

interface ThemeMusicPickerProps {
    slug: string;
    disabled?: boolean;
    compact?: boolean;
    onManifestUpdated?: (manifest: unknown) => void;
    onTrackChanged?: (track: AssetRecord) => void;
}

function trackLabel(track: ThemeMusicTrackPayload): string {
    const cleanTags = track.tags
        .filter((tag) => !tag.startsWith("source_track:"))
        .filter((tag) => !["audio", "music", "theme", "default"].includes(tag))
        .slice(0, 4);
    return cleanTags.length ? cleanTags.join(" / ") : track.assetId;
}

function trackDescription(track: ThemeMusicTrackPayload): string {
    const duration = track.durationSeconds ? `${Math.round(track.durationSeconds)}s` : "duration n/a";
    return `${duration} - ${track.generator} - ${new Date(track.createdAt).toLocaleDateString()}`;
}

export function ThemeMusicPicker({ slug, disabled = false, compact = false, onManifestUpdated, onTrackChanged }: ThemeMusicPickerProps) {
    const [tracks, setTracks] = useState<ThemeMusicTrackPayload[]>([]);
    const [currentTrack, setCurrentTrack] = useState<AssetRecord | null>(null);
    const [selectedTrackId, setSelectedTrackId] = useState("");
    const [status, setStatus] = useState<"idle" | "loading" | "saving" | "saved" | "error">("idle");
    const [error, setError] = useState("");

    const trimmedSlug = slug.trim();

    const loadTracks = useCallback(async () => {
        if (!trimmedSlug) {
            setTracks([]);
            setCurrentTrack(null);
            setSelectedTrackId("");
            return;
        }

        setStatus("loading");
        setError("");
        try {
            const response = await fetch(`/api/groups/campaign/${trimmedSlug}/media/theme-music`, { cache: "no-store" });
            const data = await response.json() as ThemeMusicResponse | { error?: string };
            if (!response.ok) {
                throw new Error("error" in data && data.error ? data.error : `Theme music load failed (${response.status})`);
            }

            const payload = data as ThemeMusicResponse;
            setTracks(payload.libraryTracks);
            setCurrentTrack(payload.currentTrack);
            setSelectedTrackId(payload.selectedLibraryTrackAssetId ?? "");
            setStatus("idle");
        } catch (nextError) {
            setStatus("error");
            setError(nextError instanceof Error ? nextError.message : "Theme music load failed");
        }
    }, [trimmedSlug]);

    useEffect(() => {
        void loadTracks();
    }, [loadTracks]);

    const selectedTrack = useMemo(
        () => tracks.find((track) => track.assetId === selectedTrackId) ?? null,
        [selectedTrackId, tracks],
    );

    async function saveSelection(): Promise<void> {
        if (!trimmedSlug || !selectedTrackId) return;

        setStatus("saving");
        setError("");
        try {
            const response = await fetch(`/api/groups/campaign/${trimmedSlug}/media/theme-music`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ trackAssetId: selectedTrackId }),
            });
            const data = await response.json() as ThemeMusicResponse & { currentTrack?: AssetRecord; manifest?: unknown; error?: string };
            if (!response.ok || !data.currentTrack) {
                throw new Error(data.error ?? `Theme music save failed (${response.status})`);
            }

            setCurrentTrack(data.currentTrack);
            onTrackChanged?.(data.currentTrack);
            if (data.manifest) onManifestUpdated?.(data.manifest);
            setStatus("saved");
        } catch (nextError) {
            setStatus("error");
            setError(nextError instanceof Error ? nextError.message : "Theme music save failed");
        }
    }

    const currentSource = currentTrack
        ? tracks.find((track) => track.url === currentTrack.url || currentTrack.tags.includes(`source_track:${track.assetId}`))
        : null;

    return (
        <div className={`rounded-lg border border-white/10 bg-slate-950/40 ${compact ? "p-3" : "p-4"}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <div className="text-[10px] uppercase tracking-widest text-slate-500">Campaign Music Track</div>
                    <div className="mt-1 text-sm text-slate-200">
                        {currentSource ? trackLabel(currentSource) : currentTrack ? "Custom/generated campaign track" : "No campaign track selected"}
                    </div>
                </div>
                {status === "loading" ? <span className="text-xs text-slate-500">loading...</span> : null}
                {status === "saved" ? <span className="text-xs text-emerald-400">saved</span> : null}
            </div>

            {currentTrack?.url ? (
                <audio controls src={currentTrack.url} className="mt-3 w-full" />
            ) : null}

            <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                <select
                    value={selectedTrackId}
                    onChange={(event) => {
                        setSelectedTrackId(event.target.value);
                        setStatus("idle");
                    }}
                    disabled={disabled || status === "loading" || status === "saving" || tracks.length === 0}
                    className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:border-cyan-500/40 focus:outline-none disabled:opacity-40"
                >
                    <option value="">Choose a library track...</option>
                    {tracks.map((track) => (
                        <option key={track.assetId} value={track.assetId}>
                            {trackLabel(track)} ({track.assetId})
                        </option>
                    ))}
                </select>
                <button
                    type="button"
                    onClick={() => void saveSelection()}
                    disabled={disabled || status === "saving" || !selectedTrackId}
                    className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/20 disabled:pointer-events-none disabled:opacity-40"
                >
                    {status === "saving" ? "Saving..." : "Use Track"}
                </button>
            </div>

            {selectedTrack ? (
                <div className="mt-2 text-[11px] text-slate-500">
                    {trackDescription(selectedTrack)}
                </div>
            ) : null}

            {error ? (
                <div className="mt-3 rounded border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                    {error}
                </div>
            ) : null}
        </div>
    );
}
