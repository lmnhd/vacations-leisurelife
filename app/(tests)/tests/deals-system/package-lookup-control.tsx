"use client";

import { useState } from "react";

interface LookupResult {
  ok: boolean;
  command: string;
  startedAtIso: string;
  finishedAtIso: string;
  durationMs: number;
  exitCode: number | string;
  message?: string;
  stdout: string;
  stderr: string;
}

function formatDuration(ms?: number) {
  if (typeof ms !== "number") return "";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function inputClassName() {
  return "h-10 rounded-lg border border-white/10 bg-black/25 px-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300/60";
}

export function PackageLookupControl() {
  const [line, setLine] = useState("");
  const [ship, setShip] = useState("");
  const [date, setDate] = useState("");
  const [nights, setNights] = useState("");
  const [destination, setDestination] = useState("");
  const [port, setPort] = useState("");
  const [windowDays, setWindowDays] = useState("7");
  const [buildLink, setBuildLink] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<LookupResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runLookup() {
    setRunning(true);
    setResult(null);
    setError(null);
    try {
      const response = await fetch("/api/tests/deals-system/lookup-package", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          line,
          ship,
          date,
          nights,
          destination,
          port,
          windowDays,
          buildLink,
        }),
      });
      const payload = (await response.json()) as LookupResult | { error?: string };
      if (!response.ok || !("ok" in payload)) {
        throw new Error("error" in payload && payload.error ? payload.error : "Lookup failed.");
      }
      setResult(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
          Package lookup
        </p>
        <p className="mt-1 text-sm text-slate-400">
          Run the existing Odysseus package lookup from cruise facts. This is read-only; checking
          build link asks the Link Broker to construct the best available link from the match.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <input
          className={inputClassName()}
          value={line}
          onChange={(event) => setLine(event.target.value)}
          placeholder="Cruise line, e.g. Celebrity"
        />
        <input
          className={inputClassName()}
          value={ship}
          onChange={(event) => setShip(event.target.value)}
          placeholder="Ship, e.g. Celebrity Apex"
        />
        <input
          className={inputClassName()}
          value={date}
          onChange={(event) => setDate(event.target.value)}
          placeholder="Sail date, YYYY-MM-DD"
        />
        <input
          className={inputClassName()}
          value={nights}
          onChange={(event) => setNights(event.target.value)}
          placeholder="Nights"
        />
        <input
          className={inputClassName()}
          value={destination}
          onChange={(event) => setDestination(event.target.value)}
          placeholder="Destination"
        />
        <input
          className={inputClassName()}
          value={port}
          onChange={(event) => setPort(event.target.value)}
          placeholder="Departure port"
        />
        <input
          className={inputClassName()}
          value={windowDays}
          onChange={(event) => setWindowDays(event.target.value)}
          placeholder="Search window days"
        />
        <label className="flex h-10 items-center gap-2 rounded-lg border border-white/10 bg-black/25 px-3 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={buildLink}
            onChange={(event) => setBuildLink(event.target.checked)}
            className="h-4 w-4 accent-cyan-400"
          />
          Build broker link
        </label>
      </div>

      <button
        type="button"
        disabled={running}
        onClick={() => void runLookup()}
        className="inline-flex h-11 items-center justify-center rounded-xl border border-cyan-300/40 bg-cyan-400/10 px-5 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-400/20 disabled:cursor-wait disabled:opacity-60"
      >
        {running ? "Running lookup..." : "Run package lookup"}
      </button>

      {error && (
        <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-100">
          {error}
        </div>
      )}

      {result && (
        <div className="rounded-xl border border-white/10 bg-black/40">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-white">Package lookup result</p>
              <p className="break-all text-xs text-slate-500">{result.command}</p>
              <p className="text-xs text-slate-500">
                Exit {String(result.exitCode)} | {formatDuration(result.durationMs)}
              </p>
            </div>
            <span
              className={`rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] ${
                result.ok
                  ? "border-emerald-400/35 bg-emerald-500/10 text-emerald-200"
                  : "border-rose-400/35 bg-rose-500/10 text-rose-200"
              }`}
            >
              {result.ok ? "complete" : "failed"}
            </span>
          </div>
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
