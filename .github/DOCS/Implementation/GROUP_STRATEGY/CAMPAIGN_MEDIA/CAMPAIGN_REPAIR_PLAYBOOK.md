# Campaign Repair Playbook

**Status:** living implementation note  
**Scope:** all campaign media generations, with examples drawn from `board-games-at-sea`

---

## 1. Purpose

This playbook captures the recovery pattern that turned a weak campaign pass into an acceptable one.

The goal is not to keep asking the model for "more detail" in the abstract. The goal is to:

1. inspect the source-of-truth artifact that feeds the next step
2. identify the missing signal
3. repair the smallest upstream layer that can actually fix it
4. regenerate only the affected asset family
5. stop for review before spending more tokens or credits

That loop is the agentic glue for the campaign builder.

For a concrete visual reference set, see [CAMPAIGN_EXAMPLES.md](./CAMPAIGN_EXAMPLES.md). Use that page when judging whether an asset is merely acceptable or actually communicating the campaign.

---

## 2. The Recovery Loop

When an asset family looks "almost right" but still misses the campaign, follow this order:

1. **Inspect the current artifact**
   - Brief? Check `brief.productionBible.sceneLibrary`, `landingStillBible`, and `identityBlueprint`.
   - Scenes? Check the `productionBible.sceneLibrary` and the current scene prompts.
   - Landing stills / hero concepts? Check `landingStillBible` and the niche vocabulary feeding it.
   - Designed ads? Check the documentary detail modules and the template family selection.

2. **Repair only one layer**
   - Do not rewrite the whole campaign.
   - Change the prompt, validator, or directive where the missing signal is actually lost.

3. **Regenerate only the affected asset family**
   - Scene fixes should not force a full media rerun.
   - Landing-still fixes should not automatically re-run video.
   - Ad fixes should regenerate documentary details and designed ads, not unrelated assets.

4. **Re-check immediately**
   - Confirm the change before moving on.
   - If the same warning survives one repair pass, stop and ask the user.

5. **Keep the review boundary**
   - Scenes must be reviewed before video generation.
   - Landing stills / concepts should be reviewed before large ad or video spend.

---

## 3. What Worked On `board-games-at-sea`

The campaign improved once the system stopped treating "board games on a cruise" as a vague theme and started enforcing visible campaign language.

The useful moves were:

- scenes had to carry both ship truth and niche truth
- human presence shifted from "optional garnish" to low-risk composition cues
- board-game cues became visible objects or interactions, not just mood language
- the validator began flagging ship-only scenes
- the brief flow stopped after scenes so the user could review the set before video spend
- the media rerun cleaned stale assets out of the review surface so the active set was obvious

That is the pattern to preserve.

---

## 4. Asset-Family Guidance

### Scene images

Scenes should:

- remain real ship moments
- include a visible board-game cue
- use blurred people, over-the-shoulder framing, hands, or small clusters
- avoid turning the ship into a generic brochure backdrop

If a scene looks good but not distinctly themed, repair the production bible scene prompt first.

### Landing stills, heroes, and concepts

These should:

- show the campaign identity immediately
- use the campaign's prop family and social vocabulary
- still feel cruise-plausible
- avoid over-relying on generic rail shots or scenery-only frames

If the still set is too soft, patch the landing-still bible and the directive vocabulary before regenerating.

### Documentary detail modules and designed ads

Designed ads should be treated as a template-rendered output fed by documentary detail modules.

If ads are weak:

- inspect the documentary details first
- inspect the template family choice second
- regenerate the source modules before blaming the final template render

### TikTok and video

Video is downstream of scene quality.

Do not spend on video if the scene layer is still generic.
Use the scene review checkpoint before any video pass.
For TikTok, prefer package-first video construction: still scenes, designed text cards, hard cuts, and clear ad framing. If the result still feels like motion clips with labels pasted on top, repair the package layer before trying another motion-heavy rerun.

---

## 5. Decision Gate Policy

Use this rule:

1. One auto-repair pass is allowed for a persistent warning.
2. If the warning remains, stop and ask the user.
3. Do not continue into the next phase while the mismatch is unresolved.
4. Make the decision explicit: approve, repair again, or retire/rework.

This keeps the agentic flow moving without turning the agent into a silent decision maker.

---

## 6. Cleanup Rule For Re-Runs

After a regeneration pass, check the active manifest collection, not just the raw asset table.

If an older pass is still visible alongside the new one, prune the stale manifest entries so the UI and the agent review the right batch.

That matters when the campaign has a good current pass but the review surface still shows older, inferior assets.

---

## 7. Where To Apply The Pattern

- `brief-engine/validation.ts` for structural quality gates
- `editors-room.ts` for prompt tightening
- `stability-generator.ts` for model-facing prompt wording
- `media-orchestrator.ts` for selective regeneration and review boundaries
- directive application for targeted creative refreshes

If the current output still feels generic, compare it against the examples gallery before choosing a broader repair. The gallery is there to make the next decision cheaper and clearer, especially for image families that sit close to the right answer but still lack the niche in-frame.

---

## 8. The Short Version

Inspect the right artifact. Repair one layer. Regenerate the affected family. Stop for review. Do not bury a weak campaign in the next phase.
