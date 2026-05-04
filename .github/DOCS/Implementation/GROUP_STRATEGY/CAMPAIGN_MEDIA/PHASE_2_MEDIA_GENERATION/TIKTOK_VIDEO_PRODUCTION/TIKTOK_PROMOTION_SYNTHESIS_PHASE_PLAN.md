# TikTok Promotion Synthesis Phase Plan

**Status:** implemented
**Intent:** document the now-implemented late-stage TikTok promotion synthesis step that extracts beat copy from an already-developed campaign and feeds that package into the reusable TikTok template renderer.

## 1. Outcome

This phase is now part of the TikTok production path.

The pipeline no longer has to rely only on a tiny brief-era text bundle for the static-package TikTok render. It now has a dedicated late-stage synthesis step that can generate a `tiktokPromotionPackage`, persist it on the media manifest, and pass it into the TikTok renderer before `tiktok_seed_video` generation.

## 2. Why This Phase Was Added

The production TikTok package system became visually strong before its text layer was strong enough.

The prior issue was that TikTok copy tended to recycle a very small set of early fields:

- `heroSlogan`
- `subSlogan`
- `elevatorPitch`
- one TikTok hook
- one narrative title
- one CTA

That was enough to make the render function, but not enough to produce a lively 6-8 beat promotional package.

The stronger pattern seen in the board-game sandbox was different:

- the campaign had already gone through substantial creative development
- the agent improvised late, from a richer campaign body
- the resulting beats sounded more varied, sharper, and more persuasive

This phase formalizes that better behavior inside production.

## 3. Product Decision

TikTok promotional copy is now treated as a late-stage synthesis layer, not purely as an early brief prediction problem.

The campaign brief still provides ingredients, but the TikTok package can now derive final beat language after the campaign already has:

- approved brief
- production bible
- scene-library language
- storyboard narration and emotional beats
- downstream campaign copy

## 4. Implemented Contract

The implementation introduced a TikTok-specific derived package:

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

## 5. Current Behavior

### A. Schema and manifest

The media manifest now supports `tiktokPromotionPackage`.

### B. Synthesis step

The media orchestrator now generates the package before TikTok render when:

- a TikTok storyboard exists
- `tiktok_seed_video` is being generated
- video credits are available
- no existing package is already present on the manifest

### C. Renderer integration

The static-package TikTok renderer now requires the synthesized package and uses its beat content as the single production copy source.

### D. Failure rule

If synthesis fails or the package is missing, the TikTok render should fail. It should not fall back to older brief-field-based copy.

## 6. Implemented Source Priority

The synthesis pass is intended to pull from the mature campaign state, especially:

1. storyboard narration segments and emotional beats
2. scene-library descriptions and campaign-specific proof language
3. brief messaging, community expression, and social concepts

The package renderer now renders from the synthesized beat package instead of falling back to earlier brief fields.

## 7. Code Locations

Current implementation lives primarily in:

- `lib/campaigns/schema.ts`
- `lib/campaigns/media/generators/tiktok-promotion-synthesis.ts`
- `lib/campaigns/media/media-orchestrator.ts`
- `lib/campaigns/media/generators/tiktok-seed-generator.ts`
- `lib/campaigns/media/generators/tiktok-formats/package-template.ts`

## 8. What This Phase Achieved

- TikTok beat language can now be refined later in the process
- the reusable visual template system stays intact
- beat copy can be persisted and reused from the manifest
- the TikTok renderer can consume distinct synthesized beats instead of always repeating early slogans

## 9. Remaining Follow-Up Opportunities

This phase is implemented, but follow-up refinement may still be useful:

- expose the synthesized package more clearly in review UI
- broaden the synthesis input set to include more downstream copy or designed-ad language when needed
- add tests specific to synthesis-package failure behavior and beat diversity
- update any remaining stale documentation or review workflows that still describe this as future work

## 10. Historical Note

This file originally described the proposed phase before implementation. It now serves as the implementation-state summary for the feature that was added.
