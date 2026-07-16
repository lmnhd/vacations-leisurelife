"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

function DealStatusExplainer({ deal }: { deal: any }) {
  const [isOpen, setIsOpen] = useState(false);

  let explanation = "";
  let tone = "neutral";

  if (deal.packageId === "0000000") {
    explanation =
      "This is a test/sample Deal with a fake package ID (0000000). It exists to demonstrate that the publishing gate works - it will never book because the package is not real. You can ignore this Deal.";
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
  DealsSystemStageReviewSummary,
} from "@/lib/cb/deals-system/dashboard-data";
import { buildDealBriefId } from "@/lib/cb/deals-system/deal-ids";
import type { DealItineraryDay } from "@/lib/cb/deals-system/deal-trip-manifest-types";
import {
  assessPromoHandoff,
  type PromoHandoffAssessment,
} from "@/lib/cb/deals-system/promo-handoff-assessment";

interface PromoOption {
  id: string;
  title: string;
  vendor: string;
  applicableMarkets: string[];
}

interface ApiResponse {
  ok: boolean;
  error?: string;
  approved?: boolean;
  blockingFailures?: Array<{ label: string; detail: string }>;
  nextUrl?: string;
  angleOptions?: GeneratedAngleOption[];
  modelId?: string;
  warnings?: string[];
  handoffAssessment?: PromoHandoffAssessment;
}

interface GeneratedAngleOption {
  campaignAngle: string;
  targetAudience: string;
  visualAngle: string;
  targetingKeywords: string[];
  rationale: string;
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
        {gate.passed ? "+" : "x"}
      </span>
      <span className="text-slate-300">
        <span className="font-semibold text-white">{gate.label}</span>
        {!gate.blocking && <span className="ml-1 text-slate-500">(advisory)</span>} - {gate.detail}
      </span>
    </li>
  );
}

function formatMarketLabel(value: PromoHandoffAssessment["inferredAudienceMarket"]): string {
  if (value === "UK") return "United Kingdom";
  if (value === "US") return "United States";
  if (value === "CA") return "Canada";
  if (value === "LATAM") return "Latin America";
  return "Not inferred";
}

function HandoffStatusBadge({ assessment }: { assessment: PromoHandoffAssessment }) {
  let className = "border-emerald-400/35 bg-emerald-500/10 text-emerald-200";
  let label = "promo attached";
  if (assessment.status === "no_promo_selected") {
    className = "border-amber-400/35 bg-amber-500/10 text-amber-200";
    label = "no promo selected";
  } else if (assessment.status === "promo_market_unknown") {
    className = "border-amber-400/35 bg-amber-500/10 text-amber-200";
    label = "market needs review";
  } else if (assessment.status === "promo_market_mismatch") {
    className = "border-rose-400/35 bg-rose-500/10 text-rose-200";
    label = "market mismatch";
  }
  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.16em] ${className}`}
    >
      {label}
    </span>
  );
}

function StageReviewDrawer({
  label,
  ready,
  review,
}: {
  label: string;
  ready: boolean;
  review?: DealsSystemStageReviewSummary;
}) {
  return (
    <details className="rounded-lg border border-white/10 bg-black/20 p-3">
      <summary className="cursor-pointer list-none">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-white">{label}</p>
            <p className="mt-0.5 text-[11px] text-slate-500">
              {ready ? review?.title ?? "Ready" : "Not generated yet"}
            </p>
          </div>
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] ${
            ready
              ? "border-emerald-400/35 bg-emerald-500/10 text-emerald-200"
              : "border-white/10 bg-white/5 text-slate-500"
          }`}>
            {ready ? "ready" : "missing"}
          </span>
        </div>
      </summary>
      {review ? (
        <div className="mt-3 space-y-3">
          {review.generator && (
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
              Source: {review.generator}
            </p>
          )}
          {review.bullets.length > 0 && (
            <ul className="space-y-1 text-xs leading-5 text-slate-300">
              {review.bullets.map((item, idx) => (
                <li key={`${label}-bullet-${idx}`}>- {item}</li>
              ))}
            </ul>
          )}
          {review.details.length > 0 && (
            <div className="space-y-2">
              {review.details.map((detail) => (
                <div key={`${label}-${detail.label}`}>
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                    {detail.label}
                  </p>
                  <p className="mt-0.5 text-xs leading-5 text-slate-300">{detail.value}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <p className="mt-3 text-xs leading-5 text-slate-500">
          This stage has not been generated for the selected Deal record.
        </p>
      )}
    </details>
  );
}

function isAsciiLetterOrDigit(char: string) {
  if (!char) return false;
  const code = char.toLowerCase().charCodeAt(0);
  return (code >= 97 && code <= 122) || (code >= 48 && code <= 57);
}

function normalizeLooseText(value: string): string {
  let out = "";
  let lastWasSpace = false;
  for (const rawChar of value.toLowerCase()) {
    if (isAsciiLetterOrDigit(rawChar)) {
      out += rawChar;
      lastWasSpace = false;
      continue;
    }
    if (!lastWasSpace) {
      out += " ";
      lastWasSpace = true;
    }
  }
  return out.trim();
}

function slugifyText(value: string): string {
  let out = "";
  let lastWasDash = false;
  for (const rawChar of value.toLowerCase()) {
    if (isAsciiLetterOrDigit(rawChar)) {
      out += rawChar;
      lastWasDash = false;
      continue;
    }
    if (!lastWasDash && out.length > 0) {
      out += "-";
      lastWasDash = true;
    }
  }
  while (out.endsWith("-")) out = out.slice(0, -1);
  return out;
}

function keepDigits(value: string): string {
  let out = "";
  for (const char of value) {
    if (char >= "0" && char <= "9") out += char;
  }
  return out;
}

function findFirstUrl(value: string): string | null {
  for (const token of value.split(" ")) {
    const trimmed = token.trim();
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      return trimmed;
    }
  }
  return null;
}

function packageIdFromUrl(value: string): string {
  const marker = "/package/";
  const idx = value.indexOf(marker);
  if (idx < 0) return "";
  const tail = value.slice(idx + marker.length);
  let out = "";
  for (const char of tail) {
    if (char >= "0" && char <= "9") {
      out += char;
      continue;
    }
    break;
  }
  return out;
}

function toIsoDate(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.length >= 10 && trimmed[4] === "-" && trimmed[7] === "-") {
    return trimmed.slice(0, 10);
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return trimmed;
  const yyyy = parsed.getUTCFullYear();
  const mm = String(parsed.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(parsed.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function labelMatches(label: string, options: string[]): boolean {
  const normalized = normalizeLooseText(label);
  return options.some((option) => normalized === option || normalized.startsWith(`${option} `));
}

function buildSuggestedDealId(cruiseLine: string, title: string, packageId: string): string {
  if (packageId.trim()) return packageId.trim();
  const lineSlug = slugifyText(cruiseLine);
  const titleSlug = slugifyText(title);
  return ["deal", lineSlug || "cruise", titleSlug || "sailing"].filter(Boolean).join("-");
}

function buildSuggestedBriefId(packageId: string, title: string, shipName: string): string {
  if (packageId.trim()) return buildDealBriefId(packageId, title || shipName);
  const titleSlug = slugifyText(title);
  const shipSlug = slugifyText(shipName);
  return ["brief", titleSlug || shipSlug || "curated-cruise"].filter(Boolean).join("-");
}

interface ImportedWorkbenchDraft {
  packageId: string;
  cruiseLine: string;
  shipName: string;
  title: string;
  nights: string;
  sailDate: string;
  departurePort: string;
  ports: string;
  bookingUrl: string;
  promoHint: string;
}

function parseWorkbenchImport(text: string): ImportedWorkbenchDraft {
  const draft: ImportedWorkbenchDraft = {
    packageId: "",
    cruiseLine: "",
    shipName: "",
    title: "",
    nights: "",
    sailDate: "",
    departurePort: "",
    ports: "",
    bookingUrl: "",
    promoHint: "",
  };

  const normalizedLines = text.split("\r").join("").split("\n");
  for (const rawLine of normalizedLines) {
    const line = rawLine.trim();
    if (!line) continue;

    const url = findFirstUrl(line);
    if (url && !draft.bookingUrl && url.includes("bookings.cbagenttools.com")) {
      draft.bookingUrl = url;
      if (!draft.packageId) {
        const packageId = packageIdFromUrl(url);
        if (packageId) draft.packageId = packageId;
      }
    }

    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const label = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (!value) continue;

    if (labelMatches(label, ["package id", "package", "pid"])) {
      draft.packageId = keepDigits(value) || draft.packageId;
      continue;
    }
    if (labelMatches(label, ["cruise line", "line", "vendor"])) {
      draft.cruiseLine = value;
      continue;
    }
    if (labelMatches(label, ["ship", "ship name"])) {
      draft.shipName = value;
      continue;
    }
    if (labelMatches(label, ["title", "itinerary", "title itinerary", "sailing"])) {
      draft.title = value;
      continue;
    }
    if (labelMatches(label, ["nights", "night"])) {
      draft.nights = keepDigits(value) || draft.nights;
      continue;
    }
    if (labelMatches(label, ["sail date", "date"])) {
      draft.sailDate = toIsoDate(value);
      continue;
    }
    if (labelMatches(label, ["departure port", "port"])) {
      draft.departurePort = value;
      continue;
    }
    if (labelMatches(label, ["ports of call", "ports", "route"])) {
      draft.ports = value.split("|").join(", ");
      continue;
    }
    if (labelMatches(label, ["promo", "promotion"])) {
      draft.promoHint = value;
      continue;
    }
    if (labelMatches(label, ["booking url", "share booking url", "captured share booking url", "url"])) {
      const foundUrl = findFirstUrl(value);
      if (foundUrl) draft.bookingUrl = foundUrl;
    }
  }

  return draft;
}

function findPromoMatches(
  promoOptions: PromoOption[],
  cruiseLine: string,
  importText: string,
  promoHint: string
): string[] {
  const searchPool = normalizeLooseText(`${importText}\n${promoHint}`);
  const exactMatches = promoOptions
    .filter((promo) => searchPool.includes(normalizeLooseText(promo.title)))
    .map((promo) => promo.id);
  if (exactMatches.length > 0) return exactMatches;

  const vendorMatches = promoOptions.filter((promo) => cruiseLineMatches(cruiseLine, promo.vendor));
  if (vendorMatches.length === 1) return [vendorMatches[0].id];
  return [];
}

export function DealCampaignWorkbench({
  deals,
  promoOptions,
}: {
  deals: DealsSystemCuratedDealSummary[];
  promoOptions: PromoOption[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedDealId = searchParams.get("dealId");
  const initialDealId =
    requestedDealId && deals.some((deal) => deal.id === requestedDealId)
      ? requestedDealId
      : deals[0]?.id ?? "";
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [selectedDealId, setSelectedDealId] = useState(initialDealId);

  // Assembly form state.
  const [dealId, setDealId] = useState("");
  const [briefId, setBriefId] = useState("");
  const [packageId, setPackageId] = useState("");
  const [siid, setSiid] = useState("1049337");
  const [title, setTitle] = useState("");
  const [cruiseLine, setCruiseLine] = useState("");
  const [shipName, setShipName] = useState("");
  const [nights, setNights] = useState("");
  const [sailDate, setSailDate] = useState("");
  const [departurePort, setDeparturePort] = useState("");
  const [ports, setPorts] = useState("");
  const [cabinPrices, setCabinPrices] = useState<{
    inside?: number;
    outside?: number;
    balcony?: number;
    suite?: number;
    currencyCode: string;
    leadFare?: number;
  }>({ currencyCode: "USD" });
  const [dayByDayItinerary, setDayByDayItinerary] = useState<DealItineraryDay[]>([]);
  const [bookingUrl, setBookingUrl] = useState("");
  const [assemblySelectedPromos, setAssemblySelectedPromos] = useState<string[]>([]);
  const [selectedDealPromos, setSelectedDealPromos] = useState<string[]>(
    deals.find((deal) => deal.id === initialDealId)?.promoApplicabilityIds ?? []
  );
  const [textOnly, setTextOnly] = useState(false);
  const [decisionNote, setDecisionNote] = useState("");
  const [showAllPromos, setShowAllPromos] = useState(false);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [packageLookupId, setPackageLookupId] = useState("");
  const [campaignAngle, setCampaignAngle] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [visualAngle, setVisualAngle] = useState("");
  const [targetingKeywords, setTargetingKeywords] = useState("");
  const [angleOptions, setAngleOptions] = useState<GeneratedAngleOption[]>([]);
  const [angleStatus, setAngleStatus] = useState<string | null>(null);

  // Ship finder - auto-fills the assembly fields below from a live Odysseus
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
  const selectedDeal = deals.find((deal) => deal.id === selectedDealId) ?? deals[0];
  const selectedDealVisiblePromoOptions = useMemo(
    () =>
      selectedDeal
        ? promoOptions.filter((promo) => cruiseLineMatches(selectedDeal.cruiseLine, promo.vendor))
        : [],
    [promoOptions, selectedDeal]
  );
  const selectedDealOtherPromoOptions = useMemo(
    () =>
      selectedDeal
        ? promoOptions.filter((promo) => !cruiseLineMatches(selectedDeal.cruiseLine, promo.vendor))
        : [],
    [promoOptions, selectedDeal]
  );
  const selectedPromoRecords = useMemo(
    () => promoOptions.filter((promo) => selectedDealPromos.includes(promo.id)),
    [promoOptions, selectedDealPromos]
  );
  const selectedDealCruiseLinePromoCount = useMemo(
    () =>
      selectedDeal
        ? promoOptions.filter((promo) => cruiseLineMatches(selectedDeal.cruiseLine, promo.vendor)).length
        : 0,
    [promoOptions, selectedDeal]
  );
  const handoffAssessment = useMemo(
    () =>
      assessPromoHandoff({
        cruiseLine: selectedDeal?.cruiseLine,
        campaignAngle: campaignAngle.trim(),
        targetAudience: targetAudience.trim(),
        targetingKeywords: targetingKeywords
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        selectedPromos: selectedPromoRecords,
        cruiseLinePromoCount: selectedDealCruiseLinePromoCount,
      }),
    [
      campaignAngle,
      selectedDeal,
      selectedDealCruiseLinePromoCount,
      selectedPromoRecords,
      targetAudience,
      targetingKeywords,
    ]
  );

  useEffect(() => {
    if (!requestedDealId) return;
    const requestedDeal = deals.find((deal) => deal.id === requestedDealId);
    if (!requestedDeal) return;
    setSelectedDealId(requestedDeal.id);
    setSelectedDealPromos(requestedDeal.promoApplicabilityIds ?? []);
  }, [requestedDealId, deals]);

  useEffect(() => {
    if (!selectedDeal) return;
    setSelectedDealPromos(selectedDeal.promoApplicabilityIds ?? []);
    setCampaignAngle(selectedDeal.campaignAngle ?? "");
    setTargetAudience(selectedDeal.targetAudience ?? "");
    setVisualAngle(selectedDeal.visualAngle ?? "");
    setTargetingKeywords(selectedDeal.targetingKeywords?.join(", ") ?? "");
    setAngleStatus(null);
  }, [selectedDealId]);

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
      if (payload.nextUrl) {
        window.location.href = payload.nextUrl;
        return;
      }
      router.refresh();
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  }

  async function generateAnglesForDeal(deal: DealsSystemCuratedDealSummary) {
    const key = `${deal.id}:generate_angles`;
    setBusy(key);
    setMessage(null);
    setAngleStatus(null);
    try {
      const response = await fetch("/api/tests/deals-system/curated-deal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate_angles",
          dealId: deal.id,
          promoRecordIds: selectedDealPromos,
          campaignAngle: campaignAngle.trim(),
          targetAudience: targetAudience.trim(),
          visualAngle: visualAngle.trim(),
          targetingKeywords: targetingKeywords
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
        }),
      });
      const payload = (await response.json()) as ApiResponse;
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? `Request failed (${response.status}).`);
      }
      const nextOptions = payload.angleOptions ?? [];
      setAngleOptions(nextOptions);
      if (nextOptions[0]) {
        applyAngleOption(nextOptions[0]);
        await call(
          {
            action: "save_strategy",
            dealId: deal.id,
            campaignAngle: nextOptions[0].campaignAngle,
            targetAudience: nextOptions[0].targetAudience,
            visualAngle: nextOptions[0].visualAngle,
            targetingKeywords: nextOptions[0].targetingKeywords,
          },
          `${deal.id}:save_strategy`
        );
      }
      setAngleStatus(
        nextOptions.length > 0
          ? `Generated ${nextOptions.length} angle options${payload.modelId ? ` with ${payload.modelId}` : ""}.`
          : "No angle options returned."
      );
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  }

  function applyAngleOption(option: GeneratedAngleOption) {
    setCampaignAngle(option.campaignAngle);
    setTargetAudience(option.targetAudience);
    setVisualAngle(option.visualAngle);
    setTargetingKeywords(option.targetingKeywords.join(", "));
  }

  function saveCampaignStrategy(deal: DealsSystemCuratedDealSummary) {
    void call(
      {
        action: "save_strategy",
        dealId: deal.id,
        campaignAngle: campaignAngle.trim(),
        targetAudience: targetAudience.trim(),
        visualAngle: visualAngle.trim(),
        targetingKeywords: targetingKeywords
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
      },
      `${deal.id}:save_strategy`
    );
  }

  function continueInPipeline(deal: DealsSystemCuratedDealSummary) {
    if (handoffAssessment.blockingIssues.length > 0) {
      setMessage({
        tone: "error",
        text: `Cannot continue yet. ${handoffAssessment.blockingIssues.join(" ")}`,
      });
      return;
    }
    if (handoffAssessment.warnings.length > 0) {
      const shouldProceed = window.confirm(
        [
          "Pipeline handoff warnings:",
          "",
          ...handoffAssessment.warnings.map((warning) => `- ${warning}`),
          "",
          "Continue anyway?",
        ].join("\n")
      );
      if (!shouldProceed) return;
    }
    void call(
      {
        action: "send_to_pipeline",
        dealId: deal.id,
        promoRecordIds: selectedDealPromos,
        campaignAngle: campaignAngle.trim(),
        targetAudience: targetAudience.trim(),
        visualAngle: visualAngle.trim(),
        targetingKeywords: targetingKeywords.trim(),
      },
      `${deal.id}:send_to_pipeline`
    );
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
        promoRecordIds: assemblySelectedPromos,
        cruiseFacts: {
          title,
          cruiseLine,
          shipName,
          itineraryName: title,
          nights: Number(nights) || 0,
          sailDateIso: sailDate,
          departurePort,
          portsOfCall: ports.split(",").map((p) => p.trim()).filter(Boolean),
          dayByDayItinerary,
          cabinPrices,
        },
      },
      "assemble"
    );
  }

  function toggleAssemblyPromo(id: string) {
    setAssemblySelectedPromos((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  }

  function toggleSelectedDealPromo(id: string) {
    setSelectedDealPromos((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  }

  function importFoundSailing() {
    const parsed = parseWorkbenchImport(importText);
    const hasCoreFields =
      parsed.packageId ||
      parsed.title ||
      parsed.shipName ||
      parsed.cruiseLine ||
      parsed.sailDate;

    if (!hasCoreFields) {
      setImportError(
        "Paste a small key:value block first, such as Cruise line, Ship, Title, Sail date, Package ID, and Promo."
      );
      setImportStatus(null);
      return;
    }

    setImportError(null);

    if (parsed.packageId) setPackageId(parsed.packageId);
    if (parsed.cruiseLine) {
      setCruiseLine(parsed.cruiseLine);
      setFindLine(parsed.cruiseLine);
    }
    if (parsed.shipName) {
      setShipName(parsed.shipName);
      setFindShip(parsed.shipName);
    }
    if (parsed.title) setTitle(parsed.title);
    if (parsed.nights) setNights(parsed.nights);
    if (parsed.sailDate) {
      setSailDate(parsed.sailDate);
      setFindDate(parsed.sailDate);
    }
    if (parsed.departurePort) setDeparturePort(parsed.departurePort);
    if (parsed.ports) setPorts(parsed.ports);
    if (parsed.bookingUrl) setBookingUrl(parsed.bookingUrl);
    setDayByDayItinerary([]);

    const nextCruiseLine = parsed.cruiseLine || cruiseLine;
    const nextTitle = parsed.title || title;
    const nextShipName = parsed.shipName || shipName;
    const nextPackageId = parsed.packageId || packageId;
    setDealId(buildSuggestedDealId(nextCruiseLine, nextTitle, nextPackageId));
    setBriefId(buildSuggestedBriefId(nextPackageId, nextTitle, nextShipName));

    const promoMatches = findPromoMatches(
      promoOptions,
      nextCruiseLine,
      importText,
      parsed.promoHint
    );
    if (promoMatches.length > 0) {
      setAssemblySelectedPromos(promoMatches);
    }

    const appliedPromoText =
      promoMatches.length > 0
        ? ` Attached ${promoMatches.length} matching promo${promoMatches.length === 1 ? "" : "s"}.`
        : "";
    setImportStatus(
      `Imported the pasted sailing into the workbench fields.${appliedPromoText} Review the values, then assemble or run the live lookup if you want Odysseus to confirm them.`
    );
  }

  // Runs the same live Odysseus lookup the Trip Manifestation pipeline step
  // uses, then auto-fills the assembly fields below from the matched cruise -
  // package id, cruise line, ship, sail date, nights, departure port, and
  // ports of call - instead of hand-typing all ten.
  async function findShipAndFill(options?: { packageId?: string }) {
    const exactPackageId = keepDigits(options?.packageId ?? "");
    if (!exactPackageId && !findLine.trim() && !findShip.trim()) {
      setFindError("Enter a package number, cruise line, or ship name.");
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
          packageId: exactPackageId || undefined,
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
          cabinPricing?: {
            inside?: number;
            outside?: number;
            balcony?: number;
            suite?: number;
            currencyCode: string;
            leadFare?: number;
          };
          dayByDayItinerary?: DealItineraryDay[];
          confidence: number;
        } | null;
      };
      if (!response.ok || !payload.ok || !payload.cruiseFacts) {
        throw new Error(payload.message ?? "No matching sailing found.");
      }

      const f = payload.cruiseFacts;
      setPackageId(f.packageId);
      setPackageLookupId(f.packageId);
      setCruiseLine(f.cruiseLine || findLine.trim());
      setShipName(f.shipName || findShip.trim());
      setTitle(f.title);
      if (f.nights) setNights(String(f.nights));
      setSailDate(f.sailDateIso);
      if (f.departurePort) setDeparturePort(f.departurePort);
      if (f.ports) setPorts(f.ports);
      setCabinPrices(f.cabinPricing ?? { currencyCode: "USD" });
      setDayByDayItinerary(f.dayByDayItinerary ?? []);
      setDealId(
        buildSuggestedDealId(
          f.cruiseLine || findLine.trim(),
          f.title,
          f.packageId
        )
      );
      setBriefId(buildSuggestedBriefId(f.packageId, f.title, f.shipName || findShip.trim()));

      const autoPromos = findPromoMatches(
        promoOptions,
        f.cruiseLine || findLine.trim(),
        `${f.cruiseLine}\n${f.title}`,
        ""
      );
      if (autoPromos.length > 0) {
        setAssemblySelectedPromos(autoPromos);
      }

      setFindStatus(
        payload.status === "package_match"
          ? `Loaded exact package ${f.packageId}: ${f.title}. Review the auto-filled fields below, then assemble the Deal.`
          : payload.status === "confident_match"
          ? `Matched: ${f.title} (${Math.round(f.confidence * 100)}% confidence). Fields below filled in - review before assembling.`
          : `Best available match used: ${f.title}. Confidence was low - double-check the fields below.`
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
          1 - Source &amp; assemble
        </p>
        <p className="mt-1 text-sm text-slate-400">
          Convert a package candidate into a <span className="font-semibold text-white">needs_review</span>{" "}
          Curated Deal. This never publishes on its own - it always lands in review with every campaign
          stage generated. Start with the package number below and the sailing details will be filled
          automatically for review.
        </p>

        <div className="mt-4 rounded-lg border border-cyan-300/30 bg-cyan-500/10 p-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-cyan-200">
            Start with a package number
          </p>
          <p className="mt-1 text-sm leading-5 text-slate-300">
            Enter the Odysseus package number. We will load the cruise line, ship, title,
            sail date, nights, departure port, itinerary, and matching promotion choices.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              className={`${inputClassName()} sm:max-w-xs`}
              inputMode="numeric"
              value={packageLookupId}
              onChange={(e) => setPackageLookupId(keepDigits(e.target.value))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && packageLookupId.trim() && !finding) {
                  e.preventDefault();
                  void findShipAndFill({ packageId: packageLookupId });
                }
              }}
              placeholder="Package number, e.g. 1543052"
            />
            <button
              type="button"
              disabled={finding || !packageLookupId.trim()}
              onClick={() => void findShipAndFill({ packageId: packageLookupId })}
              className="inline-flex h-10 items-center justify-center rounded-lg border border-cyan-200/50 bg-cyan-300/15 px-5 text-sm font-semibold text-cyan-50 transition hover:bg-cyan-300/25 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {finding ? "Loading package..." : "Load package"}
            </button>
          </div>
          {findError && <p className="mt-2 text-xs text-rose-300">{findError}</p>}
          {findStatus && <p className="mt-2 text-xs text-emerald-200">{findStatus}</p>}
        </div>

        <details className="mt-4 rounded-lg border border-white/10 bg-black/10">
          <summary className="cursor-pointer px-4 py-3 text-xs font-semibold text-slate-300">
            Advanced intake options
          </summary>
          <div className="border-t border-white/10 p-3">
        <div className="rounded-lg border border-violet-400/20 bg-violet-500/5 p-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-violet-300">
            Import found sailing - paste a structured note from research or chat
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            Paste a short key:value block and we will fill the workbench for you. Best results:
            Cruise line, Ship, Title, Sail date, Nights, Departure port, Ports of call, Package ID,
            Promo, and an optional booking URL.
          </p>
          <textarea
            className="mt-3 min-h-[148px] w-full rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-violet-300/60"
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder={[
              "Cruise line: Celebrity Cruises",
              "Ship: Celebrity Apex",
              "Title: 14 Nights Spain & Portugal Solar Eclipse",
              "Sail date: 2026-08-01",
              "Nights: 14",
              "Departure port: Southampton",
              "Ports of call: Porto, Lisbon, Palma de Mallorca, Barcelona, Ibiza, Malaga, La Coruna, Bilbao",
              "Package ID: 1543049",
              "Promo: Celebrity Cruises - SUMMER SALE - Dollars Off, Onboard Credit",
            ].join("\n")}
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={importFoundSailing}
              className="inline-flex h-9 items-center rounded-lg border border-violet-300/40 bg-violet-400/10 px-4 text-xs font-semibold text-violet-100 transition hover:bg-violet-400/20"
            >
              Import into workbench
            </button>
            <p className="text-[11px] leading-4 text-slate-500">
              This path is for facts we already found. The live lookup below is still the best follow-up for confirmation.
            </p>
          </div>
          {importError && <p className="mt-2 text-xs text-rose-300">{importError}</p>}
          {importStatus && <p className="mt-2 text-xs text-emerald-200">{importStatus}</p>}
        </div>

        <div className="mt-4 rounded-lg border border-cyan-400/20 bg-cyan-500/5 p-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-cyan-300">
            Find ship - auto-fill from a live lookup
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
        </div>
          </div>
        </details>

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
            help={`Optional. Leave blank to auto-build a booking link from the Package id and SIID - its link health starts as "unknown" until verified. Paste a link here only after capturing it from the cruise line site's "Share" button; that marks it as operator-verified.`}
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
                  onClick={() => toggleAssemblyPromo(promo.id)}
                  className={`rounded-full border px-3 py-1 text-xs transition ${
                    assemblySelectedPromos.includes(promo.id)
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
                        onClick={() => toggleAssemblyPromo(promo.id)}
                        className={`rounded-full border px-3 py-1 text-xs transition ${
                          assemblySelectedPromos.includes(promo.id)
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
      ) : selectedDeal ? (
        <div className="space-y-3">
          <div className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <Field
                label={`Existing Curated Deals (${deals.length})`}
                help="Pick one deal to stage, verify, approve, pin, or hide."
                className="lg:max-w-2xl lg:flex-1"
              >
                <select
                 title="Pick a deal to stage, verify, approve, pin, or hide."
                  className={inputClassName()}
                  value={selectedDeal.id}
                  onChange={(e) => {
                    setSelectedDealId(e.target.value);
                    const nextDeal = deals.find((deal) => deal.id === e.target.value);
                    setSelectedDealPromos(nextDeal?.promoApplicabilityIds ?? []);
                    setAngleOptions([]);
                    setAngleStatus(null);
                    setCampaignAngle("");
                    setTargetAudience("");
                    setVisualAngle("");
                    setTargetingKeywords("");
                  }}
                >
                  {deals.map((deal) => (
                    <option key={deal.id} value={deal.id}>
                      {deal.title} - {deal.cruiseLine} - {deal.sailDateIso} - package {deal.packageId} - id {deal.id}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="flex flex-wrap gap-2">
                <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.16em] ${selectedDeal.publishable ? "border-emerald-400/35 bg-emerald-500/10 text-emerald-200" : "border-rose-400/35 bg-rose-500/10 text-rose-200"}`}>
                  {selectedDeal.publishable ? "homepage eligible" : "not public"}
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-200">
                  approval: {selectedDeal.approvalStatus}
                </span>
                <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.16em] ${selectedDeal.linkHealth === "valid" ? "border-emerald-400/35 bg-emerald-500/10 text-emerald-200" : "border-amber-400/35 bg-amber-500/10 text-amber-200"}`}>
                  link: {selectedDeal.linkHealth}
                </span>
              </div>
            </div>
          </div>

          {/* Sibling-record awareness: the pipeline's Publish step assembles a
              FRESH deal record keyed by the package id and never updates the
              "Source & assemble" staging record, so one sailing routinely has
              two records. Without this banner a stale staging record reads as
              "the deal isn't live" even while its sibling is on the homepage. */}
          {(() => {
            const siblings = deals.filter(
              (d) => d.packageId === selectedDeal.packageId && d.id !== selectedDeal.id
            );
            if (siblings.length === 0) return null;
            const liveSibling = siblings.find((d) => d.publishable);
            return (
              <div
                className={`rounded-xl border p-4 text-sm ${
                  liveSibling
                    ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-100"
                    : "border-amber-400/30 bg-amber-500/10 text-amber-100"
                }`}
              >
                {liveSibling ? (
                  <>
                    <p className="font-semibold">
                      A separate LIVE record exists for package {selectedDeal.packageId}.
                    </p>
                    <p className="mt-1 text-xs leading-5 opacity-90">
                      The record you have selected ({selectedDeal.id}) is the staging record from
                      &ldquo;Source &amp; assemble&rdquo; — its stages and gates stay empty by design. The
                      published homepage deal is <span className="font-semibold">{liveSibling.id}</span>{" "}
                      (approval: {liveSibling.approvalStatus}). Once the live record is confirmed good,
                      this staging record can be deleted.
                    </p>
                  </>
                ) : (
                  <p className="text-xs leading-5">
                    {siblings.length} other record(s) exist for package {selectedDeal.packageId} (
                    {siblings.map((d) => d.id).join(", ")}) — none currently pass the homepage gate.
                    Compare stage outputs before deleting one.
                  </p>
                )}
                {liveSibling ? (
                  <button
                    type="button"
                    className="mt-2 inline-flex h-8 items-center rounded-lg border border-emerald-300/40 bg-emerald-400/10 px-3 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-400/20"
                    onClick={() => {
                      setSelectedDealId(liveSibling.id);
                      setSelectedDealPromos(liveSibling.promoApplicabilityIds ?? []);
                      setAngleOptions([]);
                      setAngleStatus(null);
                      setCampaignAngle("");
                      setTargetAudience("");
                      setVisualAngle("");
                      setTargetingKeywords("");
                    }}
                  >
                    Switch to the live record
                  </button>
                ) : null}
              </div>
            );
          })()}

          {[selectedDeal].map((deal) => (
          <div key={deal.id} className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-white">{deal.title}</h3>
                <p className="mt-1 text-xs text-slate-400">
                  {deal.cruiseLine} | {deal.shipName} | {deal.sailDateIso} | package {deal.packageId}
                </p>
                <p className="mt-1 break-all text-[11px] text-slate-500">id: {deal.id}</p>
              </div>
              <div className="flex flex-wrap gap-2">
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
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => {
                  if (!window.confirm(`Delete this Deal record?\n\nTitle: ${deal.title}\nPackage: ${deal.packageId}\nID: ${deal.id}\n\nThis deletes only the currently selected Deal record.`)) {
                    return;
                  }
                  void call({ action: "delete", dealId: deal.id }, `${deal.id}:delete`);
                }}
                className="inline-flex h-8 items-center rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 text-xs font-semibold text-rose-100 transition hover:bg-rose-500/20 disabled:opacity-50"
              >
                Delete Deal
              </button>
            </div>

            {deal.agentOnlyNotes.length > 0 && (
              <ul className="mt-2 space-y-1 text-[11px] leading-4 text-slate-500">
                {deal.agentOnlyNotes.map((note, idx) => (
                  <li key={`${deal.id}-note-${idx}`}>{note}</li>
                ))}
              </ul>
            )}

            <div className="mt-4 rounded-lg border border-fuchsia-400/20 bg-fuchsia-500/5 p-3">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-fuchsia-300">
                    Pipeline entry - normalize into a manifest
                  </p>
                  <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-400">
                    Generate or edit the campaign angle, lock it to this sailing, then create the
                    manifest that the copywriter, funnel, publish, and ad steps already use.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <HandoffStatusBadge assessment={handoffAssessment} />
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void generateAnglesForDeal(deal)}
                    className="inline-flex h-9 items-center rounded-lg border border-fuchsia-300/40 bg-fuchsia-400/10 px-4 text-xs font-semibold text-fuchsia-100 transition hover:bg-fuchsia-400/20 disabled:cursor-wait disabled:opacity-60"
                  >
                    {busy === `${deal.id}:generate_angles` ? "Generating..." : "Generate angles"}
                  </button>
                  <button
                    type="button"
                    disabled={
                      busy !== null ||
                      !campaignAngle.trim() ||
                      !targetAudience.trim() ||
                      handoffAssessment.blockingIssues.length > 0
                    }
                    onClick={() => continueInPipeline(deal)}
                    className="inline-flex h-9 items-center rounded-lg border border-emerald-300/40 bg-emerald-400/10 px-4 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busy === `${deal.id}:send_to_pipeline` ? "Creating manifest..." : "Create manifest and open copywriter"}
                  </button>
                </div>
              </div>

              {angleStatus && <p className="mt-2 text-xs text-emerald-200">{angleStatus}</p>}

              <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                  Promo selection for this selected deal
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  Choose the promo for <span className="text-slate-200">{deal.cruiseLine}</span> here. This is
                  separate from the assembly form above.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {selectedDealVisiblePromoOptions.map((promo) => (
                    <button
                      key={`${deal.id}-${promo.id}`}
                      type="button"
                      onClick={() => toggleSelectedDealPromo(promo.id)}
                      className={`rounded-full border px-3 py-1 text-xs transition ${
                        selectedDealPromos.includes(promo.id)
                          ? "border-cyan-300/60 bg-cyan-400/15 text-cyan-100"
                          : "border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/25"
                      }`}
                    >
                      {promo.vendor}: {promo.title}
                    </button>
                  ))}
                  {selectedDealVisiblePromoOptions.length === 0 && (
                    <p className="text-xs text-slate-500">
                      No promo intelligence found for {deal.cruiseLine} yet.
                    </p>
                  )}
                </div>
                {selectedDealOtherPromoOptions.length > 0 && (
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={() => setShowAllPromos((value) => !value)}
                      className="text-[11px] text-slate-500 underline decoration-dotted hover:text-slate-300"
                    >
                      {showAllPromos
                        ? "Hide other cruise lines"
                        : `Show ${selectedDealOtherPromoOptions.length} more from other cruise lines`}
                    </button>
                    {showAllPromos && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {selectedDealOtherPromoOptions.map((promo) => (
                          <button
                            key={`${deal.id}-other-${promo.id}`}
                            type="button"
                            onClick={() => toggleSelectedDealPromo(promo.id)}
                            className={`rounded-full border px-3 py-1 text-xs transition ${
                              selectedDealPromos.includes(promo.id)
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

                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                      Inferred audience market
                    </p>
                    <p className="mt-1 text-xs text-slate-200">
                      {formatMarketLabel(handoffAssessment.inferredAudienceMarket)}
                    </p>
                    {handoffAssessment.inferredAudienceEvidence.length > 0 && (
                      <p className="mt-1 text-[11px] leading-4 text-slate-500">
                        {handoffAssessment.inferredAudienceEvidence.join(" ")}
                      </p>
                    )}
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                      Attached promos
                    </p>
                    {handoffAssessment.selectedPromoTitles.length > 0 ? (
                      <ul className="mt-1 space-y-1 text-xs leading-5 text-slate-200">
                        {handoffAssessment.selectedPromoTitles.map((title) => (
                          <li key={`${deal.id}-${title}`}>- {title}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1 text-xs text-slate-400">
                        None selected. The pipeline will build a no-promo manifest.
                      </p>
                    )}
                    <p className="mt-1 text-[11px] leading-4 text-slate-500">
                      Matching cruise-line promos in workbench: {handoffAssessment.matchingCruiseLinePromoCount}
                    </p>
                  </div>
                </div>

                {handoffAssessment.warnings.length > 0 && (
                  <div className="mt-3 rounded-lg border border-amber-400/25 bg-amber-500/10 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-200">
                      Warnings
                    </p>
                    <ul className="mt-2 space-y-1 text-xs leading-5 text-amber-100">
                      {handoffAssessment.warnings.map((warning, idx) => (
                        <li key={`${deal.id}-handoff-warning-${idx}`}>- {warning}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {handoffAssessment.blockingIssues.length > 0 && (
                  <div className="mt-3 rounded-lg border border-rose-400/25 bg-rose-500/10 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-rose-200">
                      Blocking issues
                    </p>
                    <ul className="mt-2 space-y-1 text-xs leading-5 text-rose-100">
                      {handoffAssessment.blockingIssues.map((warning, idx) => (
                        <li key={`${deal.id}-handoff-block-${idx}`}>- {warning}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {angleOptions.length > 0 && (
                <div className="mt-3 grid gap-2 lg:grid-cols-3">
                  {angleOptions.map((option, idx) => {
                    const selected = campaignAngle === option.campaignAngle;
                    return (
                      <button
                        key={`${deal.id}-angle-${idx}`}
                        type="button"
                        onClick={() => applyAngleOption(option)}
                        className={`rounded-lg border p-3 text-left transition ${
                          selected
                            ? "border-fuchsia-300/60 bg-fuchsia-400/15"
                            : "border-white/10 bg-black/20 hover:border-fuchsia-300/40"
                        }`}
                      >
                        <p className="text-xs font-semibold text-white">{option.campaignAngle}</p>
                        <p className="mt-1 text-[11px] leading-4 text-slate-400">{option.targetAudience}</p>
                        <p className="mt-2 text-[11px] leading-4 text-fuchsia-100">{option.rationale}</p>
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <Field label="Campaign angle / ad hook">
                  <input
                    className={inputClassName()}
                    value={campaignAngle}
                    onChange={(e) => setCampaignAngle(e.target.value)}
                    placeholder="Generate options, then select or edit one"
                  />
                </Field>
                <Field label="Target audience / targeting angle">
                  <input
                    className={inputClassName()}
                    value={targetAudience}
                    onChange={(e) => setTargetAudience(e.target.value)}
                    placeholder="Buyer profile, household, or interest cluster"
                  />
                </Field>
                <Field label="Visual angle">
                  <input
                    className={inputClassName()}
                    value={visualAngle}
                    onChange={(e) => setVisualAngle(e.target.value)}
                    placeholder="Hero/ad imagery concept"
                  />
                </Field>
                <Field label="Targeting keywords">
                  <input
                    className={inputClassName()}
                    value={targetingKeywords}
                    onChange={(e) => setTargetingKeywords(e.target.value)}
                    placeholder="Comma separated keywords"
                  />
                </Field>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-cyan-400/20 bg-cyan-500/5 p-3">
                <div className="min-w-[240px] flex-1">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-300">
                    Saved campaign hook
                  </p>
                  {selectedDeal.campaignAngle ? (
                    <div className="mt-1 text-xs leading-5 text-slate-300">
                      <p className="font-semibold text-white">{selectedDeal.campaignAngle}</p>
                      {selectedDeal.targetAudience && <p className="mt-1">{selectedDeal.targetAudience}</p>}
                      {selectedDeal.visualAngle && <p className="mt-1 text-slate-500">Visual: {selectedDeal.visualAngle}</p>}
                      {selectedDeal.targetingKeywords.length > 0 && (
                        <p className="mt-1 text-slate-500">
                          Keywords: {selectedDeal.targetingKeywords.join(", ")}
                        </p>
                      )}
                      {selectedDeal.campaignStrategySavedAtIso && (
                        <p className="mt-1 text-[11px] text-slate-500">
                          Saved {selectedDeal.campaignStrategySavedAtIso}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="mt-1 text-xs text-slate-500">No hook has been locked to this deal yet.</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy !== null || !selectedDeal}
                    onClick={() => saveCampaignStrategy(selectedDeal!)}
                    className="inline-flex h-9 items-center rounded-lg border border-cyan-300/40 bg-cyan-400/10 px-4 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busy === `${selectedDeal?.id}:save_strategy` ? "Saving..." : "Lock campaign hook"}
                  </button>
                </div>
              </div>
            </div>

            {/* 2-5: Stage runners */}
            <div className="mt-4">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                2-5 - Run stages independently
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

                  // Enforce the research -> targeting -> pitch -> copy/ad/media
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
                          { action: "stage", dealId: deal.id, stage: stage.id, promoRecordIds: selectedDealPromos },
                          key
                        )
                      }
                      className="rounded-lg border border-white/10 bg-black/25 p-3 text-left transition hover:border-cyan-300/50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-white">{stage.label}</span>
                        <span className={`text-[10px] ${present ? "text-emerald-300" : "text-slate-500"}`}>
                          {present ? "ready" : "-"}
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

              <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.025] p-3">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                    Review generated stage outputs
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Use this before deleting one of two similar Deal records.
                  </p>
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  <StageReviewDrawer
                    label="Trip research"
                    ready={deal.hasAngleResearch}
                    review={deal.stageReviews.research}
                  />
                  <StageReviewDrawer
                    label="Targeting"
                    ready={deal.hasTargetingDemographic}
                    review={deal.stageReviews.targeting}
                  />
                  <StageReviewDrawer
                    label="Sales pitch"
                    ready={deal.hasPitchBrief}
                    review={deal.stageReviews.pitch}
                  />
                  <StageReviewDrawer
                    label="Deal copy"
                    ready={deal.hasCopyPackage}
                    review={deal.stageReviews.copy}
                  />
                  <StageReviewDrawer
                    label="Ad structure"
                    ready={deal.hasAdStructure}
                    review={deal.stageReviews.adStructure}
                  />
                  <StageReviewDrawer
                    label="Media plan"
                    ready={deal.hasMediaPlan}
                    review={deal.stageReviews.media}
                  />
                </div>
              </div>

              {/* AI transparency: show raw prompts only for actual model-generated stages. */}
              {deal.aiTraces.some((trace) => trace.generator === "gpt") && (
                <div className="mt-3 space-y-2">
                  {deal.aiTraces.filter((trace) => trace.generator === "gpt").map((trace) => (
                    <details
                      key={`${deal.id}-trace-${trace.stage}`}
                      className="rounded-lg border border-white/10 bg-black/20 p-2"
                    >
                      <summary className="cursor-pointer text-[11px] font-semibold text-slate-300">
                        AI generation debug - {trace.stage}{" "}
                        <span className="text-slate-500">
                          ({trace.model ?? "gpt"}{trace.latencyMs != null ? ` - ${trace.latencyMs}ms` : ""})
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
                        <li key={warning}>! {warning}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                <div className="mt-3 rounded-lg border border-amber-400/20 bg-amber-500/5 p-3 text-xs text-amber-200">
                  No pitch brief yet - run the <span className="font-semibold">Sales pitch</span> stage before generating copy.
                </div>
              )}

              {deal.publicCopyRedFlags.length > 0 && (
                <ul className="mt-3 space-y-1 text-xs leading-5 text-amber-100">
                  {deal.publicCopyRedFlags.map((flag) => (
                    <li key={flag}>! {flag}</li>
                  ))}
                </ul>
              )}
            </div>

            {/* Booking URL */}
            <div className="mt-4 rounded-lg border border-blue-400/20 bg-blue-500/5 p-3">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-400">Booking URL</p>
              {deal.bookingUrl ? (
                <a
                  href={deal.bookingUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 block break-all text-xs font-mono text-blue-200 underline decoration-blue-300/60 underline-offset-4 transition hover:text-blue-100"
                >
                  {deal.bookingUrl}
                </a>
              ) : (
                <p className="mt-2 break-all text-xs font-mono text-blue-200">none</p>
              )}
              <p className="mt-2 text-[11px] leading-4 text-slate-400">
                This is the link visitors will use to book. If blank, a constructed package link was created automatically. If filled, it's an operator-captured link from the cruise line's Share button.
              </p>
            </div>

            {/* 6: Approval gate */}
            <div className="mt-4 rounded-lg border border-white/10 bg-black/20 p-3">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                6 - Approval &amp; publish gate
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
                enough - the operator must approve before the homepage can render this Deal.
              </p>
            </div>
          </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
