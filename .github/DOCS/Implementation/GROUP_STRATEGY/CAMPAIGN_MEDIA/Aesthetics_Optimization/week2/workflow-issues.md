# Week 2 Workflow Issues

## Purpose

This document isolates workflow, transport, orchestration, and schema/runtime problems from campaign-quality problems.

These issues must be treated as system reliability work, not prompt-tuning work.

---

## Current Status

The worker-backed brief flow has now been validated far enough to separate solved workflow problems from the smaller follow-through tasks that still remain.

Verified current state:

1. the brief route now enqueues work and returns quickly
2. Brief Studio polls job status instead of waiting on one long request
3. queued jobs are now being consumed by the worker
4. open-deck quality tuning clearly improved music/festival identity
5. workflow observability is durable enough to support both sync and async artifact verification

The large workflow blockers from earlier in week 2 are mostly closed:

1. Pass 1 truncation and repair-loop timeouts have been neutralized through lenient generation schemas, higher token budgets, and `skipRepair: true`
2. worker failure diagnostics are now durable at the job level instead of process-local only
3. failed-step finalization is truthful
4. schema-remediation fixes for `communityExpression`, `shotSequence`, and `avoidDirectives` have already landed and are no longer the active blocker
5. artifact separation is verified in both sync and async modes

Recent verification also changed the old week-2 conclusion.

The issues that used to define week 2 as "not complete" are no longer active architecture blockers:

1. `bp-opendeck-icon-2027-7n-caribbean` no longer fails on `avoid_directives_too_weak`
2. `bp-opendeck-icon-2027-7n-caribbean` now persists as `warn` with no blocking issues after the deterministic `music_deck_activity` classifier fix
3. `drift-festival-icon-2026` no longer reproduces the old `communityExpression.visualTogethernessNotes` schema wall
4. a cheap lint resync on `drift-festival-icon-2026` showed that its stored `fail` state had drifted and correctly resynced to `warn`

This means the music/festival tuning work is validated, schema remediation is validated, and artifact separation is validated.

The active workflow task is no longer backend rescue. It is keeping persisted state truthful and avoiding unnecessary rework.

---

## Workflow Summary

Week 2 largely solved the following workflow issues:

1. queue consumption
2. Pass 1 timeout and repair-loop churn
3. diagnostics durability across the worker boundary
4. truthful job and step terminal state
5. bounded end-to-end execution through the worker path
6. stale artifact invalidation after still regeneration
7. lint-only resync protection against missing production-bible state

Verified tuning result:

1. `bp-opendeck-icon-2027-7n-caribbean` now shows strong music/festival identity and cleared the earlier identity blockers
2. `bp-opendeck-icon-2027-7n-caribbean` now lands at `warn`, not `fail`, with no production-build blocking issues
3. `drift-festival-icon-2026` currently resyncs to `warn`, confirming the remaining week-2 work is no longer schema-wall debugging

At this point, remaining issues should be treated as one of two smaller classes:

1. persisted-state truthfulness, such as stale saved lint verdicts
2. productization work around the separated artifact routes

---

## Active Next Issue Class

The next agent should not default back to schema remediation.

Priority issue classes now are:

1. re-confirm that any remaining stored lint state across known campaigns matches current deterministic recomputation
2. decide whether to expose the separated `landing-stills` and `production-lint` routes in shared client/UI helpers
3. run additional regression checks only if more release confidence is needed

---

## Workflow Priority

Workflow priority is largely cleared for week 2.

The next priority is to avoid reopening solved architecture work unnecessarily.

Treat week 2 backend work as effectively complete unless a new concrete regression reopens one of the solved issue classes.