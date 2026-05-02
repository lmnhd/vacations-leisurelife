# TikTok Video Refactor Plan

**Status:** planning ready
**Campaign:** board-games-at-sea
**Goal:** make great TikTok promotional videos that feel native, stop the scroll, and still read as real ship content.

---

## 1. What We Learned

The current pipeline is not one TikTok system. It is three related systems:

1. `tiktok_seed_video` for storyboard-driven seed content
2. `tiktok` and `tiktok_paid` distribution paths for organic and paid delivery
3. storyboard assembly and composition utilities that turn scene images into motion

The refactor has to respect those boundaries. We should not try to solve a composer problem with a brief rewrite, and we should not try to solve a paid-ad problem with the organic publishing adapter.

The visible failures we have already seen are:

- location-first scene libraries instead of moment-first scenes
- audio/video composition truncation from ffmpeg `-shortest`
- repeated source-image use that makes clips feel static
- organic and paid TikTok being described as one thing when they are not
- the paid lead-gen path still having placeholder pieces, especially lead-form creation

---

## 2. Current Runtime Shape

### Creative generation

The brief engine already produces:

- `landingStillBible`
- `productionBible.sceneLibrary`
- `productionBible.storyboards`

That means the right long-term fix starts upstream, but only part of the problem lives there.

### Video generation

There are two relevant video paths in code:

- `generateTikTokSeed(...)` for legacy/fallback TikTok seed generation
- `generateStoryboardVideo(...)` for storyboard-driven clips that pull per-shot scene images

The storyboard path is the one we want for strong promotional videos.

### Distribution

Distribution already separates:

- `tiktok` for organic posting
- `tiktok_paid` for paid lead-gen drafts

That separation should stay. The implementation should harden the contract, not flatten it.

---

## 3. Final Direction

The implementation plan should optimize for one outcome:

> Great TikTok promotional videos that feel social, native, and specific to the campaign while staying believable as real cruise content.

To get there, we should keep the plan focused on four layers:

1. scene quality
2. video assembly
3. lint and gating
4. reusable templates for organic and paid variants

---

## 4. Implementation Plan

### Phase 0: Fix Production Bible And Scene Intent

**Why this matters:** the TikTok video generator needs usable, moment-based scene material. If the production bible gives us empty location shots, the rest of the system can only polish the wrong thing.

**Update these areas:**

- `lib/campaigns/aesthetic-engine.ts`
- `lib/campaigns/editors-room.ts`
- `lib/campaigns/brief-engine/orchestrator.ts`
- `lib/campaigns/brief-engine/validation.ts`

**Required changes:**

- Scene generation must describe moments, not just locations
- Each scene must carry a clear action, framing, light, and camera angle
- Storyboards must remain scene-driven and motion-safe
- The system should reject empty cruise-brochure scenes earlier
- Add a dedicated scene-probe loop for `productionBible.sceneLibrary` later; keep landing-still probes separate

**Acceptance criteria:**

- sceneLibrary contains moment-based scenes with non-empty `imagePrompt`
- storyboard shots map to actual scene intent, not generic atmosphere
- no empty pool deck / atrium / dining / chandelier / sunset-climax defaults
- brief readiness clearly shows when the bible is not usable for video generation

### Phase 1: Fix Video Assembly

**Why this matters:** even good source images can become weak TikTok videos if the composer trims them too aggressively or keeps using one clip style for everything.

**Update these areas:**

- `lib/campaigns/media/video-composer.ts`
- `lib/campaigns/media/generators/tiktok-seed-generator.ts`
- `lib/campaigns/media/generators/runway-generator.ts`
- `lib/campaigns/media/generators/elevenlabs-generator.ts`

**Required changes:**

- remove duration collapse behavior from the compose path
- use explicit shot timing and hard cuts where the format calls for it
- keep one source image per shot in the storyboard path
- make the motion prompt rules stricter and more format-aware
- keep TTS out of organic POV/confession styles unless explicitly required
- preserve a clear ship-first visual read across the entire clip

**Acceptance criteria:**

- storyboard-driven TikTok videos use distinct source frames per shot
- the final runtime does not collapse clips to a short tail because of ffmpeg trimming
- motion feels intentional rather than like Ken Burns drift
- audio and text timing support the hook instead of fighting it

### Phase 2: Lint Gate And Quality Enforcement

**Why this matters:** we need a way to stop weak TikTok videos from shipping again.

**Update these areas:**

- `lib/campaigns/media/media-orchestrator.ts`
- `lib/campaigns/media/media-store.ts`
- `lib/campaigns/media/probe-engine.ts`

**Required changes:**

- store lint score with the generated video record
- reject low-quality videos before publish
- keep `tiktok` and `tiktok_paid` quality checks separate where needed
- add scene-aware probing for scene-image confidence, not just landing-still confidence

**Acceptance criteria:**

- every generated TikTok video gets a lint score
- sub-threshold videos do not publish
- probe and lint results are visible enough to debug without guessing

### Phase 3: Reusable TikTok Templates

**Why this matters:** once the pipeline is working, we need a repeatable way to generate good TikTok promotional videos across campaigns without reinventing the wheel.

**Create or formalize:**

- `lib/campaigns/media/generators/tiktok-formats/`
- `lib/campaigns/media/lint/`

**Required changes:**

- create format templates for organic seed videos and paid-friendly variants
- keep the prompts campaign-agnostic, with niche-specific slots for props, hooks, and audio cues
- keep the manifest asset type stable unless a real downstream need appears
- use distribution platform and provider draft type to distinguish organic and paid delivery

**Acceptance criteria:**

- a new campaign can produce TikTok video variants from reusable templates
- only the niche-specific slots change between campaigns
- the output still feels specific instead of templated

---

## 5. Decisions We Are Locking In

- Keep `tiktok_seed_video` as the main media asset type for the video generator
- Use `tiktok` versus `tiktok_paid` in distribution to separate organic and paid delivery
- Treat paid lead-gen as a separate implementation target, not a side effect of organic publishing
- Do not depend on landing-still probes as proof that scene video prompts are correct
- Keep the goal centered on promotional quality, not just structural success

---

## 6. What Good Looks Like

We are done when:

- the production bible produces scene intent that supports video
- TikTok video assembly creates watchable, punchy promotional clips
- the clips are clearly about the campaign, not generic cruise footage
- the paid and organic paths are separated cleanly in code and docs
- the implementation has quality gates that stop bad outputs before they spread

---

## 7. Next Steps

1. Update the scene-generation pipeline so the production bible emits real moments
2. Harden the TikTok storyboard composer so it stops truncating and drifting
3. Add lint gating for TikTok video quality
4. Add a scene-aware probe loop
5. Build reusable organic and paid TikTok templates

