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

import type { DealCtaKind } from "./campaign-types";
import type { CuratedOdysseusDeal } from "./curated-deal-types";
import {
  DEAL_LANDING_SEGMENT_KEYS,
  type DealFunnelSynthesis,
  type DealImageCandidate,
} from "./deal-page-design-types";
import type { CbPromoIntelligenceRecord } from "./promo-intelligence-types";

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
  return unique(values.flatMap((value) => value.split("|").map((part) => part.trim())));
}

function looksLikeCruiseName(value: string | undefined): boolean {
  const lower = value?.toLowerCase() ?? "";
  return lower.includes(" cruise from ") || lower.includes(" ending in ") || lower.includes("-night ");
}

function displayShipName(deal: CuratedOdysseusDeal): string | undefined {
  const shipName = deal.cruiseFacts.shipName?.trim();
  if (shipName && !looksLikeCruiseName(shipName)) return shipName;
  const shipHint = deal.angleResearch?.amenityHighlights[0]?.trim();
  return shipHint || undefined;
}

function displayItineraryName(deal: CuratedOdysseusDeal): string {
  const shipName = deal.cruiseFacts.shipName?.trim();
  if (shipName && looksLikeCruiseName(shipName)) return shipName;
  return deal.cruiseFacts.itineraryName || deal.cruiseFacts.title;
}

function displayDeparturePort(deal: CuratedOdysseusDeal, ports: string[]): string | undefined {
  const departure = deal.cruiseFacts.departurePort?.trim();
  if (!departure) return undefined;
  if (departure.length === 3 && departure.toUpperCase() === departure && ports[0]) {
    return ports[0];
  }
  return departure;
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
  | { kind: "days"; rows: Array<{ label: string; text: string; atSea?: boolean }> }
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

/**
 * The premium Deal Page view model — everything the master-template component
 * renders, derived purely from the curated deal's facts + the funnel synthesis.
 * `readiness` drives the resolved/draft fork the design specifies.
 */
export interface DealLandingPageView {
  readiness: "resolved" | "draft";
  eyebrow: string;
  hero: { headline: string; subhead: string; imageUrl?: string; imageAlt?: string; imageFallbacks?: DealImageView[] };
  chips: string[];
  fromPriceLabel?: string;
  factBand: DealFactEntry[];
  segments: DealSegmentView[];
  itinerary: DealItineraryView;
  pricing: DealPricingView;
  specials: DealSpecialView[];
  ctaLabel: string;
  bookingUrl: string;
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

const SEGMENT_HEADINGS: Record<string, string> = {
  cabins: "The Cabins",
  lounges: "The Lounges",
  atrium: "The Atrium",
  dining: "The Dining Rooms",
  excursions: "The Excursions",
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
  promoRecords: CbPromoIntelligenceRecord[] = []
): DealLandingPageView | undefined {
  if (!synthesis) return undefined;

  const f = deal.cruiseFacts;
  const prices = f.cabinPrices;
  const ports = splitPortList(f.portsOfCall);
  const shipName = displayShipName(deal);
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
      { label: "Cruise Line", value: f.cruiseLine },
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
      heading: seg.heading || SEGMENT_HEADINGS[key] || key,
      body: seg.body,
      ...imageSetFor(candidates, seg.imageId, [key]),
    };
  }).filter((s): s is DealSegmentView => s !== undefined);

  // ── Itinerary ────────────────────────────────────────────────────────────────
  const itinerary: DealItineraryView =
    readiness === "resolved" && ports.length > 0
      ? {
          kind: "days",
          rows: ports.map((port, i) => ({
            label: `Day ${i + 1}`,
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
  const specials: DealSpecialView[] = (deal.promoApplicability ?? [])
    .filter((p) => p.status === "likely_applicable")
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
    eyebrow: `${f.cruiseLine} · ${itineraryName}`,
    hero: {
      headline: lp.heroHeadline,
      subhead: lp.heroSubhead,
      imageUrl: heroPick.imageUrl,
      imageAlt: heroPick.imageAlt,
      imageFallbacks: heroPick.imageFallbacks,
    },
    chips,
    fromPriceLabel,
    factBand,
    segments,
    itinerary,
    pricing,
    specials,
    ctaLabel: "Check Availability",
    bookingUrl: deal.bookingUrl,
  };
}

export function projectPublicDealTile(deal: CuratedOdysseusDeal): PublicDealTile {
  const copy = deal.copyPackage;
  const shipName = displayShipName(deal);
  return {
    id: deal.id,
    href: `/deals/${encodeURIComponent(deal.id)}`,
    destination: destinationLabel(deal),
    imageSrc: heroImageFor(deal),
    imageAlt: `${shipName ?? deal.cruiseFacts.cruiseLine} — ${destinationLabel(deal)}`,
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
  promoRecords: CbPromoIntelligenceRecord[] = []
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
      cruiseLine: deal.cruiseFacts.cruiseLine,
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
    designPage: buildDealLandingPageView(deal, synthesis, promoRecords),
  };
}
