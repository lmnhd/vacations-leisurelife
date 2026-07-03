"use client";

import { useMemo, useState } from "react";

import type {
  DealDiscoveryIdea,
  DealTripManifest,
} from "@/lib/cb/deals-system";

import { ResultList } from "../result-list";

interface PrefilterInfo {
  kept: number;
  dropped: Array<{ id: string; vendor: string; reason: string }>;
  diagnostics: string[];
}

interface Candidate {
  packageId: string;
  cruiseCode?: string;
  cruiseName: string;
  cruiseLine?: string;
  sailDateIso: string;
  nights?: number | null;
  confidence: number;
  reasons: string[];
  departurePortCode?: string;
  /**
   * Structured itinerary from the Odysseus result. Carried through opaquely so the
   * itineraryId survives round-trip and the resolve handler can capture the real
   * day-by-day schedule for the operator-picked candidate. Do not strip it when
   * sending the candidate back to { action: "resolve_candidate" }.
   */
  itinerary?: Record<string, unknown>;
}

type LookupStatus = "confident_match" | "ambiguous" | "no_match" | "lookup_failed";

interface ManifestResponse {
  ok: boolean;
  error?: string;
  manifest?: DealTripManifest;
  prefilter?: PrefilterInfo;
  rejectedPromoIds?: string[];
  manifests?: DealTripManifest[];
  lookupStatus?: LookupStatus;
  candidates?: Candidate[];
  lookupDiagnostics?: string[];
  diagnostics?: string[];
  /** AI fit-select rationale explaining why this real cruise best serves the angle. */
  fitRationale?: string;
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

function ManifestSummary({ manifest }: { manifest: DealTripManifest }) {
  const d = manifest.assembleDraft;
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="text-sm font-semibold text-white">{manifest.sailingAngleTitle}</span>
      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-300/80">
        {manifest.isolatedNiche}
      </span>
      <span className="text-[10px] text-slate-500">
        {d.cruiseLine} · {d.destination}
      </span>
      {manifest.resolvedPackage ? (
        <span className="rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-emerald-200">
          resolved · {manifest.resolvedPackage.shipName ?? manifest.resolvedPackage.cruiseName}
        </span>
      ) : (
        <span className="rounded-full border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-amber-200">
          needs resolution
        </span>
      )}
    </div>
  );
}

/** The real cruise this manifest resolved to: ship, dates, pricing, and the booking link. */
function ResolvedPackagePanel({ manifest }: { manifest: DealTripManifest }) {
  const r = manifest.resolvedPackage;
  if (!r) return null;
  const cp = r.cabinPricing;
  return (
    <div className="mt-3 rounded-lg border border-emerald-400/20 bg-emerald-500/[0.05] p-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-300">
        Resolved package — real Odysseus cruise
      </p>
      <div className="mt-2 grid gap-3 md:grid-cols-2">
        <Labeled label="Package ID" value={r.packageId} />
        <Labeled label="Cruise / ship" value={r.shipName ?? r.cruiseName} />
        <Labeled label="Cruise line" value={r.cruiseLine} />
        <Labeled label="Sail date" value={r.sailDateIso} />
        <Labeled label="Nights" value={r.nights} />
        <Labeled label="Departure port" value={r.departurePortCode} />
        <Labeled label="Confidence" value={r.confidence.toFixed(2)} />
      </div>
      {cp && (
        <div className="mt-2 grid gap-3 md:grid-cols-5">
          <Labeled label="Inside" value={cp.inside} />
          <Labeled label="Outside" value={cp.outside} />
          <Labeled label="Balcony" value={cp.balcony} />
          <Labeled label="Suite" value={cp.suite} />
          <Labeled label="From" value={cp.leadFare ? `${cp.leadFare} ${cp.currencyCode}` : undefined} />
        </div>
      )}
      {r.itinerary?.normalizedPortsOfCall && (
        <div className="mt-2">
          <Labeled label="Ports of call" value={r.itinerary.normalizedPortsOfCall} />
        </div>
      )}
      {!r.itinerary?.dayByDay || r.itinerary.dayByDay.length === 0 ? (
        <p className="mt-2 text-[11px] text-amber-200">
          ⚠ No day-by-day itinerary captured — the public page will show a coarse
          port list instead of the calendar. Backfill with{" "}
          <code className="text-cyan-300">
            npm run backfill-deal-itinerary -- --deal {r.packageId}
          </code>
          .
        </p>
      ) : null}
      {r.bookingUrl ? (
        <div className="mt-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Booking link</p>
          <a
            href={r.bookingUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-1 block break-all text-xs text-cyan-300 underline"
          >
            {r.bookingUrl}
          </a>
        </div>
      ) : (
        <p className="mt-2 text-[11px] text-amber-200">
          ⚠ No booking link was returned by the broker. {r.lookupDiagnostics.join("; ")}
        </p>
      )}
      <p className="mt-2 text-[11px] text-slate-500">
        Resolved {new Date(r.resolvedAtIso).toLocaleString()} · reasons: {r.reasons.join("; ")}
      </p>
    </div>
  );
}

/** Inline candidate picker for an ambiguous lookup — operator must pick exactly one cruise. */
function CandidatePicker({
  manifestId,
  candidates,
  busy,
  onResolve,
}: {
  manifestId: string;
  candidates: Candidate[];
  busy: boolean;
  onResolve: (manifestId: string, candidate: Candidate) => void;
}) {
  const [pickedId, setPickedId] = useState<string | null>(candidates[0]?.packageId ?? null);
  const picked = candidates.find((c) => c.packageId === pickedId) ?? null;

  return (
    <div className="mt-3 rounded-lg border border-amber-400/30 bg-amber-500/[0.06] p-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber-300">
        No confident match — pick the one real cruise this is
      </p>
      <p className="mt-1 text-[11px] leading-4 text-slate-400">
        Odysseus returned multiple candidates and none cleared the auto-match threshold. Pick the
        cruise this manifest is actually about — the booking link will be built for it immediately.
      </p>
      <div className="mt-2 space-y-2">
        {candidates.map((c) => (
          <button
            key={c.packageId}
            type="button"
            onClick={() => setPickedId(c.packageId)}
            className={`w-full text-left rounded-lg border px-3 py-2 transition ${
              pickedId === c.packageId
                ? "border-cyan-300/60 bg-cyan-400/10"
                : "border-white/10 bg-white/[0.03] hover:border-white/25"
            }`}
          >
            <div className="flex items-start gap-2">
              <span
                className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
                  pickedId === c.packageId ? "bg-cyan-300" : "bg-slate-600"
                }`}
              />
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-white">
                  {c.cruiseLine ? `${c.cruiseLine} — ` : ""}
                  {c.cruiseName}
                </p>
                <p className="text-[11px] text-slate-400">
                  pkg {c.packageId} · {c.sailDateIso}
                  {c.nights ? ` · ${c.nights}n` : ""}
                </p>
                <p className="mt-1 text-[11px] text-slate-500">
                  confidence {c.confidence.toFixed(2)} · {c.reasons.join("; ")}
                </p>
              </div>
            </div>
          </button>
        ))}
      </div>
      <button
        type="button"
        disabled={busy || !picked}
        onClick={() => picked && onResolve(manifestId, picked)}
        className="mt-3 inline-flex h-10 items-center justify-center rounded-xl border border-emerald-300/40 bg-emerald-400/10 px-4 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "Resolving…" : picked ? `Resolve as package ${picked.packageId}` : "Pick a cruise"}
      </button>
    </div>
  );
}

function ManifestCard({
  manifest,
  prefilter,
  rejectedPromoIds,
  bare = false,
  pendingCandidates,
  busy = false,
  onResolveCandidate,
  fitRationale,
}: {
  manifest: DealTripManifest;
  prefilter?: PrefilterInfo;
  rejectedPromoIds?: string[];
  bare?: boolean;
  pendingCandidates?: Candidate[];
  busy?: boolean;
  onResolveCandidate?: (manifestId: string, candidate: Candidate) => void;
  fitRationale?: string;
}) {
  const d = manifest.assembleDraft;
  const q = manifest.lookupQuery;
  const Wrapper = bare ? "div" : "article";
  return (
    <Wrapper className={bare ? "" : "rounded-xl border border-white/10 bg-white/[0.035] p-4"}>
      {!bare && (
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
      )}

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

      {/* AI fit-select rationale (inventory-aware Step 2) */}
      {fitRationale && (
        <div className="mt-3 rounded-lg border border-cyan-400/20 bg-cyan-500/[0.05] p-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-300">
            Why this cruise was chosen (inventory-aware fit)
          </p>
          <p className="mt-1 text-[11px] leading-4 text-slate-300">{fitRationale}</p>
        </div>
      )}

      {/* Resolution: the one real cruise this manifest is about */}
      {manifest.resolvedPackage ? (
        <ResolvedPackagePanel manifest={manifest} />
      ) : pendingCandidates && pendingCandidates.length > 0 ? (
        <CandidatePicker
          manifestId={manifest.id}
          candidates={pendingCandidates}
          busy={busy}
          onResolve={onResolveCandidate ?? (() => {})}
        />
      ) : (
        <div className="mt-3 rounded-lg border border-rose-400/30 bg-rose-500/[0.06] p-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-rose-300">
            Not resolved — no real cruise found
          </p>
          <p className="mt-1 text-[11px] leading-4 text-slate-400">
            The Odysseus lookup found no usable candidates for this angle&apos;s search
            ({q.line}, {q.destination}, {q.date ?? "?"}{q.nights ? `, ${q.nights}n` : ""}). This
            manifest cannot proceed to ad copy. Discard it and try a different angle, or adjust the
            angle&apos;s timing/destination and re-manifest.
          </p>
        </div>
      )}

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
        {manifest.resolvedPackage ? (
          <a
            href={`/tests/deals-system/copywriter?manifestId=${encodeURIComponent(manifest.id)}`}
            className="inline-flex h-8 items-center rounded-lg border border-cyan-300/40 bg-cyan-400/10 px-3 text-[11px] font-semibold text-cyan-100 transition hover:bg-cyan-400/20"
          >
            Write ad copy →
          </a>
        ) : (
          <span className="inline-flex h-8 cursor-not-allowed items-center rounded-lg border border-white/10 bg-white/[0.02] px-3 text-[11px] font-semibold text-slate-500">
            Write ad copy → (resolve a real cruise first)
          </span>
        )}
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
    </Wrapper>
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
    fitRationale?: string;
  } | null>(null);
  const [pendingCandidates, setPendingCandidates] = useState<Record<string, Candidate[]>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const selectedAngle = useMemo(
    () => angles.find((a) => a.id === selectedId) ?? null,
    [angles, selectedId]
  );

  async function removeManifest(id: string) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/tests/deals-system/trip-manifestation?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = (await res.json()) as ManifestResponse;
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Delete failed.");
      if (data.manifests) setManifests(data.manifests);
      if (latest?.manifest.id === id) setLatest(null);
      setMessage({ tone: "ok", text: "Manifest removed." });
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

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
        fitRationale: data.fitRationale,
      });
      if (data.manifests) setManifests(data.manifests);

      if (data.lookupStatus === "confident_match" && data.manifest.resolvedPackage) {
        setMessage({
          tone: "ok",
          text: `Manifested and resolved — ${data.manifest.resolvedPackage.shipName ?? data.manifest.resolvedPackage.cruiseName} (${data.manifest.resolvedPackage.sailDateIso}). Booking link ${
            data.manifest.resolvedPackage.bookingUrl ? "ready." : "could not be built — see diagnostics."
          }`,
        });
      } else if (data.candidates && data.candidates.length > 0) {
        setPendingCandidates((prev) => ({ ...prev, [data.manifest!.id]: data.candidates! }));
        setMessage({
          tone: "error",
          text: "No confident match. Pick the one real cruise this manifest is about below — nothing proceeds until it's resolved.",
        });
      } else {
        setMessage({
          tone: "error",
          text: `No usable Odysseus match found for this angle. ${
            data.lookupDiagnostics?.join(" ") ?? ""
          } Discard this manifest and try a different angle.`,
        });
      }
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  async function resolveCandidate(manifestId: string, candidate: Candidate) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/tests/deals-system/trip-manifestation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resolve_candidate", manifestId, candidate }),
      });
      const data = (await res.json()) as ManifestResponse;
      if (!res.ok || !data.ok || !data.manifest) {
        throw new Error(data.error ?? "Resolve failed.");
      }
      if (data.manifests) setManifests(data.manifests);
      if (latest?.manifest.id === manifestId) {
        setLatest({ ...latest, manifest: data.manifest });
      }
      setPendingCandidates((prev) => {
        const next = { ...prev };
        delete next[manifestId];
        return next;
      });
      setMessage({
        tone: "ok",
        text: `Resolved — ${data.manifest.resolvedPackage?.shipName ?? data.manifest.resolvedPackage?.cruiseName} (${data.manifest.resolvedPackage?.sailDateIso}). Booking link ${
          data.manifest.resolvedPackage?.bookingUrl ? "ready." : "could not be built — see diagnostics."
        }`,
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
            Deal Workflow · Step 2
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-white">Trip Manifestation</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
            Pick a discovery angle, correlate it against the CB promo intelligence, and manifest the
            cruise line, destination, sail window, and applicable perks — then immediately look up
            the real Odysseus cruise: ship, sail date, itinerary, cabin pricing, and booking link.
            A confident match resolves automatically; an ambiguous result asks you to pick the one
            real cruise before anything proceeds to ad copy.
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
            pendingCandidates={pendingCandidates[latest.manifest.id]}
            busy={busy}
            onResolveCandidate={resolveCandidate}
            fitRationale={latest.fitRationale}
          />
        </div>
      )}

      <ResultList
        items={[...manifests].reverse()}
        getId={(m) => m.id}
        label="Manifests"
        emptyText="No manifests yet. Select an angle above and manifest it."
        busy={busy}
        onDelete={(id) => void removeManifest(id)}
        renderSummary={(m) => <ManifestSummary manifest={m} />}
        renderDetail={(m) => (
          <ManifestCard
            manifest={m}
            bare
            pendingCandidates={pendingCandidates[m.id]}
            busy={busy}
            onResolveCandidate={resolveCandidate}
          />
        )}
      />
    </div>
  );
}
