"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  DealActivitySummary,
  DealDailyActivityBucket,
} from "@/lib/cb/deals-system/deal-events-store";
import type { DealEvent } from "@/lib/cb/deals-system/deal-event-types";

import { DailyActionsChart, DailyActivityTable, DailyReachChart } from "./deal-activity-charts";

interface ActivityResponse {
  ok: boolean;
  summary?: DealActivitySummary;
  daily?: DealDailyActivityBucket[];
  events?: DealEvent[];
  error?: string;
}

const EVENT_LABELS: Record<string, string> = {
  deal_page_view: "Page view",
  deal_engaged: "Engaged view",
  book_now_click: "Book-now click",
  link_requested: "Link requested",
  link_email_sent: "Link email sent",
  callback_requested: "Callback requested",
  callback_contacted: "Callback contacted",
  callback_closed: "Callback closed",
};

const RANGE_PRESETS = [
  { id: "7d", label: "7d", days: 7 },
  { id: "30d", label: "30d", days: 30 },
  { id: "90d", label: "90d", days: 90 },
  { id: "all", label: "All", days: Infinity },
] as const;

type RangeId = (typeof RANGE_PRESETS)[number]["id"];

function StatChip({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-0.5 text-lg font-bold text-white">{value}</p>
    </div>
  );
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleTimeString();
}

function formatDayHeading(dateIso: string): string {
  const date = new Date(`${dateIso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return dateIso;
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function attributionLabel(event: DealEvent): string | null {
  const channel = event.attribution.sourceChannel;
  const provider = event.attribution.provider;
  const parts = [channel, provider && provider !== "direct" ? provider : null].filter(
    (value): value is string => Boolean(value)
  );
  return parts.length > 0 ? parts.join(" · ") : null;
}

interface DayLogGroup {
  dateIso: string;
  views: number;
  uniqueSessions: number;
  engaged: number;
  /** Non-view events for the day, newest first. */
  actionEvents: DealEvent[];
}

/**
 * Group the recent-event stream by UTC day (matching the charts' buckets):
 * anonymous page-view noise collapses into one roll-up line, while clicks,
 * link requests, and callbacks stay as individual entries.
 */
function groupEventsByDay(events: DealEvent[]): DayLogGroup[] {
  const groups = new Map<string, DayLogGroup & { sessionIds: Set<string> }>();
  for (const event of events) {
    const dateIso = event.occurredAt.slice(0, 10);
    let group = groups.get(dateIso);
    if (!group) {
      group = {
        dateIso,
        views: 0,
        uniqueSessions: 0,
        engaged: 0,
        actionEvents: [],
        sessionIds: new Set<string>(),
      };
      groups.set(dateIso, group);
    }
    if (event.eventType === "deal_page_view") {
      group.views += 1;
      group.sessionIds.add(event.attribution.sessionId ?? event.eventId);
    } else if (event.eventType === "deal_engaged") {
      group.engaged += 1;
    } else {
      group.actionEvents.push(event);
    }
  }
  return Array.from(groups.values())
    .map(({ sessionIds, ...group }) => ({ ...group, uniqueSessions: sessionIds.size }))
    .sort((a, b) => (a.dateIso < b.dateIso ? 1 : -1));
}

/**
 * Per-deal Activity view for the operator dashboard: reach + action stat
 * chips, activity-over-time charts (with a table twin), source attribution,
 * and a day-grouped event log. Fetched on demand from
 * `/api/tests/deals-system/deal-activity`.
 */
export function DealActivityPanel({ dealId }: { dealId: string }) {
  const [summary, setSummary] = useState<DealActivitySummary | null>(null);
  const [daily, setDaily] = useState<DealDailyActivityBucket[]>([]);
  const [events, setEvents] = useState<DealEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<RangeId>("30d");
  const [view, setView] = useState<"charts" | "table">("charts");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/tests/deals-system/deal-activity?dealId=${encodeURIComponent(dealId)}`,
        { cache: "no-store" }
      );
      const data = (await res.json()) as ActivityResponse;
      if (!res.ok || !data.ok || !data.summary) {
        throw new Error(data.error ?? "Failed to load activity.");
      }
      setSummary(data.summary);
      setDaily(data.daily ?? []);
      setEvents(data.events ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load activity.");
    } finally {
      setLoading(false);
    }
  }, [dealId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Keep an open panel current alongside the list's 60s soft refresh; the
  // previous render holds at reduced opacity while new data loads, and a
  // backgrounded browser tab doesn't poll.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 60_000);
    return () => clearInterval(id);
  }, [load]);

  const rangeDays = RANGE_PRESETS.find((preset) => preset.id === range)?.days ?? 30;
  const buckets = useMemo(
    () => (Number.isFinite(rangeDays) ? daily.slice(-rangeDays) : daily),
    [daily, rangeDays]
  );
  const rangeStartIso = buckets[0]?.dateIso;

  const logGroups = useMemo(() => {
    const scoped = rangeStartIso
      ? events.filter((event) => event.occurredAt.slice(0, 10) >= rangeStartIso)
      : events;
    return groupEventsByDay(scoped);
  }, [events, rangeStartIso]);

  if (loading && !summary) {
    return <p className="mt-3 text-xs text-slate-400">Loading activity…</p>;
  }
  if (error) {
    return (
      <div className="mt-3 flex items-center gap-3 text-xs text-rose-300">
        <span>{error}</span>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded border border-white/15 px-2 py-0.5 text-slate-200 hover:bg-white/5"
        >
          Retry
        </button>
      </div>
    );
  }
  if (!summary) return null;

  return (
    <div
      className={`mt-3 border-t border-white/10 pt-3 transition-opacity ${loading ? "opacity-60" : ""}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-300/80">
          Activity
        </p>
        <button
          type="button"
          onClick={() => void load()}
          className="text-[11px] font-semibold text-cyan-200 hover:text-cyan-100"
        >
          Refresh
        </button>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
        <StatChip label="Views" value={summary.totalViews} />
        <StatChip label="Unique" value={summary.uniqueSessions} />
        <StatChip label="Engaged" value={summary.engagedViews} />
        <StatChip label="Book clicks" value={summary.bookNowClicks} />
        <StatChip label="Link reqs" value={summary.linkRequests} />
        <StatChip label="Emails sent" value={summary.linkEmailsSent} />
        <StatChip label="Callbacks" value={summary.callbackRequests} />
        <StatChip label="Actions" value={summary.totalActions} />
      </div>

      {daily.length === 0 ? (
        <p className="mt-3 text-xs text-slate-500">
          No activity recorded yet — charts will appear with the first page view.
        </p>
      ) : (
        <>
          {/* Filter row scopes the charts, table, and log below it. */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] p-0.5">
              {RANGE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setRange(preset.id)}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
                    range === preset.id
                      ? "bg-cyan-400/15 text-cyan-100"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] p-0.5">
              {(["charts", "table"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setView(mode)}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-semibold capitalize transition ${
                    view === mode
                      ? "bg-cyan-400/15 text-cyan-100"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-2">
            {view === "charts" ? (
              <div className="grid gap-3 xl:grid-cols-2">
                <DailyReachChart buckets={buckets} />
                <DailyActionsChart buckets={buckets} />
              </div>
            ) : (
              <DailyActivityTable buckets={buckets} />
            )}
          </div>
          <p className="mt-1 text-[10px] text-slate-600">Days are UTC.</p>
        </>
      )}

      {summary.sourceBreakdown.length > 0 && (
        <div className="mt-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
            Top sources
          </p>
          <ul className="mt-1.5 space-y-1">
            {summary.sourceBreakdown.slice(0, 5).map((src) => (
              <li
                key={`${src.sourceChannel}:${src.provider}:${src.providerCampaignId ?? ""}:${src.providerAdId ?? ""}`}
                className="flex items-center justify-between gap-3 text-xs text-slate-300"
              >
                <span className="truncate">
                  {src.sourceChannel}
                  {src.provider !== "direct" ? ` · ${src.provider}` : ""}
                  {src.providerCampaignId ? ` · ${src.providerCampaignId}` : ""}
                </span>
                <span className="shrink-0 text-slate-400">
                  {src.views} views · {src.uniqueSessions} unique
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
          Event log
        </p>
        {logGroups.length === 0 ? (
          <p className="mt-1.5 text-xs text-slate-500">No activity in this range.</p>
        ) : (
          <div className="mt-1.5 max-h-72 space-y-2 overflow-y-auto pr-1">
            {logGroups.map((group) => (
              <div
                key={group.dateIso}
                className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-2"
              >
                <div className="flex items-center justify-between gap-3 text-[11px]">
                  <span className="font-semibold text-slate-200">
                    {formatDayHeading(group.dateIso)}
                  </span>
                  <span className="text-slate-500">
                    {group.views} views · {group.uniqueSessions} unique
                    {group.engaged > 0 ? ` · ${group.engaged} engaged` : ""}
                  </span>
                </div>
                {group.actionEvents.length > 0 && (
                  <ul className="mt-1.5 space-y-1 border-t border-white/[0.06] pt-1.5">
                    {group.actionEvents.map((event) => {
                      const source = attributionLabel(event);
                      return (
                        <li
                          key={event.eventId}
                          className="flex items-center justify-between gap-3 text-xs"
                        >
                          <span className="min-w-0 truncate font-medium text-slate-200">
                            {EVENT_LABELS[event.eventType] ?? event.eventType}
                            {event.email !== "anonymous" && (
                              <span className="ml-1.5 text-cyan-200">{event.email}</span>
                            )}
                            {source && <span className="ml-1.5 text-slate-500">{source}</span>}
                          </span>
                          <span className="shrink-0 text-slate-500">
                            {formatTime(event.occurredAt)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
        {events.length >= 150 && (
          <p className="mt-1 text-[10px] text-slate-600">
            Log shows the 150 most recent events; charts cover the full history.
          </p>
        )}
      </div>
    </div>
  );
}
