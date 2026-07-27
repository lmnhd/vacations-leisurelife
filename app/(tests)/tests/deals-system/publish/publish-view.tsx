"use client";

import { useMemo, useState } from "react";

import type {
  CuratedOdysseusDeal,
  DealAdCopy,
  DealTripManifest,
} from "@/lib/cb/deals-system";

/** Default public-visibility window: 90 days from today, as a YYYY-MM-DD date. */
const DEFAULT_EXPIRY_DAYS = 90;

interface DealLiveness {
  live: boolean;
  reason: string;
}

function defaultExpiryDate(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + DEFAULT_EXPIRY_DAYS);
  return d.toISOString().slice(0, 10);
}

/** True once `expiresOnIso` is in the past (end-of-day for date-only values). */
function dealIsExpired(expiresOnIso: string | undefined, now = new Date()): boolean {
  const trimmed = expiresOnIso?.trim();
  if (!trimmed) return false;
  const expiresAt = trimmed.includes("T")
    ? new Date(trimmed)
    : new Date(`${trimmed}T23:59:59.999Z`);
  if (Number.isNaN(expiresAt.getTime())) return false;
  return now.getTime() > expiresAt.getTime();
}

/**
 * Is this deal LIVE on the homepage right now? Mirrors `isDealHomepageEligible`
 * (the server-side single source of truth) - kept inline so this client component
 * does not pull the deals-system barrel (and the AWS SDK) into the browser bundle.
 * Returns the live flag plus the first blocking reason for an operator-facing cue.
 */
function dealLiveness(deal: CuratedOdysseusDeal): DealLiveness {
  if (deal.operatorVisibility?.hidden) return { live: false, reason: "Manually hidden" };
  if (deal.operatorApproval?.status !== "approved") {
    return { live: false, reason: "Not approved yet" };
  }
  if (deal.status !== "bookable") return { live: false, reason: `Status is "${deal.status}"` };
  if (deal.linkHealth.status !== "valid") {
    return { live: false, reason: "Booking link not marked valid" };
  }
  if (dealIsExpired(deal.expiresOnIso)) return { live: false, reason: "Expired" };
  return { live: true, reason: "Live on the homepage" };
}

function dealFreshnessIso(deal: CuratedOdysseusDeal): string {
  return deal.operatorApproval?.updatedAtIso ?? deal.capturedAtIso ?? "";
}

function dealManifestAffinity(deal: CuratedOdysseusDeal, manifestId: string): number {
  const notes = [...(deal.agentOnlyNotes ?? []), ...(deal.copyPackage?.agentOnlyNotes ?? [])];
  return notes.some((note) => note.includes(manifestId) || note.includes(`unified-${manifestId}`))
    ? 1
    : 0;
}

function chooseBestDealForManifest(
  manifestId: string,
  packageDeals: CuratedOdysseusDeal[]
): CuratedOdysseusDeal | null {
  if (!packageDeals.length) return null;

  return [...packageDeals].sort((a, b) => {
    const livenessDelta = Number(dealLiveness(b).live) - Number(dealLiveness(a).live);
    if (livenessDelta !== 0) return livenessDelta;

    const affinityDelta = dealManifestAffinity(b, manifestId) - dealManifestAffinity(a, manifestId);
    if (affinityDelta !== 0) return affinityDelta;

    const approvalDelta =
      Number(b.operatorApproval?.status === "approved") -
      Number(a.operatorApproval?.status === "approved");
    if (approvalDelta !== 0) return approvalDelta;

    const statusDelta = Number(b.status === "bookable") - Number(a.status === "bookable");
    if (statusDelta !== 0) return statusDelta;

    const freshnessDelta = dealFreshnessIso(b).localeCompare(dealFreshnessIso(a));
    if (freshnessDelta !== 0) return freshnessDelta;

    return a.id.localeCompare(b.id);
  })[0] ?? null;
}

interface PublishResponse {
  ok: boolean;
  error?: string;
  deal?: CuratedOdysseusDeal;
  gates?: { id: string; label: string; passed: boolean; detail: string; blocking: boolean }[];
}

interface ApproveResponse {
  ok: boolean;
  error?: string;
  deal?: CuratedOdysseusDeal;
  approved?: boolean;
  gates?: { id: string; label: string; passed: boolean; detail: string; blocking: boolean }[];
  blockingFailures?: { id: string; label: string; passed: boolean; detail: string; blocking: boolean }[];
}

export function PublishView({
  manifests,
  adCopies,
  deals,
}: {
  manifests: DealTripManifest[];
  adCopies: DealAdCopy[];
  deals: CuratedOdysseusDeal[];
}) {
  const resolvedManifests = manifests.filter((m) => m.resolvedPackage);
  const [selectedManifestId, setSelectedManifestId] = useState<string | null>(
    resolvedManifests[0]?.id ?? null
  );

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error" | "info"; text: string } | null>(null);
  const [assembledDeal, setAssembledDeal] = useState<CuratedOdysseusDeal | null>(null);
  const [gates, setGates] = useState<PublishResponse["gates"]>(undefined);
  const [expirationOverride, setExpirationOverride] = useState<string | null | undefined>(undefined);
  const [expirationInput, setExpirationInput] = useState(defaultExpiryDate());

  // Local overrides for deals mutated this session (approve / link-valid / expiration)
  // so the picker badges and preview reflect the new state without a page reload.
  const [dealOverrides, setDealOverrides] = useState<Record<string, CuratedOdysseusDeal>>({});

  /** Latest known deal records grouped by package id. */
  const dealsByPackageId = useMemo(() => {
    const map = new Map<string, CuratedOdysseusDeal[]>();
    const allDeals = [...deals, ...Object.values(dealOverrides)];

    for (const deal of allDeals) {
      const existing = map.get(deal.packageId);
      if (!existing) {
        map.set(deal.packageId, [deal]);
        continue;
      }

      const matchIndex = existing.findIndex((candidate) => candidate.id === deal.id);
      if (matchIndex >= 0) existing[matchIndex] = deal;
      else existing.push(deal);
    }

    return map;
  }, [deals, dealOverrides]);

  /** Record a freshly-mutated deal so every view recomputes its liveness. */
  function applyDealUpdate(deal: CuratedOdysseusDeal) {
    setDealOverrides((prev) => ({ ...prev, [deal.id]: deal }));
    setAssembledDeal((prev) => (prev && prev.id === deal.id ? deal : prev));
  }

  const selectedManifest = useMemo(
    () => manifests.find((m) => m.id === selectedManifestId) ?? null,
    [manifests, selectedManifestId]
  );

  const matchingAdCopy = useMemo(() => {
    if (!selectedManifest) return null;
    const expectedId = `unified-${selectedManifest.id}`;
    return adCopies.find((a) => a.sourceUnifiedManifestId === expectedId) ?? null;
  }, [adCopies, selectedManifest]);

  const existingDeal = useMemo(() => {
    if (!selectedManifest?.resolvedPackage) return null;
    const packageDeals = dealsByPackageId.get(selectedManifest.resolvedPackage.packageId) ?? [];
    return chooseBestDealForManifest(selectedManifest.id, packageDeals);
  }, [dealsByPackageId, selectedManifest]);

  const existingDealMatches = useMemo(() => {
    if (!selectedManifest?.resolvedPackage) return [];
    return dealsByPackageId.get(selectedManifest.resolvedPackage.packageId) ?? [];
  }, [dealsByPackageId, selectedManifest]);

  const previewDeal = assembledDeal ?? existingDeal;

  const currentExpiresOnIso =
    expirationOverride !== undefined ? expirationOverride : previewDeal?.expiresOnIso ?? null;

  async function publish() {
    if (!selectedManifestId || !matchingAdCopy) return;
    setBusy(true);
    setMessage(null);
    setAssembledDeal(null);
    setGates(undefined);
    try {
      const res = await fetch("/api/tests/deals-system/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "publish",
          manifestId: selectedManifestId,
          adCopyId: matchingAdCopy.id,
        }),
      });
      const data = (await res.json()) as PublishResponse;
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Publish failed.");
      }
      setAssembledDeal(data.deal ?? null);
      if (data.deal) applyDealUpdate(data.deal);
      setGates(data.gates ?? undefined);
      setMessage({ tone: "ok", text: "Deal assembled and saved to curated cache." });
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  async function setLinkValid() {
    if (!assembledDeal && !existingDeal) return;
    const dealId = (assembledDeal ?? existingDeal)!.id;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/tests/deals-system/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_link_valid", dealId }),
      });
      const data = (await res.json()) as ApproveResponse;
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed.");
      if (data.deal) applyDealUpdate(data.deal);
      if (data.gates) setGates(data.gates);
      setMessage({ tone: "ok", text: "Link health set to valid." });
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  async function setExpiration(expiresOnIso: string) {
    if (!previewDeal) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/tests/deals-system/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_expiration", dealId: previewDeal.id, expiresOnIso }),
      });
      const data = (await res.json()) as ApproveResponse;
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed.");
      if (data.deal) applyDealUpdate(data.deal);
      if (data.gates) setGates(data.gates);
      setExpirationOverride(expiresOnIso || null);
      setMessage({
        tone: "ok",
        text: expiresOnIso
          ? `Deal will stop appearing publicly after ${expiresOnIso}.`
          : "Expiration cleared - deal no longer auto-expires.",
      });
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  async function approve() {
    if (!assembledDeal && !existingDeal) return;
    const dealId = (assembledDeal ?? existingDeal)!.id;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/tests/deals-system/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "approve",
          dealId,
          textOnlyLaunchWaived: false,
        }),
      });
      const data = (await res.json()) as ApproveResponse;
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Approval failed.");
      if (data.deal) {
        applyDealUpdate(data.deal);
        // The approve evaluation re-derives gates on the deal - surface them so the
        // gate list matches the decision (a blocking gate may now pass).
        if (data.deal.operatorApproval?.gates) setGates(data.deal.operatorApproval.gates);
      }
      if (data.approved) {
        setMessage({ tone: "ok", text: "Deal approved and now LIVE on the homepage!" });
      } else {
        const failures = data.blockingFailures?.map((f) => f.label).join("; ") ?? "";
        setMessage({ tone: "error", text: `Approval blocked: ${failures}` });
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
            Deal Workflow - Step 5
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-white">Publish</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
            Assemble a Curated Deal from a resolved manifest + its ad copy, review the approval
            gates, then approve it for the homepage.
          </p>
        </div>
        <a
          href="/tests/deals-system"
          className="inline-flex h-11 items-center justify-center rounded-xl border border-white/15 bg-white/[0.04] px-5 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.08]"
        >
          Back to Deals dashboard
        </a>
      </div>

      {message && (
        <div
          className={`mb-6 rounded-xl border p-4 text-sm ${
            message.tone === "ok"
              ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-100"
              : message.tone === "error"
                ? "border-rose-400/30 bg-rose-500/10 text-rose-100"
                : "border-sky-400/30 bg-sky-500/10 text-sky-100"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Manifest picker */}
      <section className="mb-6 rounded-2xl border border-white/10 bg-slate-950/70 p-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">
          Select a resolved manifest
        </p>
        {resolvedManifests.length === 0 ? (
          <p className="mt-2 text-sm text-amber-200">
            No resolved manifests yet. Resolve a manifest in Step 2 - Trip Manifestation first.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {manifests.map((m) => {
              const manifestDeals = m.resolvedPackage
                ? dealsByPackageId.get(m.resolvedPackage.packageId) ?? []
                : [];
              const manifestDeal = m.resolvedPackage
                ? chooseBestDealForManifest(m.id, manifestDeals)
                : null;
              const liveness = manifestDeal ? dealLiveness(manifestDeal) : null;
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedManifestId(m.id);
                      setAssembledDeal(null);
                      setGates(undefined);
                      setExpirationOverride(undefined);
                      setExpirationInput(defaultExpiryDate());
                    }}
                    className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition ${
                      selectedManifestId === m.id
                        ? "border-cyan-300/60 bg-cyan-400/10"
                        : "border-white/10 bg-white/[0.03] hover:border-white/25"
                    }`}
                  >
                    <span
                      className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                        selectedManifestId === m.id ? "bg-cyan-300" : "bg-slate-600"
                      }`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-semibold text-white truncate">
                        {m.sailingAngleTitle}
                      </span>
                      <span className="block text-[11px] text-slate-400">
                        {m.isolatedNiche} - {m.assembleDraft.cruiseLine} - {m.assembleDraft.destination}
                      </span>
                    </span>
                    {liveness?.live ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/50 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-200">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_6px_1px_rgba(110,231,183,0.8)]" />
                        live
                      </span>
                    ) : manifestDeal ? (
                      <span className="rounded-full border border-slate-500/40 bg-slate-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-300">
                        {manifestDeals.length > 1 ? `not live (${manifestDeals.length})` : "not live"}
                      </span>
                    ) : m.resolvedPackage ? (
                      <span className="rounded-full border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-amber-200">
                        not published
                      </span>
                    ) : (
                      <span className="rounded-full border border-rose-400/40 bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-rose-200">
                        unresolved
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {selectedManifest && (
        <section className="mb-6 rounded-2xl border border-white/10 bg-slate-950/70 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">
                Ad copy match
              </p>
              {matchingAdCopy ? (
                <>
                  <p className="mt-1 text-sm text-emerald-200">
                    {matchingAdCopy.campaignName} - {matchingAdCopy.variants.length} variant(s) - id{" "}
                    {matchingAdCopy.id}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-400">
                    Final ad (becomes the deal-page headline):{" "}
                    <span className="font-semibold text-emerald-200">
                      {matchingAdCopy.variants[matchingAdCopy.selectedVariantIndex ?? 0]?.variantLabel}
                    </span>
                    {matchingAdCopy.selectedVariantIndex === undefined && (
                      <span className="text-amber-300"> - defaulting to primary; pick one in Step 3 to lock it in.</span>
                    )}
                  </p>
                </>
              ) : (
                <p className="mt-1 text-sm text-rose-200">
                  No ad copy found for unified manifest unified-{selectedManifest.id}. Run Step 3
                  first.
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {matchingAdCopy && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void publish()}
                  className="inline-flex h-11 items-center justify-center rounded-xl border border-cyan-300/40 bg-cyan-400/10 px-5 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy ? "Assembling..." : "Assemble Deal"}
                </button>
              )}
            </div>
          </div>
          {!!existingDeal && existingDealMatches.length > 1 && (
            <p className="mt-3 text-[11px] text-amber-200">
              {`This package has ${existingDealMatches.length} deal records. The publish screen is using "${existingDeal.id}" because it currently ranks highest for live/approved status.`}
            </p>
          )}
        </section>
      )}

      {/* Approval gates */}
      {(gates || existingDeal?.operatorApproval?.gates) && (
        <section className="mb-6 rounded-2xl border border-white/10 bg-slate-950/70 p-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">
            Approval gates
          </p>
          <ul className="mt-3 space-y-2">
            {(gates ?? existingDeal?.operatorApproval?.gates ?? []).map((g) => (
              <li
                key={g.id}
                className={`flex items-start gap-3 rounded-lg border px-3 py-2 ${
                  g.passed
                    ? "border-emerald-400/30 bg-emerald-500/10"
                    : g.blocking
                      ? "border-rose-400/30 bg-rose-500/10"
                      : "border-amber-400/30 bg-amber-500/10"
                }`}
              >
                <span className="mt-0.5 text-lg">{g.passed ? "OK" : g.blocking ? "X" : "!"}</span>
                <div>
                  <p className="text-xs font-semibold text-white">{g.label}</p>
                  <p className="text-[11px] text-slate-400">{g.detail}</p>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void setLinkValid()}
              className="inline-flex h-10 items-center rounded-lg border border-sky-300/40 bg-sky-400/10 px-4 text-sm font-semibold text-sky-100 transition hover:bg-sky-400/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Mark link valid
            </button>
            <button
              type="button"
              disabled={busy || previewDeal?.operatorApproval?.status === "approved"}
              onClick={() => void approve()}
              className="inline-flex h-10 items-center rounded-lg border border-emerald-300/40 bg-emerald-400/10 px-4 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {previewDeal?.operatorApproval?.status === "approved"
                ? "Approved"
                : "Approve for homepage"}
            </button>
          </div>
        </section>
      )}

      {/* Deal preview */}
      {previewDeal && (() => {
        const liveness = dealLiveness(previewDeal);
        return (
        <section
          className={`mb-6 rounded-2xl border p-5 ${
            liveness.live
              ? "border-emerald-400/40 bg-emerald-500/[0.06]"
              : "border-white/10 bg-slate-950/70"
          }`}
        >
          {/* Persistent live-status banner - survives reloads (derived from the deal). */}
          <div
            className={`mb-4 flex items-center gap-3 rounded-xl border px-4 py-3 ${
              liveness.live
                ? "border-emerald-400/50 bg-emerald-500/15"
                : "border-amber-400/40 bg-amber-500/10"
            }`}
          >
            {liveness.live ? (
              <span className="h-3 w-3 rounded-full bg-emerald-300 shadow-[0_0_8px_2px_rgba(110,231,183,0.85)]" />
            ) : (
              <span className="h-3 w-3 rounded-full bg-amber-300" />
            )}
            <div className="min-w-0">
              <p
                className={`text-sm font-bold uppercase tracking-[0.18em] ${
                  liveness.live ? "text-emerald-100" : "text-amber-100"
                }`}
              >
                {liveness.live ? "Live on the homepage" : "Not live"}
              </p>
              <p className="text-[11px] text-slate-300">
                {liveness.live
                  ? `Visible to the public${
                      previewDeal.expiresOnIso ? ` until ${previewDeal.expiresOnIso}` : ""
                    }.`
                  : `${liveness.reason}. Complete the steps below to take this deal live.`}
              </p>
            </div>
          </div>

          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">
            Deal preview
          </p>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">ID</p>
              <p className="text-xs text-slate-300">{previewDeal.id}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Status</p>
              <p
                className={`text-xs font-semibold ${
                  previewDeal.status === "bookable" ? "text-emerald-200" : "text-amber-200"
                }`}
              >
                {previewDeal.status}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Package</p>
              <p className="text-xs text-slate-300">{previewDeal.packageId}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Link</p>
              <p className="break-all text-xs text-slate-300">{previewDeal.bookingUrl}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                Link health
              </p>
              <p
                className={`text-xs font-semibold ${
                  previewDeal.linkHealth.status === "valid" ? "text-emerald-200" : "text-amber-200"
                }`}
              >
                {previewDeal.linkHealth.status}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                Approval
              </p>
              <p
                className={`text-xs font-semibold ${
                  previewDeal.operatorApproval?.status === "approved"
                    ? "text-emerald-200"
                    : previewDeal.operatorApproval?.status === "rejected"
                      ? "text-rose-200"
                      : "text-amber-200"
                }`}
              >
                {previewDeal.operatorApproval?.status ?? "needs_review"}
              </p>
            </div>
          </div>

          <div className="mt-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
              Public headline
            </p>
            <p className="mt-1 text-sm font-semibold text-white">{previewDeal.packaging.headline}</p>
            <p className="mt-1 text-xs text-slate-400">{previewDeal.packaging.shortSummary}</p>
          </div>

          <div className="mt-4 border-t border-white/10 pt-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
              Expiration
            </p>
            <p className="mt-1 text-[11px] leading-5 text-slate-400">
              {currentExpiresOnIso
                ? `Set to "${currentExpiresOnIso}" - the deal disappears from the homepage and its detail page after that date, or earlier once it enters the 45-day pre-sail inventory cutoff window.`
                : `Defaults to ${DEFAULT_EXPIRY_DAYS} days from today (${defaultExpiryDate()}). Every deal expires, and homepage visibility also stops automatically once the sailing is within 45 days.`}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={expirationInput}
                onChange={(e) => setExpirationInput(e.target.value)}
                placeholder="YYYY-MM-DD or ISO timestamp"
                className="h-10 w-64 rounded-lg border border-white/15 bg-white/[0.04] px-3 text-xs text-white placeholder:text-slate-500 focus:border-cyan-300/50 focus:outline-none"
              />
              <button
                type="button"
                disabled={busy || !expirationInput.trim()}
                onClick={() => void setExpiration(expirationInput.trim())}
                className="inline-flex h-10 items-center rounded-lg border border-cyan-300/40 bg-cyan-400/10 px-4 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Set expiration
              </button>
            </div>
          </div>
        </section>
        );
      })()}
    </div>
  );
}
