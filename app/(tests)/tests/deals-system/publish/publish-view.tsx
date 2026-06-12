"use client";

import { useMemo, useState } from "react";

import type {
  CuratedOdysseusDeal,
  DealAdCopy,
  DealTripManifest,
} from "@/lib/cb/deals-system";

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
  const [expirationInput, setExpirationInput] = useState("");

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
    return deals.find((d) => d.packageId === selectedManifest.resolvedPackage!.packageId) ?? null;
  }, [deals, selectedManifest]);

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
      if (data.deal && assembledDeal) setAssembledDeal(data.deal);
      setExpirationOverride(expiresOnIso || null);
      setMessage({
        tone: "ok",
        text: expiresOnIso
          ? `Deal will stop appearing publicly after ${expiresOnIso}.`
          : "Expiration cleared — deal no longer auto-expires.",
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
      if (data.approved) {
        setMessage({ tone: "ok", text: "Deal approved and now bookable on the homepage!" });
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
            Deal Workflow · Step 5
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
          ← Back to Deals dashboard
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
            No resolved manifests yet. Resolve a manifest in Step 2 · Trip Manifestation first.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {manifests.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedManifestId(m.id);
                    setAssembledDeal(null);
                    setGates(undefined);
                    setExpirationOverride(undefined);
                    setExpirationInput("");
                  }}
                  className={`flex w-full items-start gap-3 rounded-lg border px-3 py-2 text-left transition ${
                    selectedManifestId === m.id
                      ? "border-cyan-300/60 bg-cyan-400/10"
                      : "border-white/10 bg-white/[0.03] hover:border-white/25"
                  }`}
                >
                  <span
                    className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
                      selectedManifestId === m.id ? "bg-cyan-300" : "bg-slate-600"
                    }`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold text-white truncate">
                      {m.sailingAngleTitle}
                    </span>
                    <span className="block text-[11px] text-slate-400">
                      {m.isolatedNiche} · {m.assembleDraft.cruiseLine} · {m.assembleDraft.destination}
                    </span>
                  </span>
                  {m.resolvedPackage && (
                    <span className="rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-200">
                      resolved
                    </span>
                  )}
                  {!m.resolvedPackage && (
                    <span className="rounded-full border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-amber-200">
                      unresolved
                    </span>
                  )}
                </button>
              </li>
            ))}
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
                    {matchingAdCopy.campaignName} · {matchingAdCopy.variants.length} variant(s) · id{" "}
                    {matchingAdCopy.id}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-400">
                    Final ad (becomes the deal-page headline):{" "}
                    <span className="font-semibold text-emerald-200">
                      {matchingAdCopy.variants[matchingAdCopy.selectedVariantIndex ?? 0]?.variantLabel}
                    </span>
                    {matchingAdCopy.selectedVariantIndex === undefined && (
                      <span className="text-amber-300">
                        {" "}
                        — defaulting to primary; pick one in Step 3 to lock it in.
                      </span>
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
                  {busy ? "Assembling…" : "Assemble Deal"}
                </button>
              )}
            </div>
          </div>
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
                <span className="mt-0.5 text-lg">{g.passed ? "✓" : g.blocking ? "✗" : "⚠"}</span>
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
              disabled={busy}
              onClick={() => void approve()}
              className="inline-flex h-10 items-center rounded-lg border border-emerald-300/40 bg-emerald-400/10 px-4 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Approve for homepage
            </button>
          </div>
        </section>
      )}

      {/* Deal preview */}
      {previewDeal && (
        <section className="mb-6 rounded-2xl border border-white/10 bg-slate-950/70 p-5">
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
              <p className="text-xs text-slate-300">{previewDeal.status}</p>
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
              <p className="text-xs text-slate-300">{previewDeal.linkHealth.status}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                Approval
              </p>
              <p className="text-xs text-slate-300">
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
              Expiration (optional)
            </p>
            <p className="mt-1 text-[11px] leading-5 text-slate-400">
              {currentExpiresOnIso
                ? `Currently set to "${currentExpiresOnIso}" — the deal disappears from the homepage and its detail page after that date.`
                : "No expiration set — this deal never auto-expires."}
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
              {currentExpiresOnIso && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void setExpiration("")}
                  className="inline-flex h-10 items-center rounded-lg border border-white/15 bg-white/[0.04] px-4 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
