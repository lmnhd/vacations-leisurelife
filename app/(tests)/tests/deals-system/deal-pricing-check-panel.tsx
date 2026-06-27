"use client";

import { useEffect, useState } from "react";

interface DealOption {
  id: string;
  label: string;
  hasStoredPricing: boolean;
}

interface TierResult {
  tier: "inside" | "outside" | "balcony" | "suite";
  stored: number | null;
  live: number | null;
  percentDelta: number | null;
  currencyCode: string;
}

const TIER_LABEL: Record<TierResult["tier"], string> = {
  inside: "Inside",
  outside: "Ocean View",
  balcony: "Balcony",
  suite: "Suite",
};

function fmtMoney(value: number | null, currencyCode: string): string {
  if (value === null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currencyCode || "USD" }).format(value);
}

export function DealPricingCheckPanel() {
  const [deals, setDeals] = useState<DealOption[]>([]);
  const [selectedDealId, setSelectedDealId] = useState<string>("");
  const [loadingDeals, setLoadingDeals] = useState(false);
  const [checking, setChecking] = useState(false);
  const [applyingTier, setApplyingTier] = useState<string | null>(null);
  const [tiers, setTiers] = useState<TierResult[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [appliedTiers, setAppliedTiers] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    setLoadingDeals(true);
    (async () => {
      try {
        const res = await fetch("/api/tests/deals-system/pricing-check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "list" }),
        });
        const data = (await res.json()) as { ok: boolean; deals?: DealOption[]; error?: string };
        if (!cancelled) {
          if (data.ok && data.deals) {
            setDeals(data.deals);
            if (data.deals.length > 0) setSelectedDealId(data.deals[0].id);
          } else {
            setError(data.error ?? "Failed to load deals.");
          }
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoadingDeals(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function post<T>(body: Record<string, unknown>): Promise<T> {
    const res = await fetch("/api/tests/deals-system/pricing-check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return (await res.json()) as T;
  }

  async function runCheck() {
    if (!selectedDealId) return;
    setChecking(true);
    setError(null);
    setNote(null);
    setTiers(null);
    setAppliedTiers(new Set());
    try {
      const data = await post<{ ok: boolean; error?: string; tiers?: TierResult[]; note?: string }>({
        action: "check",
        dealId: selectedDealId,
      });
      if (!data.ok) throw new Error(data.error ?? "Check failed.");
      setTiers(data.tiers ?? []);
      setNote(data.note ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setChecking(false);
    }
  }

  async function applyTier(tier: TierResult) {
    if (tier.live === null) return;
    setApplyingTier(tier.tier);
    setError(null);
    try {
      const data = await post<{ ok: boolean; error?: string }>({
        action: "apply",
        dealId: selectedDealId,
        tier: tier.tier,
        livePrice: tier.live,
        currencyCode: tier.currencyCode,
      });
      if (!data.ok) throw new Error(data.error ?? "Apply failed.");
      setAppliedTiers((prev) => new Set(prev).add(tier.tier));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setApplyingTier(null);
    }
  }

  const selectClassName =
    "h-10 w-full max-w-xl rounded-lg border border-white/10 bg-black/25 px-3 text-sm text-white outline-none transition focus:border-cyan-300/60";

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-400">
        Cabin pricing is captured once when a Deal is resolved and never auto-refreshes. This scrapes the
        live &quot;Pricing From&quot; block off the Deal&apos;s own booking page and shows any drift versus
        what&apos;s currently published. Nothing writes until you click &quot;Apply&quot; on a specific tier.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1">
          <label className="mb-1 block text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
            Deal
          </label>
          <select
            value={selectedDealId}
            onChange={(e) => {
              setSelectedDealId(e.target.value);
              setTiers(null);
              setNote(null);
              setAppliedTiers(new Set());
            }}
            disabled={loadingDeals || deals.length === 0}
            className={selectClassName}
          >
            {deals.length === 0 && <option value="">{loadingDeals ? "Loading deals…" : "No deals found"}</option>}
            {deals.map((deal) => (
              <option key={deal.id} value={deal.id}>
                {deal.label}
                {!deal.hasStoredPricing ? " (no stored pricing)" : ""}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          disabled={!selectedDealId || checking}
          onClick={() => void runCheck()}
          className="h-10 shrink-0 rounded-lg border border-cyan-300/40 bg-cyan-400/10 px-5 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {checking ? "Checking…" : "Check live pricing"}
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-100">{error}</div>
      )}

      {note && (
        <div className="whitespace-pre-wrap rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-100">
          {note}
        </div>
      )}

      {tiers && tiers.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/[0.04] text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
              <tr>
                <th className="px-4 py-2">Tier</th>
                <th className="px-4 py-2">Stored</th>
                <th className="px-4 py-2">Live</th>
                <th className="px-4 py-2">Delta</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {tiers.map((t) => {
                const mismatch =
                  t.percentDelta !== null && Math.abs(t.percentDelta) > 5 && t.stored !== null && t.live !== null;
                const applied = appliedTiers.has(t.tier);
                return (
                  <tr key={t.tier} className={mismatch ? "bg-amber-500/[0.06]" : undefined}>
                    <td className="px-4 py-3 font-semibold text-white">{TIER_LABEL[t.tier]}</td>
                    <td className="px-4 py-3 text-slate-300">{fmtMoney(t.stored, t.currencyCode)}</td>
                    <td className="px-4 py-3 text-slate-300">{fmtMoney(t.live, t.currencyCode)}</td>
                    <td className={`px-4 py-3 ${mismatch ? "font-semibold text-amber-300" : "text-slate-500"}`}>
                      {t.percentDelta === null ? "—" : `${t.percentDelta > 0 ? "+" : ""}${t.percentDelta.toFixed(1)}%`}
                    </td>
                    <td className="px-4 py-3">
                      {applied ? (
                        <span className="rounded-full border border-emerald-400/35 bg-emerald-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-200">
                          applied
                        </span>
                      ) : mismatch ? (
                        <button
                          type="button"
                          disabled={applyingTier === t.tier}
                          onClick={() => void applyTier(t)}
                          className="rounded-lg border border-amber-300/40 bg-amber-400/10 px-3 py-1.5 text-xs font-semibold text-amber-100 transition hover:bg-amber-400/20 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {applyingTier === t.tier ? "Applying…" : "Apply live price"}
                        </button>
                      ) : (
                        <span className="text-xs text-slate-500">within tolerance</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {tiers && tiers.length === 0 && !note && (
        <p className="text-sm text-slate-500">No comparable cabin tiers found for this deal.</p>
      )}
    </div>
  );
}
