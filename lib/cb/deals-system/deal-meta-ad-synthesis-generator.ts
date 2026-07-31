/**
 * Deal Meta Ad Synthesis generator (Step 8).
 *
 * Builds a synthesis from a Step 7 funnel synthesis's Meta carousel (4 cards),
 * and generates one square ad image per card with gpt-image-2. The operator's
 * prompt template is interpolated per-card ({{HEADLINE}} / {{PRIMARY_TEXT}})
 * before each generation.
 */

import {
  generateGptImage2,
  generateGptImage2WithReferences,
  type GptImageReferenceInput,
} from "@/lib/campaigns/media/generators/gpt-image";
import { fetchUsableReferenceImage } from "@/lib/campaigns/media/generators/reference-image";
import { storeAsset } from "@/lib/campaigns/media/storage-client";

import type { DealFunnelSynthesis } from "./deal-page-design-types";
import { buildDealMetaAdImagePromptForSynthesis } from "./deal-meta-ad-prompt";
import {
  buildReferenceManifest,
  resolveDealMetaAdReferences,
} from "./deal-meta-ad-references";
import {
  DEFAULT_DEAL_META_AD_STYLE_ID,
  type DealMetaAdStylePresetId,
} from "./deal-meta-ad-style-presets";
import {
  DEFAULT_META_AD_PROMPT_TEMPLATE,
  type DealMetaAdCard,
  type DealMetaAdGenerationMode,
  type DealMetaAdStyleRecommendation,
  type DealMetaAdSynthesis,
  type DealMetaImageReference,
  type DealMetaStyleSelectionSource,
} from "./deal-meta-ad-synthesis-types";

export function selectedDealMetaAdStyleId(
  synthesis: Pick<DealMetaAdSynthesis, "selectedStyleId">
): DealMetaAdStylePresetId {
  return synthesis.selectedStyleId ?? DEFAULT_DEAL_META_AD_STYLE_ID;
}

export function dealMetaAdStyleSelectionSource(
  synthesis: Pick<DealMetaAdSynthesis, "styleSelectionSource">
): DealMetaStyleSelectionSource {
  return synthesis.styleSelectionSource ?? "fallback";
}

/** Build a fresh synthesis (or reset cards) from a funnel synthesis's carousel. */
export function buildDealMetaAdSynthesis(
  funnelSynthesis: DealFunnelSynthesis,
  options: {
    styleRecommendation?: DealMetaAdStyleRecommendation;
    styleRecommendationWarning?: string;
  } = {}
): DealMetaAdSynthesis {
  const cards: DealMetaAdCard[] = funnelSynthesis.carousel.cards.map((card, cardIndex) => ({
    cardIndex,
    headline: card.headline,
    primaryText: card.primaryText,
    status: "pending",
  }));

  const styleId =
    options.styleRecommendation?.recommendedStyleId ??
    DEFAULT_DEAL_META_AD_STYLE_ID;
  const styleSelectionSource: DealMetaStyleSelectionSource =
    options.styleRecommendation ? "ai_recommended" : "fallback";

  return {
    id: funnelSynthesis.id,
    dealId: funnelSynthesis.dealId,
    generatedAtIso: new Date().toISOString(),
    sourceFunnelSynthesisId: funnelSynthesis.id,
    sailingAngleTitle: funnelSynthesis.sailingAngleTitle,
    promptTemplate: DEFAULT_META_AD_PROMPT_TEMPLATE,
    recommendedStyleId: styleId,
    selectedStyleId: styleId,
    styleRecommendation: options.styleRecommendation,
    styleSelectionSource,
    styleSelectedAtIso:
      options.styleRecommendation?.generatedAtIso ?? new Date().toISOString(),
    styleRecommendationWarning: options.styleRecommendationWarning,
    cards,
  };
}

/**
 * Download the resolved references as buffers for the image API.
 *
 * A reference that can't be fetched is skipped with a warning rather than
 * failing the generation: losing one gallery image should degrade the result,
 * not cost the operator the whole (slow, paid) run. If NONE survive, the caller
 * falls back to text-only rather than sending an empty edits request.
 */
async function loadReferenceBuffers(
  references: DealMetaImageReference[]
): Promise<GptImageReferenceInput[]> {
  const loaded: GptImageReferenceInput[] = [];
  for (const reference of references) {
    try {
      const fetched = await fetchUsableReferenceImage(
        reference.assetUrl,
        reference.thumbnailUrl
      );
      loaded.push({
        buffer: fetched.buffer,
        mimeType: fetched.mimeType,
        label: reference.title ?? reference.role,
      });
    } catch (error) {
      console.warn("[deal-meta-ad] skipping unfetchable reference", {
        referenceId: reference.id,
        role: reference.role,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return loaded;
}

export interface GenerateDealMetaAdCardImageOptions {
  /**
   * Operator's persistent (cross-campaign) negation text, appended after
   * interpolation so it isn't subject to {{HEADLINE}}/{{PRIMARY_TEXT}}
   * substitution.
   */
  promptSuffix?: string;
  /**
   * `new_variation` and `edit_current` send input imagery; `text_only` keeps
   * the original images/generations path. Defaults to text_only so legacy
   * callers and reference-free campaigns are unaffected.
   */
  mode?: DealMetaAdGenerationMode;
}

/**
 * Generate (or regenerate) the image for one card, returning the updated card.
 * Throws on generation/storage failure — caller decides how to record the error.
 */
export async function generateDealMetaAdCardImage(
  synthesis: DealMetaAdSynthesis,
  cardIndex: number,
  options: GenerateDealMetaAdCardImageOptions | string = {}
): Promise<DealMetaAdCard> {
  // Back-compat: this used to take `promptSuffix` as a bare third argument.
  const { promptSuffix, mode: requestedMode = "text_only" } =
    typeof options === "string" ? { promptSuffix: options, mode: "text_only" as const } : options;

  const card = synthesis.cards.find((c) => c.cardIndex === cardIndex);
  if (!card) {
    throw new Error(`No card with index ${cardIndex} in synthesis "${synthesis.id}".`);
  }
  if (requestedMode === "edit_current" && !card.imageUrl) {
    throw new Error(
      `Card ${cardIndex + 1} has no image to edit — generate one first.`
    );
  }

  const resolvedReferences =
    requestedMode === "text_only"
      ? []
      : resolveDealMetaAdReferences(synthesis, card, requestedMode);
  const referenceBuffers =
    resolvedReferences.length > 0 ? await loadReferenceBuffers(resolvedReferences) : [];

  // Every reference failed to fetch → fall back to text-only rather than
  // sending an edits request with no images. An edit with nothing to edit is
  // not a meaningful request, so surface that instead of silently degrading.
  if (requestedMode === "edit_current" && referenceBuffers.length === 0) {
    throw new Error(
      "Could not fetch the card's current image to edit. Check the stored asset URL and retry."
    );
  }
  const effectiveMode: DealMetaAdGenerationMode =
    referenceBuffers.length > 0 ? requestedMode : "text_only";
  const usedReferences =
    effectiveMode === "text_only" ? [] : resolvedReferences.slice(0, referenceBuffers.length);

  const promptUsed = buildDealMetaAdImagePromptForSynthesis(
    synthesis,
    card,
    promptSuffix,
    buildReferenceManifest(usedReferences, effectiveMode)
  );

  const buffer =
    effectiveMode === "text_only"
      ? await generateGptImage2(promptUsed, { aspect: "1:1" })
      : await generateGptImage2WithReferences({
          prompt: promptUsed,
          references: referenceBuffers,
          mode: effectiveMode,
          aspect: "1:1",
        });

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
      mode: card.mode,
      derivedFromImageUrl: card.derivedFromImageUrl,
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
    mode: effectiveMode,
    // Lineage: only an edit has a parent. A new variation is a fresh
    // composition even though it was informed by references.
    derivedFromImageUrl:
      effectiveMode === "edit_current" ? card.imageUrl : undefined,
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
          mode: card.mode,
          derivedFromImageUrl: card.derivedFromImageUrl,
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
    // Restore the reverted image's own provenance, not the one it replaced.
    mode: target.mode,
    derivedFromImageUrl: target.derivedFromImageUrl,
  };
}
