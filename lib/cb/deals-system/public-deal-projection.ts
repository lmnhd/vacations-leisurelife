/**
 * Public projection for approved Curated Deals (Phase 10).
 *
 * Turns a CuratedOdysseusDeal into the public-safe shapes the homepage tile and
 * the /deals/[id] page render. This is the ONLY place curated Deal data crosses
 * into public surfaces, and it deliberately exposes a narrow, vetted subset:
 *
 *   - packaging (headline/summary/highlights/destination notes/bestFor)
 *   - copyPackage visitor fields (hero, why-this-trip, qualified offer lines, CTAs)
 *   - targetingDemographic positioning statement (audience-informed, not targeting data)
 *   - the booking URL
 *
 * It NEVER projects: agentOnlyNotes, the ad structure, raw targeting keywords,
 * approval gate internals, or media concepts that are not approved for public use.
 *
 * Callers must gate on `isDealHomepageEligible` before projecting; the loader in
 * public-deals.ts does this. `projectPublicDeal` itself does not re-check the
 * gate so it can also render an operator preview, but the public loader only ever
 * passes eligible Deals.
 */

import { resolvePortCode } from "@/lib/campaigns/landing/port-codes";

import type { DealCtaKind } from "./campaign-types";
import type { CuratedOdysseusDeal } from "./curated-deal-types";
import type { DealMetaAdSynthesis } from "./deal-meta-ad-synthesis-types";
import { validateLandingBroadAppeal } from "./deal-page-design-generator";
import {
  DEAL_LANDING_SEGMENT_KEYS,
  type DealFunnelSynthesis,
  type DealImageCandidate,
} from "./deal-page-design-types";
import type {
  CbPromoIntelligenceRecord,
  PromoApplicabilityResult,
} from "./promo-intelligence-types";
import {
  looksLikeCruiseItineraryName,
  publicDealCruiseLine,
  publicDealShipName,
} from "./ship-identity";

/** Deterministic destination-themed fallback image (curated Deals carry no asset yet). */
const FALLBACK_HERO_IMAGES = [
  "https://images.pexels.com/photos/163236/luxury-yacht-boat-speed-water-163236.jpeg",
  "https://images.pexels.com/photos/3601425/pexels-photo-3601425.jpeg",
  "https://images.pexels.com/photos/2144326/pexels-photo-2144326.jpeg",
];

function unique(values: string[]): string[] {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))
  );
}

function splitPortList(values: string[]): string[] {
  const parts = values.flatMap((value) => value.split("|").map((part) => part.trim()));
  // Translate known port codes (e.g. "NYC" → "New York, NY", "SOU" → "Southampton,
  // UK") to readable names for public display. Unknown values pass through unchanged.
  // De-dupe AFTER resolving so two codes for the same city collapse to one entry.
  return unique(
    parts.filter(Boolean).map((part) => resolvePortCode(part) ?? part)
  );
}

/** "15:30:00" → "3:30 PM". Returns undefined for missing/malformed times. */
function formatClockTime(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;
  const m = /^(\d{1,2}):(\d{2})/.exec(trimmed);
  if (!m) return undefined;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (!Number.isInteger(hour) || hour > 23 || !Number.isInteger(minute) || minute > 59) {
    return undefined;
  }
  const period = hour < 12 ? "AM" : "PM";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${String(minute).padStart(2, "0")} ${period}`;
}

/** Combine arrival/departure times into a single readable label, or undefined. */
function formatPortTiming(
  arrivalTime: string | undefined,
  departureTime: string | undefined
): string | undefined {
  const arrive = formatClockTime(arrivalTime);
  const depart = formatClockTime(departureTime);
  const parts: string[] = [];
  if (arrive) parts.push(`Arrive ${arrive}`);
  if (depart) parts.push(`Depart ${depart}`);
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

function displayShipName(deal: CuratedOdysseusDeal): string | undefined {
  const shipName = publicDealShipName(deal);
  if (shipName) return shipName;
  const shipHint = deal.angleResearch?.amenityHighlights[0]?.trim();
  return shipHint && !looksLikeCruiseItineraryName(shipHint) ? shipHint : undefined;
}

function displayItineraryName(deal: CuratedOdysseusDeal): string {
  const shipName = deal.cruiseFacts.shipName?.trim();
  if (shipName && looksLikeCruiseItineraryName(shipName)) return shipName;
  return deal.cruiseFacts.itineraryName || deal.cruiseFacts.title;
}

function displayDeparturePort(deal: CuratedOdysseusDeal, ports: string[]): string | undefined {
  const departure = deal.cruiseFacts.departurePort?.trim();
  if (!departure) return undefined;
  // Resolve a port code (e.g. "NYC", "SOU") to its readable name; fall back to the
  // first itinerary port, then the raw value.
  return resolvePortCode(departure) ?? ports[0] ?? departure;
}

function heroImageFor(deal: CuratedOdysseusDeal): string {
  // Stable per-deal pick so the same Deal always renders the same image.
  let sum = 0;
  for (const ch of deal.id) sum += ch.charCodeAt(0);
  return FALLBACK_HERO_IMAGES[sum % FALLBACK_HERO_IMAGES.length];
}

function priceFromLabel(deal: CuratedOdysseusDeal): string | undefined {
  const prices = deal.cruiseFacts.cabinPrices;
  const lowest = [prices.inside, prices.outside, prices.balcony, prices.suite]
    .filter((value): value is number => typeof value === "number" && value > 0)
    .sort((a, b) => a - b)[0];
  return lowest ? `$${lowest.toLocaleString()} ${prices.currencyCode}` : undefined;
}

function publicPromoApplicability(
  applicability: PromoApplicabilityResult[]
): PromoApplicabilityResult[] {
  const likely = applicability.filter((promo) => promo.status === "likely_applicable");
  if (likely.length > 0) return likely;

  // Workbench selections remain review-qualified until an operator approves the
  // Deal. The public loader already enforces that approval gate, so retain the
  // selected offer here instead of silently dropping its consumer-safe language.
  return applicability.filter(
    (promo) => promo.status === "possibly_applicable_needs_review"
  );
}

export interface PublicDealCta {
  kind: DealCtaKind;
  label: string;
  supportingText: string;
}

export interface PublicDealTile {
  id: string;
  href: string;
  destination: string;
  imageSrc: string;
  imageAlt: string;
  header1: string;
  header2?: string;
  shortSummary: string;
  pricePerPersonLabel?: string;
  bookingUrl: string;
  sailDateLabel: string;
}

export interface PublicDealPage {
  id: string;
  title: string;
  heroSummary: string;
  heroImageSrc: string;
  heroImageAlt: string;
  /**
   * True when the operator approved a legacy text-only launch. Premium funnel
   * pages still render explicit operator-selected synthesis imagery.
   */
  textOnlyLaunchWaived: boolean;
  positioningStatement?: string;
  facts: {
    cruiseLine: string;
    shipName: string;
    destination: string;
    nights: number;
    sailDateLabel: string;
    departurePort?: string;
    priceFromLabel?: string;
  };
  whyThisTrip: string[];
  destinationNotes: string[];
  highlights: string[];
  /** Public-safe, qualified offer lines from approved copy. */
  offerLines: string[];
  bestFor: string[];
  bookingUrl: string;
  ctas: PublicDealCta[];
  /**
   * Premium master-template view (the Claude Design "Deal Page"). Present only
   * when a funnel synthesis exists for this deal so the route can render the rich
   * hero + five-segment + itinerary + pricing + specials layout. When absent, the
   * route falls back to the legacy curated-deal rendering.
   */
  designPage?: DealLandingPageView;
}

/** Hero pill chip / fact-band entry. */
interface DealFactEntry {
  label: string;
  value: string;
  /** Muted styling for "confirmed at booking" draft fallbacks. */
  muted?: boolean;
}

interface DealSegmentView {
  /** "01".."05" eyebrow index. */
  index: string;
  heading: string;
  body: string;
  imageUrl?: string;
  imageAlt?: string;
  imageFallbacks?: DealImageView[];
}

type DealItineraryView =
  | {
      kind: "days";
      rows: Array<{
        label: string;
        text: string;
        atSea?: boolean;
        timing?: string;
        /** Calendar date for this voyage day (sail date + dayOffset), when derivable. */
        dateIso?: string;
        /** 1-based voyage day number, when known (drives the calendar grid). */
        day?: number;
      }>;
    }
  | { kind: "ports"; ports: string[] };

type DealPricingView =
  | { kind: "table"; rows: Array<{ label: string; price: string; lead?: boolean }>; footnote: string }
  | { kind: "draft" };

interface DealSpecialView {
  kicker: string;
  title: string;
  summary: string;
  /** Perk chips (% off, $ savings, onboard credit, free guest). */
  chips: string[];
  /** Public-safe claims, shown as-is. */
  claims: string[];
  /** Qualified-claims line, shown only with the "confirmed at booking" qualifier. */
  qualifiedNote?: string;
  /** "Offer valid for bookings by …" label, when a booking window exists. */
  bookByLabel?: string;
}

/** One ready Meta ad-carousel card, projected for the public ad-cards showcase. */
export interface DealAdCardView {
  headline: string;
  imageUrl: string;
  /**
   * The card's primaryText, present only when it passes the same broad-appeal
   * jargon check the landing-page copy itself is validated against
   * (`validateLandingBroadAppeal`). Carousel body copy is written hyper-niche
   * by design (Step 7), so a card that fails the check omits this field rather
   * than leaking insider vocabulary onto the broad-market page — the headline
   * and image still render either way.
   */
  bodyText?: string;
}

/**
 * The three layout treatments the showcase component can render. Picked once per
 * deal (see `pickAdCardsLayout`), not per page load, so a given deal's page keeps
 * the same look across visits/deploys, while different deals in the same
 * campaign wave naturally vary — the brand-nuance-per-campaign the operator asked
 * for, without a random layout jumping around on refresh.
 */
export type DealAdCardsLayout = "quilt" | "tab-spotlight" | "editorial-mosaic";

export interface DealAdCardsShowcaseView {
  layout: DealAdCardsLayout;
  /**
   * "Special Offers!" when the deal carries a real attached promo (specials.
   * length > 0); otherwise a validated-broad-appeal hook pulled from the lead
   * ad card's own headline, so a deal with no actual discount never implies
   * one just by sitting under an "offers" label.
   */
  eyebrow: string;
  heading: string;
  cards: DealAdCardView[];
}

/**
 * The premium Deal Page view model — everything the master-template component
 * renders, derived purely from the curated deal's facts + the funnel synthesis.
 * `readiness` drives the resolved/draft fork the design specifies.
 */
export interface DealLandingPageView {
  readiness: "resolved" | "draft";
  eyebrow: string;
  hero: { headline: string; subhead: string; imageUrl?: string; imageAlt?: string; imageFallbacks?: DealImageView[] };
  /** Resolved vessel label rendered over the first selected image. */
  vesselLabel?: string;
  chips: string[];
  fromPriceLabel?: string;
  factBand: DealFactEntry[];
  segments: DealSegmentView[];
  itinerary: DealItineraryView;
  pricing: DealPricingView;
  specials: DealSpecialView[];
  ctaLabel: string;
  bookingUrl: string;
  /**
   * The deal's Meta ad-carousel cards (Step 8), shown as a distinct section below
   * the hero — never replacing it. Present only when at least one card has a
   * ready image; a deal with no ad campaign yet simply omits this and the ship
   * hero carries the page alone, as it does today.
   */
  adCards?: DealAdCardsShowcaseView;
}

function destinationLabel(deal: CuratedOdysseusDeal): string {
  return splitPortList(deal.cruiseFacts.portsOfCall)[0] ?? displayItineraryName(deal);
}

/** Resolve a candidate image id → its url + alt, from the synthesis pool. */
interface DealImageView {
  imageUrl: string;
  imageAlt?: string;
}

const PUBLIC_IMAGE_ALT_BY_CATEGORY: Record<string, string> = {
  hero: "Cruise ship at sea",
  cabins: "Cruise stateroom with ocean views",
  lounges: "Quiet lounge aboard the ship",
  atrium: "Atrium aboard the ship",
  dining: "Dining room aboard the ship",
  excursions: "Scenic port visited during the cruise",
  destination: "Scenic cruise destination",
};

function imageViewFromCandidateUrl(candidate: DealImageCandidate, imageUrl: string): DealImageView {
  return {
    imageUrl,
    imageAlt: PUBLIC_IMAGE_ALT_BY_CATEGORY[candidate.category] ?? "Cruise image",
  };
}

function candidateToImageViews(candidate: DealImageCandidate): DealImageView[] {
  const views = [imageViewFromCandidateUrl(candidate, candidate.imageUrl)];
  if (candidate.thumbnailUrl !== candidate.imageUrl) {
    views.push(imageViewFromCandidateUrl(candidate, candidate.thumbnailUrl));
  }
  return views;
}

function uniqueImageViews(images: DealImageView[]): DealImageView[] {
  const seen = new Set<string>();
  const uniqueImages: DealImageView[] = [];
  for (const image of images) {
    if (seen.has(image.imageUrl)) continue;
    seen.add(image.imageUrl);
    uniqueImages.push(image);
  }
  return uniqueImages;
}

/** Resolve a selected image plus ordered same-set fallbacks for resilient rendering. */
function imageSetFor(
  candidates: DealImageCandidate[],
  id: string | undefined,
  categories: string[],
  extraIds: string[] = []
): { imageUrl?: string; imageAlt?: string; imageFallbacks?: DealImageView[] } {
  if (!id) return {};
  const primary = candidates.find((c) => c.id === id);
  if (!primary) return {};

  const extraIdCandidates = extraIds
    .filter((extraId) => extraId !== id)
    .map((extraId) => candidates.find((candidate) => candidate.id === extraId))
    .filter((candidate): candidate is DealImageCandidate => candidate !== undefined);
  const categoryCandidates = candidates.filter(
    (candidate) => candidate.id !== id && categories.includes(candidate.category)
  );
  const selectedCandidateFallbacks = candidateToImageViews(primary).slice(1);
  const fallbackImages = uniqueImageViews([
    ...selectedCandidateFallbacks,
    ...extraIdCandidates.flatMap(candidateToImageViews),
    ...categoryCandidates.flatMap(candidateToImageViews),
  ]).filter(
    (image) => image.imageUrl !== primary.imageUrl
  );

  return {
    imageUrl: primary.imageUrl,
    imageAlt: PUBLIC_IMAGE_ALT_BY_CATEGORY[primary.category] ?? "Cruise image",
    imageFallbacks: fallbackImages.length > 0 ? fallbackImages : undefined,
  };
}

const AD_CARDS_LAYOUTS: DealAdCardsLayout[] = ["quilt", "tab-spotlight", "editorial-mosaic"];

/**
 * Deterministically pick one of the three ad-cards layouts from the deal id, so
 * the choice is stable across renders/deploys for a given deal (no layout
 * flicker on refresh) while still varying across the many deals running at
 * once — the "campaign nuance" the operator wants without real randomness.
 */
function pickAdCardsLayout(dealId: string): DealAdCardsLayout {
  let hash = 0;
  for (let i = 0; i < dealId.length; i++) {
    hash = (hash * 31 + dealId.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % AD_CARDS_LAYOUTS.length;
  return AD_CARDS_LAYOUTS[index];
}

/**
 * Project the deal's Meta ad-carousel (Step 8) into the public showcase view.
 * Only "ready" cards (a generated image exists) are included; a card still
 * pending/erroring is silently omitted rather than shown as a placeholder.
 * Returns undefined when fewer than 2 cards are ready — a single stray image
 * doesn't read as "the campaign," so the section doesn't mount for it.
 */
const AD_CARDS_DEFAULT_EYEBROW = "Special Offers!";
const AD_CARDS_DEFAULT_HEADING = "What makes this offer special...";
/** Fallback when even the lead card's own headline fails the broad-appeal check. */
const AD_CARDS_FALLBACK_HEADING = "Why This Sailing";

/**
 * Project the deal's Meta ad-carousel (Step 8) into the public showcase view.
 * Only "ready" cards (a generated image exists) are included; a card still
 * pending/erroring is silently omitted rather than shown as a placeholder.
 * Returns undefined when fewer than 2 cards are ready — a single stray image
 * doesn't read as "the campaign," so the section doesn't mount for it.
 *
 * `hasRealPromo` mirrors the same gate the specials section below it uses
 * (`specials.length > 0`): a deal with no attached promo record must never
 * sit under an "offers" label implying a discount that isn't there, so it
 * borrows the lead ad card's own (already broad-appeal-validated) headline
 * instead.
 */
function buildAdCardsShowcase(
  dealId: string,
  metaAdSynthesis: DealMetaAdSynthesis | undefined,
  hasRealPromo: boolean
): DealAdCardsShowcaseView | undefined {
  if (!metaAdSynthesis) return undefined;
  const readyCards = metaAdSynthesis.cards
    .slice()
    .sort((a, b) => a.cardIndex - b.cardIndex)
    .filter((card): card is typeof card & { imageUrl: string } => card.status === "ready" && Boolean(card.imageUrl))
    .map((card) => ({
      headline: card.headline,
      imageUrl: card.imageUrl,
      bodyText: validateLandingBroadAppeal(card.primaryText).length === 0 ? card.primaryText : undefined,
    }));
  if (readyCards.length < 2) return undefined;

  const [lead] = readyCards;
  const heading =
    hasRealPromo || !lead
      ? AD_CARDS_DEFAULT_HEADING
      : validateLandingBroadAppeal(lead.headline).length === 0
        ? lead.headline
        : AD_CARDS_FALLBACK_HEADING;
  // Keep internal channel provenance out of the guest experience. When there
  // is no attached promotion, these cards support the trip story rather than
  // being presented as advertising artifacts.
  const eyebrow = hasRealPromo ? AD_CARDS_DEFAULT_EYEBROW : "Why this trip";

  return { layout: pickAdCardsLayout(dealId), eyebrow, heading, cards: readyCards };
}

function promoRecordById(records: CbPromoIntelligenceRecord[]): Map<string, CbPromoIntelligenceRecord> {
  return new Map(records.map((record) => [record.id, record]));
}

function promoChips(record: CbPromoIntelligenceRecord | undefined): string[] {
  if (!record) return [];
  const chips: string[] = [];
  const terms = record.extracted;
  for (const discount of terms.percentDiscounts) chips.push(`Up to ${discount.percentOff}% off`);
  for (const saving of terms.dollarSavings) chips.push(`Up to $${saving.amountUsd.toLocaleString()} savings`);
  for (const credit of terms.onboardCredits) chips.push(`Up to $${credit.amountUsd.toLocaleString()} onboard credit`);
  if (terms.freeGuestOffers.length > 0) chips.push("Free guest offers may apply");
  return chips.slice(0, 4);
}

function bookByLabel(record: CbPromoIntelligenceRecord | undefined): string | undefined {
  const endsOn = record?.bookingWindow.endsOn;
  const formatted = longDate(endsOn);
  return formatted ? `Offer valid for bookings by ${formatted}` : undefined;
}

/** Format an ISO date as "October 29, 2026" (UTC-stable). */
function longDate(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T12:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

/**
 * The calendar date for voyage day N = sail date + (N - 1) days, as "YYYY-MM-DD"
 * (UTC-stable). This is a deterministic derivation of an existing fact (cruise day
 * N IS that date), not a fabricated one. Returns undefined when the sail date is
 * missing/unparseable so the page falls back to the plain day list.
 */
function voyageDayDateIso(sailDateIso: string | undefined, day: number): string | undefined {
  if (!sailDateIso || !Number.isFinite(day) || day < 1) return undefined;
  const base = new Date(/^\d{4}-\d{2}-\d{2}$/.test(sailDateIso) ? `${sailDateIso}T12:00:00Z` : sailDateIso);
  if (Number.isNaN(base.getTime())) return undefined;
  base.setUTCDate(base.getUTCDate() + (day - 1));
  return base.toISOString().slice(0, 10);
}

/**
 * Canonical landing-page section headings — a fixed editorial standard: clean,
 * premium, and deliberately CAMPAIGN-AGNOSTIC. Each reads true for ANY cruise
 * (luxury, family, party, adventure, expedition) — no assumed amenity (e.g. a
 * veranda) and no single mood. These are authoritative for the five known segment
 * keys and intentionally OVERRIDE the per-deal heading the LLM produces, so every
 * deal page speaks in the same voice. The page pairs each with its "01".."05"
 * eyebrow index (see DealSegmentView.index).
 */
const SEGMENT_HEADINGS: Record<string, string> = {
  cabins: "Your Space at Sea",
  lounges: "Room to Unwind",
  atrium: "First Impressions",
  dining: "A Table for Every Night",
  excursions: "Where You'll Step Ashore",
};

/**
 * Build the premium Deal Page view from a curated deal + its funnel synthesis.
 * Returns undefined when no synthesis exists (the deal lacks landing-page copy +
 * curated imagery), so the route falls back to the legacy rendering.
 *
 * No fabricated facts: a missing ship/date/price yields a draft fallback string,
 * never an invented value (primer rule 5). A published curated deal is normally
 * "resolved"; the draft branch is kept for safety + future draft publishing.
 */
export function buildDealLandingPageView(
  deal: CuratedOdysseusDeal,
  synthesis: DealFunnelSynthesis | undefined,
  promoRecords: CbPromoIntelligenceRecord[] = [],
  metaAdSynthesis?: DealMetaAdSynthesis
): DealLandingPageView | undefined {
  if (!synthesis) return undefined;

  const f = deal.cruiseFacts;
  const prices = f.cabinPrices;
  const ports = splitPortList(f.portsOfCall);
  const shipName = displayShipName(deal);
  const cruiseLine = publicDealCruiseLine(deal);
  const vesselLabel = shipName ? `${shipName} · ${cruiseLine}` : undefined;
  const itineraryName = displayItineraryName(deal);
  const departurePort = displayDeparturePort(deal, ports);
  const hasPricing = [prices.inside, prices.outside, prices.balcony, prices.suite].some(
    (v) => typeof v === "number" && v > 0
  );
  const hasShip = Boolean(shipName);
  const hasSailDate = Boolean(f.sailDateIso && f.sailDateIso.trim());
  const readiness: "resolved" | "draft" = hasShip && hasSailDate && hasPricing ? "resolved" : "draft";

  const candidates = synthesis.candidates;
  const heroPick = imageSetFor(
    candidates,
    synthesis.heroImageId ?? synthesis.galleryIds[0],
    ["hero", "destination"],
    synthesis.galleryIds
  );
  const lp = synthesis.landingPage;

  // ── Hero pill chips + fact band (resolved vs draft) ──────────────────────────
  const chips: string[] = [];
  const factBand: DealFactEntry[] = [];
  if (readiness === "resolved") {
    if (shipName) chips.push(shipName);
    if (f.nights > 0) chips.push(`${f.nights} Nights`);
    const dep = longDate(f.sailDateIso);
    if (dep) chips.push(`Departs ${dep}`);
    if (departurePort && ports.length > 0) {
      const last = ports[ports.length - 1];
      chips.push(`${departurePort} → ${last}`);
    }
    factBand.push(
      { label: "Cruise Line", value: cruiseLine },
      ...(shipName ? [{ label: "Ship", value: shipName }] : []),
      ...(departurePort ? [{ label: "Departs From", value: departurePort }] : []),
      ...(longDate(f.sailDateIso) ? [{ label: "Sail Date", value: longDate(f.sailDateIso) as string }] : []),
      ...(f.nights > 0 ? [{ label: "Length", value: `${f.nights} Nights` }] : [])
    );
  } else {
    chips.push(itineraryName);
    if (ports.length > 0) chips.push(ports.slice(0, 2).join(" · "));
    const dep = longDate(f.sailDateIso);
    chips.push(dep ? `Departs ${dep}` : "Dates Confirmed at Booking");
    factBand.push(
      { label: "Itinerary", value: itineraryName },
      ...(ports.length > 0
        ? [{ label: "Ports of Call", value: ports.join(" · ") }]
        : []),
      { label: "Ship", value: shipName ?? "Confirmed at booking", muted: !shipName },
      { label: "Sail Date", value: dep ?? "Confirmed at booking", muted: !dep }
    );
  }

  // ── Five segments in fixed order, with operator image picks ──────────────────
  const segments: DealSegmentView[] = DEAL_LANDING_SEGMENT_KEYS.map((key, i) => {
    const seg = lp.segments.find((s) => s.segment === key);
    if (!seg) return undefined;
    return {
      index: String(i + 1).padStart(2, "0"),
      // Canonical editorial heading wins for the five known segments (overrides the
      // LLM's per-deal heading); fall back to the deal's heading only for unknowns.
      heading: SEGMENT_HEADINGS[key] || seg.heading || key,
      body: seg.body,
      ...imageSetFor(candidates, seg.imageId, [key]),
    };
  }).filter((s): s is DealSegmentView => s !== undefined);

  // ── Itinerary ────────────────────────────────────────────────────────────────
  // Prefer the REAL day-by-day schedule (port names + arrival/departure times + sea
  // days) captured from Odysseus. Fall back to deriving days from the coarse ports
  // string, then to a flat ports list — never fabricate dates/times.
  const realDays = f.dayByDayItinerary;
  const itinerary: DealItineraryView =
    realDays && realDays.length > 0
      ? {
          kind: "days",
          // One row per voyage DAY. Odysseus emits multiple nodes for a single day
          // (e.g. Panama Canal enter/cruise/exit, or a tender port spanning two
          // calls) — collapse them so the calendar shows one cell per date. A port
          // node always wins over a sea-day node for that day's label.
          rows: (() => {
            const byDay = new Map<number, { port?: string; atSea: boolean; timings: string[] }>();
            for (const d of realDays) {
              const entry = byDay.get(d.day) ?? { atSea: true, timings: [] };
              if (!d.atSea && d.portName && d.portName !== "—") {
                // First real port name for the day wins; keep it stable.
                entry.port = entry.port ?? d.portName;
                entry.atSea = false;
              }
              const timing = formatPortTiming(d.arrivalTime, d.departureTime);
              if (timing && !entry.timings.includes(timing)) entry.timings.push(timing);
              byDay.set(d.day, entry);
            }
            const sorted = [...byDay.entries()].sort((a, b) => a[0] - b[0]);
            return sorted.map(([day, e], i) => {
              // Odysseus sometimes repeats the same port + arrival time on the day
              // after a docking (e.g. an overnight call before disembarkation) —
              // same port, same arrival, no departure on either day. Label the
              // repeat as disembarkation rather than implying the ship arrived twice.
              const prev = i > 0 ? sorted[i - 1][1] : undefined;
              const isRepeatArrival =
                !e.atSea &&
                prev &&
                !prev.atSea &&
                prev.port === e.port &&
                e.timings.length === 1 &&
                prev.timings.length === 1 &&
                e.timings[0] === prev.timings[0] &&
                e.timings[0].startsWith("Arrive");
              return {
                label: `Day ${day}`,
                day,
                dateIso: voyageDayDateIso(f.sailDateIso, day),
                text: e.atSea ? "At Sea" : e.port || "—",
                atSea: e.atSea,
                timing: isRepeatArrival ? "Disembarkation" : e.timings.join(" · ") || undefined,
              };
            });
          })(),
        }
      : readiness === "resolved" && ports.length > 0
        ? {
            kind: "days",
            // The coarse ports string carries stops (often mixed with region
            // names), not voyage days — a 7-night sailing can list 10 entries.
            // Label them "Stop N" so we never imply a fabricated day count.
            rows: ports.map((port, i) => ({
              label: `Stop ${i + 1}`,
              text: port,
              atSea: /at sea/i.test(port),
            })),
          }
        : { kind: "ports", ports };

  // ── Pricing ────────────────────────────────────────────────────────────────
  const currency = prices.currencyCode || "USD";
  const fmt = (n: number) => `from $${n.toLocaleString()}`;
  let fromPriceLabel: string | undefined;
  let pricing: DealPricingView;
  if (readiness === "resolved" && hasPricing) {
    const tiers: Array<{ label: string; value?: number }> = [
      { label: "Inside", value: prices.inside },
      { label: "Ocean View", value: prices.outside },
      { label: "Balcony", value: prices.balcony },
      { label: "Suite", value: prices.suite },
    ];
    const lead = tiers
      .map((t) => t.value)
      .filter((v): v is number => typeof v === "number" && v > 0)
      .sort((a, b) => a - b)[0];
    if (lead) fromPriceLabel = `$${lead.toLocaleString()}`;
    pricing = {
      kind: "table",
      rows: tiers
        .filter((t): t is { label: string; value: number } => typeof t.value === "number" && t.value > 0)
        .map((t) => ({ label: t.label, price: fmt(t.value), lead: t.value === lead })),
      footnote: `${currency} · per person, double occupancy · taxes & fees confirmed at booking`,
    };
  } else {
    pricing = { kind: "draft" };
  }

  // ── Specials / promos ────────────────────────────────────────────────────────
  const recordsById = promoRecordById(promoRecords);
  const specials: DealSpecialView[] = publicPromoApplicability(
    deal.promoApplicability ?? []
  )
    .map((p) => {
      const record = recordsById.get(p.promoRecordId);
      const qualifiedClaims = record?.marketingUse.publicClaimsNeedsQualifier ?? [];
      return {
        kicker: "Cruise line offer",
        title: record?.title ?? "Savings & Onboard Credit",
        summary:
          record?.marketingUse.visitorFriendlySummary ||
          "Select sailings on this itinerary may qualify for reduced fares or onboard credit.",
        chips: promoChips(record),
        claims: [
          ...(record?.marketingUse.publicClaimsAllowed ?? []),
          ...qualifiedClaims.map((claim) => `${claim} Terms vary by sailing and cabin category.`),
        ],
        qualifiedNote:
          "Offer amounts, eligibility, and availability are confirmed at booking.",
        bookByLabel: bookByLabel(record),
      } satisfies DealSpecialView;
    });

  return {
    readiness,
    eyebrow: `${cruiseLine} · ${itineraryName}`,
    hero: {
      headline: lp.heroHeadline,
      subhead: lp.heroSubhead,
      imageUrl: heroPick.imageUrl,
      imageAlt: heroPick.imageAlt,
      imageFallbacks: heroPick.imageFallbacks,
    },
    vesselLabel,
    chips,
    fromPriceLabel,
    factBand,
    segments,
    itinerary,
    pricing,
    specials,
    ctaLabel: "Book Now",
    bookingUrl: deal.bookingUrl,
    adCards: buildAdCardsShowcase(deal.id, metaAdSynthesis, specials.length > 0),
  };
}

export function projectPublicDealTile(
  deal: CuratedOdysseusDeal,
  synthesis?: DealFunnelSynthesis
): PublicDealTile {
  const copy = deal.copyPackage;
  const shipName = displayShipName(deal);

  // Prefer the operator-selected hero image from the funnel synthesis (the same
  // pick the /deals/[id] page renders). Only fall back to the deterministic stock
  // image when no synthesis / no selection exists.
  const heroPick = synthesis
    ? imageSetFor(
        synthesis.candidates,
        synthesis.heroImageId ?? synthesis.galleryIds[0],
        ["hero", "destination"],
        synthesis.galleryIds
      )
    : undefined;

  return {
    id: deal.id,
    href: `/deals/${encodeURIComponent(deal.id)}`,
    destination: destinationLabel(deal),
    imageSrc: heroPick?.imageUrl ?? heroImageFor(deal),
    imageAlt:
      heroPick?.imageAlt ??
      `${shipName ?? deal.cruiseFacts.cruiseLine} — ${destinationLabel(deal)}`,
    header1: displayItineraryName(deal),
    header2: shipName,
    shortSummary: copy?.shortTileCopy ?? deal.packaging.shortSummary,
    pricePerPersonLabel: priceFromLabel(deal),
    bookingUrl: deal.bookingUrl,
    sailDateLabel: deal.cruiseFacts.sailDateIso,
  };
}

export function projectPublicDealPage(
  deal: CuratedOdysseusDeal,
  synthesis?: DealFunnelSynthesis,
  promoRecords: CbPromoIntelligenceRecord[] = [],
  metaAdSynthesis?: DealMetaAdSynthesis
): PublicDealPage {
  const copy = deal.copyPackage;
  const shipName = displayShipName(deal);
  const highlights = unique([
    ...deal.packaging.highlights,
    ...(copy?.whyThisTrip ?? []),
  ]);

  return {
    id: deal.id,
    title: deal.packaging.headline || copy?.headlineOptions[0] || deal.cruiseFacts.title,
    heroSummary: copy?.heroCopy ?? deal.packaging.shortSummary,
    heroImageSrc: heroImageFor(deal),
    heroImageAlt: `${shipName ?? deal.cruiseFacts.cruiseLine} — ${destinationLabel(deal)}`,
    textOnlyLaunchWaived: deal.operatorApproval?.textOnlyLaunchWaived ?? false,
    positioningStatement: deal.targetingDemographic?.researchSummary.positioningStatement,
    facts: {
      cruiseLine: publicDealCruiseLine(deal),
      shipName: shipName ?? "Confirmed at booking",
      destination: destinationLabel(deal),
      nights: deal.cruiseFacts.nights,
      sailDateLabel: deal.cruiseFacts.sailDateIso,
      departurePort: displayDeparturePort(deal, splitPortList(deal.cruiseFacts.portsOfCall)),
      priceFromLabel: priceFromLabel(deal),
    },
    whyThisTrip: copy?.whyThisTrip ?? deal.packaging.highlights,
    destinationNotes: deal.packaging.destinationNotes,
    highlights,
    offerLines: (copy?.offerLines ?? []).map((line) => line.text),
    bestFor: deal.packaging.bestFor,
    bookingUrl: deal.bookingUrl,
    ctas: (copy?.ctaCopy ?? []).map((cta) => ({
      kind: cta.kind,
      label: cta.label,
      supportingText: cta.supportingText,
    })),
    designPage: buildDealLandingPageView(deal, synthesis, promoRecords, metaAdSynthesis),
  };
}
