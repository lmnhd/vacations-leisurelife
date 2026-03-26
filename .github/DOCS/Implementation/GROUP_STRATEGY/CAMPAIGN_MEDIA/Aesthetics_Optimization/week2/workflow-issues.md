# Week 2 Workflow Issues

## Purpose

This document isolates workflow, transport, orchestration, and schema/runtime problems from campaign-quality problems.

These issues must be treated as system reliability work, not prompt-tuning work.

---

## Current Status

The worker-backed brief flow has now been validated far enough to separate solved workflow problems from the next campaign-quality phase.

Verified current state:

1. the brief route now enqueues work and returns quickly
2. Brief Studio polls job status instead of waiting on one long request
3. queued jobs are now being consumed by the worker
4. both drift and open-deck complete end to end through the worker-backed path
5. workflow observability is durable enough for the next phase

The workflow blockers that were active earlier in week 2 are now closed:

1. Pass 1 truncation and repair-loop timeouts have been neutralized through lenient generation schemas, higher token budgets, and `skipRepair: true`
2. worker failure diagnostics are now durable at the job level instead of process-local only
3. failed-step finalization is truthful

This means campaign tuning is no longer downstream. It is now the active phase.

---

## Workflow Summary

Week 2 solved the following workflow issues:

1. queue consumption
2. Pass 1 timeout and repair-loop churn
3. diagnostics durability across the worker boundary
4. truthful job and step terminal state
5. bounded end-to-end execution through the worker path

Verified completed runs:

1. `drift-festival-icon-2026` completed with `readiness=needs_review` and `blockerCount=0`
2. `bp-opendeck-icon-2027-7n-caribbean` completed with `readiness=needs_review` and `blockerCount=0`

At this point, remaining issues should be treated as campaign-quality problems unless a fresh regression proves otherwise.

---

## Active Next Issue Class

The next agent should focus on music/festival campaign quality, especially open-deck identity strength.

Priority quality targets:

1. stronger explicit music/festival cue coverage
2. lower generic fallback usage
3. more distinct open-deck identity and concept language

---

## Workflow Priority

Workflow priority has been cleared for week 2.

The next priority is campaign-quality tuning.

Do not reopen workflow work unless a fresh regression is observed.