# Week 2 Campaign And Aesthetics Issues

## Purpose

This document isolates actual campaign-quality and aesthetic-quality failures from workflow and transport failures.

These issues should be worked only after the regeneration path becomes reliable enough to produce bounded outputs.

---

## Current Campaign Split

### Control Campaign

`drift-festival-icon-2026`

Current saved state:

1. readiness is `ready_for_media`
2. production build status is `warn`
3. no approval-blocking issues are currently active

Use this campaign as a workflow control.

### Problem Campaign

`bp-opendeck-icon-2027-7n-caribbean`

Current saved state:

1. readiness is `needs_review`
2. production build status is `fail`
3. blocking issue family is still active

This is the primary campaign-content target once the workflow path is stable.

---

## Campaign Issue 1: Music/festival identity is not visually legible enough

### Current Blockers

The current saved open-deck brief still surfaces these issue codes:

1. `weak_niche_signal`
2. `identity_legibility_too_low`
3. `repeated_composition_family`

### Meaning

The still set is reading too much like generic cruise leisure and not enough like an open-deck live-music or festival-social campaign.

The identity is not consistently visible in the image itself.

### Required Fix

1. Force more explicit music/festival cue presence in the still set.
2. Make at least 2 to 3 stills carry unmistakable on-image identity rather than relying on slogans or captions.
3. Strengthen generation guidance around crowd energy, stage adjacency, sound-system context, dancing, visible performance atmosphere, or personal listening cues where appropriate.

### Acceptance Criteria

1. Open-deck clears `weak_niche_signal`.
2. Open-deck clears `identity_legibility_too_low`.
3. The campaign reads as music-community-first at a glance.

---

## Campaign Issue 2: Composition families are collapsing into generic fallback reads

### Evidence

Previously surfaced affected reads include generic fallback families such as:

1. rail-couple-laugh
2. cabin-window-laughing
3. quiet-window-solo
4. generic deck-wide vacation framing

### Meaning

The system is preserving cruise plausibility, but over-correcting into stock cruise imagery.

That lowers campaign specificity.

### Required Fix

1. Increase location, social-unit, and framing diversity.
2. Prevent multiple stills from solving the brief with the same generic cruise visual shorthand.
3. Push niche identity into subject action, environment detail, and visual relationship structure instead of defaulting to rail and cabin-window scenes.

### Acceptance Criteria

1. Open-deck no longer repeats the same composition family enough to trigger lint issues.
2. The still set feels distinct across hero, editorial, intimate, and flex roles.

---

## Campaign Issue 3: Cruise-first guidance is working, but it can still wash out niche-specificity

### Meaning

The system correctly avoids fake hosted-program visuals and staged thematic infrastructure.

The failure mode now is different:

1. cruise-first remains intact
2. realism remains intact
3. niche identity becomes too faint

### Required Fix

1. Keep the no-programming rule.
2. Increase visible niche cues without reintroducing fake hosted operations.
3. Prefer guest-carried, scene-native signals over infrastructure-based signals.

### Acceptance Criteria

1. The campaign remains believable on a real ship.
2. The campaign still reads as its niche, not as generic premium vacation content.

---

## Campaign Issue 4: Music-specific cue policy needs a tighter success definition

### What Needs To Be True

For music, listening, festival, and open-deck campaigns, success should require a stronger visual proof standard than generic community campaigns.

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

### Acceptance Criteria

1. The music identity survives even when captions are removed.
2. The campaign does not drift into hosted-event fiction.

---

## Campaign Issue 5: Validation should focus on reusable issue classes, not campaign-specific hacks

### Meaning

The current open-deck failure is a concrete case, but the underlying issue class is broader:

1. community-niche not legible enough
2. generic fallback compositions overused
3. explicit cue coverage too low

### Required Fix

1. Solve the failure as a reusable music/festival campaign issue class.
2. Do not hardcode a one-off fix for a single slug.
3. Make the prompt and deterministic checks reusable across similar campaigns.

### Acceptance Criteria

1. A future music or listening campaign benefits from the same fix path.
2. The system becomes more robust by issue class, not by campaign patch.

---

## Campaign Priority

1. Open-deck music/festival legibility blockers.
2. Generic fallback overuse in still composition.
3. Reusable prompt/rule improvements for music-community campaigns.
4. Re-test drift only as a control after workflow fixes land.