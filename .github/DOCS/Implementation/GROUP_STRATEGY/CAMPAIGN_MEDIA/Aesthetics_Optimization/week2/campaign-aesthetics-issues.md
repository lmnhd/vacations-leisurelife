# Week 2 Campaign And Aesthetics Issues

## Purpose

This document isolates actual campaign-quality and aesthetic-quality failures from workflow and transport failures.

These issues should be worked only after the regeneration path becomes reliable enough to produce bounded outputs.

---

## Current Campaign Split

### Control Campaign

`drift-festival-icon-2026`

Current saved state:

1. `productionBuildStatus` was previously saved as `fail`, but a March 26 lint resync proved that state was stale
2. current resynced production build status is `warn`
3. current issues are warnings, not blockers
4. `humanReviewStatus` is `pending`, so this should not be described as `ready_for_media`

Use this campaign as a workflow control.

### Problem Campaign

`bp-opendeck-icon-2027-7n-caribbean`

Current saved state:

1. readiness is `needs_review`
2. production build status is now `warn`
3. no approval-blocking issues are currently active
4. the remaining issue is a warning about repeated `music_deck_activity`, not a failure state

This is no longer the primary architecture-debug target. It is now a validated music/festival proof case with a non-blocking warning state.

---

## Campaign Issue 1: Open-deck proof case has improved from failure to warning

### Current State

The earlier open-deck blockers are no longer active:

1. `weak_niche_signal` cleared
2. `identity_legibility_too_low` cleared
3. the old `repeated_composition_family` fail state was downgraded to a warning for `music_deck_activity`

### Meaning

The still set is now reading as a real open-deck live-music campaign.

The remaining issue is policy-level repetition tolerance, not missing identity.

### What Was Fixed

1. music/festival cue presence became explicit across the still set
2. the deterministic classifier in `production-build-lint.ts` now routes festival deck scenes into `music_deck_activity` instead of collapsing them into generic `deck_sea_wide`
3. the result is `warn` instead of `fail`

### Current Acceptance Read

1. Open-deck clears `weak_niche_signal`.
2. Open-deck clears `identity_legibility_too_low`.
3. The campaign reads as music-community-first at a glance.
4. Remaining status is non-blocking.

---

## Campaign Issue 2: Control campaign state must be treated as resynced, not blindly trusted

### Evidence

The `drift-festival-icon-2026` saved state had drifted:

1. stored verdict was `fail`
2. cheap deterministic resync moved it to `warn`
3. the drift was in saved lint state, not in generation architecture

### Meaning

Week-2 follow-up work now needs to distinguish stale persisted state from real new failures.

Otherwise the team will keep reopening already-solved backend work.

### Required Fix

1. resync persisted lint before drawing new conclusions from an older campaign
2. treat `warn` versus `fail` as the source-of-truth distinction for what still blocks media generation
3. keep control-campaign notes aligned with current saved state

### Acceptance Criteria

1. control-campaign notes reflect current resynced state
2. week-2 docs stop describing stale failure states as active blockers

---

## Campaign Issue 3: Remaining campaign work is now optional quality improvement, not blocker removal

### Meaning

The system correctly avoids fake hosted-program visuals and staged thematic infrastructure, and the major week-2 blockers are no longer preventing progress.

The remaining work, if any, is different:

1. cruise-first remains intact
2. realism remains intact
3. any next iteration is now about improving quality or reducing warnings, not restoring broken architecture

### Required Fix

1. Keep the no-programming rule.
2. Only spend more time here if the warning state materially blocks the transition to media generation.
3. Prefer reusable improvements over another long aesthetic-debug loop.

### Acceptance Criteria

1. The campaign remains believable on a real ship.
2. The campaign still reads as its niche, not as generic premium vacation content.

---

## Campaign Issue 4: Music-specific cue policy is now good enough to move forward

### What Is Now True

For music, listening, festival, and open-deck campaigns, the current open-deck proof case now meets a stronger visual proof standard than generic community campaigns.

Examples of acceptable cue families:

1. live performance adjacency
2. deck crowd energy tied to music atmosphere
3. visible personal listening culture
4. recommendation-sharing or song-sharing that is image-legible
5. styling or object cues that clearly imply music culture without turning into a fake program

### What Should Still Be Avoided

1. hosted listening room energy
2. public-playback control fantasy
3. collector-prestige salon language
4. generic luxury leisure scenes with no on-image music proof

### Current Read

1. The music identity survives even when captions are removed.
2. The campaign does not drift into hosted-event fiction.
3. The remaining warning is about thematic consistency, not generic collapse.

---

## Campaign Issue 5: Validation should continue focusing on reusable issue classes, not campaign-specific hacks

### Meaning

The open-deck fix is a good example of the right pattern:

1. the problem was identified as a deterministic issue class
2. the fix was implemented in `production-build-lint.ts`
3. the campaign outcome improved without a slug-specific hardcode

### Required Fix

1. Solve the failure as a reusable music/festival campaign issue class.
2. Do not hardcode a one-off fix for a single slug.
3. Make the prompt and deterministic checks reusable across similar campaigns.

### Acceptance Criteria

1. A future music or listening campaign benefits from the same fix path.
2. The system becomes more robust by issue class, not by campaign patch.

---

## Campaign Priority

1. re-confirm saved control-campaign state before making new planning claims
2. only pursue additional campaign tuning if a remaining warning materially blocks media generation
3. prefer reusable improvements over another broad aesthetic-debug cycle