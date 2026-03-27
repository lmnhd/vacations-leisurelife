# Visual Pipeline Refactor Plan

## Purpose

Define the proposed V3 refactor for campaign visual planning and media generation before implementation begins.

This document is for review and approval.

It exists to answer five questions clearly:

1. what we are replacing
2. why we are replacing it
3. what the new system is expected to do differently
4. how we will validate that it is actually better
5. what remains out of scope so this does not turn into a vague full-platform rewrite

---

## Executive Summary

The proposed V3 refactor is not a media page refresh.

It is a replacement of the current visual production stack from visual planning through generated media review.

Recommended interpretation of scope:

1. keep campaign facts and business context
2. keep only the useful parts of the strategic brief layer
3. replace the current visual-planning artifact chain
4. replace the downstream media-generation orchestration that depends on that chain
5. replace or heavily redesign the test and review pages that currently expose the old flow

Primary expected result:

1. generated campaigns should read like coherent vacation packages instead of generic cruise ads with inconsistent theme carry-through

---

## Current System

Today the current visual flow is effectively:

1. generate aesthetic brief
2. generate action anchors
3. generate landing still bible
4. repair stills if needed
5. generate production bible from stills
6. generate media assets from those artifacts

Current core files:

1. `lib/campaigns/brief-engine/orchestrator.ts`
2. `lib/campaigns/editors-room.ts`
3. `lib/campaigns/media/media-orchestrator.ts`

Current review surfaces:

1. `app/(tests)/tests/brief-studio/page.tsx`
2. `app/(tests)/tests/media-generation/page.tsx`

The current artifact-separation work proved that the existing architecture can be split operationally.

That does not mean the architecture is the right architecture long-term.

The V3 proposal assumes the current separation work remains useful as a stabilization step, but that the visual pipeline itself still needs a deeper redesign.

---

## What V3 Will Replace

### Systems To Be Replaced

V3 is intended to replace or heavily rework the following systems:

1. the current action-anchor generation layer
2. the current landing still bible planning layer
3. the current still repair loop as a core planning dependency
4. the current production bible generation layer
5. the current reference-selection and visual-grounding strategy for downstream renders
6. the current media orchestration logic that expands weak planning artifacts into large asset batches
7. the current review flow that assumes users will inspect large manifests after generation

Primary replacement targets in code:

1. `lib/campaigns/editors-room.ts`
2. `lib/campaigns/brief-engine/orchestrator.ts`
3. `lib/campaigns/media/media-orchestrator.ts`

### Pages To Be Replaced Or Heavily Reworked

These pages are built around the old artifact chain and should not be treated as stable long-term surfaces:

1. `app/(tests)/tests/brief-studio/page.tsx`
2. `app/(tests)/tests/media-generation/page.tsx`

Likely UI impact:

1. Brief Studio would stop acting like the main pre-media artifact debugger
2. Media Generation would stop acting like a category-by-category batch launcher over fragile upstream artifacts
3. review would move toward a smaller probe-approval workflow instead of large manifest inspection

### APIs And Runtime Paths Likely To Change

The exact route contract should be decided during implementation, but V3 will likely affect:

1. brief generation and approval routes that currently imply the old artifact model
2. artifact-specific routes that currently expose landing stills and production bible semantics
3. media generation routes that currently assume old asset categories and old preconditions
4. manifest/review flows that assume full-batch generation before quality review

---

## What V3 Will Not Replace

Unless a direct coupling is discovered during implementation, V3 should not replace:

1. campaign discovery inputs and campaign metadata
2. pricing and booking data sources
3. unrelated admin or dashboard functionality
4. persistence/storage infrastructure unless new contracts require changes
5. non-visual product flows
6. all strategic brief content by default

Recommended non-goal language:

1. this is not a rewrite of the entire campaign system
2. this is not a rewrite of all business logic
3. this is not a redesign of unrelated site UI

---

## Capability Continuity

V3 is a refactor of the visual production system, not a proposal to remove important downstream campaign deliverables.

The campaign still needs a complete output stack.

### Capabilities That Must Still Exist After V3

These capabilities remain required:

1. image generation
2. scene generation
3. crop and derivative asset generation
4. video generation
5. audio generation
6. copy generation
7. merch generation where applicable
8. asset storage, manifesting, and review

### What Changes Versus What Stays

The important distinction is between capability continuity and pipeline replacement.

#### Kept As Product Capabilities

These remain part of the system:

1. hero images
2. concept images
3. scene images
4. platform crops
5. video deliverables
6. narration and audio deliverables
7. ad and campaign copy outputs
8. merch outputs where the campaign needs them

#### Replaced Under The Hood

What changes is the way those outputs are planned, approved, and triggered.

The current artifact chain and review flow would be replaced by:

1. locked input-pack validation
2. direct vacation shot planning
3. probe-first approval
4. production expansion only from proven directions

### Audio, Video, Copy, And Merch Scope

Recommended scope interpretation:

1. images and scene planning are in the direct replacement path
2. video is partially in scope because it depends on visual planning and scene/storyboard quality
3. audio is adjacent, but should remain intact unless visual-storyboard coupling requires rework
4. copy is adjacent, but should remain intact unless campaign review flow changes require contract updates
5. merch should remain intact unless the new visual planning system exposes a better way to ground merch direction

### Practical Meaning

This plan does not say:

1. remove audio
2. remove video
3. remove copy
4. remove merch

It says:

1. keep those deliverables in the product
2. preserve them during migration
3. reattach them to the new planning and approval flow as needed
4. only rebuild them if their current implementation is tightly coupled to the broken visual-planning model

### Recommended Implementation Rule

If a downstream capability can keep working with a new visual-planning contract, keep it.

If a downstream capability depends on old artifacts that V3 removes, adapt its contract rather than forcing the old visual pipeline to survive just to support it.

---

## Problems V3 Is Intended To Correct

The current system still has structural problems even after artifact separation.

### Quality Problems

1. too many handoff layers between strategy and final image
2. weak visual grounding to the actual ship, excursion, and destination experience
3. repeated generic ship imagery, especially exterior-heavy repetition
4. insufficient excursion representation in the final image set
5. under-specified scene planning that can become generic by the time it reaches generation
6. theme identity can live in brief text while disappearing in the images themselves

### Workflow Problems

1. expensive failures happen too late
2. large batches can be generated before quality is clearly proven
3. human review burden is too high
4. the current review experience assumes users will manually inspect too much output
5. it can be difficult to tell whether the problem came from strategy, planning, references, or rendering

### Operational Problems

1. weak artifacts can still move downstream and consume money
2. approval and readiness semantics can be brittle or misleading
3. retry boundaries are clearer than before, but the visual system itself is still too fragile
4. debugging still requires too much architecture knowledge

---

## Target Outcome

V3 should create a simpler visual production system with these characteristics:

1. strong real-world grounding before generation starts
2. explicit vacation shot planning instead of indirect artifact translation
3. cheap probe renders before full production expansion
4. automatic structural checks for coverage, duplication, and drift
5. one small human taste-review step instead of large-scale babysitting
6. full asset expansion only from directions that already proved they work

Plain-language goal:

1. fewer guesses
2. fewer bad batches
3. stronger excursion and destination presence
4. better first-pass images
5. less manual checking

---

## Proposed V3 Architecture

### Layer 1: Campaign Facts

Inputs retained from the current system:

1. campaign metadata
2. ship target
3. destination target
4. event and timing data
5. pricing and booking context where useful
6. high-level audience and niche identity

This layer stays.

### Layer 2: Strategic Direction

This layer should be simplified and kept only if it provides useful guidance.

Likely retained outputs:

1. audience definition
2. vacation promise
3. theme language
4. campaign mood and social tone

Likely removed from critical visual dependency:

1. overly indirect or verbose visual abstractions that do not improve image quality

### Layer 3: Locked Input Packs

This is the first major V3 replacement layer.

The system should assemble and validate a small number of explicit source packs:

1. ship pack
2. excursion pack
3. people pack
4. theme pack

Rules:

1. if a required pack is weak, generation stops early
2. packs should be validated before planning begins
3. weak or generic source material should not silently flow into full rendering

### Layer 4: Vacation Shot Plan

This replaces the current action-anchor plus still-bible plus production-bible chain.

The system should build a direct shot plan that defines:

1. ship-first moments
2. excursion-first moments
3. people-first moments
4. blended vacation moments
5. mandatory coverage balance across those groups

The shot plan should exist to drive rendering directly, not to create multiple fragile intermediate artifacts.

### Layer 5: Probe Loop

Before any full production batch:

1. generate one cheap probe image per planned direction
2. score for grounding, duplication, drift, and theme fit
3. stop early if probes fail
4. revise only the plan or source packs, not the entire campaign stack

### Layer 6: Production Expansion

Only approved probe directions expand into:

1. hero images
2. concept images
3. scene images
4. crops and derivative assets
5. downstream ad and landing variants as needed

### Layer 7: Review Surface

The review UI should focus on:

1. source-pack health
2. shot-plan balance
3. probe approval
4. final asset summaries

It should not assume that the user needs to inspect a massive output manifest to determine whether the system worked.

---

## Recommended Workstreams

### Workstream A: Input Pack Model

Define:

1. pack types
2. minimum quality requirements
3. validation rules
4. fail-fast semantics

### Workstream B: Shot Plan Generator

Define:

1. shot categories
2. balance rules
3. anti-duplication rules
4. ship/excursion/people/theme mapping

### Workstream C: Probe Evaluation Loop

Define:

1. probe render path
2. structural checks
3. revision rules
4. stop conditions

### Workstream D: Production Expansion

Define:

1. which approved probes become which asset families
2. derivative generation behavior
3. reference inheritance rules

### Workstream E: Review UI Replacement

Define:

1. new review surface
2. probe approval experience
3. replacement or retirement of old test pages

### Workstream F: Migration And Compatibility

Define:

1. coexistence period with the old pipeline
2. feature flags or explicit V3 test routes
3. comparison method between old and new outputs
4. retirement conditions for old flows

---

## Testing Strategy

V3 should not be approved without an explicit test plan.

### Unit Tests

Required categories:

1. input-pack validation rules
2. fail-fast behavior when packs are weak or missing
3. shot-balance enforcement
4. anti-duplication checks
5. probe gating and stop conditions

### Integration Tests

Required categories:

1. end-to-end V3 run from campaign facts to approved probes
2. end-to-end V3 production expansion from approved probes to final assets
3. manifest and review-surface correctness
4. migration/compatibility behavior when V2 and V3 coexist

### Campaign Regression Tests

Use at least:

1. one weak/problem campaign that currently exposes the existing failures
2. one stronger control campaign to confirm V3 does not degrade good cases

Recommended examples should be decided during implementation planning and named explicitly once confirmed.

### Manual Review

Manual review should be limited and intentional.

Reviewers should inspect:

1. source-pack health summaries
2. shot-plan balance summaries
3. probe image set

Reviewers should not be expected to manually inspect large manifests as the primary quality gate.

### Comparison Testing

Side-by-side comparison criteria should include:

1. theme clarity
2. excursion representation
3. ship identity clarity
4. repetition rate
5. first-pass usefulness
6. human review burden
7. cost to reach acceptable output

---

## Approval Criteria Before Implementation

This plan should not be approved unless the proposal is accepted on all of the following points:

1. the replacement boundary is clear
2. the non-goals are clear
3. the migration strategy is clear
4. the testing strategy is explicit
5. the success metrics are explicit
6. the implementation workstreams are clear enough to estimate

Questions that must be answerable before approval:

1. what exact old artifacts are being retired
2. what exact old pages are being retired or rewritten
3. what old routes must remain temporarily for coexistence
4. what objective signals will prove that V3 is better
5. what campaign set will be used to validate the change

---

## Success Metrics

V3 should be judged on measurable improvement, not on architectural elegance alone.

Primary metrics:

1. fewer wasted generations
2. fewer late-stage failures
3. reduced human review load
4. stronger excursion and destination representation
5. less repeated generic ship imagery
6. higher first-pass acceptability
7. clearer failure reasons when a run stops

Operational success statement:

1. the system should reject bad setup early and expand only from directions that already look correct

---

## Migration Plan

Recommended migration approach:

1. do not replace the current system in one step
2. run V3 beside the existing system behind explicit V3 routes or flags
3. compare outputs on known weak and known stable campaigns
4. keep old routes available until V3 proves both quality and operational reliability
5. retire old pages and old artifact assumptions only after validation completes

Continuity requirement during migration:

1. existing audio, video, copy, merch, and non-V3 image outputs must keep functioning unless explicitly put behind V3 migration flags
2. no capability should disappear accidentally because the visual-planning layer changed underneath it
3. any temporarily unsupported downstream output must be called out explicitly before implementation approval

Recommended migration phases:

1. define V3 data model and pack contracts
2. implement shot planning and probe loop behind V3-only paths
3. run side-by-side campaign comparisons
4. replace review surfaces
5. cut over production use only after approval

---

## Risks

Primary risks:

1. scope drift into a full campaign-platform rewrite
2. hidden couplings to old artifact contracts
3. review UI being rebuilt before backend semantics are stable
4. unclear migration between old manifests and V3 outputs
5. overcomplicating the new system and recreating the same problem with new names

Mitigations:

1. keep non-goals explicit
2. keep the replacement boundary narrow and honest
3. validate with real campaigns early
4. review probes before building large-scale derivative logic
5. treat simplicity as a hard design requirement

---

## Open Questions For Review

These questions should be answered during approval review:

1. which parts of the current strategic brief remain mandatory inputs to V3
2. whether copy/audio stay on the current path initially or are partially aligned to V3 later
3. how much backward compatibility old media manifests need
4. whether V3 should use separate review pages or evolve the current test pages in place during migration
5. which campaigns are the official validation set for approval

---

## Proposed Decision

Proceed with V3 planning under this interpretation:

1. replace the current visual planning and media generation stack, not just a single page
2. keep campaign facts and non-visual business systems out of scope unless direct coupling is proven
3. require a side-by-side validation period before any production cutover
4. approve implementation only after testing, migration, and success criteria are explicitly accepted

This keeps the proposal reviewable, estimable, and honest.
