"use client";

import { useState } from "react";
import { Loader2, X, Wand2, PenLine } from "lucide-react";
import type { AssetType } from "@/lib/campaigns/schema";

const VIDEO_ASSET_TYPES = new Set<AssetType>([
    'tiktok_seed_video', 'hero_explainer_video', 'threshold_video',
    'countdown_video', 'broll_clip',
]);

export function ReviseRegenerateModal({
    slug,
    assetId,
    assetType,
    currentPrompt,
    onComplete,
    onClose,
}: {
    slug: string;
    assetId: string;
    assetType: AssetType;
    currentPrompt: string;
    onComplete: () => void;
    onClose: () => void;
}) {
    const [applyMode, setApplyMode] = useState<'append_note' | 'manual_override'>('append_note');
    const [revisionNote, setRevisionNote] = useState('');
    const [revisedPrompt, setRevisedPrompt] = useState(currentPrompt);
    const [isRegenerating, setIsRegenerating] = useState(false);
    const [error, setError] = useState('');

    const isVideo = VIDEO_ASSET_TYPES.has(assetType);

    const handleRegenerate = async () => {
        if (applyMode === 'append_note' && !revisionNote.trim()) {
            setError('Enter a revision note first.');
            return;
        }
        if (applyMode === 'manual_override' && !revisedPrompt.trim()) {
            setError('Prompt cannot be empty.');
            return;
        }
        setIsRegenerating(true);
        setError('');
        try {
            const res = await fetch(`/api/groups/campaign/${slug}/media/regenerate-with-revision`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    assetId,
                    applyMode,
                    revisionNote: applyMode === 'append_note' ? revisionNote.trim() : undefined,
                    revisedPrompt: applyMode === 'manual_override' ? revisedPrompt.trim() : undefined,
                }),
            });
            const data = await res.json() as { error?: string };
            if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
            onComplete();
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
            setIsRegenerating(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-zinc-900 border border-zinc-700 rounded-xl w-full max-w-xl space-y-4 p-5 shadow-2xl">

                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h2 className="font-semibold text-zinc-100 flex items-center gap-2">
                            <Wand2 className="w-4 h-4 text-amber-400" />
                            Revise &amp; Regenerate
                        </h2>
                        <p className="text-xs text-zinc-500 mt-0.5 font-mono truncate max-w-sm">{assetId}</p>
                        {isVideo && (
                            <p className="text-xs text-amber-500 mt-1">
                                ⚠ Video regeneration may take several minutes.
                            </p>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        disabled={isRegenerating}
                        className="text-zinc-500 hover:text-zinc-300 disabled:opacity-40 shrink-0"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Mode selector */}
                <div className="space-y-2">
                    <label className="flex items-start gap-3 bg-zinc-800/60 border border-zinc-700 rounded-lg p-3 cursor-pointer hover:border-zinc-500 has-[:checked]:border-amber-600">
                        <input
                            type="radio"
                            name="applyMode"
                            value="append_note"
                            checked={applyMode === 'append_note'}
                            onChange={() => setApplyMode('append_note')}
                            className="mt-0.5 accent-amber-500"
                        />
                        <div>
                            <div className="text-sm font-medium text-zinc-200">Add revision note</div>
                            <div className="text-xs text-zinc-500">Keep original prompt, append your directive — e.g. &quot;Remove dolphins completely!&quot;</div>
                        </div>
                    </label>
                    <label className="flex items-start gap-3 bg-zinc-800/60 border border-zinc-700 rounded-lg p-3 cursor-pointer hover:border-zinc-500 has-[:checked]:border-amber-600">
                        <input
                            type="radio"
                            name="applyMode"
                            value="manual_override"
                            checked={applyMode === 'manual_override'}
                            onChange={() => setApplyMode('manual_override')}
                            className="mt-0.5 accent-amber-500"
                        />
                        <div>
                            <div className="text-sm font-medium text-zinc-200 flex items-center gap-1.5">
                                <PenLine className="w-3.5 h-3.5 text-zinc-400" />
                                Edit prompt manually
                            </div>
                            <div className="text-xs text-zinc-500">Directly edit the full prompt used to generate this asset.</div>
                        </div>
                    </label>
                </div>

                {/* Input area */}
                {applyMode === 'append_note' ? (
                    <div className="space-y-1">
                        <label className="text-xs text-zinc-400">Revision directive</label>
                        <textarea
                            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-sm text-zinc-200 placeholder:text-zinc-600 min-h-[80px] resize-none focus:outline-none focus:border-amber-600"
                            placeholder="e.g. Remove dolphins completely! Add more sunset colors."
                            value={revisionNote}
                            onChange={(e) => setRevisionNote(e.target.value)}
                            disabled={isRegenerating}
                            autoFocus
                        />
                    </div>
                ) : (
                    <div className="space-y-1">
                        <label className="text-xs text-zinc-400">
                            {isVideo ? 'Motion prompt / instructions' : 'Image prompt'}
                        </label>
                        <textarea
                            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-xs text-zinc-200 min-h-[180px] resize-y focus:outline-none focus:border-amber-600 font-mono leading-relaxed"
                            value={revisedPrompt}
                            onChange={(e) => setRevisedPrompt(e.target.value)}
                            disabled={isRegenerating}
                            autoFocus
                        />
                    </div>
                )}

                {error && (
                    <p className="text-xs text-red-400 bg-red-900/20 border border-red-800 rounded-lg p-2">
                        {error}
                    </p>
                )}

                {/* Actions */}
                <div className="flex justify-end gap-2 pt-1">
                    <button
                        onClick={onClose}
                        disabled={isRegenerating}
                        className="px-4 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg disabled:opacity-40"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => void handleRegenerate()}
                        disabled={isRegenerating}
                        className="px-4 py-2 text-sm bg-amber-700 hover:bg-amber-600 text-white rounded-lg flex items-center gap-2 disabled:opacity-40"
                    >
                        {isRegenerating ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Regenerating…
                            </>
                        ) : (
                            <>
                                <Wand2 className="w-4 h-4" />
                                Regenerate
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
