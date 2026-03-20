"use client";

import { useState, useEffect } from "react";
import { ChevronDown, Loader2, RefreshCw } from "lucide-react";

// ────────────────────────────────────────────────────────────────────────────
// CampaignSelector
// Fetches all campaigns from /api/groups/discovery?load=true and renders
// a dropdown. Calls onChange with the selected slug whenever it changes.
// Also allows free-text entry.
// ────────────────────────────────────────────────────────────────────────────

interface CampaignRef {
    id: string;
    name: string;
    readiness: "drafting" | "needs_review" | "ready_for_media";
    pricingStatus: "AI_ESTIMATE" | "CB_MATCHED" | "UNMATCHED" | null;
    aestheticBriefStatus: "pending" | "approved" | "revised" | null;
}

type CampaignFilter = "all" | "cb_matched" | "designed" | "media_ready";

interface CampaignSelectorProps {
    value: string;
    onChange: (slug: string) => void;
    disabled?: boolean;
}

export function CampaignSelector({ value, onChange, disabled = false }: CampaignSelectorProps) {
    const [campaigns, setCampaigns] = useState<CampaignRef[]>([]);
    const [loading, setLoading] = useState(false);
    const [filter, setFilter] = useState<CampaignFilter>("cb_matched");

    const fetchCampaigns = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/groups/discovery?load=true");
            if (res.ok) {
                const data = await res.json();
                const campaignRefs = Array.isArray(data.campaigns) ? data.campaigns as Array<{
                    id: string;
                    name: string;
                    pricingStatus?: "AI_ESTIMATE" | "CB_MATCHED" | "UNMATCHED" | null;
                    aestheticBriefStatus?: "pending" | "approved" | "revised" | null;
                }> : [];

                const campaignsWithReadiness = await Promise.all(
                    campaignRefs.map(async (campaign) => {
                        try {
                            const readinessRes = await fetch(`/api/groups/campaign/${campaign.id}/brief/readiness`, { cache: "no-store" });
                            if (!readinessRes.ok) {
                                return { ...campaign, readiness: "drafting" as const };
                            }

                            const readinessData = await readinessRes.json() as { readiness?: "drafting" | "needs_review" | "ready_for_media" };
                            return {
                                ...campaign,
                                readiness: readinessData.readiness ?? "drafting",
                                pricingStatus: campaign.pricingStatus ?? null,
                                aestheticBriefStatus: campaign.aestheticBriefStatus ?? null,
                            };
                        } catch {
                            return {
                                ...campaign,
                                readiness: "drafting" as const,
                                pricingStatus: campaign.pricingStatus ?? null,
                                aestheticBriefStatus: campaign.aestheticBriefStatus ?? null,
                            };
                        }
                    })
                );

                setCampaigns(campaignsWithReadiness);
            }
        } catch {
            // silently fail — text input still works
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void fetchCampaigns();
    }, []);

    const filteredCampaigns = campaigns.filter((campaign) => {
        if (filter === "all") return true;
        if (filter === "cb_matched") return campaign.pricingStatus === "CB_MATCHED";
        if (filter === "designed") return campaign.readiness === "needs_review" || campaign.readiness === "ready_for_media";
        return campaign.readiness === "ready_for_media";
    });

    const cbMatchedCount = campaigns.filter((campaign) => campaign.pricingStatus === "CB_MATCHED").length;
    const designedCount = campaigns.filter((campaign) => campaign.readiness === "needs_review" || campaign.readiness === "ready_for_media").length;
    const readyCount = campaigns.filter((campaign) => campaign.readiness === "ready_for_media").length;

    const formatCampaignLabel = (campaign: CampaignRef): string => {
        const badges: string[] = [];
        if (campaign.pricingStatus === "CB_MATCHED") badges.push("CB matched");
        if (campaign.readiness === "ready_for_media") badges.push("media-ready");
        else if (campaign.readiness === "needs_review") badges.push("designed");
        else if (campaign.aestheticBriefStatus === "approved") badges.push("approved brief");

        if (badges.length === 0) {
            return `${campaign.name} (${campaign.id})`;
        }

        return `${campaign.name} (${campaign.id}) · ${badges.join(", ")}`;
    };

    return (
        <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
                <button
                    type="button"
                    onClick={() => setFilter("all")}
                    disabled={disabled || loading}
                    className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-widest transition ${filter === "all" ? "border-cyan-400/60 bg-cyan-500/10 text-cyan-200" : "border-white/10 bg-slate-900 text-slate-400 hover:text-slate-200"}`}
                >
                    All {campaigns.length}
                </button>
                <button
                    type="button"
                    onClick={() => setFilter("cb_matched")}
                    disabled={disabled || loading}
                    className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-widest transition ${filter === "cb_matched" ? "border-cyan-400/60 bg-cyan-500/10 text-cyan-200" : "border-white/10 bg-slate-900 text-slate-400 hover:text-slate-200"}`}
                >
                    CB-Matched {cbMatchedCount}
                </button>
                <button
                    type="button"
                    onClick={() => setFilter("designed")}
                    disabled={disabled || loading}
                    className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-widest transition ${filter === "designed" ? "border-cyan-400/60 bg-cyan-500/10 text-cyan-200" : "border-white/10 bg-slate-900 text-slate-400 hover:text-slate-200"}`}
                >
                    Designed {designedCount}
                </button>
                <button
                    type="button"
                    onClick={() => setFilter("media_ready")}
                    disabled={disabled || loading}
                    className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-widest transition ${filter === "media_ready" ? "border-cyan-400/60 bg-cyan-500/10 text-cyan-200" : "border-white/10 bg-slate-900 text-slate-400 hover:text-slate-200"}`}
                >
                    Media-Ready {readyCount}
                </button>
            </div>

            <div className="flex gap-2 items-center">
                {/* Dropdown */}
                <div className="relative flex-1">
                    <select
                        value={filteredCampaigns.some(c => c.id === value) ? value : ""}
                        onChange={e => { if (e.target.value) onChange(e.target.value); }}
                        disabled={disabled || loading}
                        className="w-full appearance-none bg-slate-800 border border-white/10 rounded-lg pl-3 pr-8 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500/40 disabled:opacity-40"
                    >
                        <option value="">— select a campaign —</option>
                        {filteredCampaigns.map(c => (
                            <option key={c.id} value={c.id}>{formatCampaignLabel(c)}</option>
                        ))}
                    </select>
                    <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2">
                        {loading
                            ? <Loader2 className="w-3.5 h-3.5 text-slate-500 animate-spin" />
                            : <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                        }
                    </div>
                </div>

                <button
                    onClick={fetchCampaigns}
                    disabled={disabled || loading}
                    className="p-2 rounded-lg bg-slate-800 border border-white/10 text-slate-400 hover:text-slate-200 hover:bg-slate-700 disabled:opacity-40"
                    title="Refresh campaign list"
                >
                    <RefreshCw className="w-4 h-4" />
                </button>
            </div>

            <div className="text-[11px] text-slate-500">
                {filter === "all" && "Showing every discovered campaign in storage."}
                {filter === "cb_matched" && "Showing campaigns matched to live CB inventory (real ship/date/price assignments)."}
                {filter === "designed" && "Showing campaigns with an existing brief in review or already approved."}
                {filter === "media_ready" && "Showing only campaigns approved and ready for media generation."}
            </div>

            {/* Free-text slug input */}
            <input
                type="text"
                value={value}
                onChange={e => onChange(e.target.value)}
                disabled={disabled}
                placeholder="or type a slug directly"
                className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500/40 disabled:opacity-40"
            />
        </div>
    );
}
