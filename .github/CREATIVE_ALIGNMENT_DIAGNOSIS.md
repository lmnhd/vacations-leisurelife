# Creative Alignment Diagnosis

## Why This Exists

The designed ad artifact system is an improvement. The ads now read more like ads, and the type-led variants are noticeably stronger than the earlier "whole scene" outputs.

But the system is still failing in a more upstream way:

- the ad shell is getting better
- the image ingredients are getting cleaner
- the campaign identity is still not reliably making it into the image world

This is not just an image prompt problem.
This is a creative alignment problem that begins before prompt writing.

## The Current Failure

The system can now produce structured media that looks coherent, but some campaigns still feel emotionally off.

Example failure pattern:

- Headline: `Rock the Waves, Feel the Beat`
- Layout: structured ad, more believable than before
- Image module: quiet amber balcony, drink on table, contemplative deck mood

That output is not awkward in the old way.
It is awkward in a new way:

- the message says energetic, rhythmic, nostalgic, social
- the image says premium, calm, reflective, slow

So the issue is no longer "AI generated scene trying too hard."
The issue is "campaign language and campaign imagery are not in the same emotional key."

## What Is Actually Going Wrong

### 1. Discovery can still define a niche in programming terms instead of experiential terms

The discovery blueprint is capable of producing useful fields like:

- `nicheExpressionMode`
- `allowedThemeSignals`
- `optionalGatheringMoments`
- `cruiseNativeMoments`

That is good.

But in practice, some campaigns are still being described too much through:

- highlight events
- activity lists
- surface theme signals
- broad vibe words

This can create a campaign that is legible in concept, but not legible as a lived atmosphere.

The result is a blueprint that knows what happens on the cruise, but not what the cruise should feel like in images.

### 2. The aesthetic brief can preserve keywords while losing emotional specificity

The brief layer has strong structure and many rules in [aesthetic-engine.ts](/abs/path/c:/Users/cclem/Dropbox/Source/Projects-24/Leisure_Life_Interactive/lib/campaigns/aesthetic-engine.ts), including music-campaign protections.

But the current brief format still allows this failure mode:

- slogan contains the right signal words
- imagery mood contains nice-sounding mood language
- composition notes mention crowd or stage adjacency
- actual downstream image behavior still defaults toward generic premium travel calm

Why?

Because the brief currently emphasizes content coverage more than emotional coherence.
It can say "music" without deciding whether the image world should feel:

- kinetic
- intimate
- rowdy
- polished
- subcultural
- ceremonial
- playful
- after-hours

That missing choice is load-bearing.

### 3. The current design-system layer starts after meaning has already collapsed

The new designed media pipeline is downstream.

It does a better job with:

- ad composition
- token extraction
- typography
- aspect-ratio-specific layouts
- separating ingredient images from finished ads

But it still depends on upstream inputs that may already be emotionally muddled.

So even a better prompt taxonomy can only partially help.

If the system receives:

- generic headline
- generic subhead
- vague imagery mood
- weak prop signals
- no explicit emotional mode

then it will still produce a better-organized version of the wrong campaign world.

### 4. The default documentary mode still has a strong "premium travel calm" gravity

Even with the recent energy-profile patch, the image-module system still naturally falls toward:

- golden hour
- warm wood
- quiet deck
- tasteful table
- premium cruise calm

That visual language is strong for some campaigns.
It is wrong for others.

This means the system needs more than "documentary detail" prompts.
It needs campaign-world modes that alter:

- light behavior
- social density
- prop family
- spatial tension
- pace
- degree of polish
- what to explicitly avoid

## The Missing Layer

The system needs a new upstream control layer:

## Campaign Energy and Identity Blueprint

This layer should sit between discovery and aesthetic execution.

Its job is to answer:

1. What emotional register should this campaign live in?
2. What evidence makes that register visible?
3. What visual defaults should be banned for this campaign?
4. What kind of ad artifacts should dominate?

Without this layer, the pipeline keeps solving for "technically plausible themed cruise" instead of "emotionally specific campaign world."

## Proposed Data Model

Add a deterministic or lightly model-assisted profile such as:

```ts
type CampaignEnergyMode =
  | 'calm_contemplative'
  | 'warm_social'
  | 'nostalgic_kinetic'
  | 'after_hours_electric'
  | 'refined_premium'
  | 'subcultural_intimate'
  | 'playful_collective';
```

And attach a structured profile:

```ts
interface CampaignIdentityBlueprint {
  energyMode: CampaignEnergyMode;
  emotionalPromise: string;
  socialScale: 'solo_pair' | 'pair_small_group' | 'mixed' | 'crowd_ok';
  imageBehavior: string[];
  propFamilies: string[];
  forbiddenDefaults: string[];
  lightBehavior: string[];
  materialBias: string[];
  copyBehavior: string[];
  adFormatBias: string[];
  evidenceOfBelonging: string[];
}
```

## What This New Layer Should Control

### Emotional promise

Not just what the campaign is about, but what the media should make a viewer feel.

Examples:

- "You can feel the ship pulsing with your kind of people."
- "This is private-knowledge luxury, not loud spectacle."
- "This is a warm collector world, not a polished mainstream cruise ad."

### Social scale

Some campaigns should feel:

- solo and observant
- paired and intimate
- socially buzzing
- after-hours crowded

Right now the system does not control this strongly enough.

### Prop family

The system should not just allow niche props.
It should decide which prop family belongs to the campaign.

For `Vintage Rock 'n' Roll Cruise`, better prop families are:

- record sleeve
- guitar pick
- leather jacket on chair
- retro sunglasses
- ticket stub feel
- amp-cable residue
- dance-floor light reflection

Not:

- mug on quiet table
- folded towel
- generic notebook
- spa-coded balcony setup

### Forbidden defaults

Each campaign needs explicit anti-defaults.

For example:

- no spa retreat mood
- no breakfast balcony serenity
- no meditative solo horizon gaze as dominant image family
- no generic premium travel lounge if the campaign promise is musical/social

### Ad format bias

Some campaigns should be more type-led.
Some should be more artifact-led.
Some can carry a stronger photo module.

The system should choose this upstream.

For high-energy music campaigns, the best artifact pack may be:

- one strong type-only hook card
- one gritty quote card
- one flyer-like schedule card
- one cropped detail photo with stronger contrast
- one poster-like cover

Instead of assuming every campaign needs a trust-photo-centered editorial cover.

## Specific Diagnosis For The Current Plan

The current plan in [WORK2.txt](/abs/path/c:/Users/cclem/Dropbox/Source/Projects-24/Leisure_Life_Interactive/.github/WORK2.txt) is still too media-layer-first.

It correctly improves:

- rendering
- templates
- artifact composition
- image-module prompt structure

But it does not yet fully solve:

- campaign-energy selection
- emotional-mode enforcement
- mismatch detection between slogan and image world
- format bias by campaign type

So if implemented as-is, it can still produce polished misalignment.

## What Must Change In The Plan

### Add a new Phase 0 before further media expansion

Before broadening template families further, add:

- `CampaignIdentityBlueprint`
- `energyMode` inference
- `forbiddenDefaults`
- `adFormatBias`
- `propFamilies`
- `socialScale`

This should be generated from existing discovery + brief fields first, with optional LLM support only if deterministic rules are insufficient.

### Add a mismatch validator

Introduce a validator that flags contradictions like:

- energetic slogan + serene image behavior
- subcultural campaign + polished corporate copy
- intimate campaign + crowd-heavy scene language
- premium campaign + noisy poster/collage treatment

This should fail or warn before media generation.

### Split documentary prompts by campaign mode, not just by asset kind

`trust_photo`, `artifact_still_life`, and `motion_plate` are not enough by themselves.

Each asset kind needs mode-specific behavior.

Example:

- `trust_photo + refined_premium`
- `trust_photo + nostalgic_kinetic`
- `artifact_still_life + subcultural_intimate`

Otherwise the system keeps drifting toward one default documentary taste.

### Route ad packs by campaign identity, not only by niche temperature

Temperature is useful but incomplete.

A `warm` campaign and an `after_hours_electric` campaign should not share the same artifact logic.

The router should consider:

- energy mode
- social scale
- copy sharpness
- trust-image dependence
- typography dominance

### Add campaign-specific anti-defaults to image prompts and review UI

Prompts should carry anti-defaults.
The review surface should expose them too.

That way a reviewer can clearly judge:

- did this asset violate the campaign's forbidden defaults?
- did it visually express the intended energy mode?

## Recommended Immediate Implementation Sequence

### Step 1

Add `CampaignIdentityBlueprint` generation and storage to the brief pipeline.

Likely touchpoints:

- [aesthetic-engine.ts](/abs/path/c:/Users/cclem/Dropbox/Source/Projects-24/Leisure_Life_Interactive/lib/campaigns/aesthetic-engine.ts)
- [schema.ts](/abs/path/c:/Users/cclem/Dropbox/Source/Projects-24/Leisure_Life_Interactive/lib/campaigns/schema.ts)
- [brief-engine/validation.ts](/abs/path/c:/Users/cclem/Dropbox/Source/Projects-24/Leisure_Life_Interactive/lib/campaigns/brief-engine/validation.ts)

### Step 2

Thread the identity blueprint into:

- design-system token extraction
- documentary image-module prompt building
- ad-system routing
- review labels and diagnostics

Likely touchpoints:

- [design-system/niche-tokens.ts](/abs/path/c:/Users/cclem/Dropbox/Source/Projects-24/Leisure_Life_Interactive/lib/campaigns/design-system/niche-tokens.ts)
- [design-system/documentary-prompts.ts](/abs/path/c:/Users/cclem/Dropbox/Source/Projects-24/Leisure_Life_Interactive/lib/campaigns/design-system/documentary-prompts.ts)
- [media-review-panel.tsx](/abs/path/c:/Users/cclem/Dropbox/Source/Projects-24/Leisure_Life_Interactive/app/(tests)/tests/media-generation/media-review-panel.tsx)

### Step 3

Teach the review UI to show the intended mode beside the generated asset.

Example:

- `energyMode: nostalgic_kinetic`
- `forbiddenDefaults: spa retreat, breakfast balcony serenity`

That turns review from "do I like this?" into "is this faithful to the campaign world?"

## How To Think About Success

Success is not:

- cleaner prompts
- more plausible props
- nicer layouts

Success is:

- the ad shell, image module, and copy all feel like the same campaign
- different campaigns no longer collapse toward the same premium-cruise visual center
- a viewer can infer the social world of the campaign from the artifact pack itself

## Simple Summary

The system has moved from "awkward image generation" to "misaligned campaign translation."

That is progress.

The next milestone is not better rendering.
It is better alignment between:

- discovery
- brief
- identity blueprint
- image behavior
- ad artifact choice

Until that layer exists, the pipeline will keep producing better-made versions of partially wrong campaign worlds.
