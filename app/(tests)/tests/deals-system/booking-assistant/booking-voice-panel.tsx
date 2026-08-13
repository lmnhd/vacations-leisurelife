"use client";

/**
 * Booking Assistant voice panel - the REAL shared voice shell.
 *
 * This replaces the previous simulated microphone. It uses the same
 * useConversationVoice hook, the same server-resolved agent configuration,
 * and the same guarded tool dispatch as the public showcase page. What it
 * does NOT do is own booking state: voice can only propose a Tier A value,
 * which surfaces here as an editable confirmation the deterministic booking
 * flow commits after the guest confirms.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import {
  useConversationVoice,
  type ConfirmationCard,
} from "@/app/hooks/useConversationVoice";

const NAVY = "#0F3042";
const MUTED = "#5B6873";
const BORDER = "#E8E1D5";
const GOLD = "#8C6A3C";

/** Tier A fields voice may propose, mapped to this flow's task ids. */
const FIELD_TO_TASK: Record<string, string> = {
  first_name: "first_name",
  email: "email",
  phone: "phone",
  party_size: "party_size",
  traveler_ages: "ages",
};

export interface BookingVoicePanelProps {
  dealId: string;
  /** Server draft id when one exists; the panel works before it does too. */
  bookingDraftId: string | null;
  currentTaskId: string;
  /**
   * Called when the guest CONFIRMS a proposed value. This is the only path
   * from voice into booking state, and it always runs after a visible,
   * editable confirmation.
   */
  onValueConfirmed: (taskId: string, field: string, value: string) => void;
  /** Sanitized journal hook so voice activity appears in the activity log. */
  onJournalEvent: (
    actor: "guest" | "assistant" | "system",
    eventType: string,
    detail: string
  ) => void;
  onSwitchToTyping: () => void;
}

export function BookingVoicePanel({
  dealId,
  bookingDraftId,
  currentTaskId,
  onValueConfirmed,
  onJournalEvent,
  onSwitchToTyping,
}: BookingVoicePanelProps) {
  const [pending, setPending] = useState<ConfirmationCard | null>(null);
  const [editedValue, setEditedValue] = useState("");
  const journalRef = useRef(onJournalEvent);

  useEffect(() => {
    journalRef.current = onJournalEvent;
  });

  const handleProposal = useCallback((card: ConfirmationCard) => {
    if (card.kind !== "booking_confirmation") return;
    setPending(card);
    setEditedValue(card.value ?? "");
    journalRef.current(
      "assistant",
      "field_proposed",
      "Voice proposed a value; editable confirmation shown. Nothing saved yet."
    );
  }, []);

  const voice = useConversationVoice({
    mode: "deal_booking",
    source: "booking_assistant",
    subjectRefs: {
      dealId,
      ...(bookingDraftId ? { bookingDraftId } : {}),
    },
    onConfirmationProposed: handleProposal,
  });

  const { status, errorMessage, transcript, start, stop, interrupt, resolveConfirmation } = voice;
  const active = status !== "idle" && status !== "error";

  const handleToggle = useCallback(() => {
    if (active) {
      stop();
      journalRef.current("guest", "voice_stopped", "Guest ended the voice session");
      return;
    }
    journalRef.current("guest", "voice_started", "Microphone requested; no audio is recorded");
    void start();
  }, [active, start, stop]);

  const confirmPending = useCallback(() => {
    if (!pending || !pending.field) return;
    const taskId = FIELD_TO_TASK[pending.field];
    const value = editedValue.trim();
    if (!taskId || value.length === 0) return;

    onValueConfirmed(taskId, pending.field, value);
    journalRef.current(
      "guest",
      "field_confirmed",
      `Guest confirmed the voice-proposed value for ${pending.field}`
    );
    resolveConfirmation(pending.id);
    setPending(null);
    setEditedValue("");
  }, [pending, editedValue, onValueConfirmed, resolveConfirmation]);

  const discardPending = useCallback(() => {
    if (!pending) return;
    journalRef.current(
      "guest",
      "field_proposal_discarded",
      `Guest discarded the voice-proposed value for ${pending.field ?? "a field"}`
    );
    resolveConfirmation(pending.id);
    setPending(null);
    setEditedValue("");
  }, [pending, resolveConfirmation]);

  const lastTurns = transcript.slice(-4);

  return (
    <div
      className="mt-3 rounded-xl bg-white p-3"
      style={{ border: `1px solid ${BORDER}` }}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[13px] font-semibold" style={{ color: NAVY }}>
            {statusLabel(status)}
          </p>
          <p className="mt-0.5 text-[12px]" style={{ color: MUTED }}>
            {statusHint(status)}
          </p>
        </div>
        <button
          type="button"
          onClick={handleToggle}
          className="rounded-full px-5 py-2.5 text-[13px] font-bold text-white"
          style={{ background: active ? GOLD : NAVY, minHeight: 44 }}
        >
          {active ? "Stop" : "Tap to speak"}
        </button>
      </div>

      {active && (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={interrupt}
            className="rounded-lg px-3 py-2 text-[12px] font-semibold"
            style={{ border: `1px solid ${BORDER}`, color: NAVY, minHeight: 40 }}
          >
            Stop speaking
          </button>
          <button
            type="button"
            onClick={() => {
              stop();
              onSwitchToTyping();
            }}
            className="rounded-lg px-3 py-2 text-[12px] font-semibold"
            style={{ border: `1px solid ${BORDER}`, color: NAVY, minHeight: 40 }}
          >
            Switch to typing
          </button>
        </div>
      )}

      {errorMessage && (
        <p
          role="alert"
          className="mt-3 rounded-lg bg-[#FDECEA] px-3 py-2 text-[12px] font-medium text-[#B3261E]"
        >
          {errorMessage}
        </p>
      )}

      {lastTurns.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {lastTurns.map((entry) => (
            <p
              key={entry.id}
              className="text-[12px] leading-5"
              style={{ color: entry.final ? NAVY : MUTED }}
            >
              <span className="font-semibold">
                {entry.role === "user" ? "You: " : "Assistant: "}
              </span>
              {entry.text}
            </p>
          ))}
        </div>
      )}

      {pending && (
        <div
          className="mt-3 rounded-lg p-3"
          style={{ border: `1px solid ${GOLD}`, background: "#FFFBF3" }}
        >
          <p className="text-[12px] font-semibold" style={{ color: NAVY }}>
            Check this before we save it
          </p>
          <label
            htmlFor="voice-proposed-value"
            className="mt-2 block text-[11px] uppercase tracking-wide"
            style={{ color: MUTED }}
          >
            {pending.field}
          </label>
          <input
            id="voice-proposed-value"
            value={editedValue}
            onChange={(event) => setEditedValue(event.target.value)}
            className="mt-1 w-full rounded-lg px-3 py-2 text-[14px]"
            style={{ border: `1px solid ${BORDER}`, color: NAVY, minHeight: 44 }}
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={confirmPending}
              disabled={editedValue.trim().length === 0}
              className="rounded-lg px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50"
              style={{ background: NAVY, minHeight: 44 }}
            >
              That&apos;s right
            </button>
            <button
              type="button"
              onClick={discardPending}
              className="rounded-lg px-4 py-2 text-[13px] font-semibold"
              style={{ border: `1px solid ${BORDER}`, color: NAVY, minHeight: 44 }}
            >
              Discard
            </button>
          </div>
          {!FIELD_TO_TASK[pending.field ?? ""] && (
            <p className="mt-2 text-[11px]" style={{ color: "#B3261E" }}>
              This value is not one the assistant can save by voice. Please use the form.
            </p>
          )}
        </div>
      )}

      <p className="mt-3 text-[11px] leading-4" style={{ color: MUTED }}>
        Nothing is recorded. Voice can suggest your name, email, phone, and party size - you
        confirm each one before it is saved. Legal details and payment are never taken by voice.
        Current step: {currentTaskId}.
      </p>
    </div>
  );
}

function statusLabel(status: string): string {
  if (status === "connecting") return "Connecting";
  if (status === "listening") return "Listening";
  if (status === "thinking") return "Thinking";
  if (status === "speaking") return "Speaking";
  if (status === "interrupted") return "Stopped";
  if (status === "reconnecting") return "Reconnecting";
  if (status === "error") return "Voice unavailable";
  return "Voice ready";
}

function statusHint(status: string): string {
  if (status === "connecting") return "Setting up a secure session.";
  if (status === "listening") return "Go ahead - answer in your own words.";
  if (status === "thinking") return "Working on that.";
  if (status === "speaking") return "Interrupt any time.";
  if (status === "interrupted") return "Carry on whenever you are ready.";
  if (status === "reconnecting") return "The connection dropped; trying again.";
  if (status === "error") return "You can keep going by typing - nothing is lost.";
  return "Tap to answer this step by speaking.";
}
