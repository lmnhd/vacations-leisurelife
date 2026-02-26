'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { SimStreamEvent, SimulationResult, TurnRecord, EndStateResult, GateResult, ToolCallEntry } from '@/tests/simulator-core';

// ─── Models ───────────────────────────────────────────────────────────────────

const AVAILABLE_MODELS = [
    { id: 'gpt-4o-mini',  label: 'GPT-4o mini',  desc: 'Fast & cheap (current default)' },
    { id: 'gpt-4o',       label: 'GPT-4o',        desc: 'Smarter, more expensive' },
    { id: 'gpt-4.1',      label: 'GPT-4.1',       desc: 'Smartest non-reasoning model' },
    { id: 'gpt-5-nano',   label: 'GPT-5 nano',    desc: 'Fastest, most cost-efficient GPT-5' },
    { id: 'gpt-5-mini',   label: 'GPT-5 mini',    desc: 'Cost-efficient GPT-5 for defined tasks' },
    { id: 'gpt-5',        label: 'GPT-5',          desc: 'Intelligent reasoning, coding & agentic' },
    { id: 'gpt-5.2',      label: 'GPT-5.2',       desc: 'Best for coding & agentic tasks' },
    { id: 'gpt-5.2-pro',  label: 'GPT-5.2 Pro',   desc: 'Smarter, more precise GPT-5.2' },
] as const;

type ModelId = typeof AVAILABLE_MODELS[number]['id'];

// ─── Turn display ─────────────────────────────────────────────────────────────

type TurnWithTools = TurnRecord & { tool_calls?: ToolCallEntry[] };

type GateEvent = {
    type: 'gate_passed' | 'gate_failed';
    condition: string;
    turn?: number;
    required_before?: number;
};

type RunState = {
    status: 'idle' | 'running' | 'done' | 'error';
    turns: TurnWithTools[];
    gates: GateEvent[];
    toolCalls: ToolCallEntry[];
    endState: EndStateResult[];
    result: SimulationResult | null;
    error: string | null;
};

const IDLE_STATE: RunState = {
    status: 'idle',
    turns: [],
    gates: [],
    toolCalls: [],
    endState: [],
    result: null,
    error: null,
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SimViewerPage() {
    const [scenarios, setScenarios] = useState<string[]>([]);
    const [selectedScenario, setSelectedScenario] = useState('');
    const [agentModel, setAgentModel] = useState<ModelId>('gpt-4o-mini');
    const [simulatorModel, setSimulatorModel] = useState<ModelId>('gpt-4o-mini');
    const [run, setRun] = useState<RunState>(IDLE_STATE);

    const chatEndRef = useRef<HTMLDivElement>(null);
    const toolEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        void fetch('/api/tests/sim-runner')
            .then((r) => r.json() as Promise<{ scenarios: string[] }>)
            .then((data) => {
                setScenarios(data.scenarios);
                if (data.scenarios.length > 0) setSelectedScenario(data.scenarios[0]);
            });
    }, []);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [run.turns]);

    useEffect(() => {
        toolEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [run.toolCalls, run.gates]);

    const startRun = useCallback(() => {
        if (!selectedScenario) return;
        setRun({ ...IDLE_STATE, status: 'running' });

        const es = new EventSource(
            `/api/tests/sim-runner?scenarioId=${encodeURIComponent(selectedScenario)}&agentModel=${agentModel}&simulatorModel=${simulatorModel}`
        );

        // EventSource is GET-only, so we use fetch + ReadableStream instead
        es.close();

        void (async () => {
            const response = await fetch('/api/tests/sim-runner', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ scenarioId: selectedScenario, agentModel, simulatorModel }),
            });

            if (!response.body) {
                setRun((prev) => ({ ...prev, status: 'error', error: 'No stream body' }));
                return;
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });

                const lines = buffer.split('\n');
                buffer = lines.pop() ?? '';

                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    const raw = line.slice(6).trim();
                    if (!raw) continue;

                    const event = JSON.parse(raw) as SimStreamEvent;

                    setRun((prev) => {
                        switch (event.type) {
                            case 'turn_user':
                                return { ...prev, turns: [...prev.turns, { turn: event.turn, role: 'user', content: event.content }] };

                            case 'turn_agent': {
                                const newTurn: TurnWithTools = { turn: event.turn, role: 'agent', content: event.content, tool_calls: event.tool_calls };
                                const newToolCalls = event.tool_calls.length > 0
                                    ? [...prev.toolCalls, ...event.tool_calls]
                                    : prev.toolCalls;
                                return { ...prev, turns: [...prev.turns, newTurn], toolCalls: newToolCalls };
                            }

                            case 'gate_passed':
                                return { ...prev, gates: [...prev.gates, { type: 'gate_passed', condition: event.condition, turn: event.turn }] };

                            case 'gate_failed':
                                return { ...prev, gates: [...prev.gates, { type: 'gate_failed', condition: event.condition, required_before: event.required_before }] };

                            case 'goal_achieved':
                                return { ...prev, gates: [...prev.gates, { type: 'gate_passed', condition: `🎯 Goal achieved at turn ${event.turn}`, turn: event.turn }] };

                            case 'end_state':
                                return { ...prev, endState: event.results };

                            case 'done':
                                return { ...prev, status: 'done', result: event.result };

                            case 'error':
                                return { ...prev, status: 'error', error: event.message };

                            default:
                                return prev;
                        }
                    });
                }
            }
        })();
    }, [selectedScenario, agentModel, simulatorModel]);

    const isRunning = run.status === 'running';

    return (
        <div className="flex flex-col h-screen bg-slate-950 text-slate-100 overflow-hidden">

            {/* ── Toolbar ── */}
            <div className="flex-none flex flex-wrap items-center gap-3 px-4 py-3 border-b border-slate-800 bg-slate-900/60">

                <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider">Scenario</span>
                    <select
                        value={selectedScenario}
                        onChange={(e) => setSelectedScenario(e.target.value)}
                        disabled={isRunning}
                        className="bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-cyan-500 disabled:opacity-50 min-w-[220px]"
                    >
                        {scenarios.map((s) => (
                            <option key={s} value={s}>{s.replace(/-/g, ' ')}</option>
                        ))}
                    </select>
                </div>

                <ModelSelector
                    label="Agent Model"
                    value={agentModel}
                    onChange={(v) => setAgentModel(v as ModelId)}
                    disabled={isRunning}
                />

                <ModelSelector
                    label="Simulator Model"
                    value={simulatorModel}
                    onChange={(v) => setSimulatorModel(v as ModelId)}
                    disabled={isRunning}
                />

                <div className="flex items-end gap-2 ml-auto">
                    <button
                        onClick={startRun}
                        disabled={isRunning || !selectedScenario}
                        className="bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-semibold px-5 py-1.5 rounded text-sm transition-colors"
                    >
                        {isRunning ? '⏳ Running…' : '▶ Run Scenario'}
                    </button>
                    {run.status !== 'idle' && (
                        <button
                            onClick={() => setRun(IDLE_STATE)}
                            disabled={isRunning}
                            className="bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-slate-300 px-3 py-1.5 rounded text-sm transition-colors"
                        >
                            Reset
                        </button>
                    )}
                </div>

                {/* Result badge */}
                {run.status === 'done' && run.result && (
                    <div className={`px-3 py-1.5 rounded text-sm font-bold ${run.result.passed ? 'bg-emerald-900/60 text-emerald-300 border border-emerald-700' : 'bg-red-900/60 text-red-300 border border-red-700'}`}>
                        {run.result.passed ? '✅ PASSED' : '❌ FAILED'} · {run.result.turns_completed} turns · ${run.result.total_cost_estimate_usd.toFixed(4)}
                    </div>
                )}
                {run.status === 'error' && (
                    <div className="px-3 py-1.5 rounded text-sm font-bold bg-red-900/60 text-red-300 border border-red-700">
                        💥 {run.error}
                    </div>
                )}
            </div>

            {/* ── Split panes ── */}
            <div className="flex flex-1 overflow-hidden">

                {/* Left: Chat transcript */}
                <div className="flex flex-col flex-1 border-r border-slate-800 overflow-hidden">
                    <div className="flex-none px-4 py-2 bg-slate-900/40 border-b border-slate-800 flex items-center justify-between">
                        <span className="text-xs font-mono text-cyan-400 uppercase tracking-wider">💬 Conversation</span>
                        <span className="text-xs text-slate-500">{run.turns.length} messages</span>
                    </div>
                    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 font-mono text-sm">
                        {run.status === 'idle' && (
                            <div className="text-center py-20 text-slate-600">Select a scenario and click Run to start.</div>
                        )}
                        {run.turns.map((turn, i) => (
                            <TurnBubble key={i} turn={turn} />
                        ))}
                        {isRunning && (
                            <div className="flex items-center gap-2 text-slate-500 text-xs">
                                <span className="animate-pulse">●</span>
                                <span>Waiting for next turn…</span>
                            </div>
                        )}
                        <div ref={chatEndRef} />
                    </div>
                </div>

                {/* Right: Tool calls + Gates + End-State */}
                <div className="flex flex-col w-[420px] min-w-[320px] overflow-hidden">

                    {/* Gates */}
                    <div className="flex-none border-b border-slate-800">
                        <div className="px-4 py-2 bg-slate-900/40 flex items-center justify-between">
                            <span className="text-xs font-mono text-yellow-400 uppercase tracking-wider">🚦 Gates</span>
                            <span className="text-xs text-slate-500">{run.gates.length}</span>
                        </div>
                        <div className="max-h-36 overflow-y-auto px-3 py-2 space-y-1.5">
                            {run.gates.length === 0 && run.status !== 'idle' && (
                                <p className="text-xs text-slate-600 py-2">No gate events yet.</p>
                            )}
                            {run.gates.map((g, i) => (
                                <div key={i} className={`flex items-start gap-2 text-xs rounded px-2 py-1.5 ${g.type === 'gate_passed' ? 'bg-emerald-950/40 text-emerald-300' : 'bg-red-950/40 text-red-400'}`}>
                                    <span className="flex-none mt-0.5">{g.type === 'gate_passed' ? '✓' : '✗'}</span>
                                    <span className="flex-1 leading-relaxed">{g.condition}{g.turn ? ` (turn ${g.turn})` : g.required_before ? ` (req. before ${g.required_before})` : ''}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Tool calls */}
                    <div className="flex flex-col flex-1 overflow-hidden border-b border-slate-800">
                        <div className="flex-none px-4 py-2 bg-slate-900/40 flex items-center justify-between">
                            <span className="text-xs font-mono text-purple-400 uppercase tracking-wider">🔧 Tool Calls</span>
                            <span className="text-xs text-slate-500">{run.toolCalls.length} dispatched</span>
                        </div>
                        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
                            {run.toolCalls.length === 0 && run.status !== 'idle' && (
                                <p className="text-xs text-slate-500 py-3">No tool calls yet. The agent hasn&apos;t emitted any <code>[Tool: ...]</code> directives.</p>
                            )}
                            {run.toolCalls.map((tc, i) => (
                                <ToolCallCard key={i} entry={tc} />
                            ))}
                            <div ref={toolEndRef} />
                        </div>
                    </div>

                    {/* End-state assertions */}
                    {run.endState.length > 0 && (
                        <div className="flex-none border-t border-slate-800">
                            <div className="px-4 py-2 bg-slate-900/40">
                                <span className="text-xs font-mono text-blue-400 uppercase tracking-wider">📋 End State</span>
                            </div>
                            <div className="px-3 py-2 space-y-1.5 max-h-48 overflow-y-auto">
                                {run.endState.map((r, i) => (
                                    <div key={i} className={`flex items-center gap-2 text-xs px-2 py-1.5 rounded ${r.passed ? 'bg-emerald-950/40 text-emerald-300' : 'bg-red-950/40 text-red-400'}`}>
                                        <span className="flex-none">{r.passed ? '✓' : '✗'}</span>
                                        <span className="flex-1 font-mono">{r.field}</span>
                                        <span className="text-slate-400 truncate max-w-[120px]">{JSON.stringify(r.actual)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ModelSelector({ label, value, onChange, disabled }: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    disabled: boolean;
}) {
    return (
        <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</span>
            <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                disabled={disabled}
                className="bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-cyan-500 disabled:opacity-50 min-w-[180px]"
            >
                {AVAILABLE_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>{m.label} — {m.desc}</option>
                ))}
            </select>
        </div>
    );
}

function TurnBubble({ turn }: { turn: TurnWithTools }) {
    const isUser = turn.role === 'user';
    return (
        <div className={`flex flex-col gap-1 ${isUser ? 'items-start' : 'items-start'}`}>
            <div className="flex items-center gap-2">
                <span className={`text-[10px] font-bold uppercase tracking-wider ${isUser ? 'text-cyan-400' : 'text-amber-400'}`}>
                    {isUser ? `👤 User · Turn ${turn.turn}` : `🤖 Agent · Turn ${turn.turn}`}
                </span>
                {(turn.tool_calls?.length ?? 0) > 0 && (
                    <span className="text-[10px] bg-purple-900/60 text-purple-300 px-1.5 py-0.5 rounded border border-purple-700">
                        🔧 {turn.tool_calls!.length} tool{turn.tool_calls!.length > 1 ? 's' : ''}
                    </span>
                )}
            </div>
            <div className={`rounded-lg px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap w-full ${isUser ? 'bg-slate-800 text-slate-200 border border-slate-700' : 'bg-slate-900 text-slate-100 border border-slate-700/60'}`}>
                {turn.content}
            </div>
        </div>
    );
}

function ToolCallCard({ entry }: { entry: ToolCallEntry }) {
    const [expanded, setExpanded] = useState(false);
    const statusColor = entry.status === 'executed' ? 'text-emerald-400' : 'text-yellow-400';

    return (
        <div className="bg-slate-900 border border-slate-700 rounded text-xs overflow-hidden">
            <button
                onClick={() => setExpanded((v) => !v)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-800 transition-colors"
            >
                <span className="flex-none text-purple-300 font-mono font-bold">{entry.toolId}</span>
                <span className={`flex-none text-[10px] ${statusColor}`}>{entry.status}</span>
                {entry.turn !== undefined && (
                    <span className="ml-auto text-slate-500 text-[10px]">turn {entry.turn}</span>
                )}
                <span className="text-slate-500">{expanded ? '▲' : '▼'}</span>
            </button>
            {expanded && (
                <pre className="px-3 pb-3 text-[11px] text-slate-300 whitespace-pre-wrap overflow-auto max-h-48 bg-slate-950 border-t border-slate-800">
                    {JSON.stringify(entry.payload, null, 2)}
                </pre>
            )}
        </div>
    );
}
