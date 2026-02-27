'use client';

/**
 * Voice Pipeline Test Page
 *
 * Validates the voice audio layer independently before Hero Chat integration.
 * Tests: mic acquisition → WebRTC session → STT transcript → /api/chat pipeline → TTS playback.
 *
 * Does NOT replicate the Hero Chat canvas — this is a raw plumbing test.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useVoiceChat } from '@/app/hooks/useVoiceChat';

interface TranscriptEntry {
    id: string;
    role: 'user' | 'assistant';
    text: string;
    timestamp: number;
}

const TEST_SESSION_ID = `voice-test-${Date.now()}`;
const TEST_USER_ID = 'voice-test-user';

export default function VoicePipelineTestPage() {
    const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([]);
    const [pipelineLog, setPipelineLog] = useState<string[]>([]);
    const [ttsInput, setTtsInput] = useState('Hello! I am your cruise travel assistant. How can I help you today?');
    const transcriptEndRef = useRef<HTMLDivElement>(null);
    const logEndRef = useRef<HTMLDivElement>(null);

    const addLog = useCallback((msg: string) => {
        setPipelineLog((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
    }, []);

    // Auto-scroll log to bottom
    useEffect(() => {
        logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [pipelineLog]);

    const handleTranscriptComplete = useCallback((transcript: string) => {
        addLog(`STT complete: "${transcript}"`);
        setTranscripts((prev) => [
            ...prev,
            { id: `u-${Date.now()}`, role: 'user', text: transcript, timestamp: Date.now() },
        ]);
    }, [addLog]);

    const handleAgentTranscript = useCallback((transcript: string) => {
        addLog(`Agent said: "${transcript.slice(0, 80)}…"`);
        setTranscripts((prev) => [
            ...prev,
            { id: `a-${Date.now()}`, role: 'assistant', text: transcript, timestamp: Date.now() },
        ]);
    }, [addLog]);

    const voice = useVoiceChat({
        sessionId: TEST_SESSION_ID,
        userId: TEST_USER_ID,
        onTranscriptComplete: handleTranscriptComplete,
        onAgentTranscript: handleAgentTranscript,
        onSpeakReply: (text) => addLog(`onSpeakReply: "${text.slice(0, 60)}…"`),
    });

    const handleToggle = useCallback(async () => {
        if (voice.connectionState === 'idle' || voice.connectionState === 'error') {
            addLog('Starting voice session…');
            await voice.startVoiceChat();
            addLog('WebRTC session established');
        } else {
            addLog('Stopping voice session');
            voice.stopVoiceChat();
        }
    }, [voice, addLog]);

    const stateColor: Record<string, string> = {
        idle: 'text-slate-400',
        connecting: 'text-yellow-400',
        connected: 'text-emerald-400',
        error: 'text-red-400',
    };

    return (
        <div className="min-h-screen bg-slate-950 text-white p-6 font-mono">
            <div className="max-w-3xl mx-auto space-y-6">

                {/* Header */}
                <div className="border border-white/10 rounded-xl p-4 bg-slate-900/50">
                    <h1 className="text-lg font-semibold text-cyan-400 tracking-wide">
                        🎤 Voice Pipeline Test
                    </h1>
                    <p className="text-xs text-slate-500 mt-1">
                        Validates mic → WebRTC → STT → pipeline → TTS without the Hero Chat canvas.
                    </p>
                    <div className="mt-2 text-[11px] text-slate-600">
                        Session: <span className="text-slate-400">{TEST_SESSION_ID}</span>
                    </div>
                </div>

                {/* Connection Controls */}
                <div className="border border-white/10 rounded-xl p-4 bg-slate-900/50 space-y-3">
                    <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-400 uppercase tracking-widest">
                            Connection State
                        </span>
                        <span className={`text-sm font-semibold ${stateColor[voice.connectionState] ?? 'text-slate-400'}`}>
                            {voice.connectionState.toUpperCase()}
                        </span>
                    </div>

                    <div className="flex gap-3">
                        <button
                            onClick={handleToggle}
                            disabled={voice.connectionState === 'connecting'}
                            className={`flex-1 py-3 rounded-lg text-sm font-medium transition-all disabled:opacity-40 disabled:pointer-events-none ${
                                voice.connectionState === 'connected'
                                    ? 'bg-red-500/20 border border-red-500/40 text-red-400 hover:bg-red-500/30'
                                    : 'bg-cyan-500/20 border border-cyan-500/40 text-cyan-400 hover:bg-cyan-500/30'
                            }`}
                        >
                            {voice.connectionState === 'connecting'
                                ? '⏳ Connecting…'
                                : voice.connectionState === 'connected'
                                ? '⏹ Stop Voice'
                                : '🎤 Start Voice'}
                        </button>

                        {voice.connectionState === 'connected' && (
                            <button
                                onClick={voice.interruptCurrentSpeech}
                                className="px-4 py-3 rounded-lg text-sm font-medium bg-amber-500/20 border border-amber-500/40 text-amber-400 hover:bg-amber-500/30 transition-all"
                                title="Interrupt current TTS playback"
                            >
                                ✋ Interrupt
                            </button>
                        )}
                    </div>

                    {voice.connectionState === 'connected' && (
                        <div className="flex items-center gap-2 text-xs text-emerald-400">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                            Listening — speak now
                        </div>
                    )}
                </div>

                {/* TTS Direct Test */}
                {voice.connectionState === 'connected' && (
                    <div className="border border-emerald-500/20 rounded-xl p-4 bg-slate-900/50 space-y-3">
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-emerald-400 uppercase tracking-widest">TTS Direct Test</span>
                            <span className="text-[10px] text-slate-600">— type text and click Speak to test audio output</span>
                        </div>
                        <div className="flex gap-2">
                            <textarea
                                value={ttsInput}
                                onChange={(e) => setTtsInput(e.target.value)}
                                rows={2}
                                className="flex-1 bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-600 resize-none focus:outline-none focus:border-emerald-500/40"
                                placeholder="Enter text to speak…"
                            />
                            <div className="flex flex-col gap-2">
                                <button
                                    onClick={() => {
                                        if (ttsInput.trim()) {
                                            addLog(`TTS direct: "${ttsInput.slice(0, 60)}…"`);
                                            voice.speakText(ttsInput.trim());
                                        }
                                    }}
                                    disabled={!ttsInput.trim()}
                                    className="px-4 py-2 rounded-lg text-xs font-medium bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/30 transition-all disabled:opacity-40 disabled:pointer-events-none whitespace-nowrap"
                                >
                                    🔊 Speak
                                </button>
                                <button
                                    onClick={() => {
                                        addLog('TTS interrupted');
                                        voice.interruptCurrentSpeech();
                                    }}
                                    className="px-4 py-2 rounded-lg text-xs font-medium bg-amber-500/20 border border-amber-500/40 text-amber-400 hover:bg-amber-500/30 transition-all whitespace-nowrap"
                                >
                                    ✋ Stop
                                </button>
                            </div>
                        </div>
                        <div className="flex gap-2 flex-wrap">
                            {[
                                'Welcome aboard! Ready to plan your perfect cruise?',
                                'We have amazing deals on Caribbean sailings this season.',
                                'Tell me about your ideal vacation and I will find the right cruise for you.',
                            ].map((sample) => (
                                <button
                                    key={sample}
                                    onClick={() => setTtsInput(sample)}
                                    className="text-[10px] px-2 py-1 rounded bg-white/5 border border-white/5 text-slate-500 hover:text-slate-300 hover:border-white/10 transition-all text-left"
                                >
                                    {sample.slice(0, 40)}…
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Transcript */}
                <div className="border border-white/10 rounded-xl bg-slate-900/50 overflow-hidden">
                    <div className="px-4 py-2 border-b border-white/5 flex items-center justify-between">
                        <span className="text-xs text-slate-400 uppercase tracking-widest">Transcripts</span>
                        <span className="text-[10px] text-slate-600">{transcripts.length} turns</span>
                    </div>
                    <div className="p-4 space-y-3 max-h-72 overflow-y-auto">
                        {transcripts.length === 0 && (
                            <p className="text-slate-600 text-xs text-center py-4">
                                No transcripts yet — start voice and speak
                            </p>
                        )}
                        {transcripts.map((t) => (
                            <div
                                key={t.id}
                                className={`rounded-lg px-3 py-2 text-xs ${
                                    t.role === 'user'
                                        ? 'bg-blue-500/10 border border-blue-500/15 ml-8'
                                        : 'bg-white/5 border border-white/5 mr-8'
                                }`}
                            >
                                <div className="flex justify-between mb-1">
                                    <span className={t.role === 'user' ? 'text-blue-400' : 'text-cyan-400'}>
                                        {t.role.toUpperCase()}
                                    </span>
                                    <span className="text-slate-600 text-[10px]">
                                        {new Date(t.timestamp).toLocaleTimeString()}
                                    </span>
                                </div>
                                <p className="text-slate-200 leading-relaxed whitespace-pre-wrap break-words">
                                    {t.text}
                                </p>
                            </div>
                        ))}
                        <div ref={transcriptEndRef} />
                    </div>
                </div>

                {/* Pipeline Log */}
                <div className="border border-white/10 rounded-xl bg-slate-900/50 overflow-hidden">
                    <div className="px-4 py-2 border-b border-white/5 flex items-center justify-between">
                        <span className="text-xs text-slate-400 uppercase tracking-widest">Pipeline Log</span>
                        <button
                            onClick={() => setPipelineLog([])}
                            className="text-[10px] text-slate-600 hover:text-slate-400 transition-colors"
                        >
                            Clear
                        </button>
                    </div>
                    <div className="p-4 space-y-1 max-h-56 overflow-y-auto">
                        {pipelineLog.length === 0 && (
                            <p className="text-slate-600 text-[11px] text-center py-2">No events yet</p>
                        )}
                        {pipelineLog.map((line, i) => (
                            <p key={i} className="text-[11px] text-slate-400 leading-relaxed">
                                {line}
                            </p>
                        ))}
                        <div ref={logEndRef} />
                    </div>
                </div>

                {/* Architecture reminder */}
                <div className="border border-white/5 rounded-xl p-4 bg-slate-900/20">
                    <p className="text-[11px] text-slate-600 leading-relaxed">
                        <span className="text-slate-500">Flow:</span> Mic → RTCPeerConnection → OpenAI Realtime (STT) →
                        <span className="text-cyan-700"> /api/chat </span>
                        (channel: voice) → 10-stage pipeline → cleanText →
                        <span className="text-cyan-700"> TTS (Realtime)</span>
                        {' '}+ HeroHeadline animates simultaneously.
                        No alternate UI — voice IS the canvas audio layer.
                    </p>
                </div>

            </div>
        </div>
    );
}
