'use client';

import { useState, useCallback } from 'react';

// ────────────────────────────────────────────────────────────────────────────
// Local types mirroring orchestrator response shapes
// ────────────────────────────────────────────────────────────────────────────

interface ValidationIssue {
    code: string;
    message: string;
    severity: 'blocker' | 'warning';
    autoFixable: boolean;
}

interface BriefEngineResult {
    readiness: 'drafting' | 'needs_review' | 'ready_for_media';
    brief: Record<string, unknown> | null;
    issues: ValidationIssue[];
    summary: string;
    warnings: string[];
    autoFixApplied: boolean;
    fixedCodes: string[];
    correctiveRepromptUsed: boolean;
}

interface ReadinessResult {
    readiness: 'drafting' | 'needs_review' | 'ready_for_media';
    brief: Record<string, unknown> | null;
    issues: ValidationIssue[];
    summary: string;
    campaignName: string | null;
}

interface ApprovalResult {
    readiness: 'ready_for_media';
    summary: string;
}

interface HistoryEntry {
    action: string;
    timestamp: string;
    details: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────────────────

function ReadinessBadge({ state }: { state: string }) {
    const map: Record<string, string> = {
        drafting: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
        needs_review: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
        ready_for_media: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    };
    const cls = map[state] ?? 'bg-slate-500/20 text-slate-300 border-slate-500/30';
    const label = state.replace(/_/g, ' ').toUpperCase();
    return (
        <span className={`inline-flex items-center rounded-full px-3 py-1 border text-xs font-semibold tracking-widest ${cls}`}>
            {label}
        </span>
    );
}

function IssueRow({ issue }: { issue: ValidationIssue }) {
    const severityCls = issue.severity === 'blocker'
        ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
        : 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30';
    return (
        <div className="flex items-start gap-3 p-3 border rounded-lg bg-slate-900/30 border-white/5">
            <span className={`shrink-0 inline-flex items-center rounded px-1.5 py-0.5 border text-[10px] font-semibold uppercase tracking-wider ${severityCls}`}>
                {issue.severity}
            </span>
            <div className="min-w-0 flex-1">
                <p className="text-xs font-mono text-slate-400">{issue.code}</p>
                <p className="text-xs text-slate-300 mt-0.5">{issue.message}</p>
            </div>
            {issue.autoFixable && (
                <span className="shrink-0 text-[10px] text-cyan-400 border border-cyan-500/30 rounded px-1.5 py-0.5">auto-fixable</span>
            )}
        </div>
    );
}

// ────────────────────────────────────────────────────────────────────────────
// Main Page Component
// ────────────────────────────────────────────────────────────────────────────

export default function BriefStudioPage() {
    const [slug, setSlug] = useState('');
    const [loading, setLoading] = useState(false);
    const [action, setAction] = useState<string | null>(null);
    const [readiness, setReadiness] = useState<ReadinessResult | null>(null);
    const [lastResult, setLastResult] = useState<BriefEngineResult | null>(null);
    const [history, setHistory] = useState<HistoryEntry[]>([]);
    const [error, setError] = useState<string | null>(null);

    const normalizedSlug = slug.trim();

    // ── Load readiness state ──────────────────────────────────────────
    const loadReadiness = useCallback(async () => {
        if (!normalizedSlug) return;
        setLoading(true);
        setAction('checking');
        setError(null);
        try {
            const res = await fetch(`/api/groups/campaign/${normalizedSlug}/brief/readiness`);
            const data = await res.json() as (ReadinessResult & { error?: string });
            if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
            setReadiness(data);
            setLastResult(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load readiness');
        } finally {
            setLoading(false);
            setAction(null);
        }
    }, [normalizedSlug]);

    // ── Generate / refresh brief ──────────────────────────────────────
    const generateBrief = useCallback(async () => {
        if (!normalizedSlug) return;
        setLoading(true);
        setAction('generating');
        setError(null);
        try {
            const res = await fetch(`/api/groups/campaign/${normalizedSlug}/brief`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            });
            const data = await res.json() as (BriefEngineResult & { error?: string });
            if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
            setLastResult(data);
            setReadiness({ readiness: data.readiness, brief: data.brief, issues: data.issues, summary: data.summary, campaignName: null });
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to generate brief');
        } finally {
            setLoading(false);
            setAction(null);
        }
    }, [normalizedSlug]);

    // ── Approve for media ─────────────────────────────────────────────
    const approve = useCallback(async () => {
        if (!normalizedSlug) return;
        setLoading(true);
        setAction('approving');
        setError(null);
        try {
            const res = await fetch(`/api/groups/campaign/${normalizedSlug}/brief/approve`, { method: 'POST' });
            const data = await res.json() as (ApprovalResult & { error?: string });
            if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
            setReadiness((prev) => prev ? { ...prev, readiness: 'ready_for_media', summary: data.summary, issues: [] } : prev);
            setLastResult(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to approve');
        } finally {
            setLoading(false);
            setAction(null);
        }
    }, [normalizedSlug]);

    // ── Load history ──────────────────────────────────────────────────
    const loadHistory = useCallback(async () => {
        if (!normalizedSlug) return;
        try {
            const res = await fetch(`/api/groups/campaign/${normalizedSlug}/brief/history`);
            const data = await res.json() as { entries: HistoryEntry[] };
            setHistory(data.entries ?? []);
        } catch {
            setHistory([]);
        }
    }, [normalizedSlug]);

    const handleLoadCampaign = useCallback(async () => {
        await loadReadiness();
        await loadHistory();
    }, [loadReadiness, loadHistory]);

    const issues = lastResult?.issues ?? readiness?.issues ?? [];
    const blockers = issues.filter((i) => i.severity === 'blocker');
    const warnings = issues.filter((i) => i.severity === 'warning');
    const canApprove = readiness?.readiness === 'needs_review' && blockers.length === 0;

    return (
        <div className="min-h-screen px-4 py-10 font-mono bg-slate-950 text-slate-300">
            <div className="max-w-3xl mx-auto space-y-6">

                {/* ── Header ────────────────────────────────────────── */}
                <div className="p-6 border border-white/10 rounded-xl bg-slate-900/50">
                    <h1 className="text-lg font-semibold tracking-wide text-cyan-400">Brief Studio</h1>
                    <p className="mt-1 text-xs text-slate-500">
                        Single-flow aesthetic brief generation, validation, and approval.
                    </p>
                </div>

                {/* ── Campaign Input ─────────────────────────────────── */}
                <div className="p-5 space-y-4 border border-white/10 rounded-xl bg-slate-900/50">
                    <div className="space-y-1.5">
                        <label className="block text-[10px] text-slate-500 uppercase tracking-widest">Campaign Slug</label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={slug}
                                onChange={(e) => setSlug(e.target.value)}
                                placeholder="e.g. needle-drop-2026"
                                className="flex-1 px-3 py-2 text-sm border rounded-lg bg-slate-800 border-white/10 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500/40"
                            />
                            <button
                                onClick={handleLoadCampaign}
                                disabled={loading || !normalizedSlug}
                                className="px-4 py-2 text-sm font-semibold border rounded-lg bg-slate-800 border-white/10 text-slate-300 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                            >
                                {action === 'checking' ? 'Loading...' : 'Load'}
                            </button>
                        </div>
                    </div>
                </div>

                {/* ── Error ──────────────────────────────────────────── */}
                {error && (
                    <div className="p-4 text-sm border rounded-lg bg-red-500/10 border-red-500/20 text-red-400">
                        <strong>Error:</strong> {error}
                    </div>
                )}

                {/* ── Readiness State ────────────────────────────────── */}
                {readiness && (
                    <div className="p-5 space-y-4 border border-white/10 rounded-xl bg-slate-900/50">
                        <div className="flex items-center justify-between">
                            <h2 className="text-sm font-semibold text-slate-200">Readiness</h2>
                            <ReadinessBadge state={readiness.readiness} />
                        </div>

                        {readiness.campaignName && (
                            <p className="text-xs text-slate-500">Campaign: <span className="text-slate-300">{readiness.campaignName}</span></p>
                        )}

                        <p className="text-xs text-slate-400">{lastResult?.summary ?? readiness.summary}</p>

                        {/* ── Corrective reprompt banner ──────────────── */}
                        {lastResult?.correctiveRepromptUsed && (
                            <div className="p-3 text-xs border rounded-lg bg-violet-500/10 border-violet-500/20 text-violet-300">
                                <strong>Corrective reprompt used.</strong> First pass had unresolvable blockers — the system ran one corrective regeneration.
                            </div>
                        )}

                        {/* ── Auto-fix banner ─────────────────────────── */}
                        {lastResult?.autoFixApplied && lastResult.fixedCodes.length > 0 && (
                            <div className="p-3 text-xs border rounded-lg bg-cyan-500/10 border-cyan-500/20 text-cyan-300">
                                <strong>Auto-fixed:</strong> {lastResult.fixedCodes.join(', ')}
                            </div>
                        )}

                        {/* ── Warnings from engine ────────────────────── */}
                        {lastResult && lastResult.warnings.length > 0 && (
                            <div className="p-3 text-xs border rounded-lg bg-amber-500/10 border-amber-500/20 text-amber-200">
                                {lastResult.warnings.map((w, i) => <p key={i}>{w}</p>)}
                            </div>
                        )}

                        {/* ── Issues ──────────────────────────────────── */}
                        {issues.length > 0 && (
                            <div className="space-y-2">
                                <p className="text-[10px] text-slate-500 uppercase tracking-widest">
                                    {blockers.length} blocker{blockers.length !== 1 ? 's' : ''} · {warnings.length} warning{warnings.length !== 1 ? 's' : ''}
                                </p>
                                {issues.map((issue, idx) => (
                                    <IssueRow key={idx} issue={issue} />
                                ))}
                            </div>
                        )}

                        {/* ── Actions ─────────────────────────────────── */}
                        <div className="flex gap-2 pt-2">
                            <button
                                onClick={generateBrief}
                                disabled={loading}
                                className="flex-1 rounded-lg bg-cyan-500/20 border border-cyan-500/30 px-4 py-2.5 text-sm font-semibold text-cyan-300 hover:bg-cyan-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                            >
                                {action === 'generating' ? 'Generating...' : readiness.brief ? 'Refresh Brief' : 'Generate Brief'}
                            </button>

                            {canApprove && (
                                <button
                                    onClick={approve}
                                    disabled={loading}
                                    className="flex-1 rounded-lg bg-emerald-500/20 border border-emerald-500/30 px-4 py-2.5 text-sm font-semibold text-emerald-300 hover:bg-emerald-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                                >
                                    {action === 'approving' ? 'Approving...' : 'Approve for Media'}
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {/* ── Brief Preview ──────────────────────────────────── */}
                {readiness?.brief && (
                    <BriefPreview brief={readiness.brief} />
                )}

                {/* ── History ────────────────────────────────────────── */}
                {history.length > 0 && (
                    <div className="p-5 space-y-3 border border-white/10 rounded-xl bg-slate-900/50">
                        <h2 className="text-sm font-semibold text-slate-200">History</h2>
                        <div className="space-y-2">
                            {history.map((entry, idx) => (
                                <div key={idx} className="flex items-start gap-3 p-2 border rounded bg-slate-950/50 border-white/5 text-xs">
                                    <span className="shrink-0 font-semibold text-cyan-400 uppercase tracking-wider">{entry.action}</span>
                                    <span className="text-slate-500">{entry.timestamp}</span>
                                    <span className="text-slate-400 flex-1">{entry.details}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* ── Legend ─────────────────────────────────────────── */}
                <div className="text-xs text-slate-400 bg-slate-950/50 border border-white/5 rounded p-3 space-y-1.5">
                    <p><span className="font-semibold text-cyan-400">Generate / Refresh</span> — runs Trinity pipeline (Designer → Builder → Reviewer), auto-fixes, validates</p>
                    <p><span className="font-semibold text-emerald-400">Approve for Media</span> — locks brief for downstream image and video generation</p>
                    <p><span className="font-semibold text-slate-500">One-strike rule</span> — if auto-fix fails, the issue is reported. No recursive loops.</p>
                </div>
            </div>
        </div>
    );
}

// ────────────────────────────────────────────────────────────────────────────
// Brief preview component — shows key fields in a compact grid
// ────────────────────────────────────────────────────────────────────────────

function BriefPreview({ brief }: { brief: Record<string, unknown> }) {
    const [expanded, setExpanded] = useState(false);

    const messaging = brief.messaging as Record<string, unknown> | undefined;
    const visual = brief.visual as Record<string, unknown> | undefined;
    const community = brief.communityExpression as Record<string, unknown> | undefined;

    return (
        <div className="p-5 space-y-3 border border-white/10 rounded-xl bg-slate-900/50">
            <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-200">Brief Preview</h2>
                <button
                    onClick={() => setExpanded(!expanded)}
                    className="text-xs underline text-slate-400 hover:text-slate-300"
                >
                    {expanded ? 'Collapse' : 'Expand'}
                </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                    <span className="text-slate-500">Theme</span>
                    <p className="text-slate-200 font-medium">{String(brief.themeName ?? '—')}</p>
                </div>
                <div>
                    <span className="text-slate-500">Status</span>
                    <p className="text-slate-200 font-medium">{String(brief.humanReviewStatus ?? '—')}</p>
                </div>
                {messaging && (
                    <>
                        <div>
                            <span className="text-slate-500">Hero Slogan</span>
                            <p className="text-cyan-300 font-medium">{String(messaging.heroSlogan ?? '—')}</p>
                        </div>
                        <div>
                            <span className="text-slate-500">Sub Slogan</span>
                            <p className="text-slate-300">{String(messaging.subSlogan ?? '—')}</p>
                        </div>
                    </>
                )}
                {visual && (
                    <div>
                        <span className="text-slate-500">Aesthetic</span>
                        <p className="text-slate-300">{String(visual.aestheticLabel ?? '—')}</p>
                    </div>
                )}
                {community && (
                    <div>
                        <span className="text-slate-500">Core Promise</span>
                        <p className="text-slate-300">{String(community.corePromise ?? '—')}</p>
                    </div>
                )}
                <div>
                    <span className="text-slate-500">Production Bible</span>
                    <p className={brief.productionBible ? 'text-emerald-400' : 'text-slate-500'}>{brief.productionBible ? '✓ Present' : '—'}</p>
                </div>
                <div>
                    <span className="text-slate-500">Landing Still Bible</span>
                    <p className={brief.landingStillBible ? 'text-emerald-400' : 'text-slate-500'}>{brief.landingStillBible ? '✓ Present' : '—'}</p>
                </div>
            </div>

            {expanded && (
                <pre className="mt-3 p-3 text-[10px] text-slate-500 bg-slate-950/80 border border-white/5 rounded-lg overflow-auto max-h-96">
                    {JSON.stringify(brief, null, 2)}
                </pre>
            )}
        </div>
    );
}
