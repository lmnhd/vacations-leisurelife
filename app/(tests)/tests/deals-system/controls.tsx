"use client";

import { useState } from "react";

import type { DealsSystemOperatorAction } from "@/lib/cb/deals-system/operator-actions";

interface RunResult {
  ok: boolean;
  action: DealsSystemOperatorAction;
  startedAtIso: string;
  finishedAtIso: string;
  durationMs: number;
  exitCode: number | string;
  message?: string;
  stdout: string;
  stderr: string;
}

function isRunResult(value: RunResult | { error?: string }): value is RunResult {
  return "ok" in value && "action" in value;
}

function formatDuration(ms?: number) {
  if (typeof ms !== "number") return "";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function DealsSystemControls({
  actions,
}: {
  actions: DealsSystemOperatorAction[];
}) {
  const [runningId, setRunningId] = useState<string | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runAction(actionId: string) {
    setRunningId(actionId);
    setError(null);
    setResult(null);
    try {
      const response = await fetch("/api/tests/deals-system/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ actionId }),
      });
      const payload = (await response.json()) as RunResult | { error?: string };
      if (!response.ok || !isRunResult(payload)) {
        throw new Error("error" in payload && payload.error ? payload.error : `Runner returned ${response.status}`);
      }
      setResult(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunningId(null);
    }
  }

  const safeTests = actions.filter((action) => action.category === "safe_test");
  const dataRefreshActions = actions.filter((action) => action.category === "data_refresh");

  function renderActionGrid(items: DealsSystemOperatorAction[]) {
    return (
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {items.map((action) => {
          const running = runningId === action.id;
          const disabled = runningId !== null;
          return (
            <button
              key={action.id}
              type="button"
              disabled={disabled}
              onClick={() => void runAction(action.id)}
              className="rounded-xl border border-white/10 bg-white/[0.035] p-4 text-left transition hover:border-cyan-300/50 hover:bg-cyan-400/10 disabled:cursor-wait disabled:opacity-60"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">{action.label}</p>
                  <p className="mt-1 text-xs text-slate-400">{action.description}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {action.writesCache && (
                      <span className="rounded-full border border-amber-400/35 bg-amber-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-amber-200">
                        writes cache
                      </span>
                    )}
                    {action.requiresPortalSession && (
                      <span className="rounded-full border border-sky-400/35 bg-sky-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-sky-200">
                        CBAT session
                      </span>
                    )}
                    {action.usesLlm && (
                      <span className="rounded-full border border-violet-400/35 bg-violet-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-violet-200">
                        uses LLM
                      </span>
                    )}
                  </div>
                </div>
                <span className="shrink-0 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-200">
                  {running ? "running" : "run"}
                </span>
              </div>
              <code className="mt-3 block rounded-lg bg-black/30 px-3 py-2 text-xs text-slate-300">
                npm run {action.npmScript}
              </code>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
            Safe validation
          </p>
          <p className="mt-1 text-sm text-slate-400">
            Deterministic checks only. These do not run build, scrape CBAT, or write cache files.
          </p>
        </div>
        {renderActionGrid(safeTests)}
      </div>

      <div className="space-y-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
            Pipeline actions
          </p>
          <p className="mt-1 text-sm text-slate-400">
            These update local Deals data. Run them intentionally, then reload the dashboard to
            inspect the refreshed cache state.
          </p>
        </div>
        {renderActionGrid(dataRefreshActions)}
      </div>

      {error && (
        <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-100">
          {error}
        </div>
      )}

      {result && (
        <div className="rounded-xl border border-white/10 bg-black/40">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-white">{result.action.label}</p>
              <p className="text-xs text-slate-500">
                Exit {String(result.exitCode)} | {formatDuration(result.durationMs)} | finished{" "}
                {new Date(result.finishedAtIso).toLocaleString()}
              </p>
            </div>
            <span
              className={`rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] ${
                result.ok
                  ? "border-emerald-400/35 bg-emerald-500/10 text-emerald-200"
                  : "border-rose-400/35 bg-rose-500/10 text-rose-200"
              }`}
            >
              {result.ok ? "passed" : "failed"}
            </span>
          </div>
          {result.action.writesCache && (
            <div className="border-b border-white/10 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              This action can change local cache files. Refresh the dashboard after reviewing the
              output to see the latest cache counts and readiness gates.
            </div>
          )}
          {result.message && (
            <div className="border-b border-white/10 px-4 py-3 text-sm text-amber-100">
              {result.message}
            </div>
          )}
          <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap p-4 text-xs leading-5 text-slate-200">
            {[result.stdout, result.stderr].filter(Boolean).join("\n")}
          </pre>
        </div>
      )}
    </div>
  );
}
