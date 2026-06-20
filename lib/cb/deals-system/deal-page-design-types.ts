/**
 * Deal Funnel Synthesis — Deal Workflow Step 7 (contracts).
 *
 * Step 3's copywriter output is top-of-funnel raw material: verbose, hyper-niche,
 * perfect for FLAGGING a subculture but wrong for a public page. Step 7 runs the
 * hub-and-spoke split:
 *
 *   (A) LANDING PAGE  — broad-market, jargon STRIPPED. Short (<=3 sentence)
 *       paragraphs per ship segment (Cabins / Lounges / Atrium / Dining / Excursions),
 *       written to sit beside premium SERP imagery. Reads as "a great upscale cruise
 *       with great perks" so any retail traveler converts. Feeds the public page.
 *   (B) META CAROUSEL — hyper-niche. A 4-card sequence that doubles down on insider
 *       vocabulary to win click-through from the exact subculture in the feed.
 *
 * The SELECTABLE IMAGE SET (SERP candidates → operator-picked gallery + hero) lives
 * here too: it supplies the per-segment imagery the landing copy is written against.
 *
 * No AI provider SDKs here; the generator (deal-page-design-generator.ts) goes
 * through the LLM gateway like every other deals stage. SERP image sourcing goes
 * through deal-image-search.ts (test-seamed).
 */

import type { DealAiGenerationTrace } from "./campaign-types";

// ── Selectable image set (SERP-sourced) ───────────────────────────────────────

/** Where a candidate/hero image came from (provenance is always recorded). */
export type DealImageProvenance =
  | "serpapi_search"
  | "operator_supplied"
  | "static_fallback";

/**
 * Image categories. Each landing-page segment has its own category so the SERP
 * pool is searched (and diversified) per section and candidates can be filtered to
 * the copy block they illustrate. `hero` and `destination` cover the page hero and
 * port imagery that aren't tied to a single interior segment.
 */
export type DealImageCategory =
  | "hero"
  | "cabins"
  | "lounges"
  | "atrium"
  | "dining"
  | "excursions"
  | "destination";

export const DEAL_IMAGE_CATEGORIES: readonly DealImageCategory[] = [
  "hero",
  "cabins",
  "lounges",
  "atrium",
  "dining",
  "excursions",
  "destination",
];

/**
 * Per-category SERP query spec. `label` is shown in the lab; `terms` are appended
 * to the deal's `cruiseLine + ship + destination` base to bias the search toward
 * that section (e.g. cabins → "stateroom balcony cabin interior"). Keeping these
 * declarative makes the pool diverse AND each candidate correlatable to a segment.
 */
export interface DealImageCategorySpec {
  category: DealImageCategory;
  label: string;
  /** Extra search terms that specialize the base query for this category. */
  terms: string[];
  /** True when the base query should also include the destination (vs. ship-only). */
  useDestination: boolean;
}

export const DEAL_IMAGE_CATEGORY_SPECS: readonly DealImageCategorySpec[] = [
  { category: "hero", label: "Hero / ship exterior", terms: ["cruise ship exterior at sea aerial"], useDestination: true },
  { category: "cabins", label: "Cabins / staterooms", terms: ["stateroom balcony cabin interior veranda"], useDestination: false },
  { category: "lounges", label: "Lounges / library", terms: ["lounge library quiet seating interior"], useDestination: false },
  { category: "atrium", label: "Atrium / grand spaces", terms: ["atrium grand foyer multi-deck interior"], useDestination: false },
  { category: "dining", label: "Dining rooms", terms: ["main dining room restaurant fine dining"], useDestination: false },
  { category: "excursions", label: "Excursions / ports", terms: ["port shore excursion old town harbor"], useDestination: true },
  { category: "destination", label: "Destination scenery", terms: ["scenic landscape travel"], useDestination: true },
];

/** Maps a landing segment to its image category (1:1 by key). */
export type DealLandingSegmentKey =
  | "cabins"
  | "lounges"
  | "atrium"
  | "dining"
  | "excursions";

/** One candidate image the operator can pick into the gallery / as the hero. */
export interface DealImageCandidate {
  /** Stable id within this synthesis (used by the gallery picker). */
  id: string;
  imageUrl: string;
  thumbnailUrl: string;
  /** Source page the image was found on (SerpAPI contextUrl), when known. */
  contextUrl?: string;
  title?: string;
  width?: number;
  height?: number;
  provenance: DealImageProvenance;
  /** Which section this candidate was sourced for (drives per-segment filtering). */
  category: DealImageCategory;
  /** The search query this candidate was sourced from, when applicable. */
  sourceQuery?: string;
}

// ── (A) Landing page — broad market ───────────────────────────────────────────

export const DEAL_LANDING_SEGMENT_KEYS: readonly DealLandingSegmentKey[] = [
  "cabins",
  "lounges",
  "atrium",
  "dining",
  "excursions",
];

export interface DealLandingSegment {
  segment: DealLandingSegmentKey;
  /**
   * Short title shown above the paragraph. Note: the public projection overrides
   * this with a canonical, campaign-agnostic heading per segment (e.g. cabins →
   * "Your Space at Sea") — see SEGMENT_HEADINGS in public-deal-projection.ts.
   */
  heading: string;
  /** <=3 sentence broad-appeal paragraph, jargon stripped. */
  body: string;
  /** Operator-chosen image id for this segment (one of the candidates). */
  imageId?: string;
}

export interface DealLandingPageCopy {
  /** Broad, inclusive hero headline (no niche jargon). */
  heroHeadline: string;
  /** One-line broad subhead. */
  heroSubhead: string;
  segments: DealLandingSegment[];
  /** Banned-jargon / over-length hits flagged to the operator (not auto-fixed). */
  warnings: string[];
}

// ── (B) Meta carousel — hyper niche ───────────────────────────────────────────

export interface DealCarouselCard {
  /** Max 40 chars (validated, not truncated). */
  headline: string;
  /** Max 125 chars (validated, not truncated). */
  primaryText: string;
}

export interface DealCarouselAd {
  /** Exactly 4 cards in feed order. */
  cards: DealCarouselCard[];
  /** Over-length card hits flagged to the operator (not auto-fixed). */
  warnings: string[];
}

// ── The synthesis artifact ────────────────────────────────────────────────────

export interface DealFunnelSynthesis {
  /** Cache key. Equals the deal/manifest id this synthesis is for. */
  id: string;
  dealId: string;
  generatedAtIso: string;
  generator: "gpt";
  /** Ad copy this was synthesized from. */
  sourceAdCopyId: string;
  /** The angle title (for operator legibility). */
  sailingAngleTitle: string;
  landingPage: DealLandingPageCopy;
  carousel: DealCarouselAd;
  /** SERP image set: everything sourced + the operator's chosen ordered gallery + hero. */
  candidates: DealImageCandidate[];
  galleryIds: string[];
  heroImageId?: string;
  /** AI provenance for the synthesis call. */
  aiTrace?: DealAiGenerationTrace;
}

export interface DealFunnelSynthesisCache {
  version: 1;
  generatedAtIso: string;
  syntheses: DealFunnelSynthesis[];
}
