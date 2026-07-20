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
import { mockMscSeniorCandidate, serviceRateSummary, type MockJournalEvent } from "./booking-flow-model";

const MODE_KEY = "lll-booking-assistant-lab-mode";

type LabMode = "guest" | "lab";

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
            <OperatorPreview snapshot={snapshot} />
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
