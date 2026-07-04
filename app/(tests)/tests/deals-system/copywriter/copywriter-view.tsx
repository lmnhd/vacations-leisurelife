"use client";

import { useMemo, useState } from "react";

import type {
  DealAdCopy,
  DealAdVariant,
  DealTripManifest,
} from "@/lib/cb/deals-system";

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

function AdCopyCard({
  adCopy,
  onSelectVariant,
  onDelete,
  busy,
  justWritten,
}: {
  adCopy: DealAdCopy;
  onSelectVariant: (adCopyId: string, variantIndex: number) => void;
  onDelete: (adCopyId: string) => void;
  busy: boolean;
  justWritten: boolean;
}) {
  const selectedIndex = adCopy.selectedVariantIndex ?? 0;
  return (
    <article className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-white">{adCopy.campaignName}</h3>
          <p className="mt-0.5 text-[11px] text-slate-400">{adCopy.targetAudienceTag}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {justWritten && (
            <span className="rounded-full border border-cyan-400/40 bg-cyan-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-200">
              just written
            </span>
          )}
          <span className="rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-200">
            {adCopy.variants.length} variant(s)
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={() => onDelete(adCopy.id)}
            className="rounded-full border border-rose-400/30 bg-rose-500/10 px-2.5 py-1 text-[10px] font-semibold text-rose-200 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Delete
          </button>
        </div>
      </div>

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
    </article>
  );
}

/**
 * Single-focus workspace: one manifest (deal) is active at a time, picked from
 * a compact dropdown. Only the selected manifest's summary + its own ad copy
 * render — no global "every ad copy ever" list, no duplicated "latest" card.
 */
export function CopywriterView({
  manifests,
  initialAdCopies,
  preselectedManifestId,
}: {
  manifests: DealTripManifest[];
  initialAdCopies: DealAdCopy[];
  preselectedManifestId: string | null;
}) {
  const firstResolvedId = manifests.find((m) => Boolean(m.resolvedPackage))?.id ?? null;
  const [selectedId, setSelectedId] = useState<string | null>(
    preselectedManifestId && manifests.some((m) => m.id === preselectedManifestId)
      ? preselectedManifestId
      : firstResolvedId
  );
  const [variantCount, setVariantCount] = useState(2);
  const [adCopies, setAdCopies] = useState<DealAdCopy[]>(initialAdCopies);
  const [latestId, setLatestId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const selected = useMemo(
    () => manifests.find((m) => m.id === selectedId) ?? null,
    [manifests, selectedId]
  );

  // Ad copy is keyed to its source manifest via `unified-<manifestId>` — the
  // workspace shows only the selected manifest's copies, newest first.
  const selectedAdCopies = useMemo(() => {
    if (!selectedId) return [];
    const key = `unified-${selectedId}`;
    return [...adCopies].filter((a) => a.sourceUnifiedManifestId === key).reverse();
  }, [adCopies, selectedId]);

  const manifestIds = useMemo(() => new Set(manifests.map((m) => `unified-${m.id}`)), [manifests]);
  const orphanedAdCopies = useMemo(
    () => adCopies.filter((a) => !manifestIds.has(a.sourceUnifiedManifestId)),
    [adCopies, manifestIds]
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
      if (latestId === id) setLatestId(null);
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
      setLatestId(data.adCopy.id);
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

      {/* ── Workspace: one manifest at a time ─────────────────────────────── */}
      <section className="mb-6 rounded-2xl border border-white/10 bg-slate-950/70 p-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">
          Working on
        </p>
        {manifests.length === 0 ? (
          <p className="mt-2 text-sm text-amber-200">
            No trip manifests cached yet. Run Step 2 · Trip Manifestation first.
          </p>
        ) : (
          <>
            <select
              aria-label="Select the trip manifest to work on"
              className="mt-3 h-11 w-full rounded-lg border border-white/10 bg-black/25 px-3 text-sm text-white outline-none transition focus:border-cyan-300/60"
              value={selectedId ?? ""}
              onChange={(e) => {
                setSelectedId(e.target.value || null);
                setLatestId(null);
                setMessage(null);
              }}
            >
              {manifests.map((m) => {
                const resolved = Boolean(m.resolvedPackage);
                return (
                  <option key={m.id} value={m.id} disabled={!resolved}>
                    {m.sailingAngleTitle} — {m.assembleDraft.cruiseLine} ·{" "}
                    {resolved
                      ? m.resolvedPackage?.shipName ?? m.resolvedPackage?.cruiseName
                      : "needs resolution (Step 2)"}
                  </option>
                );
              })}
            </select>

            {selected && (
              <>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-2.5 py-1 font-semibold text-cyan-200">
                    {selected.isolatedNiche}
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-slate-300">
                    {selected.assembleDraft.cruiseLine} · {selected.assembleDraft.destination}
                  </span>
                  {selected.resolvedPackage ? (
                    <span className="rounded-full border border-emerald-400/35 bg-emerald-500/10 px-2.5 py-1 font-semibold text-emerald-200">
                      resolved · {selected.resolvedPackage.shipName ?? selected.resolvedPackage.cruiseName}
                      {selected.resolvedPackage.sailDateIso ? ` · ${selected.resolvedPackage.sailDateIso}` : ""}
                    </span>
                  ) : (
                    <span className="rounded-full border border-amber-400/35 bg-amber-500/10 px-2.5 py-1 font-semibold text-amber-200">
                      needs resolution
                    </span>
                  )}
                  <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-slate-400">
                    {selectedAdCopies.length} ad cop{selectedAdCopies.length === 1 ? "y" : "ies"} for this deal
                  </span>
                </div>

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
                    {busy ? "Writing…" : selectedAdCopies.length > 0 ? "Rewrite ad copy" : "Unify & write ad copy"}
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </section>

      {/* ── The selected deal's ad copy only ──────────────────────────────── */}
      {selected &&
        (selectedAdCopies.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.03] p-6 text-sm text-slate-400">
            No ad copy for this deal yet. Use &ldquo;Unify &amp; write ad copy&rdquo; above.
          </div>
        ) : (
          <div className="space-y-4">
            {selectedAdCopies.map((adCopy) => (
              <AdCopyCard
                key={adCopy.id}
                adCopy={adCopy}
                onSelectVariant={(id, i) => void selectVariant(id, i)}
                onDelete={(id) => void removeAdCopy(id)}
                busy={busy}
                justWritten={adCopy.id === latestId}
              />
            ))}
          </div>
        ))}

      {/* Copies whose source manifest no longer exists would otherwise be
          unreachable through the selector — keep them manageable, collapsed. */}
      {orphanedAdCopies.length > 0 && (
        <details className="mt-6 rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <summary className="cursor-pointer text-xs font-semibold text-slate-400">
            Orphaned ad copy ({orphanedAdCopies.length}) — source manifest no longer exists
          </summary>
          <ul className="mt-3 space-y-2">
            {orphanedAdCopies.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2"
              >
                <span className="text-xs text-slate-300">
                  {a.campaignName}{" "}
                  <span className="text-slate-500">({a.variants.length} variant(s))</span>
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void removeAdCopy(a.id)}
                  className="rounded-full border border-rose-400/30 bg-rose-500/10 px-2.5 py-1 text-[10px] font-semibold text-rose-200 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
