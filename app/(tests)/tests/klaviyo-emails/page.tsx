"use client";

import { useCallback, useEffect, useState } from "react";
import { CampaignSelector } from "../media-generation/campaign-selector";

type Stage =
  | "waitlist_confirmation"
  | "nurture_day3"
  | "nurture_day7"
  | "threshold_met"
  | "manifest_requested"
  | "manifest_reminder"
  | "booking_link_ready"
  | "campaign_expired"
  | "booking_confirmed"
  | "travel_prep"
  | "final_countdown"
  | "final_itinerary_published"
  | "tour_conductor_announced"
  | "booking_change"
  | "post_cruise_welcome_home"
  | "post_cruise_survey"
  | "alumni_rebooking_invite";

interface StageDef {
  id: Stage;
  label: string;
  metric: string;
  description: string;
  phase: 1 | 2 | 3 | 4 | 5;
  broadcast: boolean;
}

const STAGES: StageDef[] = [
  { id: "waitlist_confirmation", label: "Waitlist Confirmation", metric: "LLL Waitlist Confirmation", description: "Immediate confirmation on waitlist signup.", phase: 1, broadcast: false },
  { id: "nurture_day3", label: "Day 3 Niche Deepener", metric: "LLL Nurture Day 3", description: "3 days post-signup, theme/community deepener.", phase: 1, broadcast: false },
  { id: "nurture_day7", label: "Day 7 Momentum Check", metric: "LLL Nurture Day 7", description: "7 days post-signup, momentum + social proof.", phase: 1, broadcast: false },
  { id: "threshold_met", label: "Threshold Met", metric: "LLL Threshold Met", description: "Auto-fires when campaign hits threshold. Broadcast.", phase: 2, broadcast: true },
  { id: "manifest_requested", label: "Manifest Requested", metric: "LLL Manifest Requested", description: "Operator-triggered when manifest collection opens.", phase: 2, broadcast: true },
  { id: "manifest_reminder", label: "Manifest Reminder", metric: "LLL Manifest Reminder", description: "Operator-triggered. Defaults to PENDING-manifest leads only.", phase: 2, broadcast: true },
  { id: "booking_link_ready", label: "Booking Link Ready", metric: "LLL Booking Link Ready", description: "Operator-triggered once CB/Odysseus link is live.", phase: 2, broadcast: true },
  { id: "campaign_expired", label: "Campaign Expired", metric: "LLL Campaign Expired", description: "Auto-fires on EXPIRED status transition.", phase: 2, broadcast: true },
  { id: "booking_confirmed", label: "Booking Confirmed", metric: "LLL Booking Confirmed", description: "Auto-fires from /tests/manual-booking-entry on the first reconciliation.", phase: 3, broadcast: false },
  { id: "travel_prep", label: "Travel Prep (scheduled)", metric: "LLL Travel Prep", description: "Scheduler fires at 90/60/30 days pre-sail.", phase: 3, broadcast: false },
  { id: "final_countdown", label: "Final Countdown (scheduled)", metric: "LLL Final Countdown", description: "Scheduler fires at 14/7/3/1 days pre-sail.", phase: 3, broadcast: false },
  { id: "final_itinerary_published", label: "Final Itinerary Published", metric: "LLL Final Itinerary Published", description: "Auto-fires when finalItineraryUrl is first set via campaign PATCH.", phase: 3, broadcast: true },
  { id: "tour_conductor_announced", label: "Tour Conductor Announced", metric: "LLL Tour Conductor Announced", description: "Auto-fires when tourConductorName is first set via campaign PATCH.", phase: 3, broadcast: true },
  { id: "booking_change", label: "Booking Change", metric: "LLL Booking Change", description: "Severity-routed change notice. Use /tests/booking-changes to record + broadcast.", phase: 4, broadcast: false },
  { id: "post_cruise_welcome_home", label: "Welcome Home (scheduled)", metric: "LLL Post Cruise Welcome Home", description: "Scheduler fires 1 day after disembarkation.", phase: 5, broadcast: false },
  { id: "post_cruise_survey", label: "Post-Cruise Survey (scheduled)", metric: "LLL Post Cruise Survey", description: "Scheduler fires 3 days after disembarkation.", phase: 5, broadcast: false },
  { id: "alumni_rebooking_invite", label: "Alumni Rebooking Invite", metric: "LLL Alumni Rebooking Invite", description: "Use /tests/alumni-rebooking to fire from past campaigns to a new target.", phase: 5, broadcast: false },
];

interface LeadRef {
  email: string;
  firstName: string;
  lastName: string;
  bookingMode: string | null;
  createdAt: string;
}

interface EmailEventPreview {
  stage: Stage;
  campaignSlug: string;
  email: string;
  metricName: string;
  profile: Record<string, string | number | boolean>;
  event: Record<string, string | number | boolean>;
  warnings: string[];
}

interface BroadcastResult {
  stage: Stage;
  campaignSlug: string;
  totalLeads: number;
  attempted: number;
  skippedByFilter: number;
  succeeded: number;
  failed: number;
  failures: Array<{ email: string; error: string }>;
}

export default function KlaviyoEmailsTestPage() {
  const [slug, setSlug] = useState("");
  const [leads, setLeads] = useState<LeadRef[]>([]);
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [email, setEmail] = useState("");
  const [stage, setStage] = useState<Stage>("waitlist_confirmation");

  // Phase 2 overrides
  const [manifestDeadline, setManifestDeadline] = useState("");
  const [manifestUrl, setManifestUrl] = useState("");
  const [adjacentCampaignsUrl, setAdjacentCampaignsUrl] = useState("");
  const [operatorNote, setOperatorNote] = useState("");
  const [onlyPendingManifest, setOnlyPendingManifest] = useState(true);

  // Phase 3 overrides
  const [scheduledOffset, setScheduledOffset] = useState("30");
  const [packingListUrl, setPackingListUrl] = useState("");

  // Phase 4 overrides (just enough for the preview surface — the full recorder lives on /tests/booking-changes)
  const [p4Severity, setP4Severity] = useState<"critical" | "high" | "medium" | "low" | "positive">("high");
  const [p4ChangeType, setP4ChangeType] = useState("date_change");
  const [p4PreviousValue, setP4PreviousValue] = useState("Sept 12, 2026");
  const [p4NewValue, setP4NewValue] = useState("Oct 3, 2026");
  const [p4Summary, setP4Summary] = useState("Sail date moved by 3 weeks.");

  // Scheduler panel state
  const [schedDryRun, setSchedDryRun] = useState(true);
  const [schedToday, setSchedToday] = useState("");
  const [schedRunning, setSchedRunning] = useState(false);
  const [schedResult, setSchedResult] = useState<unknown>(null);
  const [schedError, setSchedError] = useState<string | null>(null);

  const [preview, setPreview] = useState<EmailEventPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [dispatchStatus, setDispatchStatus] = useState<
    | { kind: "idle" }
    | { kind: "pending"; mode: "dry" | "live" | "broadcast-dry" | "broadcast-live" }
    | { kind: "ok"; mode: "dry" | "live" | "broadcast-dry" | "broadcast-live"; message: string }
    | { kind: "error"; message: string }
  >({ kind: "idle" });
  const [broadcastResult, setBroadcastResult] = useState<BroadcastResult | null>(null);

  const currentStageDef = STAGES.find((s) => s.id === stage)!;
  const isPhase2 = currentStageDef.phase === 2;
  const isPhase3 = currentStageDef.phase === 3;
  const isPhase4 = currentStageDef.phase === 4;
  const isManifestStage = stage === "manifest_requested" || stage === "manifest_reminder";
  const isScheduledStage = stage === "travel_prep" || stage === "final_countdown";

  // Fetch leads when slug changes
  useEffect(() => {
    if (!slug) {
      setLeads([]);
      return;
    }
    let cancelled = false;
    setLoadingLeads(true);
    void (async () => {
      try {
        const res = await fetch(`/api/groups/campaign/${slug}/email-preview?list=leads`);
        const data = await res.json();
        if (cancelled) return;
        if (data.success) {
          setLeads(data.leads as LeadRef[]);
          if ((data.leads as LeadRef[]).length > 0 && !email) {
            setEmail((data.leads as LeadRef[])[0].email);
          }
        } else {
          setLeads([]);
        }
      } catch {
        if (!cancelled) setLeads([]);
      } finally {
        if (!cancelled) setLoadingLeads(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]); // eslint-disable-line react-hooks/exhaustive-deps

  const buildPhase2Body = () => ({
    manifestDeadline: manifestDeadline.trim() || undefined,
    manifestUrl: manifestUrl.trim() || undefined,
    adjacentCampaignsUrl: adjacentCampaignsUrl.trim() || undefined,
    operatorNote: operatorNote.trim() || undefined,
  });

  const buildPhase3Body = () => {
    const offset = scheduledOffset.trim();
    const offsetNum = offset === "" ? undefined : Number(offset);
    return {
      scheduledOffset: offsetNum !== undefined && !Number.isNaN(offsetNum) ? offsetNum : undefined,
      packingListUrl: packingListUrl.trim() || undefined,
      operatorNote: operatorNote.trim() || undefined,
    };
  };

  const buildPhase4Body = () => ({
    severity: p4Severity,
    changeType: p4ChangeType.trim() || undefined,
    previousValue: p4PreviousValue.trim() || undefined,
    newValue: p4NewValue.trim() || undefined,
    summary: p4Summary.trim() || undefined,
    operatorNote: operatorNote.trim() || undefined,
  });

  const runPreview = useCallback(async () => {
    if (!slug || !email) {
      setPreviewError("Pick a campaign and a lead first.");
      return;
    }
    setPreview(null);
    setPreviewError(null);
    setPreviewLoading(true);
    try {
      const qs = new URLSearchParams({ email, stage });
      if (manifestDeadline.trim()) qs.set("manifestDeadline", manifestDeadline.trim());
      if (manifestUrl.trim()) qs.set("manifestUrl", manifestUrl.trim());
      if (adjacentCampaignsUrl.trim()) qs.set("adjacentCampaignsUrl", adjacentCampaignsUrl.trim());
      if (operatorNote.trim()) qs.set("operatorNote", operatorNote.trim());
      if (isScheduledStage && scheduledOffset.trim()) qs.set("scheduledOffset", scheduledOffset.trim());
      if (stage === "final_countdown" && packingListUrl.trim()) qs.set("packingListUrl", packingListUrl.trim());
      if (isPhase4) {
        qs.set("severity", p4Severity);
        if (p4ChangeType.trim()) qs.set("changeType", p4ChangeType.trim());
        if (p4PreviousValue.trim()) qs.set("previousValue", p4PreviousValue.trim());
        if (p4NewValue.trim()) qs.set("newValue", p4NewValue.trim());
        if (p4Summary.trim()) qs.set("changeSummary", p4Summary.trim());
      }
      const res = await fetch(`/api/groups/campaign/${slug}/email-preview?${qs.toString()}`);
      const data = await res.json();
      if (!data.success) {
        setPreviewError(data.error ?? "Preview failed.");
      } else {
        setPreview(data.preview as EmailEventPreview);
      }
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : "Preview failed.");
    } finally {
      setPreviewLoading(false);
    }
  }, [slug, email, stage, manifestDeadline, manifestUrl, adjacentCampaignsUrl, operatorNote, scheduledOffset, packingListUrl, isScheduledStage, isPhase4, p4Severity, p4ChangeType, p4PreviousValue, p4NewValue, p4Summary]);

  const dispatchSingle = useCallback(
    async (mode: "dry" | "live") => {
      if (!slug || !email) {
        setDispatchStatus({ kind: "error", message: "Pick a campaign and a lead first." });
        return;
      }
      if (mode === "live" && !confirm(`Send LIVE Klaviyo event "${stage}" to ${email}?`)) return;
      setDispatchStatus({ kind: "pending", mode });
      try {
        const res = await fetch(`/api/groups/campaign/${slug}/email-preview`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            email,
            stage,
            dryRun: mode === "dry",
            phase2: isPhase2 ? buildPhase2Body() : undefined,
            phase3: isPhase3 ? buildPhase3Body() : undefined,
            phase4: isPhase4 ? buildPhase4Body() : undefined,
          }),
        });
        const data = await res.json();
        if (!data.success) {
          setDispatchStatus({ kind: "error", message: data.error ?? "Dispatch failed." });
        } else {
          setDispatchStatus({
            kind: "ok",
            mode,
            message:
              mode === "dry"
                ? "Dry-run recorded. Ledger event `nurture_queued` written; no Klaviyo call made."
                : "Live event dispatched.",
          });
        }
      } catch (err) {
        setDispatchStatus({ kind: "error", message: err instanceof Error ? err.message : "Dispatch failed." });
      }
    },
    [slug, email, stage, isPhase2, isPhase3, isPhase4, manifestDeadline, manifestUrl, adjacentCampaignsUrl, operatorNote, scheduledOffset, packingListUrl, p4Severity, p4ChangeType, p4PreviousValue, p4NewValue, p4Summary],
  );

  const runSchedulerNow = useCallback(async () => {
    if (!slug) {
      setSchedError("Pick a campaign first.");
      return;
    }
    setSchedRunning(true);
    setSchedError(null);
    setSchedResult(null);
    try {
      const res = await fetch(`/api/groups/campaign/${slug}/email-scheduler`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          dryRun: schedDryRun,
          today: schedToday.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        setSchedError(data.error ?? "Scheduler run failed.");
      } else {
        setSchedResult(data.result);
      }
    } catch (err) {
      setSchedError(err instanceof Error ? err.message : "Scheduler run failed.");
    } finally {
      setSchedRunning(false);
    }
  }, [slug, schedDryRun, schedToday]);

  const dispatchBroadcast = useCallback(
    async (mode: "dry" | "live") => {
      if (!slug) {
        setDispatchStatus({ kind: "error", message: "Pick a campaign first." });
        return;
      }
      const wireMode = mode === "dry" ? "broadcast-dry" : "broadcast-live";
      if (
        mode === "live" &&
        !confirm(`Broadcast LIVE "${stage}" to every lead on ${slug}?`)
      ) return;
      setDispatchStatus({ kind: "pending", mode: wireMode });
      setBroadcastResult(null);
      try {
        const res = await fetch(`/api/groups/campaign/${slug}/email-broadcast`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            stage,
            dryRun: mode === "dry",
            phase2: buildPhase2Body(),
            filter:
              stage === "manifest_reminder"
                ? { onlyPendingManifest }
                : undefined,
          }),
        });
        const data = await res.json();
        if (!data.success) {
          setDispatchStatus({ kind: "error", message: data.error ?? "Broadcast failed." });
        } else {
          setBroadcastResult(data.result as BroadcastResult);
          setDispatchStatus({
            kind: "ok",
            mode: wireMode,
            message: mode === "dry" ? "Dry-run broadcast complete." : "Live broadcast complete.",
          });
        }
      } catch (err) {
        setDispatchStatus({ kind: "error", message: err instanceof Error ? err.message : "Broadcast failed." });
      }
    },
    [slug, stage, onlyPendingManifest, manifestDeadline, manifestUrl, adjacentCampaignsUrl, operatorNote],
  );

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-white tracking-tight">Klaviyo Email Preview</h1>
        <p className="text-sm text-slate-400">
          Preview the exact Klaviyo profile + event payload for any implemented lifecycle email.
          Phase 1 stages target a single lead; Phase 2 stages support broadcast to every lead on the campaign.
        </p>
      </div>

      {/* Inputs */}
      <section className="space-y-4 rounded-xl border border-white/10 bg-slate-900/60 p-5">
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-widest text-slate-400">Campaign</label>
          <CampaignSelector value={slug} onChange={setSlug} defaultFilter="all" />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-widest text-slate-400">Lead</label>
          {loadingLeads ? (
            <p className="text-sm text-slate-400">Loading waitlist…</p>
          ) : leads.length === 0 ? (
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="lead@example.com"
              className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
            />
          ) : (
            <select
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
            >
              {leads.map((lead) => (
                <option key={lead.email} value={lead.email}>
                  {lead.firstName} {lead.lastName} — {lead.email}
                  {lead.bookingMode ? ` (${lead.bookingMode})` : ""}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-widest text-slate-400">Stage</label>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {STAGES.map((s) => (
              <button
                key={s.id}
                onClick={() => setStage(s.id)}
                className={`flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors ${
                  stage === s.id
                    ? "border-sky-500/60 bg-sky-500/10"
                    : "border-white/10 bg-slate-950 hover:bg-slate-800/60"
                }`}
              >
                <div className="flex items-center gap-1">
                  <span className="text-sm font-semibold text-white">{s.label}</span>
                  <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                    s.phase === 1 ? "bg-sky-500/20 text-sky-200"
                      : s.phase === 2 ? "bg-violet-500/20 text-violet-200"
                      : s.phase === 3 ? "bg-cyan-500/20 text-cyan-200"
                      : s.phase === 4 ? "bg-rose-500/20 text-rose-200"
                      : "bg-emerald-500/20 text-emerald-200"
                  }`}>P{s.phase}</span>
                </div>
                <span className="text-[10px] uppercase tracking-widest text-sky-300">{s.metric}</span>
                <span className="text-xs text-slate-400">{s.description}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Phase 2 overrides */}
        {isPhase2 && (
          <div className="space-y-3 rounded-lg border border-violet-500/30 bg-violet-500/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-violet-300">Phase 2 inputs</p>
            {isManifestStage && (
              <>
                <div className="space-y-1">
                  <label className="text-xs text-slate-400">Manifest deadline</label>
                  <input
                    value={manifestDeadline}
                    onChange={(e) => setManifestDeadline(e.target.value)}
                    placeholder="2026-06-15 or 'Friday, June 14'"
                    className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-400">Manifest URL override (defaults to {`{landing}/manifest`})</label>
                  <input
                    value={manifestUrl}
                    onChange={(e) => setManifestUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
                  />
                </div>
              </>
            )}
            {stage === "campaign_expired" && (
              <div className="space-y-1">
                <label className="text-xs text-slate-400">Adjacent campaigns URL</label>
                <input
                  value={adjacentCampaignsUrl}
                  onChange={(e) => setAdjacentCampaignsUrl(e.target.value)}
                  placeholder="https://leisurelifeinteractive.com/groups"
                  className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
                />
              </div>
            )}
            <div className="space-y-1">
              <label className="text-xs text-slate-400">Operator note (optional, appended to template)</label>
              <textarea
                value={operatorNote}
                onChange={(e) => setOperatorNote(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
              />
            </div>
            {stage === "manifest_reminder" && (
              <label className="flex items-center gap-2 text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={onlyPendingManifest}
                  onChange={(e) => setOnlyPendingManifest(e.target.checked)}
                />
                Broadcast: skip leads whose manifest is already submitted
              </label>
            )}
          </div>
        )}

        {/* Phase 3 inputs (scheduled stages + optional packing list) */}
        {isPhase3 && (
          <div className="space-y-3 rounded-lg border border-cyan-500/30 bg-cyan-500/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-cyan-300">Phase 3 inputs</p>
            {isScheduledStage && (
              <div className="space-y-1">
                <label className="text-xs text-slate-400">
                  Scheduled offset (days pre-sail). The scheduler supplies this automatically — set here only to preview a specific offset.
                </label>
                <input
                  type="number"
                  value={scheduledOffset}
                  onChange={(e) => setScheduledOffset(e.target.value)}
                  className="w-32 rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
                />
              </div>
            )}
            {stage === "final_countdown" && (
              <div className="space-y-1">
                <label className="text-xs text-slate-400">Packing list URL (optional)</label>
                <input
                  value={packingListUrl}
                  onChange={(e) => setPackingListUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
                />
              </div>
            )}
            <div className="space-y-1">
              <label className="text-xs text-slate-400">Operator note (optional)</label>
              <textarea
                value={operatorNote}
                onChange={(e) => setOperatorNote(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
              />
            </div>
            {(stage === "final_itinerary_published" || stage === "tour_conductor_announced") && (
              <p className="text-xs text-slate-400 italic">
                This stage auto-broadcasts to converted leads when the corresponding campaign field is first
                populated (via campaign PATCH). The buttons below let you re-fire manually.
              </p>
            )}
            {isScheduledStage && (
              <p className="text-xs text-slate-400 italic">
                Production: this stage is fired by the scheduler (see the Scheduler Run panel at the bottom of
                this page, or the cron endpoint <span className="font-mono">/api/cron/email-scheduler</span>).
              </p>
            )}
          </div>
        )}

        {/* Phase 4 inputs (booking_change preview only — the full recorder lives on /tests/booking-changes) */}
        {isPhase4 && (
          <div className="space-y-3 rounded-lg border border-rose-500/30 bg-rose-500/5 p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-rose-300">Phase 4 inputs (preview only)</p>
              <a href="/tests/booking-changes" className="text-[11px] text-rose-200 underline hover:text-rose-100">
                Open the recorder dashboard →
              </a>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs text-slate-400">Severity</label>
                <select
                  value={p4Severity}
                  onChange={(e) => setP4Severity(e.target.value as typeof p4Severity)}
                  className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
                >
                  <option value="critical">critical (email + SMS)</option>
                  <option value="high">high</option>
                  <option value="medium">medium</option>
                  <option value="low">low</option>
                  <option value="positive">positive</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-400">Change type</label>
                <input
                  value={p4ChangeType}
                  onChange={(e) => setP4ChangeType(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-400">Previous value</label>
                <input
                  value={p4PreviousValue}
                  onChange={(e) => setP4PreviousValue(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-400">New value</label>
                <input
                  value={p4NewValue}
                  onChange={(e) => setP4NewValue(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs text-slate-400">Summary</label>
                <input
                  value={p4Summary}
                  onChange={(e) => setP4Summary(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs text-slate-400">Operator note</label>
                <textarea
                  value={operatorNote}
                  onChange={(e) => setOperatorNote(e.target.value)}
                  rows={2}
                  className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
                />
              </div>
            </div>
            <p className="text-xs text-slate-400 italic">
              This page renders the email payload only. To actually record a change (with ledger rows, broadcast,
              SMS for critical, and ack tracking), use <span className="font-mono">/tests/booking-changes</span>.
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-2">
          <button
            onClick={runPreview}
            disabled={previewLoading || !slug || !email}
            className="rounded-lg border border-white/10 bg-white text-slate-900 px-4 py-2 text-sm font-semibold disabled:opacity-40"
          >
            {previewLoading ? "Building…" : "Preview payload"}
          </button>
          <button
            onClick={() => void dispatchSingle("dry")}
            disabled={dispatchStatus.kind === "pending" || !slug || !email}
            className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-200 disabled:opacity-40"
          >
            Single: dry-run
          </button>
          <button
            onClick={() => void dispatchSingle("live")}
            disabled={dispatchStatus.kind === "pending" || !slug || !email}
            className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-200 disabled:opacity-40"
          >
            Single: LIVE
          </button>
          {currentStageDef.broadcast && (
            <>
              <button
                onClick={() => void dispatchBroadcast("dry")}
                disabled={dispatchStatus.kind === "pending" || !slug}
                className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-200 disabled:opacity-40"
              >
                Broadcast: dry-run
              </button>
              <button
                onClick={() => void dispatchBroadcast("live")}
                disabled={dispatchStatus.kind === "pending" || !slug}
                className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-200 disabled:opacity-40"
              >
                Broadcast: LIVE
              </button>
            </>
          )}
        </div>

        {dispatchStatus.kind === "ok" && (
          <p className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs text-emerald-200">
            {dispatchStatus.message}
          </p>
        )}
        {dispatchStatus.kind === "error" && (
          <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-200">
            {dispatchStatus.message}
          </p>
        )}
      </section>

      {/* Broadcast result */}
      {broadcastResult && (
        <section className="rounded-xl border border-white/10 bg-slate-900/60 p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-violet-300">Broadcast result</h2>
          <div className="grid grid-cols-3 gap-3 text-sm sm:grid-cols-6">
            <div><div className="text-[10px] uppercase text-slate-400">Total</div><div className="text-white">{broadcastResult.totalLeads}</div></div>
            <div><div className="text-[10px] uppercase text-slate-400">Attempted</div><div className="text-white">{broadcastResult.attempted}</div></div>
            <div><div className="text-[10px] uppercase text-slate-400">Skipped</div><div className="text-amber-300">{broadcastResult.skippedByFilter}</div></div>
            <div><div className="text-[10px] uppercase text-slate-400">Succeeded</div><div className="text-emerald-300">{broadcastResult.succeeded}</div></div>
            <div><div className="text-[10px] uppercase text-slate-400">Failed</div><div className="text-rose-300">{broadcastResult.failed}</div></div>
          </div>
          {broadcastResult.failures.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-semibold text-rose-300">Failures</p>
              <ul className="mt-1 list-disc pl-5 text-xs text-rose-200 space-y-1">
                {broadcastResult.failures.map((f) => (
                  <li key={f.email}><span className="font-mono">{f.email}</span> — {f.error}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* Payload preview */}
      {previewError && (
        <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">{previewError}</p>
      )}
      {preview && (
        <section className="space-y-4">
          <div className="rounded-xl border border-white/10 bg-slate-900/60 p-5">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-widest text-sky-300">Klaviyo Metric</h2>
            <p className="font-mono text-white">{preview.metricName}</p>
          </div>

          {preview.warnings.length > 0 && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-5">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-widest text-amber-300">Warnings</h2>
              <ul className="list-disc pl-5 text-xs text-amber-100 space-y-1">
                {preview.warnings.map((w) => (<li key={w}>{w}</li>))}
              </ul>
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-slate-900/60 p-5">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-emerald-300">Profile Properties</h2>
              <pre className="overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-emerald-200">{JSON.stringify(preview.profile, null, 2)}</pre>
            </div>
            <div className="rounded-xl border border-white/10 bg-slate-900/60 p-5">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-violet-300">Event Properties</h2>
              <pre className="overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-violet-200">{JSON.stringify(preview.event, null, 2)}</pre>
            </div>
          </div>
        </section>
      )}

      {/* Scheduler run panel — Phase 3 cadence (travel_prep / final_countdown). */}
      <section className="space-y-4 rounded-xl border border-cyan-500/30 bg-slate-900/60 p-5">
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-white">Scheduler Run</h2>
          <p className="text-xs text-slate-400">
            Sweeps the selected campaign for Phase 3 scheduled stages (<span className="font-mono">travel_prep</span>{" "}
            at 90/60/30 and <span className="font-mono">final_countdown</span> at 14/7/3/1 days pre-sail). Idempotent —
            already-sent (lead, stage, offset) combinations are skipped. In production this same logic runs daily via{" "}
            <span className="font-mono">/api/cron/email-scheduler</span>.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex items-center gap-2 text-xs text-slate-300">
            <input type="checkbox" checked={schedDryRun} onChange={(e) => setSchedDryRun(e.target.checked)} />
            Dry run (no Klaviyo calls)
          </label>
          <div className="space-y-1">
            <label className="text-xs text-slate-400">Today override (YYYY-MM-DD, optional)</label>
            <input
              value={schedToday}
              onChange={(e) => setSchedToday(e.target.value)}
              placeholder="2026-08-15"
              className="w-44 rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
            />
          </div>
          <button
            onClick={() => void runSchedulerNow()}
            disabled={schedRunning || !slug}
            className="rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-200 disabled:opacity-40"
          >
            {schedRunning ? "Running…" : "Run scheduler for this campaign"}
          </button>
        </div>
        {schedError && (
          <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-200">{schedError}</p>
        )}
        {schedResult !== null && schedResult !== undefined && (
          <pre className="overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-cyan-200">{JSON.stringify(schedResult, null, 2)}</pre>
        )}
      </section>
    </div>
  );
}
