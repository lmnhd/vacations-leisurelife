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

The following work appears to be implemented already and should be treated as landed pending live verification:

1. the brief route now acts as enqueue plus status instead of full synchronous generation
2. Brief Studio now polls job status instead of waiting on one long blocking request
3. failure diagnostics can now be attached to failed jobs

Live verification also established one new blocker:

1. jobs enqueue successfully
2. polling works
3. jobs remain stuck in `queued`
4. no worker step starts running

Because of that, the schedule changes here again: worker consumption must be fixed before further reruns are meaningful.

---

### Priority 1: Make queued worker-backed brief jobs actually execute

Why this comes first:

1. live verification showed the route and UI can enqueue and poll, but execution never starts
2. no amount of rerunning will help until queued jobs are consumed
3. campaign tuning is still wasted if the worker path is inert

Primary outputs:

1. queued jobs transition to `running`
2. worker steps advance beyond `pending`
3. terminal success or failure becomes reachable

---

### Priority 2: Verify the worker-backed regeneration flow live after queue consumption is fixed

Why this comes second:

1. the route and UI implementation have changed materially since the original timeout tests
2. we need a fresh control-case and problem-case run through the now-executing worker flow
3. only then can we see whether the remaining blocker is Pass 1 churn or something else

Primary outputs:

1. quick enqueue response from POST
2. terminal job status through polling
3. persisted success or actionable failed-job diagnostics

---

### Priority 3: Fix Pass 1 observability and schema/runtime churn if reruns still fail

Why this comes second:

1. prior evidence points to Pass 1 churn as the main wall-clock consumer
2. `WORK2.txt` identifies nested missing-field failures and object-array mismatches as likely root causes
3. if the worker path still fails, this is the highest-value technical fix area

Primary outputs:

1. flatter generation-time schema contract
2. less retry churn
3. more reliable first-pass validity
4. post-generation normalization handles fallbacks instead of the live model schema

---

### Priority 4: Harden the worker-backed status and diagnostics path

Why this comes third:

1. the worker-backed path appears to be implemented already
2. if reruns fail, the next leverage point is better persisted diagnostics and clearer terminal states
3. the route should remain a thin status surface, not drift back toward synchronous execution

Primary outputs:

1. reliable failed-job diagnostics
2. clearer worker step reporting
3. route remains enqueue plus status only
4. Brief Studio stays recoverable under failure

---

### Priority 5: Re-run workflow validation campaigns after technical fixes

Why this comes fourth:

1. drift is the control campaign
2. open-deck is the known problematic campaign
3. the same pair should be used again once workflow is stable

Primary outputs:

1. drift completes inside bounded runtime
2. open-deck completes inside bounded runtime
3. timing telemetry clearly identifies where time is spent

---

### Priority 6: Fix music/festival aesthetics issue class

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

1. identify why queued brief jobs are not being consumed
2. verify whether the worker process or worker subscription is missing
3. confirm that a queued brief job can transition to `running`

### Day 2

1. rerun `drift-festival-icon-2026` through the executing worker-backed brief flow
2. rerun `bp-opendeck-icon-2027-7n-caribbean` through the executing worker-backed brief flow
3. capture job completion or failed-job diagnostics from those runs

### Day 3

1. if reruns still fail, instrument Pass 1 attempts and fallback transitions
2. flatten generation-time schema shape where validation churn is worst
3. reduce nested missing-field failures
4. move fallback/default population into post-generation TypeScript normalization

### Day 4

1. harden worker diagnostics persistence and job-state reporting
2. verify that route lifetime no longer governs regeneration runtime
3. close any Brief Studio polling or recovery gaps exposed by reruns

### Day 5

1. rerun the same two campaigns after queue-consumption and Pass 1 fixes
2. confirm worker-backed reliability and stable telemetry
3. only then move to music/festival issue-class tuning if workflow is truly unblocked

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