"use client";

import { useCallback, useEffect, useState } from "react";
import { CampaignSelector } from "../media-generation/campaign-selector";

interface SourceRow {
  slug: string;
  convertedOnly: boolean;
}

interface InviteResult {
  targetCampaignSlug: string;
  sources: Array<{ slug: string; convertedOnly?: boolean }>;
  uniqueRecipients: number;
  dispatched: number;
  skippedDuplicateRecipient: number;
  failed: number;
  failures: Array<{ email: string; sourceSlug: string; error: string }>;
}

export default function AlumniRebookingPage() {
  // Pre-populate target slug from `?slug=` when arriving from the hub.
  const [targetSlug, setTargetSlug] = useState(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("slug") ?? "";
  });

  const [sources, setSources] = useState<SourceRow[]>([{ slug: "", convertedOnly: true }]);
  const [pitch, setPitch] = useState("");
  const [alumniWindow, setAlumniWindow] = useState("");
  const [operatorNote, setOperatorNote] = useState("");
  const [dryRun, setDryRun] = useState(true);

  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<InviteResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Auto-clear stale result when inputs change.
  useEffect(() => {
    setResult(null);
    setError(null);
  }, [targetSlug, sources, pitch, alumniWindow, operatorNote, dryRun]);

  const updateSource = useCallback((idx: number, patch: Partial<SourceRow>) => {
    setSources((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }, []);

  const addSource = useCallback(() => {
    setSources((prev) => [...prev, { slug: "", convertedOnly: true }]);
  }, []);

  const removeSource = useCallback((idx: number) => {
    setSources((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const submit = useCallback(async () => {
    if (!targetSlug) {
      setError("Pick a target campaign first.");
      return;
    }
    const cleanSources = sources
      .map((s) => ({ slug: s.slug.trim(), convertedOnly: s.convertedOnly }))
      .filter((s) => s.slug.length > 0);
    if (cleanSources.length === 0) {
      setError("Add at least one source campaign.");
      return;
    }
    if (cleanSources.some((s) => s.slug === targetSlug)) {
      setError("A source cannot equal the target campaign.");
      return;
    }
    if (!dryRun && !confirm(`Send LIVE alumni invites for ${targetSlug} from ${cleanSources.length} source campaign(s)?`)) {
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/groups/campaign/${targetSlug}/alumni-invite`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sources: cleanSources,
          pitch: pitch.trim() || undefined,
          alumniWindow: alumniWindow.trim() || undefined,
          operatorNote: operatorNote.trim() || undefined,
          dryRun,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error ?? "Alumni invite failed.");
      } else {
        setResult(data.result as InviteResult);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Alumni invite failed.");
    } finally {
      setBusy(false);
    }
  }, [targetSlug, sources, pitch, alumniWindow, operatorNote, dryRun]);

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-white tracking-tight">Alumni Rebooking</h1>
        <p className="text-sm text-slate-400">
          Invite converted guests from past campaigns to a NEW campaign. Recipients are de-duplicated across sources,
          so a guest who sailed with us twice gets one email. The invite is ledger-stamped against the SOURCE
          campaign — each guest's history stays scoped to where they originally sailed.
        </p>
      </div>

      <section className="space-y-3 rounded-xl border border-white/10 bg-slate-900/60 p-5">
        <label className="text-xs font-semibold uppercase tracking-widest text-slate-400">Target campaign (the NEW sailing)</label>
        <CampaignSelector value={targetSlug} onChange={setTargetSlug} defaultFilter="all" />
      </section>

      <section className="space-y-3 rounded-xl border border-white/10 bg-slate-900/60 p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-violet-300">Source campaigns (past sailings)</h2>
          <button
            onClick={addSource}
            className="rounded-md border border-violet-500/40 bg-violet-500/10 px-3 py-1 text-xs text-violet-200 hover:bg-violet-500/20"
          >
            + Add source
          </button>
        </div>
        <div className="space-y-2">
          {sources.map((s, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <input
                value={s.slug}
                onChange={(e) => updateSource(i, { slug: e.target.value })}
                placeholder="campaign-slug (e.g. retro-future-2026)"
                className="flex-1 min-w-[200px] rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm font-mono text-white"
              />
              <label className="flex items-center gap-1 text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={s.convertedOnly}
                  onChange={(e) => updateSource(i, { convertedOnly: e.target.checked })}
                />
                Converted only
              </label>
              {sources.length > 1 && (
                <button
                  onClick={() => removeSource(i)}
                  className="rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-xs text-rose-200 hover:bg-rose-500/20"
                >
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3 rounded-xl border border-white/10 bg-slate-900/60 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-sky-300">Invite copy</h2>
        <div className="space-y-2">
          <label className="text-xs text-slate-400">Pitch (one sentence shown above the campaign card)</label>
          <input
            value={pitch}
            onChange={(e) => setPitch(e.target.value)}
            placeholder="A return to the same crowd, with a new theme."
            maxLength={240}
            className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs text-slate-400">Alumni access window (e.g. &quot;First 48 hours&quot;)</label>
          <input
            value={alumniWindow}
            onChange={(e) => setAlumniWindow(e.target.value)}
            placeholder="Alumni-only for the first 48 hours"
            maxLength={120}
            className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs text-slate-400">Operator note (optional, max 500 chars)</label>
          <textarea
            value={operatorNote}
            onChange={(e) => setOperatorNote(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
          />
        </div>
      </section>

      <section className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-slate-300">
          <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
          Dry-run (writes ledger rows but skips Klaviyo)
        </label>
        <button
          onClick={() => void submit()}
          disabled={busy || !targetSlug}
          className="rounded-lg bg-violet-500 px-4 py-2 text-sm font-semibold text-violet-50 disabled:opacity-40"
        >
          {busy ? "Sending…" : dryRun ? "Send invites (dry-run)" : "Send LIVE invites"}
        </button>
        {error && <span className="text-xs text-rose-300">{error}</span>}
      </section>

      {result && (
        <section className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-5 space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-emerald-300">Result</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div><div className="text-[10px] uppercase text-slate-400">Unique recipients</div><div className="text-white">{result.uniqueRecipients}</div></div>
            <div><div className="text-[10px] uppercase text-slate-400">Dispatched</div><div className="text-emerald-300">{result.dispatched}</div></div>
            <div><div className="text-[10px] uppercase text-slate-400">Duplicate-skipped</div><div className="text-amber-300">{result.skippedDuplicateRecipient}</div></div>
            <div><div className="text-[10px] uppercase text-slate-400">Failed</div><div className="text-rose-300">{result.failed}</div></div>
          </div>
          {result.failures.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-rose-300 mt-2">Failures</p>
              <ul className="mt-1 list-disc pl-5 text-xs text-rose-200 space-y-1">
                {result.failures.map((f, i) => (
                  <li key={i}><span className="font-mono">{f.email}</span> (from {f.sourceSlug}) — {f.error}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
