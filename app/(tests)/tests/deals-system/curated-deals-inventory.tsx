"use client";

/**
 * Curated Deals inventory manager for the operator dashboard's Inventory tab:
 * search / sort / filter toolbar, pin + hide controls (wired to the existing
 * curated-deal API actions), and the per-deal card with its 14-day reach
 * sparkline and expandable activity panel.
 */

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { type DealsSystemDashboardData } from "@/lib/cb/deals-system/dashboard-data";

import { DealActivityPanel } from "./deal-activity-panel";
import { DealTrendSparkline, SevenDayDelta } from "./deal-activity-charts";

type CuratedDealSummary = DealsSystemDashboardData["curatedDeals"][number];

type StatusTone = "ok" | "error" | "neutral" | "pending" | "blocked";

const statusStyles: Record<StatusTone, string> = {
  pending: "border-amber-400/35 bg-amber-500/10 text-amber-200",
  blocked: "border-rose-400/35 bg-rose-500/10 text-rose-200",
  ok: "border-emerald-400/35 bg-emerald-500/10 text-emerald-200",
  error: "border-rose-400/35 bg-rose-500/10 text-rose-200",
  neutral: "border-white/10 bg-white/5 text-slate-200",
};

function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: StatusTone }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.16em] ${statusStyles[tone]}`}
    >
      {children}
    </span>
  );
}

function formatDateTime(value?: string) {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatTimeOfDay(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleTimeString();
}

// ─── Sorting & filtering ─────────────────────────────────────────────────────

const SORT_OPTIONS = [
  { id: "recent", label: "Recent activity" },
  { id: "views", label: "Most views" },
  { id: "clicks", label: "Most book clicks" },
  { id: "actions", label: "Most actions" },
  { id: "booked", label: "Most bookings" },
  { id: "sail", label: "Sail date" },
  { id: "title", label: "Title A–Z" },
] as const;

type SortId = (typeof SORT_OPTIONS)[number]["id"];

function compareDeals(a: CuratedDealSummary, b: CuratedDealSummary, sort: SortId): number {
  switch (sort) {
    case "views":
      return b.activity.totalViews - a.activity.totalViews;
    case "clicks":
      return b.activity.bookNowClicks - a.activity.bookNowClicks;
    case "actions":
      return b.activity.totalActions - a.activity.totalActions;
    case "booked":
      return (
        b.activity.bookingsConfirmed - a.activity.bookingsConfirmed ||
        b.activity.bookingPortalEntries - a.activity.bookingPortalEntries
      );
    case "sail":
      return (a.sailDateIso || "9999").localeCompare(b.sailDateIso || "9999");
    case "title":
      return a.title.localeCompare(b.title);
    case "recent":
    default: {
      const aIso = a.activity.lastActivityAtIso ?? "";
      const bIso = b.activity.lastActivityAtIso ?? "";
      return bIso.localeCompare(aIso);
    }
  }
}

interface VisibilityOverride {
  pinned?: boolean;
  hidden?: boolean;
}

// ─── Manager ─────────────────────────────────────────────────────────────────

/** How often the list re-pulls server data while the browser tab is visible. */
const AUTO_REFRESH_MS = 60_000;

export function CuratedDealsInventory({
  deals,
  readAtIso,
}: {
  deals: CuratedDealSummary[];
  readAtIso?: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortId>("recent");
  const [statusFilter, setStatusFilter] = useState<"all" | "publishable" | "not_public">("all");
  const [hookFilter, setHookFilter] = useState<"all" | "saved" | "missing">("all");
  const [showHidden, setShowHidden] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, VisibilityOverride>>({});
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Soft refresh: re-runs the server component and swaps in fresh data while
  // preserving client state (filters, sort, scroll, expanded panels). Gated on
  // tab visibility so a dashboard left open overnight doesn't poll Dynamo, and
  // paused while a pin/hide mutation is in flight.
  useEffect(() => {
    if (!autoRefresh || pendingId !== null) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [autoRefresh, pendingId, router]);

  // Optimistic pin/hide state layered over the server-rendered summaries.
  const effectiveDeals = useMemo(
    () =>
      deals.map((deal) => {
        const override = overrides[deal.id];
        return override ? { ...deal, ...override } : deal;
      }),
    [deals, overrides]
  );

  const hiddenCount = effectiveDeals.filter((deal) => deal.hidden).length;

  const visibleDeals = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return effectiveDeals
      .filter((deal) => {
        if (!showHidden && deal.hidden) return false;
        if (statusFilter === "publishable" && !deal.publishable) return false;
        if (statusFilter === "not_public" && deal.publishable) return false;
        if (hookFilter === "saved" && !deal.hasCampaignStrategy) return false;
        if (hookFilter === "missing" && deal.hasCampaignStrategy) return false;
        if (needle) {
          const haystack =
            `${deal.title} ${deal.cruiseLine} ${deal.shipName} ${deal.packageId}`.toLowerCase();
          if (!haystack.includes(needle)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return compareDeals(a, b, sort);
      });
  }, [effectiveDeals, query, sort, statusFilter, hookFilter, showHidden]);

  async function setVisibility(dealId: string, action: "pin" | "unpin" | "hide" | "unhide") {
    setPendingId(dealId);
    setActionError(null);
    try {
      const res = await fetch("/api/tests/deals-system/curated-deal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, dealId }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? `Failed to ${action} deal.`);
      }
      setOverrides((prev) => ({
        ...prev,
        [dealId]: {
          ...prev[dealId],
          ...(action === "pin" || action === "unpin"
            ? { pinned: action === "pin" }
            : { hidden: action === "hide" }),
        },
      }));
      router.refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : `Failed to ${action} deal.`);
    } finally {
      setPendingId(null);
    }
  }

  const selectClass =
    "rounded-lg border border-white/10 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-200 focus:border-cyan-300/50 focus:outline-none";

  return (
    <div>
      {/* Toolbar — scopes everything below it. */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search title, ship, line, package id…"
          className="min-w-[220px] flex-1 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 focus:border-cyan-300/50 focus:outline-none"
        />
        <label className="flex items-center gap-1.5 text-[11px] text-slate-500">
          Sort
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as SortId)}
            className={selectClass}
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-[11px] text-slate-500">
          Status
          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as "all" | "publishable" | "not_public")
            }
            className={selectClass}
          >
            <option value="all">All</option>
            <option value="publishable">Publishable</option>
            <option value="not_public">Not public</option>
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-[11px] text-slate-500">
          Hook
          <select
            value={hookFilter}
            onChange={(event) => setHookFilter(event.target.value as "all" | "saved" | "missing")}
            className={selectClass}
          >
            <option value="all">All</option>
            <option value="saved">Saved</option>
            <option value="missing">Missing</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => setShowHidden((value) => !value)}
          className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition ${
            showHidden
              ? "border-cyan-300/40 bg-cyan-400/10 text-cyan-100"
              : "border-white/10 bg-white/[0.03] text-slate-400 hover:text-slate-200"
          }`}
        >
          {showHidden ? "Showing hidden" : `Show hidden (${hiddenCount})`}
        </button>
        <button
          type="button"
          onClick={() => setAutoRefresh((value) => !value)}
          title="While on, this list re-pulls live reach/action data every 60 seconds without reloading the page (only while this browser tab is visible)."
          className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition ${
            autoRefresh
              ? "border-emerald-300/40 bg-emerald-400/10 text-emerald-200"
              : "border-white/10 bg-white/[0.03] text-slate-400 hover:text-slate-200"
          }`}
        >
          {autoRefresh ? "Auto-refresh 60s · on" : "Auto-refresh · off"}
        </button>
      </div>

      <p className="mt-2 text-[11px] text-slate-500">
        Showing {visibleDeals.length} of {deals.length} deals
        {!showHidden && hiddenCount > 0 ? ` · ${hiddenCount} hidden` : ""}
        {readAtIso ? ` · data as of ${formatTimeOfDay(readAtIso)}` : ""}
      </p>

      {actionError && <p className="mt-2 text-xs text-rose-300">{actionError}</p>}

      {visibleDeals.length === 0 ? (
        <div className="mt-3 rounded-xl border border-dashed border-white/15 bg-white/[0.03] p-6 text-sm text-slate-400">
          No deals match the current filters.
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          {visibleDeals.map((deal) => (
            <CuratedDealCard
              key={deal.id}
              deal={deal}
              pending={pendingId === deal.id}
              onSetVisibility={setVisibility}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Card ────────────────────────────────────────────────────────────────────

function CuratedDealCard({
  deal,
  pending,
  onSetVisibility,
}: {
  deal: CuratedDealSummary;
  pending: boolean;
  onSetVisibility: (dealId: string, action: "pin" | "unpin" | "hide" | "unhide") => void;
}) {
  const [showActivity, setShowActivity] = useState(false);
  const a = deal.activity;

  const controlClass =
    "rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] font-semibold text-slate-300 transition hover:bg-white/[0.08] hover:text-white disabled:opacity-50";

  return (
    <article
      className={`rounded-xl border border-white/10 bg-white/[0.035] p-4 ${deal.hidden ? "opacity-60" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-white">{deal.title}</h3>
          <p className="mt-1 text-xs text-slate-400">
            {deal.cruiseLine} | {deal.shipName} | {deal.sailDateIso} | package {deal.packageId}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => onSetVisibility(deal.id, deal.pinned ? "unpin" : "pin")}
            className={controlClass}
            title={deal.pinned ? "Unpin from top of list" : "Pin to top of list"}
          >
            {deal.pinned ? "Unpin" : "Pin"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => onSetVisibility(deal.id, deal.hidden ? "unhide" : "hide")}
            className={controlClass}
            title={
              deal.hidden
                ? "Unhide (also restores public eligibility)"
                : "Hide from this list and the public Deals surface"
            }
          >
            {deal.hidden ? "Unhide" : "Hide"}
          </button>
          <Badge tone={deal.publishable ? "ok" : "blocked"}>
            {deal.publishable ? "publishable" : "not public"}
          </Badge>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Badge>{deal.status}</Badge>
        <Badge tone={deal.linkHealth === "valid" ? "ok" : "pending"}>{deal.linkHealth}</Badge>
        <Badge tone={deal.hasAngleResearch ? "ok" : "pending"}>
          research {deal.hasAngleResearch ? "yes" : "missing"}
        </Badge>
        <Badge tone={deal.hasTargetingDemographic ? "ok" : "pending"}>
          targeting {deal.hasTargetingDemographic ? "yes" : "missing"}
        </Badge>
        <Badge tone={deal.hasCampaignStrategy ? "ok" : "pending"}>
          hook {deal.hasCampaignStrategy ? "saved" : "missing"}
        </Badge>
        {deal.pinned && <Badge tone="ok">pinned</Badge>}
        {deal.hidden && <Badge tone="error">hidden</Badge>}
      </div>
      {deal.hasCampaignStrategy && (
        <div className="mt-3 rounded-lg border border-cyan-400/20 bg-cyan-500/5 p-3 text-xs text-slate-300">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-300">
            Locked campaign hook
          </p>
          <p className="mt-1 font-semibold text-white">{deal.campaignAngle}</p>
          {deal.targetAudience && <p className="mt-1 text-slate-400">{deal.targetAudience}</p>}
          {deal.visualAngle && <p className="mt-1 text-slate-500">Visual: {deal.visualAngle}</p>}
          {deal.targetingKeywords.length > 0 && (
            <p className="mt-1 text-slate-500">
              Keywords: {deal.targetingKeywords.join(", ")}
            </p>
          )}
          {deal.campaignStrategySavedAtIso && (
            <p className="mt-1 text-[11px] text-slate-500">
              Saved {formatDateTime(deal.campaignStrategySavedAtIso)}
            </p>
          )}
        </div>
      )}
      {deal.warnings.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs leading-5 text-amber-100">
          {deal.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}

      {/* Reach/action roll-up + 14-day trend — server-rendered, no fetch. */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-white/10 pt-3 text-xs text-slate-300">
        <span>
          <span className="font-semibold text-white">{a.totalViews}</span> views
        </span>
        <span>
          <span className="font-semibold text-white">{a.uniqueSessions}</span> unique
        </span>
        <span>
          <span className="font-semibold text-white">{a.bookNowClicks}</span> book clicks
        </span>
        <span>
          <span className="font-semibold text-white">{a.totalActions}</span> actions
        </span>
        {a.bookingPortalEntries > 0 && (
          <span>
            <span className="font-semibold text-white">{a.bookingPortalEntries}</span> portal
          </span>
        )}
        {a.bookingsConfirmed > 0 && (
          <span>
            <span className="font-semibold text-emerald-300">{a.bookingsConfirmed}</span>{" "}
            <span className="text-emerald-300/80">booked</span>
          </span>
        )}
        <span className="flex items-center gap-3">
          <DealTrendSparkline daily={a.daily14} />
          <SevenDayDelta daily={a.daily14} />
        </span>
        <button
          type="button"
          onClick={() => setShowActivity((value) => !value)}
          className="ml-auto rounded-lg border border-cyan-300/30 bg-cyan-400/10 px-2.5 py-1 text-[11px] font-semibold text-cyan-100 transition hover:bg-cyan-400/20"
        >
          {showActivity ? "Hide activity" : "View activity"}
        </button>
      </div>

      {showActivity && <DealActivityPanel dealId={deal.id} />}
    </article>
  );
}
