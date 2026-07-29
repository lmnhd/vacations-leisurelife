"use client";

import { useEffect, useRef, useState } from "react";

interface CopilotSource {
  title: string;
  url: string;
}

interface CopilotResponse {
  answer: string;
  model: string;
  sources: CopilotSource[];
  toolsUsed: string[];
  sailingContext?: {
    cruiseLine: string;
    ship: string;
    sailingDateIso: string;
    nights: number;
  };
}

const QUICK_QUESTIONS = [
  "What should I tell this guest about travel insurance for their state?",
  "What are the deposit, cancellation, and refund rules for this sailing?",
  "What flight information should I give this guest?",
  "Find the best replacement cruises close to this sailing.",
];

/**
 * Saved questions live in localStorage, not DynamoDB: they are operator UI
 * convenience for this one local console, carry no guest data, and should not
 * cost a round trip to open the menu. Questions accumulate as they are asked,
 * so the list grows into a personal shortcut set over time.
 */
const SAVED_QUESTIONS_STORAGE_KEY = "lll.operator-copilot.saved-questions";
const MAX_SAVED_QUESTIONS = 50;

function readSavedQuestions(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SAVED_QUESTIONS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is string => typeof entry === "string");
  } catch {
    // A corrupt or unavailable store must never break the copilot.
    return [];
  }
}

function writeSavedQuestions(questions: string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SAVED_QUESTIONS_STORAGE_KEY, JSON.stringify(questions));
  } catch {
    // Private mode / quota — the in-memory list still works for this session.
  }
}

const TOOL_LABELS: Record<string, string> = {
  inspect_current_booking_link: "Current supplier booking page",
  search_cruise_brothers_knowledge: "CB Agent Tools knowledge",
  search_live_cruises: "Live Odysseus inventory",
  calculate_cruise_cost: "Cruise cost calculator",
};

export function OperatorCopilotPanel({
  activeDraftId,
  onSendToGuest,
}: {
  activeDraftId: string | null;
  onSendToGuest?: (draft: { subject?: string; body: string }) => void;
}) {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<CopilotResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [history, setHistory] = useState<Array<{
    role: "operator" | "assistant";
    content: string;
  }>>([]);
  const [savedQuestions, setSavedQuestions] = useState<string[]>([]);
  const [questionMenuOpen, setQuestionMenuOpen] = useState(false);
  const questionMenuRef = useRef<HTMLDivElement | null>(null);

  // Read on mount rather than in useState's initializer: localStorage is not
  // available during the server render, and seeding state from it directly
  // would desync hydration.
  useEffect(() => {
    setSavedQuestions(readSavedQuestions());
  }, []);

  useEffect(() => {
    setResult(null);
    setHistory([]);
    setError(null);
  }, [activeDraftId]);

  // Close the menu on outside click or Escape, so it never sits open over the
  // console while the operator is working the rest of the page.
  useEffect(() => {
    if (!questionMenuOpen) return;
    function onPointerDown(event: MouseEvent): void {
      if (!questionMenuRef.current?.contains(event.target as Node)) {
        setQuestionMenuOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") setQuestionMenuOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [questionMenuOpen]);

  function saveQuestion(value: string): void {
    const trimmed = value.trim();
    if (trimmed.length < 2) return;
    // Presets are always listed, so saving them again would only duplicate.
    if (QUICK_QUESTIONS.includes(trimmed)) return;
    setSavedQuestions((current) => {
      // Most recent first, de-duplicated case-insensitively so re-asking a
      // question promotes it rather than adding a near-identical twin.
      const withoutDuplicate = current.filter(
        (entry) => entry.toLowerCase() !== trimmed.toLowerCase()
      );
      const next = [trimmed, ...withoutDuplicate].slice(0, MAX_SAVED_QUESTIONS);
      writeSavedQuestions(next);
      return next;
    });
  }

  function removeSavedQuestion(value: string): void {
    setSavedQuestions((current) => {
      const next = current.filter((entry) => entry !== value);
      writeSavedQuestions(next);
      return next;
    });
  }

  async function ask(questionOverride?: string): Promise<void> {
    const value = (questionOverride ?? question).trim();
    if (!value || loading) return;
    setQuestion(value);
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/booking-assistant/operator-copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: value,
          ...(activeDraftId ? { draftId: activeDraftId } : {}),
          history: history.slice(-8),
        }),
      });
      const payload = await response.json() as {
        success: boolean;
        result?: CopilotResponse;
        error?: string;
      };
      if (!response.ok || !payload.success || !payload.result) {
        throw new Error(payload.error ?? "The call copilot could not answer.");
      }
      setResult(payload.result);
      // Save only after a successful answer so failed or malformed questions
      // don't accumulate in the shortcut list.
      saveQuestion(value);
      setHistory((current) => [
        ...current,
        { role: "operator", content: value },
        { role: "assistant", content: payload.result!.answer },
      ].slice(-8) as Array<{ role: "operator" | "assistant"; content: string }>);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The call copilot could not answer.");
    } finally {
      setLoading(false);
    }
  }

  // Sticks below the fixed Test Lab header (h-14) so the copilot stays
  // reachable while the operator scrolls the console during a live call —
  // typically split-screened against the CB Agent Tools booking page.
  // z-40 keeps it under that header (z-50) but above the console content.
  // The gradient is opaque so scrolled content can't show through.
  return (
    <section className="sticky top-14 z-40 mb-6 rounded-xl border border-sky-800/70 bg-gradient-to-br from-slate-900 via-slate-900 to-sky-950/40 p-3 shadow-lg shadow-sky-950/20">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-300">Live Call Copilot</p>
          <h2 className="mt-1 text-base font-bold text-white">
            Ask about this cruise, policy, price, or an alternative
          </h2>
          <p className="mt-1 max-w-3xl text-xs text-slate-400">
            Uses the selected sailing, CB Agent Tools knowledge, live cruise inventory, and current web sources.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className={`rounded-full border px-3 py-1 text-xs font-semibold ${
            activeDraftId
              ? "border-emerald-700 bg-emerald-950/50 text-emerald-300"
              : "border-amber-700 bg-amber-950/50 text-amber-300"
          }`}>
            {activeDraftId ? "Current booking connected" : "Select a queue card for sailing context"}
          </div>
          <button
            type="button"
            onClick={() => setExpanded((current) => !current)}
            aria-expanded={expanded}
            className="rounded border border-sky-800 bg-slate-950 px-3 py-1 text-xs font-semibold text-sky-200 hover:border-sky-500 hover:text-white"
          >
            {expanded ? "Collapse" : "Open Copilot"}
          </button>
        </div>
      </div>

      {!expanded && (
        <p className="mt-2 text-xs text-slate-500">Open only when you need live research or a quick call answer.</p>
      )}

      {/* Expanded, this panel is tall enough to cover the console while stuck,
          so its body scrolls internally instead of pushing past the viewport. */}
      {/* Saved questions collapse into a menu so the panel stays compact when
          split-screened against the supplier booking page. Deliberately OUTSIDE
          the scrolling body below — an absolutely positioned dropdown would be
          clipped by that container's overflow. */}
      <div className={expanded ? "relative z-50 mt-3" : "hidden"} ref={questionMenuRef}>
        <button
          type="button"
          onClick={() => setQuestionMenuOpen((current) => !current)}
          aria-expanded={questionMenuOpen}
          aria-haspopup="listbox"
          className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:border-sky-600 hover:text-white"
        >
          Saved questions
          <span className="rounded-full bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">
            {QUICK_QUESTIONS.length + savedQuestions.length}
          </span>
          <span aria-hidden="true" className="text-[10px]">{questionMenuOpen ? "▲" : "▼"}</span>
        </button>

        {questionMenuOpen && (
          <div
            role="listbox"
            className="absolute left-0 z-50 mt-1 max-h-72 w-full max-w-2xl overflow-y-auto rounded-lg border border-slate-700 bg-slate-950 p-1 shadow-xl shadow-black/50"
          >
            {savedQuestions.length > 0 && (
              <p className="px-2 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Your saved questions
              </p>
            )}
            {savedQuestions.map((savedQuestion) => (
              <div key={savedQuestion} className="group flex items-center gap-1 rounded hover:bg-slate-900">
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  disabled={loading}
                  onClick={() => {
                    setQuestionMenuOpen(false);
                    void ask(savedQuestion);
                  }}
                  className="flex-1 truncate px-2 py-1.5 text-left text-xs text-slate-300 hover:text-white disabled:opacity-50"
                  title={savedQuestion}
                >
                  {savedQuestion}
                </button>
                <button
                  type="button"
                  onClick={() => removeSavedQuestion(savedQuestion)}
                  aria-label={`Remove saved question: ${savedQuestion}`}
                  title="Remove from saved questions"
                  className="mr-1 rounded px-1.5 py-0.5 text-xs text-slate-600 hover:bg-rose-950/60 hover:text-rose-300"
                >
                  ✕
                </button>
              </div>
            ))}

            <p className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Presets
            </p>
            {QUICK_QUESTIONS.map((quickQuestion) => (
              <button
                key={quickQuestion}
                type="button"
                role="option"
                aria-selected={false}
                disabled={loading}
                onClick={() => {
                  setQuestionMenuOpen(false);
                  void ask(quickQuestion);
                }}
                className="block w-full truncate rounded px-2 py-1.5 text-left text-xs text-slate-300 hover:bg-slate-900 hover:text-white disabled:opacity-50"
                title={quickQuestion}
              >
                {quickQuestion}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Expanded, this panel is tall enough to cover the console while stuck,
          so its body scrolls internally instead of pushing past the viewport. */}
      <div className={expanded ? "block max-h-[60vh] overflow-y-auto" : "hidden"}>
      <div className="mt-2 flex flex-col gap-2 md:flex-row">
        <textarea
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              void ask();
            }
          }}
          rows={3}
          placeholder="Example: How much is insurance for a Florida resident on this sailing?"
          className="min-h-24 flex-1 resize-y rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-sky-500"
        />
        <button
          type="button"
          onClick={() => void ask()}
          disabled={loading || question.trim().length < 2}
          className="rounded-lg bg-sky-600 px-6 py-3 text-sm font-bold text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50 md:w-40"
        >
          {loading ? "Researching..." : "Ask Copilot"}
        </button>
      </div>

      {error && (
        <p className="mt-4 rounded-lg border border-red-800 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      )}

      {result && (
        <div className="mt-5 rounded-xl border border-slate-700 bg-slate-950/70 p-5">
          {result.sailingContext && (
            <p className="mb-3 text-xs font-medium text-sky-300">
              Answering for {result.sailingContext.cruiseLine} {result.sailingContext.ship} -{" "}
              {result.sailingContext.nights} nights, sailing {result.sailingContext.sailingDateIso}
            </p>
          )}
          <div className="whitespace-pre-wrap text-sm leading-6 text-slate-100">{result.answer}</div>

          {onSendToGuest && activeDraftId && (
            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-800 pt-4">
              <button
                type="button"
                onClick={() =>
                  onSendToGuest({
                    subject: result.sailingContext
                      ? `About your ${result.sailingContext.cruiseLine} ${result.sailingContext.ship} sailing`
                      : undefined,
                    body: result.answer,
                  })
                }
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
              >
                Send this to guest as email
              </button>
              <span className="text-xs text-slate-500">
                Opens the compose box below with this answer — review and edit before sending.
              </span>
            </div>
          )}

          {(result.toolsUsed.length > 0 || result.sources.length > 0) && (
            <div className="mt-5 border-t border-slate-800 pt-4">
              {result.toolsUsed.length > 0 && (
                <p className="text-xs text-slate-500">
                  Checked: {result.toolsUsed.map((tool) => TOOL_LABELS[tool] ?? tool).join(", ")}
                </p>
              )}
              {result.sources.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Sources</p>
                  <ul className="mt-2 space-y-1 text-xs">
                    {result.sources.map((source) => (
                      <li key={source.url}>
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sky-300 underline decoration-sky-800 underline-offset-2 hover:text-sky-200"
                        >
                          {source.title || source.url}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <p className="mt-4 text-[11px] text-slate-500">
        Advisory only. Verify supplier terms before quoting; all holds, reservations, cancellations, and payments remain human-controlled.
        Do not type guest contact, identity, or payment details into the question.
      </p>
      </div>
    </section>
  );
}
