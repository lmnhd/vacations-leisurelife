# Week 2 Overall Schedule

## Purpose

This schedule prioritizes the work by impact and dependency order.

The rule for week 2 is simple:

1. workflow reliability before campaign tuning
2. observability before paid reruns
3. reusable issue-class fixes before campaign-specific polish

---

## Priority Order

### Priority 1: Restore bounded regeneration reliability

Why this comes first:

1. both live test campaigns timed out at five minutes
2. no completed stage was returned before timeout
3. campaign tuning is wasted if the transport path cannot finish

Primary outputs:

1. attempt-level Pass 1 timing data
2. bounded Pass 1 failure behavior
3. clear success or failure state for each regeneration run

---

### Priority 2: Fix schema/runtime structured-output churn

Why this comes second:

1. current evidence points to Pass 1 churn as the main wall-clock consumer
2. missing nested fields and wrong array shapes are forcing repair loops
3. this directly affects route completion and worker cost

Primary outputs:

1. flatter generation-time schema contract
2. less retry churn
3. more reliable first-pass validity
4. post-generation normalization handles fallbacks instead of the live model schema

---

### Priority 3: Move regeneration onto the headless worker path

Why this comes third:

1. even with better schemas, regeneration remains too large to trust as a synchronous page-bound request
2. Brief Studio needs recoverable job semantics
3. `WORK2.txt` identifies the direct TypeScript/Node worker as the correct runtime for long-running generation loops

Primary outputs:

1. headless worker execution for full regeneration
2. thin route layer for enqueue and status
3. pollable status
4. persisted diagnostics for failures

---

### Priority 4: Re-run workflow validation campaigns

Why this comes fourth:

1. drift is the control campaign
2. open-deck is the known problematic campaign
3. the same pair should be used again once workflow is stable

Primary outputs:

1. drift completes inside bounded runtime
2. open-deck completes inside bounded runtime
3. timing telemetry clearly identifies where time is spent

---

### Priority 5: Fix music/festival aesthetics issue class

Why this comes fifth:

1. this is the main campaign-content problem after workflow is unblocked
2. open-deck is the best active test case

Primary outputs:

1. stronger explicit cue coverage
2. lower generic fallback usage
3. reusable music/festival guidance improvements

---

## Suggested Week 2 Sequence

### Day 1

1. instrument Pass 1 attempts and fallback transitions
2. identify exact time sink inside Pass 1
3. document provider, validation, and retry behavior from a single failed run

### Day 2

1. flatten generation-time schema shape where validation churn is worst
2. reduce nested missing-field failures
3. move fallback/default population into post-generation TypeScript normalization
4. verify that Pass 1 can complete within a bounded window

### Day 3

1. move regeneration onto the headless worker path
2. return job IDs from the route
3. expose resumable status in Brief Studio
4. ensure route lifetime no longer governs full regeneration runtime

### Day 4

1. rerun `drift-festival-icon-2026`
2. rerun `bp-opendeck-icon-2027-7n-caribbean`
3. confirm route reliability and capture stable timing telemetry

### Day 5

1. tune the music/festival issue class
2. reduce explicit blocker recurrence on open-deck
3. validate that fixes are reusable and not slug-specific hacks

---

## Stop Rules

Stop campaign-tuning work if either of these is still true:

1. the route still cannot complete reliably in bounded time
2. the failure diagnostics still do not identify the exact Pass 1 bottleneck

Stop workflow refactoring and move to campaign tuning only when both are true:

1. drift can regenerate successfully in bounded time
2. open-deck can regenerate successfully in bounded time, even if it still fails lint afterward

---

## Definition Of Done For Week 2

Week 2 is successful when all of the following are true:

1. regeneration is bounded and observable
2. failure diagnostics survive failed runs
3. Brief Studio no longer depends on a single long blocking request
4. drift completes as a control case
5. open-deck reaches the point where only true campaign-quality blockers remain