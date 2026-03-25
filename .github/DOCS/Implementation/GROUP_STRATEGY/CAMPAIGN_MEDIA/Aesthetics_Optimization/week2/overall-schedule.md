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

### Priority 1: Stabilize the Pass 1 schema contract

Why this comes first:

1. live verification already proved the worker path executes
2. the first flattening pass landed, but both verification campaigns still timed out in Pass 1
3. campaign tuning is still wasted until Pass 1 can return a valid structured payload without repair spirals

Primary outputs:

1. identify which fields in the new flat schema are still driving validation and repair churn
2. reduce remaining schema-repair loops enough that drift completes inside bounded runtime
3. keep fallback/default population in post-generation normalization
4. avoid expanding the contract again while debugging the remaining failure families

---

### Priority 2: Persist worker-visible failure diagnostics durably

Why this comes second:

1. failures are now happening in the worker, not at enqueue time
2. runtime verification proved diagnostics persistence is inconsistent across campaigns
3. paid reruns should not be required just to recover the last real failure context

Primary outputs:

1. both drift and open-deck persist non-null `failureDiagnostics` on failure
2. route responses reflect worker-generated failure context consistently
3. Brief Studio can display actionable diagnostics after refresh or reconnect for every failed job

---

### Priority 3: Finalize failed-step state truthfully

Why this comes third:

1. failed jobs currently leave `generate_brief` marked `running`
2. stale step state makes polling output less trustworthy for both users and the next engineer
3. this is a small but important correctness fix before more reruns

Primary outputs:

1. failed jobs mark the active step as `failed`
2. step messages explain the terminal failure reason
3. job-level and step-level status no longer contradict each other

---

### Priority 4: Re-run the control and problem campaigns after the technical fixes

Why this comes fourth:

1. `drift-festival-icon-2026` remains the control case
2. `bp-opendeck-icon-2027-7n-caribbean` remains the known difficult case
3. the same pair should validate the remaining Pass 1 fixes, diagnostics consistency, and step-state truthfulness

Primary outputs:

1. drift completes through the worker-backed flow inside bounded runtime
2. open-deck reaches a real terminal outcome with durable diagnostics
3. the team can distinguish workflow failure from campaign-quality failure cleanly
4. failed-step state is truthful if either campaign still fails

---

### Priority 5: Harden Pass 1 observability and bounding

Why this comes fifth:

1. even after schema cleanup, attempt-level timing should remain inspectable
2. bounded failures are cheaper and easier to reason about than opaque long retries
3. observability must survive failure, not only success

Primary outputs:

1. attempt-level Pass 1 timing remains visible
2. failure payloads explain whether the miss was timeout, schema repair, or provider latency
3. no single invisible retry loop dominates wall-clock time

---

### Priority 6: Fix the music/festival aesthetics issue class

Why this comes sixth:

1. this is the main campaign-content problem after workflow is unblocked
2. open-deck is the best active test case

Primary outputs:

1. stronger explicit cue coverage
2. lower generic fallback usage
3. reusable music/festival guidance improvements

---

## Suggested Week 2 Sequence

### Day 1

1. inspect the remaining validation and repair churn against the new flat Pass 1 schema
2. identify the exact fields still triggering repair before timeout
3. tighten or simplify those fields without reintroducing nested schema burden

### Day 2

1. make `failureDiagnostics` persistence consistent across both drift and open-deck failure paths
2. fix failed-step finalization so `generate_brief` does not remain `running` after terminal failure
3. verify that Brief Studio still renders the diagnostics contract cleanly

### Day 3

1. rerun `drift-festival-icon-2026` through the worker-backed brief flow
2. rerun `bp-opendeck-icon-2027-7n-caribbean` through the worker-backed brief flow
3. capture either successful completion or durable failed-job diagnostics with truthful step state

### Day 4

1. harden Pass 1 attempt telemetry and timeout visibility
2. verify that route lifetime no longer governs regeneration runtime
3. close any residual worker-state or polling gaps exposed by reruns

### Day 5

1. only after workflow is stable, move to music/festival issue-class tuning
2. use open-deck as the first campaign-quality test case
3. keep drift as a control whenever new prompt or issue-class guidance is introduced

---

## Stop Rules

Stop campaign-tuning work if either of these is still true:

1. drift still cannot complete worker-backed regeneration in bounded time
2. failed jobs still do not preserve the real Pass 1 failure detail durably and consistently

Stop workflow refactoring and move to campaign tuning only when both are true:

1. drift can regenerate successfully in bounded time
2. open-deck can reach a truthful terminal result in bounded time, even if it still fails lint or campaign-quality checks afterward

Do not treat the diagnostics task as complete while either of these is still true:

1. one failed campaign persists `failureDiagnostics` while another returns `null`
2. a failed job still leaves its active step marked `running`

---

## Definition Of Done For Week 2

Week 2 is successful when all of the following are true:

1. regeneration is bounded and observable
2. worker-generated failure diagnostics survive failed runs and can be read through the polling route consistently across campaigns
3. Brief Studio no longer depends on a single long blocking request
4. failed jobs expose truthful step-level status instead of stale `running` state
5. drift completes as a control case
6. open-deck reaches the point where only true campaign-quality blockers remain