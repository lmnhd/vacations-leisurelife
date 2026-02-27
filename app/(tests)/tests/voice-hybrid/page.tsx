'use client';

/**
 * Voice Hybrid Test Page
 *
 * Tests the hybrid voice architecture:
 *   Realtime API = STT + TTS only
 *   All reasoning = standard /api/chat text pipeline
 *
 * Compare against /tests/voice-pipeline (pure Realtime) to evaluate both approaches.
 */

import { useCallback, useRef, useState } from 'react';
import { useHybridVoiceChat } from '@/app/hooks/useHybridVoiceChat';
import type { ChatResponse } from '@/lib/chat/types';
import type { RealtimeVoiceEvent } from '@/lib/voice/realtime-session';

const TEST_SESSION_ID = 'hybrid-voice-test-001';
const TEST_USER_ID = 'hybrid-tester';

interface TranscriptEntry {
    id: string;
    role: 'user' | 'assistant';
    text: string;
    ts: string;
    pipelineMs?: number;
}

interface LogEntry {
    id: string;
    ts: string;
    text: string;
    type: 'info' | 'event' | 'error' | 'pipeline';
}

export default function VoiceHybridPage() {
    const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([]);
    const [log, setLog] = useState<LogEntry[]>([]);
    const [startingContext, setStartingContext] = useState('fast_cruise_search');
    const pipelineStartRef = useRef<number>(0);
    const logEndRef = useRef<HTMLDivElement>(null);

    const addLog = useCallback((text: string, type: LogEntry['type'] = 'info') => {
        const ts = new Date().toLocaleTimeString();
        setLog(prev => [...prev, { id: `${Date.now()}-${Math.random()}`, ts, text, type }]);
        setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    }, []);

    const voice = useHybridVoiceChat({
        sessionId: TEST_SESSION_ID,
        userId: TEST_USER_ID,
        startingContext,
        onTranscriptComplete: (transcript) => {
            pipelineStartRef.current = Date.now();
            setTranscripts(prev => [...prev, {
                id: `${Date.now()}`,
                role: 'user',
                text: transcript,
                ts: new Date().toLocaleTimeString(),
            }]);
            addLog(`STT: "${transcript.slice(0, 80)}"`, 'event');
            addLog('Routing to /api/chat pipeline...', 'pipeline');
        },
        onAgentTranscript: (reply) => {
            const pipelineMs = Date.now() - pipelineStartRef.current;
            setTranscripts(prev => [...prev, {
                id: `${Date.now()}`,
                role: 'assistant',
                text: reply,
                ts: new Date().toLocaleTimeString(),
                pipelineMs,
            }]);
            addLog(`Pipeline reply (${pipelineMs}ms): "${reply.slice(0, 80)}"`, 'pipeline');
        },
        onPipelineResult: (result: ChatResponse) => {
            if (result.toolCallsLog && result.toolCallsLog.length > 0) {
                for (const t of result.toolCallsLog) {
                    addLog(`tool: ${t.toolId} → ${t.status}`, 'event');
                }
            }
        },
        onEvent: (event: RealtimeVoiceEvent) => {
            addLog(`[${event.type}] ${event.detail}`, 'event');
        },
        onError: (err) => addLog(`ERROR: ${err}`, 'error'),
    });

    const handleToggle = useCallback(async () => {
        if (voice.connectionState === 'idle' || voice.connectionState === 'error') {
            addLog('Starting hybrid voice session...');
            await voice.startVoiceChat();
            addLog('Hybrid session ready — Realtime for STT+TTS, pipeline for reasoning');
        } else {
            addLog('Stopping session');
            voice.stopVoiceChat();
        }
    }, [voice, addLog]);

    const stateColor: Record<string, string> = {
        idle: 'text-slate-400',
        connecting: 'text-yellow-400',
        connected: 'text-emerald-400',
        error: 'text-red-400',
    };

    const logTypeColor: Record<LogEntry['type'], string> = {
        info: 'text-slate-400',
        event: 'text-cyan-400',
        error: 'text-red-400',
        pipeline: 'text-violet-400',
    };

    return (
        <div className="min-h-screen bg-slate-950 text-white p-6 font-mono">
            <div className="max-w-4xl mx-auto space-y-6">

                {/* Header */}
                <div className="border border-white/10 rounded-xl p-4 bg-slate-900/50">
                    <h1 className="text-lg font-semibold text-violet-400 tracking-wide">
                        🎙 Hybrid Voice Test
                    </h1>
                    <p className="text-xs text-slate-500 mt-1">
                        Realtime API = STT + TTS only. All reasoning routed through{' '}
                        <span className="text-violet-400">/api/chat</span> text pipeline.
                    </p>
                    <div className="mt-3 p-3 rounded-lg bg-slate-800/60 border border-white/5 text-[11px] text-slate-400 space-y-1">
                        <div className="text-slate-300 font-semibold mb-1">Architecture Comparison</div>
                        <div>
                            <span className="text-cyan-400">Pure Realtime</span>
                            {' → '}
                            <span>/tests/voice-pipeline</span>
                            {' — agent reasons inside Realtime, tools dispatched via data channel'}
                        </div>
                        <div>
                            <span className="text-violet-400">Hybrid</span>
                            {' → '}
                            <span>this page</span>
                            {' — Realtime = audio I/O only, reasoning = full text chat pipeline'}
                        </div>
                        <div className="text-slate-500 mt-1">
                            Tradeoffs: Hybrid adds ~500ms-1s pipeline latency per turn, but gets full context memory, deterministic tool execution, and identical behavior to text chat.
                        </div>
                    </div>
                </div>

                {/* Controls */}
                <div className="border border-white/10 rounded-xl p-4 bg-slate-900/50 space-y-3">
                    <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-500">Status</span>
                        <span className={`text-xs font-medium ${stateColor[voice.connectionState] ?? 'text-slate-400'}`}>
                            {voice.connectionState.toUpperCase()}
                            {voice.isProcessing && (
                                <span className="ml-2 text-violet-400 animate-pulse">⚙ pipeline running...</span>
                            )}
                        </span>
                    </div>

                    <div className="space-y-1">
                        <label className="text-[11px] text-slate-500">Starting Context</label>
                        <select
                            value={startingContext}
                            onChange={e => setStartingContext(e.target.value)}
                            disabled={voice.connectionState !== 'idle'}
                            className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-violet-500/40 disabled:opacity-40"
                        >
                            <option value="">— Auto (trigger-based) —</option>
                            <option value="fast_cruise_search">fast_cruise_search</option>
                            <option value="onboarding">onboarding</option>
                            <option value="general_chat">general_chat</option>
                        </select>
                    </div>

                    <div className="flex gap-3">
                        <button
                            onClick={handleToggle}
                            disabled={voice.connectionState === 'connecting'}
                            className={`flex-1 py-3 rounded-lg text-sm font-medium transition-all disabled:opacity-40 disabled:pointer-events-none ${
                                voice.connectionState === 'connected'
                                    ? 'bg-red-500/20 border border-red-500/40 text-red-400 hover:bg-red-500/30'
                                    : 'bg-violet-500/20 border border-violet-500/40 text-violet-400 hover:bg-violet-500/30'
                            }`}
                        >
                            {voice.connectionState === 'connecting'
                                ? '⏳ Connecting…'
                                : voice.connectionState === 'connected'
                                ? '⏹ Stop'
                                : '🎙 Start Hybrid Voice'}
                        </button>

                        {voice.connectionState === 'connected' && (
                            <button
                                onClick={voice.interruptCurrentSpeech}
                                className="px-4 py-3 rounded-lg text-sm font-medium bg-amber-500/20 border border-amber-500/40 text-amber-400 hover:bg-amber-500/30 transition-all"
                            >
                                ✋ Interrupt
                            </button>
                        )}
                    </div>

                    {voice.connectionState === 'connected' && (
                        <div className="flex items-center gap-2 text-xs text-emerald-400">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                            {voice.isProcessing ? 'Processing through text pipeline...' : 'Listening — speak now'}
                        </div>
                    )}
                </div>

                {/* Transcript */}
                <div className="border border-white/10 rounded-xl p-4 bg-slate-900/50 space-y-3">
                    <div className="flex items-center justify-between">
                        <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                            Conversation
                        </h2>
                        <span className="text-[10px] text-slate-600">{transcripts.length} turns</span>
                    </div>

                    {transcripts.length === 0 ? (
                        <p className="text-xs text-slate-600 italic">No transcripts yet — start speaking.</p>
                    ) : (
                        <div className="space-y-3">
                            {transcripts.map(t => (
                                <div key={t.id} className={`text-xs ${t.role === 'user' ? 'text-slate-300' : 'text-violet-300'}`}>
                                    <div className="flex items-baseline gap-2 mb-0.5">
                                        <span className={`font-semibold uppercase text-[10px] ${t.role === 'user' ? 'text-slate-500' : 'text-violet-500'}`}>
                                            {t.role}
                                        </span>
                                        <span className="text-[10px] text-slate-600">{t.ts}</span>
                                        {t.pipelineMs !== undefined && (
                                            <span className="text-[10px] text-violet-600">
                                                pipeline: {t.pipelineMs}ms
                                            </span>
                                        )}
                                    </div>
                                    <div>{t.text}</div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Pipeline Log */}
                <div className="border border-white/10 rounded-xl p-4 bg-slate-900/50 space-y-2">
                    <div className="flex items-center justify-between">
                        <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                            Pipeline Log
                        </h2>
                        <button
                            onClick={() => setLog([])}
                            className="text-[10px] text-slate-600 hover:text-slate-400"
                        >
                            Clear
                        </button>
                    </div>

                    <div className="space-y-0.5 max-h-64 overflow-y-auto text-[11px]">
                        {log.map(entry => (
                            <div key={entry.id} className="flex gap-2">
                                <span className="text-slate-600 shrink-0">[{entry.ts}]</span>
                                <span className={logTypeColor[entry.type]}>{entry.text}</span>
                            </div>
                        ))}
                        <div ref={logEndRef} />
                    </div>
                </div>

            </div>
        </div>
    );
}
