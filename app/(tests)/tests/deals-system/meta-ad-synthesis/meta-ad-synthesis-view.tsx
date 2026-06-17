"use client";

import { useEffect, useMemo, useState } from "react";

import type { DealFunnelSynthesis } from "@/lib/cb/deals-system/deal-page-design-types";
import {
  interpolateMetaAdPrompt,
  type DealMetaAdCard,
  type DealMetaAdSynthesis,
} from "@/lib/cb/deals-system/deal-meta-ad-synthesis-types";
import type {
  DealMetaDistribution,
  DealMetaDistributionPlan,
} from "@/lib/cb/deals-system/deal-meta-distribution-types";

const CAROUSEL_HEADLINE_MAX = 40;
const CAROUSEL_PRIMARY_TEXT_MAX = 125;

const NEGATION_STORAGE_KEY = "deals-system:meta-ad-image-negation-rules";

interface NegationRule {
  id: string;
  text: string;
  enabled: boolean;
}

const DEFAULT_NEGATION_RULES: NegationRule[] = [
  "Do not display the entire ship",
  "Do not add QR codes",
  "Do not make up information not presented",
  "Do not add web links",
].map((text, i) => ({ id: `default-${i}`, text, enabled: true }));

interface SynthResponse {
  ok: boolean;
  error?: string;
  synthesis?: DealMetaAdSynthesis;
  syntheses?: DealMetaAdSynthesis[];
}

interface DistributionGetResponse {
  ok: boolean;
  error?: string;
  distribution?: DealMetaDistribution | null;
}

interface DistributionPlanResponse {
  ok: boolean;
  error?: string;
  plan?: DealMetaDistributionPlan;
}

interface DistributionDispatchResponse {
  ok: boolean;
  error?: string;
  distribution?: DealMetaDistribution;
}

function CardPanel({
  card,
  promptTemplate,
  negationText,
  busy,
  isGenerating,
  isLocked,
  onGenerate,
  onToggleLock,
  onPreviewImage,
  onRevert,
}: {
  card: DealMetaAdCard;
  promptTemplate: string;
  negationText: string;
  busy: boolean;
  isGenerating: boolean;
  isLocked: boolean;
  onGenerate: (cardIndex: number) => void;
  onToggleLock: (cardIndex: number) => void;
  onPreviewImage: (url: string, alt: string) => void;
  onRevert: (cardIndex: number, historyIndex: number) => void;
}) {
  const hOver = card.headline.length > CAROUSEL_HEADLINE_MAX;
  const pOver = card.primaryText.length > CAROUSEL_PRIMARY_TEXT_MAX;
  const interpolated = interpolateMetaAdPrompt(promptTemplate, card);
  const preview = negationText.trim() ? `${interpolated}\n\n${negationText.trim()}` : interpolated;

  return (
    <div
      className={`rounded-xl border p-4 ${
        isLocked ? "border-amber-400/30 bg-amber-500/[0.03]" : "border-fuchsia-400/25 bg-fuchsia-500/[0.04]"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-fuchsia-300">
          Card {card.cardIndex + 1}
        </span>
        <div className="flex items-center gap-1.5">
          {card.status === "ready" && !isGenerating && (
            <span className="rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-200">
              ready
            </span>
          )}
          {card.status === "error" && !isGenerating && (
            <span className="rounded-full border border-rose-400/40 bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-rose-200">
              error
            </span>
          )}
          <button
            type="button"
            onClick={() => onToggleLock(card.cardIndex)}
            title={isLocked ? "Unlock — allow regenerating this card" : "Lock — protect this card from regeneration"}
            className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] transition ${
              isLocked
                ? "border-amber-400/50 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25"
                : "border-white/15 bg-white/[0.04] text-slate-400 hover:border-white/30 hover:text-slate-200"
            }`}
          >
            {isLocked ? "🔒 locked" : "🔓 lock"}
          </button>
        </div>
      </div>

      <h4 className="mt-1 text-sm font-bold text-white">{card.headline}</h4>
      <p className={`text-[10px] ${hOver ? "text-amber-300" : "text-slate-500"}`}>
        headline {card.headline.length}/{CAROUSEL_HEADLINE_MAX}
      </p>
      <p className="mt-1 text-xs leading-5 text-slate-300">{card.primaryText}</p>
      <p className={`text-[10px] ${pOver ? "text-amber-300" : "text-slate-500"}`}>
        primary text {card.primaryText.length}/{CAROUSEL_PRIMARY_TEXT_MAX}
      </p>

      <div className="mt-3 overflow-hidden rounded-lg border border-white/10 bg-black/30">
        {card.imageUrl ? (
          <button
            type="button"
            onClick={() => onPreviewImage(card.imageUrl!, card.headline)}
            className="block aspect-square w-full cursor-zoom-in"
            title="Click to view full screen"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={card.imageUrl} alt={card.headline} className="aspect-square w-full object-cover" />
          </button>
        ) : (
          <div className="flex aspect-square w-full items-center justify-center text-[11px] text-slate-500">
            {isGenerating ? "Generating…" : "No image yet"}
          </div>
        )}
      </div>

      {card.error && !isGenerating && <p className="mt-2 text-[11px] text-rose-200">⚠ {card.error}</p>}

      <button
        type="button"
        disabled={busy || isLocked}
        onClick={() => onGenerate(card.cardIndex)}
        title={isLocked ? "Locked — unlock to regenerate" : undefined}
        className="mt-3 inline-flex h-9 w-full items-center justify-center rounded-lg border border-fuchsia-300/40 bg-fuchsia-400/10 text-[11px] font-semibold text-fuchsia-100 transition hover:bg-fuchsia-400/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isGenerating ? "Generating…" : card.imageUrl ? "Regenerate image" : "Generate image"}
      </button>

      {card.previousImages && card.previousImages.length > 0 && (
        <details className="mt-2 rounded-lg border border-white/10 bg-black/20 p-2">
          <summary className="cursor-pointer text-[10px] font-semibold text-slate-400">
            Previous images ({card.previousImages.length})
          </summary>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {card.previousImages.map((entry, historyIndex) => (
              <div key={`${entry.imageUrl}-${historyIndex}`} className="space-y-1">
                <button
                  type="button"
                  onClick={() => onPreviewImage(entry.imageUrl, `${card.headline} (previous)`)}
                  className="block aspect-square w-full overflow-hidden rounded border border-white/10 cursor-zoom-in"
                  title="Click to view full screen"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={entry.imageUrl} alt={`${card.headline} (previous)`} className="aspect-square w-full object-cover" />
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onRevert(card.cardIndex, historyIndex)}
                  className="inline-flex h-7 w-full items-center justify-center rounded border border-amber-300/40 bg-amber-400/10 text-[10px] font-semibold text-amber-100 transition hover:bg-amber-400/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Revert to this
                </button>
              </div>
            ))}
          </div>
        </details>
      )}

      <details className="mt-2 rounded-lg border border-white/10 bg-black/20 p-2">
        <summary className="cursor-pointer text-[10px] font-semibold text-slate-400">
          Prompt preview
        </summary>
        <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-words rounded bg-black/40 p-2 text-[10px] leading-4 text-slate-400">
          {card.promptUsed ?? preview}
        </pre>
      </details>
    </div>
  );
}

function ImageLightbox({
  url,
  alt,
  onClose,
}: {
  url: string;
  alt: string;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-6"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-5 top-5 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/50 text-lg text-white transition hover:bg-black/80"
        aria-label="Close full-screen preview"
      >
        ✕
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={alt}
        className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

function MetaDistributionPanel({ synthesis }: { synthesis: DealMetaAdSynthesis }) {
  const [distribution, setDistribution] = useState<DealMetaDistribution | null>(null);
  const [plan, setPlan] = useState<DealMetaDistributionPlan | null>(null);
  const [mode, setMode] = useState<"simulate" | "live">("simulate");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const readyCount = synthesis.cards.filter((c) => c.status === "ready" && c.imageUrl).length;

  useEffect(() => {
    let cancelled = false;
    setDistribution(null);
    setPlan(null);
    setMessage(null);
    (async () => {
      try {
        const res = await fetch(`/api/tests/deals-system/meta-distribution?synthesisId=${encodeURIComponent(synthesis.id)}`);
        const data = (await res.json()) as DistributionGetResponse;
        if (!cancelled && data.ok) setDistribution(data.distribution ?? null);
      } catch {
        // best-effort load
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [synthesis.id]);

  async function post<T>(body: Record<string, unknown>): Promise<T> {
    const res = await fetch("/api/tests/deals-system/meta-distribution", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return (await res.json()) as T;
  }

  async function buildPlan() {
    setBusy(true);
    setMessage(null);
    try {
      const data = await post<DistributionPlanResponse>({ action: "plan", synthesisId: synthesis.id });
      if (!data.ok || !data.plan) throw new Error(data.error ?? "Failed to build plan.");
      setPlan(data.plan);
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  async function dispatch() {
    setBusy(true);
    setMessage(null);
    try {
      const data = await post<DistributionDispatchResponse>({ action: "dispatch", synthesisId: synthesis.id, mode });
      if (!data.ok || !data.distribution) throw new Error(data.error ?? "Dispatch failed.");
      setDistribution(data.distribution);
      setPlan(data.distribution.plan);
      setMessage({
        tone: data.distribution.status === "error" ? "error" : "ok",
        text:
          data.distribution.status === "error"
            ? data.distribution.error ?? "Dispatch reported an error."
            : mode === "live"
              ? "Live draft created in Meta Ads Manager (paused) and Instagram (if configured)."
              : "Simulated — no Graph API calls made beyond read-only interest search.",
      });
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-6 rounded-2xl border border-cyan-400/25 bg-cyan-500/[0.04] p-5">
      <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-cyan-300">
        Step 9 · Push carousel to Meta
      </p>
      <p className="mt-1 text-[11px] text-slate-400">
        Creates a new Meta Campaign + Ad Set for this deal, a Facebook carousel ad
        (paused draft), and an Instagram Graph carousel post from the {readyCount} ready
        card{readyCount === 1 ? "" : "s"}.
      </p>

      {readyCount === 0 && (
        <p className="mt-3 text-xs text-amber-200">
          No ready cards yet — generate at least one carousel image above.
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy || readyCount === 0}
          onClick={() => void buildPlan()}
          className="inline-flex h-9 items-center justify-center rounded-lg border border-cyan-300/40 bg-cyan-400/10 px-4 text-[11px] font-semibold text-cyan-100 transition hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Working…" : "Build plan / preview"}
        </button>

        <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Mode</span>
          <button
            type="button"
            onClick={() => setMode("simulate")}
            className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] transition ${
              mode === "simulate" ? "bg-emerald-400/20 text-emerald-100" : "text-slate-500 hover:text-slate-300"
            }`}
          >
            Simulate
          </button>
          <button
            type="button"
            onClick={() => setMode("live")}
            className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] transition ${
              mode === "live" ? "bg-rose-400/20 text-rose-100" : "text-slate-500 hover:text-slate-300"
            }`}
          >
            Live
          </button>
        </div>

        <button
          type="button"
          disabled={busy || readyCount === 0}
          onClick={() => void dispatch()}
          className={`inline-flex h-9 items-center justify-center rounded-lg border px-4 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
            mode === "live"
              ? "border-rose-300/40 bg-rose-400/10 text-rose-100 hover:bg-rose-400/20"
              : "border-emerald-300/40 bg-emerald-400/10 text-emerald-100 hover:bg-emerald-400/20"
          }`}
        >
          {busy ? "Working…" : mode === "live" ? "Dispatch live (creates paused draft)" : "Dispatch (simulate)"}
        </button>
      </div>

      {message && (
        <div
          className={`mt-3 rounded-lg border p-3 text-xs ${
            message.tone === "ok"
              ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-100"
              : "border-rose-400/30 bg-rose-500/10 text-rose-100"
          }`}
        >
          {message.text}
        </div>
      )}

      {plan && (
        <div className="mt-4 rounded-lg border border-white/10 bg-black/20 p-3 text-[11px] text-slate-300">
          <p>
            <span className="font-semibold text-slate-200">Destination:</span> {plan.destinationUrl}
          </p>
          <p className="mt-1">
            <span className="font-semibold text-slate-200">Targeting:</span>{" "}
            {plan.targeting.adSetMode === "dynamic"
              ? `${plan.targeting.resolvedInterests.length} resolved interest(s) — ${plan.targeting.resolvedInterests
                  .map((i) => i.name)
                  .join(", ")}`
              : "static fallback (META_AD_SET_ID)"}
          </p>
          {plan.targeting.warnings.length > 0 && (
            <ul className="mt-1 list-inside list-disc text-amber-200">
              {plan.targeting.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
          <p className="mt-1">
            <span className="font-semibold text-slate-200">Cards:</span> {plan.cards.length} ready image(s)
          </p>
        </div>
      )}

      {distribution && (
        <div className="mt-4 rounded-lg border border-white/10 bg-black/20 p-3 text-[11px] text-slate-300">
          <p>
            <span className="font-semibold text-slate-200">Last distribution:</span>{" "}
            <span
              className={
                distribution.status === "dispatched"
                  ? "text-emerald-300"
                  : distribution.status === "error"
                    ? "text-rose-300"
                    : "text-slate-300"
              }
            >
              {distribution.status}
            </span>{" "}
            ({distribution.mode}) at {new Date(distribution.generatedAtIso).toLocaleString()}
          </p>
          {distribution.reviewUrl && (
            <p className="mt-1">
              <a
                href={distribution.reviewUrl}
                target="_blank"
                rel="noreferrer"
                className="text-cyan-300 underline hover:text-cyan-200"
              >
                Open in Ads Manager →
              </a>
            </p>
          )}
          {distribution.error && <p className="mt-1 text-rose-200">⚠ {distribution.error}</p>}
          {distribution.notes.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-[10px] font-semibold text-slate-400">Notes</summary>
              <ul className="mt-1 list-inside list-disc">
                {distribution.notes.map((n, i) => (
                  <li key={i} className="break-all">
                    {n}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </section>
  );
}

export function MetaAdSynthesisView({
  funnelSyntheses,
  initialSyntheses,
}: {
  funnelSyntheses: DealFunnelSynthesis[];
  initialSyntheses: DealMetaAdSynthesis[];
}) {
  const [selectedFunnelId, setSelectedFunnelId] = useState<string | null>(
    funnelSyntheses[0]?.id ?? null
  );
  const [syntheses, setSyntheses] = useState<DealMetaAdSynthesis[]>(initialSyntheses);
  const [activeId, setActiveId] = useState<string | null>(initialSyntheses[0]?.id ?? null);
  const [promptDraft, setPromptDraft] = useState<string>(initialSyntheses[0]?.promptTemplate ?? "");
  const [busy, setBusy] = useState(false);
  const [generatingCards, setGeneratingCards] = useState<Set<number>>(new Set());
  const [lockedCards, setLockedCards] = useState<Set<number>>(new Set());
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [previewImage, setPreviewImage] = useState<{ url: string; alt: string } | null>(null);
  const [negationRules, setNegationRules] = useState<NegationRule[]>(DEFAULT_NEGATION_RULES);
  const [newNegationRule, setNewNegationRule] = useState("");

  // Load the persistent (cross-campaign) negation rules once on mount.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(NEGATION_STORAGE_KEY);
      if (stored !== null) {
        const parsed = JSON.parse(stored) as NegationRule[];
        if (Array.isArray(parsed)) setNegationRules(parsed);
      }
    } catch {
      // localStorage unavailable or corrupted — fall back to defaults.
    }
  }, []);

  function persistNegationRules(rules: NegationRule[]) {
    setNegationRules(rules);
    try {
      window.localStorage.setItem(NEGATION_STORAGE_KEY, JSON.stringify(rules));
    } catch {
      // best-effort persistence only
    }
  }

  function toggleNegationRule(id: string) {
    persistNegationRules(
      negationRules.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r))
    );
  }

  function deleteNegationRule(id: string) {
    persistNegationRules(negationRules.filter((r) => r.id !== id));
  }

  function addNegationRule() {
    const text = newNegationRule.trim();
    if (!text) return;
    persistNegationRules([...negationRules, { id: `custom-${Date.now()}`, text, enabled: true }]);
    setNewNegationRule("");
  }

  const negationText = useMemo(
    () => negationRules.filter((r) => r.enabled).map((r) => r.text).join("\n"),
    [negationRules]
  );

  function toggleLock(cardIndex: number) {
    setLockedCards((prev) => {
      const next = new Set(prev);
      if (next.has(cardIndex)) next.delete(cardIndex);
      else next.add(cardIndex);
      return next;
    });
  }

  const selectedFunnel = useMemo(
    () => funnelSyntheses.find((s) => s.id === selectedFunnelId) ?? null,
    [funnelSyntheses, selectedFunnelId]
  );
  const active = useMemo(() => syntheses.find((s) => s.id === activeId) ?? null, [syntheses, activeId]);

  async function post(body: Record<string, unknown>): Promise<SynthResponse> {
    const res = await fetch("/api/tests/deals-system/meta-ad-synthesis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return (await res.json()) as SynthResponse;
  }

  function applySynthesis(s: DealMetaAdSynthesis) {
    setSyntheses((prev) => {
      const next = prev.filter((x) => x.id !== s.id);
      next.push(s);
      return next;
    });
    setActiveId(s.id);
    setPromptDraft(s.promptTemplate);
  }

  async function init() {
    if (!selectedFunnelId) return;
    setBusy(true);
    setMessage(null);
    try {
      const data = await post({ action: "init", funnelSynthesisId: selectedFunnelId });
      if (!data.ok || !data.synthesis) throw new Error(data.error ?? "Initialization failed.");
      applySynthesis(data.synthesis);
      if (data.syntheses) setSyntheses(data.syntheses);
      setMessage({ tone: "ok", text: "Carousel cards loaded — edit the prompt template and generate images." });
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  async function savePrompt() {
    if (!active) return;
    setBusy(true);
    setMessage(null);
    try {
      const data = await post({
        action: "update_prompt",
        synthesisId: active.id,
        promptTemplate: promptDraft,
      });
      if (!data.ok || !data.synthesis) throw new Error(data.error ?? "Saving prompt failed.");
      applySynthesis(data.synthesis);
      setMessage({ tone: "ok", text: "Prompt template saved." });
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  /**
   * Generate one card's image. Merges only that card's result into the active
   * synthesis (rather than replacing the whole synthesis) so concurrent
   * generations for other cards aren't clobbered.
   */
  async function generateOneCard(synthesisId: string, cardIndex: number): Promise<{ ok: boolean; error?: string }> {
    const data = await post({ action: "generate_image", synthesisId, cardIndex, promptSuffix: negationText });
    const updatedCard = data.synthesis?.cards.find((c) => c.cardIndex === cardIndex);
    if (updatedCard) {
      setSyntheses((prev) =>
        prev.map((s) =>
          s.id === synthesisId
            ? { ...s, cards: s.cards.map((c) => (c.cardIndex === cardIndex ? updatedCard : c)) }
            : s
        )
      );
    }
    return { ok: data.ok, error: data.error };
  }

  async function generateImage(cardIndex: number) {
    if (!active) return;
    const synthesisId = active.id;
    setBusy(true);
    setGeneratingCards((prev) => new Set(prev).add(cardIndex));
    setMessage(null);
    try {
      const { ok, error } = await generateOneCard(synthesisId, cardIndex);
      if (!ok) throw new Error(error ?? "Image generation failed.");
      setMessage({ tone: "ok", text: `Card ${cardIndex + 1} image generated.` });
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
      setGeneratingCards((prev) => {
        const next = new Set(prev);
        next.delete(cardIndex);
        return next;
      });
    }
  }

  async function generateAllCards() {
    if (!active) return;
    const synthesisId = active.id;
    const cardIndexes = active.cards.map((c) => c.cardIndex).filter((idx) => !lockedCards.has(idx));
    if (cardIndexes.length === 0) {
      setMessage({ tone: "error", text: "All cards are locked — unlock at least one to generate." });
      return;
    }
    setBusy(true);
    setGeneratingCards(new Set(cardIndexes));
    setMessage(null);
    try {
      const results = await Promise.all(
        cardIndexes.map((cardIndex) => generateOneCard(synthesisId, cardIndex))
      );
      const failures = results.filter((r) => !r.ok);
      if (failures.length > 0) {
        setMessage({
          tone: "error",
          text: `${failures.length} of ${cardIndexes.length} card(s) failed: ${failures
            .map((f) => f.error)
            .join("; ")}`,
        });
      } else {
        setMessage({ tone: "ok", text: `${cardIndexes.length} card image(s) generated.` });
      }
    } finally {
      setBusy(false);
      setGeneratingCards(new Set());
    }
  }

  async function revertImage(cardIndex: number, historyIndex: number) {
    if (!active) return;
    const synthesisId = active.id;
    setBusy(true);
    setMessage(null);
    try {
      const data = await post({ action: "revert_image", synthesisId, cardIndex, historyIndex });
      if (!data.ok) throw new Error(data.error ?? "Revert failed.");
      const revertedCard = data.synthesis?.cards.find((c) => c.cardIndex === cardIndex);
      if (revertedCard) {
        setSyntheses((prev) =>
          prev.map((s) =>
            s.id === synthesisId
              ? { ...s, cards: s.cards.map((c) => (c.cardIndex === cardIndex ? revertedCard : c)) }
              : s
          )
        );
      }
      setMessage({ tone: "ok", text: `Card ${cardIndex + 1} reverted to a previous image.` });
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
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-violet-300">
            Deal Workflow · Step 8
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-white">Meta Ad Synthesis</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
            Turn the Step 7 funnel synthesis&apos;s hyper-niche Meta carousel copy into ready-to-launch
            ad images. Edit the shared prompt template, then generate (and re-generate) each
            card&apos;s square ad image with GPT Image 2.
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

      {/* Funnel synthesis picker */}
      <section className="mb-6 rounded-2xl border border-white/10 bg-slate-950/70 p-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">
          Select a Step 7 funnel synthesis
        </p>
        {funnelSyntheses.length === 0 ? (
          <p className="mt-2 text-sm text-amber-200">
            No funnel syntheses cached yet. Run Step 7 · Funnel Synthesis first.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {funnelSyntheses.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => setSelectedFunnelId(s.id)}
                  className={`flex w-full items-start gap-3 rounded-lg border px-3 py-2 text-left transition ${
                    selectedFunnelId === s.id
                      ? "border-cyan-300/60 bg-cyan-400/10"
                      : "border-white/10 bg-white/[0.03] hover:border-white/25"
                  }`}
                >
                  <span
                    className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
                      selectedFunnelId === s.id ? "bg-cyan-300" : "bg-slate-600"
                    }`}
                  />
                  <span>
                    <span className="block text-xs font-semibold text-white">{s.sailingAngleTitle}</span>
                    <span className="block text-[11px] text-slate-400">
                      {s.carousel.cards.length} carousel card(s)
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          disabled={busy || !selectedFunnel}
          onClick={() => void init()}
          className="mt-4 inline-flex h-11 items-center justify-center rounded-xl border border-cyan-300/40 bg-cyan-400/10 px-5 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy && generatingCards.size === 0 ? "Loading…" : "Load carousel cards"}
        </button>
      </section>

      {/* Synthesis tabs */}
      {syntheses.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {syntheses.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                setActiveId(s.id);
                setPromptDraft(s.promptTemplate);
              }}
              className={`rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition ${
                activeId === s.id
                  ? "border-cyan-300/60 bg-cyan-400/10 text-cyan-100"
                  : "border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/25"
              }`}
            >
              {s.sailingAngleTitle}
            </button>
          ))}
        </div>
      )}

      {active && (
        <>
          {/* Editable prompt template */}
          <section className="mb-6 rounded-2xl border border-violet-400/25 bg-violet-500/[0.04] p-5">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-violet-300">
              Image prompt template
            </p>
            <p className="mt-1 text-[11px] text-slate-400">
              Use <code className="text-violet-200">{"{{HEADLINE}}"}</code> and{" "}
              <code className="text-violet-200">{"{{PRIMARY_TEXT}}"}</code> — interpolated per card
              when you generate its image.
            </p>
            <textarea
              value={promptDraft}
              onChange={(e) => setPromptDraft(e.target.value)}
              rows={5}
              aria-label="Image prompt template"
              placeholder="Generate a vivid square ad flyer promoting the following Cruise Package:&#10;{{HEADLINE}}&#10;{{PRIMARY_TEXT}}"
              className="mt-3 w-full rounded-lg border border-white/10 bg-black/30 p-3 text-xs leading-5 text-slate-200 focus:border-violet-300/50 focus:outline-none"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy || promptDraft === active.promptTemplate}
                onClick={() => void savePrompt()}
                className="inline-flex h-9 items-center justify-center rounded-lg border border-violet-300/40 bg-violet-400/10 px-4 text-[11px] font-semibold text-violet-100 transition hover:bg-violet-400/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Save prompt template
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void generateAllCards()}
                className="inline-flex h-9 items-center justify-center rounded-lg border border-fuchsia-300/40 bg-fuchsia-400/10 px-4 text-[11px] font-semibold text-fuchsia-100 transition hover:bg-fuchsia-400/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {generatingCards.size > 0
                  ? "Generating…"
                  : lockedCards.size > 0
                    ? `Generate unlocked (${active.cards.length - lockedCards.size})`
                    : "Generate all 4 (parallel)"}
              </button>
            </div>
          </section>

          {/* Persistent negation panel — applies to every campaign's image generations on this browser */}
          <section className="mb-6 rounded-2xl border border-rose-400/25 bg-rose-500/[0.04] p-5">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-rose-300">
              Negation (applies to all campaigns)
            </p>
            <p className="mt-1 text-[11px] text-slate-400">
              Appended to every card&apos;s prompt after the template above, e.g. things to keep out of
              every generated image. Saved in this browser and reused across all deals/campaigns.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {negationRules.map((rule) => (
                <span
                  key={rule.id}
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] transition ${
                    rule.enabled
                      ? "border-rose-300/40 bg-rose-400/10 text-rose-100"
                      : "border-white/10 bg-black/20 text-slate-500 line-through"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleNegationRule(rule.id)}
                    title={rule.enabled ? "Disable this rule" : "Enable this rule"}
                    className="cursor-pointer"
                  >
                    {rule.text}
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteNegationRule(rule.id)}
                    title="Delete this rule"
                    aria-label={`Delete rule: ${rule.text}`}
                    className="text-slate-400 transition hover:text-rose-200"
                  >
                    ×
                  </button>
                </span>
              ))}
              {negationRules.length === 0 && (
                <span className="text-[11px] text-slate-500">No negation rules.</span>
              )}
            </div>
            <div className="mt-3 flex gap-2">
              <input
                type="text"
                value={newNegationRule}
                onChange={(e) => setNewNegationRule(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addNegationRule();
                  }
                }}
                placeholder="Add a new rule, e.g. Do not include visible text or logos"
                className="flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-slate-200 focus:border-rose-300/50 focus:outline-none"
              />
              <button
                type="button"
                onClick={addNegationRule}
                disabled={!newNegationRule.trim()}
                className="rounded-lg border border-rose-300/40 bg-rose-400/10 px-3 py-2 text-[11px] font-semibold text-rose-100 transition hover:bg-rose-400/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Add rule
              </button>
            </div>
          </section>

          {/* Carousel cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {active.cards.map((card) => (
              <CardPanel
                key={card.cardIndex}
                card={card}
                promptTemplate={promptDraft}
                negationText={negationText}
                busy={busy}
                isGenerating={generatingCards.has(card.cardIndex)}
                isLocked={lockedCards.has(card.cardIndex)}
                onGenerate={(idx) => void generateImage(idx)}
                onToggleLock={toggleLock}
                onPreviewImage={(url, alt) => setPreviewImage({ url, alt })}
                onRevert={(idx, historyIdx) => void revertImage(idx, historyIdx)}
              />
            ))}
          </div>

          <MetaDistributionPanel synthesis={active} />
        </>
      )}

      {previewImage && (
        <ImageLightbox
          url={previewImage.url}
          alt={previewImage.alt}
          onClose={() => setPreviewImage(null)}
        />
      )}
    </div>
  );
}
