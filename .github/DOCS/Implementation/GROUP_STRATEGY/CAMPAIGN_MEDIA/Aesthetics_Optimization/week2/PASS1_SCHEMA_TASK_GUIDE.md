# Pass 1 Schema Task Guide

## Purpose

Stabilize Pass 1 brief generation so the worker can complete `generate_brief` without falling into long schema-repair and timeout loops.

This task is active again because recent verification exposed remaining schema-contract failures.

---

## Updated Verified State

The latest verification changed the conclusion:

1. the lenient-schema and token-budget work improved the pipeline substantially
2. the music/festival tuning pass is verified and operational
3. open-deck still shows nested schema weakness through empty storyboard `shotSequence` arrays
4. drift still hits a Pass 1 schema validation failure at `communityExpression.visualTogethernessNotes`

This means schema architecture is still an active blocker even though the original truncation/repair-loop failure pattern was reduced.

---

## Root Cause That Remains

The remaining failure pattern is now narrower and more specific:

1. nested schema branches still collapse or type-shift under generation
2. `.default()` and deep object structure are still likely weakening the prompt contract for complex nested outputs
3. arrays such as storyboard `shotSequence` can still come back structurally empty
4. fields such as `communityExpression.visualTogethernessNotes` can still arrive with the wrong type

The earlier fixes helped, but they did not fully remove the schema contract problem.

The next fix should target the remaining nested-schema architecture directly.

---

## Primary Files

Generation entry point:

1. `lib/campaigns/aesthetic-engine.ts`

Persisted schema source:

1. `lib/campaigns/schema.ts`

Structured-output and repair loop:

1. `lib/chat/llm-call.ts`

---

## Files And Patterns Used

Primary files involved:

1. `lib/campaigns/aesthetic-engine.ts`
2. `lib/chat/llm-call.ts`

Primary pattern used:

1. lenient defaults on generation schemas
2. higher `maxOutputTokens`
3. `skipRepair: true` on stages where repair loops were causing the actual failures

---

## Active Fix Targets

1. `communityExpression.visualTogethernessNotes`
2. storyboard `shotSequence`
3. any remaining nested array/object generation contracts that still depend on fragile defaults

---

## Verified Good News

What is working:

1. open-deck quality tuning worked and cleared the core music/festival identity blockers
2. the workflow is far closer to stable than it was earlier in week 2
3. the remaining work is now isolated to specific schema trouble spots rather than the whole pipeline

---

## Non-Goal Going Forward

Do not reopen this task unless one of these regresses:

1. Pass 1 timeouts return broadly across campaigns
2. repair loops reappear as a dominant cost center
3. later stage changes reintroduce truncation through stricter schemas or lower token budgets

But do keep this task active until the remaining nested schema failures are fixed.

---

## Done Signal

This task is complete only when:

1. drift no longer fails on `communityExpression.visualTogethernessNotes`
2. open-deck no longer returns empty storyboard `shotSequence` arrays
3. schema-side blockers stop preventing the tuned campaign output from clearing production-build validation

