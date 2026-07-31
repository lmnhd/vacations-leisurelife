import {
  getDealMetaAdStylePreset,
  type DealMetaAdStylePresetId,
} from "./deal-meta-ad-style-presets";
import {
  interpolateMetaAdPrompt,
  type DealMetaAdCard,
  type DealMetaAdSynthesis,
} from "./deal-meta-ad-synthesis-types";

/**
 * True when an image direction consists purely of exclusions ("no ship, no
 * rails") with nothing telling the model what to actually render. Diffusion
 * models weight positive nouns far more reliably than negations, so a
 * subtraction-only direction tends to produce the excluded subject anyway.
 *
 * Deliberately conservative: it only fires when EVERY sentence is negative, so
 * "Show a harbor at midnight. No ship." passes clean.
 */
export function isOnlyNegativeDirection(direction: string): boolean {
  const trimmed = direction.trim();
  if (!trimmed) return false;

  const sentences = trimmed
    .split(/[.;\n]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (sentences.length === 0) return false;

  const negativeOpener =
    /^(no|not|never|avoid|exclude|omit|without|don'?t|do not|remove|skip)\b/i;
  return sentences.every((sentence) => negativeOpener.test(sentence));
}

export interface DealMetaAdPromptInput {
  promptTemplate: string;
  card: Pick<DealMetaAdCard, "headline" | "primaryText" | "imageDirection">;
  selectedStyleId?: DealMetaAdStylePresetId;
  globalNegations?: string;
  /**
   * Reference-role manifest from buildReferenceManifest(), when this generation
   * sends input imagery. Omitted for text-only generation.
   */
  referenceManifest?: string;
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
    // The card direction is the operator's deliberate override, so it has to
    // outrank the style preset — a preset demanding "one dominant photograph"
    // of a cruise will otherwise reintroduce the exact ship or railing the
    // operator just excluded. Stating the precedence explicitly is what makes
    // an exclusion survive contact with the preset above it.
    sections.push(
      `Card-specific image direction (HIGHEST PRIORITY — overrides the creative direction above wherever they conflict):\n${imageDirection}`
    );
  }

  // Sits AFTER the card direction so the operator's words still outrank it, but
  // before the exclusions and the factual-integrity clause — both of which must
  // apply to reference-driven output too.
  const referenceManifest = input.referenceManifest?.trim();
  if (referenceManifest) {
    sections.push(`Reference imagery:\n${referenceManifest}`);
  }

  const negations = input.globalNegations?.trim();
  if (negations) {
    sections.push(`Global exclusions:\n${negations}`);
  }

  sections.push(
    "Factual integrity:\nDo not invent prices, dates, ports, amenities, promotions, logos, web addresses, QR codes, or claims. Use only information supplied in the card copy. A reference image is visual guidance only and never establishes an amenity, itinerary, fare, or inclusion."
  );

  return sections.join("\n\n");
}

export function buildDealMetaAdImagePromptForSynthesis(
  synthesis: DealMetaAdSynthesis,
  card: Pick<DealMetaAdCard, "headline" | "primaryText" | "imageDirection">,
  globalNegations?: string,
  referenceManifest?: string
): string {
  return buildDealMetaAdImagePrompt({
    promptTemplate: synthesis.promptTemplate,
    card,
    selectedStyleId: synthesis.selectedStyleId,
    globalNegations,
    referenceManifest,
  });
}
