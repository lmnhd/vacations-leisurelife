'use client';

import { useState, useCallback } from 'react';

// ────────────────────────────────────────────────────────────────────────────
// Local types — mirroring TrinityRunResponse and session history shapes
// ────────────────────────────────────────────────────────────────────────────

interface FeedbackItem {
    code: string;
    message: string;
    targetRole: string;
    severity: 'warning' | 'blocker';
}

interface AgentDecision {
    approved: boolean;
    feedback: FeedbackItem[];
}

interface AgentTurn {
    agent: 'designer' | 'builder' | 'reviewer';
    round: number;
    decision: AgentDecision;
    createdAt: string;
}

interface TrinityRunResponse {
    sessionId: string;
    campaignId: string;
    status: string;
    round: number;
    approved: boolean;
    briefPersisted: boolean;
    warnings: string[];
    rejectionFeedback: FeedbackItem[];
    history: AgentTurn[];
}

// ────────────────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
    const colorMap: Record<string, string> = {
        approved: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
        max_rounds_exhausted: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
        running: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
        rejected: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
    };
    const cls = colorMap[status] ?? 'bg-slate-500/20 text-slate-300 border-slate-500/30';
    return (
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 border text-xs font-medium ${cls}`}>
            {status.replace(/_/g, ' ')}
        </span>
    );
}

function SeverityBadge({ severity }: { severity: string }) {
    const cls = severity === 'blocker'
        ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
        : 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30';
    return (
        <span className={`inline-flex items-center rounded px-1.5 py-0.5 border text-xs font-medium ${cls}`}>
            {severity}
        </span>
    );
}

function AgentBadge({ agent }: { agent: string }) {
    const colorMap: Record<string, string> = {
        designer: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
        builder: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
        reviewer: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
    };
    const cls = colorMap[agent] ?? 'bg-slate-500/20 text-slate-300 border-slate-500/30';
    return (
        <span className={`inline-flex items-center rounded px-2 py-0.5 border text-xs font-semibold uppercase tracking-wider ${cls}`}>
            {agent}
        </span>
    );
}

function TurnCard({ turn }: { turn: AgentTurn }) {
    const [expanded, setExpanded] = useState(false);
    const hasFeedback = turn.decision.feedback.length > 0;

    return (
        <div className="p-4 space-y-2 border rounded-lg border-white/10 bg-slate-900/30">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <AgentBadge agent={turn.agent} />
                    <span className="text-sm text-slate-400">Round {turn.round}</span>
                    {turn.agent === 'reviewer' && (
                        <span className={`text-xs font-medium ${turn.decision.approved ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {turn.decision.approved ? '✓ Approved' : '✗ Rejected'}
                        </span>
                    )}
                </div>
                <span className="text-xs text-slate-500">{new Date(turn.createdAt).toLocaleTimeString()}</span>
            </div>

            {hasFeedback && (
                <div>
                    <button
                        onClick={() => setExpanded(!expanded)}
                        className="text-xs underline text-slate-400 hover:text-slate-300"
                    >
                        {expanded ? 'Hide' : 'Show'} {turn.decision.feedback.length} feedback item(s)
                    </button>
                    {expanded && (
                        <div className="mt-2 space-y-1.5">
                            {turn.decision.feedback.map((item, idx) => (
                                <div key={idx} className="p-2 space-y-1 text-sm border rounded bg-slate-950/50 border-white/5">
                                    <div className="flex items-center gap-2">
                                        <SeverityBadge severity={item.severity} />
                                        <span className="font-mono text-xs text-slate-400">{item.code}</span>
                                        <span className="text-xs text-slate-500">→ {item.targetRole}</span>
                                    </div>
                                    <p className="text-xs text-slate-300">{item.message}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function SessionPanel({ result }: { result: TrinityRunResponse }) {
    const roundGroups: Record<number, AgentTurn[]> = {};
    for (const turn of result.history) {
        if (!roundGroups[turn.round]) roundGroups[turn.round] = [];
        roundGroups[turn.round].push(turn);
    }

    return (
        <div className="space-y-6">
            <div className="p-5 space-y-3 border border-white/10 rounded-xl bg-slate-900/50">
                <h2 className="text-base font-semibold text-slate-200">Session Result</h2>
                <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                        <span className="text-slate-500">Session ID</span>
                        <p className="font-mono text-xs break-all text-slate-300">{result.sessionId}</p>
                    </div>
                    <div>
                        <span className="text-slate-500">Campaign</span>
                        <p className="font-medium text-slate-200">{result.campaignId}</p>
                    </div>
                    <div>
                        <span className="text-slate-500">Status</span>
                        <div className="mt-0.5"><StatusBadge status={result.status} /></div>
                    </div>
                    <div>
                        <span className="text-slate-500">Rounds completed</span>
                        <p className="font-medium text-slate-200">{result.round}</p>
                    </div>
                    <div>
                        <span className="text-slate-500">Brief persisted</span>
                        <p className={`font-medium ${result.briefPersisted ? 'text-emerald-400' : 'text-slate-500'}`}>
                            {result.briefPersisted ? 'Yes — saved as canonical brief' : 'No'}
                        </p>
                    </div>
                </div>

                {result.rejectionFeedback.length > 0 && (
                    <div className="pt-4 mt-4 border-t border-white/10">
                        <p className="mb-2 text-sm font-medium text-rose-400">Unresolved blockers at max rounds:</p>
                        <div className="space-y-1.5">
                            {result.rejectionFeedback.map((item, idx) => (
                                <div key={idx} className="p-2 space-y-1 text-xs border rounded bg-red-950/30 border-red-500/20">
                                    <div className="flex items-center gap-2">
                                        <SeverityBadge severity={item.severity} />
                                        <span className="font-mono text-slate-400">{item.code}</span>
                                        <span className="text-slate-500">→ {item.targetRole}</span>
                                    </div>
                                    <p className="text-slate-300">{item.message}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            <div className="space-y-4">
                <h2 className="text-base font-semibold text-slate-200">Agent History</h2>
                {Object.entries(roundGroups).map(([round, turns]) => (
                    <div key={round} className="space-y-2">
                        <p className="text-xs font-semibold tracking-widest uppercase text-slate-500">Round {round}</p>
                        {turns.map((turn, idx) => (
                            <TurnCard key={idx} turn={turn} />
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );
}

// ────────────────────────────────────────────────────────────────────────────
// Main Page Component
// ────────────────────────────────────────────────────────────────────────────

export default function TrinityTestPage() {
    const [slug, setSlug] = useState('');
    const [maxRounds, setMaxRounds] = useState(3);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<TrinityRunResponse | null>(null);
    const [error, setError] = useState<string | null>(null);

    const normalizedSlug = slug.trim();

    const runTrinity = useCallback(async () => {
        if (!normalizedSlug) return;
        setLoading(true);
        setResult(null);
        setError(null);

        try {
            const response = await fetch(`/api/groups/campaign/${normalizedSlug}/media/aesthetic/trinity`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ maxRounds }),
            });

            const data = await response.json() as TrinityRunResponse & { error?: string };
            if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
            setResult(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error');
        } finally {
            setLoading(false);
        }
    }, [normalizedSlug, maxRounds]);

    return (
        <div className="min-h-screen px-4 py-10 font-mono bg-slate-950 text-slate-300">
            <div className="max-w-3xl mx-auto space-y-8">
                <div className="p-6 border border-white/10 rounded-xl bg-slate-900/50">
                    <h1 className="text-lg font-semibold tracking-wide text-cyan-400">Trinity Pipeline Test</h1>
                    <p className="mt-1 text-xs text-slate-500">
                        Runs Designer → Builder → Reviewer in a consensus loop. Persists the brief only on Reviewer approval.
                    </p>
                </div>

                <div className="p-5 space-y-4 border border-white/10 rounded-xl bg-slate-900/50">
                    <h2 className="text-sm font-semibold text-slate-200">Configuration</h2>

                    <div className="space-y-1.5">
                        <label className="block text-[10px] text-slate-500 uppercase tracking-widest">Campaign Slug</label>
                        <input
                            type="text"
                            value={slug}
                            onChange={(e) => setSlug(e.target.value)}
                            placeholder="e.g. needle-drop-2026"
                            className="w-full px-3 py-2 text-sm border rounded-lg bg-slate-800 border-white/10 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500/40"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="block text-[10px] text-slate-500 uppercase tracking-widest">Max Rounds (1–5)</label>
                        <input
                            type="number"
                            min={1}
                            max={5}
                            value={maxRounds}
                            onChange={(e) => setMaxRounds(Math.max(1, Math.min(5, parseInt(e.target.value) || 1)))}
                            className="w-24 px-3 py-2 text-sm border rounded-lg bg-slate-800 border-white/10 text-slate-200 focus:outline-none focus:border-cyan-500/40"
                        />
                    </div>

                    <button
                        onClick={runTrinity}
                        disabled={loading || !normalizedSlug}
                        className="w-full rounded-lg bg-cyan-500/20 border border-cyan-500/30 px-4 py-2.5 text-sm font-semibold text-cyan-300 hover:bg-cyan-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                    >
                        {loading ? 'Running Trinity session...' : 'Run Trinity'}
                    </button>

                    <div className="text-xs text-slate-400 bg-slate-950/50 border border-white/5 rounded p-3 space-y-1.5">
                        <p><span className="font-semibold text-purple-400">Designer</span> — messaging, visual identity, community expression, merch</p>
                        <p><span className="font-semibold text-blue-400">Builder</span> — productionBible, landingStillBible, filmability</p>
                        <p><span className="font-semibold text-orange-400">Reviewer</span> — philosophy adherence, coherence, final approval</p>
                        <p><span className="font-semibold text-slate-500">Kernel</span> — hard structural assertions before and after</p>
                    </div>
                </div>

                {error && (
                    <div className="p-4 text-sm text-red-400 border rounded-lg bg-red-500/10 border-red-500/20">
                        <strong>Error:</strong> {error}
                    </div>
                )}

                {result && result.warnings.length > 0 && (
                    <div className="p-4 text-sm border rounded-lg bg-amber-500/10 border-amber-500/20 text-amber-200">
                        <strong>Warnings:</strong>
                        <div className="mt-2 space-y-1">
                            {result.warnings.map((warning, index) => (
                                <p key={index}>{warning}</p>
                            ))}
                        </div>
                    </div>
                )}

                {result && <SessionPanel result={result} />}
            </div>
        </div>
    );
}
