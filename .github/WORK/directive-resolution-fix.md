---
description: Fix directive resolution agent to properly handle scene-specific directives
---

# Fix Directive Resolution Agent — `lib/campaigns/directive-agent.ts`

## Problem (Verified in Production — May 2026)

When a directive targets a specific scene (e.g. "Change the atrium scene to show a multigenerational group with a piece-heavy board game"), the resolution agent **misinterprets it as a landing still** and produces `stillPatches` instead of `scenePatches`.

**Symptoms:**
- Created directive has `scope` missing `scenes`
- `patch.scenePatches` is empty or missing
- `patch.stillPatches` is populated with scene-like descriptions
- `affectedAssetIds` contains hero stills, concepts, and ads — **not** the actual scene image

**Root Cause:**
1. `briefSummaryForAgent()` does **not** include `sceneLibrary` from the production bible. The resolution LLM has no knowledge of which `sceneId` values exist.
2. The LLM instructions do **not** explicitly tell the agent when to use `scenePatches` vs `stillPatches`.
3. The resolution agent conflates "scene" (production bible `sceneLibrary`) with "still" (landing still bible) because both are photographic compositions and the prompt gives no disambiguation signal.

## Required Fix

### 1. Add `sceneLibrary` to `briefSummaryForAgent`

In `briefSummaryForAgent`, add a `sceneLibrary` field alongside `stillLibrarySample`:

```typescript
function briefSummaryForAgent(brief: CampaignAestheticBrief): Record<string, unknown> {
    const plausibility = brief.visual.plausibilityFramework;
    return {
        themeName: brief.themeName,
        aestheticLabel: brief.visual.aestheticLabel,
        imageryMood: brief.visual.imageryMood,
        heroSlogan: brief.messaging.heroSlogan,
        currentAllowedProps: plausibility.allowedProps,
        currentDiscouragedProps: plausibility.discouragedProps,
        currentNicheEnhancedMoments: plausibility.nicheEnhancedMoments,
        currentPropFamilies: brief.identityBlueprint?.propFamilies ?? [],
        stillLibrarySample: (brief.landingStillBible?.stillLibrary ?? [])
            .slice(0, 6)
            .map((s) => ({ stillId: s.stillId, usage: s.usage, imagePrompt: s.imagePrompt })),
        sceneLibrary: (brief.productionBible?.sceneLibrary ?? [])
            .map((s) => ({
                sceneId: s.sceneId,
                location: s.location,
                timeOfDay: s.timeOfDay,
                lighting: s.lighting,
                cameraAngle: s.cameraAngle,
                subjectAction: s.subjectAction,
                environmentDetails: s.environmentDetails,
                mood: s.mood,
            })),
    };
}
```

**Critical:** Include all fields that help the resolution agent distinguish scenes: `sceneId`, `location`, `timeOfDay`, `lighting`, `cameraAngle`. Do not include `imagePrompt` here — that is what the directive will overwrite.

### 2. Update LLM instructions with explicit scene vs still disambiguation

In the `resolveDirective` prompt `instructions` array, add these two instructions:

```typescript
        instructions: [
            'You are an expert campaign art director resolving an editorial directive into concrete field overrides.',
            'Read the directive text and the current brief state, then produce a DirectivePatch that implements the intent.',
            'Be specific: if the directive says "use Azul, Catan, Ticket to Ride" then allowedProps must name those games as concrete physical props with placement context.',
            // NEW — scene vs still disambiguation:
            'CRITICAL DISTINCTION — scenePatches vs stillPatches:',
            '  - Use scenePatches ONLY when the directive describes changes to a specific scene setting (location, timeOfDay, lighting, environmentDetails, mood) or to people/props within a named scene (e.g. "atrium scene", "pool deck shot").',
            '  - Use stillPatches ONLY when the directive describes changes to a landing still (hero image, concept still, or advertising still) identified by stillId.',
            '  - sceneLibrary contains real ship locations (atrium, pool_deck, dining, nightclub, spa, etc.). stillLibrary contains marketing stills (still-01, still-02, etc.).',
            '  - If the directive names a location that exists in sceneLibrary (e.g. "atrium", "pool deck", "sports deck"), it is a scene directive — produce scenePatches with the matching sceneId.',
            '  - If the directive names a stillId (e.g. "still-03"), it is a still directive — produce stillPatches.',
            'stillPatches: rewrite imagePrompt fields only for stills where the directive clearly applies. Copy stillId exactly from stillLibrarySample.',
            'scenePatches: rewrite imagePrompt fields for scenes where the directive clearly applies. Copy sceneId exactly from sceneLibrary.',
            'If a field is not affected by this directive, omit it entirely — do not include empty arrays.',
            'nicheEnhancedMoments should describe specific physical scenes, not event names.',
            `Valid scope values: ${scopeValues}`,
        ],
```

### 3. Add examples to the prompt

Add an `examples` field to the prompt showing a correct scene directive resolution:

```typescript
        examples: [
            {
                directive: 'Change the atrium scene to show a multigenerational group with a piece-heavy board game instead of cards',
                reasoning: 'Directive names a location ("atrium") that exists in sceneLibrary with sceneId "atrium". This is a scene directive, so scenePatches is used.',
                patch: {
                    scenePatches: [
                        {
                            sceneId: 'atrium',
                            imagePrompt: 'Ship atrium, sunset, glowing sunset light. Over-the-shoulder view of a multigenerational group gathered around a large wooden table... [full revised prompt]',
                        },
                    ],
                },
            },
        ],
```

## Verification Steps

After implementing the fix, verify it with the following test directive:

```powershell
$body = @{ text = "Change the atrium scene to show a multigenerational group with a piece-heavy board game instead of cards" } | ConvertTo-Json
$directive = Invoke-RestMethod -Uri "http://localhost:3000/api/groups/campaign/board-games-at-sea/directives" -Method POST -ContentType "application/json" -Body $body

# Assert:
# - $directive.scope MUST contain "scenes"
# - $directive.patch.scenePatches MUST contain at least one entry with sceneId = "atrium"
# - $directive.patch.stillPatches MUST NOT contain atrium-related descriptions
# - $directive.affectedAssetIds MUST contain at least one scene image asset (img_scene_atrium_*)
```

## Do NOT

- Do NOT change `inferScopeFromPatch` — it already correctly infers `scenes` when `scenePatches` is present.
- Do NOT change `patchBriefForDirective` — it already correctly applies `scenePatches` to `productionBible.sceneLibrary`.
- Do NOT change the API routes — the bug is upstream in resolution, not in apply/collection logic.

## Files to Modify

- `lib/campaigns/directive-agent.ts` — Only file that needs changes.

## Test Campaign

`board-games-at-sea` has a confirmed `sceneLibrary` with `sceneId: "atrium"` and a reproducible failure case. Use it for verification.
