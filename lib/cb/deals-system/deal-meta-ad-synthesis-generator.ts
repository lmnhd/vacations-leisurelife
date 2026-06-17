/**
 * Deal Meta Ad Synthesis generator (Step 8).
 *
 * Builds a synthesis from a Step 7 funnel synthesis's Meta carousel (4 cards),
 * and generates one square ad image per card with gpt-image-2. The operator's
 * prompt template is interpolated per-card ({{HEADLINE}} / {{PRIMARY_TEXT}})
 * before each generation.
 */

import { generateGptImage2 } from "@/lib/campaigns/media/generators/gpt-image";
import { storeAsset } from "@/lib/campaigns/media/storage-client";

import type { DealFunnelSynthesis } from "./deal-page-design-types";
import {
  DEFAULT_META_AD_PROMPT_TEMPLATE,
  interpolateMetaAdPrompt,
  type DealMetaAdCard,
  type DealMetaAdSynthesis,
} from "./deal-meta-ad-synthesis-types";

/** Build a fresh synthesis (or reset cards) from a funnel synthesis's carousel. */
export function buildDealMetaAdSynthesis(
  funnelSynthesis: DealFunnelSynthesis
): DealMetaAdSynthesis {
  const cards: DealMetaAdCard[] = funnelSynthesis.carousel.cards.map((card, cardIndex) => ({
    cardIndex,
    headline: card.headline,
    primaryText: card.primaryText,
    status: "pending",
  }));

  return {
    id: funnelSynthesis.id,
    dealId: funnelSynthesis.dealId,
    generatedAtIso: new Date().toISOString(),
    sourceFunnelSynthesisId: funnelSynthesis.id,
    sailingAngleTitle: funnelSynthesis.sailingAngleTitle,
    promptTemplate: DEFAULT_META_AD_PROMPT_TEMPLATE,
    cards,
  };
}

/**
 * Generate (or regenerate) the image for one card, returning the updated card.
 * Throws on generation/storage failure — caller decides how to record the error.
 */
export async function generateDealMetaAdCardImage(
  synthesis: DealMetaAdSynthesis,
  cardIndex: number,
  /**
   * Operator's persistent (cross-campaign) negation text, appended after
   * interpolation so it isn't subject to {{HEADLINE}}/{{PRIMARY_TEXT}}
   * substitution.
   */
  promptSuffix?: string
): Promise<DealMetaAdCard> {
  const card = synthesis.cards.find((c) => c.cardIndex === cardIndex);
  if (!card) {
    throw new Error(`No card with index ${cardIndex} in synthesis "${synthesis.id}".`);
  }

  const interpolated = interpolateMetaAdPrompt(synthesis.promptTemplate, card);
  const promptUsed = promptSuffix?.trim() ? `${interpolated}\n\n${promptSuffix.trim()}` : interpolated;
  const buffer = await generateGptImage2(promptUsed, { aspect: "1:1" });

  const generatedAtIso = new Date().toISOString();
  const assetId = `meta-ad-${synthesis.id}-card${cardIndex}-${Date.now()}`;
  const imageUrl = await storeAsset(
    `deals/${synthesis.dealId}`,
    assetId,
    // Per-generation path (not per-card) so regenerations don't overwrite
    // earlier images in storage — needed so the operator can revert.
    `meta-ad-synthesis/${synthesis.id}/card${cardIndex}-${Date.now()}.png`,
    buffer,
    "image/png"
  );

  const previousImages = [...(card.previousImages ?? [])];
  if (card.imageUrl) {
    previousImages.unshift({
      imageUrl: card.imageUrl,
      generator: card.generator,
      promptUsed: card.promptUsed,
      generatedAtIso: card.generatedAtIso ?? generatedAtIso,
    });
  }

  return {
    ...card,
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
 * Revert a card's active image to one of its previousImages entries. The
 * currently-active image is pushed onto previousImages so the revert can
 * itself be undone (swap, not discard).
 */
export function revertDealMetaAdCardImage(
  synthesis: DealMetaAdSynthesis,
  cardIndex: number,
  historyIndex: number
): DealMetaAdCard {
  const card = synthesis.cards.find((c) => c.cardIndex === cardIndex);
  if (!card) {
    throw new Error(`No card with index ${cardIndex} in synthesis "${synthesis.id}".`);
  }
  const history = card.previousImages ?? [];
  const target = history[historyIndex];
  if (!target) {
    throw new Error(`No previous image at index ${historyIndex} for card ${cardIndex}.`);
  }

  const remaining = history.filter((_, i) => i !== historyIndex);
  const previousImages = card.imageUrl
    ? [
        {
          imageUrl: card.imageUrl,
          generator: card.generator,
          promptUsed: card.promptUsed,
          generatedAtIso: card.generatedAtIso ?? new Date().toISOString(),
        },
        ...remaining,
      ]
    : remaining;

  return {
    ...card,
    status: "ready",
    imageUrl: target.imageUrl,
    generator: target.generator,
    promptUsed: target.promptUsed,
    generatedAtIso: target.generatedAtIso,
    error: undefined,
    previousImages,
  };
}
