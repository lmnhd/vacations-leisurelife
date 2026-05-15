"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CampaignSelector } from "../media-generation/campaign-selector";

interface ReconciliationLead {
  email: string;
  firstName: string;
  lastName: string;
  passengerCount: number;
  preferredCabinType: string;
  bookingMode: string | null;
  manifestStatus: string;
  converted: boolean;
  bookingReference: string | null;
  bookingConfirmedAt: string | null;
  bookingAmount: number | null;
  bookingNotes: string | null;
  bookingEnteredBy: string | null;
  createdAt: string;
  updatedAt: string;
}

interface SaveStatus {
  kind: "idle" | "pending" | "ok" | "error";
  message?: string;
  convertedNow?: boolean;
}

function today(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function ManualBookingEntryPage() {
  // Pre-populate from `?slug=` when arriving from the internal hub
  // (`/hub` → Campaign Pages by Slug → Manual Booking tile).
  const [slug, setSlug] = useState(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("slug") ?? "";
  });
  const [campaignName, setCampaignName] = useState<string | null>(null);
  const [leads, setLeads] = useState<ReconciliationLead[]>([]);
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [activeEmail, setActiveEmail] = useState<string | null>(null);
  const [bookingReference, setBookingReference] = useState("");
  const [bookingConfirmedAt, setBookingConfirmedAt] = useState(today());
  const [bookingAmount, setBookingAmount] = useState("");
  const [bookingNotes, setBookingNotes] = useState("");
  const [bookingEnteredBy, setBookingEnteredBy] = useState("");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({ kind: "idle" });

  const activeLead = useMemo(
    () => leads.find((l) => l.email === activeEmail) ?? null,
    [leads, activeEmail],
  );

  const refresh = useCallback(async (targetSlug: string) => {
    setLoadingLeads(true);
    setLoadError(null);
    try {
      const res = await fetch(
        `/api/groups/campaign/${targetSlug}/manual-booking?list=leads`,
      );
      const data = await res.json();
      if (!data.success) {
        setLoadError(data.error ?? "Failed to load leads.");
        setLeads([]);
        setCampaignName(null);
        return;
      }
      setLeads(data.leads as ReconciliationLead[]);
      setCampaignName(data.campaignName as string);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load leads.");
      setLeads([]);
    } finally {
      setLoadingLeads(false);
    }
  }, []);

  useEffect(() => {
    if (!slug) {
      setLeads([]);
      setCampaignName(null);
      return;
    }
    void refresh(slug);
  }, [slug, refresh]);

  const beginEntry = useCallback((lead: ReconciliationLead) => {
    setActiveEmail(lead.email);
    setBookingReference(lead.bookingReference ?? "");
    setBookingConfirmedAt(
      lead.bookingConfirmedAt
        ? lead.bookingConfirmedAt.slice(0, 10)
        : today(),
    );
    setBookingAmount(lead.bookingAmount != null ? String(lead.bookingAmount) : "");
    setBookingNotes(lead.bookingNotes ?? "");
    setBookingEnteredBy(lead.bookingEnteredBy ?? bookingEnteredBy);
    setSaveStatus({ kind: "idle" });
  }, [bookingEnteredBy]);

  const cancelEntry = useCallback(() => {
    setActiveEmail(null);
    setSaveStatus({ kind: "idle" });
  }, []);

  const save = useCallback(async () => {
    if (!slug || !activeEmail) return;
    if (!bookingReference.trim()) {
      setSaveStatus({ kind: "error", message: "Booking reference is required." });
      return;
    }
    if (!bookingConfirmedAt) {
      setSaveStatus({ kind: "error", message: "Booking date is required." });
      return;
    }

    setSaveStatus({ kind: "pending" });

    const amount = bookingAmount.trim() === "" ? undefined : Number(bookingAmount);
    if (amount !== undefined && Number.isNaN(amount)) {
      setSaveStatus({ kind: "error", message: "Booking amount must be a number." });
      return;
    }

    try {
      const res = await fetch(`/api/groups/campaign/${slug}/manual-booking`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: activeEmail,
          bookingReference: bookingReference.trim(),
          bookingConfirmedAt,
          bookingAmount: amount,
          bookingNotes: bookingNotes.trim() || undefined,
          bookingEnteredBy: bookingEnteredBy.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        setSaveStatus({ kind: "error", message: data.error ?? "Save failed." });
        return;
      }
      setSaveStatus({
        kind: "ok",
        message: data.advisory ?? "Booking saved.",
        convertedNow: data.convertedNow === true,
      });
      // Re-fetch so the table reflects the new state.
      await refresh(slug);
    } catch (err) {
      setSaveStatus({
        kind: "error",
        message: err instanceof Error ? err.message : "Save failed.",
      });
    }
  }, [
    slug,
    activeEmail,
    bookingReference,
    bookingConfirmedAt,
    bookingAmount,
    bookingNotes,
    bookingEnteredBy,
    refresh,
  ]);

  const unbooked = leads.filter((l) => !l.converted);
  const booked = leads.filter((l) => l.converted);

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-white tracking-tight">Manual Booking Entry</h1>
        <p className="text-sm text-slate-400">
          Daily reconciliation against the CB Agent Tools dashboard. When a guest
          books, copy their CB booking reference here so the lead is marked converted
          and the conversion ledger picks it up. Idempotent — re-saving the same
          booking just updates the metadata.
        </p>
      </div>

      <section className="space-y-3 rounded-xl border border-white/10 bg-slate-900/60 p-5">
        <label className="text-xs font-semibold uppercase tracking-widest text-slate-400">
          Campaign
        </label>
        <CampaignSelector value={slug} onChange={setSlug} defaultFilter="all" />
        {campaignName && (
          <p className="text-xs text-slate-400">
            Reconciling <span className="text-white">{campaignName}</span> ({slug}).
            {leads.length > 0 && (
              <> {unbooked.length} unbooked, {booked.length} booked.</>
            )}
          </p>
        )}
        <div className="space-y-1">
          <label className="text-xs text-slate-400">Your name (audit trail, optional)</label>
          <input
            value={bookingEnteredBy}
            onChange={(e) => setBookingEnteredBy(e.target.value)}
            placeholder="e.g. Curtis"
            className="w-full sm:w-72 rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
          />
        </div>
      </section>

      {loadError && (
        <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">
          {loadError}
        </p>
      )}

      {/* Entry form */}
      {activeLead && (
        <section className="space-y-4 rounded-xl border border-sky-500/40 bg-sky-500/5 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-white">
                Entering booking for {activeLead.firstName} {activeLead.lastName}
              </h2>
              <p className="text-xs text-slate-400">
                {activeLead.email} · {activeLead.passengerCount} pax · {activeLead.preferredCabinType}
                {activeLead.bookingMode ? ` · ${activeLead.bookingMode}` : ""}
              </p>
            </div>
            <button
              onClick={cancelEntry}
              className="rounded-lg border border-white/10 bg-slate-950 px-3 py-1 text-xs text-slate-300 hover:bg-slate-800"
            >
              Cancel
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs text-slate-400">CB booking reference *</label>
              <input
                value={bookingReference}
                onChange={(e) => setBookingReference(e.target.value)}
                placeholder="e.g. CB-AT-123456"
                className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white font-mono"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-slate-400">Date of booking *</label>
              <input
                type="date"
                value={bookingConfirmedAt}
                onChange={(e) => setBookingConfirmedAt(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-slate-400">Booking amount (USD, optional)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={bookingAmount}
                onChange={(e) => setBookingAmount(e.target.value)}
                placeholder="2349.00"
                className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className="text-xs text-slate-400">Notes (optional — cabin number, dietary, etc.)</label>
              <textarea
                value={bookingNotes}
                onChange={(e) => setBookingNotes(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => void save()}
              disabled={saveStatus.kind === "pending"}
              className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 disabled:opacity-40"
            >
              {saveStatus.kind === "pending" ? "Saving…" : "Save booking"}
            </button>
            {saveStatus.kind === "ok" && (
              <span className={`text-xs ${saveStatus.convertedNow ? "text-emerald-300" : "text-slate-300"}`}>
                {saveStatus.convertedNow ? "Converted ✓" : "Updated"} — {saveStatus.message}
              </span>
            )}
            {saveStatus.kind === "error" && (
              <span className="text-xs text-rose-300">{saveStatus.message}</span>
            )}
          </div>
        </section>
      )}

      {/* Leads table */}
      {loadingLeads ? (
        <p className="text-sm text-slate-400">Loading leads…</p>
      ) : leads.length === 0 && slug ? (
        <p className="text-sm text-slate-400">No leads on this campaign yet.</p>
      ) : leads.length > 0 ? (
        <section className="space-y-4">
          {unbooked.length > 0 && (
            <div>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-widest text-amber-300">
                Unbooked ({unbooked.length})
              </h2>
              <LeadTable leads={unbooked} activeEmail={activeEmail} onBegin={beginEntry} />
            </div>
          )}
          {booked.length > 0 && (
            <div>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-widest text-emerald-300">
                Booked ({booked.length})
              </h2>
              <LeadTable leads={booked} activeEmail={activeEmail} onBegin={beginEntry} />
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}

function LeadTable({
  leads,
  activeEmail,
  onBegin,
}: {
  leads: ReconciliationLead[];
  activeEmail: string | null;
  onBegin: (lead: ReconciliationLead) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-white/10 bg-slate-900/60">
      <table className="min-w-full text-sm">
        <thead className="border-b border-white/10 bg-slate-950/60 text-left text-[10px] uppercase tracking-widest text-slate-400">
          <tr>
            <th className="px-3 py-2">Guest</th>
            <th className="px-3 py-2">Email</th>
            <th className="px-3 py-2">Pax</th>
            <th className="px-3 py-2">Cabin</th>
            <th className="px-3 py-2">Mode</th>
            <th className="px-3 py-2">Booking ref</th>
            <th className="px-3 py-2">Booked on</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {leads.map((lead) => (
            <tr
              key={lead.email}
              className={`border-b border-white/5 ${activeEmail === lead.email ? "bg-sky-500/10" : ""}`}
            >
              <td className="px-3 py-2 text-white">{lead.firstName} {lead.lastName}</td>
              <td className="px-3 py-2 text-slate-300 font-mono text-xs">{lead.email}</td>
              <td className="px-3 py-2 text-slate-300">{lead.passengerCount}</td>
              <td className="px-3 py-2 text-slate-300">{lead.preferredCabinType}</td>
              <td className="px-3 py-2 text-slate-300">{lead.bookingMode ?? "—"}</td>
              <td className="px-3 py-2 text-slate-300 font-mono text-xs">
                {lead.bookingReference ?? "—"}
              </td>
              <td className="px-3 py-2 text-slate-300 text-xs">
                {lead.bookingConfirmedAt
                  ? new Date(lead.bookingConfirmedAt).toISOString().slice(0, 10)
                  : "—"}
              </td>
              <td className="px-3 py-2">
                <button
                  onClick={() => onBegin(lead)}
                  className="rounded-md border border-white/10 bg-slate-950 px-2 py-1 text-xs text-sky-300 hover:bg-slate-800"
                >
                  {lead.converted ? "Edit" : "Enter booking"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
