import {
  getDealMetaAdStylePreset,
  type DealMetaAdStylePresetId,
} from "./deal-meta-ad-style-presets";
import {
  interpolateMetaAdPrompt,
  type DealMetaAdCard,
  type DealMetaAdSynthesis,
} from "./deal-meta-ad-synthesis-types";

export interface DealMetaAdPromptInput {
  promptTemplate: string;
  card: Pick<DealMetaAdCard, "headline" | "primaryText" | "imageDirection">;
  selectedStyleId?: DealMetaAdStylePresetId;
  globalNegations?: string;
}

export function buildDealMetaAdImagePrompt(
  input: DealMetaAdPromptInput
): string {
  const preset = getDealMetaAdStylePreset(input.selectedStyleId);
  const sections = [
    interpolateMetaAdPrompt(input.promptTemplate, input.card),
    `Creative direction (${preset.label}):\n${preset.promptDirection}`,
    "Carousel system:\nKeep this card visually consistent with the same campaign style family while allowing its focal composition to respond to this card's message.",
  ];

  const imageDirection = input.card.imageDirection?.trim();
  if (imageDirection) {
    sections.push(`Card-specific image direction:\n${imageDirection}`);
  }

  const negations = input.globalNegations?.trim();
  if (negations) {
    sections.push(`Global exclusions:\n${negations}`);
  }

  sections.push(
    "Factual integrity:\nDo not invent prices, dates, ports, amenities, promotions, logos, web addresses, QR codes, or claims. Use only information supplied in the card copy."
  );

  return sections.join("\n\n");
}

export function buildDealMetaAdImagePromptForSynthesis(
  synthesis: DealMetaAdSynthesis,
  card: Pick<DealMetaAdCard, "headline" | "primaryText" | "imageDirection">,
  globalNegations?: string
): string {
  return buildDealMetaAdImagePrompt({
    promptTemplate: synthesis.promptTemplate,
    card,
    selectedStyleId: synthesis.selectedStyleId,
    globalNegations,
  });
}
