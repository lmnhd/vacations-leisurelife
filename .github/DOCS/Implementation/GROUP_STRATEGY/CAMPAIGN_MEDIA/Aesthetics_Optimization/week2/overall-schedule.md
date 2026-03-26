# Week 2 Overall Schedule

## Purpose

This schedule prioritizes the work by impact and dependency order.

The rule for week 2 is simple:

1. workflow reliability before campaign tuning
2. observability before paid reruns
3. reusable issue-class fixes before campaign-specific polish

---

## Priority Order

## Verified Progress

The following workflow improvements are verified:

### Workflow fixes verified

1. the brief route now acts as enqueue plus status instead of full synchronous generation
2. Brief Studio now polls job status instead of waiting on one long blocking request
3. the worker queue-consumption bug has been fixed, so queued jobs now transition to `running`
4. live worker-backed runs now reach `generate_brief`
5. Pass 1 schema made lenient: all leaf fields and top-level objects have `.default()` values, `skipRepair: true` prevents expensive repair calls on validation failure
6. `failureDiagnostics` now built durably in `runner.ts` catch block from error + orchestrator timing snapshot — no longer process-local only
7. failed-step finalization fixed: `generate_brief` marked `failed`, pending steps marked `skipped`, job-level and step-level status are no longer contradictory
8. Pass 2 split into two parallel LLM calls (`Pass2SocialSchema` + `Pass2VideoSchema`) with lenient schemas and `skipRepair: true`
9. Refinement schema excludes `socialConcepts`/`videoConcepts` (carried forward from Pass 2), uses lenient merch schema override
10. All `editors-room.ts` generation schemas replaced with lenient versions (`LenientStillSpecSchema`, `LenientProductionBibleSchema`, etc.) with `skipRepair: true` on every call
11. `coerceToArray` preprocess added to `LenientProductionBibleSchema.storyboards` and `sceneLibrary` to handle model returning keyed objects instead of arrays
12. `maxOutputTokens` raised across the full pipeline: anchors (8000), landing stills (16000), repair stills (12000), production bible (16000 + 240s timeout), refinement (14000), Pass 2 social/video (16000)
13. `callGlobalGenerateObject` global token cap raised from 16000 to 32000

### Tuning verification status

Recent worker-backed verification changed the conclusion:

**bp-opendeck-icon-2027-7n-caribbean**
1. music/festival identity tuning clearly worked
2. `weak_niche_signal` and `identity_legibility_too_low` cleared
3. slogans and belonging signals now carry concrete music/open-deck proof
4. production build still fails, but now for an isolated schema/output issue: `avoid_directives_too_weak`
5. storyboard `shotSequence` arrays returned empty, which points back to the nested schema/default problem documented in `WORK2.txt`

**drift-festival-icon-2026**
1. should not be treated as a clean control yet
2. a native async run crashed in Pass 1 with Zod validation on `communityExpression.visualTogethernessNotes`
3. this confirms the remaining blocker is still schema architecture, not campaign-quality tuning

### Stop rule status

The stop rules are not fully cleared:

1. open-deck proved the tuning layer works, but not the full production-build pipeline
2. drift still fails on a known schema wall

Week 2 Definition of Done status:

1. workflow reliability improvements are real
2. the music/festival issue-class tuning is verified
3. the remaining failures are still schema-contract failures
4. week 2 is not complete until those schema failures are resolved

---

## Outcome

The music/festival tuning work is validated, but workflow/schema stabilization is not yet complete.

The next agent should treat the remaining blockers as architecture work in the generation schemas, not as prompt-quality work.

---

## Next Priority

### Priority 1: Fix remaining schema architecture blockers

Why this comes first now:

1. open-deck quality tuning succeeded, so the next failures are not aesthetic misses
2. storyboard `shotSequence` arrays still collapse to empty output
3. drift still fails at Pass 1 on `communityExpression.visualTogethernessNotes`

Primary outputs:

1. flatten or de-default the remaining nested schema trouble spots
2. fix storyboard generation so `shotSequence` does not come back empty
3. stabilize `communityExpression` generation so drift can run as control again

---

### Priority 2: Make avoid-list carry-through deterministic

Why this comes second:

1. open-deck now fails on one isolated rule: `avoid_directives_too_weak`
2. the miss is deterministic enough that it should not be left to weak schema compliance
3. avoid-list to avoid-directives mapping is now the clearest remaining production-build blocker on open-deck

Primary outputs:

1. `productionBible.avoidDirectives` reflects the brief `avoidList` strongly enough to satisfy validation
2. open-deck can move from `fail` toward `warn` or `pass`
3. this rule no longer depends on lucky LLM wording

---

### Priority 3: Re-run open-deck through the worker-backed path

Why this comes third:

1. open-deck is the best active proof case
2. the music/festival tuning is already validated, so reruns should now confirm schema-side remediation
3. successful rerun should remove the remaining production-build blocker

Primary outputs:

1. `productionBuildStatus` improves from `fail`
2. `avoid_directives_too_weak` clears
3. no regression in the music/festival identity improvements from commit `7eaf7ef`

---

### Priority 4: Re-run drift only after schema fixes land

Why this comes fourth:

1. drift is currently failing on a known schema problem, so it is not yet a useful control
2. once the schema issue is fixed, drift becomes the correct regression check again
3. using it too early only reconfirms the same architectural blocker

Primary outputs:

1. drift completes through Pass 1 without the `visualTogethernessNotes` type failure
2. drift can be used again as the control campaign
3. schema fixes prove reusable across campaign types

---

## Quality Tuning Phase 1 — Verified (commit 7eaf7ef)

### Changes implemented

1. **`aesthetic-engine.ts`**
   - Exported `isMusicFestivalCampaign` for shared use across modules
   - Strengthened `musicFestivalPass1Block`: explicit belonging-signal count (4 minimum, 3 must be music-cue-bearing with observable behavior patterns), socialGravity and corePromise specificity requirements, visual imageryMood and nicheEnhancedMoments requirements, compositionNotes open-deck geometry requirement
   - Added Check 5 to `checkSloganQuality`: music campaigns fail if slogans contain none of a curated music signal term list
   - Updated `checkSloganQuality` call to pass `isMusicFestivalCampaign(campaign)` flag
   - Added `musicFestivalRefinementBlock` to `refineAestheticBrief`: protects crowd energy, open-deck, dancing language from being stripped during refinement; strengthens vague belonging signals; enforces slogan music-anchor requirement at refinement stage
   - Expanded `MUSIC_FESTIVAL_LINT_KEYWORDS` in `buildLintComplianceBlock` so music campaigns get a full 25-term vocabulary in the lint compliance prompt
   - Strengthened `musicFestivalNicheBlock` with 5 named required signal families (DECK ENERGY, PERFORMANCE PROXIMITY, PERSONAL LISTENING, CROWD RECOGNITION, AUDIO ENVIRONMENT), added `generic pool lounging` to banned compositions, and added per-still field enforcement requirement

2. **`editors-room.ts`**
   - Imported `isMusicFestivalCampaign`
   - `generateActionAnchors`: injects `musicAnchorBlock` for music campaigns — 4 required music anchor families with concrete communityAction, locationFamily, nicheSignal, and socialUnit patterns; banned anchor seeds list
   - `generateProductionBibleFromStills`: injects `musicBibleBlock` — open-deck scene count requirement, direct music-response scene requirement, storyboard musicCue escalation arc requirement, 4 additional avoidDirectives

3. **`reference-packs.ts`**
   - `getExpandedNicheKeywords` now expands to `MUSIC_FESTIVAL_EXPANDED_KEYWORDS` (25 terms) when no reference pack exists and `isMusicFestivalCampaign` is true — this ensures the lint scanner uses the full music vocabulary when evaluating bp-opendeck

### Verified effect

The quality tuning itself worked:

1. hero slogan: `Sail first, chase the drop.`
2. sub slogan: `Icon of the Seas. 7 nights. Your soundtrack, your pace.`
3. belonging signals now describe concrete observable music behaviors
4. anchors and scene planning now carry open-deck crowd and sound-system context

### Next step

1. fix the schema-side blockers
2. rerun `bp-opendeck-icon-2027-7n-caribbean`
3. use `drift-festival-icon-2026` as control only after the schema crash is fixed

---

## Suggested Next Sequence

### Day 1

1. inspect the remaining nested schema/default trouble spots
2. fix `communityExpression.visualTogethernessNotes` generation contract
3. fix storyboard `shotSequence` generation contract

### Day 2

1. make avoid-list to avoid-directives carry-through deterministic
2. rerun open-deck through the worker-backed path
3. confirm the music/festival improvements remain intact while the production-build blocker clears

### Day 3

1. rerun drift after the schema fixes land
2. confirm drift is usable again as control
3. only then return to campaign-quality tuning work

---

## Stop Rules

Stop campaign-quality tuning and return to schema remediation if either of these is still true:

1. drift still fails on the `communityExpression.visualTogethernessNotes` schema wall
2. open-deck still returns empty storyboard `shotSequence` arrays or `avoid_directives_too_weak`

Move back to campaign-quality tuning only when both are true:

1. drift can regenerate successfully through the worker-backed path again
2. open-deck can clear the remaining schema-driven production-build blocker

---

## Definition Of Done For Week 2

Week 2 is successful when all of the following are true:

1. regeneration is bounded and observable
2. worker-generated failure diagnostics survive failed runs and can be read through the polling route consistently across campaigns
3. Brief Studio no longer depends on a single long blocking request
4. failed jobs expose truthful step-level status instead of stale `running` state
5. drift completes as a control case
6. open-deck reaches the point where only true campaign-quality blockers remain

This definition of done is not yet met. The music/festival tuning is good, but the remaining blockers are still architectural schema issues.