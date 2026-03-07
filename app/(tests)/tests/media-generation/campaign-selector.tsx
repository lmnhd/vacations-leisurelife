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
}

interface CampaignSelectorProps {
    value: string;
    onChange: (slug: string) => void;
    disabled?: boolean;
}

export function CampaignSelector({ value, onChange, disabled = false }: CampaignSelectorProps) {
    const [campaigns, setCampaigns] = useState<CampaignRef[]>([]);
    const [loading, setLoading] = useState(false);

    const fetchCampaigns = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/groups/discovery?load=true");
            if (res.ok) {
                const data = await res.json();
                setCampaigns(data.campaigns ?? []);
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

    return (
        <div className="space-y-2">
            <div className="flex gap-2 items-center">
                {/* Dropdown */}
                <div className="relative flex-1">
                    <select
                        value={campaigns.some(c => c.id === value) ? value : ""}
                        onChange={e => { if (e.target.value) onChange(e.target.value); }}
                        disabled={disabled || loading}
                        className="w-full appearance-none bg-slate-800 border border-white/10 rounded-lg pl-3 pr-8 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500/40 disabled:opacity-40"
                    >
                        <option value="">— select a campaign —</option>
                        {campaigns.map(c => (
                            <option key={c.id} value={c.id}>{c.name} ({c.id})</option>
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
