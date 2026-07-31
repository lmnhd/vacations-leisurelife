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
  buildReferenceManifest,
  DEAL_META_AD_STYLE_PRESETS,
  DEFAULT_DEAL_META_AD_STYLE_ID,
  emptyDealMetaAdSynthesisCache,
  getDealMetaAdStylePreset,
  isOnlyNegativeDirection,
  recommendDealMetaAdStyle,
  resolveDealMetaAdReferences,
  selectedDealMetaAdStyleId,
  validateDealMetaAdSynthesisCache,
  type DealFunnelSynthesis,
  type DealMetaImageReference,
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
  directedPrompt.includes("Card-specific image direction") &&
    directedPrompt.includes("editorial still life with no people or railings")
);

// The operator's per-card direction has to outrank the style preset, or a
// preset demanding a dominant cruise photograph reintroduces the very ship or
// railing the direction just excluded.
check(
  "card-specific direction is marked as outranking the style preset",
  directedPrompt.includes("HIGHEST PRIORITY") &&
    directedPrompt.indexOf("Card-specific image direction") >
      directedPrompt.indexOf("Creative direction (")
);

// Subtraction-only directions ("no ship, no rails") are the ones image models
// quietly disregard, so the operator UI warns on them. The detector must stay
// quiet once a direction also says what to render, or the hint becomes noise.
check(
  "flags a direction that is only exclusions",
  isOnlyNegativeDirection("Do not show a ship at all. No ship rails") &&
    isOnlyNegativeDirection("No people, faces, railings, or decks.") &&
    isOnlyNegativeDirection("Avoid ship exteriors")
);
check(
  "does not flag a direction that says what to show",
  !isOnlyNegativeDirection(
    "Show a fireworks-lit harbor skyline from shore. No ship, deck, or railing in frame."
  ) &&
    !isOnlyNegativeDirection("Use an art-directed flat lay with a brass compass.") &&
    !isOnlyNegativeDirection("")
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

  // ── Reference pack (GPT Image 2 reference upgrade, Release 1) ──────────────

  const anchor: DealMetaImageReference = {
    id: "ref-anchor",
    assetUrl: "https://cdn.example.com/silver-muse.jpg",
    role: "ship_identity",
    source: "funnel_candidate",
    addedAtIso: "2026-07-30T10:00:00.000Z",
  };
  const styleRef: DealMetaImageReference = {
    id: "ref-style",
    assetUrl: "https://cdn.example.com/palette.jpg",
    role: "style",
    source: "card_history",
    addedAtIso: "2026-07-30T10:01:00.000Z",
  };
  const destinationRef: DealMetaImageReference = {
    id: "ref-destination",
    assetUrl: "https://cdn.example.com/cochin.jpg",
    role: "destination_truth",
    source: "funnel_candidate",
    addedAtIso: "2026-07-30T10:02:00.000Z",
  };

  const refSynthesis = { shipIdentityReference: anchor };
  const refCard = {
    references: [styleRef, destinationRef],
    imageUrl: "https://cdn.example.com/card-current.png",
    disableShipAnchor: false,
  };

  const variationOrder = resolveDealMetaAdReferences(
    refSynthesis,
    refCard,
    "new_variation"
  );
  check(
    "new_variation orders truth roles before aesthetic roles",
    variationOrder[0].role === "destination_truth" && variationOrder[1].role === "style",
    variationOrder.map((r) => r.role).join(",")
  );
  check(
    "new_variation appends the campaign ship anchor last",
    variationOrder[variationOrder.length - 1].id === "ref-anchor"
  );
  check(
    "new_variation does not send the current card image",
    !variationOrder.some((r) => r.assetUrl.includes("card-current"))
  );

  const editOrder = resolveDealMetaAdReferences(refSynthesis, refCard, "edit_current");
  check(
    "edit_current sends the active card image first",
    editOrder[0].assetUrl === "https://cdn.example.com/card-current.png",
    editOrder[0]?.assetUrl
  );

  check(
    "a card can opt out of the campaign ship anchor",
    !resolveDealMetaAdReferences(
      refSynthesis,
      { ...refCard, disableShipAnchor: true },
      "new_variation"
    ).some((r) => r.id === "ref-anchor")
  );

  check(
    "an explicit card ship_identity reference suppresses the duplicate anchor",
    resolveDealMetaAdReferences(
      refSynthesis,
      { references: [{ ...anchor, id: "ref-card-ship" }], disableShipAnchor: false },
      "new_variation"
    ).length === 1
  );

  check(
    "a reference-free card resolves to no references",
    resolveDealMetaAdReferences({}, { references: [] }, "new_variation").length === 0
  );

  const manifest = buildReferenceManifest(variationOrder, "new_variation");
  check(
    "manifest states references are not factual claims",
    Boolean(manifest?.includes("not additional factual claims"))
  );
  check(
    "manifest forbids reproducing a reference exactly",
    Boolean(manifest?.includes("Do not reproduce any reference exactly"))
  );
  check(
    "manifest is omitted when there are no references",
    buildReferenceManifest([], "new_variation") === undefined
  );

  const referencePrompt = buildDealMetaAdImagePrompt({
    promptTemplate: "Card: {{HEADLINE}}",
    card: {
      headline: "Quiet mornings",
      primaryText: "Slow sea days.",
      imageDirection: "Show a still life of a map and brass compass.",
    },
    globalNegations: "Do not add QR codes",
    referenceManifest: manifest,
  });
  check(
    "card direction still outranks the creative direction with references present",
    referencePrompt.indexOf("HIGHEST PRIORITY") < referencePrompt.indexOf("Reference imagery:")
  );
  check(
    "reference manifest precedes global exclusions and factual integrity",
    referencePrompt.indexOf("Reference imagery:") < referencePrompt.indexOf("Global exclusions:") &&
      referencePrompt.indexOf("Global exclusions:") < referencePrompt.indexOf("Factual integrity:")
  );
  check(
    "factual-integrity clause disclaims reference-derived facts",
    referencePrompt.includes("never establishes an amenity")
  );

  const referenceCache = {
    ...emptyDealMetaAdSynthesisCache(generatedAtIso),
    syntheses: [
      {
        ...recommendedSynthesis,
        shipIdentityReference: anchor,
        cards: recommendedSynthesis.cards.map((card, idx) =>
          idx === 0 ? { ...card, references: [styleRef] } : card
        ),
      },
    ],
  };
  check(
    "validator accepts references and a ship anchor",
    validateDealMetaAdSynthesisCache(referenceCache).ok,
    validateDealMetaAdSynthesisCache(referenceCache).errors.join("; ")
  );
  check(
    "validator rejects a reference with an unknown role",
    !validateDealMetaAdSynthesisCache({
      ...referenceCache,
      syntheses: [
        {
          ...referenceCache.syntheses[0],
          shipIdentityReference: { ...anchor, role: "not_a_role" },
        },
      ],
    }).ok
  );
  check(
    "validator rejects a reference with no assetUrl",
    !validateDealMetaAdSynthesisCache({
      ...referenceCache,
      syntheses: [
        {
          ...referenceCache.syntheses[0],
          shipIdentityReference: { ...anchor, assetUrl: "" },
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
