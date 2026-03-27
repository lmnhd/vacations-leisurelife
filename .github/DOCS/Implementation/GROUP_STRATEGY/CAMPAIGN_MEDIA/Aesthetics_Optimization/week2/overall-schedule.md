# Week 2 Overall Schedule

## Purpose

This schedule records the verified state of week 2 after the workflow, schema, and artifact-separation modifications landed.

The rule for week 2 is now:

1. keep backend truthfulness ahead of UI polish
2. distinguish solved architecture work from remaining campaign-quality work
3. spend additional time only where it increases confidence or product usability

---

## Current Week 2 State

Week 2 backend goals are substantially met.

Verified current state:

1. the brief-generation system is bounded and observable through the worker-backed route plus polling model
2. failure diagnostics survive worker failures and are exposed consistently enough for debugging
3. the main schema-architecture failures from earlier in week 2 were addressed through coercions, lenient generation schemas, and deterministic post-processing
4. the artifact-separation refactor is operational in both sync and async paths
5. `bp-opendeck-icon-2027-7n-caribbean` no longer fails on the old repeated-composition false positive and now persists as `warn` with no blocking issues

Interpretation:

1. the remaining work is no longer “make the separation real” work
2. the remaining work is now regression confirmation, control-campaign confirmation, and optional route/client cleanup

---

## Verified Progress

### Workflow and observability

1. the brief route now behaves as enqueue plus status instead of one long synchronous request
2. Brief Studio polls job status rather than blocking on full generation
3. queued jobs are consumed by the worker and transition through truthful terminal states
4. worker-generated failure diagnostics survive failed runs and can be surfaced through the polling path
5. failed-step finalization is truthful instead of leaving stale `running` states behind

### Schema and deterministic remediation

1. `communityExpression` coercions removed the earlier `visualTogethernessNotes` type wall
2. `storyboards`, `sceneLibrary`, and related nested array outputs are now coerced instead of failing on keyed-object returns
3. `avoidList` to `avoidDirectives` carry-through is deterministic instead of relying on lucky wording
4. anchor compliance repair behavior is hardened so repair passes cannot silently make the state worse

### Artifact separation

1. isolated orchestrator operations exist for landing-stills regeneration, production-bible regeneration, and lint-only resync
2. landing-stills regeneration now clears downstream artifact state correctly by removing stale `productionBible` and stored lint
3. lint-only resync now refuses to certify a state where `landingStillBible` exists but `productionBible` is missing
4. one full sync sequence on `bp-opendeck-icon-2027-7n-caribbean` verified the invalidation and rebuild chain end to end
5. one real queued async `campaign_production_lint_resync` job was submitted, claimed by the worker, completed, and successfully polled back through the route

### Campaign-specific verification

**`bp-opendeck-icon-2027-7n-caribbean`**

1. the music/festival tuning from commit `7eaf7ef` is visibly working
2. the deterministic `music_deck_activity` classifier change in `production-build-lint.ts` is present and active
3. the campaign now persists with `productionBuildStatus: warn`
4. there are no blocking issues in the persisted production-build lint report
5. the current warning is: `3 stills share composition family "music_deck_activity" — all have explicit niche cues so this is thematic consistency, not generic collapse.`

**`drift-festival-icon-2026`**

1. week-2 docs already record schema-remediation success for this campaign
2. this campaign should now be treated as the next control-case confirmation target, not as an active separation blocker
3. its current saved state should be re-confirmed once before treating week 2 as fully closed

---

## Outcome

The week-2 architecture work succeeded.

That includes:

1. workflow reliability
2. schema remediation
3. deterministic lint/still safeguards
4. artifact separation in sync and async modes

The project is no longer blocked on week-2 backend architecture.

---

## Next Priority

### Priority 1: Re-confirm the control campaign state

Why this comes first:

1. the open-deck proof case is already verified
2. drift is the next best signal that the week-2 fixes generalize beyond one slug
3. this is the cleanest remaining confidence check before declaring week 2 backend work closed

Primary outputs:

1. confirm current saved/persisted state for `drift-festival-icon-2026`
2. confirm it still clears the old schema failure class
3. note any remaining issues as campaign-quality or lint-policy work, not architecture work

---

### Priority 2: Decide whether route/client cleanup is worth doing now

Why this comes second:

1. the backend proof is already complete
2. shared client helpers and UI affordances for the new artifact routes improve usability, not correctness
3. this work should be deliberate productization, not mistaken for required backend stabilization

Primary outputs:

1. shared client helpers for `landing-stills` and `production-lint`, if desired
2. consistent sync/async semantics across the artifact routes, if desired
3. clear UI affordances around stale-artifact status, if desired

---

### Priority 3: Run one broader regression only if more confidence is needed

Why this comes third:

1. one sync proof and one async proof already exist on open-deck
2. additional campaign reruns should be justified by confidence needs, not habit
3. this is the right place to spend extra runtime only if the team wants higher assurance before moving on

Primary outputs:

1. one additional campaign-level regression beyond open-deck
2. explicit note on whether any new failure is architectural, deterministic, or campaign-quality

---

## Suggested Next Sequence

### Day 1

1. re-confirm the saved state of `drift-festival-icon-2026`
2. record whether any remaining issues are content-quality warnings or blockers
3. update the week-2 docs if the control state differs from the last recorded run

### Day 2

1. decide whether to productize the new artifact routes in shared client/UI code
2. implement that only if it is worth the time now
3. otherwise stop and treat week-2 backend goals as closed

### Day 3

1. only run an additional broader regression if the team wants extra release confidence
2. otherwise move out of week-2 backend stabilization and into the next priority track

---

## Stop Rules

Do not reopen week-2 architecture work unless one of these becomes true again:

1. artifact separation stops invalidating or rebuilding downstream state correctly
2. lint resync can again certify a missing or stale production-bible state
3. drift or another control campaign reintroduces a real schema-contract failure

Treat the following as non-architecture work:

1. content-quality warnings on otherwise valid campaigns
2. composition-family policy tuning
3. route ergonomics or UI affordance improvements

---

## Definition Of Done For Week 2

Week 2 backend work is successful when all of the following are true:

1. regeneration is bounded and observable
2. worker-generated failure diagnostics survive failed runs and can be read through the polling route consistently across campaigns
3. Brief Studio no longer depends on a single long blocking request
4. failed jobs expose truthful step-level status instead of stale `running` state
5. schema-remediation fixes clear the original nested-output failure classes
6. artifact separation works in both sync and async modes
7. open-deck reaches the point where remaining issues are warnings or true campaign-quality issues rather than architecture failures

Current status:

1. criteria 1 through 7 are met for the verified open-deck proof path
2. one remaining confidence task remains: re-confirm the current control-campaign state
3. after that, week 2 backend modifications should be treated as complete

---

## Week 2 Summary

The current state of week 2 is:

1. workflow and worker reliability: verified
2. schema remediation: verified for the original blocker classes
3. artifact separation: verified in sync and async paths
4. open-deck campaign false-positive lint blocker: fixed
5. remaining work: regression confirmation and optional productization, not core backend rescue