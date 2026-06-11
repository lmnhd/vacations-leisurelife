"use client";

import { useState } from "react";

import type { AgentCallbackStatus } from "@/lib/cb/deals-system/callback-request-types";
import type { DealsSystemCallbackRequestSummary } from "@/lib/cb/deals-system/dashboard-data";

const STATUS_OPTIONS: AgentCallbackStatus[] = ["new", "assigned", "contacted", "closed"];

const STATUS_TONE: Record<AgentCallbackStatus, string> = {
  new: "border-amber-400/35 bg-amber-500/10 text-amber-200",
  assigned: "border-sky-400/35 bg-sky-500/10 text-sky-200",
  contacted: "border-cyan-400/35 bg-cyan-500/10 text-cyan-200",
  closed: "border-emerald-400/35 bg-emerald-500/10 text-emerald-200",
};

function formatDateTime(value?: string) {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function CallbackRequestCard({
  request,
}: {
  request: DealsSystemCallbackRequestSummary;
}) {
  const [status, setStatus] = useState<AgentCallbackStatus>(
    request.status as AgentCallbackStatus
  );
  const [note, setNote] = useState("");
  const [statusHistory, setStatusHistory] = useState(request.statusHistory);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function updateStatus(nextStatus: AgentCallbackStatus) {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/tests/deals-system/callback-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: request.id, status: nextStatus, note: note || undefined }),
      });
      const payload = (await response.json()) as
        | { ok: true; request: { status: AgentCallbackStatus; statusHistory: typeof statusHistory } }
        | { ok: false; error: string };
      if (!response.ok || !payload.ok) {
        throw new Error("error" in payload ? payload.error : `Update failed (${response.status})`);
      }
      setStatus(payload.request.status);
      setStatusHistory(payload.request.statusHistory);
      setNote("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  const visitorLines = [
    request.visitor.name ? `Name: ${request.visitor.name}` : undefined,
    request.visitor.email ? `Email: ${request.visitor.email}` : undefined,
    request.visitor.phone ? `Phone: ${request.visitor.phone}` : undefined,
  ].filter((value): value is string => Boolean(value));

  const cruiseLine = [request.cruiseLine, request.shipName, request.sailDateIso]
    .filter(Boolean)
    .join(" | ");

  return (
    <article className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-white">{request.dealTitle}</h3>
          <p className="mt-1 text-xs text-slate-400">
            {request.ctaSource} | {formatDateTime(request.createdAtIso)}
          </p>
          {cruiseLine && <p className="mt-1 text-xs text-slate-500">{cruiseLine}</p>}
        </div>
        <span
          className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.16em] ${STATUS_TONE[status]}`}
        >
          {status}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <span
          className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.16em] ${
            request.linkHealthStatus === "valid"
              ? "border-emerald-400/35 bg-emerald-500/10 text-emerald-200"
              : "border-amber-400/35 bg-amber-500/10 text-amber-200"
          }`}
        >
          {request.linkHealthStatus}
        </span>
        {request.routing.map((route) => (
          <span
            key={route}
            className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-200"
          >
            {route}
          </span>
        ))}
      </div>

      {visitorLines.length > 0 && (
        <div className="mt-3 rounded-lg bg-black/20 p-3 text-xs leading-5 text-slate-300">
          {visitorLines.map((line) => (
            <p key={line}>{line}</p>
          ))}
          {request.visitor.notes && (
            <p className="mt-1 text-slate-400">Notes: {request.visitor.notes}</p>
          )}
        </div>
      )}

      {request.brokerLinkUrl && (
        <p className="mt-2 truncate text-xs text-slate-500">
          Link: <span className="text-slate-400">{request.brokerLinkUrl}</span>
        </p>
      )}

      {statusHistory.length > 0 && (
        <div className="mt-3 space-y-1 text-xs text-slate-500">
          {statusHistory.map((entry, idx) => (
            <p key={`${entry.status}-${entry.changedAtIso}-${idx}`}>
              {formatDateTime(entry.changedAtIso)} — {entry.status}
              {entry.note ? `: ${entry.note}` : ""}
            </p>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {STATUS_OPTIONS.filter((option) => option !== status).map((option) => (
          <button
            key={option}
            type="button"
            disabled={pending}
            onClick={() => void updateStatus(option)}
            className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-200 transition hover:border-cyan-300/50 hover:bg-cyan-400/10 disabled:cursor-wait disabled:opacity-60"
          >
            Mark {option}
          </button>
        ))}
      </div>

      <div className="mt-2">
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Add a note (applied with the next status change)"
          className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:border-cyan-300/50 focus:outline-none"
        />
      </div>

      {error && <p className="mt-2 text-xs text-rose-300">{error}</p>}
    </article>
  );
}

export function CallbackRequestsPanel({
  requests,
}: {
  requests: DealsSystemCallbackRequestSummary[];
}) {
  return (
    <div className="space-y-3">
      {requests.map((request) => (
        <CallbackRequestCard key={request.id} request={request} />
      ))}
    </div>
  );
}
