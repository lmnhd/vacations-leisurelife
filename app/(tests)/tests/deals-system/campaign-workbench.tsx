"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

function DealStatusExplainer({ deal }: { deal: any }) {
  const [isOpen, setIsOpen] = useState(false);

  let explanation = "";
  let tone = "neutral";

  if (deal.packageId === "0000000") {
    explanation =
      "This is a test/sample Deal with a fake package ID (0000000). It exists to demonstrate that the publishing gate works — it will never book because the package is not real. You can ignore this Deal.";
    tone = "info";
  } else if (deal.approvalStatus === "needs_review") {
    explanation =
      "This Deal has been assembled but not yet reviewed. Run the stages above to fill in research, targeting, copy, and media. Then check the approval gate (Stage 6) to see what's blocking publishing. Once all gates pass, you can approve it.";
    tone = "pending";
  } else if (deal.approvalStatus === "rejected") {
    explanation =
      "This Deal was reviewed and rejected. Either fix the issues shown in the approval gate and re-approve, or delete it and assemble a new one.";
    tone = "error";
  } else if (deal.publishable) {
    explanation =
      "This Deal passes all publishing gates and is ready for the homepage. It's currently approved, has a valid link, and all campaign stages are complete.";
    tone = "success";
  }

  const toneStyles: Record<string, string> = {
    neutral: "border-white/10 bg-white/5",
    info: "border-blue-400/30 bg-blue-500/10",
    pending: "border-amber-400/30 bg-amber-500/10",
    error: "border-rose-400/30 bg-rose-500/10",
    success: "border-emerald-400/30 bg-emerald-500/10",
  };

  return (
    <div className={`rounded-lg border p-3 ${toneStyles[tone]} mb-3`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between text-left hover:opacity-80 transition"
      >
        <span className="text-sm font-semibold text-white">What's the status?</span>
        <svg
          className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
        </svg>
      </button>
      {isOpen && <p className="mt-2 text-xs leading-5 text-slate-300">{explanation}</p>}
    </div>
  );
}

import type {
  DealsSystemApprovalGateSummary,
  DealsSystemCuratedDealSummary,
} from "@/lib/cb/deals-system/dashboard-data";

interface PromoOption {
  id: string;
  title: string;
  vendor: string;
}

interface ApiResponse {
  ok: boolean;
  error?: string;
  approved?: boolean;
  blockingFailures?: Array<{ label: string; detail: string }>;
}

const STAGES: Array<{ id: string; label: string; description: string; isPhase9B?: boolean }> = [
  { id: "research", label: "Trip research", description: "Ship appeal, destination hooks, angle." },
  { id: "targeting", label: "Targeting", description: "Package-specific Targeting-Demographic." },
  {
    id: "pitch",
    label: "Sales pitch",
    description: "Customer-voice decisions: hook, summary, selling facts.",
    isPhase9B: true,
  },
  { id: "copy", label: "Deal copy", description: "Headlines, hero, offer lines, CTAs." },
  { id: "ad_structure", label: "Ad structure", description: "Meta / Google / TikTok / email." },
  { id: "media", label: "Media plan", description: "Visual concepts, image slots, video." },
];

function inputClassName() {
  return "h-10 w-full rounded-lg border border-white/10 bg-black/25 px-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300/60";
}

function Field({
  label,
  help,
  className,
  children,
}: {
  label: string;
  help?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`flex flex-col gap-1 ${className ?? ""}`}>
      <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">{label}</span>
      {children}
      {help && <span className="text-[11px] leading-4 text-slate-500">{help}</span>}
    </label>
  );
}

function normalizeCruiseLine(value: string): string {
  return value
    .toLowerCase()
    .replace(/cruise(s)?/g, "")
    .replace(/cruise line/g, "")
    .replace(/international/g, "")
    .replace(/lines?/g, "")
    .replace(/journeys/g, "")
    .replace(/[^a-z]/g, "")
    .trim();
}

function cruiseLineMatches(formCruiseLine: string, promoVendor: string): boolean {
  const a = normalizeCruiseLine(formCruiseLine);
  const b = normalizeCruiseLine(promoVendor);
  if (!a || !b) return false;
  return a.includes(b) || b.includes(a);
}

function GateRow({ gate }: { gate: DealsSystemApprovalGateSummary }) {
  return (
    <li className="flex items-start gap-2 text-xs leading-5">
      <span
        className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
          gate.passed
            ? "bg-emerald-500/20 text-emerald-200"
            : gate.blocking
              ? "bg-rose-500/20 text-rose-200"
              : "bg-amber-500/20 text-amber-200"
        }`}
      >
        {gate.passed ? "✓" : "✕"}
      </span>
      <span className="text-slate-300">
        <span className="font-semibold text-white">{gate.label}</span>
        {!gate.blocking && <span className="ml-1 text-slate-500">(advisory)</span>} — {gate.detail}
      </span>
    </li>
  );
}

export function DealCampaignWorkbench({
  deals,
  promoOptions,
}: {
  deals: DealsSystemCuratedDealSummary[];
  promoOptions: PromoOption[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  // Existing Deals are collapsed by default so the assemble form for a NEW
  // Deal isn't buried under unrelated staged-development cards.
  const [showExistingDeals, setShowExistingDeals] = useState(false);

  // Assembly form state.
  const [dealId, setDealId] = useState("deal-rcl-southern-caribbean-1619969");
  const [briefId, setBriefId] = useState("brief-southern-caribbean-warm-escape");
  const [packageId, setPackageId] = useState("1619969");
  const [siid, setSiid] = useState("1049337");
  const [title, setTitle] = useState("6 Night Southern Caribbean Cruise");
  const [cruiseLine, setCruiseLine] = useState("Royal Caribbean");
  const [shipName, setShipName] = useState("Liberty of the Seas");
  const [nights, setNights] = useState("6");
  const [sailDate, setSailDate] = useState("2026-11-08");
  const [departurePort, setDeparturePort] = useState("Fort Lauderdale");
  const [ports, setPorts] = useState("Perfect Day at CocoCay, Aruba, Curacao");
  const [bookingUrl, setBookingUrl] = useState("");
  const [selectedPromos, setSelectedPromos] = useState<string[]>([]);
  const [textOnly, setTextOnly] = useState(false);
  const [decisionNote, setDecisionNote] = useState("");
  const [showAllPromos, setShowAllPromos] = useState(false);

  // Ship finder — auto-fills the assembly fields below from a live Odysseus
  // lookup instead of hand-typing cruise line / ship / dates / ports.
  const [findLine, setFindLine] = useState("");
  const [findShip, setFindShip] = useState("");
  const [findDate, setFindDate] = useState("");
  const [finding, setFinding] = useState(false);
  const [findError, setFindError] = useState<string | null>(null);
  const [findStatus, setFindStatus] = useState<string | null>(null);

  const visiblePromoOptions = useMemo(
    () => promoOptions.filter((promo) => cruiseLineMatches(cruiseLine, promo.vendor)),
    [promoOptions, cruiseLine]
  );
  const otherPromoOptions = useMemo(
    () => promoOptions.filter((promo) => !cruiseLineMatches(cruiseLine, promo.vendor)),
    [promoOptions, cruiseLine]
  );

  async function call(body: Record<string, unknown>, busyKey: string) {
    setBusy(busyKey);
    setMessage(null);
    try {
      const response = await fetch("/api/tests/deals-system/curated-deal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as ApiResponse;
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? `Request failed (${response.status}).`);
      }
      if (body.action === "approve") {
        setMessage(
          payload.approved
            ? { tone: "ok", text: "Approved. Deal is now bookable and homepage-eligible." }
            : {
                tone: "error",
                text: `Not approved. Blocking gates still failing: ${(payload.blockingFailures ?? [])
                  .map((g) => g.label)
                  .join(", ")}`,
              }
        );
      } else {
        setMessage({ tone: "ok", text: "Done. Cache updated." });
      }
      router.refresh();
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  }

  function assemble() {
    void call(
      {
        action: "assemble",
        dealId: dealId.trim(),
        briefId: briefId.trim(),
        packageId: packageId.trim(),
        siid: siid.trim(),
        bookingUrl: bookingUrl.trim() || undefined,
        promoRecordIds: selectedPromos,
        cruiseFacts: {
          title,
          cruiseLine,
          shipName,
          itineraryName: title,
          nights: Number(nights) || 0,
          sailDateIso: sailDate,
          departurePort,
          portsOfCall: ports.split(",").map((p) => p.trim()).filter(Boolean),
        },
      },
      "assemble"
    );
  }

  function togglePromo(id: string) {
    setSelectedPromos((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  }

  // Runs the same live Odysseus lookup the Trip Manifestation pipeline step
  // uses, then auto-fills the assembly fields below from the matched cruise —
  // package id, cruise line, ship, sail date, nights, departure port, and
  // ports of call — instead of hand-typing all ten.
  async function findShipAndFill() {
    if (!findLine.trim() && !findShip.trim()) {
      setFindError("Enter at least a cruise line or ship name.");
      return;
    }
    setFinding(true);
    setFindError(null);
    setFindStatus(null);
    try {
      const response = await fetch("/api/tests/deals-system/lookup-package", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          line: findLine.trim() || undefined,
          ship: findShip.trim() || undefined,
          date: findDate.trim() || undefined,
          structured: true,
        }),
      });
      const payload = (await response.json()) as {
        ok: boolean;
        status?: string;
        message?: string;
        cruiseFacts?: {
          packageId: string;
          cruiseLine: string;
          shipName: string;
          title: string;
          nights?: number;
          sailDateIso: string;
          departurePort?: string;
          ports: string;
          confidence: number;
        } | null;
      };
      if (!response.ok || !payload.ok || !payload.cruiseFacts) {
        throw new Error(payload.message ?? "No matching sailing found.");
      }

      const f = payload.cruiseFacts;
      setPackageId(f.packageId);
      setCruiseLine(f.cruiseLine || findLine.trim());
      setShipName(f.shipName || findShip.trim());
      setTitle(f.title);
      if (f.nights) setNights(String(f.nights));
      setSailDate(f.sailDateIso);
      if (f.departurePort) setDeparturePort(f.departurePort);
      if (f.ports) setPorts(f.ports);

      setFindStatus(
        payload.status === "confident_match"
          ? `Matched: ${f.title} (${Math.round(f.confidence * 100)}% confidence). Fields below filled in — review before assembling.`
          : `Best available match used: ${f.title}. Confidence was low — double-check the fields below.`
      );
    } catch (err) {
      setFindError(err instanceof Error ? err.message : String(err));
    } finally {
      setFinding(false);
    }
  }

  return (
    <div className="space-y-6">
      {message && (
        <div
          className={`rounded-xl border p-4 text-sm ${
            message.tone === "ok"
              ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-100"
              : "border-rose-400/30 bg-rose-500/10 text-rose-100"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Stage 1: Source and assembly */}
      <div className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
          1 · Source &amp; assemble
        </p>
        <p className="mt-1 text-sm text-slate-400">
          Convert a package candidate into a <span className="font-semibold text-white">needs_review</span>{" "}
          Curated Deal. This never publishes on its own — it always lands in review with every campaign
          stage generated. The fields below are pre-filled with the recommended first real Deal (RCL
          Southern Caribbean, package 1619969) — only change them when assembling a different package.
        </p>

        <div className="mt-4 rounded-lg border border-cyan-400/20 bg-cyan-500/5 p-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-cyan-300">
            Find ship — auto-fill from a live lookup
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            Runs the same Odysseus lookup Trip Manifestation uses, then fills in package id, cruise
            line, ship, sail date, nights, departure port, and ports of call below. Review before
            assembling.
          </p>
          <div className="mt-3 grid gap-2 md:grid-cols-3">
            <input
              className={inputClassName()}
              value={findLine}
              onChange={(e) => setFindLine(e.target.value)}
              placeholder="Cruise line, e.g. Royal Caribbean"
            />
            <input
              className={inputClassName()}
              value={findShip}
              onChange={(e) => setFindShip(e.target.value)}
              placeholder="Ship, e.g. Liberty of the Seas"
            />
            <input
              className={inputClassName()}
              value={findDate}
              onChange={(e) => setFindDate(e.target.value)}
              placeholder="Sail date YYYY-MM-DD (optional)"
            />
          </div>
          <button
            type="button"
            disabled={finding}
            onClick={() => void findShipAndFill()}
            className="mt-3 inline-flex h-9 items-center rounded-lg border border-cyan-300/40 bg-cyan-400/10 px-4 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-400/20 disabled:cursor-wait disabled:opacity-60"
          >
            {finding ? "Searching..." : "Find ship"}
          </button>
          {findError && <p className="mt-2 text-xs text-rose-300">{findError}</p>}
          {findStatus && <p className="mt-2 text-xs text-emerald-200">{findStatus}</p>}
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Deal id">
            <input className={inputClassName()} value={dealId} onChange={(e) => setDealId(e.target.value)} placeholder="Deal id" />
          </Field>
          <Field label="Brief id">
            <input className={inputClassName()} value={briefId} onChange={(e) => setBriefId(e.target.value)} placeholder="Brief id" />
          </Field>
          <Field label="Package id">
            <input className={inputClassName()} value={packageId} onChange={(e) => setPackageId(e.target.value)} placeholder="Package id" />
          </Field>
          <Field label="SIID">
            <input className={inputClassName()} value={siid} onChange={(e) => setSiid(e.target.value)} placeholder="SIID" />
          </Field>
          <Field label="Title / itinerary" className="md:col-span-2">
            <input className={inputClassName()} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title / itinerary" />
          </Field>
          <Field label="Cruise line">
            <input className={inputClassName()} value={cruiseLine} onChange={(e) => setCruiseLine(e.target.value)} placeholder="Cruise line" />
          </Field>
          <Field label="Ship">
            <input className={inputClassName()} value={shipName} onChange={(e) => setShipName(e.target.value)} placeholder="Ship" />
          </Field>
          <Field label="Nights">
            <input className={inputClassName()} value={nights} onChange={(e) => setNights(e.target.value)} placeholder="Nights" />
          </Field>
          <Field label="Sail date">
            <input className={inputClassName()} value={sailDate} onChange={(e) => setSailDate(e.target.value)} placeholder="Sail date YYYY-MM-DD" />
          </Field>
          <Field label="Departure port">
            <input className={inputClassName()} value={departurePort} onChange={(e) => setDeparturePort(e.target.value)} placeholder="Departure port" />
          </Field>
          <Field label="Ports of call" className="xl:col-span-2">
            <input className={inputClassName()} value={ports} onChange={(e) => setPorts(e.target.value)} placeholder="Ports (comma separated)" />
          </Field>
          <Field
            label="Captured Share booking URL"
            className="xl:col-span-4"
            help={`Optional. Leave blank to auto-build a booking link from the Package id and SIID — its link health starts as "unknown" until verified. Paste a link here only after capturing it from the cruise line site's "Share" button; that marks it as operator-verified.`}
          >
            <input className={inputClassName()} value={bookingUrl} onChange={(e) => setBookingUrl(e.target.value)} placeholder="Leave blank to auto-construct from Package id / SIID" />
          </Field>
        </div>

        {promoOptions.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
              Attach promo intelligence (public-safe claims feed offer copy; agent-only notes stay internal)
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Promo intelligence is gathered across every cruise line, so only offers matching{" "}
              <span className="text-slate-300">{cruiseLine || "this Deal's cruise line"}</span> are shown
              by default.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {visiblePromoOptions.map((promo) => (
                <button
                  key={promo.id}
                  type="button"
                  onClick={() => togglePromo(promo.id)}
                  className={`rounded-full border px-3 py-1 text-xs transition ${
                    selectedPromos.includes(promo.id)
                      ? "border-cyan-300/60 bg-cyan-400/15 text-cyan-100"
                      : "border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/25"
                  }`}
                >
                  {promo.vendor}: {promo.title}
                </button>
              ))}
              {visiblePromoOptions.length === 0 && (
                <p className="text-xs text-slate-500">No promo intelligence found for this cruise line yet.</p>
              )}
            </div>
            {otherPromoOptions.length > 0 && (
              <div className="mt-2">
                <button
                  type="button"
                  onClick={() => setShowAllPromos((value) => !value)}
                  className="text-[11px] text-slate-500 underline decoration-dotted hover:text-slate-300"
                >
                  {showAllPromos
                    ? "Hide other cruise lines"
                    : `Show ${otherPromoOptions.length} more from other cruise lines`}
                </button>
                {showAllPromos && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {otherPromoOptions.map((promo) => (
                      <button
                        key={promo.id}
                        type="button"
                        onClick={() => togglePromo(promo.id)}
                        className={`rounded-full border px-3 py-1 text-xs transition ${
                          selectedPromos.includes(promo.id)
                            ? "border-cyan-300/60 bg-cyan-400/15 text-cyan-100"
                            : "border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/25"
                        }`}
                      >
                        {promo.vendor}: {promo.title}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          disabled={busy !== null}
          onClick={assemble}
          className="mt-4 inline-flex h-11 items-center justify-center rounded-xl border border-cyan-300/40 bg-cyan-400/10 px-5 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-400/20 disabled:cursor-wait disabled:opacity-60"
        >
          {busy === "assemble" ? "Assembling..." : "Assemble needs_review Deal"}
        </button>
      </div>

      {/* Per-deal staged development */}
      {deals.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.03] p-6 text-sm text-slate-400">
          No Curated Deals yet. Assemble one above, then run each stage and the approval gate here.
        </div>
      ) : !showExistingDeals ? (
        <button
          type="button"
          onClick={() => setShowExistingDeals(true)}
          className="flex w-full items-center justify-between rounded-xl border border-dashed border-white/15 bg-white/[0.03] p-4 text-left text-sm text-slate-400 transition hover:border-white/25 hover:text-slate-200"
        >
          <span>
            {deals.length} existing Curated Deal{deals.length === 1 ? "" : "s"} hidden — staged
            development for deals already in progress.
          </span>
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-300">
            Show existing deals
          </span>
        </button>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setShowExistingDeals(false)}
            className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 underline decoration-dotted hover:text-slate-300"
          >
            Hide existing deals
          </button>
          {deals.map((deal) => (
          <div key={deal.id} className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-white">{deal.title}</h3>
                <p className="mt-1 text-xs text-slate-400">
                  {deal.cruiseLine} | {deal.shipName} | {deal.sailDateIso} | package {deal.packageId}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.16em] ${deal.publishable ? "border-emerald-400/35 bg-emerald-500/10 text-emerald-200" : "border-rose-400/35 bg-rose-500/10 text-rose-200"}`}>
                  {deal.publishable ? "homepage eligible" : "not public"}
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-200">
                  approval: {deal.approvalStatus}
                </span>
                <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.16em] ${deal.linkHealth === "valid" ? "border-emerald-400/35 bg-emerald-500/10 text-emerald-200" : "border-amber-400/35 bg-amber-500/10 text-amber-200"}`}>
                  link: {deal.linkHealth}
                </span>
                {deal.pinned && (
                  <span className="rounded-full border border-cyan-400/35 bg-cyan-500/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-cyan-200">
                    pinned
                  </span>
                )}
                {deal.hidden && (
                  <span className="rounded-full border border-rose-400/35 bg-rose-500/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-rose-200">
                    hidden
                  </span>
                )}
              </div>
            </div>

            <DealStatusExplainer deal={deal} />

            {/* Homepage visibility and link/capture operations */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={busy !== null}
                onClick={() =>
                  void call(
                    { action: deal.pinned ? "unpin" : "pin", dealId: deal.id },
                    `${deal.id}:pin`
                  )
                }
                className="inline-flex h-8 items-center rounded-lg border border-white/10 bg-black/25 px-3 text-xs font-semibold text-slate-200 transition hover:border-cyan-300/50 disabled:opacity-50"
              >
                {deal.pinned ? "Unpin" : "Pin to top"}
              </button>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() =>
                  void call(
                    { action: deal.hidden ? "unhide" : "hide", dealId: deal.id, decisionNote },
                    `${deal.id}:hide`
                  )
                }
                className="inline-flex h-8 items-center rounded-lg border border-white/10 bg-black/25 px-3 text-xs font-semibold text-slate-200 transition hover:border-rose-300/50 disabled:opacity-50"
              >
                {deal.hidden ? "Unhide" : "Hide from homepage"}
              </button>
              <button
                type="button"
                disabled={busy !== null || deal.linkHealth !== "valid"}
                onClick={() =>
                  void call(
                    { action: "refresh_link", dealId: deal.id, decisionNote },
                    `${deal.id}:refresh_link`
                  )
                }
                className="inline-flex h-8 items-center rounded-lg border border-white/10 bg-black/25 px-3 text-xs font-semibold text-slate-200 transition hover:border-amber-300/50 disabled:opacity-50"
              >
                Mark link stale (request re-verification)
              </button>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() =>
                  void call(
                    { action: "request_capture", dealId: deal.id, decisionNote },
                    `${deal.id}:request_capture`
                  )
                }
                className="inline-flex h-8 items-center rounded-lg border border-white/10 bg-black/25 px-3 text-xs font-semibold text-slate-200 transition hover:border-sky-300/50 disabled:opacity-50"
              >
                Request operator CBAT capture
              </button>
            </div>

            {deal.agentOnlyNotes.length > 0 && (
              <ul className="mt-2 space-y-1 text-[11px] leading-4 text-slate-500">
                {deal.agentOnlyNotes.map((note, idx) => (
                  <li key={`${deal.id}-note-${idx}`}>{note}</li>
                ))}
              </ul>
            )}

            {/* 2-5: Stage runners */}
            <div className="mt-4">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                2–5 · Run stages independently
              </p>
              <div className="mt-2 grid gap-2 md:grid-cols-3 xl:grid-cols-6">
                {STAGES.map((stage) => {
                  const present =
                    (stage.id === "research" && deal.hasAngleResearch) ||
                    (stage.id === "targeting" && deal.hasTargetingDemographic) ||
                    (stage.id === "pitch" && deal.hasPitchBrief) ||
                    (stage.id === "copy" && deal.hasCopyPackage) ||
                    (stage.id === "ad_structure" && deal.hasAdStructure) ||
                    (stage.id === "media" && deal.hasMediaPlan);

                  // Enforce the research → targeting → pitch → copy/ad/media
                  // sequence in the UI so prerequisites are never silently
                  // auto-generated out of order.
                  let prereqReason: string | null = null;
                  if (stage.id === "targeting" && !deal.hasAngleResearch) {
                    prereqReason = "Run Trip research first.";
                  } else if (stage.id === "pitch" && !(deal.hasAngleResearch && deal.hasTargetingDemographic)) {
                    prereqReason = "Run Trip research and Targeting first.";
                  } else if (
                    (stage.id === "copy" || stage.id === "ad_structure" || stage.id === "media") &&
                    !deal.hasPitchBrief
                  ) {
                    prereqReason = "Run Sales pitch first.";
                  }
                  const blocked = prereqReason !== null;
                  const key = `${deal.id}:${stage.id}`;
                  return (
                    <button
                      key={stage.id}
                      type="button"
                      disabled={busy !== null || blocked}
                      title={prereqReason ?? undefined}
                      onClick={() =>
                        void call(
                          { action: "stage", dealId: deal.id, stage: stage.id, promoRecordIds: selectedPromos },
                          key
                        )
                      }
                      className="rounded-lg border border-white/10 bg-black/25 p-3 text-left transition hover:border-cyan-300/50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-white">{stage.label}</span>
                        <span className={`text-[10px] ${present ? "text-emerald-300" : "text-slate-500"}`}>
                          {present ? "ready" : "—"}
                        </span>
                      </div>
                      {stage.isPhase9B && (
                        <span className="mt-0.5 inline-block rounded-full bg-cyan-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-cyan-300">
                          required before copy
                        </span>
                      )}
                      <p className="mt-1 text-[11px] leading-4 text-slate-400">{stage.description}</p>
                      {blocked ? (
                        <span className="mt-2 block text-[10px] font-bold uppercase tracking-[0.14em] text-amber-300">
                          {prereqReason}
                        </span>
                      ) : (
                        <span className="mt-2 block text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-300">
                          {busy === key ? "running" : "regenerate"}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* AI transparency: per-stage prompt + response (Visual Verification) */}
              {deal.aiTraces.length > 0 && (
                <div className="mt-3 space-y-2">
                  {deal.aiTraces.map((trace) => (
                    <details
                      key={`${deal.id}-trace-${trace.stage}`}
                      className="rounded-lg border border-white/10 bg-black/20 p-2"
                    >
                      <summary className="cursor-pointer text-[11px] font-semibold text-slate-300">
                        AI debug · {trace.stage}{" "}
                        <span className="text-slate-500">
                          {trace.generator === "gpt"
                            ? `(${trace.model ?? "gpt"}${trace.latencyMs != null ? ` · ${trace.latencyMs}ms` : ""})`
                            : `(${trace.generator})`}
                        </span>
                      </summary>
                      {trace.promptSent && (
                        <div className="mt-2">
                          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Prompt sent</p>
                          <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-black/40 p-2 text-[10px] leading-4 text-slate-400">
                            {trace.promptSent}
                          </pre>
                        </div>
                      )}
                      {trace.rawResponse && (
                        <div className="mt-2">
                          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Raw response</p>
                          <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-black/40 p-2 text-[10px] leading-4 text-slate-400">
                            {trace.rawResponse}
                          </pre>
                        </div>
                      )}
                    </details>
                  ))}
                </div>
              )}
              {/* Pitch brief preview */}
              {deal.hasPitchBrief ? (
                <div className="mt-3 rounded-lg border border-cyan-400/20 bg-cyan-500/5 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-400">
                    Pitch brief {deal.pitchGenerator === "gpt" ? "(GPT)" : "(scaffold)"}
                  </p>
                  <p className="mt-1 text-xs font-semibold leading-5 text-white">{deal.pitchPrimaryHook}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-400">{deal.pitchTripSummary}</p>
                  {deal.pitchVoiceWarnings.length > 0 && (
                    <ul className="mt-2 space-y-1 text-[11px] leading-4 text-amber-200">
                      {deal.pitchVoiceWarnings.map((warning) => (
                        <li key={warning}>⚠ {warning}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                <div className="mt-3 rounded-lg border border-amber-400/20 bg-amber-500/5 p-3 text-xs text-amber-200">
                  No pitch brief yet — run the <span className="font-semibold">Sales pitch</span> stage before generating copy.
                </div>
              )}

              {deal.publicCopyRedFlags.length > 0 && (
                <ul className="mt-3 space-y-1 text-xs leading-5 text-amber-100">
                  {deal.publicCopyRedFlags.map((flag) => (
                    <li key={flag}>⚠ {flag}</li>
                  ))}
                </ul>
              )}
            </div>

            {/* Booking URL */}
            <div className="mt-4 rounded-lg border border-blue-400/20 bg-blue-500/5 p-3">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-400">Booking URL</p>
              <p className="mt-2 break-all text-xs font-mono text-blue-200">{deal.bookingUrl || "none"}</p>
              <p className="mt-2 text-[11px] leading-4 text-slate-400">
                This is the link visitors will use to book. If blank, a constructed package link was created automatically. If filled, it's an operator-captured link from the cruise line's Share button.
              </p>
            </div>

            {/* 6: Approval gate */}
            <div className="mt-4 rounded-lg border border-white/10 bg-black/20 p-3">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                6 · Approval &amp; publish gate
              </p>
              <ul className="mt-2 space-y-1">
                {deal.approvalGates.map((gate) => (
                  <GateRow key={gate.id} gate={gate} />
                ))}
              </ul>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={busy !== null || deal.linkHealth === "valid"}
                  onClick={() => void call({ action: "set_link_valid", dealId: deal.id }, `${deal.id}:link`)}
                  className="inline-flex h-9 items-center rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-500/20 disabled:opacity-50"
                >
                  {deal.linkHealth === "valid" ? "Link verified" : "Mark link valid (operator-verified)"}
                </button>
                <input
                  className="h-9 flex-1 min-w-[180px] rounded-lg border border-white/10 bg-black/25 px-3 text-xs text-white outline-none placeholder:text-slate-600"
                  value={decisionNote}
                  onChange={(e) => setDecisionNote(e.target.value)}
                  placeholder="Decision note (optional)"
                />
                <label className="flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-black/25 px-3 text-xs text-slate-300">
                  <input type="checkbox" checked={textOnly} onChange={(e) => setTextOnly(e.target.checked)} className="h-3.5 w-3.5 accent-cyan-400" />
                  Waive media (text-only launch)
                </label>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() =>
                    void call(
                      { action: "approve", dealId: deal.id, decisionNote, textOnlyLaunchWaived: textOnly },
                      `${deal.id}:approve`
                    )
                  }
                  className="inline-flex h-9 items-center rounded-lg border border-cyan-300/40 bg-cyan-400/15 px-4 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-400/25 disabled:opacity-50"
                >
                  {busy === `${deal.id}:approve` ? "Approving..." : "Approve"}
                </button>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void call({ action: "reject", dealId: deal.id, decisionNote }, `${deal.id}:reject`)}
                  className="inline-flex h-9 items-center rounded-lg border border-rose-400/30 bg-rose-500/10 px-4 text-xs font-semibold text-rose-100 transition hover:bg-rose-500/20 disabled:opacity-50"
                >
                  Reject
                </button>
              </div>
              <p className="mt-2 text-[11px] leading-4 text-slate-500">
                Approval only succeeds when every blocking gate passes. A valid booking link alone is never
                enough — the operator must approve before the homepage can render this Deal.
              </p>
            </div>
          </div>
          ))}
        </>
      )}
    </div>
  );
}
