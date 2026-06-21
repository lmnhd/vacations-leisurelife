/**
 * Deal Page Facts (Step 7 support) — the COMPLETE, public-safe set of hard cruise
 * facts the hosted deal page must show so a guest can purchase without leaving:
 * ship name, sail date, nights, the itinerary + every stop, cabin pricing, and the
 * specials/deals/promo packages with their real terms.
 *
 * It is assembled deterministically (no AI) from the trip manifest (+ its
 * operator-resolved package) and the matched CB promo-intelligence records. Promo
 * content is filtered to PUBLIC-SAFE claims only (`marketingUse.publicClaimsAllowed`
 * + `visitorFriendlySummary` + structured `extracted` terms) — agent-only notes and
 * unqualified claims never cross into this object.
 *
 * Pricing/itinerary come from the resolved package (real Odysseus data). When the
 * manifest is NOT yet resolved, those fields are absent and `readiness` flags it so
 * the operator resolves Step 4 before handing the page to design.
 */

import type {
  DealResolvedCabinPricing,
  DealResolvedItinerary,
  DealTripManifest,
} from "./deal-trip-manifest-types";
import type {
  CbPromoIntelligenceRecord,
  PromoApplicabilityResult,
} from "./promo-intelligence-types";
import {
  resolvedPackageShipName,
  resolveCruiseLineForPackage,
} from "./ship-identity";

/** One promo/special, reduced to what is safe to render publicly. */
export interface DealPagePromo {
  promoRecordId: string;
  title: string;
  vendor: string;
  /** Status the manifest assigned (likely_applicable, etc.). */
  status: PromoApplicabilityResult["status"];
  /** One-line visitor-friendly summary from the promo record. */
  summary: string;
  /** Public-safe claims (already cleared for visitor display). */
  publicClaims: string[];
  /** Claims that may be shown only with a live-pricing/availability qualifier. */
  qualifiedClaims: string[];
  /** Structured perks for design (chips/badges). */
  perks: {
    percentOff: number[];
    dollarSavingsUsd: number[];
    onboardCreditUsd: number[];
    freeGuest: boolean;
  };
  /** Booking-window dates, when present (raw, for "book by" copy). */
  bookingWindow?: { startsOn?: string; endsOn?: string; rawText: string };
}

export interface DealPageFacts {
  /** "resolved" = real ship/date/itinerary/pricing present; "draft" = pre-Step-4. */
  readiness: "resolved" | "draft";
  /** Operator-facing notes on what's missing (e.g. "not yet resolved — run Step 4"). */
  notes: string[];

  cruiseLine: string;
  /** Real ship name when resolved; else the class hint (clearly a hint). */
  shipName?: string;
  shipClassHint?: string;
  itineraryName: string;
  destination: string;
  nights?: number;

  /** Confirmed sail date (resolved) — ISO. */
  sailDateIso?: string;
  /** The implied sail window when not yet resolved. */
  sailWindow?: { earliestIso?: string; latestIso?: string };

  departurePort?: string;
  /** Every stop, in order (from the resolved itinerary or the manifest draft). */
  portsOfCall: string[];
  itinerary?: DealResolvedItinerary;

  /** Real cabin pricing when resolved; absent otherwise (never fabricated). */
  cabinPricing?: DealResolvedCabinPricing;

  /** The specials/deals/promo packages applicable to this sailing. */
  promos: DealPagePromo[];
  /** How the perks strengthen the sailing (operator's promo strategy, public-safe). */
  promoStrategy: string;

  bookingUrl?: string;
}

function splitPorts(raw?: string): string[] {
  if (!raw) return [];
  return raw
    .split(/[,→>;\/|]|\s-\s/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function reducePromo(
  applied: PromoApplicabilityResult,
  record: CbPromoIntelligenceRecord | undefined
): DealPagePromo {
  if (!record) {
    return {
      promoRecordId: applied.promoRecordId,
      title: applied.promoRecordId,
      vendor: "",
      status: applied.status,
      summary: "",
      publicClaims: [],
      qualifiedClaims: [],
      perks: { percentOff: [], dollarSavingsUsd: [], onboardCreditUsd: [], freeGuest: false },
    };
  }
  const e = record.extracted;
  return {
    promoRecordId: applied.promoRecordId,
    title: record.title,
    vendor: record.vendor,
    status: applied.status,
    summary: record.marketingUse.visitorFriendlySummary,
    publicClaims: record.marketingUse.publicClaimsAllowed,
    qualifiedClaims: record.marketingUse.publicClaimsNeedsQualifier,
    perks: {
      percentOff: e.percentDiscounts.map((p) => p.percentOff),
      dollarSavingsUsd: e.dollarSavings.map((d) => d.amountUsd),
      onboardCreditUsd: e.onboardCredits.map((o) => o.amountUsd),
      freeGuest: e.freeGuestOffers.length > 0,
    },
    bookingWindow: record.bookingWindow
      ? {
          startsOn: record.bookingWindow.startsOn,
          endsOn: record.bookingWindow.endsOn,
          rawText: record.bookingWindow.rawText,
        }
      : undefined,
  };
}

/**
 * Assemble the complete public-safe deal facts for the hosted page. Pure — no AI,
 * no I/O. `promoRecords` is the CB promo-intelligence record set (the route loads it).
 */
export function assembleDealPageFacts(
  manifest: DealTripManifest,
  promoRecords: CbPromoIntelligenceRecord[]
): DealPageFacts {
  const draft = manifest.assembleDraft;
  const resolved = manifest.resolvedPackage;
  const notes: string[] = [];

  const recordById = new Map(promoRecords.map((r) => [r.id, r]));
  const promos = manifest.appliedPromos
    .filter((p) => p.status !== "not_applicable")
    .map((p) => reducePromo(p, recordById.get(p.promoRecordId)));
  const missingPromoDetail = promos.filter((p) => !p.title || p.title === p.promoRecordId);
  if (missingPromoDetail.length > 0) {
    notes.push(
      `${missingPromoDetail.length} applied promo(s) had no matching promo-intelligence record — refresh promo intelligence.`
    );
  }

  // Ports: prefer the resolved itinerary's ports, else the manifest draft list.
  const resolvedPorts = splitPorts(
    resolved?.itinerary?.normalizedPortsOfCall || resolved?.itinerary?.portsOfCall
  );
  const portsOfCall = resolvedPorts.length > 0 ? resolvedPorts : draft.portsOfCall;

  if (!resolved) {
    notes.push("Manifest not yet resolved — ship name, sail date, itinerary, and pricing are unconfirmed. Run Step 4 (Resolve) before final design.");
  } else {
    if (!resolved.cabinPricing) notes.push("Resolved package carried no cabin pricing — the page price block will rely on live lookup.");
    if (!resolved.itinerary) notes.push("Resolved package carried no structured itinerary — using the manifest's port list.");
  }

  return {
    readiness: resolved ? "resolved" : "draft",
    notes,
    cruiseLine: resolveCruiseLineForPackage(resolved?.packageId, resolved?.cruiseLine ?? draft.cruiseLine),
    shipName: resolvedPackageShipName(resolved),
    shipClassHint: draft.shipClassHint,
    itineraryName: draft.itineraryName,
    destination: draft.destination,
    nights: resolved?.nights ?? draft.nights,
    sailDateIso: resolved?.sailDateIso,
    sailWindow: resolved
      ? undefined
      : { earliestIso: draft.sailWindow.earliestIso, latestIso: draft.sailWindow.latestIso },
    departurePort: resolved?.departurePortCode ?? draft.departurePortHint,
    portsOfCall,
    itinerary: resolved?.itinerary,
    cabinPricing: resolved?.cabinPricing,
    promos,
    promoStrategy: manifest.promoStrategy,
    bookingUrl: resolved?.bookingUrl,
  };
}
