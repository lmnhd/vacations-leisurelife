# Week 2 Workflow Issues

## Purpose

This document isolates workflow, transport, orchestration, and schema/runtime problems from campaign-quality problems.

These issues must be treated as system reliability work, not prompt-tuning work.

---

## Current Status

The worker-backed brief flow has now been validated far enough to separate solved workflow problems from the narrower schema-contract failures that still remain.

Verified current state:

1. the brief route now enqueues work and returns quickly
2. Brief Studio polls job status instead of waiting on one long request
3. queued jobs are now being consumed by the worker
4. open-deck quality tuning clearly improved music/festival identity
5. workflow observability is durable enough for the next phase of schema debugging

The large workflow blockers from earlier in week 2 are mostly closed:

1. Pass 1 truncation and repair-loop timeouts have been neutralized through lenient generation schemas, higher token budgets, and `skipRepair: true`
2. worker failure diagnostics are now durable at the job level instead of process-local only
3. failed-step finalization is truthful

But recent verification proved week 2 is not actually complete yet.

The remaining blockers are still schema architecture blockers:

1. open-deck still returns empty storyboard `shotSequence` arrays
2. open-deck still fails production build on `avoid_directives_too_weak`
3. drift still fails at Pass 1 on `communityExpression.visualTogethernessNotes`

This means the music/festival tuning work is validated, but schema remediation is still the active workflow task.

---

## Workflow Summary

Week 2 largely solved the following workflow issues:

1. queue consumption
2. Pass 1 timeout and repair-loop churn
3. diagnostics durability across the worker boundary
4. truthful job and step terminal state
5. bounded end-to-end execution through the worker path

Verified tuning result:

1. `bp-opendeck-icon-2027-7n-caribbean` now shows strong music/festival identity and cleared the earlier identity blockers
2. the remaining failures are tied to schema/output structure, not generic campaign quality

At this point, remaining issues should be treated as schema-contract problems first, then campaign-quality work can resume.

---

## Active Next Issue Class

The next agent should focus on schema remediation for the remaining nested output failures.

Priority schema targets:

1. `communityExpression.visualTogethernessNotes`
2. storyboard `shotSequence`
3. deterministic or stronger carry-through from `avoidList` to `avoidDirectives`

---

## Workflow Priority

Workflow priority is not yet cleared for week 2.

The next priority is schema remediation so the tuned campaign output can clear the remaining production-build blockers.

Do not treat week 2 as complete until those schema issues are fixed.