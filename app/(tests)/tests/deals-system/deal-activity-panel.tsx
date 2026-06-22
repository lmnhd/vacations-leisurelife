"use client";

import { useCallback, useEffect, useState } from "react";

import type { DealActivitySummary } from "@/lib/cb/deals-system/deal-events-store";
import type { DealEvent } from "@/lib/cb/deals-system/deal-event-types";

interface ActivityResponse {
  ok: boolean;
  summary?: DealActivitySummary;
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
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

/**
 * Per-deal Activity view for the operator dashboard. Fetches the deal's reach +
 * contact-action summary and recent event timeline on demand from
 * `/api/tests/deals-system/deal-activity`.
 */
export function DealActivityPanel({ dealId }: { dealId: string }) {
  const [summary, setSummary] = useState<DealActivitySummary | null>(null);
  const [events, setEvents] = useState<DealEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  if (loading) {
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
    <div className="mt-3 border-t border-white/10 pt-3">
      <div className="flex items-center justify-between gap-2">
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

      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatChip label="Views" value={summary.totalViews} />
        <StatChip label="Unique" value={summary.uniqueSessions} />
        <StatChip label="Book clicks" value={summary.bookNowClicks} />
        <StatChip label="Actions" value={summary.totalActions} />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatChip label="Engaged" value={summary.engagedViews} />
        <StatChip label="Link reqs" value={summary.linkRequests} />
        <StatChip label="Emails sent" value={summary.linkEmailsSent} />
        <StatChip label="Callbacks" value={summary.callbackRequests} />
      </div>

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
          Recent events
        </p>
        {events.length === 0 ? (
          <p className="mt-1.5 text-xs text-slate-500">No activity recorded yet.</p>
        ) : (
          <ul className="mt-1.5 max-h-56 space-y-1 overflow-y-auto pr-1">
            {events.map((event) => (
              <li
                key={event.eventId}
                className="flex items-center justify-between gap-3 rounded border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5 text-xs"
              >
                <span className="font-medium text-slate-200">
                  {EVENT_LABELS[event.eventType] ?? event.eventType}
                  {event.email !== "anonymous" && (
                    <span className="ml-1.5 text-slate-400">{event.email}</span>
                  )}
                </span>
                <span className="shrink-0 text-slate-500">{formatTime(event.occurredAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
