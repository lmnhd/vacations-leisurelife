"use client";

import { useState } from "react";
import { Loader2, Wand2, Download, Trash2, CheckCircle, AlertTriangle } from "lucide-react";
import { CampaignAestheticBrief } from "@/lib/campaigns/schema";
import { MINIMUM_CAMPAIGN_LEAD_DAYS } from "@/lib/campaigns/launch-window";
import { approveAestheticBrief, regenerateProductionBible, readJsonResponse } from "@/lib/campaigns/aesthetic-workflow-client";

type BriefState = "idle" | "loading" | "generating" | "deleting" | "approving" | "generating_bible" | "red_teaming" | "revising";

type CampaignPricingStatus = "AI_ESTIMATE" | "CB_MATCHED" | "UNMATCHED" | null;

interface AestheticCampaignMeta {
    sailingDateText: string | null;
    daysUntilSail: number | null;
    meetsMinimumLeadTime: boolean | null;
    isTightLeadTime: boolean | null;
    minimumLeadDays: number;
    id: string;
    name: string;
    targetDates: string;
    pricingStatus: CampaignPricingStatus;
    shipTarget: string | null;
    matchedShipName: string | null;
    matchedSailDate: string | null;
}

const EMPTY_BRIEF_MESSAGE = "No brief exists for this slug yet. Use Generate Brief to create one.";

export default function AestheticDevisingTestPage() {
    const [slug, setSlug] = useState("");
    const [briefState, setBriefState] = useState<BriefState>("idle");
    const [result, setResult] = useState<CampaignAestheticBrief | null>(null);
    const [campaignMeta, setCampaignMeta] = useState<AestheticCampaignMeta | null>(null);
    const [loadedSlug, setLoadedSlug] = useState("");
    const [error, setError] = useState("");
    const [confirmOverwrite, setConfirmOverwrite] = useState(false);
    const [priorRequiredFixes, setPriorRequiredFixes] = useState<string[]>([]);

    const isBusy = briefState !== "idle";
    const normalizedSlug = slug.trim();
    const hasLoadedBriefForCurrentSlug = Boolean(result) && loadedSlug === normalizedSlug;
    const shouldWarnBeforeGenerating = campaignMeta !== null && campaignMeta.pricingStatus !== "CB_MATCHED";
    const shouldWarnLaunchWindow = campaignMeta !== null && campaignMeta.meetsMinimumLeadTime === false;

    const loadCampaignMeta = async (campaignSlug: string): Promise<AestheticCampaignMeta | null> => {
        const res = await fetch(`/api/groups/campaign/${campaignSlug}`);
        const data = await readJsonResponse(res);

        if (res.status === 404) {
            setCampaignMeta(null);
            return null;
        }

        if (!res.ok) {
            const errorMessage = typeof data.error === "string" ? data.error : "Failed to load campaign metadata";
            throw new Error(errorMessage);
        }

        const campaign = data.campaign as AestheticCampaignMeta | undefined;
        if (!campaign) {
            throw new Error("Campaign metadata response was missing campaign details");
        }

        setCampaignMeta(campaign);
        return campaign;
    };

    // ── LOAD ─────────────────────────────────────────────────────────────────
    const handleLoad = async () => {
        if (!normalizedSlug) return;
        setBriefState("loading");
        setError("");
        setConfirmOverwrite(false);
        setPriorRequiredFixes([]);

        try {
            await loadCampaignMeta(normalizedSlug);
            const res = await fetch(`/api/groups/campaign/${normalizedSlug}/media/aesthetic`);
            if (res.status === 404) {
                setResult(null);
                setLoadedSlug("");
                setError("");
                return;
            }
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Load failed");
            setResult(data as CampaignAestheticBrief);
            setLoadedSlug(normalizedSlug);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Unknown error");
        } finally {
            setBriefState("idle");
        }
    };

    // ── GENERATE ─────────────────────────────────────────────────────────────
    const handleGenerate = async () => {
        if (!normalizedSlug) return;

        // If a result is already loaded, require confirmation before overwriting
        if (hasLoadedBriefForCurrentSlug && !confirmOverwrite) {
            setConfirmOverwrite(true);
            return;
        }

        setBriefState("generating");
        setError("");
        setConfirmOverwrite(false);
        setPriorRequiredFixes([]);

        try {
            const latestCampaignMeta = await loadCampaignMeta(normalizedSlug);

            if (latestCampaignMeta && latestCampaignMeta.meetsMinimumLeadTime === false) {
                const proceedWithShortLeadTime = window.confirm(
                    `This sailing is only ${latestCampaignMeta.daysUntilSail} days away. Minimum required lead time is ${MINIMUM_CAMPAIGN_LEAD_DAYS} days.\n\n` +
                    'You can still prototype the brief, but normal launch approval will be blocked. Proceed anyway?'
                );

                if (!proceedWithShortLeadTime) {
                    return;
                }
            }

            if (latestCampaignMeta && latestCampaignMeta.pricingStatus !== "CB_MATCHED") {
                const proceedWithoutMatch = window.confirm(
                    `Inventory match has not passed for ${latestCampaignMeta.name}.\n\n` +
                    `Current pricing status: ${latestCampaignMeta.pricingStatus ?? 'unknown'}. ` +
                    `Generating aesthetics before Phase B can lock the brief to a ship context that later changes.\n\n` +
                    'Proceed anyway?'
                );

                if (!proceedWithoutMatch) {
                    return;
                }
            }

            const res = await fetch(`/api/groups/campaign/${normalizedSlug}/media/aesthetic`, {
                method: "POST",
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Generation failed");
            setResult(data as CampaignAestheticBrief);
            setLoadedSlug(normalizedSlug);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Unknown error");
        } finally {
            setBriefState("idle");
        }
    };

    // ── DELETE ────────────────────────────────────────────────────────────────
    const handleDelete = async () => {
        if (!normalizedSlug || !hasLoadedBriefForCurrentSlug) return;
        setBriefState("deleting");
        setError("");

        try {
            const res = await fetch(`/api/groups/campaign/${normalizedSlug}/media/aesthetic`, {
                method: "DELETE",
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Delete failed");
            setResult(null);
            setLoadedSlug("");
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Unknown error");
        } finally {
            setBriefState("idle");
        }
    };

    // ── GENERATE PRODUCTION BIBLE ─────────────────────────────────────────────
    const handleGenerateBible = async () => {
        if (!normalizedSlug || !hasLoadedBriefForCurrentSlug) return;
        setBriefState("generating_bible");
        setError("");

        try {
            const { response: res, data } = await regenerateProductionBible(normalizedSlug);
            if (!res.ok) throw new Error(data.error || "Production Bible generation failed");
            setResult(data.brief as CampaignAestheticBrief);
            setLoadedSlug(normalizedSlug);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Unknown error");
        } finally {
            setBriefState("idle");
        }
    };

    // ── APPROVE ───────────────────────────────────────────────────────────────
    const handleApprove = async () => {
        if (!normalizedSlug || !hasLoadedBriefForCurrentSlug) return;
        setBriefState("approving");
        setError("");

        try {
            const { response: res, data } = await approveAestheticBrief(normalizedSlug);
            if (!res.ok) {
                const errorMessage = typeof data.error === "string" ? data.error : "Approval failed";
                const errorDetails = typeof data.details === "string" ? data.details : "";
                throw new Error(errorDetails ? `${errorMessage}: ${errorDetails}` : errorMessage);
            }
            setResult(data.brief as CampaignAestheticBrief);
            setLoadedSlug(normalizedSlug);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Unknown error");
        } finally {
            setBriefState("idle");
        }
    };

    const handleRedTeam = async () => {
        if (!normalizedSlug || !hasLoadedBriefForCurrentSlug) return;
        setBriefState("red_teaming");
        setError("");

        try {
            const res = await fetch(`/api/groups/campaign/${normalizedSlug}/media/aesthetic/red-team`, {
                method: "POST",
                headers: priorRequiredFixes.length > 0 ? { 'Content-Type': 'application/json' } : undefined,
                body: priorRequiredFixes.length > 0 ? JSON.stringify({ priorRequiredFixes }) : undefined,
            });
            const data = await readJsonResponse(res);
            if (!res.ok) {
                const errorMessage = typeof data.error === "string" ? data.error : "Red-team review failed";
                const errorDetails = typeof data.details === "string" ? data.details : "";
                throw new Error(errorDetails ? `${errorMessage}: ${errorDetails}` : errorMessage);
            }
            setResult(data.brief as CampaignAestheticBrief);
            setLoadedSlug(normalizedSlug);
            setPriorRequiredFixes([]);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Unknown error");
        } finally {
            setBriefState("idle");
        }
    };

    // ── REVISE ────────────────────────────────────────────────────────────────
    const handleRevise = async () => {
        if (!normalizedSlug || !hasLoadedBriefForCurrentSlug) return;
        setBriefState("revising");
        setError("");

        try {
            const res = await fetch(`/api/groups/campaign/${normalizedSlug}/media/aesthetic/revise`, {
                method: "POST",
            });
            const data = await readJsonResponse(res);

            // Deadlock — show operator message
            if (res.status === 409 && data.deadlock) {
                const deadlockMsg = typeof data.message === "string" ? data.message : "Revision deadlock detected.";
                const fixes = Array.isArray(data.survivingFixes) ? (data.survivingFixes as string[]).join("; ") : "";
                setError(`${deadlockMsg} Surviving fixes: ${fixes}`);
                return;
            }

            if (!res.ok) {
                const errorMessage = typeof data.error === "string" ? data.error : "Revision failed";
                const errorDetails = typeof data.details === "string" ? data.details : "";
                throw new Error(errorDetails ? `${errorMessage}: ${errorDetails}` : errorMessage);
            }

            // Capture priorRequiredFixes for re-review handoff
            if (Array.isArray(data.priorRequiredFixes)) {
                setPriorRequiredFixes(data.priorRequiredFixes as string[]);
            }

            setResult(data.brief as CampaignAestheticBrief);
            setLoadedSlug(normalizedSlug);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Unknown error");
        } finally {
            setBriefState("idle");
        }
    };

    const statusBadgeColor = (status: string) => {
        if (status === "approved") return "text-emerald-400 border-emerald-500/30 bg-emerald-500/10";
        if (status === "revised") return "text-yellow-400 border-yellow-500/30 bg-yellow-500/10";
        return "text-slate-400 border-white/10 bg-white/5";
    };

    const redTeamBadgeColor = (verdict?: string) => {
        if (verdict === "pass") return "text-emerald-400 border-emerald-500/30 bg-emerald-500/10";
        if (verdict === "warn") return "text-amber-300 border-amber-500/30 bg-amber-500/10";
        if (verdict === "block") return "text-red-300 border-red-500/30 bg-red-500/10";
        return "text-slate-400 border-white/10 bg-white/5";
    };

    return (
        <div className="min-h-screen bg-slate-950 text-white p-6 font-mono">
            <div className="max-w-4xl mx-auto space-y-4">

                {/* Header */}
                <div className="border border-white/10 rounded-xl p-4 bg-slate-900/50">
                    <h1 className="text-lg font-semibold text-cyan-400 tracking-wide">
                        🎨 Aesthetic Design — Phase 1
                    </h1>
                    <p className="text-xs text-slate-500 mt-1">
                        Load an existing brief, generate a new one, approve, or delete. Run against a campaign slug.
                    </p>
                </div>

                {/* Slug + Load */}
                <div className="border border-white/10 rounded-xl p-4 bg-slate-900/50 space-y-3">
                    <div className="text-[10px] text-slate-500 uppercase tracking-widest">Campaign Slug</div>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            placeholder="e.g. cat-lovers-cruise-2026"
                            value={slug}
                            onChange={(e) => {
                                setSlug(e.target.value);
                                setConfirmOverwrite(false);
                                setCampaignMeta(null);
                            }}
                            onKeyDown={(e) => e.key === "Enter" && handleLoad()}
                            disabled={isBusy}
                            className="flex-1 bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500/40 disabled:opacity-40"
                        />
                        <button
                            id="btn-load"
                            onClick={handleLoad}
                            disabled={isBusy || !slug.trim()}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-slate-700/50 border border-white/10 text-slate-300 hover:bg-slate-700 transition-all disabled:opacity-40 disabled:pointer-events-none"
                        >
                            {briefState === "loading"
                                ? <Loader2 className="h-4 w-4 animate-spin" />
                                : <Download className="h-4 w-4" />
                            }
                            {briefState === "loading" ? "Loading..." : "Load"}
                        </button>
                    </div>

                    {error && (
                        <div className="rounded-lg px-3 py-2 text-xs bg-red-500/10 border border-red-500/20 text-red-400">
                            {error}
                        </div>
                    )}
                    {!error && !hasLoadedBriefForCurrentSlug && normalizedSlug && briefState === "idle" && (
                        <div className="rounded-lg px-3 py-2 text-xs bg-amber-500/10 border border-amber-500/20 text-amber-300">
                            {EMPTY_BRIEF_MESSAGE}
                        </div>
                    )}
                    {!error && result && loadedSlug && loadedSlug !== normalizedSlug && (
                        <div className="rounded-lg px-3 py-2 text-xs bg-sky-500/10 border border-sky-500/20 text-sky-300">
                            Loaded brief is for <span className="font-semibold">{loadedSlug}</span>. Load or generate the current slug before approving, deleting, or generating a bible.
                        </div>
                    )}
                    {!error && campaignMeta && shouldWarnBeforeGenerating && (
                        <div className="rounded-lg px-3 py-2 text-xs bg-amber-500/10 border border-amber-500/20 text-amber-300">
                            Inventory match warning: this campaign is currently <span className="font-semibold">{campaignMeta.pricingStatus ?? 'unknown'}</span>.
                            {campaignMeta.matchedShipName
                                ? ` Current matched ship: ${campaignMeta.matchedShipName}${campaignMeta.matchedSailDate ? ` on ${campaignMeta.matchedSailDate}` : ''}.`
                                : campaignMeta.shipTarget
                                    ? ` Ship target is still ${campaignMeta.shipTarget}, but no confirmed CB match is stored yet.`
                                    : ' No confirmed CB ship match is stored yet.'}
                            {' '}Run Inventory Match before generating aesthetics unless you are intentionally prototyping ahead of Phase B.
                        </div>
                    )}
                    {!error && campaignMeta && shouldWarnLaunchWindow && (
                        <div className="rounded-lg px-3 py-2 text-xs bg-red-500/10 border border-red-500/20 text-red-300">
                            Launch window warning: this sailing is only <span className="font-semibold">{campaignMeta.daysUntilSail}</span> days away.
                            Minimum required lead time is {campaignMeta.minimumLeadDays} days, so approval for normal launch will be blocked until the campaign is moved to a later sailing.
                        </div>
                    )}
                </div>

                {/* Action Bar — only shown when slug is entered */}
                {normalizedSlug && (
                    <div className="border border-white/10 rounded-xl p-4 bg-slate-900/50">
                        <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-3">Actions</div>
                        
                        {/* Re-review mode indicator */}
                        {priorRequiredFixes.length > 0 && (
                            <div className="mb-3 rounded-lg px-3 py-2 text-xs bg-blue-500/10 border border-blue-500/20 text-blue-300">
                                <span className="font-semibold">Re-review mode active:</span> Next red-team will validate {priorRequiredFixes.length} prior fix{priorRequiredFixes.length > 1 ? 'es' : ''}
                            </div>
                        )}
                        
                        <div className="flex flex-wrap gap-2 items-center">

                            {/* Generate / Overwrite */}
                            {confirmOverwrite ? (
                                <div className="flex items-center gap-2 flex-wrap">
                                    <div className="flex items-center gap-1 text-xs text-amber-400">
                                        <AlertTriangle className="h-3.5 w-3.5" />
                                        This will overwrite the existing brief. Confirm?
                                    </div>
                                    <button
                                        id="btn-confirm-overwrite"
                                        onClick={handleGenerate}
                                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-500/20 border border-amber-500/40 text-amber-400 hover:bg-amber-500/30 transition-all"
                                    >
                                        Yes, overwrite
                                    </button>
                                    <button
                                        onClick={() => setConfirmOverwrite(false)}
                                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-700/50 border border-white/10 text-slate-400 hover:bg-slate-700 transition-all"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            ) : (
                                <button
                                    id="btn-generate"
                                    onClick={handleGenerate}
                                    disabled={isBusy || !normalizedSlug}
                                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-cyan-500/20 border border-cyan-500/40 text-cyan-400 hover:bg-cyan-500/30 transition-all disabled:opacity-40 disabled:pointer-events-none"
                                >
                                    {briefState === "generating"
                                        ? <Loader2 className="h-4 w-4 animate-spin" />
                                        : <Wand2 className="h-4 w-4" />
                                    }
                                    {briefState === "generating" ? "Generating..." : hasLoadedBriefForCurrentSlug ? "Re-generate" : "Generate Brief"}
                                </button>
                            )}

                            {/* Production Bible */}
                            {hasLoadedBriefForCurrentSlug && result && (
                                <button
                                    id="btn-generate-bible"
                                    onClick={handleGenerateBible}
                                    disabled={isBusy}
                                    title={result.productionBible ? "Regenerate Production Bible" : "Generate Production Bible (Pass 3 — slow, ~2-4 min)"}
                                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-purple-500/20 border border-purple-500/40 text-purple-300 hover:bg-purple-500/30 transition-all disabled:opacity-40 disabled:pointer-events-none"
                                >
                                    {briefState === "generating_bible"
                                        ? <Loader2 className="h-4 w-4 animate-spin" />
                                        : <Wand2 className="h-4 w-4" />
                                    }
                                    {briefState === "generating_bible"
                                        ? "Generating Bible..."
                                        : result.productionBible
                                            ? "Re-gen Bible"
                                            : "Generate Bible"
                                    }
                                </button>
                            )}

                            {hasLoadedBriefForCurrentSlug && result && (
                                <button
                                    id="btn-red-team"
                                    onClick={handleRedTeam}
                                    disabled={isBusy}
                                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-amber-500/20 border border-amber-500/40 text-amber-300 hover:bg-amber-500/30 transition-all disabled:opacity-40 disabled:pointer-events-none"
                                >
                                    {briefState === "red_teaming"
                                        ? <Loader2 className="h-4 w-4 animate-spin" />
                                        : <AlertTriangle className="h-4 w-4" />
                                    }
                                    {briefState === "red_teaming" ? "Red-Teaming..." : result.redTeamReview ? "Re-run Red Team" : "Run Red Team"}
                                </button>
                            )}

                            {/* Revise — only shown when review exists and verdict is not pass */}
                            {hasLoadedBriefForCurrentSlug && result && result.redTeamReview && result.redTeamReview.verdict !== "pass" && (
                                <button
                                    id="btn-revise"
                                    onClick={handleRevise}
                                    disabled={isBusy}
                                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-orange-500/20 border border-orange-500/40 text-orange-300 hover:bg-orange-500/30 transition-all disabled:opacity-40 disabled:pointer-events-none"
                                >
                                    {briefState === "revising"
                                        ? <Loader2 className="h-4 w-4 animate-spin" />
                                        : <Wand2 className="h-4 w-4" />
                                    }
                                    {briefState === "revising" ? "Revising..." : "Revise"}
                                </button>
                            )}

                            {/* Approve */}
                            {hasLoadedBriefForCurrentSlug && result && result.humanReviewStatus !== "approved" && (
                                <button
                                    id="btn-approve"
                                    onClick={handleApprove}
                                    disabled={isBusy || result.redTeamReview?.verdict !== "pass" || campaignMeta?.meetsMinimumLeadTime === false}
                                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/30 transition-all disabled:opacity-40 disabled:pointer-events-none"
                                >
                                    {briefState === "approving"
                                        ? <Loader2 className="h-4 w-4 animate-spin" />
                                        : <CheckCircle className="h-4 w-4" />
                                    }
                                    {briefState === "approving" ? "Approving..." : "Approve"}
                                </button>
                            )}

                            {/* Delete */}
                            {hasLoadedBriefForCurrentSlug && result && (
                                <button
                                    id="btn-delete"
                                    onClick={handleDelete}
                                    disabled={isBusy}
                                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-all disabled:opacity-40 disabled:pointer-events-none ml-auto"
                                >
                                    {briefState === "deleting"
                                        ? <Loader2 className="h-4 w-4 animate-spin" />
                                        : <Trash2 className="h-4 w-4" />
                                    }
                                    {briefState === "deleting" ? "Deleting..." : "Delete Brief"}
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {/* Result */}
                {result && (
                    <>
                        {/* Identity Summary */}
                        <div className="border border-white/10 rounded-xl bg-slate-900/50 overflow-hidden">
                            <div className="px-4 py-2 border-b border-white/5 flex items-center justify-between">
                                <span className="text-xs text-slate-400 uppercase tracking-widest">Identity Summary</span>
                                <div className="flex items-center gap-2">
                                    {result.revisionCycleCount ? (
                                        <span className={`text-[10px] px-2 py-0.5 rounded-full border ${result.revisionCycleCount >= 2 ? 'text-red-300 border-red-500/30 bg-red-500/10' : 'text-blue-300 border-blue-500/30 bg-blue-500/10'}`}>
                                            revision #{result.revisionCycleCount}
                                        </span>
                                    ) : null}
                                    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${statusBadgeColor(result.humanReviewStatus)}`}>
                                        {result.humanReviewStatus}
                                    </span>
                                    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${redTeamBadgeColor(result.redTeamReview?.verdict)}`}>
                                        red-team {result.redTeamReview?.verdict ?? 'pending'}
                                    </span>
                                </div>
                            </div>
                            <div className="p-4 space-y-4">
                                {/* Color swatches */}
                                <div>
                                    <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-2">Color Palette</div>
                                    <div className="flex gap-2 flex-wrap">
                                        {Object.entries(result.visual?.colorPalette ?? {}).map(([key, rawValue]) => {
                                            const hexMatch = (rawValue as string).match(/#[0-9A-Fa-f]{3,6}/);
                                            const hexColor = hexMatch ? hexMatch[0] : (rawValue as string);
                                            return (
                                                <div key={key} className="flex flex-col items-center gap-1">
                                                    <div
                                                        className="w-12 h-10 rounded-md border border-white/10"
                                                        style={{ backgroundColor: hexColor }}
                                                        title={`${key}: ${rawValue}`}
                                                    />
                                                    <span className="text-[9px] text-slate-500 text-center leading-tight max-w-[52px]">{key}</span>
                                                    <span className="text-[9px] text-slate-600 font-mono">{hexColor}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Slogans */}
                                <div>
                                    <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Hero Slogan</div>
                                    <p className="text-emerald-400 text-base">{result.messaging?.heroSlogan}</p>
                                    <p className="text-slate-400 text-sm mt-0.5">{result.messaging?.subSlogan}</p>
                                </div>

                                {/* Voice persona */}
                                <div>
                                    <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Voice Persona</div>
                                    <p className="text-xs text-slate-300">{result.messaging?.voicePersona}</p>
                                </div>

                                {/* Human Representation */}
                                <div className="grid gap-3 md:grid-cols-2">
                                    <div>
                                        <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Casting Goal</div>
                                        <p className="text-xs text-slate-300 leading-relaxed">{result.visual?.humanRepresentation?.castingGoal}</p>
                                    </div>
                                    <div>
                                        <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Age Range Guidance</div>
                                        <p className="text-xs text-slate-300 leading-relaxed">{result.visual?.humanRepresentation?.ageRangeGuidance}</p>
                                    </div>
                                    <div>
                                        <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Diversity Intent</div>
                                        <p className="text-xs text-slate-300 leading-relaxed">{result.visual?.humanRepresentation?.diversityIntent}</p>
                                    </div>
                                    <div>
                                        <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Pairing Guidance</div>
                                        <p className="text-xs text-slate-300 leading-relaxed">{result.visual?.humanRepresentation?.pairingGuidance}</p>
                                    </div>
                                </div>

                                {result.visual?.humanRepresentation?.antiStereotypeRules?.length > 0 && (
                                    <div>
                                        <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Anti-Stereotype Rules</div>
                                        <ul className="space-y-1">
                                            {result.visual.humanRepresentation.antiStereotypeRules.map((item, idx) => (
                                                <li key={idx} className="text-xs text-slate-300 leading-relaxed">• {item}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {/* Community Expression */}
                                <div className="grid gap-3 md:grid-cols-2">
                                    <div>
                                        <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Community Core Promise</div>
                                        <p className="text-xs text-slate-300 leading-relaxed">{result.communityExpression?.corePromise}</p>
                                    </div>
                                    <div>
                                        <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Participation Style</div>
                                        <p className="text-xs text-slate-300 leading-relaxed">{result.communityExpression?.participationStyle}</p>
                                    </div>
                                    <div>
                                        <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Social Gravity</div>
                                        <p className="text-xs text-slate-300 leading-relaxed">{result.communityExpression?.socialGravity}</p>
                                    </div>
                                    <div>
                                        <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Copy Framing Rule</div>
                                        <p className="text-xs text-slate-300 leading-relaxed">{result.communityExpression?.copyFramingRule}</p>
                                    </div>
                                </div>

                                {result.communityExpression?.optionalGatherings?.length > 0 && (
                                    <div>
                                        <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Optional Gatherings</div>
                                        <ul className="space-y-1">
                                            {result.communityExpression.optionalGatherings.map((item, idx) => (
                                                <li key={idx} className="text-xs text-slate-300 leading-relaxed">• {item}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {result.redTeamReview && (
                                    <div className="space-y-3 pt-2 border-t border-white/5">
                                        <div className="flex items-center justify-between gap-3">
                                            <div>
                                                <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Red-Team Summary</div>
                                                <p className="text-xs text-slate-300 leading-relaxed">{result.redTeamReview.summary}</p>
                                            </div>
                                            <span className={`text-[10px] px-2 py-0.5 rounded-full border shrink-0 ${redTeamBadgeColor(result.redTeamReview.verdict)}`}>
                                                {result.redTeamReview.verdict}
                                            </span>
                                        </div>

                                        <div>
                                            <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Approval Recommendation</div>
                                            <p className="text-xs text-slate-300 leading-relaxed">{result.redTeamReview.approvalRecommendation}</p>
                                        </div>

                                        {result.redTeamReview.requiredFixes.length > 0 && (
                                            <div>
                                                <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Required Fixes</div>
                                                <ul className="space-y-1">
                                                    {result.redTeamReview.requiredFixes.map((item, idx) => (
                                                        <li key={idx} className="text-xs text-red-200 leading-relaxed">• {item}</li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}

                                        {result.redTeamReview.issues.length > 0 && (
                                            <div>
                                                <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-2">Issues</div>
                                                <div className="space-y-2">
                                                    {result.redTeamReview.issues.map((issue, idx) => (
                                                        <div key={`${issue.title}-${idx}`} className="rounded-lg border border-white/10 bg-white/5 p-3 space-y-1">
                                                            <div className="flex flex-wrap items-center gap-2">
                                                                <span className={`text-[10px] px-2 py-0.5 rounded-full border ${issue.severity === 'blocker' ? 'text-red-300 border-red-500/30 bg-red-500/10' : 'text-amber-300 border-amber-500/30 bg-amber-500/10'}`}>
                                                                    {issue.severity}
                                                                </span>
                                                                <span className="text-[10px] text-slate-500 uppercase tracking-widest">{issue.category.replace(/_/g, ' ')}</span>
                                                            </div>
                                                            <div className="text-xs text-white">{issue.title}</div>
                                                            <p className="text-xs text-slate-400 leading-relaxed">{issue.evidence}</p>
                                                            <p className="text-xs text-cyan-200 leading-relaxed">{issue.recommendation}</p>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Meta */}
                                <div className="pt-2 border-t border-white/5 flex gap-6 text-[10px] text-slate-600">
                                    <span>Generated: {result.generatedAt ? new Date(result.generatedAt).toLocaleString() : "—"}</span>
                                    <span>By: {result.generatedBy}</span>
                                    <span>Red Team: {result.redTeamReview?.evaluatedAt ? new Date(result.redTeamReview.evaluatedAt).toLocaleString() : "—"}</span>
                                </div>
                            </div>
                        </div>

                        {/* Full JSON */}
                        <div className="border border-white/10 rounded-xl bg-slate-900/50 overflow-hidden">
                            <div className="px-4 py-2 border-b border-white/5">
                                <span className="text-xs text-slate-400 uppercase tracking-widest">Full JSON Output</span>
                            </div>
                            <div className="p-4 max-h-[600px] overflow-y-auto">
                                <pre className="text-[11px] text-slate-300 leading-relaxed whitespace-pre-wrap break-words">
                                    {JSON.stringify(result, null, 2)}
                                </pre>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
