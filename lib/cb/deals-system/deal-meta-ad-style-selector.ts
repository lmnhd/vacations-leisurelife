import { z } from "zod/v3";

import {
  generateStructuredObject,
  modelForTask,
} from "@/lib/ai/llm-gateway";

import {
  DEAL_META_AD_STYLE_PRESETS,
  DEAL_META_AD_STYLE_PRESET_IDS,
  type DealMetaAdStylePresetId,
} from "./deal-meta-ad-style-presets";
import type {
  DealMetaAdStyleRecommendation,
  DealMetaStyleConfidence,
} from "./deal-meta-ad-synthesis-types";

export interface DealMetaStyleDecisionContext {
  dealId: string;
  sailingAngleTitle: string;
  campaignAngle?: string;
  visualAngle?: string;
  targetAudience?: string;
  targetingKeywords: string[];
  cruiseLine?: string;
  shipName?: string;
  destination?: string;
  nights?: number;
  itinerarySummary?: string;
  publicPromotionSummary?: string;
  cards: Array<{
    cardIndex: number;
    headline: string;
    primaryText: string;
  }>;
  recentStyleIds: DealMetaAdStylePresetId[];
}

const StyleDecisionSchema = z.object({
  recommendedStyleId: z.enum(DEAL_META_AD_STYLE_PRESET_IDS),
  rationale: z.string().min(20).max(500),
  confidence: z.enum(["high", "medium", "low"]),
});

type StructuredObjectFn = typeof generateStructuredObject;
let structuredObjectFn: StructuredObjectFn = generateStructuredObject;

/** Test seam for the bounded recommendation call. */
export function __setDealMetaStyleSelectorForTests(
  fn?: StructuredObjectFn
): void {
  structuredObjectFn = fn ?? generateStructuredObject;
}

function presetDecisionMenu(): Array<{
  id: DealMetaAdStylePresetId;
  label: string;
  summary: string;
  bestFor: string[];
}> {
  return DEAL_META_AD_STYLE_PRESETS.map((preset) => ({
    id: preset.id,
    label: preset.label,
    summary: preset.summary,
    bestFor: preset.bestFor,
  }));
}

export async function recommendDealMetaAdStyle(
  context: DealMetaStyleDecisionContext,
  generatedAtIso: string = new Date().toISOString()
): Promise<DealMetaAdStyleRecommendation> {
  const result = await structuredObjectFn({
    model: modelForTask("decision"),
    schema: StyleDecisionSchema,
    system:
      "You are a senior advertising art director choosing one controlled visual style for a four-card cruise Deal carousel. Choose only from the supplied preset catalog. Campaign fit and legibility come first. Recent usage is a diversity signal, not a prohibition. Never add or infer travel facts.",
    prompt: [
      "Choose the best default creative-direction preset for this campaign.",
      "",
      "Decision priorities:",
      "1. Campaign and audience fit.",
      "2. Legibility for the amount of carousel copy.",
      "3. Emotional match to the sailing and public offer.",
      "4. Truthful representation of the supplied angle.",
      "5. Distinctness from recently used styles.",
      "6. Feasibility for a square social ad.",
      "",
      "When two styles fit similarly well, prefer the one used less recently.",
      "Return a concise operator-facing rationale based only on the supplied context.",
      "",
      "Preset catalog:",
      JSON.stringify(presetDecisionMenu(), null, 2),
      "",
      "Campaign context:",
      JSON.stringify(context, null, 2),
    ].join("\n"),
    timeoutMs: 60_000,
    strictJsonSchema: false,
  });

  return {
    recommendedStyleId: result.object.recommendedStyleId,
    rationale: result.object.rationale.trim(),
    confidence: result.object.confidence as DealMetaStyleConfidence,
    generatedAtIso,
    modelTask: "decision",
  };
}
