'use client';

/**
 * Chat Pipeline Test Page
 *
 * Live text chat with the /api/chat pipeline.
 * Mirrors the voice-hybrid test page layout for consistent troubleshooting.
 * Shows full conversation, tool call log, and pipeline timing.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatResponse, ToolCallLogEntry } from '@/lib/chat/types';

const TEST_SESSION_ID = 'chat-pipeline-test-001';
const TEST_USER_ID = 'chat-tester';

interface TranscriptEntry {
    id: string;
    role: 'user' | 'assistant';
    text: string;
    ts: string;
    pipelineMs?: number;
    toolCalls?: ToolCallLogEntry[];
}

interface LogEntry {
    id: string;
    ts: string;
    text: string;
    type: 'info' | 'event' | 'error' | 'pipeline' | 'tool';
}

export default function ChatPipelinePage() {
    const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([]);
    const [log, setLog] = useState<LogEntry[]>([]);
    const [startingContext, setStartingContext] = useState('fast_cruise_search');
    const [input, setInput] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [sessionId, setSessionId] = useState(TEST_SESSION_ID);

    const pipelineStartRef = useRef<number>(0);
    const logEndRef = useRef<HTMLDivElement>(null);
    const transcriptEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    const addLog = useCallback((text: string, type: LogEntry['type'] = 'info') => {
        const ts = new Date().toLocaleTimeString();
        setLog(prev => [...prev, { id: `${Date.now()}-${Math.random()}`, ts, text, type }]);
        setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    }, []);

    useEffect(() => {
        addLog(`Session: ${sessionId} | Context: ${startingContext}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const triggerWarmup = useCallback(async () => {
        addLog('[warmup] Pre-warming Odysseus session...');
        try {
            const res = await fetch('/api/voice/odysseus-warmup', { method: 'POST' });
            const data = await res.json() as { status?: string; durationMs?: number; message?: string };
            addLog(`[warmup] ${data.status ?? '?'} — ${data.message ?? ''} (${data.durationMs ?? '?'}ms)`);
        } catch (err) {
            addLog(`[warmup] error — ${String(err)}`, 'error');
        }
    }, [addLog]);

    const sendMessage = useCallback(async () => {
        const message = input.trim();
        if (!message || isProcessing) return;

        setInput('');
        setIsProcessing(true);
        pipelineStartRef.current = Date.now();

        setTranscripts(prev => [...prev, {
            id: `${Date.now()}`,
            role: 'user',
            text: message,
            ts: new Date().toLocaleTimeString(),
        }]);
        addLog(`Routing to /api/chat pipeline...`, 'pipeline');
        addLog(`model: gpt-5-mini | context: ${startingContext}`, 'info');

        try {
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message,
                    sessionId,
                    userId: TEST_USER_ID,
                    channel: 'text',
                    model: 'gpt-5-mini',
                    ...(startingContext ? { startingContext } : {}),
                }),
            });

            const pipelineMs = Date.now() - pipelineStartRef.current;

            if (!res.ok) {
                addLog(`ERROR: Pipeline HTTP ${res.status} — ${res.statusText}`, 'error');
                setIsProcessing(false);
                return;
            }

            const data = await res.json() as ChatResponse;

            if (data.reply) {
                setTranscripts(prev => [...prev, {
                    id: `${Date.now()}`,
                    role: 'assistant',
                    text: data.reply,
                    ts: new Date().toLocaleTimeString(),
                    pipelineMs,
                    toolCalls: data.toolCallsLog ?? [] as ToolCallLogEntry[],
                }]);
                addLog(`Reply (${pipelineMs}ms): "${data.reply.slice(0, 100)}"`, 'pipeline');
                setTimeout(() => transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
            }

            if (data.toolCallsLog && data.toolCallsLog.length > 0) {
                for (const t of data.toolCallsLog) {
                    addLog(`tool: ${t.toolId} → ${t.status}`, 'tool');
                }
            }
        } catch (err) {
            addLog(`ERROR: ${String(err)}`, 'error');
        } finally {
            setIsProcessing(false);
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [input, isProcessing, sessionId, startingContext, addLog]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void sendMessage();
        }
    }, [sendMessage]);

    const handleNewSession = useCallback(() => {
        const newId = `chat-test-${Date.now()}`;
        setSessionId(newId);
        setTranscripts([]);
        setLog([]);
        addLog(`New session: ${newId}`);
    }, [addLog]);

    const logTypeColor: Record<LogEntry['type'], string> = {
        info: 'text-slate-400',
        event: 'text-cyan-400',
        error: 'text-red-400',
        pipeline: 'text-violet-400',
        tool: 'text-amber-400',
    };

    return (
        <div className="min-h-screen bg-slate-950 text-white p-6 font-mono">
            <div className="max-w-4xl mx-auto space-y-6">

                {/* Header */}
                <div className="border border-white/10 rounded-xl p-4 bg-slate-900/50">
                    <h1 className="text-lg font-semibold text-emerald-400 tracking-wide">
                        💬 Chat Pipeline Test
                    </h1>
                    <p className="text-xs text-slate-500 mt-1">
                        Live text chat directly through{' '}
                        <span className="text-emerald-400">/api/chat</span> pipeline — no voice layer.
                    </p>
                    <div className="mt-3 p-3 rounded-lg bg-slate-800/60 border border-white/5 text-[11px] text-slate-400 space-y-1">
                        <div className="text-slate-300 font-semibold mb-1">Related Test Pages</div>
                        <div>
                            <span className="text-emerald-400">Chat Pipeline</span>
                            {' → this page — full pipeline, no voice layer'}
                        </div>
                        <div>
                            <span className="text-violet-400">Hybrid Voice</span>
                            {' → /tests/voice-hybrid — Realtime STT+TTS + text pipeline'}
                        </div>
                        <div>
                            <span className="text-cyan-400">Pure Realtime</span>
                            {' → /tests/voice-pipeline — agent reasons inside Realtime'}
                        </div>
                    </div>
                </div>

                {/* Controls */}
                <div className="border border-white/10 rounded-xl p-4 bg-slate-900/50 space-y-3">
                    <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-500">Session</span>
                        <span className="text-[10px] text-slate-600 truncate max-w-[260px]">{sessionId}</span>
                    </div>

                    <div className="flex gap-3">
                        <div className="flex-1 space-y-1">
                            <label className="text-[11px] text-slate-500">Starting Context</label>
                            <select
                                value={startingContext}
                                onChange={e => setStartingContext(e.target.value)}
                                disabled={isProcessing}
                                className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500/40 disabled:opacity-40"
                            >
                                <option value="">— Auto (trigger-based) —</option>
                                <option value="fast_cruise_search">fast_cruise_search</option>
                                <option value="onboarding">onboarding</option>
                                <option value="general_chat">general_chat</option>
                            </select>
                        </div>

                        <div className="flex flex-col gap-2 justify-end">
                            <button
                                onClick={() => void triggerWarmup()}
                                disabled={isProcessing}
                                className="px-3 py-2 rounded-lg text-xs font-medium bg-slate-700/60 border border-white/10 text-slate-300 hover:bg-slate-700 disabled:opacity-40 transition-all"
                            >
                                🔥 Warmup Odysseus
                            </button>
                            <button
                                onClick={handleNewSession}
                                disabled={isProcessing}
                                className="px-3 py-2 rounded-lg text-xs font-medium bg-slate-700/60 border border-white/10 text-slate-300 hover:bg-slate-700 disabled:opacity-40 transition-all"
                            >
                                🔄 New Session
                            </button>
                        </div>
                    </div>

                    {isProcessing && (
                        <div className="flex items-center gap-2 text-xs text-violet-400">
                            <span className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
                            Pipeline running...
                        </div>
                    )}
                </div>

                {/* Conversation */}
                <div className="border border-white/10 rounded-xl p-4 bg-slate-900/50 space-y-3">
                    <div className="flex items-center justify-between">
                        <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                            Conversation
                        </h2>
                        <span className="text-[10px] text-slate-600">{transcripts.length} turns</span>
                    </div>

                    <div className="space-y-3 min-h-[80px] max-h-[420px] overflow-y-auto">
                        {transcripts.length === 0 ? (
                            <p className="text-xs text-slate-600 italic">No messages yet — type below.</p>
                        ) : (
                            transcripts.map(t => (
                                <div key={t.id} className={`text-xs ${t.role === 'user' ? 'text-slate-300' : 'text-emerald-300'}`}>
                                    <div className="flex items-baseline gap-2 mb-0.5">
                                        <span className={`font-semibold uppercase text-[10px] ${t.role === 'user' ? 'text-slate-500' : 'text-emerald-500'}`}>
                                            {t.role}
                                        </span>
                                        <span className="text-[10px] text-slate-600">{t.ts}</span>
                                        {t.pipelineMs !== undefined && (
                                            <span className="text-[10px] text-violet-600">
                                                {t.pipelineMs}ms
                                            </span>
                                        )}
                                        {t.toolCalls && t.toolCalls.length > 0 && (
                                            <span className="text-[10px] text-amber-600">
                                                {t.toolCalls.map(tc => tc.toolId).join(', ')}
                                            </span>
                                        )}
                                    </div>
                                    <div className="whitespace-pre-wrap">{t.text}</div>
                                </div>
                            ))
                        )}
                        <div ref={transcriptEndRef} />
                    </div>

                    {/* Input */}
                    <div className="flex gap-2 pt-2 border-t border-white/5">
                        <textarea
                            ref={inputRef}
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            disabled={isProcessing}
                            placeholder="Type a message… (Enter to send, Shift+Enter for newline)"
                            rows={2}
                            className="flex-1 bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500/40 resize-none disabled:opacity-40"
                        />
                        <button
                            onClick={() => void sendMessage()}
                            disabled={isProcessing || !input.trim()}
                            className="px-4 py-2 rounded-lg text-sm font-medium bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/30 disabled:opacity-40 disabled:pointer-events-none transition-all self-end"
                        >
                            {isProcessing ? '⏳' : '↑ Send'}
                        </button>
                    </div>
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
