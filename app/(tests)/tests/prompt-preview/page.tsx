'use client';

import { useState } from 'react';

type PromptPreviewResponse = {
    sessionId?: string;
    channel?: 'text' | 'voice';
    activeContextPath?: string;
    systemPrompt?: string;
    error?: string;
};

export default function PromptPreviewPage() {
    const [sessionId, setSessionId] = useState('');
    const [channel, setChannel] = useState<'text' | 'voice'>('text');
    const [result, setResult] = useState<PromptPreviewResponse | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleFetch() {
        if (!sessionId.trim()) {
            setError('Session ID is required');
            return;
        }

        setIsLoading(true);
        setError(null);
        setResult(null);

        try {
            const params = new URLSearchParams({ sessionId: sessionId.trim(), channel });
            const response = await fetch(`/api/dev/prompt-preview?${params.toString()}`);
            const data = (await response.json()) as PromptPreviewResponse;

            if (!response.ok) {
                setError(data.error ?? 'Request failed');
                return;
            }

            setResult(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error');
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 p-6 font-mono">
            <div className="max-w-5xl mx-auto space-y-6">

                {/* Header */}
                <div className="border-b border-slate-800 pb-4">
                    <h1 className="text-2xl font-bold text-cyan-400">Dev Prompt Preview</h1>
                    <p className="text-slate-400 text-sm mt-1">
                        Inspect the fully assembled system prompt sent to OpenAI for any session.
                    </p>
                </div>

                {/* Controls */}
                <div className="flex flex-wrap gap-4 items-end">
                    <div className="flex flex-col gap-1.5 flex-1 min-w-[240px]">
                        <label className="text-xs text-slate-400 uppercase tracking-wider">Session ID</label>
                        <input
                            type="text"
                            value={sessionId}
                            onChange={(e) => setSessionId(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleFetch()}
                            placeholder="e.g. session-1234567890-abc123"
                            className="bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500 transition-colors text-sm"
                        />
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs text-slate-400 uppercase tracking-wider">Channel</label>
                        <select
                            value={channel}
                            onChange={(e) => setChannel(e.target.value as 'text' | 'voice')}
                            className="bg-slate-900 border border-slate-700 rounded-lg px-4 py-2.5 text-slate-100 focus:outline-none focus:border-cyan-500 transition-colors text-sm"
                        >
                            <option value="text">Text</option>
                            <option value="voice">Voice</option>
                        </select>
                    </div>

                    <button
                        onClick={handleFetch}
                        disabled={isLoading}
                        className="bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-medium px-6 py-2.5 rounded-lg transition-colors text-sm"
                    >
                        {isLoading ? 'Fetching…' : 'Fetch Prompt'}
                    </button>
                </div>

                {/* Error */}
                {error && (
                    <div className="bg-red-950/50 border border-red-700/50 rounded-lg px-4 py-3 text-red-400 text-sm">
                        {error}
                    </div>
                )}

                {/* Result */}
                {result && (
                    <div className="space-y-4">

                        {/* Meta row */}
                        <div className="flex flex-wrap gap-3">
                            <MetaBadge label="Session ID" value={result.sessionId ?? '—'} />
                            <MetaBadge label="Channel" value={result.channel ?? '—'} />
                            <MetaBadge
                                label="Active Context Path"
                                value={result.activeContextPath ?? '—'}
                                highlight
                            />
                        </div>

                        {/* Prompt box */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <label className="text-xs text-slate-400 uppercase tracking-wider">
                                    Assembled System Prompt
                                </label>
                                <button
                                    onClick={() => {
                                        if (result.systemPrompt) {
                                            void navigator.clipboard.writeText(result.systemPrompt);
                                        }
                                    }}
                                    className="text-xs text-cyan-500 hover:text-cyan-400 transition-colors"
                                >
                                    Copy
                                </button>
                            </div>
                            <pre className="bg-slate-900 border border-slate-700 rounded-lg p-4 text-xs text-slate-300 whitespace-pre-wrap overflow-auto max-h-[60vh] leading-relaxed">
                                {result.systemPrompt}
                            </pre>
                        </div>

                        {/* Token estimate */}
                        {result.systemPrompt && (
                            <p className="text-xs text-slate-500">
                                ~{Math.ceil(result.systemPrompt.length / 4).toLocaleString()} estimated tokens
                            </p>
                        )}
                    </div>
                )}

                {/* Empty state */}
                {!result && !error && !isLoading && (
                    <div className="text-center py-20 text-slate-600 text-sm">
                        Enter a session ID and click Fetch Prompt to inspect the assembled system prompt.
                    </div>
                )}
            </div>
        </div>
    );
}

function MetaBadge({
    label,
    value,
    highlight = false,
}: {
    label: string;
    value: string;
    highlight?: boolean;
}) {
    return (
        <div className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 flex flex-col gap-0.5">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</span>
            <span className={`text-sm font-medium ${highlight ? 'text-cyan-400' : 'text-slate-200'}`}>
                {value}
            </span>
        </div>
    );
}
