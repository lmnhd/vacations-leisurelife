"use client";

import { useState, useCallback, useEffect } from "react";

interface CallChecklistProps {
  draftId: string;
  onClaim: () => Promise<void>;
  onProcessing: () => Promise<void>;
  onOutcome: (outcome: string, notes: string) => Promise<void>;
  claimLoading: boolean;
  processingLoading: boolean;
  outcomeLoading: boolean;
  verified: boolean;
  claimed: boolean;
  revealed: boolean;
  processing: boolean;
  completed: boolean;
}

interface ChecklistStep {
  id: string;
  label: string;
  description: string;
  phase: "pre_call" | "on_call" | "post_call";
}

const STEPS: ChecklistStep[] = [
  { id: "verify", label: "Verify caller identity", description: "Confirm the caller is the guest — caller ID is NOT authentication. Use approved verification procedure.", phase: "pre_call" },
  { id: "claim", label: "Claim the draft", description: "Atomically claim the draft to prevent other operators from working it simultaneously. Claiming unlocks the guest packet.", phase: "pre_call" },
  { id: "reveal", label: "Reveal guest packet", description: "After claiming, decrypt and review the guest's contact info, travelers, and preferences in the Packet Reveal panel.", phase: "pre_call" },
  { id: "start_processing", label: "Start agent processing", description: "Mark the draft as being actively worked. This transitions to agent_processing status.", phase: "pre_call" },
  { id: "open_odysseus", label: "Open fresh Odysseus session", description: "Start a new live cruise booking session. Do NOT reuse a prior session or brn.", phase: "on_call" },
  { id: "recheck_price", label: "Recheck price & availability", description: "Verify live price, cabin availability, taxes/fees, and qualifying rates with the caller.", phase: "on_call" },
  { id: "enter_info", label: "Enter guest information in Odysseus", description: "Manually enter saved traveler details, contact info, and preferences into the booking system.", phase: "on_call" },
  { id: "review_choices", label: "Review choices with caller", description: "Confirm exact rate, cabin, add-ons, insurance, payment amount/schedule, and terms. Get explicit approval.", phase: "on_call" },
  { id: "take_payment", label: "Take payment by phone", description: "Caller provides card info — enter ONLY in Odysseus. NEVER record card data in Leisure Life systems.", phase: "on_call" },
  { id: "submit_booking", label: "Submit booking in Odysseus", description: "Perform the official payment/reservation submit in the cruise booking system.", phase: "on_call" },
  { id: "record_outcome", label: "Record call outcome", description: "Log the result — confirmed, pending reconciliation, payment failed, declined, etc.", phase: "post_call" },
];

const PHASE_LABELS: Record<string, string> = {
  pre_call: "Before the Call",
  on_call: "During the Call",
  post_call: "After the Call",
};

const OUTCOME_OPTIONS = [
  { value: "confirmed", label: "Confirmed — booking completed", color: "bg-emerald-600 hover:bg-emerald-500" },
  { value: "completed_pending_reconciliation", label: "Completed — pending reconciliation", color: "bg-amber-600 hover:bg-amber-500" },
  { value: "payment_failed", label: "Payment failed", color: "bg-red-600 hover:bg-red-500" },
  { value: "declined", label: "Card declined", color: "bg-red-600 hover:bg-red-500" },
  { value: "needs_guest_decision", label: "Needs a guest decision", color: "bg-sky-600 hover:bg-sky-500" },
  { value: "material_change", label: "Unavailable / material change", color: "bg-orange-600 hover:bg-orange-500" },
  { value: "disconnected_call_back", label: "Disconnected — will call back", color: "bg-amber-600 hover:bg-amber-500" },
  { value: "no_call_received", label: "No call received", color: "bg-slate-600 hover:bg-slate-500" },
];

export function CallChecklist({
  draftId,
  onClaim,
  onProcessing,
  onOutcome,
  claimLoading,
  processingLoading,
  outcomeLoading,
  verified,
  claimed,
  revealed,
  processing,
  completed,
}: CallChecklistProps) {
  const [checkedSteps, setCheckedSteps] = useState<Set<string>>(new Set());
  const [selectedOutcome, setSelectedOutcome] = useState("confirmed");
  const [outcomeNotes, setOutcomeNotes] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  // Keep the action-step checkboxes in sync with the real draft state. This
  // makes selecting an already-claimed / in-progress draft show the correct
  // checkmarks instead of empty boxes, and never lets a box drift out of line
  // with what the backend has actually recorded.
  useEffect(() => {
    setCheckedSteps((prev) => {
      const next = new Set(prev);
      const sync = (id: string, on: boolean) => {
        if (on) next.add(id);
        else next.delete(id);
      };
      sync("verify", verified);
      sync("claim", claimed);
      sync("reveal", revealed);
      sync("start_processing", processing);
      sync("record_outcome", completed);
      return next;
    });
  }, [verified, claimed, revealed, processing, completed]);

  // Reset the manually-toggled on-call steps when switching drafts.
  useEffect(() => {
    setCheckedSteps((prev) => {
      const next = new Set<string>();
      // Preserve derived action steps; the effect above re-syncs them anyway.
      for (const id of ["verify", "claim", "reveal", "start_processing", "record_outcome"]) {
        if (prev.has(id)) next.add(id);
      }
      return next;
    });
    setActionError(null);
  }, [draftId]);

  const toggleStep = useCallback((id: string) => {
    setCheckedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleClaim = useCallback(async () => {
    setActionError(null);
    try {
      // Checkbox flips via the state-sync effect once `claimed` turns true.
      await onClaim();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Claim failed");
    }
  }, [onClaim]);

  const handleProcessing = useCallback(async () => {
    setActionError(null);
    try {
      // Checkbox flips via the state-sync effect once `processing` turns true.
      await onProcessing();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Processing start failed");
    }
  }, [onProcessing]);

  const handleOutcome = useCallback(async () => {
    setActionError(null);
    try {
      // Checkbox flips via the state-sync effect once `completed` turns true.
      await onOutcome(selectedOutcome, outcomeNotes);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Outcome recording failed");
    }
  }, [onOutcome, selectedOutcome, outcomeNotes]);

  const phases = ["pre_call", "on_call", "post_call"] as const;

  return (
    <div className="space-y-4">
      <div className="bg-slate-900 rounded-lg border border-slate-800 p-4">
        <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wide mb-1">Booking Call Checklist</h3>
        <p className="text-[11px] text-slate-500 mb-4">Follow these steps in order. Check off each step as you complete it.</p>
        {actionError && <p className="mb-3 text-[11px] text-rose-300">Action failed: {actionError}</p>}

        {phases.map((phase) => {
          const phaseSteps = STEPS.filter((s) => s.phase === phase);
          return (
            <div key={phase} className="mb-4 last:mb-0">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 border-b border-slate-800 pb-1">
                {PHASE_LABELS[phase]}
              </div>
              <div className="space-y-2">
                {phaseSteps.map((step) => {
                  const isChecked = checkedSteps.has(step.id);
                  // Steps whose completion is derived from real draft state — not
                  // manually toggleable, so their boxes can never drift out of line.
                  const isActionStep =
                    step.id === "verify" ||
                    step.id === "claim" ||
                    step.id === "reveal" ||
                    step.id === "start_processing" ||
                    step.id === "record_outcome";

                  return (
                    <div
                      key={step.id}
                      className={`p-2.5 rounded border transition-colors ${
                        isChecked
                          ? "border-emerald-800/50 bg-emerald-950/20"
                          : "border-slate-800 bg-slate-950/30"
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <button
                          onClick={() => !isActionStep && toggleStep(step.id)}
                          disabled={isActionStep}
                          className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                            isChecked
                              ? "bg-emerald-600 border-emerald-600 text-white"
                              : "border-slate-600 hover:border-slate-500"
                          } ${isActionStep ? "cursor-default" : "cursor-pointer"}`}
                        >
                          {isChecked && <span className="text-[10px]">✓</span>}
                        </button>
                        <div className="flex-1 min-w-0">
                          <div className={`text-xs font-medium ${isChecked ? "text-slate-400 line-through" : "text-slate-200"}`}>
                            {step.label}
                          </div>
                          <div className="text-[10px] text-slate-500 mt-0.5">{step.description}</div>

                          {step.id === "verify" && verified && (
                            <span className="mt-1 inline-block text-[10px] text-emerald-400">✓ Caller verified</span>
                          )}

                          {step.id === "claim" && !claimed && (
                            <button
                              onClick={handleClaim}
                              disabled={claimLoading || !verified}
                              className="mt-2 px-3 py-1 text-[11px] bg-amber-600 hover:bg-amber-500 disabled:opacity-50 rounded text-white font-medium"
                            >
                              {claimLoading ? "Claiming..." : "Claim Draft"}
                            </button>
                          )}
                          {step.id === "claim" && !claimed && !verified && (
                            <p className="mt-1 text-[10px] text-slate-500">Verify the caller first.</p>
                          )}
                          {step.id === "claim" && claimed && (
                            <span className="mt-1 inline-block text-[10px] text-emerald-400">✓ Draft claimed</span>
                          )}

                          {step.id === "reveal" && !revealed && !claimed && (
                            <p className="mt-1 text-[10px] text-slate-500">Claim the draft to unlock the packet.</p>
                          )}
                          {step.id === "reveal" && !revealed && claimed && (
                            <p className="mt-1 text-[10px] text-purple-300">Use “Reveal Full Packet” in the Packet Reveal panel.</p>
                          )}
                          {step.id === "reveal" && revealed && (
                            <span className="mt-1 inline-block text-[10px] text-emerald-400">✓ Packet revealed</span>
                          )}

                          {step.id === "start_processing" && claimed && !processing && (
                            <button
                              onClick={handleProcessing}
                              disabled={processingLoading}
                              className="mt-2 px-3 py-1 text-[11px] bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded text-white font-medium"
                            >
                              {processingLoading ? "Starting..." : "Start Processing"}
                            </button>
                          )}
                          {step.id === "start_processing" && processing && (
                            <span className="mt-1 inline-block text-[10px] text-indigo-400">✓ Processing started</span>
                          )}

                          {step.id === "record_outcome" && processing && !completed && (
                            <div className="mt-2 space-y-2">
                              <select
                                value={selectedOutcome}
                                onChange={(e) => setSelectedOutcome(e.target.value)}
                                className="w-full px-2 py-1 text-[11px] bg-slate-950 border border-slate-700 rounded text-slate-100 focus:border-sky-500 focus:outline-none"
                              >
                                {OUTCOME_OPTIONS.map((o) => (
                                  <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                              </select>
                              <textarea
                                value={outcomeNotes}
                                onChange={(e) => setOutcomeNotes(e.target.value)}
                                rows={2}
                                placeholder="Outcome notes (booking ref, issues, etc.)"
                                className="w-full px-2 py-1 text-[11px] bg-slate-950 border border-slate-700 rounded text-slate-100 focus:border-sky-500 focus:outline-none"
                              />
                              <button
                                onClick={handleOutcome}
                                disabled={outcomeLoading}
                                className={`w-full px-3 py-1.5 text-[11px] text-white font-medium rounded disabled:opacity-50 ${OUTCOME_OPTIONS.find((o) => o.value === selectedOutcome)?.color ?? "bg-slate-600"}`}
                              >
                                {outcomeLoading ? "Recording..." : "Record Outcome"}
                              </button>
                            </div>
                          )}
                          {step.id === "record_outcome" && completed && (
                            <span className="mt-1 inline-block text-[10px] text-emerald-400">✓ Outcome recorded</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-red-950/30 rounded-lg border border-red-900/40 p-3">
        <p className="text-[10px] text-red-300 font-medium">
          ⚠ Payment data must NEVER be entered in Leisure Life systems. Card info goes only into Odysseus via the approved Cruise Brothers procedure.
        </p>
      </div>
    </div>
  );
}
