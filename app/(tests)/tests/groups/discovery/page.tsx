"use client";

import React, { useState, useCallback, useEffect } from 'react';
import { Loader2, RotateCcw, GitBranch, MapPin } from "lucide-react";
import { Campaign } from '@/lib/campaigns/types';

// ─── Types ───────────────────────────────────────────────────────────────────

type PricingStatus = 'AI_ESTIMATE' | 'CB_MATCHED' | 'UNMATCHED';

interface PhaseBCampaignRef {
    slug: string;
    name: string;
    pricingStatus: PricingStatus;
    shipTarget?: string;
}

// ─── Pricing Badge ────────────────────────────────────────────────────────────

function PricingBadge({ status }: { status: PricingStatus }) {
    const styles: Record<PricingStatus, string> = {
        CB_MATCHED: 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400',
        AI_ESTIMATE: 'bg-amber-500/15 border border-amber-500/30 text-amber-400',
        UNMATCHED: 'bg-red-500/15 border border-red-500/30 text-red-400',
    };
    const labels: Record<PricingStatus, string> = {
        CB_MATCHED: '✅ CB Matched',
        AI_ESTIMATE: '⚠️ AI Estimate',
        UNMATCHED: '❌ Unmatched',
    };
    return (
        <span className={`text-[10px] uppercase tracking-widest font-mono px-2 py-0.5 rounded ${styles[status]}`}>
            {labels[status]}
        </span>
    );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DiscoveryTestPage() {
    // Phase A state
    const [phaseALoading, setPhaseALoading] = useState(false);
    const [blueprints, setBlueprints] = useState<Campaign[]>([]);
    const [phaseAError, setPhaseAError] = useState<string | null>(null);
    const [skippedCount, setSkippedCount] = useState(0);

    // Phase B state
    const [phaseBLoading, setPhaseBLoading] = useState(false);
    const [phaseBCampaigns, setPhaseBCampaigns] = useState<PhaseBCampaignRef[]>([]);
    const [phaseBError, setPhaseBError] = useState<string | null>(null);
    const [phaseBRunning, setPhaseBRunning] = useState(false);

    // Auto-load existing campaigns from DynamoDB on mount
    useEffect(() => {
        const loadExisting = async () => {
            try {
                const res = await fetch('/api/groups/discovery?load=true');
                const data = await res.json();
                if (!data.success || !data.campaigns?.length) return;

                const fetched = await Promise.all(
                    (data.campaigns as Array<{ id: string; name: string; fetchUrl: string }>).map(async (ref) => {
                        const r = await fetch(ref.fetchUrl);
                        const d = await r.json();
                        return d.success ? (d.campaign as Campaign) : null;
                    })
                );
                const loaded = fetched.filter((b): b is Campaign => b !== null);
                if (loaded.length > 0) setBlueprints(loaded);
            } catch {
                // Silent — auto-load is best-effort
            }
        };
        loadExisting();
    }, []);

    // ─── Phase A ─────────────────────────────────────────────────────────────

    const handleGenerate = async () => {
        const confirmed = window.confirm(
            'This will make 2× Sonar Deep Research calls + 1× GPT-4o-mini call.\n\n' +
            'Estimated cost: ~$1.60 – $2.00\n\nContinue?'
        );
        if (!confirmed) return;

        setPhaseALoading(true);
        setPhaseAError(null);
        setBlueprints([]);
        setSkippedCount(0);

        try {
            const discoveryRes = await fetch('/api/groups/discovery');
            const discoveryData = await discoveryRes.json();

            if (!discoveryData.success || !discoveryData.campaigns) {
                setPhaseAError(discoveryData.error || 'Discovery pipeline failed');
                return;
            }

            setSkippedCount(discoveryData.skippedCount ?? 0);

            const campaignRefs: Array<{ id: string; name: string; fetchUrl: string }> = discoveryData.campaigns;
            const fetched = await Promise.all(
                campaignRefs.map(async (ref) => {
                    const res = await fetch(ref.fetchUrl);
                    const data = await res.json();
                    return data.success ? (data.campaign as Campaign) : null;
                })
            );

            setBlueprints(fetched.filter((b): b is Campaign => b !== null));
        } catch (err) {
            setPhaseAError(err instanceof Error ? err.message : 'Network error');
        } finally {
            setPhaseALoading(false);
        }
    };

    const handleClear = () => {
        setBlueprints([]);
        setPhaseAError(null);
        setSkippedCount(0);
    };

    const handleClearAll = async () => {
        const confirmed = window.confirm(
            '⚠️ This will permanently delete ALL campaigns from DynamoDB and clear the research cache.\n\n' +
            'Use this to wipe stale Phase A results before a fresh inventory-aligned run.\n\nContinue?'
        );
        if (!confirmed) return;
        await fetch('/api/groups/discovery/clear', { method: 'DELETE' });
        handleClear();
    };

    // ─── Phase B ─────────────────────────────────────────────────────────────

    const pollPhaseBStatus = useCallback(async () => {
        const res = await fetch('/api/groups/discovery/phase-b');
        const data = await res.json();
        setPhaseBCampaigns(data.campaigns ?? []);
        if (!data.running) {
            setPhaseBRunning(false);
            setPhaseBLoading(false);
        }
    }, []);

    const handleRunPhaseB = async () => {
        const confirmed = window.confirm(
            'Phase B will open a Playwright browser, log into CB Agent Tools,\n' +
            'scrape live group inventory, and match campaigns.\n\n' +
            'Ensure CB_EMAIL and CB_PASSWORD are set in .env.local.\n\nContinue?'
        );
        if (!confirmed) return;

        setPhaseBLoading(true);
        setPhaseBError(null);
        setPhaseBRunning(true);

        try {
            await fetch('/api/groups/discovery/phase-b', { method: 'POST' });

            // Poll every 5s until process completes
            const interval = setInterval(async () => {
                const res = await fetch('/api/groups/discovery/phase-b');
                const data = await res.json();
                setPhaseBCampaigns(data.campaigns ?? []);
                if (!data.running) {
                    clearInterval(interval);
                    setPhaseBRunning(false);
                    setPhaseBLoading(false);
                }
            }, 5000);
        } catch (err) {
            setPhaseBError(err instanceof Error ? err.message : 'Phase B failed');
            setPhaseBLoading(false);
            setPhaseBRunning(false);
        }
    };

    const handleLoadPhaseBStatus = async () => {
        await pollPhaseBStatus();
    };

    const hasPhaseAResults = blueprints.length > 0;

    return (
        <div className="min-h-screen bg-slate-950 text-white p-6 font-mono">
            <div className="max-w-5xl mx-auto space-y-8">

                {/* Header */}
                <div className="border border-white/10 rounded-xl p-4 bg-slate-900/50">
                    <h1 className="text-lg font-semibold text-cyan-400 tracking-wide">🔍 Group Campaign Discovery</h1>
                    <p className="text-xs text-slate-500 mt-1">
                        Phase A — Sonar deep research → 5 structured blueprints.
                        Phase B — Playwright CB inventory match → live pricing + booking links.
                    </p>
                </div>

                {/* ─── Phase A ─────────────────────────────────────────────── */}
                <div className="border border-white/10 rounded-xl bg-slate-900/50 overflow-hidden">
                    <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
                        <div>
                            <span className="text-xs text-slate-400 uppercase tracking-widest">Phase A — AI Discovery</span>
                            <p className="text-[10px] text-slate-600 mt-0.5">2× Perplexity Sonar + 1× GPT-4o-mini · ~$1.60–$2.00</p>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={handleClearAll} className="text-xs px-3 py-1.5 rounded border border-red-500/30 text-red-400 hover:text-red-300 hover:border-red-400/60 transition-all flex items-center gap-1.5">
                                🗑 Clear All
                            </button>
                            {hasPhaseAResults && (
                                <button onClick={handleClear} className="text-xs px-3 py-1.5 rounded border border-white/10 text-slate-400 hover:text-white hover:border-white/30 transition-all flex items-center gap-1.5">
                                    <RotateCcw className="h-3 w-3" /> Reset
                                </button>
                            )}
                            <button
                                onClick={handleGenerate}
                                disabled={phaseALoading || hasPhaseAResults}
                                className="flex items-center gap-2 px-4 py-1.5 rounded text-sm font-medium bg-cyan-500/20 border border-cyan-500/40 text-cyan-400 hover:bg-cyan-500/30 transition-all disabled:opacity-40 disabled:pointer-events-none"
                            >
                                {phaseALoading ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Researching…</> : hasPhaseAResults ? 'Results Loaded' : 'Generate Blueprints'}
                            </button>
                        </div>
                    </div>

                    <div className="p-4">
                        {skippedCount > 0 && (
                            <div className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded px-3 py-2 mb-3">
                                ⚠️ {skippedCount} blueprint(s) already existed in DynamoDB and were skipped.
                            </div>
                        )}
                        {phaseAError && (
                            <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded px-3 py-2 mb-3">{phaseAError}</div>
                        )}

                        {hasPhaseAResults ? (
                            <div className="space-y-3">
                                {blueprints.map((bp, i) => {
                                    const isMatched = bp.pricingStatus === 'CB_MATCHED';
                                    const isUnmatched = bp.pricingStatus === 'UNMATCHED';
                                    return (
                                        <div key={bp.id || i} className={`border rounded-lg p-4 bg-slate-800/40 ${isMatched ? 'border-emerald-500/30' : isUnmatched ? 'border-red-500/20' : 'border-white/10'}`}>
                                            {/* Header row */}
                                            <div className="flex items-start justify-between gap-2 mb-2">
                                                <div>
                                                    <span className="text-sm font-semibold text-slate-200">{bp.name}</span>
                                                    <span className="text-[10px] text-slate-600 ml-2">{bp.id}</span>
                                                </div>
                                                <PricingBadge status={(bp.pricingStatus ?? 'AI_ESTIMATE') as PricingStatus} />
                                            </div>

                                            {/* Aesthetic + dates */}
                                            <div className="text-[10px] text-slate-500 mb-2 font-sans">{bp.aesthetic} · {bp.targetDates}</div>
                                            <div className="text-[10px] text-slate-400 font-sans mb-2 line-clamp-2">{bp.description}</div>

                                            {/* Ship + pricing */}
                                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] mb-3">
                                                <span className="text-slate-400 flex items-center gap-1">
                                                    <MapPin className="h-3 w-3" /> {bp.shipTarget ?? 'TBD'}
                                                </span>
                                                {bp.startingPrice && (
                                                    <span className="text-emerald-400">
                                                        From ${bp.startingPrice.toLocaleString()}/pp · {bp.priceSource}
                                                    </span>
                                                )}
                                                {bp.cbPriceAdvantage && (
                                                    <span className="text-cyan-400">{bp.cbPriceAdvantage}% price advantage</span>
                                                )}
                                            </div>

                                            {/* CB booking link */}
                                            {bp.cbagenttoolsBookingLink && (
                                                <div className="text-[10px] mb-3">
                                                    <span className="text-slate-600">Booking link: </span>
                                                    <a
                                                        href={bp.cbagenttoolsBookingLink}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-cyan-400 hover:text-cyan-300 underline break-all"
                                                    >
                                                        {bp.cbagenttoolsBookingLink}
                                                    </a>
                                                </div>
                                            )}

                                            {/* Actions */}
                                            <div className="flex gap-2 pt-2 border-t border-white/5">
                                                <a
                                                    href={`/api/groups/campaign/${bp.id}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-[10px] px-2 py-1 rounded border border-white/10 text-slate-400 hover:text-white transition-all"
                                                >
                                                    View JSON
                                                </a>
                                                <button
                                                    onClick={() => setBlueprints(prev => prev.filter(b => b.id !== bp.id))}
                                                    className="text-[10px] px-2 py-1 rounded border border-red-500/20 text-red-400 hover:text-red-300 hover:border-red-400/40 transition-all"
                                                >
                                                    Remove
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : !phaseALoading && (
                            <div className="text-center py-8 text-slate-600 text-xs">
                                Click "Generate Blueprints" to begin deep research.
                            </div>
                        )}

                    </div>
                </div>

                {/* ─── Phase B ─────────────────────────────────────────────── */}
                <div className="border border-white/10 rounded-xl bg-slate-900/50 overflow-hidden">
                    <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
                        <div>
                            <span className="text-xs text-slate-400 uppercase tracking-widest">Phase B — CB Inventory Match</span>
                            <p className="text-[10px] text-slate-600 mt-0.5">Playwright CBAT scrape · Requires CB_EMAIL + CB_PASSWORD in .env.local</p>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={handleLoadPhaseBStatus}
                                className="text-xs px-3 py-1.5 rounded border border-white/10 text-slate-400 hover:text-white hover:border-white/30 transition-all"
                            >
                                <GitBranch className="h-3 w-3 inline mr-1" /> Load Status
                            </button>
                            <button
                                onClick={handleRunPhaseB}
                                disabled={phaseBLoading}
                                className="flex items-center gap-2 px-4 py-1.5 rounded text-sm font-medium bg-violet-500/20 border border-violet-500/40 text-violet-400 hover:bg-violet-500/30 transition-all disabled:opacity-40 disabled:pointer-events-none"
                            >
                                {phaseBRunning ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Matching…</> : 'Run Matching'}
                            </button>
                        </div>
                    </div>

                    <div className="p-4">
                        {phaseBError && (
                            <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded px-3 py-2 mb-3">{phaseBError}</div>
                        )}

                        {phaseBRunning && (
                            <div className="text-xs text-violet-400 bg-violet-500/10 border border-violet-500/20 rounded px-3 py-2 mb-3 flex items-center gap-2">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                Scraping CB view_groups… polling every 5s
                            </div>
                        )}

                        {phaseBCampaigns.length > 0 ? (
                            <div className="space-y-2">
                                {phaseBCampaigns.map((c) => (
                                    <div key={c.slug} className="border border-white/10 rounded-lg px-3 py-2 flex items-center justify-between">
                                        <div>
                                            <span className="text-xs text-slate-300">{c.name}</span>
                                            <span className="text-[10px] text-slate-600 ml-2">{c.slug}</span>
                                        </div>
                                        <PricingBadge status={c.pricingStatus} />
                                    </div>
                                ))}
                            </div>
                        ) : !phaseBRunning && (
                            <div className="text-center py-8 text-slate-600 text-xs">
                                Click "Load Status" to check existing campaigns, or "Run Matching" to start Phase B.
                            </div>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
}
