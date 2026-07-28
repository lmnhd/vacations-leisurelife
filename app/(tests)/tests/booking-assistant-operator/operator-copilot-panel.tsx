"use client";

import { useEffect, useState } from "react";

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

  useEffect(() => {
    setResult(null);
    setHistory([]);
    setError(null);
  }, [activeDraftId]);

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

  return (
    <section className="mb-6 rounded-xl border border-sky-800/70 bg-gradient-to-br from-slate-900 via-slate-900 to-sky-950/40 p-3 shadow-lg shadow-sky-950/20">
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

      <div className={expanded ? "block" : "hidden"}>
      <div className="mt-4 flex flex-col gap-2 md:flex-row">
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

      <div className="mt-3 flex flex-wrap gap-2">
        {QUICK_QUESTIONS.map((quickQuestion) => (
          <button
            key={quickQuestion}
            type="button"
            disabled={loading}
            onClick={() => void ask(quickQuestion)}
            className="rounded-full border border-slate-700 bg-slate-950/70 px-3 py-1.5 text-xs text-slate-300 hover:border-sky-600 hover:text-white disabled:opacity-50"
          >
            {quickQuestion}
          </button>
        ))}
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
