/**
 * Deal Google Ads Synthesis — Deal Workflow Step 9 (contracts).
 *
 * Takes a Step 7 funnel synthesis's lead carousel card (headline + primary
 * text) and adapts it into a Google Responsive Display Ad's text fields
 * (headline/long_headline/description, matching the caps enforced in
 * lib/campaigns/distribution/platforms/google-ads/campaign.ts), then
 * generates the two image assets Google RDAs require: landscape (1.91:1,
 * target 1200x628) and square (1:1, target 1200x1200).
 *
 * Unlike the Meta carousel generator, the image prompt must NOT ask the
 * model to render headline/body text onto the image — Google's image-asset
 * policy disallows designed text/graphic overlays on standard Display
 * image assets (support.google.com/adspolicy/answer/10347108). The
 * headline/long_headline/description fields are composited by Google
 * itself; the image should sell the package through composition alone.
 */

export type DealGoogleAdsImageGenerator = "gpt_image_2" | "gemini3_flash" | "gallery_photo";

export type DealGoogleAdsAssetStatus = "pending" | "generating" | "ready" | "error";

export type DealGoogleAdsImageAspect = "landscape_1_91x1" | "square_1x1";

export const GOOGLE_ADS_HEADLINE_MAX = 30;
export const GOOGLE_ADS_LONG_HEADLINE_MAX = 90;
export const GOOGLE_ADS_DESCRIPTION_MAX = 90;
export const GOOGLE_ADS_BUSINESS_NAME_MAX = 25;

export const DEFAULT_GOOGLE_ADS_BUSINESS_NAME = "LeisureLife Interactive";

const TEXT_REPLACEMENTS: Array<{ from: string; to: string }> = [
  { from: "\u00e2\u20ac\u201d", to: "-" },
  { from: "\u00e2\u20ac\u201c", to: "-" },
  { from: "\u00e2\u20ac\u00a6", to: "..." },
  { from: "\u00e2\u20ac\u02dc", to: "'" },
  { from: "\u00e2\u20ac\u2122", to: "'" },
  { from: "\u00e2\u20ac\u0153", to: '"' },
  { from: "\u00e2\u20ac\u009d", to: '"' },
  { from: "\u00e2\u2030\u02c6", to: "approx." },
  { from: "\u00c2\u00b7", to: "-" },
  { from: "\u00e2\u2020\u2019", to: "->" },
  { from: "\u00c3\u2014", to: "x" },
  { from: "\u00c3\u00a9", to: "e" },
  { from: "\u00c3\u00a1", to: "a" },
  { from: "\u00c3\u00ad", to: "i" },
  { from: "\u00c3\u00b3", to: "o" },
  { from: "\u00c3\u00ba", to: "u" },
  { from: "\u2014", to: "-" },
  { from: "\u2013", to: "-" },
  { from: "\u2026", to: "..." },
  { from: "\u2018", to: "'" },
  { from: "\u2019", to: "'" },
  { from: "\u201c", to: '"' },
  { from: "\u201d", to: '"' },
  { from: "\u2248", to: "approx." },
  { from: "\u00b7", to: "-" },
  { from: "\u2192", to: "->" },
];

export function sanitizeGoogleAdsText(text: string): string {
  let clean = text;
  for (const replacement of TEXT_REPLACEMENTS) {
    clean = clean.split(replacement.from).join(replacement.to);
  }
  while (clean.includes("  ")) {
    clean = clean.split("  ").join(" ");
  }
  return clean.trim();
}

/** A previously-generated (now superseded) image for an aspect slot, kept for revert. */
export interface DealGoogleAdsImageHistoryEntry {
  imageUrl: string;
  generator?: DealGoogleAdsImageGenerator;
  promptUsed?: string;
  generatedAtIso: string;
}

export interface DealGoogleAdsImageAsset {
  aspect: DealGoogleAdsImageAspect;
  status: DealGoogleAdsAssetStatus;
  /** Resolvable URL for the generated (or gallery-selected) image, once ready. */
  imageUrl?: string;
  generator?: DealGoogleAdsImageGenerator;
  /** The fully-interpolated prompt actually sent for this slot's last generation. */
  promptUsed?: string;
  generatedAtIso?: string;
  /** Error message from the last failed generation attempt, if any. */
  error?: string;
  /**
   * Images this slot previously had, most-recent first. Populated whenever a
   * regeneration (or revert) overwrites imageUrl, so the operator can revert
   * back to an earlier generation.
   */
  previousImages?: DealGoogleAdsImageHistoryEntry[];
}

export interface DealGoogleAdsSynthesis {
  /** Cache key. Equals the source funnel synthesis id. */
  id: string;
  dealId: string;
  generatedAtIso: string;
  /** Which funnel synthesis (Step 7) this was created from. */
  sourceFunnelSynthesisId: string;
  sailingAngleTitle: string;
  /** Cap 25. Defaults to DEFAULT_GOOGLE_ADS_BUSINESS_NAME. */
  businessName: string;
  /** Cap 30. */
  headline: string;
  /** Cap 90. */
  longHeadline: string;
  /** Cap 90. */
  description: string;
  /**
   * Operator-editable image prompt template. Supports {{HEADLINE}} and
   * {{LONG_HEADLINE}} placeholders — passed for scene context only, not for
   * the model to render as on-image text.
   */
  promptTemplate: string;
  /** Exactly 2 entries: one landscape_1_91x1, one square_1x1. */
  images: DealGoogleAdsImageAsset[];
  /**
   * Operator-picked placement URLs (real search results from
   * deal-community-search.ts, never auto-applied or LLM-imagined). Fed into
   * Step 10's targeting plan as GoogleTargetingPackage.placements. Defaults
   * to empty — most deals will have none until the operator searches and
   * picks some.
   */
  operatorPlacements: string[];
}

export interface DealGoogleAdsSynthesisCache {
  version: 1;
  generatedAtIso: string;
  syntheses: DealGoogleAdsSynthesis[];
}

/** Default prompt template seeded for a new synthesis - no text-rendering instruction. */
export const DEFAULT_GOOGLE_ADS_PROMPT_TEMPLATE =
  "Generate one clean, natural photographic cruise advertising scene for a Google Responsive Display image asset. Show a single coherent moment from the cruise experience, with the main subject centered and easy to understand after cropping. Do not make a collage, flyer, split-panel layout, poster, graphic design, or composite sheet. Use the narrative only as scene direction:\n{{HEADLINE}}\n{{LONG_HEADLINE}}";

export function interpolateGoogleAdsPrompt(
  template: string,
  synthesis: Pick<DealGoogleAdsSynthesis, "headline" | "longHeadline">
): string {
  return sanitizeGoogleAdsText(template)
    .split("{{HEADLINE}}")
    .join(sanitizeGoogleAdsText(synthesis.headline))
    .split("{{LONG_HEADLINE}}")
    .join(sanitizeGoogleAdsText(synthesis.longHeadline));
}

function capText(text: string, max: number): string {
  const clean = sanitizeGoogleAdsText(text);
  return clean.length > max ? clean.slice(0, max).trimEnd() : clean;
}

export { capText as capGoogleAdsText };
