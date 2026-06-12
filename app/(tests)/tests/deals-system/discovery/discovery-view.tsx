"use client";

import { useState } from "react";

import type {
  DealDiscoveryIdea,
  SavedDiscoveryResearchStatus,
} from "@/lib/cb/deals-system";

import { ResultList } from "../result-list";

interface GenerateResponse {
  ok: boolean;
  error?: string;
  hint?: string;
  generated?: number;
  skipped?: number;
  exhausted?: boolean;
  allIdeas?: DealDiscoveryIdea[];
  ideas?: DealDiscoveryIdea[];
  researchStatus?: SavedDiscoveryResearchStatus;
}

function IdeaSummary({ idea }: { idea: DealDiscoveryIdea }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="text-sm font-semibold text-white">{idea.sailingAngleProfile.sailingAngleTitle}</span>
      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-300/80">
        {idea.isolatedNiche}
      </span>
    </div>
  );
}

function IdeaCard({ idea, bare = false }: { idea: DealDiscoveryIdea; bare?: boolean }) {
  const p = idea.sailingAngleProfile;
  const Wrapper = bare ? "div" : "article";
  return (
    <Wrapper className={bare ? "" : "rounded-xl border border-white/10 bg-white/[0.035] p-4"}>
      {!bare && (
        <>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 className="text-sm font-semibold text-white">{p.sailingAngleTitle}</h3>
            <span className="rounded-full border border-cyan-300/40 bg-cyan-400/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-200">
              angle
            </span>
          </div>
          <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-300/80">
            {idea.isolatedNiche}
          </p>
        </>
      )}
      <p className="mt-2 text-xs leading-5 text-slate-300">{p.theCorePitch}</p>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
            Target audience
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-300">{p.targetAudienceDescriptor}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
            Visual anchor
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-300">{p.visualAnchor}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
            Destination &amp; time of year
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-300">{p.destinationAndTimeOfYearHints}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
            Onboard asset requirements
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-300">{p.onboardAssetRequirements}</p>
        </div>
      </div>

      <div className="mt-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
          Insider keywords
        </p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {p.relevantKeywords.map((kw) => (
            <span
              key={kw}
              className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] text-slate-300"
            >
              {kw}
            </span>
          ))}
        </div>
      </div>

      {idea.aiTrace && (
        <details className="mt-3 rounded-lg border border-white/10 bg-black/20 p-2">
          <summary className="cursor-pointer text-[11px] font-semibold text-slate-300">
            AI debug{" "}
            <span className="text-slate-500">
              ({idea.aiTrace.model} · {idea.aiTrace.latencyMs}ms)
            </span>
          </summary>
          <div className="mt-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
              Prompt sent
            </p>
            <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-black/40 p-2 text-[10px] leading-4 text-slate-400">
              {idea.aiTrace.promptSent}
            </pre>
          </div>
          <div className="mt-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
              Raw response
            </p>
            <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-black/40 p-2 text-[10px] leading-4 text-slate-400">
              {idea.aiTrace.rawResponse}
            </pre>
          </div>
        </details>
      )}

      <div className="mt-3">
        <a
          href={`/tests/deals-system/trip-manifestation?angleId=${encodeURIComponent(idea.id)}`}
          className="inline-flex h-8 items-center rounded-lg border border-cyan-300/40 bg-cyan-400/10 px-3 text-[11px] font-semibold text-cyan-100 transition hover:bg-cyan-400/20"
        >
          Manifest this angle →
        </a>
      </div>
    </Wrapper>
  );
}

export function DealDiscoveryView({
  researchStatus,
  initialIdeas,
}: {
  researchStatus: SavedDiscoveryResearchStatus;
  initialIdeas: DealDiscoveryIdea[];
}) {
  const [ideas, setIdeas] = useState<DealDiscoveryIdea[]>(initialIdeas);
  const [status, setStatus] = useState<SavedDiscoveryResearchStatus>(researchStatus);
  const [count, setCount] = useState(5);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  async function removeIdea(id: string) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/tests/deals-system/discovery?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = (await res.json()) as GenerateResponse;
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Delete failed.");
      if (data.ideas) setIdeas(data.ideas);
      setMessage({ tone: "ok", text: "Angle removed." });
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  async function generate() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/tests/deals-system/discovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate", count }),
      });
      const data = (await res.json()) as GenerateResponse;
      if (!res.ok || !data.ok) {
        throw new Error([data.error, data.hint].filter(Boolean).join(" "));
      }
      if (data.allIdeas) setIdeas(data.allIdeas);
      if (data.researchStatus) setStatus(data.researchStatus);
      const newCount = data.generated ?? 0;
      const skippedCount = data.skipped ?? 0;
      if (data.exhausted || newCount === 0) {
        setMessage({
          tone: "error",
          text: `No new angles this run${
            skippedCount > 0 ? ` (${skippedCount} duplicate(s) skipped)` : ""
          }. The current research looks exhausted — refresh discovery research to find new niches.`,
        });
      } else {
        setMessage({
          tone: "ok",
          text: `${newCount} new angle(s) generated${
            skippedCount > 0 ? `, ${skippedCount} duplicate(s) skipped` : ""
          }.`,
        });
      }
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-cyan-300">
            Deal Workflow · Step 1
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-white">
            Discovery — start from research
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
            Generate retail cruise package ideas from the last saved discovery research. Ideas are
            starting hypotheses — individual-booking angles with no group economics and no ship
            locked in yet. Pick one later and find a matching package via Package Lookup.
          </p>
        </div>
        <a
          href="/tests/deals-system"
          className="inline-flex h-11 items-center justify-center rounded-xl border border-white/15 bg-white/[0.04] px-5 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.08]"
        >
          ← Back to Deals dashboard
        </a>
      </div>

      {message && (
        <div
          className={`mb-6 rounded-xl border p-4 text-sm ${
            message.tone === "ok"
              ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-100"
              : "border-rose-400/30 bg-rose-500/10 text-rose-100"
          }`}
        >
          {message.text}
        </div>
      )}

      <section className="mb-6 rounded-2xl border border-white/10 bg-slate-950/70 p-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">
          Research source
        </p>
        {status.hasResearch ? (
          <p className="mt-2 text-sm text-slate-300">
            Using saved discovery research
            {status.cachedAt ? ` from ${status.cachedAt}` : ""}.{" "}
            <span className="text-slate-500">
              ({status.hasPsychographic ? "community ✓" : "community —"},{" "}
              {status.hasAesthetic ? "aesthetic ✓" : "aesthetic —"})
            </span>
          </p>
        ) : (
          <p className="mt-2 text-sm text-amber-200">
            No saved discovery research found. Run Group discovery research first to populate{" "}
            <code className="text-amber-100">.github/data/discovery-research-cache.json</code>, then
            generate package ideas here.
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-slate-300">
            Ideas
            <select
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className="h-9 rounded-lg border border-white/10 bg-black/25 px-2 text-sm text-white outline-none"
            >
              {[3, 4, 5, 6, 8].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={busy || !status.hasResearch}
            onClick={() => void generate()}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-cyan-300/40 bg-cyan-400/10 px-5 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Generating…" : "Generate package ideas"}
          </button>
        </div>
      </section>

      <ResultList
        items={[...ideas].reverse()}
        getId={(i) => i.id}
        label="Angles"
        emptyText="No package ideas yet. Generate ideas from saved research above."
        busy={busy}
        onDelete={(id) => void removeIdea(id)}
        renderSummary={(i) => <IdeaSummary idea={i} />}
        renderDetail={(i) => <IdeaCard idea={i} bare />}
      />
    </div>
  );
}
