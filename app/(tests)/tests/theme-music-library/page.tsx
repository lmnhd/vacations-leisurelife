'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Music, Save, Upload } from 'lucide-react';

export default function ThemeMusicLibraryTestPage() {
    const [tracks, setTracks] = useState<Array<{
        assetId: string;
        url: string;
        tags: string[];
        promptUsed: string;
        durationSeconds?: number;
        createdAt: string;
        fileSizeBytes: number;
    }>>([]);
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [defaultTagText, setDefaultTagText] = useState('ambient, cinematic, nostalgic, instrumental');
    const [defaultPromptText, setDefaultPromptText] = useState('shared default library track');
    const [isLoadingTracks, setIsLoadingTracks] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [savingAssetId, setSavingAssetId] = useState('');
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [editorState, setEditorState] = useState<Record<string, { tags: string; promptUsed: string; durationSeconds: string }>>({});

    async function loadTracks(): Promise<void> {
        setIsLoadingTracks(true);
        setError('');
        try {
            const response = await fetch('/api/groups/theme-music-library');
            const data = await response.json() as {
                tracks?: Array<{
                    assetId: string;
                    url: string;
                    tags: string[];
                    promptUsed: string;
                    durationSeconds?: number;
                    createdAt: string;
                    fileSizeBytes: number;
                }>;
                error?: string;
            };

            if (!response.ok) {
                throw new Error(data.error ?? 'Failed to load tracks');
            }

            const nextTracks = data.tracks ?? [];
            setTracks(nextTracks);
            setEditorState(Object.fromEntries(nextTracks.map((track) => [
                track.assetId,
                {
                    tags: track.tags.join(', '),
                    promptUsed: track.promptUsed,
                    durationSeconds: track.durationSeconds?.toString() ?? '',
                },
            ])));
        } catch (loadError: unknown) {
            setError(loadError instanceof Error ? loadError.message : 'Failed to load tracks');
        } finally {
            setIsLoadingTracks(false);
        }
    }

    useEffect(() => {
        void loadTracks();
    }, []);

    const selectedFileSummary = useMemo(() => {
        return selectedFiles.map((file) => `${file.name} (${Math.round(file.size / 1024)} KB)`);
    }, [selectedFiles]);

    async function handleBulkUpload(): Promise<void> {
        if (selectedFiles.length === 0) {
            setError('Select one or more audio files to upload.');
            return;
        }

        setIsUploading(true);
        setError('');
        setSuccessMessage('');

        try {
            const formData = new FormData();
            selectedFiles.forEach((file) => {
                formData.append('files', file);
            });
            formData.append('tags', defaultTagText);
            formData.append('promptUsed', defaultPromptText);

            const response = await fetch('/api/groups/theme-music-library', {
                method: 'POST',
                body: formData,
            });

            const data = await response.json() as { count?: number; error?: string };
            if (!response.ok) {
                throw new Error(data.error ?? 'Bulk upload failed');
            }

            setSelectedFiles([]);
            setSuccessMessage(`Uploaded ${data.count ?? selectedFiles.length} track(s) to the shared library.`);
            await loadTracks();
        } catch (uploadError: unknown) {
            setError(uploadError instanceof Error ? uploadError.message : 'Bulk upload failed');
        } finally {
            setIsUploading(false);
        }
    }

    async function handleSaveTrack(assetId: string): Promise<void> {
        const draft = editorState[assetId];
        if (!draft) {
            return;
        }

        setSavingAssetId(assetId);
        setError('');
        setSuccessMessage('');

        try {
            const response = await fetch(`/api/groups/theme-music-library/${assetId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tags: draft.tags.split(',').map((tagValue) => tagValue.trim()).filter(Boolean),
                    promptUsed: draft.promptUsed,
                    ...(draft.durationSeconds.trim().length > 0 ? { durationSeconds: Number(draft.durationSeconds) } : {}),
                }),
            });

            const data = await response.json() as { error?: string };
            if (!response.ok) {
                throw new Error(data.error ?? 'Track update failed');
            }

            setSuccessMessage(`Updated ${assetId}.`);
            await loadTracks();
        } catch (saveError: unknown) {
            setError(saveError instanceof Error ? saveError.message : 'Track update failed');
        } finally {
            setSavingAssetId('');
        }
    }

    return (
        <div className="min-h-screen bg-slate-950 p-6 text-white">
            <div className="mx-auto max-w-6xl space-y-6">
                <div className="rounded-xl border border-white/10 bg-slate-900/50 p-6">
                    <div className="flex items-center gap-3">
                        <Music className="h-6 w-6 text-cyan-400" />
                        <div>
                            <h1 className="text-xl font-semibold text-cyan-400">Shared Theme Music Library</h1>
                            <p className="text-sm text-slate-400">Bulk upload premade tracks, edit selection tags, and prepare the default theme music pool for AI agent use.</p>
                        </div>
                    </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-slate-900/50 p-6 space-y-4">
                    <div>
                        <label className="block text-xs uppercase tracking-widest text-slate-500 mb-2">Bulk Upload Audio Files</label>
                        <input
                            type="file"
                            accept="audio/*"
                            multiple
                            onChange={(event) => setSelectedFiles(Array.from(event.target.files ?? []))}
                            className="block w-full text-sm text-slate-300"
                        />
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                        <div>
                            <label className="block text-xs uppercase tracking-widest text-slate-500 mb-2">Default Tags</label>
                            <input
                                type="text"
                                value={defaultTagText}
                                onChange={(event) => setDefaultTagText(event.target.value)}
                                className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-cyan-500/40 focus:outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-xs uppercase tracking-widest text-slate-500 mb-2">Default Prompt / Notes</label>
                            <input
                                type="text"
                                value={defaultPromptText}
                                onChange={(event) => setDefaultPromptText(event.target.value)}
                                className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-cyan-500/40 focus:outline-none"
                            />
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={handleBulkUpload}
                        disabled={isUploading || selectedFiles.length === 0}
                        className="inline-flex items-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-500/15 px-4 py-2 text-sm font-medium text-cyan-300 hover:bg-cyan-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                        {isUploading ? 'Uploading...' : 'Bulk Upload Tracks'}
                    </button>

                    {selectedFileSummary.length > 0 ? (
                        <div className="rounded-lg border border-white/10 bg-slate-950/40 p-3 text-xs text-slate-400">
                            {selectedFileSummary.map((summaryLine) => (
                                <div key={summaryLine}>{summaryLine}</div>
                            ))}
                        </div>
                    ) : null}
                </div>

                {error ? <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">{error}</div> : null}
                {successMessage ? <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-300">{successMessage}</div> : null}

                <div className="rounded-xl border border-white/10 bg-slate-900/50 p-6 space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-lg font-semibold text-slate-200">Library Tracks</h2>
                            <p className="text-sm text-slate-400">These tracks are ranked against campaign brief signals when `default` theme music is selected.</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => void loadTracks()}
                            disabled={isLoadingTracks}
                            className="rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-300 hover:bg-white/5 disabled:opacity-50"
                        >
                            {isLoadingTracks ? 'Loading...' : 'Refresh'}
                        </button>
                    </div>

                    <div className="space-y-4">
                        {tracks.map((track) => {
                            const draft = editorState[track.assetId] ?? { tags: '', promptUsed: '', durationSeconds: '' };
                            const isSaving = savingAssetId === track.assetId;
                            return (
                                <div key={track.assetId} className="rounded-xl border border-white/10 bg-slate-950/40 p-4 space-y-3">
                                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                        <div>
                                            <div className="text-sm font-medium text-slate-200">{track.assetId}</div>
                                            <div className="text-xs text-slate-500">{new Date(track.createdAt).toLocaleString()} · {Math.round(track.fileSizeBytes / 1024)} KB</div>
                                        </div>
                                        <audio controls src={track.url} className="w-full md:max-w-md" />
                                    </div>

                                    <div className="grid gap-3 md:grid-cols-3">
                                        <div className="md:col-span-2">
                                            <label className="block text-xs uppercase tracking-widest text-slate-500 mb-2">Tags</label>
                                            <input
                                                type="text"
                                                value={draft.tags}
                                                onChange={(event) => setEditorState((currentState) => ({
                                                    ...currentState,
                                                    [track.assetId]: {
                                                        ...draft,
                                                        tags: event.target.value,
                                                    },
                                                }))}
                                                className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-cyan-500/40 focus:outline-none"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs uppercase tracking-widest text-slate-500 mb-2">Duration Seconds</label>
                                            <input
                                                type="number"
                                                min={1}
                                                value={draft.durationSeconds}
                                                onChange={(event) => setEditorState((currentState) => ({
                                                    ...currentState,
                                                    [track.assetId]: {
                                                        ...draft,
                                                        durationSeconds: event.target.value,
                                                    },
                                                }))}
                                                className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-cyan-500/40 focus:outline-none"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-xs uppercase tracking-widest text-slate-500 mb-2">Prompt / Notes</label>
                                        <textarea
                                            value={draft.promptUsed}
                                            onChange={(event) => setEditorState((currentState) => ({
                                                ...currentState,
                                                [track.assetId]: {
                                                    ...draft,
                                                    promptUsed: event.target.value,
                                                },
                                            }))}
                                            rows={3}
                                            className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-cyan-500/40 focus:outline-none"
                                        />
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => void handleSaveTrack(track.assetId)}
                                        disabled={isSaving}
                                        className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/15 px-4 py-2 text-sm font-medium text-emerald-300 hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                        {isSaving ? 'Saving...' : 'Save Tags'}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
