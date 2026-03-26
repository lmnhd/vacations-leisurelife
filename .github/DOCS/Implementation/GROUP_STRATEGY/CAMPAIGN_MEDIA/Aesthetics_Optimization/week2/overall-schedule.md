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

The following work is now fully verified as of session ending 2026-03-24:

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

### End-to-end campaign runs verified

**drift-festival-icon-2026** — completed `status=completed`, all steps done, brief persisted, `readiness=needs_review`, `blockerCount=0`
- Pass 1: ~98s, attempt 1 accepted
- Pass 2 social+video: parallel, ~94s + ~115s, no repair
- Refinement: ~108s, no repair
- Anchors: ~80s, no repair
- Landing stills: ~114s, no repair
- Production bible: succeeded via gpt-5-mini retry (coerceToArray preprocess now prevents this)

**bp-opendeck-icon-2027-7n-caribbean** — completed `status=completed`, all steps done, brief persisted, `readiness=needs_review`, `blockerCount=0`
- Pass 1: ~108s, attempt 1 accepted
- Pass 2 social+video: parallel, ~85s + ~93s, no repair
- Refinement: ~104s, no repair
- Anchors: ~79s, no repair
- Landing stills: ~114s, no repair
- Production bible: ~115s, attempt 1 success (coerceToArray preprocess working)

### Stop rule status

Both stop rules are now cleared:

1. drift completed worker-backed regeneration in bounded time
2. open-deck reached a truthful terminal result in bounded time

Week 2 Definition of Done status:

1. regeneration is bounded and observable
2. worker-generated failure diagnostics survive failed runs (durable in DynamoDB via runner.ts)
3. Brief Studio no longer depends on a single long blocking request
4. failed jobs expose truthful step-level status instead of stale `running` state
5. drift completes as a control case
6. open-deck reaches the point where only true campaign-quality blockers remain

---

## Outcome

Week 2 workflow stabilization is complete.

The next agent should not spend time reopening queue, timeout, repair-loop, or worker-diagnostics architecture unless a new regression appears.

The active focus now moves to campaign-quality tuning, with music/festival identity strength as the next issue class.

---

## Next Priority

### Priority 1: Fix the music/festival aesthetics issue class

Why this comes first now:

1. workflow reliability is now proven end to end
2. both control and problem campaigns complete successfully through the worker path
3. the remaining problems are campaign-quality problems, not pipeline blockers

Primary outputs:

1. stronger explicit music/festival cue coverage
2. lower generic fallback usage in open-deck identity and concepts
3. reusable guidance for music/listening/open-deck campaigns

---

### Priority 2: Re-run open-deck only as needed for campaign-quality tuning

Why this comes second:

1. open-deck is now a valid campaign-quality test case because the workflow is stable
2. reruns should now evaluate aesthetic identity quality, not pipeline survival
3. drift can remain the control whenever a tuning change risks regressing general quality

Primary outputs:

1. verified improvements in open-deck campaign specificity
2. no regression in control-campaign output quality
3. only true aesthetic blockers remain

---

### Priority 3: Preserve the stabilized worker-backed architecture

Why this comes third:

1. the workflow layer is now good enough and should not be destabilized casually
2. future tuning work should reuse the lenient-generation plus skip-repair pattern where appropriate
3. any new regressions should be treated as exceptions, not as a reason to reopen completed week 2 work

Primary outputs:

1. keep the route thin: enqueue plus status only
2. keep diagnostics durable at the job level
3. keep large generation stages lenient enough to avoid repair-loop regressions

---

## Quality Tuning Phase 1 — Completed (commit 7eaf7ef)

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

### Next step

Rerun `bp-opendeck-icon-2027-7n-caribbean` through Brief Studio and compare:
- `readiness` should still be `needs_review` → `ready_for_media` after approval
- `productionBuildStatus` should move from `fail` to `warn` or `pass`
- `weak_niche_signal`, `identity_legibility_too_low`, `repeated_composition_family` blockers should clear
- Use `drift-festival-icon-2026` as control to confirm no regression

---

## Suggested Next Sequence

### Day 1 — DONE

1. review completed week 2 workflow changes before editing prompts or campaign logic 
2. inspect open-deck output for generic or weak music/festival identity 
3. identify the reusable issue class to tune 
4. implement music/festival quality improvements across all pipeline stages 

### Day 2

1. rerun open-deck and compare against latest successful baseline
2. check lint verdict and blocker count
3. use drift as control if any change risks broader regressions

### Day 3

1. document which quality issues remain after tuning
2. promote reusable quality rules into the campaign guidance system
3. avoid reopening week 2 workflow work unless a concrete regression is observed

---

## Stop Rules

Stop campaign-quality tuning and re-open workflow only if either of these becomes true again:

1. drift or open-deck stops completing through the worker-backed path in bounded time
2. durable job diagnostics regress or step state becomes untruthful again

Stay in campaign-quality tuning when both are true:

1. drift can regenerate successfully in bounded time
2. open-deck can reach a truthful terminal result in bounded time, even if it still fails lint or campaign-quality checks afterward

---

## Definition Of Done For Week 2

Week 2 is successful when all of the following are true:

1. regeneration is bounded and observable
2. worker-generated failure diagnostics survive failed runs and can be read through the polling route consistently across campaigns
3. Brief Studio no longer depends on a single long blocking request
4. failed jobs expose truthful step-level status instead of stale `running` state
5. drift completes as a control case
6. open-deck reaches the point where only true campaign-quality blockers remain

This definition of done is now met. Week 2 should be treated as complete unless a new workflow regression appears.