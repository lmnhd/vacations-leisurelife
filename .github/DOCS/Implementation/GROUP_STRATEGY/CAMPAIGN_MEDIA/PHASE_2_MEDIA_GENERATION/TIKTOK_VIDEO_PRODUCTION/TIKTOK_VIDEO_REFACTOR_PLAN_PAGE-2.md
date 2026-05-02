# TikTok Video Refactor Plan - Page 2

**Status:** implementation addendum
**Campaign:** board-games-at-sea
**Goal:** make the scene layer visibly board-game-led while keeping the ship truthful, social, and easy for the model to render.

---

## 1. Why This Page Exists

The current pipeline is producing believable cruise scenes, but the niche signal is too soft. The ship is carrying the image, while the board-game identity and social atmosphere are fading into the background.

That is the core failure Page 2 needs to address:

- real ship authenticity is present
- real group atmosphere is underrepresented
- board-game cues are missing or too subtle
- people are absent or reduced to pure scenery

We do not want to abandon realism. We want to make the niche visible without pushing the model into hard-to-generate crowd scenes or uncanny faces.

---

## 2. What Must Change

The scene system needs two anchors at once:

1. **Ship truth** - the scene must still be a real, plausible cruise-space moment
2. **Niche truth** - the scene must visibly feel like a board-game campaign

For this campaign, the niche truth should appear through low-risk, model-friendly details:

- blurred people in the background
- over-the-shoulder framing
- partial bodies and hands-in-frame shots
- game boxes, dice, cards, meeples, score sheets, or a table in play
- candid teaching or laughing moments
- a small group cluster, not a posed crowd

The original Claude design also suggested a more promotional treatment layered on top of the imagery:

- short text overlays that carry the hook or CTA
- image-first motion, where stills are animated lightly instead of fully re-rendered
- object-level motion around the frame, like cards, dice, light shifts, and subtle parallax
- minimal on-image copy that can do useful work even when the scene is visually calm

That matters because the best result is often not a heavily animated video. It is a strong image with smart text, subtle movement, and a few emphasized objects.

The key is to make the social energy legible without requiring perfect portraiture.

---

## 3. Implementation Direction

### Scene prompts

Scene prompts should stop describing only location and light. Each scene should also include:

- a visible social action
- a board-game object family cue
- a human-presence cue
- a framing cue that avoids overly staged group shots

### Validator behavior

The validator should treat ship-only scenes as incomplete for this campaign when they lack a visible niche cue.

The scene prompt should be considered weak if it only contains:

- ship space
- ocean view
- lighting
- general mood

The scene prompt should be considered strong only when it also includes:

- at least one board-game object or interaction
- at least one human-presence cue
- a scene action that feels lived-in rather than posed

### Prompt balance

The fix is not to force more detail everywhere.
The fix is to make the correct details mandatory in the places where they matter.

That means:

- keep ship realism
- keep background people soft and non-dominant
- keep the board-game cue visible enough to read in a thumbnail
- avoid turning every scene into a full convention or tournament

---

## 4. Page 2 Agent Work Plan

### Agent 1: Scene Prompt System

**Scope:**
- `lib/campaigns/editors-room.ts`
- `lib/campaigns/brief-engine/orchestrator.ts`
- `lib/campaigns/design-system/documentary-prompts.ts`
- `lib/campaigns/design-system/alignment-validator.ts`

**Tasks:**
- add a required niche-anchor slot to scene prompt generation for board-game campaigns
- make the scene prompts explicitly request low-risk human presence
- keep ship realism as the base layer, but require a visible board-game cue
- update alignment checks so ship-only scenes with no niche signal are flagged earlier

**Success criteria:**
- every scene prompt includes both ship context and a board-game cue
- scenes can use blurred background people, over-the-shoulder framing, or partial-body views without requiring perfect faces
- generic cruise spaces no longer pass as complete scene intent for this campaign

### Agent 2: Scene Validation And Lint

**Scope:**
- `lib/campaigns/brief-engine/validation.ts`
- `lib/campaigns/media/probe-engine.ts`
- `lib/campaigns/media/media-orchestrator.ts`

**Tasks:**
- strengthen the validator so location-only scenes are rejected or escalated
- add a niche-presence check for board-game cues in `sceneLibrary`
- keep scene probes focused on the exact scene library being generated
- make probe feedback reflect missing social texture, not just missing ship realism

**Success criteria:**
- scene validation fails when the scene reads as a generic cruise postcard
- scene probes can report missing social atmosphere as a separate issue from ship plausibility
- weak scene outputs are caught before the expensive image generation step

### Agent 3: Model-Friendly Human Presence

**Scope:**
- `lib/campaigns/media/generators/stability-generator.ts`
- `lib/campaigns/media/generators/runway-generator.ts`
- `lib/campaigns/media/generators/tiktok-seed-generator.ts`

**Tasks:**
- bias the generated scene prompts toward low-risk human presence
- prefer compositions that allow blurred guests, shoulder crops, hands, and table edges
- avoid prompting for fully staged group portraits or face-critical crowd scenes
- preserve the current ship realism while making the social texture legible
- leave room for image-first promotional treatment instead of forcing every asset into full-motion animation

### Agent 4: Text Overlays And Image-First Motion

**Scope:**
- `lib/campaigns/media/generators/ad-artifact-generator.ts`
- `lib/campaigns/media/generators/tiktok-seed-generator.ts`
- `app/(tests)/tests/media-generation/*`

**Tasks:**
- add or preserve short promotional text overlays for designed ads and TikTok-supporting assets
- support light image animation as a first-class promotional style
- keep parallax, zoom, pan, and object emphasis as the default motion vocabulary
- keep text brief, legible, and useful as a hook or CTA layer

**Success criteria:**
- promotional assets can communicate even when the underlying scene is simple
- text works as part of the design, not only as a downstream copy artifact
- lightweight image animation remains a deliberate choice, not a fallback

**Success criteria:**
- the generator can render people without relying on perfect facial detail
- scenes feel inhabited rather than empty
- the board-game identity reads in the first glance, not only after close inspection

### Agent 5: Regression Coverage

**Scope:**
- `lib/campaigns/__tests__/brief-engine.validation.test.ts`
- `lib/campaigns/__tests__/aesthetic-consistency*.test.ts`
- any new scene-validation or prompt-generation tests introduced by the changes above

**Tasks:**
- add cases for board-game scenes with blurred background people and over-the-shoulder framing
- add failures for ship-only scenes that have no niche cue
- assert that the board-game object family appears in the production bible
- protect against the system regressing back to generic ship scenery

**Success criteria:**
- tests fail when the board-game cue disappears
- tests pass when scenes carry ship truth and niche truth together
- the validator changes are stable and repeatable

---

## 5. Recommended Scene Cue Library

Use this as the shared vocabulary for board-games-at-sea scene prompts:

- dice on a table near a window
- cards mid-shuffle
- meeples near a drink or notebook
- a game box open beside a lounge chair
- two guests leaning in over a half-finished board
- blurred people walking past a table where a game is in progress
- an over-the-shoulder view of someone explaining rules
- hands placing pieces while the ship and sea remain visible
- a small cluster of players at a table, with the ocean in the background

These cues should stay subtle. They should say "group atmosphere" without turning the scene into a convention room.

---

## 6. Known Gaps To Close

These are the specific missing pieces Page 2 should solve:

1. The production bible still leans too hard on ship scenery.
2. Human presence is optional when it should be intentional.
3. Board-game props are not yet mandatory enough in the scene layer.
4. The validator does not yet strongly distinguish "beautiful cruise shot" from "board-game cruise scene."
5. We need social texture without adding hard-to-render crowd complexity.

---

## 7. What Good Looks Like

We are done when:

- every scene still looks like a real ship
- every scene also reads as a board-game gathering
- people appear naturally, not as stiff hero portraits
- the ship supports the mood, but the niche is visually obvious
- the TikTok video layer finally starts from scenes that already carry the right social energy

---

## 8. Next Steps for Agents

1. Update scene prompt generation so niche and human-presence cues are required
2. Tighten scene validation so ship-only scenes do not pass as complete
3. Teach the probe loop to reflect missing social atmosphere, not just generic cruise quality
4. Add tests for blurred people, over-the-shoulder views, and board-game object anchors
5. Regenerate the `board-games-at-sea` brief and scene images from the updated system
