"use client";

/**
 * Curated Deals inventory manager for the operator dashboard's Inventory tab:
 * search / sort / filter toolbar, pin + hide controls (wired to the existing
 * curated-deal API actions), and a wrapped grid of compact deal tiles.
 *
 * Layout is tile-first so an operator can scan every deal's 14-day reach at a
 * glance instead of scrolling a tall vertical list. Selecting a tile expands
 * exactly one full card (badges, locked hook, roll-up, activity panel) directly
 * beneath the grid row it belongs to.
 */

import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";

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

/**
 * Whether the sail date has passed — the operator's cue that a campaign is
 * dead inventory and can be purged. Display-only: the homepage gate already
 * excludes sailed deals server-side via `isDealHomepageEligible`.
 */
function hasSailed(sailDateIso?: string): boolean {
  if (!sailDateIso) return false;
  const sailed = new Date(sailDateIso);
  if (Number.isNaN(sailed.getTime())) return false;
  return sailed.getTime() < Date.now();
}

// ─── Activity heat ───────────────────────────────────────────────────────────

/**
 * How "hot" a tile looks, 0–1, from recent activity only.
 *
 * Recency dominates: a deal that drew traffic today outranks one with a bigger
 * all-time total that has gone quiet. Weighted by day (today = full weight,
 * 14 days ago ≈ none) over views plus a heavier factor for clicks/actions,
 * since an action is worth far more than a view.
 *
 * Normalized against the hottest tile in the current view rather than an
 * absolute scale, so the gradient always spans the deals actually on screen.
 */
function activityHeatScore(deal: CuratedDealSummary): number {
  const daily = deal.activity.daily14;
  if (daily.length === 0) return 0;
  return daily.reduce((total, day, index) => {
    const recency = (index + 1) / daily.length; // oldest ≈ 0, today = 1
    const weight = recency * recency; // bias hard toward the last few days
    return total + weight * (day.views + 5 * (day.bookNowClicks + day.totalActions));
  }, 0);
}

/** Tile heat styling for a normalized 0–1 score. */
function heatStyle(intensity: number): { borderColor: string; background: string } {
  // Amber→orange rather than red: rose is already the error/hidden signal in
  // this dashboard, so heat must not read as "broken".
  const alphaBorder = 0.1 + intensity * 0.55;
  const alphaFill = 0.02 + intensity * 0.16;
  const hue = 42 - intensity * 20; // 42° amber when warm → 22° orange when hottest
  return {
    borderColor: `hsla(${hue}, 92%, 60%, ${alphaBorder})`,
    background: `hsla(${hue}, 92%, 52%, ${alphaFill})`,
  };
}

// ─── Tile grid geometry ──────────────────────────────────────────────────────

/**
 * Minimum tile width and gap, in px. JS derives the column count from these
 * same numbers that drive the inline grid style, so the row breaks it computes
 * (to place the expanded card after the right row) always match what the
 * browser actually lays out.
 */
const TILE_MIN_WIDTH = 260;
const TILE_GAP = 12;

/** Column count implied by the measured container width, never below 1. */
function useColumnCount<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [columns, setColumns] = useState(1);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = (width: number) => {
      // Mirrors `repeat(auto-fill, minmax(TILE_MIN_WIDTH, 1fr))` with TILE_GAP.
      const next = Math.max(1, Math.floor((width + TILE_GAP) / (TILE_MIN_WIDTH + TILE_GAP)));
      setColumns((prev) => (prev === next ? prev : next));
    };
    const observer = new ResizeObserver((entries) => {
      measure(entries[0]?.contentRect.width ?? 0);
    });
    observer.observe(el);
    measure(el.getBoundingClientRect().width);
    return () => observer.disconnect();
  }, []);

  return [ref, columns];
}

// ─── Manager ─────────────────────────────────────────────────────────────────

/**
 * How often the list re-pulls server data while the browser tab is visible.
 *
 * Deliberately longer than DEALS_STORE_CACHE_TTL_MS. At the previous 60s this
 * refresh landed exactly as the store cache expired, so almost every tick paid
 * for a fresh full-table Scan of lll-deals-system. Refreshing on a slower
 * cadence than the cache lets most ticks be served from memory. Operator writes
 * clear the cache and trigger their own refresh, so your own edits still appear
 * immediately — this interval only governs changes made elsewhere.
 */
const AUTO_REFRESH_MS = 300_000;

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
  const [purgeNotice, setPurgeNotice] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  /** Deal whose full card is expanded below its grid row — at most one. */
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [gridRef, columns] = useColumnCount<HTMLDivElement>();

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

  // Heat is relative to the hottest deal currently in view, so the gradient
  // rescales as filters narrow the set.
  const heatByDealId = useMemo(() => {
    const scores = visibleDeals.map((deal) => [deal.id, activityHeatScore(deal)] as const);
    const peak = Math.max(0, ...scores.map(([, score]) => score));
    return new Map(
      scores.map(([id, score]) => [id, peak > 0 ? Math.min(1, score / peak) : 0])
    );
  }, [visibleDeals]);

  // Chunked into rows so the expanded card can sit directly beneath the row
  // holding the selected tile rather than at the end of the whole grid.
  const rows = useMemo(() => {
    const chunks: CuratedDealSummary[][] = [];
    for (let index = 0; index < visibleDeals.length; index += columns) {
      chunks.push(visibleDeals.slice(index, index + columns));
    }
    return chunks;
  }, [visibleDeals, columns]);

  // A deal filtered out of view (search, status/hook filter, hide) must not
  // leave an orphaned detail card rendered under a row it no longer belongs to.
  useEffect(() => {
    if (selectedId && !visibleDeals.some((deal) => deal.id === selectedId)) {
      setSelectedId(null);
    }
  }, [visibleDeals, selectedId]);

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

  /**
   * Irreversibly remove a deal and every record keyed to it. The card owns the
   * confirmation step; by the time this runs the operator has confirmed twice.
   */
  async function purgeDeal(dealId: string) {
    setPendingId(dealId);
    setActionError(null);
    try {
      const res = await fetch("/api/tests/deals-system/curated-deal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "purge", dealId, confirmDealId: dealId }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        purged?: { events: number };
      };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed to remove campaign.");
      setSelectedId(null);
      setPurgeNotice(
        `Removed campaign ${dealId}${
          data.purged ? ` and ${data.purged.events} activity events` : ""
        }.`
      );
      router.refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to remove campaign.");
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
      {purgeNotice && <p className="mt-2 text-xs text-emerald-300">{purgeNotice}</p>}

      {visibleDeals.length === 0 ? (
        <div className="mt-3 rounded-xl border border-dashed border-white/15 bg-white/[0.03] p-6 text-sm text-slate-400">
          No deals match the current filters.
        </div>
      ) : (
        <div ref={gridRef} className="mt-3 space-y-3">
          {rows.map((row, rowIndex) => {
            const selectedInRow = row.find((deal) => deal.id === selectedId);
            return (
              <div key={`row-${rowIndex}`} className="space-y-3">
                <div
                  className="grid"
                  style={{
                    gap: `${TILE_GAP}px`,
                    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                  }}
                >
                  {row.map((deal) => (
                    <CuratedDealTile
                      key={deal.id}
                      deal={deal}
                      heat={heatByDealId.get(deal.id) ?? 0}
                      selected={deal.id === selectedId}
                      onSelect={() =>
                        setSelectedId((current) => (current === deal.id ? null : deal.id))
                      }
                    />
                  ))}
                </div>
                {selectedInRow && (
                  <CuratedDealCard
                    deal={selectedInRow}
                    pending={pendingId === selectedInRow.id}
                    onSetVisibility={setVisibility}
                    onPurge={purgeDeal}
                    onClose={() => setSelectedId(null)}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Tile ────────────────────────────────────────────────────────────────────

/**
 * Compact grid cell: title, the 14-day reach sparkline, and the counts an
 * operator scans for. Clicking toggles the full card open beneath this row.
 */
function CuratedDealTile({
  deal,
  heat,
  selected,
  onSelect,
}: {
  deal: CuratedDealSummary;
  heat: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const a = deal.activity;
  const sailed = hasSailed(deal.sailDateIso);
  // Selection outranks heat; a sailed deal is dead inventory, so it stays cool
  // no matter what its trailing numbers say.
  const showHeat = !selected && !sailed && heat > 0.02;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-expanded={selected}
      title={`${deal.title} — ${deal.cruiseLine} | ${deal.shipName} | ${deal.sailDateIso}`}
      style={showHeat ? heatStyle(heat) : undefined}
      className={`flex h-full flex-col rounded-xl border p-3 text-left transition ${
        selected
          ? "border-cyan-300/50 bg-cyan-400/[0.07]"
          : showHeat
            ? "hover:brightness-125"
            : "border-white/10 bg-white/[0.035] hover:border-white/20 hover:bg-white/[0.06]"
      } ${deal.hidden || sailed ? "opacity-60" : ""}`}
    >
      <div className="flex items-start gap-2">
        <h3 className="line-clamp-2 min-w-0 flex-1 text-xs font-semibold leading-4 text-white">
          {deal.title}
        </h3>
        <span
          className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${
            deal.publishable ? "bg-emerald-400" : "bg-rose-400"
          }`}
          title={deal.publishable ? "Publishable" : "Not public"}
        />
      </div>

      <p className="mt-1 truncate text-[11px] text-slate-500">
        {deal.shipName} · {deal.sailDateIso}
      </p>

      {/* Sparkline gets its own row so a flat trend never collides with the
          counts on a narrow tile. */}
      <div className="mt-auto pt-2">
        <DealTrendSparkline daily={a.daily14} />
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[11px] leading-4 text-slate-400">
        <span>
          <span className="font-semibold text-slate-200">{a.totalViews}</span> views
        </span>
        <span>
          <span className="font-semibold text-slate-200">{a.bookNowClicks}</span> clicks
        </span>
        {a.bookingsConfirmed > 0 && (
          <span className="font-semibold text-emerald-300">{a.bookingsConfirmed} booked</span>
        )}
      </div>

      <div className="mt-2 flex items-center gap-2 border-t border-white/10 pt-2">
        <SevenDayDelta daily={a.daily14} />
        <span className="ml-auto flex shrink-0 gap-1">
          {sailed && <TileFlag tone="error">sailed</TileFlag>}
          {deal.pinned && <TileFlag tone="ok">pin</TileFlag>}
          {deal.hidden && <TileFlag tone="error">hidden</TileFlag>}
          {!deal.hasCampaignStrategy && <TileFlag tone="pending">no hook</TileFlag>}
        </span>
      </div>
    </button>
  );
}

function TileFlag({ children, tone }: { children: ReactNode; tone: StatusTone }) {
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] ${statusStyles[tone]}`}
    >
      {children}
    </span>
  );
}

// ─── Card ────────────────────────────────────────────────────────────────────

function CuratedDealCard({
  deal,
  pending,
  onSetVisibility,
  onPurge,
  onClose,
}: {
  deal: CuratedDealSummary;
  pending: boolean;
  onSetVisibility: (dealId: string, action: "pin" | "unpin" | "hide" | "unhide") => void;
  onPurge: (dealId: string) => void;
  onClose: () => void;
}) {
  // Opening a tile means "show me this deal's activity", so the panel starts
  // expanded rather than costing a second click.
  const [showActivity, setShowActivity] = useState(true);
  const [confirmingPurge, setConfirmingPurge] = useState(false);
  const a = deal.activity;
  const sailed = hasSailed(deal.sailDateIso);

  const controlClass =
    "rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] font-semibold text-slate-300 transition hover:bg-white/[0.08] hover:text-white disabled:opacity-50";

  return (
    <article
      className={`rounded-xl border border-cyan-300/40 bg-white/[0.045] p-4 ${deal.hidden ? "opacity-60" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-white">{deal.title}</h3>
          <p className="mt-1 text-xs text-slate-400">
            {deal.cruiseLine} | {deal.shipName} | {deal.sailDateIso} | package {deal.packageId}
          </p>
          {/* The Odysseus booking link captured when the campaign was created —
              this is the page an operator actually books the guest on. */}
          {deal.bookingUrl ? (
            <a
              href={deal.bookingUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-cyan-300 underline decoration-cyan-300/40 underline-offset-2 transition hover:text-cyan-200"
              title={deal.bookingUrl}
            >
              Open Odysseus booking page ↗
            </a>
          ) : (
            <p className="mt-1 text-xs text-slate-500">No booking link captured</p>
          )}
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
          <button
            type="button"
            onClick={onClose}
            className={controlClass}
            title="Close this deal and return to the grid"
          >
            Close
          </button>
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
        // Collapsed by default so the hook copy doesn't push the activity
        // roll-up down the card; the angle itself stays visible in the summary.
        <details className="group mt-3 rounded-lg border border-cyan-400/20 bg-cyan-500/5 p-3 text-xs text-slate-300">
          <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-300">
              Locked campaign hook
            </span>
            <span className="ml-auto shrink-0 text-[10px] font-semibold text-slate-500 group-open:hidden">
              Show
            </span>
            <span className="ml-auto hidden shrink-0 text-[10px] font-semibold text-slate-500 group-open:inline">
              Hide
            </span>
          </summary>
          <p className="mt-2 font-semibold text-white">{deal.campaignAngle}</p>
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
        </details>
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

      {/* Danger zone — irreversible, so it stays visually separate and takes
          two deliberate clicks. */}
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-rose-400/20 pt-3">
        {sailed && (
          <span className="text-[11px] text-amber-200">
            Sailed {deal.sailDateIso} — already excluded from the homepage.
          </span>
        )}
        {confirmingPurge ? (
          <>
            <span className="text-[11px] font-semibold text-rose-200">
              Permanently remove this campaign and all {a.totalViews} views /{" "}
              {a.totalActions} actions of history? This cannot be undone.
            </span>
            <span className="ml-auto flex gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => setConfirmingPurge(false)}
                className={controlClass}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => onPurge(deal.id)}
                className="rounded-lg border border-rose-400/50 bg-rose-500/20 px-2.5 py-1 text-[11px] font-semibold text-rose-100 transition hover:bg-rose-500/30 disabled:opacity-50"
              >
                {pending ? "Removing…" : "Yes, remove everything"}
              </button>
            </span>
          </>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={() => setConfirmingPurge(true)}
            title="Delete this Deal and every record keyed to it: brief, trip manifest, funnel and Meta ad syntheses, and its full activity history."
            className="ml-auto rounded-lg border border-rose-400/30 bg-rose-500/10 px-2.5 py-1 text-[11px] font-semibold text-rose-200 transition hover:bg-rose-500/20 disabled:opacity-50"
          >
            Remove campaign…
          </button>
        )}
      </div>
    </article>
  );
}
