"use client";

import { useMemo, useState } from "react";

import type {
  DealDiscoveryIdea,
  DealTripManifest,
} from "@/lib/cb/deals-system";

interface PrefilterInfo {
  kept: number;
  dropped: Array<{ id: string; vendor: string; reason: string }>;
  diagnostics: string[];
}

interface ManifestResponse {
  ok: boolean;
  error?: string;
  manifest?: DealTripManifest;
  prefilter?: PrefilterInfo;
  rejectedPromoIds?: string[];
  manifests?: DealTripManifest[];
}

function Labeled({ label, value }: { label: string; value?: string | number }) {
  if (value === undefined || value === "") return null;
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-1 text-xs leading-5 text-slate-300">{value}</p>
    </div>
  );
}

function ManifestCard({
  manifest,
  prefilter,
  rejectedPromoIds,
}: {
  manifest: DealTripManifest;
  prefilter?: PrefilterInfo;
  rejectedPromoIds?: string[];
}) {
  const d = manifest.assembleDraft;
  const q = manifest.lookupQuery;
  return (
    <article className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-white">{manifest.sailingAngleTitle}</h3>
          <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-300/80">
            {manifest.isolatedNiche}
          </p>
        </div>
        <span className="rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-200">
          manifest
        </span>
      </div>

      {/* Pre-fills SOURCE & ASSEMBLE */}
      <div className="mt-3 rounded-lg border border-cyan-400/20 bg-cyan-500/[0.05] p-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-300">
          Source &amp; Assemble draft (packageId, ship &amp; link resolved by lookup)
        </p>
        <div className="mt-2 grid gap-3 md:grid-cols-2">
          <Labeled label="Cruise line" value={d.cruiseLine} />
          <Labeled label="Ship class hint" value={d.shipClassHint} />
          <Labeled label="Itinerary" value={d.itineraryName} />
          <Labeled label="Destination" value={d.destination} />
          <Labeled label="Nights" value={d.nights} />
          <Labeled label="Departure port hint" value={d.departurePortHint} />
          <Labeled label="Ports of call" value={d.portsOfCall.join(", ")} />
          <Labeled
            label="Sail window"
            value={`${d.sailWindow.earliestIso ?? "?"} .. ${d.sailWindow.latestIso ?? "?"}`}
          />
        </div>
        <p className="mt-2 text-[11px] italic leading-4 text-slate-400">{d.sailWindow.rationale}</p>
      </div>

      {/* Operator lookup query */}
      <div className="mt-3 rounded-lg border border-amber-400/20 bg-amber-500/[0.05] p-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber-300">
          Run these in Package Lookup to resolve the real package + link
        </p>
        <div className="mt-2 grid gap-2 md:grid-cols-3">
          <Labeled label="Line" value={q.line} />
          <Labeled label="Ship" value={q.ship} />
          <Labeled label="Destination" value={q.destination} />
          <Labeled label="Date" value={q.date} />
          <Labeled label="Nights" value={q.nights} />
          <Labeled label="Port" value={q.port} />
          <Labeled label="Window days" value={q.windowDays} />
        </div>
      </div>

      {/* Applied promos */}
      <div className="mt-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
          Applied promos ({manifest.appliedPromos.length})
        </p>
        {manifest.appliedPromos.length === 0 ? (
          <p className="mt-1 text-xs text-slate-400">No promotions matched this trip.</p>
        ) : (
          <ul className="mt-1 space-y-2">
            {manifest.appliedPromos.map((promo) => (
              <li
                key={promo.promoRecordId}
                className="rounded-lg border border-white/10 bg-black/20 p-2 text-xs text-slate-300"
              >
                <span className="font-semibold text-white">{promo.promoRecordId}</span>{" "}
                <span className="text-slate-500">({promo.status.replaceAll("_", " ")})</span>
                {promo.matchedOn.length > 0 && (
                  <p className="mt-1 text-[11px] text-slate-400">Matched on: {promo.matchedOn.join(", ")}</p>
                )}
                {promo.warnings.length > 0 && (
                  <p className="mt-1 text-[11px] text-amber-200">⚠ {promo.warnings.join("; ")}</p>
                )}
              </li>
            ))}
          </ul>
        )}
        {rejectedPromoIds && rejectedPromoIds.length > 0 && (
          <p className="mt-1 text-[11px] text-rose-300">
            Dropped {rejectedPromoIds.length} hallucinated promo id(s): {rejectedPromoIds.join(", ")}
          </p>
        )}
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <Labeled label="Promo strategy" value={manifest.promoStrategy} />
        <Labeled label="Manifest reasoning" value={manifest.manifestReasoning} />
      </div>

      {prefilter && (
        <p className="mt-3 text-[11px] leading-4 text-slate-500">
          Prefilter: {prefilter.kept} promo(s) kept, {prefilter.dropped.length} dropped.{" "}
          {prefilter.diagnostics.join(" ")}
        </p>
      )}

      <div className="mt-3">
        <a
          href={`/tests/deals-system/copywriter?manifestId=${encodeURIComponent(manifest.id)}`}
          className="inline-flex h-8 items-center rounded-lg border border-cyan-300/40 bg-cyan-400/10 px-3 text-[11px] font-semibold text-cyan-100 transition hover:bg-cyan-400/20"
        >
          Write ad copy →
        </a>
      </div>

      {manifest.aiTrace && (
        <details className="mt-3 rounded-lg border border-white/10 bg-black/20 p-2">
          <summary className="cursor-pointer text-[11px] font-semibold text-slate-300">
            AI debug{" "}
            <span className="text-slate-500">
              ({manifest.aiTrace.model} · {manifest.aiTrace.latencyMs}ms)
            </span>
          </summary>
          <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-black/40 p-2 text-[10px] leading-4 text-slate-400">
            {manifest.aiTrace.promptSent}
          </pre>
          <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-black/40 p-2 text-[10px] leading-4 text-slate-400">
            {manifest.aiTrace.rawResponse}
          </pre>
        </details>
      )}
    </article>
  );
}

export function TripManifestationView({
  angles,
  initialManifests,
  preselectedAngleId,
}: {
  angles: DealDiscoveryIdea[];
  initialManifests: DealTripManifest[];
  preselectedAngleId: string | null;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(
    preselectedAngleId && angles.some((a) => a.id === preselectedAngleId)
      ? preselectedAngleId
      : angles[0]?.id ?? null
  );
  const [manifests, setManifests] = useState<DealTripManifest[]>(initialManifests);
  const [latest, setLatest] = useState<{
    manifest: DealTripManifest;
    prefilter?: PrefilterInfo;
    rejectedPromoIds?: string[];
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const selectedAngle = useMemo(
    () => angles.find((a) => a.id === selectedId) ?? null,
    [angles, selectedId]
  );

  async function manifest() {
    if (!selectedId) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/tests/deals-system/trip-manifestation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "manifest", angleId: selectedId }),
      });
      const data = (await res.json()) as ManifestResponse;
      if (!res.ok || !data.ok || !data.manifest) {
        throw new Error(data.error ?? "Manifestation failed.");
      }
      setLatest({
        manifest: data.manifest,
        prefilter: data.prefilter,
        rejectedPromoIds: data.rejectedPromoIds,
      });
      if (data.manifests) setManifests(data.manifests);
      setMessage({ tone: "ok", text: "Trip manifested. Review and run the lookup query to resolve the package." });
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
            Deal Workflow · Step 2
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-white">Trip Manifestation</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
            Pick a discovery angle, correlate it against the CB promo intelligence, and manifest the
            cruise line, destination, sail window, and applicable perks. The result pre-fills SOURCE
            &amp; ASSEMBLE — except the packageId, ship, and booking link, which you resolve by
            running the manifest&apos;s lookup query in Package Lookup.
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

      {/* Angle picker */}
      <section className="mb-6 rounded-2xl border border-white/10 bg-slate-950/70 p-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">
          Select a discovery angle
        </p>
        {angles.length === 0 ? (
          <p className="mt-2 text-sm text-amber-200">
            No discovery angles cached yet. Generate some on Step 1 · Discovery first.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {angles.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(a.id)}
                  className={`flex w-full items-start gap-3 rounded-lg border px-3 py-2 text-left transition ${
                    selectedId === a.id
                      ? "border-cyan-300/60 bg-cyan-400/10"
                      : "border-white/10 bg-white/[0.03] hover:border-white/25"
                  }`}
                >
                  <span
                    className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
                      selectedId === a.id ? "bg-cyan-300" : "bg-slate-600"
                    }`}
                  />
                  <span>
                    <span className="block text-xs font-semibold text-white">
                      {a.sailingAngleProfile.sailingAngleTitle}
                    </span>
                    <span className="block text-[11px] text-slate-400">{a.isolatedNiche}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <button
          type="button"
          disabled={busy || !selectedAngle}
          onClick={() => void manifest()}
          className="mt-4 inline-flex h-11 items-center justify-center rounded-xl border border-cyan-300/40 bg-cyan-400/10 px-5 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Manifesting…" : "Manifest this trip"}
        </button>
      </section>

      {latest && (
        <div className="mb-6">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">
            Latest manifest
          </p>
          <ManifestCard
            manifest={latest.manifest}
            prefilter={latest.prefilter}
            rejectedPromoIds={latest.rejectedPromoIds}
          />
        </div>
      )}

      <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">
        All manifests ({manifests.length})
      </p>
      {manifests.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.03] p-6 text-sm text-slate-400">
          No manifests yet. Select an angle above and manifest it.
        </div>
      ) : (
        <div className="space-y-3">
          {manifests.map((m) => (
            <ManifestCard key={m.id} manifest={m} />
          ))}
        </div>
      )}
    </div>
  );
}
