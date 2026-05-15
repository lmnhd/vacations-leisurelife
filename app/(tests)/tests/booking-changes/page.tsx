"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CampaignSelector } from "../media-generation/campaign-selector";

type Severity = "critical" | "high" | "medium" | "low" | "positive";

const SEVERITIES: Array<{ id: Severity; label: string; tone: string }> = [
  { id: "critical", label: "Critical", tone: "bg-rose-500/15 text-rose-200 border-rose-500/40" },
  { id: "high", label: "High", tone: "bg-orange-500/15 text-orange-200 border-orange-500/40" },
  { id: "medium", label: "Medium", tone: "bg-amber-500/15 text-amber-200 border-amber-500/40" },
  { id: "low", label: "Low", tone: "bg-slate-500/15 text-slate-200 border-slate-500/40" },
  { id: "positive", label: "Positive", tone: "bg-emerald-500/15 text-emerald-200 border-emerald-500/40" },
];

interface Recipient {
  email: string;
  acknowledged: boolean;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
}

interface PendingChange {
  changeId: string;
  campaignSlug: string;
  campaignName?: string;
  severity: Severity;
  changeType: string;
  previousValue: string | null;
  newValue: string | null;
  summary: string | null;
  actionRequired: boolean;
  occurredAt: string;
  recipients: Recipient[];
  pendingAckCount: number;
}

interface RecordResult {
  changeId: string;
  campaignSlug: string;
  severity: Severity;
  totalLeads: number;
  targetedLeads: number;
  emailDispatched: number;
  emailFailed: number;
  smsDispatched: number;
  smsSkipped: number;
  smsFailed: number;
  failures: Array<{ email: string; channel: "email" | "sms"; error: string }>;
}

function severityTone(s: Severity): string {
  return SEVERITIES.find((x) => x.id === s)?.tone ?? "bg-slate-500/15";
}

export default function BookingChangesPage() {
  // Pre-populate slug from `?slug=` when arriving from the hub.
  const [slug, setSlug] = useState(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("slug") ?? "";
  });

  // Cross-campaign pending list
  const [pending, setPending] = useState<PendingChange[]>([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [pendingError, setPendingError] = useState<string | null>(null);
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [severityFilter, setSeverityFilter] = useState<Severity | "">("");

  // Per-campaign changes
  const [campaignChanges, setCampaignChanges] = useState<PendingChange[]>([]);
  const [campaignLoading, setCampaignLoading] = useState(false);

  // Recorder form
  const [recSeverity, setRecSeverity] = useState<Severity>("high");
  const [recChangeType, setRecChangeType] = useState("");
  const [recPreviousValue, setRecPreviousValue] = useState("");
  const [recNewValue, setRecNewValue] = useState("");
  const [recSummary, setRecSummary] = useState("");
  const [recActionRequired, setRecActionRequired] = useState(false);
  const [recActionDeadline, setRecActionDeadline] = useState("");
  const [recSupportContact, setRecSupportContact] = useState("");
  const [recOperatorNote, setRecOperatorNote] = useState("");
  const [recDryRun, setRecDryRun] = useState(true);
  const [recBusy, setRecBusy] = useState(false);
  const [recResult, setRecResult] = useState<RecordResult | null>(null);
  const [recError, setRecError] = useState<string | null>(null);

  // Ack controls
  const [ackBy, setAckBy] = useState("");
  const [ackBusyKey, setAckBusyKey] = useState<string | null>(null);

  const refreshPending = useCallback(async () => {
    setPendingLoading(true);
    setPendingError(null);
    try {
      const qs = new URLSearchParams();
      if (severityFilter) qs.set("severity", severityFilter);
      qs.set("onlyOpen", onlyOpen ? "1" : "0");
      const res = await fetch(`/api/booking-changes/pending?${qs.toString()}`);
      const data = await res.json();
      if (!data.success) {
        setPendingError(data.error ?? "Failed to load pending changes.");
        setPending([]);
      } else {
        setPending(data.changes as PendingChange[]);
      }
    } catch (err) {
      setPendingError(err instanceof Error ? err.message : "Failed to load.");
    } finally {
      setPendingLoading(false);
    }
  }, [onlyOpen, severityFilter]);

  const refreshCampaignChanges = useCallback(async (targetSlug: string) => {
    if (!targetSlug) {
      setCampaignChanges([]);
      return;
    }
    setCampaignLoading(true);
    try {
      const res = await fetch(`/api/groups/campaign/${targetSlug}/booking-change`);
      const data = await res.json();
      if (data.success) {
        setCampaignChanges(data.changes as PendingChange[]);
      } else {
        setCampaignChanges([]);
      }
    } catch {
      setCampaignChanges([]);
    } finally {
      setCampaignLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshPending();
  }, [refreshPending]);

  useEffect(() => {
    void refreshCampaignChanges(slug);
  }, [slug, refreshCampaignChanges]);

  const submitChange = useCallback(async () => {
    if (!slug) {
      setRecError("Pick a campaign first.");
      return;
    }
    if (!recChangeType.trim() || !recPreviousValue.trim() || !recNewValue.trim() || !recSummary.trim()) {
      setRecError("changeType, previousValue, newValue, and summary are required.");
      return;
    }
    if (recSeverity === "critical" && !recDryRun) {
      if (!confirm("Severity is CRITICAL — emails will go out and SMS will fire for leads with phone numbers on file. Proceed?")) {
        return;
      }
    }
    setRecBusy(true);
    setRecError(null);
    setRecResult(null);
    try {
      const res = await fetch(`/api/groups/campaign/${slug}/booking-change`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          severity: recSeverity,
          changeType: recChangeType.trim(),
          previousValue: recPreviousValue.trim(),
          newValue: recNewValue.trim(),
          summary: recSummary.trim(),
          actionRequired: recActionRequired,
          actionDeadline: recActionDeadline.trim() || undefined,
          supportContact: recSupportContact.trim() || undefined,
          operatorNote: recOperatorNote.trim() || undefined,
          dryRun: recDryRun,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        setRecError(data.error ?? "Record failed.");
      } else {
        setRecResult(data.result as RecordResult);
        await Promise.all([refreshPending(), refreshCampaignChanges(slug)]);
      }
    } catch (err) {
      setRecError(err instanceof Error ? err.message : "Record failed.");
    } finally {
      setRecBusy(false);
    }
  }, [
    slug, recSeverity, recChangeType, recPreviousValue, recNewValue,
    recSummary, recActionRequired, recActionDeadline, recSupportContact,
    recOperatorNote, recDryRun, refreshPending, refreshCampaignChanges,
  ]);

  const acknowledge = useCallback(async (change: PendingChange, email: string) => {
    const key = `${change.changeId}::${email}`;
    setAckBusyKey(key);
    try {
      const res = await fetch(
        `/api/groups/campaign/${change.campaignSlug}/booking-change/${change.changeId}/ack`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email, acknowledgedBy: ackBy.trim() || undefined }),
        },
      );
      const data = await res.json();
      if (data.success) {
        await Promise.all([refreshPending(), refreshCampaignChanges(slug)]);
      }
    } finally {
      setAckBusyKey(null);
    }
  }, [ackBy, refreshPending, refreshCampaignChanges, slug]);

  const visibleCampaignChanges = useMemo(() => {
    return campaignChanges.filter((c) => {
      if (severityFilter && c.severity !== severityFilter) return false;
      if (onlyOpen && c.pendingAckCount === 0) return false;
      return true;
    });
  }, [campaignChanges, severityFilter, onlyOpen]);

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-white tracking-tight">Booking Changes</h1>
        <p className="text-sm text-slate-400">
          Record a change against a campaign (ship swap, date change, price adjustment, cancellation, positive update).
          Severity drives the Klaviyo flow branch and — for <span className="text-rose-300 font-semibold">critical</span> —
          a Twilio SMS fallback. The dashboard below surfaces every change with outstanding operator acknowledgments.
        </p>
      </div>

      {/* Filters */}
      <section className="rounded-xl border border-white/10 bg-slate-900/60 p-4 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-xs text-slate-300">
          <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} />
          Only show changes with pending acknowledgments
        </label>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">Severity:</span>
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value as Severity | "")}
            className="rounded-md border border-white/10 bg-slate-950 px-2 py-1 text-xs text-white"
          >
            <option value="">All</option>
            {SEVERITIES.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <label className="text-xs text-slate-400">Acknowledged by:</label>
          <input
            value={ackBy}
            onChange={(e) => setAckBy(e.target.value)}
            placeholder="your name"
            className="w-44 rounded-md border border-white/10 bg-slate-950 px-2 py-1 text-xs text-white"
          />
          <button
            onClick={() => void refreshPending()}
            className="rounded-md border border-white/10 bg-slate-950 px-3 py-1 text-xs text-slate-300 hover:bg-slate-800"
          >
            Refresh
          </button>
        </div>
      </section>

      {/* Cross-campaign worklist */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-rose-300">Open Changes (all campaigns)</h2>
        {pendingError && (
          <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-200">{pendingError}</p>
        )}
        {pendingLoading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : pending.length === 0 ? (
          <p className="text-sm text-slate-400">No matching changes.</p>
        ) : (
          <div className="space-y-3">
            {pending.map((c) => (
              <ChangeCard
                key={c.changeId}
                change={c}
                onAcknowledge={(email) => void acknowledge(c, email)}
                ackBusyKey={ackBusyKey}
                showCampaign
              />
            ))}
          </div>
        )}
      </section>

      {/* Recorder + per-campaign list */}
      <section className="space-y-4 rounded-xl border border-white/10 bg-slate-900/60 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-sky-300">Record a Change</h2>
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-widest text-slate-400">Campaign</label>
          <CampaignSelector value={slug} onChange={setSlug} defaultFilter="all" />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs text-slate-400">Severity *</label>
            <div className="flex flex-wrap gap-2">
              {SEVERITIES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setRecSeverity(s.id)}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                    recSeverity === s.id ? s.tone : "border-white/10 bg-slate-950 text-slate-400"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-slate-400">Change type *</label>
            <input
              value={recChangeType}
              onChange={(e) => setRecChangeType(e.target.value)}
              placeholder="ship_change / date_change / price_change / cancellation / positive_update"
              className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-slate-400">Previous value *</label>
            <input
              value={recPreviousValue}
              onChange={(e) => setRecPreviousValue(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-slate-400">New value *</label>
            <input
              value={recNewValue}
              onChange={(e) => setRecNewValue(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <label className="text-xs text-slate-400">Summary (one sentence shown in the email) *</label>
            <input
              value={recSummary}
              onChange={(e) => setRecSummary(e.target.value)}
              maxLength={240}
              className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-slate-400">Action required?</label>
            <label className="flex items-center gap-2 text-xs text-slate-300">
              <input type="checkbox" checked={recActionRequired} onChange={(e) => setRecActionRequired(e.target.checked)} />
              Lead must take action
            </label>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-slate-400">Action deadline (optional)</label>
            <input
              value={recActionDeadline}
              onChange={(e) => setRecActionDeadline(e.target.value)}
              placeholder="2026-08-15 or 'Friday'"
              className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
            />
          </div>
          {recSeverity === "critical" && (
            <div className="space-y-1 sm:col-span-2">
              <label className="text-xs text-rose-300">Support contact (shown on critical only)</label>
              <input
                value={recSupportContact}
                onChange={(e) => setRecSupportContact(e.target.value)}
                placeholder="support@leisurelifeinteractive.com or +1-555-LLL-HELP"
                className="w-full rounded-lg border border-rose-500/30 bg-slate-950 px-3 py-2 text-sm text-white"
              />
            </div>
          )}
          <div className="space-y-1 sm:col-span-2">
            <label className="text-xs text-slate-400">Operator note (optional, max 500 chars)</label>
            <textarea
              value={recOperatorNote}
              onChange={(e) => setRecOperatorNote(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <label className="flex items-center gap-2 text-xs text-slate-300">
            <input type="checkbox" checked={recDryRun} onChange={(e) => setRecDryRun(e.target.checked)} />
            Dry-run (writes ledger rows but skips Klaviyo + SMS)
          </label>
          <button
            onClick={() => void submitChange()}
            disabled={recBusy || !slug}
            className="rounded-lg bg-rose-500 px-4 py-2 text-sm font-semibold text-rose-50 disabled:opacity-40"
          >
            {recBusy ? "Recording…" : recDryRun ? "Record (dry-run)" : "Record + Send"}
          </button>
          {recError && <span className="text-xs text-rose-300">{recError}</span>}
        </div>

        {recResult && (
          <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs text-emerald-200">
            <div className="font-semibold">Change {recResult.changeId.slice(0, 8)}…</div>
            <div className="mt-1">
              Targeted {recResult.targetedLeads} of {recResult.totalLeads} leads — emails: {recResult.emailDispatched} dispatched
              {recResult.emailFailed > 0 ? `, ${recResult.emailFailed} failed` : ""}
              {recResult.severity === "critical"
                ? ` · SMS: ${recResult.smsDispatched} sent, ${recResult.smsSkipped} skipped (no phone), ${recResult.smsFailed} failed`
                : ""}
            </div>
            {recResult.failures.length > 0 && (
              <ul className="mt-2 list-disc pl-5">
                {recResult.failures.map((f, i) => (
                  <li key={i}>{f.channel}: {f.email} — {f.error}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      {/* Per-campaign existing changes */}
      {slug && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-sky-300">
            Changes for this campaign
          </h2>
          {campaignLoading ? (
            <p className="text-sm text-slate-400">Loading…</p>
          ) : visibleCampaignChanges.length === 0 ? (
            <p className="text-sm text-slate-400">No matching changes recorded yet.</p>
          ) : (
            <div className="space-y-3">
              {visibleCampaignChanges.map((c) => (
                <ChangeCard
                  key={c.changeId}
                  change={c}
                  onAcknowledge={(email) => void acknowledge(c, email)}
                  ackBusyKey={ackBusyKey}
                />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function ChangeCard({
  change,
  onAcknowledge,
  ackBusyKey,
  showCampaign,
}: {
  change: PendingChange;
  onAcknowledge: (email: string) => void;
  ackBusyKey: string | null;
  showCampaign?: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/60 overflow-hidden">
      <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-white/5">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${severityTone(change.severity)}`}>
              {change.severity}
            </span>
            <span className="text-sm font-semibold text-white">{change.changeType}</span>
            {change.actionRequired && (
              <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-amber-200">
                Action required
              </span>
            )}
          </div>
          {showCampaign && (
            <p className="text-xs text-slate-400">
              {change.campaignName ?? change.campaignSlug} · <span className="font-mono">{change.campaignSlug}</span>
            </p>
          )}
          {change.summary && <p className="text-xs text-slate-300">{change.summary}</p>}
          <p className="text-[10px] font-mono text-slate-500">{change.changeId}</p>
        </div>
        <div className="text-right text-xs text-slate-400 space-y-0.5">
          <div>{new Date(change.occurredAt).toLocaleString()}</div>
          <div>
            <span className="text-white">{change.pendingAckCount}</span> / {change.recipients.length} pending ack
          </div>
        </div>
      </div>
      <div className="grid sm:grid-cols-2 divide-x divide-white/5 text-xs">
        <div className="p-3">
          <div className="text-slate-400 mb-1">Previous</div>
          <div className="text-rose-200 font-mono">{change.previousValue ?? "—"}</div>
        </div>
        <div className="p-3">
          <div className="text-slate-400 mb-1">Now</div>
          <div className="text-emerald-200 font-mono">{change.newValue ?? "—"}</div>
        </div>
      </div>
      {change.recipients.length > 0 && (
        <div className="border-t border-white/5 px-4 py-3">
          <div className="text-[10px] uppercase tracking-widest text-slate-400 mb-2">Recipients</div>
          <ul className="space-y-1 text-xs">
            {change.recipients.map((r) => (
              <li key={r.email} className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {r.acknowledged ? (
                    <span className="text-emerald-300">✓</span>
                  ) : (
                    <span className="text-rose-300">○</span>
                  )}
                  <span className="font-mono text-slate-200">{r.email}</span>
                  {r.acknowledged && r.acknowledgedAt && (
                    <span className="text-[10px] text-slate-500">
                      acked {new Date(r.acknowledgedAt).toLocaleDateString()}
                      {r.acknowledgedBy ? ` by ${r.acknowledgedBy}` : ""}
                    </span>
                  )}
                </div>
                {!r.acknowledged && (
                  <button
                    onClick={() => onAcknowledge(r.email)}
                    disabled={ackBusyKey === `${change.changeId}::${r.email}`}
                    className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-200 disabled:opacity-40"
                  >
                    {ackBusyKey === `${change.changeId}::${r.email}` ? "…" : "Mark acked"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
