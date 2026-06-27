/**
 * Deal Google Ads Synthesis generator (Step 9).
 *
 * Builds a synthesis from a Step 7 funnel synthesis's lead carousel card,
 * adapting its copy into Google Responsive Display Ad text field caps, and
 * generates the two required image assets (landscape + square) with
 * gpt-image-2. The operator's prompt template is interpolated
 * ({{HEADLINE}} / {{LONG_HEADLINE}}) before each generation — the template
 * intentionally does not ask the model to render text onto the image, since
 * Google's image-asset policy disallows designed text/graphic overlays on
 * standard Display image assets.
 *
 * gpt-image-2 only supports the "1:1" | "16:9" | "9:16" aspect vocabulary
 * (lib/campaigns/media/generators/gpt-image.ts) — there is no native
 * "1.91:1". "16:9" (1792x1024) is used for the landscape slot as the
 * closest supported aspect; Google accepts non-exact-ratio uploads for its
 * recommended 1200x628 landscape size.
 */

import { generateGptImage2, type GptImageAspect } from "@/lib/campaigns/media/generators/gpt-image";
import { storeAsset } from "@/lib/campaigns/media/storage-client";

import type { DealFunnelSynthesis } from "./deal-page-design-types";
import {
  DEFAULT_GOOGLE_ADS_BUSINESS_NAME,
  DEFAULT_GOOGLE_ADS_PROMPT_TEMPLATE,
  GOOGLE_ADS_DESCRIPTION_MAX,
  GOOGLE_ADS_HEADLINE_MAX,
  GOOGLE_ADS_LONG_HEADLINE_MAX,
  capGoogleAdsText,
  interpolateGoogleAdsPrompt,
  type DealGoogleAdsImageAsset,
  type DealGoogleAdsImageAspect,
  type DealGoogleAdsSynthesis,
} from "./deal-google-ads-synthesis-types";

const ASPECT_TO_GPT_IMAGE_ASPECT: Record<DealGoogleAdsImageAspect, GptImageAspect> = {
  landscape_1_91x1: "16:9",
  square_1x1: "1:1",
};

/** Build a fresh synthesis (or reset) from a funnel synthesis's lead carousel card. */
export function buildDealGoogleAdsSynthesis(
  funnelSynthesis: DealFunnelSynthesis
): DealGoogleAdsSynthesis {
  const leadCard = funnelSynthesis.carousel.cards[0];
  if (!leadCard) {
    throw new Error(`Funnel synthesis "${funnelSynthesis.id}" has no carousel cards.`);
  }

  const description = capGoogleAdsText(
    funnelSynthesis.landingPage.heroSubhead || leadCard.primaryText,
    GOOGLE_ADS_DESCRIPTION_MAX
  );

  const images: DealGoogleAdsImageAsset[] = [
    { aspect: "landscape_1_91x1", status: "pending" },
    { aspect: "square_1x1", status: "pending" },
  ];

  return {
    id: funnelSynthesis.id,
    dealId: funnelSynthesis.dealId,
    generatedAtIso: new Date().toISOString(),
    sourceFunnelSynthesisId: funnelSynthesis.id,
    sailingAngleTitle: funnelSynthesis.sailingAngleTitle,
    businessName: DEFAULT_GOOGLE_ADS_BUSINESS_NAME,
    headline: capGoogleAdsText(leadCard.headline, GOOGLE_ADS_HEADLINE_MAX),
    longHeadline: capGoogleAdsText(leadCard.primaryText, GOOGLE_ADS_LONG_HEADLINE_MAX),
    description,
    promptTemplate: DEFAULT_GOOGLE_ADS_PROMPT_TEMPLATE,
    images,
    operatorPlacements: [],
  };
}

/**
 * Generate (or regenerate) the image for one aspect slot, returning the
 * updated image asset. Throws on generation/storage failure — caller
 * decides how to record the error.
 */
export async function generateDealGoogleAdsImage(
  synthesis: DealGoogleAdsSynthesis,
  aspect: DealGoogleAdsImageAspect,
  /**
   * Operator's persistent negation text (e.g. "no text/words/logos/overlays
   * in the image"), appended after interpolation so it isn't subject to
   * {{HEADLINE}}/{{LONG_HEADLINE}} substitution.
   */
  promptSuffix?: string
): Promise<DealGoogleAdsImageAsset> {
  const asset = synthesis.images.find((img) => img.aspect === aspect);
  if (!asset) {
    throw new Error(`No image slot "${aspect}" in synthesis "${synthesis.id}".`);
  }

  const interpolated = interpolateGoogleAdsPrompt(synthesis.promptTemplate, synthesis);
  const promptUsed = promptSuffix?.trim() ? `${interpolated}\n\n${promptSuffix.trim()}` : interpolated;
  const buffer = await generateGptImage2(promptUsed, { aspect: ASPECT_TO_GPT_IMAGE_ASPECT[aspect] });

  const generatedAtIso = new Date().toISOString();
  const assetId = `google-ads-${synthesis.id}-${aspect}-${Date.now()}`;
  const imageUrl = await storeAsset(
    `deals/${synthesis.dealId}`,
    assetId,
    // Per-generation path (not per-aspect) so regenerations don't overwrite
    // earlier images in storage — needed so the operator can revert.
    `google-ads-synthesis/${synthesis.id}/${aspect}-${Date.now()}.png`,
    buffer,
    "image/png"
  );

  const previousImages = [...(asset.previousImages ?? [])];
  if (asset.imageUrl) {
    previousImages.unshift({
      imageUrl: asset.imageUrl,
      generator: asset.generator,
      promptUsed: asset.promptUsed,
      generatedAtIso: asset.generatedAtIso ?? generatedAtIso,
    });
  }

  return {
    ...asset,
    status: "ready",
    imageUrl,
    generator: "gpt_image_2",
    promptUsed,
    generatedAtIso,
    error: undefined,
    previousImages,
  };
}

/**
 * Assign a real photo from the source funnel synthesis's curated gallery to
 * an image slot, instead of generating one. Pure — no AI call, no storage
 * upload (the gallery URL is already a stable SerpAPI/operator-supplied
 * URL). The slot's prior image (generated or gallery) is pushed onto
 * previousImages so the operator can revert back to it.
 */
export function useDealGoogleAdsGalleryImage(
  synthesis: DealGoogleAdsSynthesis,
  aspect: DealGoogleAdsImageAspect,
  imageUrl: string
): DealGoogleAdsImageAsset {
  const asset = synthesis.images.find((img) => img.aspect === aspect);
  if (!asset) {
    throw new Error(`No image slot "${aspect}" in synthesis "${synthesis.id}".`);
  }

  const generatedAtIso = new Date().toISOString();
  const previousImages = [...(asset.previousImages ?? [])];
  if (asset.imageUrl && asset.imageUrl !== imageUrl) {
    previousImages.unshift({
      imageUrl: asset.imageUrl,
      generator: asset.generator,
      promptUsed: asset.promptUsed,
      generatedAtIso: asset.generatedAtIso ?? generatedAtIso,
    });
  }

  return {
    ...asset,
    status: "ready",
    imageUrl,
    generator: "gallery_photo",
    promptUsed: undefined,
    generatedAtIso,
    error: undefined,
    previousImages,
  };
}

/**
 * Revert an image slot's active image to one of its previousImages entries.
 * The currently-active image is pushed onto previousImages so the revert
 * can itself be undone (swap, not discard).
 */
export function revertDealGoogleAdsImage(
  synthesis: DealGoogleAdsSynthesis,
  aspect: DealGoogleAdsImageAspect,
  historyIndex: number
): DealGoogleAdsImageAsset {
  const asset = synthesis.images.find((img) => img.aspect === aspect);
  if (!asset) {
    throw new Error(`No image slot "${aspect}" in synthesis "${synthesis.id}".`);
  }
  const history = asset.previousImages ?? [];
  const target = history[historyIndex];
  if (!target) {
    throw new Error(`No previous image at index ${historyIndex} for "${aspect}".`);
  }

  const remaining = history.filter((_, i) => i !== historyIndex);
  const previousImages = asset.imageUrl
    ? [
        {
          imageUrl: asset.imageUrl,
          generator: asset.generator,
          promptUsed: asset.promptUsed,
          generatedAtIso: asset.generatedAtIso ?? new Date().toISOString(),
        },
        ...remaining,
      ]
    : remaining;

  return {
    ...asset,
    status: "ready",
    imageUrl: target.imageUrl,
    generator: target.generator,
    promptUsed: target.promptUsed,
    generatedAtIso: target.generatedAtIso,
    error: undefined,
    previousImages,
  };
}
