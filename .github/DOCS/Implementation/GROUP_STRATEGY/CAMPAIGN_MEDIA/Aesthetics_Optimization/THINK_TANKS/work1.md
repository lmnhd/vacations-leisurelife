# Think-Tank Briefing: Aesthetic Brief Generation, Landing Still Bible Stability, and Production-Build Failure Patterns

## Purpose

This document captures the primary thought process across the full session around one specific stage of the campaign build system:

1. aesthetic brief generation
2. landing still bible generation
3. production bible derivation
4. deterministic lint gating before media generation

This is not a clean-room design memo.
It is a working intelligence brief for think-tank agents who need to understand:

1. what we believed at each stage
2. what kept failing
3. what we tried
4. what worked
5. what did not work
6. what is currently being tried
7. where alternate solution paths may exist

The emphasis is on practical development history, not polished retrospective storytelling.

---

## Stage In The Campaign Build Process

The relevant system stage is the aesthetic-generation and visual-planning layer that sits between campaign discovery and downstream media generation.

The current high-level path is:

1. discovery selects a campaign concept
2. `generateAestheticBrief` creates the core aesthetic brief
3. still-planning logic creates a `landingStillBible`
4. a downstream synthesis step creates a `productionBible`
5. `production-build-lint` evaluates whether the output is safe enough to proceed toward spend and media generation
6. readiness and approval state reflect whether the brief is truly usable

The important product truth is that this stage is not just “creative output.”
It is a gatekeeper for whether campaigns are allowed to move forward.

That means our standards here are not:

1. vaguely better vibes
2. prettier prompts
3. fixture-only green tests

They are:

1. stable live outcomes on representative campaigns
2. one reliable readiness signal
3. no false approvals
4. no stale-state failures
5. no hidden operator choreography to rescue weak outputs

---

## Core Thought Process Across The Session

### Initial Frustration And Reframing

The session started from a growing dissatisfaction with the existing strategy of endlessly adding and removing prompt instructions in order to find the perfect balance of negations.

The key realization was:

The problem was no longer “find the right wording.”
The problem was “the system shape is wrong.”

This led to a deliberate architectural pivot away from a monolithic visual-planning prompt and toward a more structured, staged generation model.

### Architectural Hypothesis

The working hypothesis became:

One LLM call was being asked to do too many jobs at once.

That overloaded step was expected to:

1. understand niche identity
2. produce believable cruise-native expressions of that niche
3. satisfy still-slot distribution
4. avoid generic fallback templates
5. generate valid schema output
6. preserve enough visual identity for production lint
7. self-correct under deterministic constraints

The repeated failures suggested that a single overloaded step oscillates instead of converges.

### Resulting Design Direction

This produced the `Editor's Room` idea.

Instead of one giant prompt, the system should use a few smaller responsibilities:

1. action anchors first
2. landing still bible from anchors second
3. production bible synthesis from validated stills after that
4. deterministic lint as the critic
5. one isolated correction pass only when appropriate

That shift from monolithic generation to staged generation was the biggest conceptual move of the session.

---

## Major Evolution Of The Session

### Phase 1: Stop Tuning Prompt Negations

The first major conclusion was that prompt balancing had reached diminishing returns.

We had evidence that it could improve outcomes in specific moments, but not reliably enough across reruns and representative campaigns.

This led to a hard policy direction:

1. stop trying to solve the core problem through more negations
2. stop pursuing “perfect prompt balance” as the main path
3. move to a more explicit architecture

### Phase 2: Create The Handoff Architecture

The next step was not immediate code.
It was to clarify the intended design for the next implementation agent.

This produced a new current-phase description centered on:

1. action anchors
2. still generation from anchors
3. production bible synthesis from stills
4. deterministic lint
5. one isolated still-repair pass only

### Phase 3: Implement The Editor's Room Pipeline

Another implementation pass created:

1. `lib/campaigns/editors-room.ts`
2. new staged orchestration in `brief-engine/orchestrator.ts`
3. intermediate action-anchor generation
4. isolated still repair
5. production bible generation from validated stills

At this stage, the main bet was that structured workflow alone would solve the instability better than prompt editing.

### Phase 4: Live Failure Changed The Nature Of The Problem

After the new pipeline landed, live verification showed that the system was still failing, just in a different way.

The first strong lesson was:

Even with a better architecture, anchors can still be merely advisory unless enforced structurally.

That triggered a second round of improvements:

1. audit fields on stills like `anchorId`, `slotRole`, and `nicheCarryThrough`
2. deterministic anchor-compliance validation
3. anchor-aware repair input formatting
4. extra tests around anchor compliance

### Phase 5: Second-Order Review Changed The Failure Model Again

After those changes, code review and live diagnostics revealed that the failures were no longer a single blended mess.

Instead, they could be decomposed into independent classes:

1. role coverage
2. generic fallback overuse
3. niche cue weakness / identity legibility
4. anchor contract drift
5. whole-set failure behavior

This decomposition is now the main operating model for further work.

---

## What Already Works Reliably

These areas are currently treated as solved or substantially solved unless a new regression proves otherwise.

### 1. Approval And Readiness Gate Semantics

We previously had a mismatch where campaigns could remain blocked or report the wrong readiness state because stored lint status drifted from recomputed lint status.

That class of bug was addressed.

Current stable assumptions:

1. `productionBuildStatus = fail` should block approval
2. `productionBuildStatus = fail` should prevent `ready_for_media`
3. stale stored fail state should not block a now-valid brief forever

### 2. Shared Contract Philosophy

The system still wants one underlying brief-generation/orchestration contract for both UI and agent callers.

This remains a non-negotiable architectural principle.

### 3. Structured Outputs In The Main Path

The project has remained committed to structured outputs as the primary generation path, even as the surrounding pipeline changed.

### 4. Location Drift Is Now Detected Better

Originally, anchor location-family checks trusted anchor metadata too much.
That allowed the still text itself to drift without being caught.

This was improved by validating actual still text against location-family expectations rather than assuming the anchor metadata was enough.

### 5. Fake Isolated Repair Was Correctly Rejected

An important realization was that a 6-of-6 failing set should not be treated as a local still repair problem.

That led to narrowing isolated repair to true subset failures only.

This was a real conceptual improvement, even though it did not by itself solve live quality issues.

---

## Recurring Problems We Keep Running Into

These are the repeated failure patterns that shaped the session.

### 1. Generic Fallback Clustering

The system keeps drifting into stock cruise imagery patterns even when niche-specific wording is present.

Typical fallback families include:

1. rail couple laugh
2. quiet window solo
3. dining intimacy
4. deck sea wide

This is not just a taste issue.
It directly causes lint failures and weakens campaign identity.

### 2. Weak Niche Signal / Identity Legibility

The system often produces stills that technically mention niche cues or carry a `nicheCarryThrough` field but still fail lint as if the niche is absent or too subtle.

This revealed a recurring contract problem between:

1. what generation claims the cue is
2. what deterministic lint actually recognizes as a meaningful cue

### 3. Role Coverage Failures

Landing still sets are supposed to cover enough visual roles to be production-usable.

In practice, we repeatedly fail to achieve stable coverage for:

1. hero stills
2. editorial stills
3. intimate stills

The most active example is the tabletop campaign where missing editorial coverage became the main remaining blocker.

### 4. Anchor Contract Drift

Even after action anchors were introduced, generated stills could drift from:

1. the seeded location family
2. the expected niche signal
3. the intended role
4. the intended social structure

This proved that anchors were not enough on their own. They needed deterministic enforcement.

### 5. Whole-Set Failure Ambiguity

When all six stills fail, the system used to blur together two different questions:

1. is this a small repair problem?
2. is the whole set unsalvageable?

That ambiguity created poor behavior and hid the true nature of the failure.

### 6. Prompt Success Was Not Stable Across Reruns

One of the most important recurring lessons was that a prompt tweak that looked good in one pass often failed to generalize.

This is why the session moved so strongly away from prompt micro-tuning.

---

## Representative Campaigns And What They Taught Us

Three campaigns became the main benchmark set.

### 1. `bp-tabletop-icon-2027-7n-caribbean`

This campaign became the proving ground for tabletop role coverage.

It is useful because it is no longer completely broken.
Its failure set is narrow enough to isolate.

Main lessons from tabletop:

1. role coverage can remain the only blocker even when broader architecture improved
2. stills can still look generic even after structural improvements
3. declared niche carry-through does not guarantee lint-recognized niche legibility
4. slot-role behavior and diagnostic interpretation matter a lot

### 2. `eastern-caribbean-stitch-sail-2026-09-19`

This campaign revealed that niche identity and generic fallback are still tightly entangled.

Main lessons from stitch:

1. the system can still produce 5-of-6 no-cue outcomes
2. generic fallback overuse can remain severe even after staged generation is in place
3. this is not the right first proving case for role-coverage work because its problems are broader

### 3. `deck-sketchbook-society-2026`

This campaign surfaced anchor-contract and early-stage instability more than downstream lint tuning problems.

Main lessons from sketchbook:

1. some campaigns fail too early for production lint to be the primary lens
2. anchor compliance and whole-set behavior must sometimes be solved before higher-level visual polish matters

---

## Solutions We Tried

This section matters most for think-tank work because it shows what directions have already been explored.

### A. Prompt Negation Balancing

This was the earlier dominant strategy.

The idea:

1. ban more bad patterns
2. add more corrective wording
3. rebalance negative and positive prompt framing until outputs stabilize

Why it was pursued:

1. it was fast to try
2. it sometimes produced visible improvements
3. it did not require new architecture at first

Why it was abandoned as the main path:

1. improvements were inconsistent
2. regressions kept returning on live reruns
3. one fix often destabilized another area
4. it did not solve the overloaded-generation problem

### B. Architecture Pivot To The Editor's Room

This was the central solution attempted during the session.

The idea:

1. separate concept creation from still generation
2. separate still generation from production bible synthesis
3. let deterministic lint be the critic instead of overloading the generator prompt

What changed:

1. action anchors introduced
2. `landingStillBible` generated from anchors
3. `productionBible` generated from validated stills
4. isolated still repair added

Why this was promising:

1. reduced prompt responsibility per step
2. created explicit intermediate artifacts
3. made failure more inspectable
4. aligned better with product logic

What it did not solve automatically:

1. anchor drift
2. generic fallback overuse
3. niche-legibility mismatch
4. whole-set collapse behavior

### C. Deterministic Anchor Compliance

This was a follow-up solution after realizing anchors were too advisory.

The idea:

1. every still should be auditable against its originating anchor
2. every slot should be auditable against role expectations
3. niche carry-through should be auditable, not just described in prose

What was added:

1. `anchorId`
2. `slotRole`
3. `nicheCarryThrough`
4. location-family checks
5. slot-role checks
6. anchor compliance tests

Why it mattered:

1. it turned vague generation promises into a checkable contract
2. it made repair prompts more specific

What it still did not solve:

1. generic fallback generation
2. niche cue recognition mismatch
3. broader whole-set failure behavior

### D. Subset-Only Isolated Repair

The idea:

1. if only a few stills fail, repair just those
2. do not destabilize the whole set

This was initially too permissive and effectively behaved like whole-set rewriting in some cases.

It was then tightened so only true subset failures can use isolated repair.

Why this was good:

1. it restored conceptual integrity
2. it prevented fake localized repair on globally broken sets

What remains unresolved:

What the system should do when all six stills fail.

### E. Editorial Composition Normalization

This was a narrow attempt to fix tabletop role coverage.

The idea:

If editorial stills were being interpreted as intimate because of composition language, normalize those composition words before lint.

Why this made sense at the time:

The reported diagnostic failure suggested composition wording was the cause.

What happened:

It appeared to partially improve one editorial slot but did not clearly clear the blocker.

What we later learned:

That specific interpretation was partly distorted by the diagnostic path not matching the real orchestrator path at the time the report was produced.

### F. SlotRole-Aware Lint Classification

This became a crucial clarification.

The idea:

If a still explicitly carries `slotRole=EDITORIAL_WIDE_A` or `EDITORIAL_WIDE_B`, lint should trust that slot-role classification before composition heuristics.

This is a cleaner principle than allowing composition wording to overrule explicit slot-role structure.

This is now treated as a coherent and important fix.

---

## Important Misread That Happened During The Session

One of the most useful lessons for think-tank work is that we briefly misdiagnosed a current failure using stale evidence.

What happened:

1. a report claimed `OTS-04-EDITORIAL_B` was still being classified as intimate
2. this led to the belief that composition normalization was still insufficient
3. later clarification showed that report came from the diagnostic script, not the final orchestrator path, and was produced before the slotRole-aware lint change

Why this matters:

Think-tank agents should be careful not to overfit on stale diagnostics when the underlying evaluation path changed afterward.

Lesson:

Always distinguish between:

1. direct-library diagnostics
2. orchestrator-path behavior
3. persisted brief behavior

They are related, but not automatically interchangeable.

---

## What We Are Currently Trying

The current development posture is much narrower and more disciplined than before.

### Active Strategy

Work one failure class at a time.

Current order:

1. tabletop role coverage first
2. generic fallback reduction second
3. niche-legibility alignment third
4. sketchbook anchor-contract and whole-set behavior after that

### Current Tabletop Focus

The current tabletop focus is not “make it all good.”

It is:

1. clear `missing_role_coverage`
2. make sure editorial coverage is stable
3. avoid blending that work with fallback or niche-cue work unless the same deterministic change clearly addresses both

### Current Diagnostic Tooling

A dedicated diagnostic script was added so that failure classes could be inspected more directly.

Its purpose is to show:

1. anchors
2. anchor violations
3. per-still lint diagnostics
4. per-still blocker/warning mapping

This tooling is part of the shift from fuzzy prompt tweaking to explicit debugging.

---

## What Think-Tank Agents Should Treat As Hard Constraints

Any alternate proposal should respect the following.

### Do Not Propose

1. another prompt-negation balancing cycle as the primary path
2. lint-threshold weakening to fake progress
3. separate hidden orchestration paths for UI versus agents
4. recursive remediation mazes
5. operator-button choreography as the main control surface
6. solutions that only work on fixtures but not on representative live campaigns

### Preserve

1. one shared orchestration contract
2. readiness and approval correctness
3. stale-lint resync correctness
4. structured outputs in the main path
5. deterministic critique as a first-class design component

---

## Strong Candidate Alternate Brainstorm Areas

These are not confirmed solutions. They are plausible directions think-tank agents should explore.

### 1. Stronger Contract Locking Between Generation And Lint

Question:

Should the generator be required to emit a more explicitly lint-aligned semantic contract rather than just prose plus audit fields?

Example avenues:

1. explicit `intendedShotRole` separate from `slotRole`
2. explicit `locationFamily` on stills, not just anchors
3. explicit `cueStrengthIntent` or `identitySignalType`

### 2. Generator-Lint Vocabulary Alignment

Question:

Are we losing too much because the generator and lint are using different semantics for what counts as a niche cue or editorial frame?

Possible direction:

Unify the cue vocabulary and family vocabulary more deliberately.

### 3. Deterministic Post-Generation Rewriting Before Lint

Question:

Should some limited deterministic rewriting happen before lint whenever certain slot-role contradictions are present?

This is different from open-ended repair and may be safer if constrained tightly.

### 4. Separate Whole-Set Recovery Path

Question:

When all six stills fail, should the system:

1. regenerate stills from same anchors
2. regenerate anchors and stills together
3. stop immediately and surface a whole-set failure artifact

This remains a key unresolved branch.

### 5. Campaign-Type-Specific Failure Routing

Question:

Should different campaign classes route into slightly different corrective logic?

For example:

1. tabletop role-coverage issues
2. fiber/maker niche-legibility issues
3. sketchbook anchor-contract instability

This must be approached carefully to avoid special-case sprawl, but it may be worth brainstorming.

### 6. Production Bible Dependency Reconsideration

Question:

Should `productionBible` generation be delayed even more aggressively until still quality clears a stronger threshold?

Currently it is already downstream of the stills, but a think-tank agent may still see a better synthesis timing or dependency model.

---

## Current Best Understanding

At the end of this session, the best understanding is:

1. The big architectural pivot was correct.
2. Prompt-negation balancing is not the right main strategy.
3. The remaining failures are real but separable.
4. We now have enough instrumentation and conceptual clarity to work one failure class at a time.
5. The immediate work is not “invent a whole new system again.”
6. The immediate work is to find the best targeted design for each remaining failure class without regressing the gains already made.

---

## Recommended Think-Tank Framing

If a think-tank agent uses this briefing, it should think in this order:

1. Which failure class am I solving?
2. Am I proposing a structural fix, a deterministic fix, a vocabulary-alignment fix, or a regeneration-policy fix?
3. Does my idea preserve shared orchestration and readiness correctness?
4. Does my idea reduce reliance on fuzzy prompt balancing?
5. Does my idea generalize beyond one lucky rerun?

That is the right mindset for contributing usefully to the next development passes.
