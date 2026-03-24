'use client';

import { useState, useCallback } from 'react';
import { CampaignSelector } from '../media-generation/campaign-selector';

// ────────────────────────────────────────────────────────────────────────────
// Local types mirroring orchestrator response shapes
// ────────────────────────────────────────────────────────────────────────────

interface ValidationIssue {
    code: string;
    message: string;
    severity: 'blocker' | 'warning';
    autoFixable: boolean;
}

interface ProductionBuildLintIssue {
    code: string;
    severity: 'blocker' | 'warning';
    message: string;
    affectedStillIds: string[];
    details?: string;
}

interface ProductionBuildStillDiagnostic {
    stillId: string;
    usage: string;
    locationFamily: string;
    actionFamily: string;
    moodFamily: string;
    shotRole: 'hero' | 'editorial' | 'intimate' | 'supporting';
    cueStrength: 'explicit' | 'subtle' | 'absent';
    isGenericFallback: boolean;
    compositionFamily: string;
    flags: string[];
}

interface ProductionBuildLintReport {
    verdict: 'pass' | 'warn' | 'fail';
    blockingIssues: ProductionBuildLintIssue[];
    warnings: ProductionBuildLintIssue[];
    scoreSummary: {
        totalStills: number;
        noCueCount: number;
        subtleCueCount: number;
        explicitCueCount: number;
        genericFallbackCount: number;
        heroRoleCount: number;
        editorialRoleCount: number;
        intimateRoleCount: number;
        maxCompositionFamilySize: number;
    };
    stillDiagnostics: ProductionBuildStillDiagnostic[];
    evaluatedAt: string;
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

interface AgentJobStepStatus {
    stepId: string;
    label: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'blocked' | 'skipped';
    message?: string;
}

interface AgentJobSummary {
    message: string;
    readiness?: string;
    blockerCount?: number;
    warningCount?: number;
    persisted?: boolean;
}

interface BriefJobPollState {
    jobId: string;
    status: 'queued' | 'running' | 'completed' | 'failed' | 'blocked' | 'cancelled';
    steps: AgentJobStepStatus[];
    summary?: AgentJobSummary;
    error?: string;
    failureDiagnostics?: {
        failedAt: string;
        errorMessage: string;
        timings: Array<{ passLabel: string; totalElapsedMs: number | null; stages: Array<{ stageName: string; elapsedMs: number }> }>;
    } | null;
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

function getProductionIssueRepairHint(issue: ProductionBuildLintIssue): string {
    switch (issue.code) {
        case 'missing_role_coverage':
            return 'Regenerate toward a balanced still pack: at least 2 hero stills, 2 editorial or concept stills, and 1 intimate still.';
        case 'generic_fallback_overuse':
            return 'Move affected stills away from stock cruise reads. Replace rail-couple, quiet-window, dining-intimacy, and generic deck-wide scenes with campaign-specific actions and locations.';
        case 'weak_niche_signal':
            return 'Push visible campaign identity into more stills. The niche needs to be legible in the image itself, not only implied by copy.';
        case 'identity_legibility_too_low':
            return 'At least two stills need to prove the campaign identity on sight. Regenerate with clearer niche behavior, props, styling, or framing.';
        case 'hero_set_too_homogeneous':
            return 'Break the set out of all-hero scale. Add editorial and intimate framing so the still pack has usable range.';
        case 'repeated_composition_family':
            return 'Diversify the affected stills by changing location family, subject action, and framing so the set stops collapsing into one repeated visual read.';
        default:
            return 'Regenerate with these affected stills and failure codes in mind.';
    }
}

function ProductionLintIssueRow({
    issue,
    diagnostics,
}: {
    issue: ProductionBuildLintIssue;
    diagnostics: ProductionBuildStillDiagnostic[];
}) {
    const severityCls = issue.severity === 'blocker'
        ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
        : 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30';
    const affectedDiagnostics = diagnostics.filter((diagnostic) => issue.affectedStillIds.includes(diagnostic.stillId));

    return (
        <div className="space-y-3 rounded-lg border border-white/5 bg-slate-900/30 p-4">
            <div className="flex items-start gap-3">
                <span className={`shrink-0 inline-flex items-center rounded px-1.5 py-0.5 border text-[10px] font-semibold uppercase tracking-wider ${severityCls}`}>
                    {issue.severity}
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-xs font-mono text-slate-400">{issue.code}</p>
                    <p className="text-sm text-slate-200">{issue.message}</p>
                    {issue.details && (
                        <p className="text-xs text-slate-400">{issue.details}</p>
                    )}
                    <p className="text-xs text-cyan-300">{getProductionIssueRepairHint(issue)}</p>
                </div>
            </div>

            {issue.affectedStillIds.length > 0 && (
                <div className="space-y-2 rounded-md border border-white/5 bg-slate-950/60 p-3">
                    <p className="text-[10px] uppercase tracking-widest text-slate-500">Affected stills</p>
                    <div className="flex flex-wrap gap-2">
                        {issue.affectedStillIds.map((stillId) => (
                            <span key={stillId} className="rounded border border-cyan-500/20 bg-cyan-500/10 px-2 py-1 text-[10px] font-mono text-cyan-200">
                                {stillId}
                            </span>
                        ))}
                    </div>
                    {affectedDiagnostics.length > 0 && (
                        <div className="grid gap-2 md:grid-cols-2">
                            {affectedDiagnostics.map((diagnostic) => (
                                <div key={diagnostic.stillId} className="rounded border border-white/5 bg-slate-900/50 p-2 text-[11px] text-slate-300">
                                    <p className="font-mono text-cyan-300">{diagnostic.stillId}</p>
                                    <p>Role: <span className="text-slate-200">{diagnostic.shotRole}</span></p>
                                    <p>Cue: <span className="text-slate-200">{diagnostic.cueStrength}</span></p>
                                    <p>Composition: <span className="text-slate-200">{diagnostic.compositionFamily}</span></p>
                                    <p>Location: <span className="text-slate-200">{diagnostic.locationFamily}</span></p>
                                    {diagnostic.flags.length > 0 && (
                                        <p>Flags: <span className="text-slate-200">{diagnostic.flags.join(', ')}</span></p>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
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
    const [activeJob, setActiveJob] = useState<BriefJobPollState | null>(null);
    const [readiness, setReadiness] = useState<ReadinessResult | null>(null);
    const [lastResult, setLastResult] = useState<BriefEngineResult | null>(null);
    const [history, setHistory] = useState<HistoryEntry[]>([]);
    const [error, setError] = useState<string | null>(null);

    const normalizedSlug = slug.trim();
    const activeBrief = (lastResult?.brief ?? readiness?.brief) as Record<string, unknown> | null;
    const productionBuildStatusValue = activeBrief?.['productionBuildStatus'];
    const productionBuildStatus = typeof productionBuildStatusValue === 'string' ? productionBuildStatusValue : null;
    const productionBuildLint = activeBrief?.['productionBuildLint'] as ProductionBuildLintReport | undefined;
    const hasLandingStillBible = Boolean(activeBrief?.['landingStillBible']);
    const hasStoredBrief = Boolean(readiness?.brief);
    const storedReviewStatus = typeof activeBrief?.['humanReviewStatus'] === 'string' ? activeBrief['humanReviewStatus'] : null;

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

    // ── Load history ────────────────────────────────────────────────
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

    // ── Generate / refresh brief (async job path) ─────────────────────────────
    // POST enqueues a job and returns { jobId }. We then poll GET ?jobId= every 5s.
    // On completion we reload readiness so fresh brief state appears.
    const POLL_INTERVAL_MS = 5_000;

    const generateBrief = useCallback(async () => {
        if (!normalizedSlug) return;
        const confirmed = window.confirm(
            hasStoredBrief
                ? `Regenerate the stored brief for "${normalizedSlug}"?\n\nThis will run new LLM generation passes, rebuild the visual-planning bundle, overwrite the saved brief artifacts, and may incur provider cost.\n\nUse "Load Selected Brief" if you only want to reload the saved state.`
                : `Generate the first brief for "${normalizedSlug}"?\n\nThis will run live LLM generation and may incur provider cost.`
        );
        if (!confirmed) return;
        setLoading(true);
        setAction('generating');
        setError(null);
        setActiveJob(null);

        try {
            // Step 1: enqueue
            const enqueueRes = await fetch(`/api/groups/campaign/${normalizedSlug}/brief`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            });
            const enqueueData = await enqueueRes.json() as { jobId?: string; error?: string };
            if (!enqueueRes.ok || !enqueueData.jobId) {
                throw new Error(enqueueData.error ?? `HTTP ${enqueueRes.status}`);
            }

            const jobId = enqueueData.jobId;
            setActiveJob({ jobId, status: 'queued', steps: [] });

            // Step 2: poll until terminal
            const terminalStatuses = new Set(['completed', 'failed', 'blocked', 'cancelled']);
            let pollingActive = true;
            while (pollingActive) {
                await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
                const pollRes = await fetch(`/api/groups/campaign/${normalizedSlug}/brief?jobId=${encodeURIComponent(jobId)}`);
                const pollData = await pollRes.json() as BriefJobPollState & { error?: string };
                if (!pollRes.ok) {
                    throw new Error(pollData.error ?? `Poll failed: HTTP ${pollRes.status}`);
                }
                setActiveJob(pollData);
                if (terminalStatuses.has(pollData.status)) {
                    pollingActive = false;
                    if (pollData.status === 'completed') {
                        await loadReadiness();
                        await loadHistory();
                    } else {
                        setError(pollData.error ?? `Job ended with status: ${pollData.status}`);
                    }
                }
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to generate brief');
        } finally {
            setLoading(false);
            setAction(null);
        }
    }, [hasStoredBrief, normalizedSlug, loadReadiness, loadHistory]);

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


    const handleLoadCampaign = useCallback(async () => {
        await loadReadiness();
        await loadHistory();
    }, [loadReadiness, loadHistory]);

    const issues = lastResult?.issues ?? readiness?.issues ?? [];
    const blockers = issues.filter((i) => i.severity === 'blocker');
    const warnings = issues.filter((i) => i.severity === 'warning');
    const productionBlockingIssues = productionBuildLint?.blockingIssues ?? [];
    const productionWarnings = productionBuildLint?.warnings ?? [];
    const productionDiagnostics = productionBuildLint?.stillDiagnostics ?? [];
    const hasProductionLintIssues = productionBlockingIssues.length > 0 || productionWarnings.length > 0;
    const productionApprovalBlockReason = (() => {
        if (!activeBrief) return null;
        if (!hasLandingStillBible || !productionBuildStatus) {
            return 'Production build has not been evaluated yet. Regenerate the brief bundle to run pre-media lint before approving.';
        }
        if (productionBuildStatus === 'fail') {
            const firstIssue = productionBlockingIssues[0]?.message;
            return firstIssue
                ? `Production build lint failed. Primary blocker: ${firstIssue}`
                : 'Production build lint failed. Regenerate the brief bundle to resolve production build issues before approving.';
        }
        return null;
    })();
    const canApprove = readiness?.readiness === 'needs_review' && blockers.length === 0 && !productionApprovalBlockReason;
    const approvalBlockedReason = (() => {
        if (!readiness) return 'Load a brief first.';
        if (readiness.readiness === 'ready_for_media') return 'This brief is already approved and ready for media generation.';
        if (blockers.length > 0) return blockers[0]?.message ?? 'Resolve blocker issues before approving.';
        if (productionApprovalBlockReason) return productionApprovalBlockReason;
        if (readiness.readiness !== 'needs_review') return 'This brief is not in an approval-ready review state yet.';
        return null;
    })();

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
                        <label className="block text-[10px] text-slate-500 uppercase tracking-widest">Existing Briefs</label>
                        <CampaignSelector
                            value={slug}
                            onChange={setSlug}
                            disabled={loading}
                            defaultFilter="designed"
                        />
                        <div className="flex justify-end">
                            <button
                                onClick={handleLoadCampaign}
                                disabled={loading || !normalizedSlug}
                                className="px-4 py-2 text-sm font-semibold border rounded-lg bg-slate-800 border-white/10 text-slate-300 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                            >
                                {action === 'checking' ? 'Loading...' : 'Load Selected Brief'}
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

                {/* ── Active Job Status Panel ─────────────────────── */}
                {activeJob && (
                    <div className={`p-4 space-y-3 border rounded-lg ${
                        activeJob.status === 'completed' ? 'bg-emerald-500/10 border-emerald-500/20'
                        : activeJob.status === 'failed' || activeJob.status === 'blocked' ? 'bg-red-500/10 border-red-500/20'
                        : 'bg-slate-800/50 border-white/10'
                    }`}>
                        <div className="flex items-center justify-between">
                            <p className="text-xs font-semibold text-slate-200">
                                Job <span className="font-mono text-cyan-400">{activeJob.jobId}</span>
                            </p>
                            <span className={`text-[10px] uppercase tracking-widest font-semibold ${
                                activeJob.status === 'completed' ? 'text-emerald-400'
                                : activeJob.status === 'failed' ? 'text-rose-400'
                                : activeJob.status === 'running' ? 'text-cyan-400'
                                : 'text-slate-400'
                            }`}>{activeJob.status}</span>
                        </div>
                        {activeJob.steps.length > 0 && (
                            <div className="space-y-1">
                                {activeJob.steps.map((step) => (
                                    <div key={step.stepId} className="flex items-center gap-2 text-xs">
                                        <span className={`w-2 h-2 rounded-full shrink-0 ${
                                            step.status === 'completed' ? 'bg-emerald-400'
                                            : step.status === 'running' ? 'bg-cyan-400 animate-pulse'
                                            : step.status === 'failed' ? 'bg-rose-400'
                                            : 'bg-slate-600'
                                        }`} />
                                        <span className="text-slate-300">{step.label}</span>
                                        {step.message && <span className="text-slate-500 truncate">{step.message}</span>}
                                    </div>
                                ))}
                            </div>
                        )}
                        {activeJob.status === 'failed' && activeJob.failureDiagnostics && (
                            <div className="space-y-2 pt-1 border-t border-white/5">
                                <p className="text-[10px] uppercase tracking-widest text-rose-400">Failure diagnostics</p>
                                <p className="text-xs text-slate-400">{activeJob.failureDiagnostics.errorMessage}</p>
                                {activeJob.failureDiagnostics.timings.map((pass) => (
                                    <div key={pass.passLabel} className="text-xs text-slate-500">
                                        <p className="font-semibold text-slate-400">{pass.passLabel} — {pass.totalElapsedMs !== null ? `${(pass.totalElapsedMs / 1000).toFixed(1)}s` : 'incomplete'}</p>
                                        {pass.stages.map((stage) => (
                                            <p key={stage.stageName} className="pl-3">{stage.stageName}: {(stage.elapsedMs / 1000).toFixed(1)}s</p>
                                        ))}
                                    </div>
                                ))}
                            </div>
                        )}
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

                        {storedReviewStatus === 'approved' && readiness.readiness !== 'ready_for_media' && (
                            <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-200">
                                <strong>Stored approval is no longer valid.</strong> This brief was previously marked approved, but current readiness was downgraded after structural or pre-media lint checks. Use the production build issues below to see exactly what is blocking approval now.
                            </div>
                        )}

                        {readiness.brief && (
                            <div className="p-3 text-xs border rounded-lg bg-amber-500/10 border-amber-500/20 text-amber-200">
                                <strong>Reload is separate from regeneration.</strong> <span className="text-amber-100">Load Selected Brief</span> only fetches the stored record. <span className="text-amber-100">Regenerate Brief</span> runs fresh LLM generation, overwrites the saved brief bundle, and may incur provider cost.
                            </div>
                        )}

                        {productionBuildStatus === 'fail' && (
                            <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/10 p-3 text-xs text-cyan-100">
                                <strong>You are not expected to fix these manually.</strong> This page is reporting why the saved brief cannot be approved. <span className="text-cyan-50">Load Selected Brief</span> and <span className="text-cyan-50">Approve for Media</span> are read-only checks. <span className="text-cyan-50">Regenerate Brief</span> is the automated self-heal path: it reruns brief generation, rebuilds the landing still pack, attempts isolated still repair when possible, retries whole-set regeneration when the pack collapses, then re-runs pre-media lint.
                            </div>
                        )}

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

                        {productionBuildLint && (
                            <div className="grid gap-3 md:grid-cols-2">
                                <div className="rounded-lg border border-white/5 bg-slate-950/60 p-4">
                                    <p className="text-[10px] uppercase tracking-widest text-slate-500">Pre-media lint</p>
                                    <p className={`mt-2 text-sm font-semibold ${productionBuildLint.verdict === 'fail' ? 'text-rose-300' : productionBuildLint.verdict === 'warn' ? 'text-amber-300' : 'text-emerald-300'}`}>
                                        {productionBuildLint.verdict.toUpperCase()}
                                    </p>
                                    <p className="mt-1 text-xs text-slate-400">Evaluated at {productionBuildLint.evaluatedAt}</p>
                                    <p className="mt-2 text-xs text-slate-300">
                                        {productionBlockingIssues.length} blocker{productionBlockingIssues.length !== 1 ? 's' : ''} and {productionWarnings.length} warning{productionWarnings.length !== 1 ? 's' : ''} in the current landing still pack.
                                    </p>
                                </div>
                                <div className="rounded-lg border border-white/5 bg-slate-950/60 p-4">
                                    <p className="text-[10px] uppercase tracking-widest text-slate-500">Lint score summary</p>
                                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-300">
                                        <p>Hero stills: <span className="text-slate-100">{productionBuildLint.scoreSummary.heroRoleCount}</span></p>
                                        <p>Editorial stills: <span className="text-slate-100">{productionBuildLint.scoreSummary.editorialRoleCount}</span></p>
                                        <p>Intimate stills: <span className="text-slate-100">{productionBuildLint.scoreSummary.intimateRoleCount}</span></p>
                                        <p>No-cue stills: <span className="text-slate-100">{productionBuildLint.scoreSummary.noCueCount}</span></p>
                                        <p>Subtle-cue stills: <span className="text-slate-100">{productionBuildLint.scoreSummary.subtleCueCount}</span></p>
                                        <p>Fallback stills: <span className="text-slate-100">{productionBuildLint.scoreSummary.genericFallbackCount}</span></p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {hasProductionLintIssues && (
                            <div className="space-y-3">
                                <div>
                                    <p className="text-[10px] uppercase tracking-widest text-slate-500">Production build issues</p>
                                    <p className="mt-1 text-xs text-slate-400">These are the specific pre-media blockers and warnings stopping approval. They are diagnostic output for the automated regeneration path, not a request for manual still editing.</p>
                                </div>

                                {productionBlockingIssues.map((issue) => (
                                    <ProductionLintIssueRow
                                        key={`blocker-${issue.code}-${issue.affectedStillIds.join('-')}`}
                                        issue={issue}
                                        diagnostics={productionDiagnostics}
                                    />
                                ))}

                                {productionWarnings.map((issue) => (
                                    <ProductionLintIssueRow
                                        key={`warning-${issue.code}-${issue.affectedStillIds.join('-')}`}
                                        issue={issue}
                                        diagnostics={productionDiagnostics}
                                    />
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
                                {action === 'generating' ? (hasStoredBrief ? 'Regenerating...' : 'Generating...') : hasStoredBrief ? 'Regenerate Brief' : 'Generate Brief'}
                            </button>

                            <button
                                onClick={approve}
                                disabled={loading || !canApprove}
                                title={!canApprove ? approvalBlockedReason ?? 'Approval is currently unavailable.' : 'Approve this brief for downstream media generation.'}
                                className="flex-1 rounded-lg bg-emerald-500/20 border border-emerald-500/30 px-4 py-2.5 text-sm font-semibold text-emerald-300 hover:bg-emerald-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                            >
                                {action === 'approving' ? 'Approving...' : 'Approve for Media'}
                            </button>
                        </div>

                        {!canApprove && approvalBlockedReason && (
                            <p className="text-[11px] text-slate-500">
                                Approval unavailable: {approvalBlockedReason}
                            </p>
                        )}
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
                    <p><span className="font-semibold text-cyan-400">Load Selected Brief</span> — read-only fetch of the stored brief, readiness, and history</p>
                    <p><span className="font-semibold text-cyan-400">Regenerate Brief</span> — automated self-heal path: reruns brief generation, rebuilds visual-planning artifacts, attempts still repair or whole-set retry when needed, re-runs lint, overwrites stored brief state, and may incur provider cost</p>
                    <p><span className="font-semibold text-emerald-400">Approve for Media</span> — locks brief for downstream image and video generation</p>
                    <p><span className="font-semibold text-slate-500">One-strike rule</span> — if the automated repair path still fails, the issue is reported instead of silently looping.</p>
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
                    <span className="text-slate-500">Stored Review Status</span>
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
