# TikTok Promotion Synthesis Agent Handoff

**Status:** implemented feature handoff
**Use this as a maintenance and extension handoff, not as a greenfield implementation brief.**

## Mission

Understand, verify, and extend the existing late-stage TikTok promotion synthesis phase without rebuilding it from scratch.

## What Is Already Implemented

The repo now contains a working late-stage `tiktokPromotionPackage` flow that:

- defines a TikTok promotion beat schema
- stores the synthesized package on the media manifest
- generates the package before TikTok render when needed
- passes the package into the static-package TikTok renderer
- fails the TikTok render if synthesis is missing or fails

## Current Problem Solved

The original problem was that the TikTok package renderer was visually strong but its copy source was too narrow. It relied too heavily on a small set of brief-level fields, which created repeated overlays and monotonous narration.

That implementation gap has now been addressed locally.

## Current Code Touchpoints

The current implementation is centered in:

- `lib/campaigns/schema.ts`
- `lib/campaigns/media/generators/tiktok-promotion-synthesis.ts`
- `lib/campaigns/media/media-orchestrator.ts`
- `lib/campaigns/media/generators/tiktok-seed-generator.ts`
- `lib/campaigns/media/generators/tiktok-formats/package-template.ts`

## Current Behavior

### 1. Contract

The feature introduces:

```ts
type TikTokPromotionBeat = {
  role: 'hook' | 'proof' | 'social' | 'payoff' | 'cta';
  headline: string;
  subline: string;
  spokenText: string;
  badge?: string;
  cta?: string;
  sceneHint?: string;
};

type TikTokPromotionPackage = {
  synthesizedAt: string;
  strategySummary: string;
  extractionNotes: string[];
  beats: TikTokPromotionBeat[];
};
```

### 2. Generation point

The package is generated in the media orchestrator before storyboard-driven TikTok render when:

- a TikTok storyboard exists
- `tiktok_seed_video` is part of the requested generation
- video generation is otherwise allowed to proceed
- no existing promotion package is already present on the manifest

### 3. Renderer consumption

The static-package template system prefers the synthesized beat package when available.

### 4. Failure behavior

If the package is absent or synthesis fails, the renderer should stop the TikTok render rather than inventing backup copy.

## What A Future Agent Should Not Do

- do not re-implement the feature from scratch
- do not move this back into a purely early-brief problem
- do not assume the plan file is still a proposal; the feature is already in code

## What A Future Agent May Need To Do

- improve beat quality or source prioritization
- expose the synthesized package more clearly in review UI
- add tests
- expand inputs to include more downstream copy or designed-ad language
- tighten synthesis validation if repetition remains

## Verification Checklist

If you are validating or extending this feature, confirm all of the following:

1. `tiktokPromotionPackage` exists in the schema and manifest.
2. the orchestrator generates or reuses the package before TikTok render.
3. the TikTok render path receives the package.
4. the package-template builder prefers synthesized beats when present.
5. TikTok generation fails clearly when no package is present.

## Recommended Next Steps For Maintenance

- add or improve tests around synthesis-package generation and failure behavior
- surface the synthesized beat package in a review surface if it is not visible enough yet
- update any lingering future-tense documentation if more stale references are found

## Historical Note

This file originally served as a forward-looking implementation handoff. It now serves as a maintenance handoff for an implemented feature.
