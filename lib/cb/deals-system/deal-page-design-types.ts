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

  // ── GPT Image 2 variation lineage ───────────────────────────────────────────
  // Present only on operator-generated variations. A variation is ALWAYS a new
  // candidate: it never overwrites its source, the hero, or a gallery/segment
  // assignment. The operator promotes it with the normal + Add / Use on page
  // gestures, so an expensive experiment is never destructive.

  /** The candidate this image was generated from. */
  variationOfCandidateId?: string;
  /** How it was generated — mirrors the Meta card generation modes. */
  variationMode?: "new_variation" | "edit_current";
  /** The operator's transformation direction, kept for reproducibility. */
  variationDirection?: string;
  /** Full prompt sent to the image model. */
  variationPromptUsed?: string;
  variationGeneratedAtIso?: string;
  /**
   * True for any AI-generated image. Distinct from `provenance`, which says
   * where it entered the system: a variation is `operator_supplied` (the
   * operator made it deliberately) AND synthetic. The operator UI must be able
   * to flag synthetic assets unmissably — a photoreal edit of a real venue is a
   * different class of asset from supplier photography.
   */
  isGenerated?: boolean;
}

/** Aspect ratios gpt-image-2 supports, mapped to landing-slot intent. */
export type DealImageVariationAspect = "square" | "landscape" | "portrait";

export const DEAL_IMAGE_VARIATION_ASPECTS: Record<
  DealImageVariationAspect,
  { label: string; apiAspect: "1:1" | "16:9" | "9:16"; hint: string }
> = {
  landscape: {
    label: "Landscape 16:9",
    apiAspect: "16:9",
    hint: "Gallery rows and segment images",
  },
  square: { label: "Square 1:1", apiAspect: "1:1", hint: "Grid tiles" },
  portrait: { label: "Portrait 9:16", apiAspect: "9:16", hint: "Tall/mobile slots" },
};

/**
 * Ready-made transformation directions.
 *
 * Every preset leads with what to PRESERVE, because that is what made a real
 * dining-room edit keep its architecture, lighting, and layout instead of
 * becoming a generic restaurant. "Add guests" is first: populating an empty
 * room is by far the most common request.
 */
export interface DealImageVariationPreset {
  id: string;
  label: string;
  mode: "edit_current" | "new_variation";
  direction: string;
}

const PRESERVE_ROOM =
  "Preserve the existing space exactly: keep its architecture, window line, ceiling, lighting fixtures, furniture layout, materials, and color palette unchanged.";

const NO_INVENTION =
  "Do not add or change menu items, signage, logos, branding, prices, or text of any kind.";

export const DEAL_IMAGE_VARIATION_PRESETS: readonly DealImageVariationPreset[] = [
  {
    id: "add_guests",
    label: "Add guests to this space",
    mode: "edit_current",
    direction: `Add a small number of relaxed adult guests using this space naturally. ${PRESERVE_ROOM} People must be seated or standing on real visible surfaces, plausibly lit by the same light sources, with natural posture and scale. ${NO_INVENTION} Photographic and realistic, consistent with the original photograph.`,
  },
  {
    id: "declutter",
    label: "Remove clutter",
    mode: "edit_current",
    direction: `Remove incidental clutter, service carts, stray equipment, and visual noise. ${PRESERVE_ROOM} ${NO_INVENTION}`,
  },
  {
    id: "headline_space",
    label: "Open space for a headline",
    mode: "edit_current",
    direction: `Recompose with calm negative space in the upper third for a headline overlay, keeping the same subject and setting. ${PRESERVE_ROOM} ${NO_INVENTION}`,
  },
  {
    id: "warm_evening",
    label: "Warmer evening light",
    mode: "edit_current",
    direction: `Shift to a warm evening mood with cleaner background separation, keeping the same room and layout. ${PRESERVE_ROOM} ${NO_INVENTION}`,
  },
  {
    id: "composition_only",
    label: "Fresh take (composition reference)",
    mode: "new_variation",
    direction: `Use this image only as a composition and palette reference. Create a fresh alternative with the same visual language and subject type. Do not reproduce it exactly, and do not invent amenities, landmarks, or branded venues. ${NO_INVENTION}`,
  },
];

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
