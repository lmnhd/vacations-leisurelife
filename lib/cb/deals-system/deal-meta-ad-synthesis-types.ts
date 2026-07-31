/**
 * Deal Meta Ad Synthesis — Deal Workflow Step 8 (contracts).
 *
 * Takes a Step 7 funnel synthesis's Meta carousel (4 hyper-niche cards: headline
 * + primary text) and generates one square ad image per card via an image model
 * (gpt-image-2 today; Gemini Nano-Banana wired but not yet used here).
 *
 * The operator can edit the shared prompt TEMPLATE before generating — each
 * card's headline/primaryText are interpolated into the template at generation
 * time, so one edit re-applies to all 4 cards.
 */

import type { DealMetaAdStylePresetId } from "./deal-meta-ad-style-presets";

export type DealMetaAdImageGenerator = "gpt_image_2" | "gemini3_flash";

export type DealMetaAdCardStatus = "pending" | "generating" | "ready" | "error";

// ── Reference images ─────────────────────────────────────────────────────────

/**
 * What a reference is being used FOR. The role is passed to the model as
 * intent — a reference never means "reproduce every visual feature of this".
 */
export type DealMetaReferenceRole =
  | "ship_identity"
  | "destination_truth"
  | "composition"
  | "style"
  | "object";

/**
 * Where the reference bytes came from. Release 1 only admits sources that are
 * already owned/fetchable; `operator_upload` and `url_import` arrive in
 * Release 2 alongside the hardened import path.
 */
export type DealMetaReferenceSource =
  | "funnel_candidate"
  | "card_history"
  | "operator_upload"
  | "url_import";

/**
 * An image attached to a card (or campaign) to steer generation.
 *
 * Deliberately has NO approval state. Approval is per-use, not per-asset: an
 * image approved as a `composition` reference for one card is not thereby
 * approved as a `ship_identity` claim elsewhere. Attaching it with a role IS
 * the operator's decision, so a separate lifecycle would only duplicate it.
 * `originalSourceUrl` and `rightsNote` are audit metadata and never gate.
 */
export interface DealMetaImageReference {
  id: string;
  /** Fetchable image URL. Release 1: owned R2 or funnel-candidate URLs only. */
  assetUrl: string;
  thumbnailUrl?: string;
  role: DealMetaReferenceRole;
  source: DealMetaReferenceSource;
  sourceCandidateId?: string;
  sourceCardIndex?: number;
  /** Audit only — never sent to the image API. */
  originalSourceUrl?: string;
  title?: string;
  addedAtIso: string;
  /** Operator's rights assertion for uploads/imports (Release 2). */
  rightsNote?: string;
}

/** How a given image was produced. */
export type DealMetaAdGenerationMode =
  | "text_only"
  | "new_variation"
  | "edit_current";

export const DEAL_META_REFERENCE_ROLE_LABELS: Record<DealMetaReferenceRole, string> = {
  ship_identity: "Ship identity",
  destination_truth: "Destination",
  composition: "Composition",
  style: "Style",
  object: "Object",
};

/** Per-role intent line included in the prompt's reference manifest. */
export const DEAL_META_REFERENCE_ROLE_INTENT: Record<DealMetaReferenceRole, string> = {
  ship_identity:
    "ship identity anchor: keep ship-specific architecture and materials credible when visible; this is not a mandate to show a full ship exterior",
  destination_truth:
    "destination reference: use only for the named destination context; do not add landmarks that are not present",
  composition:
    "composition reference: borrow framing, material, and visual rhythm — not an exact duplicate",
  style:
    "style reference: carry palette and art-direction cues only",
  object:
    "object reference: include the specific object shown, without inventing related amenities",
};
export type DealMetaStyleConfidence = "high" | "medium" | "low";
export type DealMetaStyleSelectionSource =
  | "ai_recommended"
  | "operator"
  | "fallback";

export interface DealMetaAdStyleRecommendation {
  recommendedStyleId: DealMetaAdStylePresetId;
  rationale: string;
  confidence: DealMetaStyleConfidence;
  generatedAtIso: string;
  modelTask: "decision";
}

/** A previously-generated (now superseded) image for a card, kept for revert. */
export interface DealMetaAdImageHistoryEntry {
  imageUrl: string;
  generator?: DealMetaAdImageGenerator;
  promptUsed?: string;
  generatedAtIso: string;
  /** How this image was produced. Absent on legacy entries (read as text_only). */
  mode?: DealMetaAdGenerationMode;
  referenceIds?: string[];
  referenceAssetUrls?: string[];
  /**
   * For `edit_current`: the image this one was derived FROM.
   *
   * An edit stores its result as a new image and pushes the old one into
   * history — structurally identical to a from-scratch regeneration. Without
   * this pointer the operator cannot tell an edit chain from unrelated attempts
   * after a few rounds.
   */
  derivedFromImageUrl?: string;
}

export interface DealMetaAdCard {
  /** 0-3, matches the funnel synthesis carousel card order. */
  cardIndex: number;
  headline: string;
  primaryText: string;
  /** Operator-defined composition guidance retained across regenerations. */
  imageDirection?: string;
  status: DealMetaAdCardStatus;
  /** Resolvable URL for the generated image, once ready. */
  imageUrl?: string;
  generator?: DealMetaAdImageGenerator;
  /** The fully-interpolated prompt actually sent for this card's last generation. */
  promptUsed?: string;
  generatedAtIso?: string;
  /** Error message from the last failed generation attempt, if any. */
  error?: string;
  /** How the current imageUrl was produced. Absent legacy → text_only. */
  mode?: DealMetaAdGenerationMode;
  /** Reference images attached to this card. */
  references?: DealMetaImageReference[];
  /** Opt this card out of the campaign-wide ship anchor. */
  disableShipAnchor?: boolean;
  /** For an `edit_current` result: the image it was derived from. */
  derivedFromImageUrl?: string;
  /**
   * Images this card previously had, most-recent first. Populated whenever a
   * regeneration (or revert) overwrites imageUrl, so the operator can revert
   * back to an earlier generation. Assets remain in storage under their
   * original asset ids — only the active reference moves.
   */
  previousImages?: DealMetaAdImageHistoryEntry[];
}

export interface DealMetaAdSynthesis {
  /** Cache key. Equals the source funnel synthesis id. */
  id: string;
  dealId: string;
  generatedAtIso: string;
  /** Which funnel synthesis (Step 7) this was created from. */
  sourceFunnelSynthesisId: string;
  sailingAngleTitle: string;
  /**
   * Operator-editable prompt template. Supports {{HEADLINE}} and {{PRIMARY_TEXT}}
   * placeholders, interpolated per-card at generation time.
   */
  promptTemplate: string;
  /** AI's persisted default recommendation. Optional for legacy records. */
  recommendedStyleId?: DealMetaAdStylePresetId;
  /** Active operator-editable style. Optional records read as the vivid fallback. */
  selectedStyleId?: DealMetaAdStylePresetId;
  styleRecommendation?: DealMetaAdStyleRecommendation;
  styleSelectionSource?: DealMetaStyleSelectionSource;
  styleSelectedAtIso?: string;
  /** Non-blocking diagnostic when the recommendation call used the fallback. */
  styleRecommendationWarning?: string;
  /**
   * Campaign-wide ship identity anchor. Supplied to every card's generation
   * unless that card sets `disableShipAnchor`, so an unrelated ship can't
   * become the default visual subject across a new carousel.
   */
  shipIdentityReference?: DealMetaImageReference;
  cards: DealMetaAdCard[];
}

export interface DealMetaAdSynthesisCache {
  version: 1;
  generatedAtIso: string;
  syntheses: DealMetaAdSynthesis[];
}

/** Default prompt template seeded for a new synthesis. */
export const DEFAULT_META_AD_PROMPT_TEMPLATE =
  "Generate one square Meta carousel ad image for this cruise campaign.\nHeadline: {{HEADLINE}}\nPrimary text: {{PRIMARY_TEXT}}";

export function interpolateMetaAdPrompt(
  template: string,
  card: Pick<DealMetaAdCard, "headline" | "primaryText">
): string {
  return template
    .replace(/\{\{HEADLINE\}\}/g, card.headline)
    .replace(/\{\{PRIMARY_TEXT\}\}/g, card.primaryText);
}
