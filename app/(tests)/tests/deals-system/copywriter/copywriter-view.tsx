"use client";

import { useMemo, useState } from "react";

import type {
  DealAdCopy,
  DealAdVariant,
  DealTripManifest,
} from "@/lib/cb/deals-system";

import { ResultList } from "../result-list";

interface WriteResponse {
  ok: boolean;
  error?: string;
  adCopy?: DealAdCopy;
  rejectedPromoIds?: string[];
  adCopies?: DealAdCopy[];
}

function VariantCard({
  variant,
  index,
  selected,
  onSelect,
  busy,
}: {
  variant: DealAdVariant;
  index: number;
  selected: boolean;
  onSelect: () => void;
  busy: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-4 transition ${
        selected ? "border-emerald-400/50 bg-emerald-500/[0.06]" : "border-white/10 bg-black/20"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-300">
          {variant.variantLabel}
        </span>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-slate-400">
            promo: {variant.promoApplied}
          </span>
          {selected ? (
            <span className="rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-200">
              ★ final ad
            </span>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={onSelect}
              className="rounded-full border border-white/15 bg-white/5 px-2.5 py-0.5 text-[10px] font-semibold text-slate-300 transition hover:border-emerald-300/50 hover:text-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Use this as the final ad
            </button>
          )}
        </div>
      </div>

      <h4 className="mt-2 text-base font-bold leading-snug text-white">{variant.headline}</h4>
      <p className="mt-2 whitespace-pre-wrap text-xs leading-6 text-slate-300">{variant.bodyCopy}</p>

      <p className="mt-3 text-[11px] italic leading-5 text-slate-500">{variant.pricingDisclaimers}</p>

      <div className="mt-3 inline-flex items-center rounded-full border border-cyan-300/40 bg-cyan-400/10 px-3 py-1 text-[11px] font-semibold text-cyan-100">
        👉 {variant.callToAction}
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
            Demographic targeting
          </p>
          <p className="mt-1 text-[11px] leading-5 text-slate-400">
            {variant.adPlatformTargetingHooks.demographicTargeting}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
            Interest keywords
          </p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {variant.adPlatformTargetingHooks.interestKeywords.map((kw) => (
              <span
                key={kw}
                className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] text-slate-300"
              >
                {kw}
              </span>
            ))}
          </div>
        </div>
      </div>

      {variant.voiceWarnings.length > 0 && (
        <ul className="mt-3 space-y-1 text-[11px] text-amber-200">
          {variant.voiceWarnings.map((w) => (
            <li key={w}>⚠ {w}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Compact one-line summary for the collapsed result header. */
function AdCopySummary({ adCopy }: { adCopy: DealAdCopy }) {
  const selectedIndex = adCopy.selectedVariantIndex ?? 0;
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="text-sm font-semibold text-white">{adCopy.campaignName}</span>
      <span className="text-[11px] text-slate-400">{adCopy.targetAudienceTag}</span>
      <span className="rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-200">
        {adCopy.variants.length} variant(s)
      </span>
      <span className="text-[10px] text-slate-500">
        final: {adCopy.variants[selectedIndex]?.variantLabel ?? "—"}
      </span>
    </div>
  );
}

function AdCopyCard({
  adCopy,
  onSelectVariant,
  busy,
  bare = false,
}: {
  adCopy: DealAdCopy;
  onSelectVariant: (adCopyId: string, variantIndex: number) => void;
  busy: boolean;
  /** When true, render without the outer card frame (e.g. inside a ResultList). */
  bare?: boolean;
}) {
  const selectedIndex = adCopy.selectedVariantIndex ?? 0;
  const Wrapper = bare ? "div" : "article";
  return (
    <Wrapper className={bare ? "" : "rounded-xl border border-white/10 bg-white/[0.035] p-4"}>
      {!bare && (
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-white">{adCopy.campaignName}</h3>
            <p className="mt-0.5 text-[11px] text-slate-400">{adCopy.targetAudienceTag}</p>
          </div>
          <span className="rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-200">
            {adCopy.variants.length} variant(s)
          </span>
        </div>
      )}

      <p className="mt-2 text-[11px] text-slate-400">
        Final ad:{" "}
        <span className="font-semibold text-emerald-200">
          {adCopy.variants[selectedIndex]?.variantLabel ?? "—"}
        </span>{" "}
        {adCopy.selectedVariantIndex === undefined && (
          <span className="text-slate-500">(defaulting to the primary — pick one to lock it in)</span>
        )}
      </p>

      <div className="mt-3 space-y-3">
        {adCopy.variants.map((v, i) => (
          <VariantCard
            key={`${adCopy.id}-${i}`}
            variant={v}
            index={i}
            selected={i === selectedIndex}
            onSelect={() => onSelectVariant(adCopy.id, i)}
            busy={busy}
          />
        ))}
      </div>

      <div className="mt-3">
        <a
          href={`/tests/deals-system/funnel-synthesis?adCopyId=${encodeURIComponent(adCopy.id)}`}
          className="inline-flex h-8 items-center rounded-lg border border-fuchsia-300/40 bg-fuchsia-400/10 px-3 text-[11px] font-semibold text-fuchsia-100 transition hover:bg-fuchsia-400/20"
        >
          Synthesize funnel →
        </a>
      </div>

      {adCopy.aiTrace && (
        <details className="mt-3 rounded-lg border border-white/10 bg-black/20 p-2">
          <summary className="cursor-pointer text-[11px] font-semibold text-slate-300">
            AI debug{" "}
            <span className="text-slate-500">
              ({adCopy.aiTrace.model} · {adCopy.aiTrace.latencyMs}ms)
            </span>
          </summary>
          <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-black/40 p-2 text-[10px] leading-4 text-slate-400">
            {adCopy.aiTrace.promptSent}
          </pre>
          <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-black/40 p-2 text-[10px] leading-4 text-slate-400">
            {adCopy.aiTrace.rawResponse}
          </pre>
        </details>
      )}
    </Wrapper>
  );
}

export function CopywriterView({
  manifests,
  initialAdCopies,
  preselectedManifestId,
}: {
  manifests: DealTripManifest[];
  initialAdCopies: DealAdCopy[];
  preselectedManifestId: string | null;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(
    preselectedManifestId && manifests.some((m) => m.id === preselectedManifestId)
      ? preselectedManifestId
      : manifests[0]?.id ?? null
  );
  const [variantCount, setVariantCount] = useState(2);
  const [adCopies, setAdCopies] = useState<DealAdCopy[]>(initialAdCopies);
  const [latest, setLatest] = useState<DealAdCopy | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const selected = useMemo(
    () => manifests.find((m) => m.id === selectedId) ?? null,
    [manifests, selectedId]
  );

  async function removeAdCopy(id: string) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/tests/deals-system/copywriter?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = (await res.json()) as WriteResponse;
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Delete failed.");
      if (data.adCopies) setAdCopies(data.adCopies);
      if (latest?.id === id) setLatest(null);
      setMessage({ tone: "ok", text: "Ad copy removed." });
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  async function selectVariant(adCopyId: string, variantIndex: number) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/tests/deals-system/copywriter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "select", adCopyId, variantIndex }),
      });
      const data = (await res.json()) as WriteResponse;
      if (!res.ok || !data.ok || !data.adCopy) {
        throw new Error(data.error ?? "Selecting the variant failed.");
      }
      if (data.adCopies) setAdCopies(data.adCopies);
      if (latest && latest.id === adCopyId) setLatest(data.adCopy);
      setMessage({
        tone: "ok",
        text: `Final ad set to "${data.adCopy.variants[variantIndex]?.variantLabel ?? variantIndex}". This variant becomes the deal-page headline at publish.`,
      });
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  async function write() {
    if (!selectedId) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/tests/deals-system/copywriter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "write", manifestId: selectedId, variantCount }),
      });
      const data = (await res.json()) as WriteResponse;
      if (!res.ok || !data.ok || !data.adCopy) {
        throw new Error(data.error ?? "Ad copy generation failed.");
      }
      setLatest(data.adCopy);
      if (data.adCopies) setAdCopies(data.adCopies);
      setMessage({
        tone: "ok",
        text: `Ad copy written — ${data.adCopy.variants.length} variant(s)${
          data.rejectedPromoIds && data.rejectedPromoIds.length > 0
            ? `, ${data.rejectedPromoIds.length} stray promo id(s) dropped`
            : ""
        }.`,
      });
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
            Deal Workflow · Step 3
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-white">Ad Copywriter</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
            Pick a trip manifest. The copywriter unifies its creative brief (Step 1) with its
            inventory + promo manifest (Step 2) and writes direct-response ad copy — a primary
            retail play plus aspirational upsells — expanding the angle&apos;s exact hook, never
            originating a new one.
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
          Select a trip manifest
        </p>
        {manifests.length === 0 ? (
          <p className="mt-2 text-sm text-amber-200">
            No trip manifests cached yet. Run Step 2 · Trip Manifestation first.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {manifests.map((m) => {
              const resolved = Boolean(m.resolvedPackage);
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    disabled={!resolved}
                    onClick={() => setSelectedId(m.id)}
                    className={`flex w-full items-start gap-3 rounded-lg border px-3 py-2 text-left transition ${
                      !resolved
                        ? "cursor-not-allowed border-white/5 bg-white/[0.015] opacity-50"
                        : selectedId === m.id
                          ? "border-cyan-300/60 bg-cyan-400/10"
                          : "border-white/10 bg-white/[0.03] hover:border-white/25"
                    }`}
                  >
                    <span
                      className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
                        !resolved ? "bg-rose-400/60" : selectedId === m.id ? "bg-cyan-300" : "bg-slate-600"
                      }`}
                    />
                    <span>
                      <span className="block text-xs font-semibold text-white">
                        {m.sailingAngleTitle}
                      </span>
                      <span className="block text-[11px] text-slate-400">
                        {m.isolatedNiche} · {m.assembleDraft.cruiseLine} · {m.assembleDraft.destination}
                        {resolved
                          ? ` · resolved · ${m.resolvedPackage?.shipName ?? m.resolvedPackage?.cruiseName}`
                          : " · needs resolution in Step 2 (no real cruise found yet)"}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {selected && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-slate-300">
              Variants
              <select
                value={variantCount}
                onChange={(e) => setVariantCount(Number(e.target.value))}
                className="h-9 rounded-lg border border-white/10 bg-black/25 px-2 text-sm text-white outline-none"
              >
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={busy}
              onClick={() => void write()}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-cyan-300/40 bg-cyan-400/10 px-5 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Writing…" : "Unify & write ad copy"}
            </button>
          </div>
        )}
      </section>

      {latest && (
        <div className="mb-6">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">
            Latest ad copy
          </p>
          <AdCopyCard adCopy={latest} onSelectVariant={(id, i) => void selectVariant(id, i)} busy={busy} />
        </div>
      )}

      <ResultList
        items={[...adCopies].reverse()}
        getId={(a) => a.id}
        label="Ad copy"
        emptyText="No ad copy yet. Select a manifest above and write it."
        busy={busy}
        onDelete={(id) => void removeAdCopy(id)}
        renderSummary={(a) => <AdCopySummary adCopy={a} />}
        renderDetail={(a) => (
          <AdCopyCard
            adCopy={a}
            onSelectVariant={(id, i) => void selectVariant(id, i)}
            busy={busy}
            bare
          />
        )}
      />
    </div>
  );
}
