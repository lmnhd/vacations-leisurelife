"use client";

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Loader2, RotateCcw, GitBranch, MapPin, ChevronDown, ChevronUp, FlaskConical } from "lucide-react";
import { Campaign } from '@/lib/campaigns/types';

// ─── Types ───────────────────────────────────────────────────────────────────

type PricingStatus = 'AI_ESTIMATE' | 'CB_MATCHED' | 'UNMATCHED';

interface PhaseBCampaignRef {
    slug: string;
    name: string;
    pricingStatus: PricingStatus;
    shipTarget?: string;
}

// ─── Sonar Research Panel ─────────────────────────────────────────────────────

interface SonarResearch {
    psychographic: string;
    aesthetic: string;
}

function SonarResearchPanel({ research }: { research: SonarResearch }) {
    const [openKey, setOpenKey] = useState<'psychographic' | 'aesthetic' | null>(null);

    const sections: Array<{ key: 'psychographic' | 'aesthetic'; label: string; description: string }> = [
        { key: 'psychographic', label: 'Step 1 — Psychographic Discovery', description: 'Community growth & niche subculture analysis' },
        { key: 'aesthetic', label: 'Step 2 — Aesthetic Gap / Ship Match', description: 'Amenity needs × available CB inventory' },
    ];

    return (
        <div className="overflow-hidden border border-amber-500/20 rounded-xl bg-amber-950/10">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-amber-500/10">
                <FlaskConical className="h-3.5 w-3.5 text-amber-400" />
                <span className="text-xs tracking-widest uppercase text-amber-400">Sonar Deep Research</span>
                <span className="text-[10px] text-slate-600 ml-1">Raw Perplexity responses — the foundation for all 5 blueprints</span>
            </div>
            <div className="divide-y divide-amber-500/10">
                {sections.map(({ key, label, description }) => (
                    <div key={key}>
                        <button
                            onClick={() => setOpenKey(openKey === key ? null : key)}
                            className="flex items-center justify-between w-full px-4 py-3 transition-colors hover:bg-amber-500/5"
                        >
                            <div className="text-left">
                                <div className="text-xs text-slate-300">{label}</div>
                                <div className="text-[10px] text-slate-600 mt-0.5">{description}</div>
                            </div>
                            {openKey === key
                                ? <ChevronUp className="h-3.5 w-3.5 text-amber-400" />
                                : <ChevronDown className="h-3.5 w-3.5 text-slate-500" />}
                        </button>
                        {openKey === key && (
                            <div className="px-4 pb-4">
                                <pre className="text-[10px] text-slate-300 bg-slate-900/60 border border-white/5 rounded p-3 overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto">
                                    {research[key]}
                                </pre>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}

// ─── Blueprint Rationale Card ─────────────────────────────────────────────────

function BlueprintRationaleSection({ campaign }: { campaign: Campaign }) {
    const [open, setOpen] = useState(false);
    const hasRationale = !!(campaign.researchRationale || campaign.successLogic || campaign.audienceSignals?.length);
    if (!hasRationale) return null;

    return (
        <div className="mt-3 overflow-hidden border rounded-lg border-cyan-500/15">
            <button
                onClick={() => setOpen(o => !o)}
                className="flex items-center justify-between w-full px-3 py-2 transition-colors bg-cyan-950/20 hover:bg-cyan-950/40"
            >
                <span className="text-[10px] text-cyan-400 uppercase tracking-widest">Research Intelligence</span>
                {open ? <ChevronUp className="w-3 h-3 text-cyan-400" /> : <ChevronDown className="w-3 h-3 text-cyan-500" />}
            </button>
            {open && (
                <div className="px-3 pt-2 pb-3 space-y-3 bg-cyan-950/10">
                    {campaign.audienceSignals && campaign.audienceSignals.length > 0 && (
                        <div>
                            <div className="text-[9px] uppercase tracking-widest text-cyan-600 mb-1.5">Data Signals</div>
                            <ul className="space-y-1">
                                {campaign.audienceSignals.map((signal, idx) => (
                                    <li key={idx} className="text-[10px] text-slate-300 font-sans flex gap-2">
                                        <span className="text-cyan-500 mt-0.5">▸</span>
                                        <span>{signal}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                    {campaign.researchRationale && (
                        <div>
                            <div className="text-[9px] uppercase tracking-widest text-cyan-600 mb-1">Why This Niche</div>
                            <p className="text-[10px] text-slate-300 font-sans leading-relaxed">{campaign.researchRationale}</p>
                        </div>
                    )}
                    {campaign.successLogic && (
                        <div>
                            <div className="text-[9px] uppercase tracking-widest text-cyan-600 mb-1">Success Logic</div>
                            <p className="text-[10px] text-slate-300 font-sans leading-relaxed">{campaign.successLogic}</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
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
    const [sonarResearch, setSonarResearch] = useState<SonarResearch | null>(null);

    // Phase B state
    const [phaseBLoading, setPhaseBLoading] = useState(false);
    const [phaseBCampaigns, setPhaseBCampaigns] = useState<PhaseBCampaignRef[]>([]);
    const [phaseBError, setPhaseBError] = useState<string | null>(null);
    const [phaseBRunning, setPhaseBRunning] = useState(false);
    const phaseBPollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const clearPhaseBPollingInterval = useCallback(() => {
        if (phaseBPollingIntervalRef.current) {
            clearInterval(phaseBPollingIntervalRef.current);
            phaseBPollingIntervalRef.current = null;
        }
    }, []);

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

    useEffect(() => {
        return () => {
            clearPhaseBPollingInterval();
        };
    }, [clearPhaseBPollingInterval]);

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
            if (discoveryData.sonarResearch) {
                setSonarResearch(discoveryData.sonarResearch as SonarResearch);
            }

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
        setSonarResearch(null);
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
        const data = await res.json() as { campaigns?: PhaseBCampaignRef[]; running?: boolean; error?: string };

        if (!res.ok) {
            throw new Error(data.error ?? 'Failed to load Phase B status');
        }

        setPhaseBCampaigns(data.campaigns ?? []);
        if (!data.running) {
            clearPhaseBPollingInterval();
            setPhaseBRunning(false);
            setPhaseBLoading(false);
        }
    }, [clearPhaseBPollingInterval]);

    const startPhaseBPolling = useCallback(() => {
        clearPhaseBPollingInterval();
        phaseBPollingIntervalRef.current = setInterval(() => {
            void pollPhaseBStatus().catch((error: unknown) => {
                clearPhaseBPollingInterval();
                setPhaseBError(error instanceof Error ? error.message : 'Phase B polling failed');
                setPhaseBLoading(false);
                setPhaseBRunning(false);
            });
        }, 5000);
    }, [clearPhaseBPollingInterval, pollPhaseBStatus]);

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
            clearPhaseBPollingInterval();

            const response = await fetch('/api/groups/discovery/phase-b', { method: 'POST' });
            const data = await response.json() as { success?: boolean; error?: string };

            if (!response.ok || !data.success) {
                throw new Error(data.error ?? 'Phase B failed to start');
            }

            await pollPhaseBStatus();
            startPhaseBPolling();
        } catch (err) {
            setPhaseBError(err instanceof Error ? err.message : 'Phase B failed');
            clearPhaseBPollingInterval();
            setPhaseBLoading(false);
            setPhaseBRunning(false);
        }
    };

    const handleLoadPhaseBStatus = async () => {
        try {
            await pollPhaseBStatus();
        } catch (err) {
            setPhaseBError(err instanceof Error ? err.message : 'Failed to load Phase B status');
        }
    };

    const hasPhaseAResults = blueprints.length > 0;

    return (
        <div className="min-h-screen p-6 font-mono text-white bg-slate-950">
            <div className="max-w-5xl mx-auto space-y-8">

                {/* Header */}
                <div className="p-4 border border-white/10 rounded-xl bg-slate-900/50">
                    <h1 className="text-lg font-semibold tracking-wide text-cyan-400">🔍 Group Campaign Discovery</h1>
                    <p className="mt-1 text-xs text-slate-500">
                        Phase A — Sonar deep research → 5 structured blueprints.
                        Phase B — Playwright CB inventory match → live pricing + booking links.
                    </p>
                </div>

                {/* ─── Phase A ─────────────────────────────────────────────── */}
                <div className="overflow-hidden border border-white/10 rounded-xl bg-slate-900/50">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
                        <div>
                            <span className="text-xs tracking-widest uppercase text-slate-400">Phase A — AI Discovery</span>
                            <p className="text-[10px] text-slate-600 mt-0.5">2× Perplexity Sonar + 1× GPT-4o-mini · ~$1.60–$2.00</p>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={handleClearAll} className="text-xs px-3 py-1.5 rounded border border-red-500/30 text-red-400 hover:text-red-300 hover:border-red-400/60 transition-all flex items-center gap-1.5">
                                🗑 Clear All
                            </button>
                            {hasPhaseAResults && (
                                <button onClick={handleClear} className="text-xs px-3 py-1.5 rounded border border-white/10 text-slate-400 hover:text-white hover:border-white/30 transition-all flex items-center gap-1.5">
                                    <RotateCcw className="w-3 h-3" /> Reset
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
                            <div className="px-3 py-2 mb-3 text-xs border rounded text-amber-400 bg-amber-500/10 border-amber-500/20">
                                ⚠️ {skippedCount} blueprint(s) already existed in DynamoDB and were skipped.
                            </div>
                        )}
                        {phaseAError && (
                            <div className="px-3 py-2 mb-3 text-xs text-red-400 border rounded bg-red-500/10 border-red-500/20">{phaseAError}</div>
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
                                                <span className="flex items-center gap-1 text-slate-400">
                                                    <MapPin className="w-3 h-3" /> {bp.shipTarget ?? 'TBD'}
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
                                                        className="underline break-all text-cyan-400 hover:text-cyan-300"
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

                            {/* Research Intelligence (collapsible) */}
                            <BlueprintRationaleSection campaign={bp} />
                                        </div>
                                    );
                                })}
                            </div>
                        ) : !phaseALoading && (
                            <div className="py-8 text-xs text-center text-slate-600">
                                Click "Generate Blueprints" to begin deep research.
                            </div>
                        )}

                    </div>
                </div>

                {/* ─── Sonar Research ─────────────────────────────────────── */}
                {sonarResearch && <SonarResearchPanel research={sonarResearch} />}

                {/* ─── Phase B ─────────────────────────────────────────────── */}
                <div className="overflow-hidden border border-white/10 rounded-xl bg-slate-900/50">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
                        <div>
                            <span className="text-xs tracking-widest uppercase text-slate-400">Phase B — CB Inventory Match</span>
                            <p className="text-[10px] text-slate-600 mt-0.5">Playwright CBAT scrape · Requires CB_EMAIL + CB_PASSWORD in .env.local</p>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={handleLoadPhaseBStatus}
                                className="text-xs px-3 py-1.5 rounded border border-white/10 text-slate-400 hover:text-white hover:border-white/30 transition-all"
                            >
                                <GitBranch className="inline w-3 h-3 mr-1" /> Load Status
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
                            <div className="px-3 py-2 mb-3 text-xs text-red-400 border rounded bg-red-500/10 border-red-500/20">{phaseBError}</div>
                        )}

                        {phaseBRunning && (
                            <div className="flex items-center gap-2 px-3 py-2 mb-3 text-xs border rounded text-violet-400 bg-violet-500/10 border-violet-500/20">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                Scraping CB view_groups… polling every 5s
                            </div>
                        )}

                        {phaseBCampaigns.length > 0 ? (
                            <div className="space-y-2">
                                {phaseBCampaigns.map((c) => (
                                    <div key={c.slug} className="flex items-center justify-between px-3 py-2 border rounded-lg border-white/10">
                                        <div>
                                            <span className="text-xs text-slate-300">{c.name}</span>
                                            <span className="text-[10px] text-slate-600 ml-2">{c.slug}</span>
                                        </div>
                                        <PricingBadge status={c.pricingStatus} />
                                    </div>
                                ))}
                            </div>
                        ) : !phaseBRunning && (
                            <div className="py-8 text-xs text-center text-slate-600">
                                Click "Load Status" to check existing campaigns, or "Run Matching" to start Phase B.
                            </div>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
}
