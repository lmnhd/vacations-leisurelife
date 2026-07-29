/**
 * Deal Meta Ad Synthesis creative-direction proof.
 *
 * Run:
 *   npm run test:deal-meta-ad-synthesis
 */

import type { z } from "zod";

import type {
  StructuredObjectOptions,
  StructuredObjectResult,
} from "../lib/ai/llm-gateway";
import {
  __setDealMetaStyleSelectorForTests,
  buildDealMetaAdImagePrompt,
  buildDealMetaAdSynthesis,
  DEAL_META_AD_STYLE_PRESETS,
  DEFAULT_DEAL_META_AD_STYLE_ID,
  emptyDealMetaAdSynthesisCache,
  getDealMetaAdStylePreset,
  recommendDealMetaAdStyle,
  selectedDealMetaAdStyleId,
  validateDealMetaAdSynthesisCache,
  type DealFunnelSynthesis,
} from "../lib/cb/deals-system";

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail?: string): void {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.error(`  FAIL  ${name}${detail ? ` - ${detail}` : ""}`);
  }
}

const generatedAtIso = "2026-07-28T12:00:00.000Z";
const funnel: DealFunnelSynthesis = {
  id: "funnel-1640418-january-reset",
  dealId: "1640418",
  generatedAtIso,
  generator: "gpt",
  sourceAdCopyId: "adcopy-1640418-january-reset",
  sailingAngleTitle: "Your Mid-January Reset",
  landingPage: {
    heroHeadline: "Eight Nights to Reset",
    heroSubhead: "An adults-only Caribbean sailing from Miami.",
    segments: [],
    warnings: [],
  },
  carousel: {
    cards: [
      {
        headline: "Mid-January. You Need This.",
        primaryText:
          "Eight adults-only nights from Miami for a calm winter reset.",
      },
      {
        headline: "No School Calendars.",
        primaryText:
          "A grown-up sailing built around unhurried Caribbean days.",
      },
    ],
    warnings: [],
  },
  candidates: [],
  galleryIds: [],
};

check(
  "registry contains seven unique controlled presets",
  DEAL_META_AD_STYLE_PRESETS.length === 7 &&
    new Set(DEAL_META_AD_STYLE_PRESETS.map((preset) => preset.id)).size === 7
);
check(
  "fallback preset is resolvable",
  getDealMetaAdStylePreset(DEFAULT_DEAL_META_AD_STYLE_ID).label ===
    "Current Vivid Flyer"
);

const fallbackSynthesis = buildDealMetaAdSynthesis(funnel);
check(
  "fresh synthesis without AI result uses vivid fallback",
  fallbackSynthesis.selectedStyleId === DEFAULT_DEAL_META_AD_STYLE_ID &&
    fallbackSynthesis.styleSelectionSource === "fallback"
);
check(
  "legacy synthesis without style fields resolves to fallback",
  selectedDealMetaAdStyleId({
    ...fallbackSynthesis,
    selectedStyleId: undefined,
  }) === DEFAULT_DEAL_META_AD_STYLE_ID
);

const recommendation = {
  recommendedStyleId: "quiet_luxury" as const,
  rationale:
    "The calm adults-only reset angle benefits from restrained editorial space and premium visual cues.",
  confidence: "high" as const,
  generatedAtIso,
  modelTask: "decision" as const,
};
const recommendedSynthesis = buildDealMetaAdSynthesis(funnel, {
  styleRecommendation: recommendation,
});
check(
  "AI recommendation becomes the initial active style",
  recommendedSynthesis.recommendedStyleId === "quiet_luxury" &&
    recommendedSynthesis.selectedStyleId === "quiet_luxury" &&
    recommendedSynthesis.styleSelectionSource === "ai_recommended"
);

const prompt = buildDealMetaAdImagePrompt({
  promptTemplate: recommendedSynthesis.promptTemplate,
  card: recommendedSynthesis.cards[0],
  selectedStyleId: recommendedSynthesis.selectedStyleId,
  globalNegations: "Do not display the entire ship\nDo not add QR codes",
});
check(
  "compiled prompt includes card copy",
  prompt.includes(recommendedSynthesis.cards[0].headline) &&
    prompt.includes(recommendedSynthesis.cards[0].primaryText)
);
check(
  "compiled prompt includes only the selected preset direction",
  prompt.includes("quiet-luxury editorial advertisement") &&
    !prompt.includes("mid-century screen-printed travel poster")
);
check(
  "compiled prompt includes global exclusions and factual integrity",
  prompt.includes("Do not display the entire ship") &&
    prompt.includes("Factual integrity:")
);

const directedPrompt = buildDealMetaAdImagePrompt({
  promptTemplate: recommendedSynthesis.promptTemplate,
  card: {
    ...recommendedSynthesis.cards[0],
    imageDirection: "Use an editorial still life with no people or railings.",
  },
  selectedStyleId: recommendedSynthesis.selectedStyleId,
});
check(
  "compiled prompt includes persisted card-specific image direction",
  directedPrompt.includes("Card-specific image direction:") &&
    directedPrompt.includes("editorial still life with no people or railings")
);

async function runAsyncChecks(): Promise<void> {
  let capturedPrompt = "";
  async function fakeStructuredObject<TSchema extends z.ZodTypeAny>(
    options: StructuredObjectOptions<TSchema>
  ): Promise<StructuredObjectResult<TSchema>> {
    capturedPrompt = options.prompt;
    return {
      object: options.schema.parse({
        recommendedStyleId: "documentary_travel",
        rationale:
          "The human reset story is best served by an authentic candid moment with restrained typography.",
        confidence: "medium",
      }),
      modelId: "gateway-test-model",
      warnings: [],
    };
  }

  __setDealMetaStyleSelectorForTests(fakeStructuredObject);
  const aiRecommendation = await recommendDealMetaAdStyle(
    {
      dealId: funnel.dealId,
      sailingAngleTitle: funnel.sailingAngleTitle,
      campaignAngle: "A grown-up winter reset",
      visualAngle: "Calm human moments in natural Caribbean light",
      targetAudience: "Adults seeking a winter break",
      targetingKeywords: ["adults-only cruise", "winter reset"],
      cruiseLine: "Virgin Voyages",
      shipName: "Resilient Lady",
      destination: "Caribbean",
      nights: 8,
      itinerarySummary: "Miami, sea days, Caribbean ports",
      cards: funnel.carousel.cards.map((card, cardIndex) => ({
        cardIndex,
        headline: card.headline,
        primaryText: card.primaryText,
      })),
      recentStyleIds: ["current_vivid_flyer", "quiet_luxury"],
    },
    generatedAtIso
  );
  __setDealMetaStyleSelectorForTests();

  check(
    "structured selector returns a controlled preset",
    aiRecommendation.recommendedStyleId === "documentary_travel" &&
      aiRecommendation.modelTask === "decision"
  );
  check(
    "selector prompt includes recent style diversity context",
    capturedPrompt.includes("current_vivid_flyer") &&
      capturedPrompt.includes("quiet_luxury")
  );
  check(
    "selector prompt includes campaign context",
    capturedPrompt.includes("Resilient Lady") &&
      capturedPrompt.includes("A grown-up winter reset")
  );

  const validCache = {
    ...emptyDealMetaAdSynthesisCache(generatedAtIso),
    syntheses: [recommendedSynthesis],
  };
  check(
    "validator accepts new style fields",
    validateDealMetaAdSynthesisCache(validCache).ok
  );
  check(
    "validator accepts legacy records without style fields",
    validateDealMetaAdSynthesisCache({
      ...validCache,
      syntheses: [
        {
          ...recommendedSynthesis,
          recommendedStyleId: undefined,
          selectedStyleId: undefined,
          styleRecommendation: undefined,
          styleSelectionSource: undefined,
          styleSelectedAtIso: undefined,
        },
      ],
    }).ok
  );
  check(
    "validator rejects an unknown style id",
    !validateDealMetaAdSynthesisCache({
      ...validCache,
      syntheses: [
        {
          ...recommendedSynthesis,
          selectedStyleId: "unknown_style",
        },
      ],
    }).ok
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

void runAsyncChecks().catch((error) => {
  console.error(error);
  process.exit(1);
});
