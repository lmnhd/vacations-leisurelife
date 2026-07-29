# Meta Ad Creative Direction Upgrade

**Status:** Core implementation complete; live operator review pending  
**Date:** July 28, 2026  
**Scope:** Deal Workflow Step 8 - Meta Ad Synthesis  
**Primary surface:** `/tests/deals-system/meta-ad-synthesis`  
**Image generator:** GPT Image 2  

## Implementation Update - July 28, 2026

Implemented:

- seven-preset central creative-direction registry
- neutral Meta prompt template for new syntheses
- pure prompt builder that composes card copy, active style, carousel coherence, global exclusions, and factual integrity
- structured AI recommendation through `modelForTask("decision")`
- Curated Deal and visitor-safe unified-manifest context assembly
- recent-style diversity context from the five most recent syntheses
- separate persisted AI recommendation and active operator selection
- backward-compatible fallback behavior for legacy syntheses
- explicit `update_style` and `recommend_style` API actions
- operator Creative Direction panel with rationale, confidence, active style, source, override, restore, and recommend-again controls
- no automatic image generation when a style changes
- runtime validation for preset ids and recommendation records
- focused proof suite added to the aggregate Deals test command

Validation completed:

- focused Meta synthesis proof: 14 passed, 0 failed
- related Funnel, public projection, and Google Ads proofs: 159 passed, 0 failed
- TypeScript: passed
- `git diff --check`: passed
- aggregate Deals suite: schema, Link Broker, and Link Broker health suites passed before the existing promo-extraction fixture gate stopped the run because `cbpromo-2837` was not present

Still pending:

- visual operator review on the running local Step 8 surface
- controlled live Image 2 comparisons, which require explicit operator generation spend

## 1. Objective

Preserve the strong imagery and effective advertising quality currently produced by GPT Image 2 while reducing the repeated visual style that has emerged across unrelated Deal campaigns.

The upgrade should remain deliberately small:

- introduce a controlled library of creative-direction presets
- have the LLM Gateway intelligently recommend the best default preset for each campaign
- make the recommendation visible and editable before image generation
- keep one coherent style family across the four cards in a carousel
- retain all existing generation history, locking, regeneration, approval, and distribution behavior
- avoid adding another large creative-generation stage

The operator remains the final creative decision-maker. AI makes the first recommendation; it does not lock the campaign into that choice.

## 2. Current-State Finding

The current Deal Meta image prompt is:

```text
Generate a vivid square ad flyer promoting the following Cruise Package:
{{HEADLINE}}
{{PRIMARY_TEXT}}
```

All seven saved Deal Meta syntheses inspected on July 28, 2026 use this same prompt template. The campaign headline and primary text change, but the prompt gives the image model no campaign-specific design language.

The model therefore supplies its own dependable visual system:

- saturated navy, cyan, red, and yellow
- condensed uppercase headlines
- glossy photoreal travel imagery
- multi-image montage or collage layouts
- circular inset photographs
- promotional bubbles and badges
- large white or yellow numbers
- dense magazine-flyer composition

This style is attractive and effective. The problem is not its quality. The problem is that it has become the unintentional default for nearly every campaign.

### Existing reusable infrastructure

The current system already has most of the required plumbing:

- the synthesis stores an operator-editable shared prompt template
- generation interpolates `{{HEADLINE}}` and `{{PRIMARY_TEXT}}`
- the UI already builds a prompt suffix from persistent negation rules
- the API already sends that suffix to the generator
- each card records the exact `promptUsed`
- image history and revert behavior already exist
- cards can be locked before a batch regeneration

The Group flyer pipeline also proves the underlying interaction pattern:

- editable per-campaign variation axes
- editable negation rules
- saved generation controls
- one direction applied to each generated rendition

The Deal upgrade should reuse this operating idea without coupling the two data models.

## 3. Recommended Operator Experience

Add a new **Creative Direction** panel between the existing Image Prompt Template and Negation panels.

The panel shows:

1. the AI-recommended style
2. a one- or two-sentence explanation of why it fits this campaign
3. all available style presets as selectable chips or cards
4. the currently active style
5. a `Restore AI recommendation` action after an operator override
6. a `Recommend again` action for an explicit fresh decision

Suggested display:

```text
Creative Direction

AI recommendation: Quiet Luxury
Why: This campaign emphasizes Oceania's smaller-ship atmosphere, longer
itinerary, dining, and lower-crowd experience. A restrained editorial
presentation supports that promise better than a high-energy discount flyer.

[Current Vivid Flyer] [Clean Travel Magazine] [Retro Screenprint]
[Bold Type-First] [Quiet Luxury] [Cut-Paper Collage]
[Documentary Travel]

Active style: Quiet Luxury
Selection source: AI recommended

[Restore AI recommendation] [Recommend again]
```

### Spend behavior

Changing the selected style must not automatically regenerate images.

The operator should:

1. review or change the selected style
2. lock any cards that should remain unchanged
3. press `Generate all 4`, `Generate unlocked`, or generate one card

This preserves the existing image-spend checkpoint and prevents an exploratory UI click from creating new assets.

## 4. Intelligent Default Style Decision

### Recommended decision point

Make the AI default-style decision during Step 8 synthesis initialization, after the selected Funnel Synthesis has been loaded and before the new Meta Ad Synthesis is saved.

This is the best point because the system can see:

- resolved Deal and sailing identity
- campaign angle and visual angle
- selected audience and targeting language
- carousel headlines and primary text
- destination and itinerary character
- ship and cruise-line positioning
- public-safe promotion emphasis
- the amount and density of information on the four cards
- styles recently used by other Deal campaigns

Making the decision earlier would provide less creative context. Making it during image generation would hide the decision from the operator and repeat the LLM call unnecessarily.

### LLM Gateway route

Use the shared LLM Gateway only.

Recommended task routing:

```ts
modelForTask("decision")
```

Use `generateStructuredObject` with the selected gateway model. Do not reference a raw provider model id in the Deal feature.

This is a bounded selection task, not open-ended art-direction generation. The model receives the controlled preset catalog and returns one preset id plus a short rationale.

### Why the model selects a preset instead of writing a free-form prompt

The AI should choose from the approved preset catalog. It should not invent an unrestricted style prompt as the persisted default.

This gives the system:

- predictable operator controls
- testable prompt output
- safer factual boundaries
- stable preset ids
- easier analytics
- intentional variety without random visual chaos
- the ability to improve a preset centrally without rewriting every synthesis

The model supplies judgment. The preset library supplies the actual prompt language.

### Decision inputs

The selector should receive a concise structured context object:

```ts
interface DealMetaStyleDecisionContext {
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
```

Only public-safe promotion language should enter this decision context. Agent-only promotion instructions must remain excluded.

### Decision criteria

The selector prompt should rank the presets using these priorities:

1. campaign and audience fit
2. legibility for the amount of card copy
3. emotional match to the sailing and offer
4. truthful representation of the campaign angle
5. distinctness from recently used campaign styles
6. feasibility for a square social ad

Fit wins first. When two or more styles are similarly appropriate, prefer the style used less recently.

The system should not force variety when it harms the campaign. For example, `Quiet Luxury` may remain the right answer for two consecutive premium small-ship campaigns. The rationale should make that visible.

### Recent-style diversity context

Pass the active style ids from the most recent five completed or saved Deal Meta syntheses.

The decision instruction should say:

```text
Recent style usage is a diversity signal, not a prohibition. Choose the
best-fitting style for this campaign. When two styles fit similarly well,
prefer the one used less recently.
```

This creates intelligent rotation without requiring a rigid round-robin system.

### Structured decision result

```ts
interface DealMetaStyleRecommendation {
  recommendedStyleId: DealMetaAdStylePresetId;
  rationale: string;
  confidence: "high" | "medium" | "low";
  generatedAtIso: string;
  modelTask: "decision";
}
```

The rationale should be operator-facing, concise, and based only on the supplied context.

### Failure behavior

If the style decision call fails:

- initialize the synthesis with `current_vivid_flyer`
- record a non-blocking warning
- show `Default fallback` as the selection source
- keep the operator free to select any preset
- do not block carousel image generation

The current visual treatment remains a safe fallback because it is already producing usable ads.

## 5. Data Contract

Add a controlled preset id type:

```ts
export type DealMetaAdStylePresetId =
  | "current_vivid_flyer"
  | "clean_travel_magazine"
  | "retro_screenprint"
  | "bold_type_first"
  | "quiet_luxury"
  | "cut_paper_collage"
  | "documentary_travel";
```

Extend `DealMetaAdSynthesis`:

```ts
export interface DealMetaAdSynthesis {
  // Existing fields remain unchanged.
  recommendedStyleId: DealMetaAdStylePresetId;
  selectedStyleId: DealMetaAdStylePresetId;
  styleRecommendation?: DealMetaStyleRecommendation;
  styleSelectionSource: "ai_recommended" | "operator" | "fallback";
  styleSelectedAtIso: string;
}
```

Keep `recommendedStyleId` separate from `selectedStyleId`.

This lets the operator:

- see what AI originally recommended
- override it without erasing the recommendation
- restore the recommendation later
- distinguish AI, operator, and fallback selections

### Existing synthesis compatibility

For a synthesis created before this upgrade:

- read missing `recommendedStyleId` as `current_vivid_flyer`
- read missing `selectedStyleId` as `current_vivid_flyer`
- read missing `styleSelectionSource` as `fallback`
- do not rewrite every historical record in a migration
- persist the new fields the next time that synthesis is deliberately updated

This keeps older generated images and their recorded prompts valid.

## 6. Preset Registry

Create one central preset registry, suggested location:

```text
lib/cb/deals-system/deal-meta-ad-style-presets.ts
```

Suggested shape:

```ts
interface DealMetaAdStylePreset {
  id: DealMetaAdStylePresetId;
  label: string;
  summary: string;
  promptDirection: string;
  bestFor: string[];
}
```

The registry is the only source of prompt text for these presets. UI labels, AI selection options, prompt construction, and tests should all consume this registry.

### Preset: Current Vivid Flyer

```text
Create a vivid square cruise promotion flyer with energetic travel imagery,
bold high-contrast headline typography, clear promotional hierarchy, and
strong visual impact at social-feed size.
```

Purpose:

- preserve the current successful look
- provide backward compatibility
- remain the failure fallback

### Preset: Clean Travel Magazine

```text
Creative direction: premium travel-magazine cover. Use one dominant
full-bleed photograph, an asymmetrical editorial grid, an elegant serif
headline with restrained sans-serif details, a cream, navy, and coral
palette, and generous negative space. Do not use a montage, sticker bubbles,
circular callouts, or crowded information blocks.
```

Best suited to:

- destination-led campaigns
- cultured or mature audiences
- longer itineraries
- editorial storytelling

### Preset: Retro Screenprint

```text
Creative direction: mid-century screen-printed travel poster. Use simplified
geometric scenery, flat shapes, a four-color ink palette, slightly imperfect
paper grain, and one bold hand-lettered accent. Do not use a glossy
photoreal collage, inset photographs, promotional bubbles, or 3D effects.
```

Best suited to:

- distinctive destinations
- port-intensive itineraries
- nostalgic or playful campaign angles
- campaigns that can succeed with simplified visual storytelling

### Preset: Bold Type-First

```text
Creative direction: contemporary type-led poster. Make the oversized
headline the main visual element, supported by one tightly cropped
destination or onboard photograph, a strong diagonal grid, a two-color
palette with one bright accent, and minimal supporting copy. Do not use a
multi-photo montage, circular badges, or price-burst stickers.
```

Best suited to:

- strong short headlines
- urgency and date-led campaigns
- provocative hooks
- simple offers with one dominant message

### Preset: Quiet Luxury

```text
Creative direction: quiet-luxury editorial advertisement. Use one
art-directed destination, dining, suite, or veranda detail, generous ivory
space, a high-contrast serif headline, small restrained sans-serif labels,
and a deep navy, cream, and muted brass palette. Do not use neon gradients,
bubble badges, dense copy blocks, or a busy collage.
```

Best suited to:

- premium and small-ship products
- dining, suite, space, and service campaigns
- older or affluent audiences
- calm escape and refinement angles

### Preset: Cut-Paper Collage

```text
Creative direction: tactile cut-paper travel collage. Use layered colored
paper, torn edges, abstract postcard and map shapes, subtle risograph grain,
a playful but controlled composition, and three or four muted colors. Do
not use glossy 3D treatment, a stock-photo montage, neon gradients, or
invented readable travel information.
```

Best suited to:

- multigenerational and social campaigns
- varied itineraries
- playful savings or planning angles
- campaigns that need energy without the current glossy flyer treatment

### Preset: Documentary Travel

```text
Creative direction: candid photojournalistic travel advertisement. Use one
authentic human moment, natural available light, subtle film grain, a
restrained caption band, and clean documentary typography. Do not use staged
promotional smiles, multiple inset photographs, badges, or glossy composite
effects.
```

Best suited to:

- emotional reset campaigns
- solo, couple, or multigenerational human stories
- experience-led campaigns
- trust and authenticity angles

## 7. Prompt Composition

Replace ad hoc prompt assembly with one pure prompt builder:

```text
buildDealMetaAdImagePrompt
```

Recommended order:

```text
1. generation objective and square format
2. factual card headline and primary text
3. selected campaign-wide creative-direction preset
4. carousel-coherence instruction
5. operator/global negation rules
6. factual-integrity instruction
```

Example:

```text
Generate one square Meta carousel ad image for this cruise campaign.

Headline:
Mid-January. You Need This.

Primary text:
The holidays drained you and winter has barely started. Eight adults-only
nights from Miami - your grown-up reset button.

Creative direction:
Quiet-luxury editorial advertisement. Use one art-directed destination,
dining, suite, or veranda detail, generous ivory space, a high-contrast serif
headline, small restrained sans-serif labels, and a deep navy, cream, and
muted brass palette. Do not use neon gradients, bubble badges, dense copy
blocks, or a busy collage.

Carousel system:
Keep this card visually consistent with the same campaign style family while
allowing its focal composition to respond to this card's message.

Global exclusions:
Do not display the entire ship.
Do not add QR codes.
Do not add web links.

Factual integrity:
Do not invent prices, dates, ports, amenities, promotions, logos, or claims.
Use only information supplied above.
```

The final prompt should continue to be recorded in `card.promptUsed`.

## 8. API Behavior

### Initialize synthesis

For `POST action: "init"`:

1. load the Funnel Synthesis
2. load the richest available Deal context through existing store helpers
3. inspect recent saved style selections
4. if no existing synthesis has a recommendation, call the style selector once
5. set both recommended and selected style ids to the AI result
6. if the call fails, use the fallback
7. preserve existing generated cards and existing operator selection when reloading an existing synthesis
8. save the synthesis

Do not make a new style decision merely because the operator reopened the page.

### Update selected style

Add a narrow action:

```text
POST action: "update_style"
```

Input:

```ts
{
  synthesisId: string;
  selectedStyleId: DealMetaAdStylePresetId;
}
```

Behavior:

- validate the id against the central registry
- update `selectedStyleId`
- set `styleSelectionSource` to `operator`
- update `styleSelectedAtIso`
- do not regenerate images

### Restore recommendation

This can reuse `update_style` with `recommendedStyleId`, while setting the source to `ai_recommended`.

### Recommend again

Add an explicit action:

```text
POST action: "recommend_style"
```

Behavior:

- run the AI decision again
- replace the recommendation and rationale
- set the new recommendation as active only after explicit operator confirmation, or make the UI state clearly explain that it will become active
- do not regenerate images

Recommended first implementation: show the new recommendation and require the operator to press `Use recommendation`.

## 9. Carousel Coherence

Use one selected style across all four cards in a single carousel.

Do not randomly assign a different preset to each card. That would solve monotony across campaigns by creating inconsistency inside campaigns.

The image model may vary:

- focal subject
- image crop
- destination versus onboard emphasis
- text placement
- amount of negative space

It should preserve:

- typography family
- palette family
- texture and material language
- overall advertising era
- level of visual energy

A later enhancement may add controlled per-card composition roles, but it is not required for this upgrade.

## 10. Relationship to Global Negations

Creative direction and negation rules serve different purposes:

- Creative Direction says what the ad should be.
- Negation says what must not appear.

Keep them as separate UI panels and separate prompt sections.

The existing global negations remain useful:

- do not display the entire ship
- do not add QR codes
- do not make up information not presented
- do not add web links

Preset-specific exclusions belong in the preset. Cross-campaign safety exclusions belong in the global Negation panel.

## 11. Proposed Code Touchpoints

Primary files:

```text
lib/cb/deals-system/deal-meta-ad-synthesis-types.ts
lib/cb/deals-system/deal-meta-ad-synthesis-generator.ts
app/api/tests/deals-system/meta-ad-synthesis/route.ts
app/(tests)/tests/deals-system/meta-ad-synthesis/meta-ad-synthesis-view.tsx
lib/cb/deals-system/validate.ts
```

Suggested new files:

```text
lib/cb/deals-system/deal-meta-ad-style-presets.ts
lib/cb/deals-system/deal-meta-ad-style-selector.ts
lib/cb/deals-system/deal-meta-ad-prompt.ts
lib/cb/deals-system/__tests__/deal-meta-ad-style-selector.test.ts
lib/cb/deals-system/__tests__/deal-meta-ad-prompt.test.ts
```

Use existing store and gateway helpers. Do not add a second persistence system or call provider SDKs directly.

## 12. Validation and Tests

### Preset registry

- every preset id is unique
- every label is non-empty
- every prompt direction is non-empty
- `current_vivid_flyer` always exists
- validation rejects unknown style ids

### AI selector

- structured output accepts only registered preset ids
- recent usage is included as context
- public-safe campaign context is included
- agent-only promotion notes are excluded
- selector failure returns the current vivid fallback
- reopening an existing synthesis does not repeat the decision call

### Synthesis persistence

- AI recommendation and selected style are saved separately
- operator override does not erase the AI rationale
- restore returns to the recommended id
- legacy syntheses read safely without a migration

### Prompt builder

- includes headline exactly once
- includes primary text exactly once
- includes the active preset direction
- includes enabled global negations
- includes factual-integrity instructions
- excludes an inactive preset
- records the exact assembled prompt in `promptUsed`

### Generation behavior

- changing style does not generate an image
- generating one card uses the active style
- generate-all uses the same active style for all unlocked cards
- locked cards remain unchanged
- changing style after prior generation preserves image history
- revert still restores the earlier image and prompt

### UI

- AI recommendation and rationale are visible
- active style is unmistakable
- operator override is one click
- selection source is visible
- restore recommendation is available after override
- recommend-again does not silently spend on images
- generated cards continue to show the prompt actually used

## 13. Acceptance Criteria

The upgrade is complete when:

1. A new Meta Ad Synthesis receives one AI-recommended preset through the LLM Gateway.
2. The recommendation uses campaign, audience, carousel, itinerary, promotion, and recent-style context where available.
3. The recommendation and its rationale are visible before image generation.
4. The operator can select a different preset without editing prompt prose.
5. Changing the preset does not automatically generate or replace images.
6. All four cards use the selected campaign-wide style.
7. The exact final prompt remains recorded per generated card.
8. Existing lock, history, revert, and distribution behavior still works.
9. Existing syntheses remain readable without a bulk migration.
10. AI failure falls back to the current successful vivid-flyer treatment.
11. No raw model id is introduced outside the LLM Gateway.
12. No factual, approval, promotion, media-readiness, or publication gate is weakened.

## 14. Recommended Implementation Order

### Phase 1 - Controlled presets and prompt builder

- add preset ids and central registry
- add the pure prompt builder
- add contract validation and unit tests
- preserve current vivid flyer as the default

### Phase 2 - AI recommendation

- add the LLM Gateway selector
- gather concise campaign context
- include recent style usage
- persist recommendation, rationale, selected style, and source
- add fallback behavior

### Phase 3 - Operator controls

- add the Creative Direction panel
- add update, restore, and recommend-again actions
- keep generation explicit
- show active style and selection source

### Phase 4 - Verification

- exercise new and legacy syntheses
- generate controlled comparisons with operator approval
- compare campaigns using different presets
- confirm carousel coherence and prompt history
- run the relevant Deal tests and TypeScript validation

## 15. Deferred Enhancements

These ideas are useful but should not expand the first implementation:

- AI-selected per-card composition roles
- thumbnail previews for each style preset
- style-performance reporting from Meta results
- automatic preference learning from operator overrides
- a shared Group-and-Deal preset registry
- style selection for Google Responsive Display images
- campaign-specific custom preset creation

The first version should prove that controlled, intelligently selected direction breaks visual monotony while remaining easy for the operator to understand and change.
