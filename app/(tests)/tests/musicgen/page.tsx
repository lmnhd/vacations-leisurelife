'use client';

import { useState } from 'react';
import { Loader2, Music } from 'lucide-react';

interface MusicGenResponse {
    audioUrl?: string;
    duration?: number;
    prompt?: string;
    error?: string;
    output?: unknown;
}

export default function MusicGenTestPage() {
    const [prompt, setPrompt] = useState('ambient instrumental cruise background music, nostalgic, cinematic, no vocals');
    const [duration, setDuration] = useState('30');
    const [isLoading, setIsLoading] = useState(false);
    const [result, setResult] = useState<MusicGenResponse | null>(null);
    const [error, setError] = useState<string>('');

    async function handleGenerate(): Promise<void> {
        setIsLoading(true);
        setError('');
        setResult(null);

        try {
            const response = await fetch('/api/tests/musicgen', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    prompt,
                    duration: Number(duration),
                }),
            });

            const data = await response.json() as MusicGenResponse;

            if (!response.ok) {
                setError(data.error ?? 'MusicGen request failed.');
                return;
            }

            setResult(data);
        } catch (requestError: unknown) {
            setError(requestError instanceof Error ? requestError.message : 'MusicGen request failed.');
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <div className="min-h-screen bg-slate-950 text-white p-6">
            <div className="mx-auto max-w-4xl space-y-6">
                <div className="rounded-xl border border-white/10 bg-slate-900/50 p-6">
                    <div className="mb-4 flex items-center gap-3">
                        <Music className="h-6 w-6 text-cyan-400" />
                        <div>
                            <h1 className="text-xl font-semibold text-cyan-400">MusicGen Test Page</h1>
                            <p className="text-sm text-slate-400">Generate a standalone Replicate MusicGen sample before wiring it anywhere else.</p>
                        </div>
                    </div>

                    <div className="grid gap-4">
                        <div className="grid gap-2">
                            <label className="text-xs uppercase tracking-widest text-slate-500" htmlFor="musicgen-prompt">
                                Prompt
                            </label>
                            <textarea
                                id="musicgen-prompt"
                                value={prompt}
                                onChange={(event) => setPrompt(event.target.value)}
                                rows={4}
                                className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500/40"
                            />
                        </div>

                        <div className="grid gap-2 md:max-w-xs">
                            <label className="text-xs uppercase tracking-widest text-slate-500" htmlFor="musicgen-duration">
                                Duration
                            </label>
                            <input
                                id="musicgen-duration"
                                type="number"
                                min={1}
                                max={30}
                                value={duration}
                                onChange={(event) => setDuration(event.target.value)}
                                className="w-full rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500/40"
                            />
                        </div>

                        <button
                            type="button"
                            onClick={handleGenerate}
                            disabled={isLoading || prompt.trim().length === 0}
                            className="inline-flex items-center justify-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-500/15 px-4 py-2 text-sm font-medium text-cyan-300 hover:bg-cyan-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Music className="h-4 w-4" />}
                            {isLoading ? 'Generating...' : 'Generate Music'}
                        </button>
                    </div>
                </div>

                {error ? (
                    <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
                        {error}
                    </div>
                ) : null}

                {result ? (
                    <div className="rounded-xl border border-white/10 bg-slate-900/50 p-6 space-y-4">
                        <div>
                            <h2 className="text-lg font-semibold text-emerald-400">Result</h2>
                            <p className="text-sm text-slate-400">Prompt: {result.prompt}</p>
                            <p className="text-sm text-slate-400">Duration: {result.duration}s</p>
                        </div>

                        {result.audioUrl ? (
                            <audio controls src={result.audioUrl} className="w-full" />
                        ) : null}

                        <pre className="overflow-x-auto rounded-lg border border-white/10 bg-slate-950/60 p-4 text-xs text-slate-300">
                            {JSON.stringify(result, null, 2)}
                        </pre>
                    </div>
                ) : null}
            </div>
        </div>
    );
}
