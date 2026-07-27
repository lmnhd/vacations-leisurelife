"use client";

/**
 * Lab chrome for the Booking Assistant Interaction Flow Lab. The guest
 * experience itself lives entirely in booking-flow-experience.tsx (the
 * production-bound component); this wrapper only decides how to present it and
 * observes its state from outside:
 *
 * - "Guest view": the experience rendered full-viewport, exactly as the
 *   production /deals/[id]/book route would show it - no frame, no panels.
 *   This is the default on phone-sized screens.
 * - "Lab view": the experience inside a phone-shaped frame beside the mock
 *   operator preview and Booking Activity Journal panels.
 *
 * The wrapper talks to the experience only through its public surface
 * (onDebug snapshot + reset/simulateEmailResume handle), so deleting the lab
 * chrome later cannot change guest behavior.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import {
  BookingFlowExperience,
  CREAM,
  type BookingFlowHandle,
  type BookingFlowSnapshot,
} from "./booking-flow-experience";
import {
  CALL_OUTCOME_LABELS,
  buildJourneyReplay,
  mockMscSeniorCandidate,
  serviceRateSummary,
  type CallOutcome,
  type CallerIdState,
  type MockJournalEvent,
} from "./booking-flow-model";

const MODE_KEY = "lll-booking-assistant-lab-mode";

type LabMode = "guest" | "lab";

/** Last four digits of a phone string, digits-only (no regex per AI_POLICY). */
function lastFourDigits(value: string): string {
  let digits = "";
  for (const ch of value) {
    if (ch >= "0" && ch <= "9") digits += ch;
  }
  return digits.slice(-4) || "----";
}

export function BookingAssistantLab() {
  const flowRef = useRef<BookingFlowHandle>(null);
  const [mode, setMode] = useState<LabMode | null>(null);
  const [snapshot, setSnapshot] = useState<BookingFlowSnapshot | null>(null);

  // Default: full-screen guest view on phone-sized screens, lab view on desktop.
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = sessionStorage.getItem(MODE_KEY);
    } catch {
      // ignore
    }
    if (saved === "guest" || saved === "lab") {
      setMode(saved);
    } else {
      setMode(window.innerWidth < 768 ? "guest" : "lab");
    }
  }, []);

  const switchMode = useCallback((next: LabMode) => {
    setMode(next);
    try {
      sessionStorage.setItem(MODE_KEY, next);
    } catch {
      // ignore
    }
  }, []);

  const onDebug = useCallback((next: BookingFlowSnapshot) => {
    setSnapshot(next);
  }, []);

  if (mode === null) {
    return <div className="min-h-screen bg-[#070b16]" />;
  }

  // ===== Guest view: exactly what a guest would see, edge to edge ===========
  if (mode === "guest") {
    return (
      <div className="fixed inset-0 z-50 flex flex-col" style={{ background: CREAM }}>
        {/* Slim lab bar - the ONLY non-production element on this screen. */}
        <div className="flex h-8 shrink-0 items-center justify-between bg-black/85 px-3">
          <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
            Guest view - as users will see it
          </span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => flowRef.current?.reset()}
              className="text-[10px] font-semibold text-rose-300"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={() => switchMode("lab")}
              className="text-[10px] font-semibold text-cyan-300"
            >
              Exit to lab view
            </button>
          </div>
        </div>
        {/* Full-bleed on phones; centered production-like column on desktop. */}
        <div className="mx-auto min-h-0 w-full max-w-[480px] flex-1">
          <BookingFlowExperience ref={flowRef} onDebug={onDebug} />
        </div>
      </div>
    );
  }

  // ===== Lab view: framed experience + observer panels ======================
  return (
    <div className="min-h-screen bg-[#070b16] px-4 py-8 text-slate-200 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-300">
              Deals Operator Workbench - Interaction Flow Lab
            </p>
            <h1 className="mt-1 text-2xl font-bold text-white">Mobile Booking Flow Prototype</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-400">
              Phase 1 mock: test the guest interaction before any durable logic is built. All data is
              fictional, saved only in this browser tab, and cleared by Reset. Use Guest view for the
              exact user-facing rendering.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => switchMode("guest")}
              className="rounded-lg border border-cyan-400/40 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/20"
            >
              Guest view (full screen)
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10"
            >
              Simulate refresh
            </button>
            {snapshot?.screen === "paused" && (
              <button
                type="button"
                onClick={() => flowRef.current?.simulateEmailResume()}
                className="rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/20"
              >
                Simulate email resume
              </button>
            )}
            <button
              type="button"
              onClick={() => flowRef.current?.reset()}
              className="rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-200 hover:bg-rose-500/20"
            >
              Reset lab
            </button>
          </div>
        </header>

        <div className="flex flex-wrap items-start justify-center gap-8 lg:flex-nowrap">
          {/* Phone-shaped frame around the SAME experience component. */}
          <div className="w-full max-w-[400px] shrink-0">
            <div className="relative mx-auto h-[780px] w-full overflow-hidden rounded-[2.4rem] border-[6px] border-black shadow-2xl shadow-black/60">
              <BookingFlowExperience ref={flowRef} onDebug={onDebug} />
            </div>
            <p className="mt-3 text-center text-[11px] text-slate-500">
              390px frame approximates an iPhone viewport. Tap "Guest view" (or open this page on a
              phone) for the exact edge-to-edge rendering.
            </p>
          </div>

          {/* Observer panels: read-only view of the flow's debug snapshot. */}
          <div className="flex w-full min-w-0 flex-col gap-6 lg:max-w-[560px]">
            <CallIntentPanel snapshot={snapshot} flowRef={flowRef} />
            <OperatorPreview snapshot={snapshot} />
            <JourneyReplayPanel journal={snapshot?.journal ?? []} />
            <JournalPanel journal={snapshot?.journal ?? []} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Observer panels (lab-only; never ship to production)
// ============================================================================

/**
 * Mock operator "Calling now" panel (Section 29.2). Demonstrates the full
 * handoff - receive signal, pin the draft, verify the caller, reveal the
 * packet, run the processing checklist, record an outcome - without opening
 * Odysseus or touching payment. It never shows the raw fallback key in the
 * broad card; caller ID is never treated as authentication.
 */
function CallIntentPanel({
  snapshot,
  flowRef,
}: {
  snapshot: BookingFlowSnapshot | null;
  flowRef: React.RefObject<BookingFlowHandle>;
}) {
  const signal = snapshot?.callSignal ?? null;
  const draft = snapshot?.draft;
  const status = draft?.status;
  const [keyInput, setKeyInput] = useState("");
  const [lookup, setLookup] = useState<"idle" | "match" | "no_match">("idle");

  const maskedCaller = draft?.phone ? `••• ••• ${lastFourDigits(draft.phone)}` : "unknown";

  // Fallback-key lookup for a direct/blocked-caller-id call (29.2.5). Compared
  // against the snapshot's key; the raw key is never rendered in this card.
  function runLookup() {
    const attempt = keyInput.trim().toUpperCase();
    if (!attempt) return;
    const matched = flowRef.current?.operatorLookupFallbackKey(attempt) ?? false;
    setLookup(matched ? "match" : "no_match");
  }

  if (!signal && status !== "ready_to_call_agent") {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
          Operator - Calling now (mock)
        </p>
        <p className="mt-2 text-[13px] text-slate-500">
          No active call intent. When the guest taps <span className="font-semibold text-slate-300">Call agent to finalize</span>,
          the signal appears here to pin and acknowledge.
        </p>
      </div>
    );
  }

  const acknowledged = signal?.acknowledged ?? false;
  const verified = signal?.callerVerified ?? false;

  return (
    <div className="rounded-2xl border border-fuchsia-400/20 bg-fuchsia-500/[0.04] p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-fuchsia-300">
          Operator - Calling now (mock)
        </p>
        <span className="rounded-full border border-fuchsia-400/35 bg-fuchsia-500/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-fuchsia-200">
          {status}
        </span>
      </div>

      {status === "ready_to_call_agent" && !signal && (
        <p className="mt-3 text-[13px] text-slate-400">
          Packet saved and ready. Waiting for the guest to place the call.
        </p>
      )}

      {signal && (
        <div className="mt-3 space-y-3">
          {/* Masked pinned card - never shows raw key (29.2.2). */}
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-[12px] text-slate-300">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Expected caller</p>
                <p>{maskedCaller}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Deal / sailing</p>
                <p>MSC Seaview - Aug 22</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Attempt</p>
                <p className="font-mono">{signal.callAttemptId}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Verification</p>
                <p>{verified ? "verified" : "awaiting caller verification"}</p>
              </div>
            </div>
          </div>

          {/* Step 1: pin + acknowledge (gates guest -> calling_now). */}
          {!acknowledged ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => flowRef.current?.operatorAcknowledgeSignal()}
                className="rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-200"
              >
                Pin + acknowledge attempt
              </button>
              <button
                type="button"
                onClick={() => flowRef.current?.operatorExpireSignal()}
                className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-300"
              >
                Expire signal (no call received)
              </button>
            </div>
          ) : (
            <>
              {/* Step 2: caller-ID compare (never authentication). */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Caller ID compare (not auth)</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {(["matched", "different", "blocked", "unavailable"] as CallerIdState[]).map((state) => (
                    <button
                      key={state}
                      type="button"
                      onClick={() => flowRef.current?.operatorSetCallerId(state)}
                      className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold ${
                        signal.callerIdState === state
                          ? "border-cyan-400/50 bg-cyan-500/15 text-cyan-200"
                          : "border-white/15 bg-white/5 text-slate-300"
                      }`}
                    >
                      {state}
                    </button>
                  ))}
                </div>
              </div>

              {/* Fallback-key lookup for direct/blocked callers (29.2.5). */}
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
                  Fallback key lookup (direct / blocked caller)
                </p>
                <div className="mt-1.5 flex gap-2">
                  <input
                    value={keyInput}
                    onChange={(event) => {
                      setKeyInput(event.target.value);
                      setLookup("idle");
                    }}
                    placeholder="3-letter key"
                    maxLength={3}
                    className="w-24 rounded-lg border border-white/15 bg-white/5 px-2 py-1.5 text-xs uppercase tracking-[0.2em] text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={runLookup}
                    className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200"
                  >
                    Look up
                  </button>
                  {lookup === "match" && <span className="self-center text-xs font-semibold text-emerald-300">Match</span>}
                  {lookup === "no_match" && <span className="self-center text-xs font-semibold text-rose-300">No match</span>}
                </div>
              </div>

              {/* Step 3: record verification (gates packet reveal, 29.2.7). */}
              {!verified ? (
                <button
                  type="button"
                  onClick={() => flowRef.current?.operatorRecordVerification()}
                  disabled={!signal.callerIdState}
                  className="rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-200 disabled:opacity-40"
                >
                  Record caller verification
                </button>
              ) : status === "calling_now" ? (
                <button
                  type="button"
                  onClick={() => flowRef.current?.operatorStartProcessing()}
                  className="rounded-lg border border-cyan-400/40 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-200"
                >
                  Reveal packet + start processing
                </button>
              ) : null}

              {/* Step 4: processing checklist + outcomes (29.2.8/9). */}
              {status === "agent_processing" && (
                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                  <p className="text-[11px] font-semibold text-slate-300">
                    Fresh session - recheck price, taxes/fees, cabin, special rates, schedule, terms - enter data - take payment by phone - submit.
                  </p>
                  <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Record outcome</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {(Object.keys(CALL_OUTCOME_LABELS) as CallOutcome[]).map((outcome) => (
                      <button
                        key={outcome}
                        type="button"
                        onClick={() => flowRef.current?.operatorRecordOutcome(outcome)}
                        className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold ${
                          outcome === "confirmed"
                            ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
                            : "border-white/15 bg-white/5 text-slate-300"
                        }`}
                      >
                        {CALL_OUTCOME_LABELS[outcome]}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <p className="mt-3 text-[11px] text-slate-500">
        Caller ID is never authentication. No card fields, no supplier/Voice call, no brn - this
        panel only demonstrates the handoff shape.
      </p>
    </div>
  );
}

function OperatorPreview({ snapshot }: { snapshot: BookingFlowSnapshot | null }) {
  const draft = snapshot?.draft;
  const tasks = snapshot?.tasks ?? [];
  const missing = draft
    ? tasks.filter((task) => !draft.confirmedTasks.includes(task.id) && task.id !== "review")
    : [];
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Operator preview (mock Booking Queue card)</p>
        <span className="rounded-full border border-cyan-400/35 bg-cyan-500/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-cyan-200">
          {draft?.status ?? "no draft"}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-[13px] text-slate-300 sm:grid-cols-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Guest</p>
          <p>{draft?.firstName || "-"}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Completion</p>
          <p>{snapshot?.completionPct ?? 0}%</p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Channels</p>
          <p>{[draft?.email && "email", draft?.phone && "phone"].filter(Boolean).join(" + ") || "none yet"}</p>
        </div>
      </div>
      <div className="mt-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Missing sections</p>
        <p className="mt-1 text-[12px] leading-5 text-slate-400">
          {!draft
            ? "Waiting for the flow to start."
            : missing.length === 0
              ? "Nothing - review-ready."
              : missing.map((task) => task.id).join(", ")}
        </p>
      </div>
      <div className="mt-3 rounded-xl border border-amber-400/20 bg-amber-500/[0.06] p-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-200">Savings qualification</p>
        <p className="mt-1 text-[12px] leading-5 text-slate-300">
          {!draft
            ? "Waiting for traveler details."
            : `${mockMscSeniorCandidate(draft) ? "MSC 65+ cabin candidate; live rate needed" : "Age-based live check pending"}. ${serviceRateSummary(draft)}.`}
        </p>
      </div>
      <p className="mt-3 text-[11px] text-slate-500">
        In production this card lives in the authenticated Bookings tab; PII would be masked until reveal.
      </p>
    </div>
  );
}

const ACTOR_TONE: Record<MockJournalEvent["actor"], string> = {
  guest: "border-emerald-400/35 bg-emerald-500/10 text-emerald-200",
  assistant: "border-cyan-400/35 bg-cyan-500/10 text-cyan-200",
  system: "border-slate-400/30 bg-slate-500/10 text-slate-300",
  operator: "border-fuchsia-400/35 bg-fuchsia-500/10 text-fuchsia-200",
};

function JourneyReplayPanel({ journal }: { journal: MockJournalEvent[] }) {
  const steps = buildJourneyReplay(journal);
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
        Structured journey replay
      </p>
      <p className="mt-1 text-[11px] text-slate-500">
        A privacy-safe operational replay derived from registered journal events.
      </p>
      <ol className="mt-4 flex flex-col gap-2">
        {steps.map((step, index) => (
          <li
            key={step.id}
            className="grid grid-cols-[28px_1fr_auto] items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2"
          >
            <span
              className={`flex h-7 w-7 items-center justify-center rounded-full border text-[11px] font-bold ${
                step.state === "completed"
                  ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
                  : step.state === "active"
                    ? "border-cyan-400/40 bg-cyan-500/10 text-cyan-200"
                    : "border-white/10 bg-white/[0.03] text-slate-600"
              }`}
            >
              {index + 1}
            </span>
            <div className="min-w-0">
              <p className="text-[12px] font-semibold text-slate-300">{step.label}</p>
              <p className="truncate font-mono text-[10px] text-slate-600">
                {step.lastEventType ?? "No event yet"}
              </p>
            </div>
            <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">
              {step.state === "not_started" ? "waiting" : `${step.eventCount} event${step.eventCount === 1 ? "" : "s"}`}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function JournalPanel({ journal }: { journal: MockJournalEvent[] }) {
  const rows = [...journal].reverse();
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
        Mock Booking Activity Journal ({journal.length} events)
      </p>
      <p className="mt-1 text-[11px] text-slate-500">
        Every prototype action emits a registered event name from the plan's Section 20.2 taxonomy.
      </p>
      <div className="mt-3 max-h-[520px] overflow-y-auto pr-1">
        {rows.length === 0 ? (
          <p className="text-[13px] text-slate-500">No events yet - tap Start booking in the phone.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {rows.map((event) => (
              <li key={event.seq} className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] text-slate-600" style={{ fontVariantNumeric: "tabular-nums" }}>
                    #{event.seq}
                  </span>
                  <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] ${ACTOR_TONE[event.actor]}`}>
                    {event.actor}
                  </span>
                  <span className="font-mono text-[11px] text-slate-300">{event.eventType}</span>
                  {event.taskId && <span className="text-[10px] text-slate-500">@ {event.taskId}</span>}
                </div>
                <p className="mt-0.5 text-[12px] text-slate-400">{event.detail}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
