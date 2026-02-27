'use client';

/**
 * Voice Simulator Test Page
 *
 * Automated voice tool testing WITHOUT a microphone.
 * Injects scripted text messages directly into the Realtime data channel
 * as if they came from STT, using TOOL TEST MODE prompt (voice_test channel).
 *
 * Use this to verify tool calls, response formats, and latency without
 * needing to speak into a microphone.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type { RealtimeVoiceEvent } from '@/app/hooks/useVoiceChat';
import type { RealtimeSessionHandle, RealtimeSessionCallbacks } from '@/lib/voice/realtime-session';
import { createRealtimeSession } from '@/lib/voice/realtime-session';

// ─── Scripted test scenarios ──────────────────────────────────────────────────

interface TestScenario {
    id: string;
    label: string;
    messages: string[];
}

const TEST_SCENARIOS: TestScenario[] = [
    {
        id: 'tool-all',
        label: 'All Tools — One Shot',
        messages: [
            'What do people on social media say about Royal Caribbean?',
            'What cruise deals are available right now?',
            'What excursions are available in Cozumel for snorkeling?',
            'What are the latest cruise industry trends?',
            'Tell me about Cruise Brothers agent perks.',
        ],
    },
    {
        id: 'social-media',
        label: 'Social Media Tool',
        messages: [
            'What are people saying about Carnival Cruise Line on social media?',
            'What do travelers think of Norwegian Cruise Line?',
        ],
    },
    {
        id: 'excursions',
        label: 'Excursion Finder Tool',
        messages: [
            'What shore excursions are in Nassau for families?',
            'What are the best things to do in Cozumel?',
            'What excursions are available in St. Thomas?',
        ],
    },
    {
        id: 'trends',
        label: 'Cruise Trend Analysis',
        messages: [
            'What are Gen Z travelers saying about cruising?',
            'What are the trending negatives in the cruise industry right now?',
            'What do millennial travelers think about cruise dining?',
        ],
    },
    {
        id: 'knowledge',
        label: 'Cruise Brothers Knowledge',
        messages: [
            'What are the Cruise Brothers agent commission rates?',
            'How do I book a group cruise through Cruise Brothers?',
        ],
    },
];

// ─── Event log entry ──────────────────────────────────────────────────────────

interface LogEntry {
    id: string;
    ts: string;
    type: string;
    detail: string;
    category: 'info' | 'tool' | 'stt' | 'agent' | 'error';
}

function categorize(type: string): LogEntry['category'] {
    if (type.startsWith('tool:')) return 'tool';
    if (type.startsWith('stt:')) return 'stt';
    if (type.startsWith('agent:')) return 'agent';
    if (type.includes('error')) return 'error';
    return 'info';
}

const CATEGORY_STYLES: Record<LogEntry['category'], string> = {
    info:  'text-slate-400',
    tool:  'text-amber-400',
    stt:   'text-blue-400',
    agent: 'text-emerald-400',
    error: 'text-red-400',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

const TEST_SESSION_ID = `voice-sim-${Date.now()}`;

export default function VoiceSimulatorPage() {
    const [log, setLog] = useState<LogEntry[]>([]);
    const [transcripts, setTranscripts] = useState<{ role: 'user' | 'assistant'; text: string; ts: string }[]>([]);
    const [connectionState, setConnectionState] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
    const [isRunning, setIsRunning] = useState(false);
    const [selectedScenario, setSelectedScenario] = useState<string>(TEST_SCENARIOS[0]!.id);
    const [customMessage, setCustomMessage] = useState('');
    const [delayMs, setDelayMs] = useState(3000);
    const [sessionMode, setSessionMode] = useState<'test' | 'dev'>('test');
    const [startingContext, setStartingContext] = useState<string>('');

    const sessionRef = useRef<RealtimeSessionHandle | null>(null);
    const logEndRef = useRef<HTMLDivElement>(null);
    const transcriptEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [log]);

    useEffect(() => {
        transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [transcripts]);

    const addLog = useCallback((type: string, detail: string) => {
        const ts = new Date().toISOString().slice(11, 23);
        setLog((prev) => [...prev, {
            id: `${Date.now()}-${Math.random()}`,
            ts, type, detail,
            category: categorize(type),
        }]);
    }, []);

    // ── Connect to Realtime in test mode ──────────────────────────────────────

    const connect = useCallback(async () => {
        if (connectionState !== 'idle') return;
        setConnectionState('connecting');
        addLog('session:init', `Requesting ${sessionMode.toUpperCase()} mode ephemeral token...`);

        try {
            const tokenRes = await fetch('/api/voice/session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId: TEST_SESSION_ID,
                    userId: 'voice-sim',
                    mode: sessionMode,
                    ...(startingContext ? { startingContext } : {}),
                }),
            });

            const tokenData = await tokenRes.json() as { clientSecret?: string; error?: string };
            if (!tokenRes.ok || !tokenData.clientSecret) {
                throw new Error(tokenData.error ?? 'No client secret returned');
            }
            const modeLabel = sessionMode === 'test' ? 'TEST mode, all tools unlocked' : 'DEV mode, relaxed context';
            const contextLabel = startingContext ? ` | context: ${startingContext}` : '';
            addLog('session:token', `Token received — ${modeLabel}${contextLabel}`);

            // Silent audio stream — no mic needed
            const silentStream = createSilentAudioStream();

            const callbacks: RealtimeSessionCallbacks = {
                onTranscriptComplete: (transcript) => {
                    setTranscripts((prev) => [...prev, {
                        role: 'user', text: transcript,
                        ts: new Date().toLocaleTimeString(),
                    }]);
                },
                onAgentTranscript: (transcript) => {
                    setTranscripts((prev) => [...prev, {
                        role: 'assistant', text: transcript,
                        ts: new Date().toLocaleTimeString(),
                    }]);
                },
                onEvent: (event: RealtimeVoiceEvent) => {
                    addLog(event.type, event.detail);
                },
                onStateChange: (state) => {
                    setConnectionState(state);
                    addLog('dc:state', `Connection state → ${state}`);
                },
                onError: (error) => {
                    addLog('error', error);
                },
            };

            const handle = await createRealtimeSession(tokenData.clientSecret, silentStream, callbacks, true);
            sessionRef.current = handle;
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            addLog('session:error', msg);
            setConnectionState('error');
        }
    }, [connectionState, addLog]);

    const disconnect = useCallback(() => {
        sessionRef.current?.close();
        sessionRef.current = null;
        setConnectionState('idle');
        addLog('session:closed', 'Disconnected');
    }, [addLog]);

    // ── Inject a message as if it came from STT ───────────────────────────────

    const injectMessage = useCallback((text: string) => {
        const handle = sessionRef.current;
        if (!handle) return;

        addLog('inject:send', `"${text}"`);
        setTranscripts((prev) => [...prev, {
            role: 'user', text: `[sim] ${text}`,
            ts: new Date().toLocaleTimeString(),
        }]);

        handle.injectUserMessage(text);
    }, [addLog]);

    // ── Run a scenario ────────────────────────────────────────────────────────

    const runScenario = useCallback(async () => {
        const scenario = TEST_SCENARIOS.find((s) => s.id === selectedScenario);
        if (!scenario || !sessionRef.current) return;

        setIsRunning(true);
        addLog('scenario:start', `Running: ${scenario.label} (${scenario.messages.length} messages, ${delayMs}ms delay)`);

        for (const message of scenario.messages) {
            if (!sessionRef.current) break;
            injectMessage(message);
            await sleep(delayMs);
        }

        addLog('scenario:complete', `Finished: ${scenario.label}`);
        setIsRunning(false);
    }, [selectedScenario, delayMs, injectMessage, addLog]);

    const sendCustom = useCallback(() => {
        if (!customMessage.trim() || !sessionRef.current) return;
        injectMessage(customMessage.trim());
        setCustomMessage('');
    }, [customMessage, injectMessage]);

    const stateColor: Record<string, string> = {
        idle: 'text-slate-400', connecting: 'text-yellow-400',
        connected: 'text-emerald-400', error: 'text-red-400',
    };

    return (
        <div className="min-h-screen bg-slate-950 text-white p-6 font-mono">
            <div className="max-w-5xl mx-auto space-y-4">

                {/* Header */}
                <div className="border border-amber-500/30 rounded-xl p-4 bg-amber-500/5">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-lg font-semibold text-amber-400">🧪 Voice Tool Simulator</h1>
                            <p className="text-xs text-slate-500 mt-1">
                                Test mode — no mic needed. Messages injected directly into Realtime data channel.
                                Agent uses stripped TOOL TEST MODE prompt with all tools unlocked.
                            </p>
                        </div>
                        <div className="text-right">
                            <div className="text-xs text-slate-500">State</div>
                            <div className={`text-sm font-bold ${stateColor[connectionState] ?? 'text-slate-400'}`}>
                                {connectionState.toUpperCase()}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">

                    {/* Left: Controls */}
                    <div className="space-y-4">

                        {/* Connect */}
                        <div className="border border-white/10 rounded-xl p-4 bg-slate-900/50 space-y-3">
                            <div className="text-xs text-slate-400 uppercase tracking-widest">Session</div>
                            <div className="flex gap-1 p-1 bg-slate-800 rounded-lg">
                                {(['test', 'dev'] as const).map((m) => (
                                    <button
                                        key={m}
                                        onClick={() => setSessionMode(m)}
                                        disabled={connectionState !== 'idle'}
                                        className={`flex-1 py-1.5 rounded-md text-[10px] font-medium transition-all disabled:pointer-events-none ${
                                            sessionMode === m
                                                ? m === 'test'
                                                    ? 'bg-cyan-500/30 text-cyan-300 border border-cyan-500/40'
                                                    : 'bg-violet-500/30 text-violet-300 border border-violet-500/40'
                                                : 'text-slate-500 hover:text-slate-300'
                                        }`}
                                    >
                                        {m === 'test' ? '🧪 Tool Test' : '🛠 Dev Mode'}
                                    </button>
                                ))}
                            </div>
                            <div className="text-[10px] text-slate-600">
                                {sessionMode === 'test'
                                    ? 'Terse tool testing — no persona, terse TOOL|STATUS|RESULT format'
                                    : 'Relaxed dev context — short answers, all tools, no sales flow'}
                            </div>
                            <div className="space-y-1">
                                <div className="text-[10px] text-slate-500 uppercase tracking-widest">Starting Context</div>
                                <select
                                    value={startingContext}
                                    onChange={(e) => setStartingContext(e.target.value)}
                                    disabled={connectionState !== 'idle'}
                                    className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-violet-500/40 disabled:opacity-40"
                                >
                                    <option value="">— Auto (trigger-based) —</option>
                                    <option value="onboarding">onboarding</option>
                                    <option value="fast_cruise_search">fast_cruise_search</option>
                                    <option value="fast_booking">fast_booking</option>
                                    <option value="dev_mode">dev_mode</option>
                                    <option value="general_chat">general_chat</option>
                                </select>
                                <div className="text-[10px] text-slate-600">
                                    Override bypasses trigger logic and pins this context for the session.
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={connect}
                                    disabled={connectionState !== 'idle' && connectionState !== 'error'}
                                    className="flex-1 py-2 rounded-lg text-xs font-medium bg-cyan-500/20 border border-cyan-500/40 text-cyan-400 hover:bg-cyan-500/30 disabled:opacity-40 disabled:pointer-events-none transition-all"
                                >
                                    Connect ({sessionMode === 'test' ? 'Test' : 'Dev'} Mode)
                                </button>
                                <button
                                    onClick={disconnect}
                                    disabled={connectionState === 'idle'}
                                    className="flex-1 py-2 rounded-lg text-xs font-medium bg-red-500/20 border border-red-500/40 text-red-400 hover:bg-red-500/30 disabled:opacity-40 disabled:pointer-events-none transition-all"
                                >
                                    Disconnect
                                </button>
                            </div>
                            <div className="text-[10px] text-slate-600">
                                Session: {TEST_SESSION_ID}
                            </div>
                        </div>

                        {/* Scenario runner */}
                        <div className="border border-white/10 rounded-xl p-4 bg-slate-900/50 space-y-3">
                            <div className="text-xs text-slate-400 uppercase tracking-widest">Scenario Runner</div>
                            <select
                                value={selectedScenario}
                                onChange={(e) => setSelectedScenario(e.target.value)}
                                className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500/40"
                            >
                                {TEST_SCENARIOS.map((s) => (
                                    <option key={s.id} value={s.id}>{s.label}</option>
                                ))}
                            </select>
                            <div className="flex items-center gap-2">
                                <label className="text-[10px] text-slate-500 whitespace-nowrap">Delay (ms)</label>
                                <input
                                    type="number"
                                    value={delayMs}
                                    onChange={(e) => setDelayMs(Number(e.target.value))}
                                    min={1000}
                                    step={500}
                                    className="w-24 bg-slate-800 border border-white/10 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none"
                                />
                                <span className="text-[10px] text-slate-600">between messages</span>
                            </div>
                            {selectedScenario && (
                                <div className="text-[10px] text-slate-600 space-y-0.5">
                                    {TEST_SCENARIOS.find((s) => s.id === selectedScenario)?.messages.map((m, i) => (
                                        <div key={i}>→ {m}</div>
                                    ))}
                                </div>
                            )}
                            <button
                                onClick={runScenario}
                                disabled={connectionState !== 'connected' || isRunning}
                                className="w-full py-2 rounded-lg text-xs font-medium bg-amber-500/20 border border-amber-500/40 text-amber-400 hover:bg-amber-500/30 disabled:opacity-40 disabled:pointer-events-none transition-all"
                            >
                                {isRunning ? '⏳ Running…' : '▶ Run Scenario'}
                            </button>
                        </div>

                        {/* Custom message */}
                        <div className="border border-white/10 rounded-xl p-4 bg-slate-900/50 space-y-3">
                            <div className="text-xs text-slate-400 uppercase tracking-widest">Custom Inject</div>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={customMessage}
                                    onChange={(e) => setCustomMessage(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && sendCustom()}
                                    placeholder="Type a message to inject…"
                                    className="flex-1 bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500/40"
                                />
                                <button
                                    onClick={sendCustom}
                                    disabled={connectionState !== 'connected' || !customMessage.trim()}
                                    className="px-4 py-2 rounded-lg text-xs font-medium bg-amber-500/20 border border-amber-500/40 text-amber-400 hover:bg-amber-500/30 disabled:opacity-40 disabled:pointer-events-none transition-all"
                                >
                                    Send
                                </button>
                            </div>
                        </div>

                        {/* Transcript */}
                        <div className="border border-white/10 rounded-xl bg-slate-900/50 overflow-hidden">
                            <div className="px-4 py-2 border-b border-white/5 flex items-center justify-between">
                                <span className="text-xs text-slate-400 uppercase tracking-widest">Transcript</span>
                                <button onClick={() => setTranscripts([])} className="text-[10px] text-slate-600 hover:text-slate-400">Clear</button>
                            </div>
                            <div className="p-3 space-y-2 max-h-56 overflow-y-auto">
                                {transcripts.length === 0 && (
                                    <p className="text-slate-600 text-[11px] text-center py-2">No transcript yet</p>
                                )}
                                {transcripts.map((t, i) => (
                                    <div key={i} className={`rounded px-2 py-1.5 text-[11px] ${t.role === 'user' ? 'bg-blue-500/10 border border-blue-500/15' : 'bg-white/5 border border-white/5'}`}>
                                        <div className="flex justify-between mb-0.5">
                                            <span className={t.role === 'user' ? 'text-blue-400' : 'text-emerald-400'}>
                                                {t.role.toUpperCase()}
                                            </span>
                                            <span className="text-slate-600 text-[10px]">{t.ts}</span>
                                        </div>
                                        <p className="text-slate-300 leading-relaxed break-words">{t.text}</p>
                                    </div>
                                ))}
                                <div ref={transcriptEndRef} />
                            </div>
                        </div>

                    </div>

                    {/* Right: Event log */}
                    <div className="border border-white/10 rounded-xl bg-slate-900/50 overflow-hidden flex flex-col">
                        <div className="px-4 py-2 border-b border-white/5 flex items-center justify-between shrink-0">
                            <span className="text-xs text-slate-400 uppercase tracking-widest">Event Log</span>
                            <div className="flex items-center gap-3">
                                <div className="flex gap-2 text-[9px]">
                                    <span className="text-amber-400">■ tool</span>
                                    <span className="text-blue-400">■ stt</span>
                                    <span className="text-emerald-400">■ agent</span>
                                    <span className="text-red-400">■ error</span>
                                </div>
                                <button onClick={() => setLog([])} className="text-[10px] text-slate-600 hover:text-slate-400">Clear</button>
                            </div>
                        </div>
                        <div className="p-3 space-y-0.5 overflow-y-auto flex-1 min-h-0 max-h-[70vh]">
                            {log.length === 0 && (
                                <p className="text-slate-600 text-[11px] text-center py-4">
                                    Connect and run a scenario to see events
                                </p>
                            )}
                            {log.map((entry) => (
                                <div key={entry.id} className="flex gap-2 text-[11px] leading-relaxed font-mono">
                                    <span className="text-slate-600 shrink-0">{entry.ts}</span>
                                    <span className={`shrink-0 w-28 ${CATEGORY_STYLES[entry.category]}`}>
                                        {entry.type}
                                    </span>
                                    <span className="text-slate-300 break-all">{entry.detail}</span>
                                </div>
                            ))}
                            <div ref={logEndRef} />
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function createSilentAudioStream(): MediaStream {
    const ctx = new AudioContext();
    const gainNode = ctx.createGain();
    gainNode.gain.value = 0;
    const dst = ctx.createMediaStreamDestination();
    // Connect a constant silent source so the stream has a valid audio track
    const bufferSource = ctx.createBufferSource();
    bufferSource.buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    bufferSource.loop = true;
    bufferSource.connect(gainNode);
    gainNode.connect(dst);
    bufferSource.start();
    return dst.stream;
}
