"use client";

import { useEffect, useMemo, useState } from "react";

import type { DealFunnelSynthesis, DealImageCandidate } from "@/lib/cb/deals-system/deal-page-design-types";
import {
  GOOGLE_ADS_BUSINESS_NAME_MAX,
  GOOGLE_ADS_DESCRIPTION_MAX,
  GOOGLE_ADS_HEADLINE_MAX,
  GOOGLE_ADS_LONG_HEADLINE_MAX,
  interpolateGoogleAdsPrompt,
  type DealGoogleAdsImageAsset,
  type DealGoogleAdsImageAspect,
  type DealGoogleAdsSynthesis,
} from "@/lib/cb/deals-system/deal-google-ads-synthesis-types";
import type {
  DealGoogleAdsDistribution,
  DealGoogleAdsDistributionPlan,
} from "@/lib/cb/deals-system/deal-google-ads-distribution-types";
import type {
  DealCommunityPlacementCandidate,
  DealCommunityPlatform,
} from "@/lib/cb/deals-system/deal-community-search";

const NEGATION_STORAGE_KEY = "deals-system:google-ads-image-negation-rules";

interface NegationRule {
  id: string;
  text: string;
  enabled: boolean;
}

const DEFAULT_NEGATION_RULES: NegationRule[] = [
  "Do not render any text, words, logos, or graphic overlays in the image",
  "Do not display the entire ship",
  "Do not add QR codes",
  "Do not make up information not presented",
  "Do not add web links",
].map((text, i) => ({ id: `default-${i}`, text, enabled: true }));

interface SynthResponse {
  ok: boolean;
  error?: string;
  synthesis?: DealGoogleAdsSynthesis;
  syntheses?: DealGoogleAdsSynthesis[];
}

const ASPECT_LABEL: Record<DealGoogleAdsImageAspect, string> = {
  landscape_1_91x1: "Landscape (1.91:1 — 1200×628)",
  square_1x1: "Square (1:1 — 1200×1200)",
};

/**
 * Collapse any two syntheses that share an id down to the last occurrence.
 * Two entries with the same id break both the tab list's `.map(key={s.id})`
 * and `key={active.id}` on the panels ("Encountered two children with the
 * same key"). Ids are supposed to be per-deal-unique, but historic records
 * generated under the old truncated-slug id scheme could collide, so we guard
 * at every point the list enters component state.
 */
function dedupeById(list: DealGoogleAdsSynthesis[]): DealGoogleAdsSynthesis[] {
  const byId = new Map<string, DealGoogleAdsSynthesis>();
  for (const s of list) byId.set(s.id, s);
  return [...byId.values()];
}

function ImagePanel({
  asset,
  promptTemplate,
  synthesis,
  negationText,
  busy,
  isGenerating,
  galleryCandidates,
  onGenerate,
  onPreviewImage,
  onRevert,
  onUseGalleryImage,
}: {
  asset: DealGoogleAdsImageAsset;
  promptTemplate: string;
  synthesis: Pick<DealGoogleAdsSynthesis, "headline" | "longHeadline">;
  negationText: string;
  busy: boolean;
  isGenerating: boolean;
  galleryCandidates: DealImageCandidate[];
  onGenerate: (aspect: DealGoogleAdsImageAspect) => void;
  onPreviewImage: (url: string, alt: string) => void;
  onRevert: (aspect: DealGoogleAdsImageAspect, historyIndex: number) => void;
  onUseGalleryImage: (aspect: DealGoogleAdsImageAspect, candidateId: string) => void;
}) {
  const interpolated = interpolateGoogleAdsPrompt(promptTemplate, synthesis);
  const preview = negationText.trim() ? `${interpolated}\n\n${negationText.trim()}` : interpolated;
  const aspectRatioClass = asset.aspect === "square_1x1" ? "aspect-square" : "aspect-[1.91/1]";

  return (
    <div className="rounded-xl border border-amber-400/25 bg-amber-500/[0.04] p-4">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber-300">
          {ASPECT_LABEL[asset.aspect]}
        </span>
        {asset.status === "ready" && !isGenerating && (
          <span className="rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-200">
            ready
          </span>
        )}
        {asset.status === "error" && !isGenerating && (
          <span className="rounded-full border border-rose-400/40 bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-rose-200">
            error
          </span>
        )}
      </div>

      <div className={`mt-3 overflow-hidden rounded-lg border border-white/10 bg-black/30 ${aspectRatioClass}`}>
        {asset.imageUrl ? (
          <button
            type="button"
            onClick={() => onPreviewImage(asset.imageUrl!, ASPECT_LABEL[asset.aspect])}
            className={`block w-full cursor-zoom-in ${aspectRatioClass}`}
            title="Click to view full screen"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={asset.imageUrl}
              alt={ASPECT_LABEL[asset.aspect]}
              className={`w-full object-cover ${aspectRatioClass}`}
            />
          </button>
        ) : (
          <div className={`flex w-full items-center justify-center text-[11px] text-slate-500 ${aspectRatioClass}`}>
            {isGenerating ? "Generating…" : "No image yet"}
          </div>
        )}
      </div>

      {asset.error && !isGenerating && <p className="mt-2 text-[11px] text-rose-200">⚠ {asset.error}</p>}

      <button
        type="button"
        disabled={busy}
        onClick={() => onGenerate(asset.aspect)}
        className="mt-3 inline-flex h-9 w-full items-center justify-center rounded-lg border border-amber-300/40 bg-amber-400/10 text-[11px] font-semibold text-amber-100 transition hover:bg-amber-400/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isGenerating ? "Generating…" : asset.imageUrl ? "Regenerate image" : "Generate image"}
      </button>

      {asset.generator === "gallery_photo" && !isGenerating && (
        <p className="mt-1 text-center text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-300">
          from gallery
        </p>
      )}

      <details className="mt-2 rounded-lg border border-cyan-400/20 bg-cyan-500/[0.03] p-2">
        <summary className="cursor-pointer text-[10px] font-semibold text-cyan-300">
          Use gallery photo instead{galleryCandidates.length > 0 ? ` (${galleryCandidates.length})` : ""}
        </summary>
        {galleryCandidates.length === 0 ? (
          <p className="mt-2 text-[10px] text-slate-500">
            No curated gallery photos on this deal yet — pick a gallery in Step 7 Funnel Synthesis first.
          </p>
        ) : (
          <div className="mt-2 grid grid-cols-3 gap-2">
            {galleryCandidates.map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                disabled={busy}
                onClick={() => onUseGalleryImage(asset.aspect, candidate.id)}
                title={candidate.title ?? candidate.category}
                className="block aspect-square w-full overflow-hidden rounded border border-white/10 transition hover:border-cyan-300/50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={candidate.thumbnailUrl}
                  alt={candidate.title ?? candidate.category}
                  className="aspect-square w-full object-cover"
                />
              </button>
            ))}
          </div>
        )}
      </details>

      {asset.previousImages && asset.previousImages.length > 0 && (
        <details className="mt-2 rounded-lg border border-white/10 bg-black/20 p-2">
          <summary className="cursor-pointer text-[10px] font-semibold text-slate-400">
            Previous images ({asset.previousImages.length})
          </summary>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {asset.previousImages.map((entry, historyIndex) => (
              <div key={`${entry.imageUrl}-${historyIndex}`} className="space-y-1">
                <button
                  type="button"
                  onClick={() => onPreviewImage(entry.imageUrl, `${ASPECT_LABEL[asset.aspect]} (previous)`)}
                  className="block aspect-square w-full overflow-hidden rounded border border-white/10 cursor-zoom-in"
                  title="Click to view full screen"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={entry.imageUrl}
                    alt={`${ASPECT_LABEL[asset.aspect]} (previous)`}
                    className="aspect-square w-full object-cover"
                  />
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onRevert(asset.aspect, historyIndex)}
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
        <summary className="cursor-pointer text-[10px] font-semibold text-slate-400">Prompt preview</summary>
        <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-words rounded bg-black/40 p-2 text-[10px] leading-4 text-slate-400">
          {asset.promptUsed ?? preview}
        </pre>
      </details>
    </div>
  );
}

function ImageLightbox({ url, alt, onClose }: { url: string; alt: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-6" onClick={onClose}>
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

const PLATFORM_LABEL: Record<DealCommunityPlatform, string> = {
  reddit: "Reddit",
  youtube: "YouTube",
  forum_or_other: "Forum / other",
};

function PlacementsPanel({
  synthesis,
  onSynthesisUpdated,
}: {
  synthesis: DealGoogleAdsSynthesis;
  onSynthesisUpdated: (s: DealGoogleAdsSynthesis) => void;
}) {
  const [niche, setNiche] = useState(synthesis.sailingAngleTitle);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [candidates, setCandidates] = useState<DealCommunityPlacementCandidate[]>([]);
  const [perPlatform, setPerPlatform] = useState<
    Array<{ platform: DealCommunityPlatform; query: string; count: number; error?: string }>
  >([]);

  async function post<T>(body: Record<string, unknown>): Promise<T> {
    const res = await fetch("/api/tests/deals-system/google-ads-synthesis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return (await res.json()) as T;
  }

  async function search() {
    if (!niche.trim()) return;
    setBusy(true);
    setMessage(null);
    try {
      const data = await post<{
        ok: boolean;
        error?: string;
        candidates?: DealCommunityPlacementCandidate[];
        perPlatform?: typeof perPlatform;
      }>({ action: "search_communities", synthesisId: synthesis.id, niche });
      if (!data.ok) throw new Error(data.error ?? "Search failed.");
      setCandidates(data.candidates ?? []);
      setPerPlatform(data.perPlatform ?? []);
      setMessage({
        tone: "ok",
        text: `Found ${data.candidates?.length ?? 0} real result(s) across reddit/youtube/forum search.`,
      });
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  async function addPlacement(url: string) {
    setBusy(true);
    setMessage(null);
    try {
      const data = await post<{ ok: boolean; error?: string; synthesis?: DealGoogleAdsSynthesis }>({
        action: "add_placement",
        synthesisId: synthesis.id,
        url,
      });
      if (!data.ok || !data.synthesis) throw new Error(data.error ?? "Failed to add placement.");
      onSynthesisUpdated(data.synthesis);
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  async function removePlacement(url: string) {
    setBusy(true);
    setMessage(null);
    try {
      const data = await post<{ ok: boolean; error?: string; synthesis?: DealGoogleAdsSynthesis }>({
        action: "remove_placement",
        synthesisId: synthesis.id,
        url,
      });
      if (!data.ok || !data.synthesis) throw new Error(data.error ?? "Failed to remove placement.");
      onSynthesisUpdated(data.synthesis);
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mb-6 rounded-2xl border border-emerald-400/25 bg-emerald-500/[0.04] p-5">
      <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-emerald-300">
        Real community placements (optional)
      </p>
      <p className="mt-1 text-[11px] text-slate-400">
        Search real Google results (reddit/youtube/forum) for this deal&apos;s niche and pick any that
        genuinely fit. Nothing here is auto-applied or AI-imagined — only what you click below becomes a
        Google Ads placement.
      </p>

      <div className="mt-3 flex gap-2">
        <input
          type="text"
          value={niche}
          onChange={(e) => setNiche(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void search();
            }
          }}
          placeholder="Niche to search, e.g. glacier photography"
          className="flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-slate-200 focus:border-emerald-300/50 focus:outline-none"
        />
        <button
          type="button"
          disabled={busy || !niche.trim()}
          onClick={() => void search()}
          className="rounded-lg border border-emerald-300/40 bg-emerald-400/10 px-3 py-2 text-[11px] font-semibold text-emerald-100 transition hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Searching…" : "Search for real communities"}
        </button>
      </div>

      {message && (
        <p className={`mt-2 text-[11px] ${message.tone === "ok" ? "text-emerald-200" : "text-rose-200"}`}>
          {message.text}
        </p>
      )}

      {perPlatform.some((p) => p.error) && (
        <ul className="mt-2 list-inside list-disc text-[10px] text-amber-200">
          {perPlatform
            .filter((p) => p.error)
            .map((p) => (
              <li key={p.platform}>
                {PLATFORM_LABEL[p.platform]} search failed: {p.error}
              </li>
            ))}
        </ul>
      )}

      {candidates.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {candidates.map((candidate) => {
            const alreadyAdded = synthesis.operatorPlacements.includes(candidate.url);
            return (
              <div
                key={candidate.id}
                className="flex items-start justify-between gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2"
              >
                <div className="min-w-0">
                  <span className="rounded-full border border-white/15 bg-white/[0.04] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">
                    {PLATFORM_LABEL[candidate.platform]}
                  </span>
                  <p className="mt-1 truncate text-xs font-semibold text-white">{candidate.title}</p>
                  <a
                    href={candidate.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block truncate text-[11px] text-cyan-300 underline hover:text-cyan-200"
                  >
                    {candidate.url}
                  </a>
                  {candidate.snippet && (
                    <p className="mt-1 line-clamp-2 text-[11px] text-slate-400">{candidate.snippet}</p>
                  )}
                </div>
                <button
                  type="button"
                  disabled={busy || alreadyAdded}
                  onClick={() => void addPlacement(candidate.url)}
                  className="shrink-0 rounded-lg border border-emerald-300/40 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-100 transition hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {alreadyAdded ? "Added" : "Add as placement"}
                </button>
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
        Selected placements ({synthesis.operatorPlacements.length})
      </p>
      {synthesis.operatorPlacements.length === 0 ? (
        <p className="mt-1 text-[11px] text-slate-500">
          None yet — search above and add any that genuinely fit, or leave empty to target by keyword only.
        </p>
      ) : (
        <ul className="mt-2 space-y-1">
          {synthesis.operatorPlacements.map((url) => (
            <li
              key={url}
              className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-1.5 text-[11px] text-slate-300"
            >
              <span className="truncate">{url}</span>
              <button
                type="button"
                disabled={busy}
                onClick={() => void removePlacement(url)}
                className="shrink-0 text-slate-400 transition hover:text-rose-200"
                aria-label={`Remove placement ${url}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function GoogleAdsDistributionPanel({ synthesis }: { synthesis: DealGoogleAdsSynthesis }) {
  const [distribution, setDistribution] = useState<DealGoogleAdsDistribution | null>(null);
  const [plan, setPlan] = useState<DealGoogleAdsDistributionPlan | null>(null);
  const [mode, setMode] = useState<"simulate" | "live">("simulate");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const readyCount = synthesis.images.filter((img) => img.status === "ready" && img.imageUrl).length;
  const bothReady = readyCount === 2;

  useEffect(() => {
    let cancelled = false;
    setDistribution(null);
    setPlan(null);
    setMessage(null);
    (async () => {
      try {
        const res = await fetch(`/api/tests/deals-system/google-ads-distribution?synthesisId=${encodeURIComponent(synthesis.id)}`);
        const data = (await res.json()) as { ok: boolean; distribution?: DealGoogleAdsDistribution | null };
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
    const res = await fetch("/api/tests/deals-system/google-ads-distribution", {
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
      const data = await post<{ ok: boolean; error?: string; plan?: DealGoogleAdsDistributionPlan }>({
        action: "plan",
        synthesisId: synthesis.id,
      });
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
      const data = await post<{ ok: boolean; error?: string; distribution?: DealGoogleAdsDistribution }>({
        action: "dispatch",
        synthesisId: synthesis.id,
        mode,
      });
      if (!data.ok || !data.distribution) throw new Error(data.error ?? "Dispatch failed.");
      setDistribution(data.distribution);
      setPlan(data.distribution.plan);
      setMessage({
        tone: data.distribution.status === "error" ? "error" : "ok",
        text:
          data.distribution.status === "error"
            ? data.distribution.error ?? "Dispatch reported an error."
            : mode === "live"
              ? "Live PAUSED draft created in Google Ads Manager."
              : "Simulated — no Google Ads API calls made.",
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
        Step 10 · Push to Google Ads
      </p>
      <p className="mt-1 text-[11px] text-slate-400">
        Build a Google Ads delivery plan from the {readyCount} of 2 ready image(s). You can simulate,
        or create a PAUSED Responsive Display Ad draft in the live account.
      </p>

      {!bothReady && (
        <p className="mt-3 text-xs text-amber-200">
          Both the landscape and square images must be ready before a live dispatch — generate or pick a
          gallery photo for each above. Simulate mode works with any number ready.
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy}
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
            Live (paused draft)
          </button>
        </div>

        <button
          type="button"
          disabled={busy || (mode === "live" && !bothReady)}
          onClick={() => void dispatch()}
          className={`inline-flex h-9 items-center justify-center rounded-lg border px-4 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
            mode === "live"
              ? "border-rose-300/40 bg-rose-400/10 text-rose-100 hover:bg-rose-400/20"
              : "border-emerald-300/40 bg-emerald-400/10 text-emerald-100 hover:bg-emerald-400/20"
          }`}
        >
          {busy ? "Working..." : mode === "live" ? "Dispatch live (creates paused draft)" : "Dispatch (simulate)"}
        </button>

        <a
          href="/api/integrations/google/connect"
          target="_blank"
          rel="noreferrer"
          title="Start the Google OAuth reconnect flow so you can refresh the stored access and refresh token."
          className="inline-flex h-9 items-center justify-center rounded-lg border border-amber-300/40 bg-amber-400/10 px-4 text-[11px] font-semibold text-amber-100 transition hover:bg-amber-400/20"
        >
          Reconnect Google Ads
        </a>
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
            <span className="font-semibold text-slate-200">Final URL:</span> {plan.finalUrl}
          </p>
          <p className="mt-1">
            <span className="font-semibold text-slate-200">Targeting:</span>{" "}
            {plan.targeting.targeting.keywords.length} keyword(s), {plan.targeting.targeting.placements.length}{" "}
            placement(s), {plan.targeting.targeting.negativeKeywords.length} negative(s)
          </p>
          {plan.targeting.warnings.length > 0 && (
            <ul className="mt-1 list-inside list-disc text-amber-200">
              {plan.targeting.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
          <p className="mt-1">
            <span className="font-semibold text-slate-200">Images:</span>{" "}
            {[plan.landscapeImageUrl, plan.squareImageUrl].filter(Boolean).length} of 2 ready
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
                Open in Google Ads Manager →
              </a>
            </p>
          )}
          {distribution.verification && (
            <p className="mt-1 text-slate-400">
              keywords {distribution.verification.appliedKeywords}/{distribution.verification.requestedKeywords} ·
              placements {distribution.verification.appliedPlacements}/{distribution.verification.requestedPlacements} ·
              negatives {distribution.verification.appliedNegatives}/{distribution.verification.requestedNegatives}
              {!distribution.verification.matches && distribution.verification.discrepancies.length > 0 && (
                <span className="text-amber-300"> — {distribution.verification.discrepancies.join("; ")}</span>
              )}
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

export function GoogleAdsSynthesisView({
  funnelSyntheses,
  initialSyntheses,
}: {
  funnelSyntheses: DealFunnelSynthesis[];
  initialSyntheses: DealGoogleAdsSynthesis[];
}) {
  const [selectedFunnelId, setSelectedFunnelId] = useState<string | null>(funnelSyntheses[0]?.id ?? null);
  const [syntheses, setSyntheses] = useState<DealGoogleAdsSynthesis[]>(() => dedupeById(initialSyntheses));
  const [activeId, setActiveId] = useState<string | null>(initialSyntheses[0]?.id ?? null);
  const [fieldDraft, setFieldDraft] = useState<{
    businessName: string;
    headline: string;
    longHeadline: string;
    description: string;
    promptTemplate: string;
  }>({
    businessName: initialSyntheses[0]?.businessName ?? "",
    headline: initialSyntheses[0]?.headline ?? "",
    longHeadline: initialSyntheses[0]?.longHeadline ?? "",
    description: initialSyntheses[0]?.description ?? "",
    promptTemplate: initialSyntheses[0]?.promptTemplate ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [generatingAspects, setGeneratingAspects] = useState<Set<DealGoogleAdsImageAspect>>(new Set());
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [previewImage, setPreviewImage] = useState<{ url: string; alt: string } | null>(null);
  const [negationRules, setNegationRules] = useState<NegationRule[]>(DEFAULT_NEGATION_RULES);
  const [newNegationRule, setNewNegationRule] = useState("");

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
    persistNegationRules(negationRules.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)));
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

  const selectedFunnel = useMemo(
    () => funnelSyntheses.find((s) => s.id === selectedFunnelId) ?? null,
    [funnelSyntheses, selectedFunnelId]
  );
  // A synthesis's id equals its source funnel synthesis id (1:1 pairing) — used to
  // tell the operator "Load from funnel" will reuse an existing synthesis rather than
  // silently rebuild (and wipe images/placements) one that already exists.
  const existingSynthesisForSelectedFunnel = useMemo(
    () => syntheses.find((s) => s.id === selectedFunnelId) ?? null,
    [syntheses, selectedFunnelId]
  );
  const active = useMemo(() => syntheses.find((s) => s.id === activeId) ?? null, [syntheses, activeId]);
  // A Google Ads synthesis is 1:1 with its funnel (it shares the funnel's id),
  // so only show the selected funnel's synthesis.
  const visibleSyntheses = useMemo(
    () => syntheses.filter((s) => s.sourceFunnelSynthesisId === selectedFunnelId),
    [syntheses, selectedFunnelId]
  );
  // The curated gallery (operator-picked subset of SERP candidates) from the
  // source funnel synthesis — offered as a "use a real photo instead" fallback
  // per image slot, since Google disallows text/graphic overlays on generated
  // images and a generated scene can occasionally read as too generic/stock.
  const galleryCandidates = useMemo(() => {
    const funnel = funnelSyntheses.find((s) => s.id === active?.sourceFunnelSynthesisId);
    if (!funnel) return [];
    return funnel.candidates.filter((c) => funnel.galleryIds.includes(c.id));
  }, [funnelSyntheses, active]);

  function selectFunnel(funnelId: string) {
    setSelectedFunnelId(funnelId);
    const existing = syntheses.find((s) => s.sourceFunnelSynthesisId === funnelId) ?? null;
    setActiveId(existing?.id ?? null);
    setFieldDraft({
      businessName: existing?.businessName ?? "",
      headline: existing?.headline ?? "",
      longHeadline: existing?.longHeadline ?? "",
      description: existing?.description ?? "",
      promptTemplate: existing?.promptTemplate ?? "",
    });
  }

  async function post(body: Record<string, unknown>): Promise<SynthResponse> {
    const res = await fetch("/api/tests/deals-system/google-ads-synthesis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return (await res.json()) as SynthResponse;
  }

  function applySynthesis(s: DealGoogleAdsSynthesis) {
    setSyntheses((prev) => {
      const next = prev.filter((x) => x.id !== s.id);
      next.push(s);
      return next;
    });
    setActiveId(s.id);
    setFieldDraft({
      businessName: s.businessName,
      headline: s.headline,
      longHeadline: s.longHeadline,
      description: s.description,
      promptTemplate: s.promptTemplate,
    });
  }

  async function init(force = false) {
    if (!selectedFunnelId) return;
    if (force && !window.confirm("Start over? This permanently discards this synthesis's generated images, edited fields, and placements.")) {
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const data = await post({ action: "init", funnelSynthesisId: selectedFunnelId, force });
      if (!data.ok || !data.synthesis) throw new Error(data.error ?? "Initialization failed.");
      // Use the server's authoritative list when provided (dedupe by id
      // defensively — the store must never yield two entries with the same
      // id, or the tab .map() and key={active.id} both break), otherwise
      // fall back to merging just the returned synthesis. Do NOT both
      // applySynthesis() AND setSyntheses(data.syntheses): that double-set
      // raced and could leave a duplicate id in state.
      const synthesis = data.synthesis;
      if (data.syntheses) {
        setSyntheses(dedupeById(data.syntheses));
        setActiveId(synthesis.id);
        setFieldDraft({
          businessName: synthesis.businessName,
          headline: synthesis.headline,
          longHeadline: synthesis.longHeadline,
          description: synthesis.description,
          promptTemplate: synthesis.promptTemplate,
        });
      } else {
        applySynthesis(synthesis);
      }
      setMessage({
        tone: "ok",
        text: force
          ? "Synthesis reset from the funnel's lead carousel card."
          : "Lead carousel card loaded — edit the ad fields and generate images.",
      });
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  const fieldsDirty = useMemo(() => {
    if (!active) return false;
    return (
      fieldDraft.businessName !== active.businessName ||
      fieldDraft.headline !== active.headline ||
      fieldDraft.longHeadline !== active.longHeadline ||
      fieldDraft.description !== active.description ||
      fieldDraft.promptTemplate !== active.promptTemplate
    );
  }, [active, fieldDraft]);

  async function saveFields() {
    if (!active) return;
    setBusy(true);
    setMessage(null);
    try {
      const data = await post({ action: "update_fields", synthesisId: active.id, ...fieldDraft });
      if (!data.ok || !data.synthesis) throw new Error(data.error ?? "Saving fields failed.");
      applySynthesis(data.synthesis);
      setMessage({ tone: "ok", text: "Ad fields saved." });
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  /**
   * Persist whatever's currently in the field draft (if it differs from the
   * last-saved synthesis) before generating — otherwise generation reads the
   * stale promptTemplate/headline/longHeadline from the on-disk cache and
   * silently ignores unsaved edits in the boxes above.
   */
  async function saveFieldsIfDirty(): Promise<void> {
    if (!active || !fieldsDirty) return;
    const data = await post({ action: "update_fields", synthesisId: active.id, ...fieldDraft });
    if (!data.ok || !data.synthesis) throw new Error(data.error ?? "Saving fields failed.");
    applySynthesis(data.synthesis);
  }

  async function generateOneAspect(
    synthesisId: string,
    aspect: DealGoogleAdsImageAspect
  ): Promise<{ ok: boolean; error?: string }> {
    const data = await post({ action: "generate_image", synthesisId, aspect, promptSuffix: negationText });
    const updatedAsset = data.synthesis?.images.find((img) => img.aspect === aspect);
    if (updatedAsset) {
      setSyntheses((prev) =>
        prev.map((s) =>
          s.id === synthesisId
            ? { ...s, images: s.images.map((img) => (img.aspect === aspect ? updatedAsset : img)) }
            : s
        )
      );
    }
    return { ok: data.ok, error: data.error };
  }

  async function generateImage(aspect: DealGoogleAdsImageAspect) {
    if (!active) return;
    const synthesisId = active.id;
    setBusy(true);
    setGeneratingAspects((prev) => new Set(prev).add(aspect));
    setMessage(null);
    try {
      await saveFieldsIfDirty();
      const { ok, error } = await generateOneAspect(synthesisId, aspect);
      if (!ok) throw new Error(error ?? "Image generation failed.");
      setMessage({ tone: "ok", text: `${ASPECT_LABEL[aspect]} image generated.` });
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
      setGeneratingAspects((prev) => {
        const next = new Set(prev);
        next.delete(aspect);
        return next;
      });
    }
  }

  async function generateBoth() {
    if (!active) return;
    const synthesisId = active.id;
    const aspects = active.images.map((img) => img.aspect);
    setBusy(true);
    setGeneratingAspects(new Set(aspects));
    setMessage(null);
    try {
      await saveFieldsIfDirty();
      const results = await Promise.all(aspects.map((aspect) => generateOneAspect(synthesisId, aspect)));
      const failures = results.filter((r) => !r.ok);
      if (failures.length > 0) {
        setMessage({
          tone: "error",
          text: `${failures.length} of ${aspects.length} image(s) failed: ${failures.map((f) => f.error).join("; ")}`,
        });
      } else {
        setMessage({ tone: "ok", text: `${aspects.length} image(s) generated.` });
      }
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
      setGeneratingAspects(new Set());
    }
  }

  async function revertImage(aspect: DealGoogleAdsImageAspect, historyIndex: number) {
    if (!active) return;
    const synthesisId = active.id;
    setBusy(true);
    setMessage(null);
    try {
      const data = await post({ action: "revert_image", synthesisId, aspect, historyIndex });
      if (!data.ok) throw new Error(data.error ?? "Revert failed.");
      const revertedAsset = data.synthesis?.images.find((img) => img.aspect === aspect);
      if (revertedAsset) {
        setSyntheses((prev) =>
          prev.map((s) =>
            s.id === synthesisId
              ? { ...s, images: s.images.map((img) => (img.aspect === aspect ? revertedAsset : img)) }
              : s
          )
        );
      }
      setMessage({ tone: "ok", text: `${ASPECT_LABEL[aspect]} reverted to a previous image.` });
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  async function useGalleryImage(aspect: DealGoogleAdsImageAspect, candidateId: string) {
    if (!active) return;
    const synthesisId = active.id;
    setBusy(true);
    setMessage(null);
    try {
      const data = await post({ action: "use_gallery_image", synthesisId, aspect, candidateId });
      if (!data.ok) throw new Error(data.error ?? "Failed to use gallery photo.");
      const updatedAsset = data.synthesis?.images.find((img) => img.aspect === aspect);
      if (updatedAsset) {
        setSyntheses((prev) =>
          prev.map((s) =>
            s.id === synthesisId
              ? { ...s, images: s.images.map((img) => (img.aspect === aspect ? updatedAsset : img)) }
              : s
          )
        );
      }
      setMessage({ tone: "ok", text: `${ASPECT_LABEL[aspect]} switched to a gallery photo.` });
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  const businessNameOver = fieldDraft.businessName.length > GOOGLE_ADS_BUSINESS_NAME_MAX;
  const headlineOver = fieldDraft.headline.length > GOOGLE_ADS_HEADLINE_MAX;
  const longHeadlineOver = fieldDraft.longHeadline.length > GOOGLE_ADS_LONG_HEADLINE_MAX;
  const descriptionOver = fieldDraft.description.length > GOOGLE_ADS_DESCRIPTION_MAX;

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-amber-300">Deal Workflow · Step 9</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-white">Google Ads Synthesis</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
            Turn the Step 7 funnel synthesis&apos;s lead carousel card into a ready-to-launch Google
            Responsive Display Ad. Edit the headline/long headline/description text fields, then
            generate the landscape and square image assets with GPT Image 2 — no text baked into the
            image, since Google composites the headline fields itself.
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
            No funnel syntheses found yet. Run Step 7 - Funnel Synthesis first.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {funnelSyntheses.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => selectFunnel(s.id)}
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
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={busy || !selectedFunnel}
            onClick={() => void init(false)}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-cyan-300/40 bg-cyan-400/10 px-5 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy && generatingAspects.size === 0
              ? "Loading…"
              : existingSynthesisForSelectedFunnel
                ? "Load existing synthesis"
                : "Load from funnel"}
          </button>
          {existingSynthesisForSelectedFunnel && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void init(true)}
              title="Permanently discards this synthesis's generated images, edited fields, and placements"
              className="inline-flex h-11 items-center justify-center rounded-xl border border-rose-300/40 bg-rose-400/10 px-4 text-[12px] font-semibold text-rose-100 transition hover:bg-rose-400/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Start over
            </button>
          )}
        </div>
      </section>

      {/* Synthesis tabs — scoped to the selected funnel */}
      {visibleSyntheses.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {visibleSyntheses.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                setActiveId(s.id);
                setFieldDraft({
                  businessName: s.businessName,
                  headline: s.headline,
                  longHeadline: s.longHeadline,
                  description: s.description,
                  promptTemplate: s.promptTemplate,
                });
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
          {/* Editable ad text fields */}
          <section className="mb-6 rounded-2xl border border-amber-400/25 bg-amber-500/[0.04] p-5">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-amber-300">
              Responsive Display Ad text fields
            </p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                  Business name
                </label>
                <input
                  type="text"
                  value={fieldDraft.businessName}
                  onChange={(e) => setFieldDraft((f) => ({ ...f, businessName: e.target.value }))}
                  placeholder="Enter business name"
                  title="Business name"
                  className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-slate-200 focus:border-amber-300/50 focus:outline-none"
                />
                <p className={`mt-1 text-[10px] ${businessNameOver ? "text-amber-300" : "text-slate-500"}`}>
                  {fieldDraft.businessName.length}/{GOOGLE_ADS_BUSINESS_NAME_MAX}
                </p>
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                  Headline
                </label>
                <input
                  type="text"
                  value={fieldDraft.headline}
                  onChange={(e) => setFieldDraft((f) => ({ ...f, headline: e.target.value }))}
                  placeholder="Enter headline"
                  title="Headline"
                  className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-slate-200 focus:border-amber-300/50 focus:outline-none"
                />
                <p className={`mt-1 text-[10px] ${headlineOver ? "text-amber-300" : "text-slate-500"}`}>
                  {fieldDraft.headline.length}/{GOOGLE_ADS_HEADLINE_MAX}
                </p>
              </div>
              <div className="sm:col-span-2">
                <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                  Long headline
                </label>
                <input
                  type="text"
                  value={fieldDraft.longHeadline}
                  onChange={(e) => setFieldDraft((f) => ({ ...f, longHeadline: e.target.value }))}
                  placeholder="Enter long headline"
                  title="Long headline"
                  className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-slate-200 focus:border-amber-300/50 focus:outline-none"
                />
                <p className={`mt-1 text-[10px] ${longHeadlineOver ? "text-amber-300" : "text-slate-500"}`}>
                  {fieldDraft.longHeadline.length}/{GOOGLE_ADS_LONG_HEADLINE_MAX}
                </p>
              </div>
              <div className="sm:col-span-2">
                <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                  Description
                </label>
                <textarea
                  value={fieldDraft.description}
                  onChange={(e) => setFieldDraft((f) => ({ ...f, description: e.target.value }))}
                  rows={2}
                  placeholder="Enter description"
                  title="Description"
                  className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs leading-5 text-slate-200 focus:border-amber-300/50 focus:outline-none"
                />
                <p className={`mt-1 text-[10px] ${descriptionOver ? "text-amber-300" : "text-slate-500"}`}>
                  {fieldDraft.description.length}/{GOOGLE_ADS_DESCRIPTION_MAX}
                </p>
              </div>
            </div>

            <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.22em] text-amber-300">
              Image prompt template
            </p>
            <p className="mt-1 text-[11px] text-slate-400">
              Use <code className="text-amber-200">{"{{HEADLINE}}"}</code> and{" "}
              <code className="text-amber-200">{"{{LONG_HEADLINE}}"}</code> for scene context only — the
              model should not render this text onto the image; Google composites the fields above
              itself.
            </p>
            <textarea
              value={fieldDraft.promptTemplate}
              onChange={(e) => setFieldDraft((f) => ({ ...f, promptTemplate: e.target.value }))}
              rows={5}
              aria-label="Image prompt template"
              className="mt-3 w-full rounded-lg border border-white/10 bg-black/30 p-3 text-xs leading-5 text-slate-200 focus:border-amber-300/50 focus:outline-none"
            />

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy || !fieldsDirty}
                onClick={() => void saveFields()}
                className="inline-flex h-9 items-center justify-center rounded-lg border border-amber-300/40 bg-amber-400/10 px-4 text-[11px] font-semibold text-amber-100 transition hover:bg-amber-400/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Save fields
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void generateBoth()}
                className="inline-flex h-9 items-center justify-center rounded-lg border border-fuchsia-300/40 bg-fuchsia-400/10 px-4 text-[11px] font-semibold text-fuchsia-100 transition hover:bg-fuchsia-400/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {generatingAspects.size > 0 ? "Generating…" : "Generate both images"}
              </button>
            </div>
          </section>

          {/* Persistent negation panel — applies to every campaign's image generations on this browser */}
          <section className="mb-6 rounded-2xl border border-rose-400/25 bg-rose-500/[0.04] p-5">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-rose-300">
              Negation (applies to all campaigns)
            </p>
            <p className="mt-1 text-[11px] text-slate-400">
              Appended to every image prompt after the template above. Saved in this browser and
              reused across all deals/campaigns. The first rule keeps generated images compliant
              with Google&apos;s ban on designed text/graphic overlays in standard Display image
              assets — disable it only if you intend a scene with naturally-occurring text (e.g. a
              port sign), which Google&apos;s policy permits.
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
                  <button type="button" onClick={() => toggleNegationRule(rule.id)} title={rule.enabled ? "Disable this rule" : "Enable this rule"} className="cursor-pointer">
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
              {negationRules.length === 0 && <span className="text-[11px] text-slate-500">No negation rules.</span>}
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
                placeholder="Add a new rule, e.g. Do not include sunset lighting"
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

          <PlacementsPanel
            key={`placements-${active.id}`}
            synthesis={active}
            onSynthesisUpdated={(s) =>
              setSyntheses((prev) => prev.map((existing) => (existing.id === s.id ? s : existing)))
            }
          />

          {/* Image assets */}
          <div className="grid gap-4 sm:grid-cols-2">
            {active.images.map((asset) => (
              <ImagePanel
                key={asset.aspect}
                asset={asset}
                promptTemplate={fieldDraft.promptTemplate}
                synthesis={{ headline: fieldDraft.headline, longHeadline: fieldDraft.longHeadline }}
                negationText={negationText}
                busy={busy}
                isGenerating={generatingAspects.has(asset.aspect)}
                galleryCandidates={galleryCandidates}
                onGenerate={(aspect) => void generateImage(aspect)}
                onPreviewImage={(url, alt) => setPreviewImage({ url, alt })}
                onRevert={(aspect, historyIdx) => void revertImage(aspect, historyIdx)}
                onUseGalleryImage={(aspect, candidateId) => void useGalleryImage(aspect, candidateId)}
              />
            ))}
          </div>

          <GoogleAdsDistributionPanel key={`distribution-${active.id}`} synthesis={active} />
        </>
      )}

      {previewImage && (
        <ImageLightbox url={previewImage.url} alt={previewImage.alt} onClose={() => setPreviewImage(null)} />
      )}
    </div>
  );
}
