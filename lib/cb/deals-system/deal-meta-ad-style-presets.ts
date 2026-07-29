/**
 * Controlled creative-direction catalog for Deal Meta carousel images.
 *
 * The AI selector chooses one id from this registry. The operator UI and prompt
 * builder consume the same records so labels and prompt language cannot drift.
 */

export const DEAL_META_AD_STYLE_PRESET_IDS = [
  "current_vivid_flyer",
  "clean_travel_magazine",
  "retro_screenprint",
  "bold_type_first",
  "quiet_luxury",
  "cut_paper_collage",
  "documentary_travel",
] as const;

export type DealMetaAdStylePresetId =
  (typeof DEAL_META_AD_STYLE_PRESET_IDS)[number];

export interface DealMetaAdStylePreset {
  id: DealMetaAdStylePresetId;
  label: string;
  summary: string;
  promptDirection: string;
  bestFor: string[];
}

export const DEFAULT_DEAL_META_AD_STYLE_ID: DealMetaAdStylePresetId =
  "current_vivid_flyer";

export const DEAL_META_AD_STYLE_PRESETS: readonly DealMetaAdStylePreset[] = [
  {
    id: "current_vivid_flyer",
    label: "Current Vivid Flyer",
    summary: "The energetic, glossy visual treatment used by the existing Deal carousel.",
    promptDirection:
      "Create a vivid square cruise promotion flyer with energetic travel imagery, bold high-contrast headline typography, clear promotional hierarchy, and strong visual impact at social-feed size.",
    bestFor: ["high-energy offers", "broad appeal", "safe fallback"],
  },
  {
    id: "clean_travel_magazine",
    label: "Clean Travel Magazine",
    summary: "A spacious editorial cover led by one strong destination photograph.",
    promptDirection:
      "Creative direction: premium travel-magazine cover. Use one dominant full-bleed photograph, an asymmetrical editorial grid, an elegant serif headline with restrained sans-serif details, a cream, navy, and coral palette, and generous negative space. Do not use a montage, sticker bubbles, circular callouts, or crowded information blocks.",
    bestFor: ["destination-led campaigns", "mature audiences", "longer itineraries"],
  },
  {
    id: "retro_screenprint",
    label: "Retro Screenprint",
    summary: "A simplified mid-century destination poster with tactile ink and paper texture.",
    promptDirection:
      "Creative direction: mid-century screen-printed travel poster. Use simplified geometric scenery, flat shapes, a four-color ink palette, slightly imperfect paper grain, and one bold hand-lettered accent. Do not use a glossy photoreal collage, inset photographs, promotional bubbles, or 3D effects.",
    bestFor: ["distinctive destinations", "port-intensive itineraries", "playful hooks"],
  },
  {
    id: "bold_type_first",
    label: "Bold Type-First",
    summary: "A contemporary poster where the headline is the dominant visual element.",
    promptDirection:
      "Creative direction: contemporary type-led poster. Make the oversized headline the main visual element, supported by one tightly cropped destination or onboard photograph, a strong diagonal grid, a two-color palette with one bright accent, and minimal supporting copy. Do not use a multi-photo montage, circular badges, or price-burst stickers.",
    bestFor: ["short headlines", "date-led campaigns", "one dominant message"],
  },
  {
    id: "quiet_luxury",
    label: "Quiet Luxury",
    summary: "A restrained premium advertisement with elegant typography and generous space.",
    promptDirection:
      "Creative direction: quiet-luxury editorial advertisement. Use one art-directed destination, dining, suite, or veranda detail, generous ivory space, a high-contrast serif headline, small restrained sans-serif labels, and a deep navy, cream, and muted brass palette. Do not use neon gradients, bubble badges, dense copy blocks, or a busy collage.",
    bestFor: ["premium products", "small ships", "dining and suite campaigns"],
  },
  {
    id: "cut_paper_collage",
    label: "Cut-Paper Collage",
    summary: "A tactile, playful paper composition without the current glossy montage treatment.",
    promptDirection:
      "Creative direction: tactile cut-paper travel collage. Use layered colored paper, torn edges, abstract postcard and map shapes, subtle risograph grain, a playful but controlled composition, and three or four muted colors. Do not use glossy 3D treatment, a stock-photo montage, neon gradients, or invented readable travel information.",
    bestFor: ["social campaigns", "varied itineraries", "playful planning angles"],
  },
  {
    id: "documentary_travel",
    label: "Documentary Travel",
    summary: "A candid, human-centered travel moment with restrained graphic treatment.",
    promptDirection:
      "Creative direction: candid photojournalistic travel advertisement. Use one authentic human moment, natural available light, subtle film grain, a restrained caption band, and clean documentary typography. Do not use staged promotional smiles, multiple inset photographs, badges, or glossy composite effects.",
    bestFor: ["emotional reset campaigns", "human stories", "trust and authenticity"],
  },
];

export function isDealMetaAdStylePresetId(
  value: unknown
): value is DealMetaAdStylePresetId {
  return (
    typeof value === "string" &&
    DEAL_META_AD_STYLE_PRESET_IDS.some((presetId) => presetId === value)
  );
}

export function getDealMetaAdStylePreset(
  value: unknown
): DealMetaAdStylePreset {
  const id = isDealMetaAdStylePresetId(value)
    ? value
    : DEFAULT_DEAL_META_AD_STYLE_ID;
  return (
    DEAL_META_AD_STYLE_PRESETS.find((preset) => preset.id === id) ??
    DEAL_META_AD_STYLE_PRESETS[0]
  );
}
