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
    rejectionFeedback: FeedbackItem[];
    history: AgentTurn[];
}

// ────────────────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
    const colorMap: Record<string, string> = {
        approved: 'bg-green-100 text-green-800',
        max_rounds_exhausted: 'bg-amber-100 text-amber-800',
        running: 'bg-blue-100 text-blue-800',
        rejected: 'bg-red-100 text-red-800',
    };
    const cls = colorMap[status] ?? 'bg-gray-100 text-gray-700';
    return (
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>
            {status.replace(/_/g, ' ')}
        </span>
    );
}

function SeverityBadge({ severity }: { severity: string }) {
    const cls = severity === 'blocker'
        ? 'bg-red-100 text-red-700'
        : 'bg-yellow-100 text-yellow-700';
    return (
        <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${cls}`}>
            {severity}
        </span>
    );
}

function AgentBadge({ agent }: { agent: string }) {
    const colorMap: Record<string, string> = {
        designer: 'bg-purple-100 text-purple-700',
        builder: 'bg-blue-100 text-blue-700',
        reviewer: 'bg-orange-100 text-orange-700',
    };
    const cls = colorMap[agent] ?? 'bg-gray-100 text-gray-700';
    return (
        <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold uppercase ${cls}`}>
            {agent}
        </span>
    );
}

function TurnCard({ turn }: { turn: AgentTurn }) {
    const [expanded, setExpanded] = useState(false);
    const hasFeedback = turn.decision.feedback.length > 0;

    return (
        <div className="border border-gray-200 rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <AgentBadge agent={turn.agent} />
                    <span className="text-sm text-gray-500">Round {turn.round}</span>
                    {turn.agent === 'reviewer' && (
                        <span className={`text-xs font-medium ${turn.decision.approved ? 'text-green-600' : 'text-red-600'}`}>
                            {turn.decision.approved ? '✓ Approved' : '✗ Rejected'}
                        </span>
                    )}
                </div>
                <span className="text-xs text-gray-400">{new Date(turn.createdAt).toLocaleTimeString()}</span>
            </div>

            {hasFeedback && (
                <div>
                    <button
                        onClick={() => setExpanded(!expanded)}
                        className="text-xs text-gray-500 hover:text-gray-700 underline"
                    >
                        {expanded ? 'Hide' : 'Show'} {turn.decision.feedback.length} feedback item(s)
                    </button>
                    {expanded && (
                        <div className="mt-2 space-y-1.5">
                            {turn.decision.feedback.map((item, idx) => (
                                <div key={idx} className="bg-gray-50 rounded p-2 text-sm space-y-1">
                                    <div className="flex items-center gap-2">
                                        <SeverityBadge severity={item.severity} />
                                        <span className="font-mono text-xs text-gray-600">{item.code}</span>
                                        <span className="text-xs text-gray-400">→ {item.targetRole}</span>
                                    </div>
                                    <p className="text-gray-700 text-xs">{item.message}</p>
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
            <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
                <h2 className="text-base font-semibold text-gray-800">Session Result</h2>
                <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                        <span className="text-gray-500">Session ID</span>
                        <p className="font-mono text-xs text-gray-700 break-all">{result.sessionId}</p>
                    </div>
                    <div>
                        <span className="text-gray-500">Campaign</span>
                        <p className="font-medium text-gray-800">{result.campaignId}</p>
                    </div>
                    <div>
                        <span className="text-gray-500">Status</span>
                        <div className="mt-0.5"><StatusBadge status={result.status} /></div>
                    </div>
                    <div>
                        <span className="text-gray-500">Rounds completed</span>
                        <p className="font-medium text-gray-800">{result.round}</p>
                    </div>
                    <div>
                        <span className="text-gray-500">Brief persisted</span>
                        <p className={`font-medium ${result.briefPersisted ? 'text-green-600' : 'text-gray-500'}`}>
                            {result.briefPersisted ? 'Yes — saved as canonical brief' : 'No'}
                        </p>
                    </div>
                </div>

                {result.rejectionFeedback.length > 0 && (
                    <div className="mt-3 border-t border-gray-100 pt-3">
                        <p className="text-sm font-medium text-red-700 mb-2">Unresolved blockers at max rounds:</p>
                        <div className="space-y-1.5">
                            {result.rejectionFeedback.map((item, idx) => (
                                <div key={idx} className="bg-red-50 rounded p-2 text-xs space-y-0.5">
                                    <div className="flex items-center gap-2">
                                        <SeverityBadge severity={item.severity} />
                                        <span className="font-mono text-gray-600">{item.code}</span>
                                        <span className="text-gray-400">→ {item.targetRole}</span>
                                    </div>
                                    <p className="text-gray-700">{item.message}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            <div className="space-y-4">
                <h2 className="text-base font-semibold text-gray-800">Agent History</h2>
                {Object.entries(roundGroups).map(([round, turns]) => (
                    <div key={round} className="space-y-2">
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Round {round}</p>
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
// Main page
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
        <div className="min-h-screen bg-gray-50 py-10 px-4">
            <div className="max-w-3xl mx-auto space-y-8">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Trinity Pipeline Test</h1>
                    <p className="mt-1 text-sm text-gray-500">
                        Runs Designer → Builder → Reviewer in a consensus loop. Persists the brief only on Reviewer approval.
                    </p>
                </div>

                <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
                    <h2 className="text-sm font-semibold text-gray-700">Configuration</h2>

                    <div className="space-y-1">
                        <label className="block text-xs font-medium text-gray-600">Campaign Slug</label>
                        <input
                            type="text"
                            value={slug}
                            onChange={(e) => setSlug(e.target.value)}
                            placeholder="e.g. needle-drop-2026"
                            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                    </div>

                    <div className="space-y-1">
                        <label className="block text-xs font-medium text-gray-600">Max Rounds (1–5)</label>
                        <input
                            type="number"
                            min={1}
                            max={5}
                            value={maxRounds}
                            onChange={(e) => setMaxRounds(Math.max(1, Math.min(5, parseInt(e.target.value) || 1)))}
                            className="w-24 rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                    </div>

                    <button
                        onClick={runTrinity}
                        disabled={loading || !normalizedSlug}
                        className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? 'Running Trinity session...' : 'Run Trinity'}
                    </button>

                    <div className="text-xs text-gray-400 bg-gray-50 rounded p-3 space-y-1">
                        <p><span className="font-semibold text-purple-600">Designer</span> — messaging, visual identity, community expression, merch</p>
                        <p><span className="font-semibold text-blue-600">Builder</span> — productionBible, landingStillBible, filmability</p>
                        <p><span className="font-semibold text-orange-600">Reviewer</span> — philosophy adherence, coherence, final approval</p>
                        <p><span className="font-semibold text-gray-600">Kernel</span> — hard structural assertions before and after</p>
                    </div>
                </div>

                {error && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
                        <strong>Error:</strong> {error}
                    </div>
                )}

                {result && <SessionPanel result={result} />}
            </div>
        </div>
    );
}
