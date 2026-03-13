## Phase 2.1.1 Bible Modifications

**Status:** Proposed
**Owner:** Campaign Media Pipeline
**Last Updated:** 2026-03-11

---

## 1. Why This Follow-On Plan Exists

Phase 2.1 improved realism and reduced upstream thematic drift, but a new structural problem is now clear:

- the current Production Bible is doing the job of a storyboard scene library
- hero and concept still generation have started borrowing from that same scene pool
- landing-page imagery and storyboard/video imagery do not have the same optimization target

This means the pipeline is currently over-coupled.

The result is not just a prompt-quality problem. It is a channel-definition problem.

Landing stills need:

- instant readability
- quiet composition
- clear focal hierarchy
- negative space for headlines and CTA
- travel-first emotional clarity in one frame

Storyboard scenes need:

- sequence diversity
- stronger situational detail
- motion-friendly framing
- emotional progression across shots
- enough environmental richness to support video editing and narration

Those are related needs, but they are not the same need.

---

## 2. Core Decision

We should split the current visual planning layer into two distinct channels that share one foundational realism model.

### 2.1 Shared Foundation

Both channels should continue to share:

- approved ship reference images
- canonical ship fidelity
- cruise-native plausibility rules
- event-framing guidance
- destination and route context
- approved campaign aesthetic and messaging hierarchy

### 2.2 Channel A: Landing Still Direction

This channel should own:

- landing hero imagery
- alternate landing heroes
- concept stills used for page sections or ads
- email header and other headline-safe marketing stills

Its primary job is not story coverage. Its job is conversion-oriented still selection and still generation.

### 2.3 Channel B: Storyboard Direction

This channel should own:

- Production Bible scene library
- scene-image generation for motion source frames
- storyboard shot plans
- narrated video assembly inputs

Its primary job is not headline safety. Its job is believable, emotionally strong, sequence-ready visual storytelling.

---

## 3. Answer To The Immediate Question

### 3.1 Does the earlier analysis also apply to scene images and videos?

Yes, but only in part.

The earlier realism critique absolutely applies to scene images and videos when the issue is:

- ship plausibility failure
- resort or backyard drift
- event over-framing
- overly literal niche staging
- classroom, workshop, lab, retreat, or corporate body-language leakage
- reference misuse or unapproved reference sourcing

Those issues will damage all downstream channels.

But the earlier hero-specific critique does **not** transfer directly when the issue is:

- headline-safe negative space
- minimal subject count for clarity
- one-second landing-page legibility
- alt-hero compositional simplicity
- static still optimization over sequence richness

Those are landing still requirements, not storyboard requirements.

### 3.2 Do we need to fix the scene and video pipeline?

Yes, but the required fixes are narrower than the landing-still redesign.

The scene and video pipeline does need correction where it still allows:

- implausible scene concepts into the scene library
- scene prompts that read like land hospitality instead of ship-native environments
- repeated prop families across adjacent scenes
- weak separation between reference categories and actual scene use
- scene libraries that are too broad, too spectacle-heavy, or too niche-literal to animate cleanly

The scene and video pipeline does **not** need to be redesigned around landing-hero composition rules.

---

## 4. Current Pipeline Assessment

### 4.1 What Is Working

- The shared realism and event-framing rules are materially better than before.
- Approved reference images are now a visible upstream stage instead of an invisible side effect.
- Scene-image generation already uses Production Bible `sceneLibrary` entries directly.
- Storyboard video generation already uses Production Bible shot sequencing rather than inventing new scenes at video time.
- Motion prompts already attempt to preserve the generated scene frame rather than replacing it.

### 4.2 What Is Still Structurally Wrong

- The Production Bible scene library is currently the only rich upstream visual source of truth.
- Hero and concept still generation have begun treating storyboard scenes as hero-source candidates.
- The Production Bible prompt is still responsible for too many jobs at once:
	- scene diversity
	- emotional sequencing
	- video coverage
	- implicit still-source quality

That last responsibility is the wrong one.

### 4.3 What Is Still Weak Inside Scene/Video Itself

Even after separating landing stills, the storyboard channel still needs stronger guardrails for:

- scene-family rotation so adjacent scenes do not all hinge on the same notebook, token, jar, or prop cue
- stricter exclusion of lawn, garden, villa, patio, courtyard, and resort language
- bias toward ship-native architectural truth in exteriors and interiors
- discouraging spectacle scenes that read more like lucky anomalies than dependable campaign storytelling
- discouraging scenes that only work as a still concept but break down as motion-source material

---

## 5. Proposed Architecture

### 5.1 New Upstream Outputs

The aesthetic system should eventually produce two separate but linked outputs:

1. `Landing Still Bible`
2. `Production Bible`

### 5.2 Landing Still Bible Purpose

The Landing Still Bible should define a small curated set of still intents such as:

- primary landing hero
- alternate landing hero
- section mood stills
- marketing concept stills
- headline-safe horizontal options
- social-square still candidates

Each still spec should bias for:

- travel-first composition
- quiet emotional clarity
- low subject count
- headline-safe layout
- minimal activity density
- immediate cruise read

### 5.3 Production Bible Purpose

The Production Bible should stay focused on:

- scene library for motion source generation
- shot-ready narrative variety
- storyboards per deliverable
- narration and editorial rhythm support

It should not be expected to also optimize for the landing hero.

### 5.4 Relationship Between The Two

The two bibles should be siblings, not parent and child.

They should both inherit the same:

- ship references
- plausibility rules
- route and destination texture
- event-framing boundaries
- approved campaign tone

But they should diverge in:

- composition goals
- subject density
- prop tolerance
- scene complexity
- editorial use case

---

## 6. Required Fixes By Channel

### 6.1 Landing Still Channel Fixes

These are required because landing stills currently over-borrow from storyboard logic:

- stop treating Production Bible scenes as the default hero/concept source
- introduce still-specific prompt planning upstream
- explicitly define landing-safe composition and spacing requirements
- separate still approval and curation from storyboard approval

### 6.2 Storyboard Channel Fixes

These are required even if landing stills are split out:

- tighten scene-library generation so every scene is ship-native and motion-credible
- filter out weak scene types that create implausible or overly lucky spectacle beats
- constrain adjacent-scene repetition in prop family and emotional beat
- ensure each scene can support a short motion prompt without visual contradiction
- ensure each storyboard uses scenes that read well as a sequence, not just as isolated stills

### 6.3 Shared Fixes

- maintain approved-reference-first workflow
- preserve strict marine-environment negatives
- keep event framing atmospheric unless the campaign is explicitly sold as an event cruise
- preserve exact-ship fidelity through all image and video stages

---

## 7. Concrete Code Direction

### 7.1 Areas To Change

- `lib/campaigns/schema.ts`
	- add a new schema for landing still specifications instead of overloading `ProductionBible`

- `lib/campaigns/aesthetic-engine.ts`
	- split Pass 3 visual planning into two outputs:
		- still-direction output
		- storyboard-direction output
	- keep shared realism rules in common prompt scaffolding

- `lib/campaigns/media/generators/stability-generator.ts`
	- stop default hero/concept prompt construction from assuming storyboard scenes are the preferred source
	- allow hero/concept prompts to use dedicated still specs first

- `lib/campaigns/media/generators/tiktok-seed-generator.ts`
	- retain storyboard-driven video path, but strengthen assumptions that source scenes are sequence assets rather than hero assets

- `lib/campaigns/media/image-selection.ts`
	- continue context-based selection, but separate approval semantics for landing contexts versus storyboard contexts if needed

### 7.2 Change Ordering

Recommended order:

1. Define the split in schema.
2. Split visual-planning generation in the aesthetic engine.
3. Retarget hero/concept still generation to the new still plan.
4. Tighten Production Bible scene-generation constraints for motion credibility.
5. Re-run verification on one landing-heavy and one video-heavy campaign.

---

## 8. Scene/Video-Specific Quality Rules To Add

These rules should be added even if no immediate schema split lands.

### 8.1 Scene Library Rules

- Every scene must read as cruise-native at a glance.
- Every scene must remain believable if shown as a 2-4 second motion clip.
- At least half of the library should lean on architecture, atmosphere, posture, sea relation, and timing rather than on visible object cues.
- Consecutive scenes should not repeat the same cue family.
- Spectacle scenes should be rare and should never become the backbone of the deliverable.
- Interior scenes must read as ship interiors, not hotel conference or generic hospitality spaces.

### 8.2 Storyboard Rules

- Adjacent shots should vary in camera logic, scene family, and emotional beat.
- Storyboards should not depend on one improbable wildlife or destination event for payoff.
- Storyboards should avoid sequences that imply formal hosted instruction unless the product truly includes that programming.
- If a storyboard uses a prop-forward scene, the next shot should usually pivot back to people, ship space, sea, or destination atmosphere.

### 8.3 Motion Integrity Rules

- Source image preservation should remain strict.
- Motion prompts should animate the approved scene, not reinterpret it.
- Video generation should not become a second discovery stage.

---

## 9. Recommendation

We should proceed with a split-channel design.

The right conclusion is not that the Production Bible was a mistake. The right conclusion is that it was asked to cover an adjacent still-imagery problem it was never actually designed to solve.

### 9.1 Short Version

- Yes, scene and video still need fixes.
- No, they should not be forced into landing-hero rules.
- Yes, landing imagery should move into a distinct upstream channel.
- The two channels should share realism and reference governance, but not the same visual objective.

### 9.2 Immediate Next Step

Implement the schema and prompt split first, then tighten the storyboard scene rules second.

That sequencing matters because otherwise we will keep trying to make one prompt family satisfy two conflicting creative objectives.
