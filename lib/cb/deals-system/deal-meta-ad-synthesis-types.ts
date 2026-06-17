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

export type DealMetaAdImageGenerator = "gpt_image_2" | "gemini3_flash";

export type DealMetaAdCardStatus = "pending" | "generating" | "ready" | "error";

/** A previously-generated (now superseded) image for a card, kept for revert. */
export interface DealMetaAdImageHistoryEntry {
  imageUrl: string;
  generator?: DealMetaAdImageGenerator;
  promptUsed?: string;
  generatedAtIso: string;
}

export interface DealMetaAdCard {
  /** 0-3, matches the funnel synthesis carousel card order. */
  cardIndex: number;
  headline: string;
  primaryText: string;
  status: DealMetaAdCardStatus;
  /** Resolvable URL for the generated image, once ready. */
  imageUrl?: string;
  generator?: DealMetaAdImageGenerator;
  /** The fully-interpolated prompt actually sent for this card's last generation. */
  promptUsed?: string;
  generatedAtIso?: string;
  /** Error message from the last failed generation attempt, if any. */
  error?: string;
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
  cards: DealMetaAdCard[];
}

export interface DealMetaAdSynthesisCache {
  version: 1;
  generatedAtIso: string;
  syntheses: DealMetaAdSynthesis[];
}

/** Default prompt template seeded for a new synthesis. */
export const DEFAULT_META_AD_PROMPT_TEMPLATE =
  "Generate a vivid square ad flyer promoting the following Cruise Package:\n{{HEADLINE}}\n{{PRIMARY_TEXT}}";

export function interpolateMetaAdPrompt(
  template: string,
  card: Pick<DealMetaAdCard, "headline" | "primaryText">
): string {
  return template
    .replace(/\{\{HEADLINE\}\}/g, card.headline)
    .replace(/\{\{PRIMARY_TEXT\}\}/g, card.primaryText);
}
