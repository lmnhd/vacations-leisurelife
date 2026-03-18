"use client";

import type { AestheticIssueRecord, AestheticRemediationPlan, RemediationExecutionSummary } from "@/lib/campaigns/schema";

interface IssueLedgerPanelProps {
    issues: AestheticIssueRecord[];
    remediationPlan?: AestheticRemediationPlan;
    remediationSummary?: RemediationExecutionSummary | null;
}

function issueStatusColor(status: string) {
    if (status === "verified") return "text-emerald-400 border-emerald-500/30 bg-emerald-500/10";
    if (status === "applied") return "text-blue-400 border-blue-500/30 bg-blue-500/10";
    if (status === "waived") return "text-slate-400 border-white/10 bg-white/5";
    if (status === "failed") return "text-red-400 border-red-500/30 bg-red-500/10";
    return "text-amber-300 border-amber-500/30 bg-amber-500/10";
}

function remediationModeColor(mode: string) {
    if (mode === "deterministic") return "text-cyan-300 border-cyan-500/30 bg-cyan-500/10";
    if (mode === "llm_patch") return "text-violet-300 border-violet-500/30 bg-violet-500/10";
    if (mode === "regenerate") return "text-orange-300 border-orange-500/30 bg-orange-500/10";
    return "text-slate-400 border-white/10 bg-white/5";
}

function severityColor(severity: string) {
    return severity === "blocker"
        ? "text-red-300 border-red-500/30 bg-red-500/10"
        : "text-amber-300 border-amber-500/30 bg-amber-500/10";
}

export function IssueLedgerPanel({ issues, remediationPlan, remediationSummary }: IssueLedgerPanelProps) {
    const openBlockers = issues.filter(i => i.severity === "blocker" && i.status === "open").length;
    const openWarnings = issues.filter(i => i.severity === "warning" && i.status === "open").length;
    const verified = issues.filter(i => i.status === "verified").length;
    const applied = issues.filter(i => i.status === "applied").length;
    const failed = issues.filter(i => i.status === "failed").length;

    return (
        <div className="border border-violet-500/30 rounded-xl bg-violet-950/20 overflow-hidden">
            {/* Header */}
            <div className="px-4 py-2.5 border-b border-violet-500/20 flex items-center justify-between">
                <span className="text-xs font-semibold text-violet-300 uppercase tracking-widest">V2 Issue Ledger</span>
                <div className="flex items-center gap-2">
                    {openBlockers > 0 && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full border text-red-300 border-red-500/30 bg-red-500/10">
                            {openBlockers} blocker{openBlockers !== 1 ? "s" : ""}
                        </span>
                    )}
                    {openWarnings > 0 && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full border text-amber-300 border-amber-500/30 bg-amber-500/10">
                            {openWarnings} warning{openWarnings !== 1 ? "s" : ""}
                        </span>
                    )}
                    {verified > 0 && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full border text-emerald-400 border-emerald-500/30 bg-emerald-500/10">
                            {verified} verified
                        </span>
                    )}
                    {applied > 0 && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full border text-blue-400 border-blue-500/30 bg-blue-500/10">
                            {applied} applied
                        </span>
                    )}
                    {failed > 0 && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full border text-red-400 border-red-500/30 bg-red-500/10">
                            {failed} failed
                        </span>
                    )}
                </div>
            </div>

            <div className="p-4 space-y-4">
                {/* Remediation Plan */}
                {remediationPlan && (
                    <div className="rounded-lg border border-white/10 bg-white/5 p-3 space-y-2">
                        <div className="text-[10px] text-slate-400 uppercase tracking-widest mb-2">Remediation Plan</div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                            <div className="rounded bg-cyan-950/40 border border-cyan-500/20 px-2 py-1.5">
                                <div className="text-lg font-mono font-bold text-cyan-300">{remediationPlan.deterministicIssueIds.length}</div>
                                <div className="text-[9px] text-cyan-500 uppercase tracking-widest">Deterministic</div>
                            </div>
                            <div className="rounded bg-violet-950/40 border border-violet-500/20 px-2 py-1.5">
                                <div className="text-lg font-mono font-bold text-violet-300">{remediationPlan.llmPatchIssueIds.length}</div>
                                <div className="text-[9px] text-violet-500 uppercase tracking-widest">LLM Patch</div>
                            </div>
                            <div className="rounded bg-orange-950/40 border border-orange-500/20 px-2 py-1.5">
                                <div className="text-lg font-mono font-bold text-orange-300">{remediationPlan.regenerationSteps.length}</div>
                                <div className="text-[9px] text-orange-500 uppercase tracking-widest">Regenerate</div>
                            </div>
                            <div className="rounded bg-slate-950/40 border border-slate-500/20 px-2 py-1.5">
                                <div className="text-lg font-mono font-bold text-slate-300">{remediationPlan.manualEscalations.length}</div>
                                <div className="text-[9px] text-slate-500 uppercase tracking-widest">Manual</div>
                            </div>
                        </div>
                        {remediationPlan.regenerationSteps.length > 0 && (
                            <div className="text-[10px] text-orange-300/70 mt-1">
                                Regeneration needed: {remediationPlan.regenerationSteps.join(", ")}
                            </div>
                        )}
                    </div>
                )}

                {/* Remediation summary (post-remediate) */}
                {remediationSummary && (
                    <div className="rounded-lg border border-emerald-700/40 bg-emerald-950/20 p-3 space-y-2">
                        <div className="text-[10px] text-emerald-400 uppercase tracking-widest mb-1">Last Remediation Result</div>
                        {remediationSummary.stepsExecuted.map((step, i) => (
                            <div key={`${step.issueId}-${i}`} className="flex items-start gap-2 text-xs">
                                <span className={`shrink-0 mt-0.5 w-1.5 h-1.5 rounded-full ${step.outcome === "verified" ? "bg-emerald-400" : step.outcome === "applied" ? "bg-blue-400" : step.outcome === "failed" ? "bg-red-400" : "bg-slate-500"}`} />
                                <span className="text-slate-300 font-mono text-[10px] shrink-0">[{step.mode}]</span>
                                <span className={step.outcome === "verified" ? "text-emerald-300" : step.outcome === "applied" ? "text-blue-300" : step.outcome === "failed" ? "text-red-300" : "text-slate-400"}>
                                    {step.detail}
                                </span>
                            </div>
                        ))}
                        {remediationSummary.remainingOpenIssues.length > 0 && (
                            <div className="text-[10px] text-red-300 mt-1">
                                {remediationSummary.remainingOpenIssues.length} issue{remediationSummary.remainingOpenIssues.length !== 1 ? "s" : ""} still open after remediation
                            </div>
                        )}
                        {remediationSummary.regenerationScheduled.length > 0 && (
                            <div className="text-[10px] text-orange-300 mt-1">
                                Artifacts requiring regeneration: {remediationSummary.regenerationScheduled.join(", ")}
                            </div>
                        )}
                    </div>
                )}

                {/* Issue list */}
                <div className="space-y-2">
                    {issues.map((issue) => (
                        <div
                            key={issue.issueId}
                            className="rounded-lg border border-white/10 bg-white/5 p-3 space-y-1.5"
                        >
                            <div className="flex flex-wrap items-center gap-2">
                                <span className={`text-[10px] px-2 py-0.5 rounded-full border ${severityColor(issue.severity)}`}>
                                    {issue.severity}
                                </span>
                                <span className={`text-[10px] px-2 py-0.5 rounded-full border ${remediationModeColor(issue.remediationMode)}`}>
                                    {issue.remediationMode}
                                </span>
                                <span className={`text-[10px] px-2 py-0.5 rounded-full border ${issueStatusColor(issue.status)}`}>
                                    {issue.status}
                                </span>
                                <span className="text-[10px] text-slate-500 uppercase tracking-widest">{issue.owningArtifact.replace(/_/g, " ")}</span>
                            </div>

                            <div className="text-xs font-medium text-white">{issue.title}</div>
                            <p className="text-xs text-slate-400 leading-relaxed">{issue.summary}</p>

                            {issue.evidence.length > 0 && (
                                <ul className="space-y-0.5">
                                    {issue.evidence.map((e, idx) => (
                                        <li key={idx} className="text-[11px] text-slate-500 leading-relaxed">↳ {e}</li>
                                    ))}
                                </ul>
                            )}

                            {issue.targetPaths.length > 0 && (
                                <div className="text-[10px] text-cyan-600 font-mono">
                                    paths: {issue.targetPaths.join(", ")}
                                </div>
                            )}

                            {issue.closureChecks.length > 0 && (
                                <div className="space-y-0.5">
                                    {issue.closureChecks.map((check, idx) => (
                                        <div key={idx} className="text-[10px] text-slate-600">✓ {check}</div>
                                    ))}
                                </div>
                            )}

                            {issue.resolver && (
                                <div className="text-[10px] text-blue-400">
                                    Resolved by [{issue.resolver.kind}]: {issue.resolver.reference}
                                </div>
                            )}

                            {issue.issueCode !== "custom" && (
                                <div className="text-[10px] text-slate-600 font-mono">code: {issue.issueCode}</div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
