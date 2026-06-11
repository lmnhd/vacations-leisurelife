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
   * True when the operator approved a text-only launch (media waived). The page
   * must suppress the hero image and show an "images coming soon" notice.
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
}

function destinationLabel(deal: CuratedOdysseusDeal): string {
  return deal.cruiseFacts.portsOfCall[0] ?? deal.cruiseFacts.itineraryName;
}

export function projectPublicDealTile(deal: CuratedOdysseusDeal): PublicDealTile {
  const copy = deal.copyPackage;
  return {
    id: deal.id,
    href: `/deals/${encodeURIComponent(deal.id)}`,
    destination: destinationLabel(deal),
    imageSrc: heroImageFor(deal),
    imageAlt: `${deal.cruiseFacts.shipName} — ${destinationLabel(deal)}`,
    header1: deal.cruiseFacts.itineraryName,
    header2: deal.cruiseFacts.shipName,
    shortSummary: copy?.shortTileCopy ?? deal.packaging.shortSummary,
    pricePerPersonLabel: priceFromLabel(deal),
    bookingUrl: deal.bookingUrl,
    sailDateLabel: deal.cruiseFacts.sailDateIso,
  };
}

export function projectPublicDealPage(deal: CuratedOdysseusDeal): PublicDealPage {
  const copy = deal.copyPackage;
  const highlights = unique([
    ...deal.packaging.highlights,
    ...(copy?.whyThisTrip ?? []),
  ]);

  return {
    id: deal.id,
    title: deal.packaging.headline || copy?.headlineOptions[0] || deal.cruiseFacts.title,
    heroSummary: copy?.heroCopy ?? deal.packaging.shortSummary,
    heroImageSrc: heroImageFor(deal),
    heroImageAlt: `${deal.cruiseFacts.shipName} — ${destinationLabel(deal)}`,
    textOnlyLaunchWaived: deal.operatorApproval?.textOnlyLaunchWaived ?? false,
    positioningStatement: deal.targetingDemographic?.researchSummary.positioningStatement,
    facts: {
      cruiseLine: deal.cruiseFacts.cruiseLine,
      shipName: deal.cruiseFacts.shipName,
      destination: destinationLabel(deal),
      nights: deal.cruiseFacts.nights,
      sailDateLabel: deal.cruiseFacts.sailDateIso,
      departurePort: deal.cruiseFacts.departurePort,
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
  };
}
