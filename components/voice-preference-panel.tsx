"use client";

import { Loader2, Mic2 } from 'lucide-react';
import { getElevenLabsVoiceRoleLabel } from '@/lib/campaigns/media/elevenlabs-voices';
import { useVoicePreference } from '@/lib/campaigns/media/use-voice-preference';

export function VoicePreferencePanel({ className = '' }: { className?: string }) {
    const { preferences, voices, source, warning, loading, updatePreference } = useVoicePreference();

    return (
        <div className={`rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-3 ${className}`.trim()}>
            <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                    <div className="flex items-center gap-2 text-sm font-medium text-emerald-300">
                        <Mic2 className="h-4 w-4" />
                        Shared ElevenLabs Voices
                    </div>
                    <p className="mt-1 text-[11px] text-slate-400">
                        Applies to audio tests, media generation, narrated storyboard videos, and regenerate-with-revision runs that re-render narration.
                    </p>
                </div>
                <div className="text-[10px] uppercase tracking-widest text-slate-500">
                    {loading ? 'loading' : source === 'api' ? 'live voice library' : 'fallback defaults'}
                </div>
            </div>

            {warning && (
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
                    {warning}
                </div>
            )}

            <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1 text-xs text-slate-300">
                    <div className="text-[10px] uppercase tracking-widest text-slate-500">{getElevenLabsVoiceRoleLabel('narration')}</div>
                    <select
                        value={preferences?.narrationVoiceId ?? ''}
                        onChange={(event) => void updatePreference({ narrationVoiceId: event.target.value })}
                        disabled={loading || voices.length === 0}
                        className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/40 disabled:opacity-40"
                    >
                        {voices.map((voice) => (
                            <option key={`narration-${voice.id}`} value={voice.id}>
                                {voice.name} · {voice.category}
                            </option>
                        ))}
                    </select>
                    <div className="text-[11px] text-slate-500">
                        {preferences?.narrationVoiceName ?? 'No narration voice selected'}
                    </div>
                </label>

                <label className="space-y-1 text-xs text-slate-300">
                    <div className="text-[10px] uppercase tracking-widest text-slate-500">{getElevenLabsVoiceRoleLabel('hype')}</div>
                    <select
                        value={preferences?.hypeVoiceId ?? ''}
                        onChange={(event) => void updatePreference({ hypeVoiceId: event.target.value })}
                        disabled={loading || voices.length === 0}
                        className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/40 disabled:opacity-40"
                    >
                        {voices.map((voice) => (
                            <option key={`hype-${voice.id}`} value={voice.id}>
                                {voice.name} · {voice.category}
                            </option>
                        ))}
                    </select>
                    <div className="text-[11px] text-slate-500">
                        {preferences?.hypeVoiceName ?? 'No hype voice selected'}
                    </div>
                </label>
            </div>

            {loading && (
                <div className="flex items-center gap-2 text-[11px] text-slate-400">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Loading shared voice preferences…
                </div>
            )}
        </div>
    );
}