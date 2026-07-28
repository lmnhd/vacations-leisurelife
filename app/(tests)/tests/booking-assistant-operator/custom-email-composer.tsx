"use client";

import { forwardRef, useImperativeHandle, useRef, useState } from "react";

export interface CustomEmailComposerHandle {
  /** Seed the compose box (e.g. from a Copilot answer) and scroll it into view. */
  seed: (draft: { subject?: string; body: string }) => void;
}

interface SendResult {
  delivered: boolean;
  journalEventId: string;
}

interface PolishResult {
  subject: string;
  body: string;
  model: string;
}

interface SavedDraft {
  subject: string;
  body: string;
}

/**
 * Operator compose box for sending an ad-hoc, operator-authored email to the
 * selected guest. Also seeded from the Live Call Copilot's "Send to guest"
 * action. The operator always reviews/edits before sending.
 *
 * Sends via POST /api/booking-assistant/custom-email, which enforces operator
 * auth, redaction, and consent server-side.
 */
export const CustomEmailComposer = forwardRef<
  CustomEmailComposerHandle,
  {
    activeDraftId: string | null;
    onLog?: (message: string) => void;
  }
>(function CustomEmailComposer({ activeDraftId, onLog }, ref) {
  const [expanded, setExpanded] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [source, setSource] = useState<"operator_compose" | "copilot_draft" | "copilot_polished">("operator_compose");
  const [loading, setLoading] = useState(false);
  const [polishing, setPolishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [originalDraft, setOriginalDraft] = useState<SavedDraft | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const subjectRef = useRef<HTMLInputElement | null>(null);

  useImperativeHandle(ref, () => ({
    seed(draft) {
      if (draft.subject !== undefined) setSubject(draft.subject);
      setBody(draft.body);
      setSource("copilot_draft");
      setOriginalDraft(null);
      setNotice(null);
      setError(null);
      setExpanded(true);
      containerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      // Focus the subject so the operator reviews before sending.
      window.setTimeout(() => subjectRef.current?.focus(), 300);
    },
  }));

  async function send(): Promise<void> {
    if (!activeDraftId || loading) return;
    if (subject.trim().length < 2 || body.trim().length < 2) return;
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/booking-assistant/custom-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draftId: activeDraftId,
          subject: subject.trim(),
          body: body.trim(),
          source,
        }),
      });
      const payload = (await response.json()) as {
        success: boolean;
        result?: SendResult;
        error?: string;
      };
      if (!response.ok || !payload.success || !payload.result) {
        throw new Error(payload.error ?? "The email could not be sent.");
      }
      setNotice(
        payload.result.delivered
          ? "Email sent to the guest."
          : "Recorded, but the email transport did not confirm delivery. Check Klaviyo."
      );
      onLog?.(
        `Custom email ${payload.result.delivered ? "sent" : "recorded (delivery unconfirmed)"} (${source})`
      );
      setSubject("");
      setBody("");
      setSource("operator_compose");
      setOriginalDraft(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The email could not be sent.");
    } finally {
      setLoading(false);
    }
  }

  async function polish(): Promise<void> {
    if (!activeDraftId || loading || polishing) return;
    if (body.trim().length < 2) return;
    setPolishing(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/booking-assistant/custom-email/polish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draftId: activeDraftId,
          subject: subject.trim(),
          body: body.trim(),
        }),
      });
      const payload = (await response.json()) as {
        success: boolean;
        result?: PolishResult;
        error?: string;
      };
      if (!response.ok || !payload.success || !payload.result) {
        throw new Error(payload.error ?? "The email could not be rewritten.");
      }
      setOriginalDraft({ subject, body });
      setSubject(payload.result.subject);
      setBody(payload.result.body);
      setSource("copilot_polished");
      setNotice("Rewritten for the guest. Review and edit it before sending.");
      onLog?.(`Custom email polished for guest (${payload.result.model})`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The email could not be rewritten.");
    } finally {
      setPolishing(false);
    }
  }

  function restoreOriginalDraft(): void {
    if (!originalDraft) return;
    setSubject(originalDraft.subject);
    setBody(originalDraft.body);
    setSource("copilot_draft");
    setOriginalDraft(null);
    setNotice("Original research draft restored.");
  }

  const sendDisabled =
    !activeDraftId || loading || subject.trim().length < 2 || body.trim().length < 2;
  const polishDisabled = !activeDraftId || loading || polishing || body.trim().length < 2;

  return (
    <section
      ref={containerRef}
      className="mb-6 rounded-xl border border-emerald-800/60 bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950/30 p-3 shadow-lg shadow-emerald-950/20"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
            Send Custom Email
          </p>
          <h2 className="mt-1 text-base font-bold text-white">Email this guest a special message</h2>
          <p className="mt-1 max-w-3xl text-xs text-slate-400">
            Send an operator-reviewed message from the Leisure Life email sender to the guest&apos;s
            saved address. Start with a quick idea or use the Copilot&apos;s &ldquo;Send to guest&rdquo;
            button, then polish, review, and send it.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${
              activeDraftId
                ? "border-emerald-700 bg-emerald-950/50 text-emerald-300"
                : "border-amber-700 bg-amber-950/50 text-amber-300"
            }`}
          >
            {activeDraftId ? "Guest selected" : "Select a queue card first"}
          </div>
          <button
            type="button"
            onClick={() => setExpanded((current) => !current)}
            aria-expanded={expanded}
            className="rounded border border-emerald-800 bg-slate-950 px-3 py-1 text-xs font-semibold text-emerald-200 hover:border-emerald-500 hover:text-white"
          >
            {expanded ? "Collapse" : "Compose email"}
          </button>
        </div>
      </div>

      {!expanded && (
        <p className="mt-2 text-xs text-slate-500">Open when you need to send an approved, operator-reviewed message.</p>
      )}

      <div className={expanded ? "mt-4 space-y-3" : "hidden"}>
        <input
          ref={subjectRef}
          type="text"
          value={subject}
          onChange={(event) => {
            setSubject(event.target.value);
            setSource("operator_compose");
            setOriginalDraft(null);
          }}
          maxLength={200}
          placeholder="Subject (e.g. Flight options to Miami for your Aug 22 sailing)"
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-emerald-500"
        />
        <textarea
          value={body}
          onChange={(event) => {
            setBody(event.target.value);
            setSource("operator_compose");
            setOriginalDraft(null);
          }}
          rows={8}
          maxLength={8000}
          placeholder="Type a quick idea, your message, or seed this from a Copilot answer."
          className="min-h-40 w-full resize-y rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-sm leading-6 text-slate-100 outline-none placeholder:text-slate-600 focus:border-emerald-500"
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] text-slate-500">
              Polish turns raw research or a quick idea into a guest-ready draft and removes internal guidance and citations.
            </p>
            <p className="mt-1 text-[11px] text-slate-500">
              Never type card, identity, or proof details - they are rejected before sending.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {originalDraft && (
              <button
                type="button"
                onClick={restoreOriginalDraft}
                disabled={loading || polishing}
                className="rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-sm font-semibold text-slate-200 hover:border-slate-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                Restore research draft
              </button>
            )}
            <button
              type="button"
              onClick={() => void polish()}
              disabled={polishDisabled}
              className="rounded-lg border border-sky-700 bg-sky-950/50 px-4 py-3 text-sm font-bold text-sky-200 hover:border-sky-400 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {polishing ? "Polishing..." : "Polish for guest"}
            </button>
            <button
              type="button"
              onClick={() => void send()}
              disabled={sendDisabled || polishing}
              className="rounded-lg bg-emerald-600 px-6 py-3 text-sm font-bold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Sending..." : "Send to guest"}
            </button>
          </div>
        </div>
      </div>

      {expanded && error && (
        <p className="mt-4 rounded-lg border border-red-800 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      )}
      {expanded && notice && (
        <p className="mt-4 rounded-lg border border-emerald-800 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-200">
          {notice}
        </p>
      )}
    </section>
  );
});
