# Current Phase: NONE — Benchmark-Clean

> Last closed phase: **Venue Taxonomy Coverage And Scenic Cluster Stability** (commit `384308c`)
> All acceptance criteria met. No active phase.

---

# Closed Phase: Venue Taxonomy Coverage And Scenic Cluster Stability

## Mission

Keep the Editor's Room pipeline as implemented, preserve the cue-legibility and anti-generic gains already established, and harden deterministic coverage for broader venue phrasing and scenic composition variation.

The next phase is not another architecture pivot.
The next phase is to make the current system hold across a wider set of cruise venues and atmospheric campaign types.

## Why This Phase Exists

A wider 10-campaign diagnostic sweep has now been run.

The strongest outcome is positive:

1. all 10 campaigns held at `6/6` explicit cue stills
2. all 10 campaigns held at `0/6` no-cue stills
3. all 10 campaigns held at `0/6` generic-fallback stills

That means the current system is no longer mainly failing on identity legibility.

The wider sweep also exposed the real remaining failure classes:

1. location-family drift in broader venue phrasing
2. scenic composition-cluster collapse in atmospheric campaigns

So the bottleneck is now deterministic classifier coverage, not prompt identity quality.

## Verified State Entering This Phase

Current measured state:

1. stitch remains clean in the wider sweep
2. sketchbook remains clean in the wider sweep
3. tabletop can clear on rerun but showed one stochastic anchor-drift run in the broader sweep
4. tea and makers-ascent also cleared in the wider sample
5. readers, pride, retro-handheld, and film-and-zine exposed anchor-location drift outside the original proving trio
6. night-sky exposed scenic composition-family collapse without losing niche cues

The unresolved product question is now:

1. can broader venue phrasing be made classifier-stable without regressing the proving trio
2. can scenic/atmospheric campaigns avoid composition-family collapse without weakening the lint gate

## Core Diagnosis

The broader sweep narrowed the remaining work to two reusable deterministic classes.

### Class A: Venue Taxonomy Coverage

The classifier still under-models compound and adjacent venue phrases such as:

1. spa solarium scenes that mention a pool
2. balcony scenes that also include lounge or architectural descriptors
3. atrium, lounge, library, and dining-window phrases where incidental words pull the still into the wrong family

### Class B: Scenic Composition-Cluster Stability

Atmospheric campaigns can still collapse into the same scenic family even when niche signals remain explicit.

Observed pattern:

1. skywatching deck scenes repeatedly resolve to `deck_sea_wide`
2. some quiet/location-heavy scenes still flatten into a single composition family when the activity is legible but the classifier is too coarse

The next step is therefore deterministic taxonomy and cluster refinement, not broader prompt rewrites.

## Active Strategy

Priority order:

1. keep stitch and sketchbook stable at `0 / 0`
2. harden broader venue-family inference using real failing phrasing from readers, film, pride, retro, and tabletop reruns
3. refine scenic composition clustering so atmospheric campaigns like night-sky do not trip `repeated_composition_family` just because they are all sky/deck adjacent
4. rerun the wider cohort after deterministic changes

This phase is deterministic classifier hardening, not prompt tuning.

## Product Target

Desired workflow:

1. one shared brief pipeline serves UI and agent callers
2. niche cues remain explicit even outside reference-packed families
3. venue-family inference remains stable across a broader cruise vocabulary
4. scenic campaigns keep visual diversity without false composition-collapse blockers

## Non-Negotiable Constraints

1. do not weaken anchor or lint thresholds to absorb venue-taxonomy misses
2. do not reopen stitch or sketchbook fixes unless a fresh regression proves they broke
3. do not respond with campaign-specific hacks when a reusable taxonomy rule is possible
4. do not treat warning-only scenic clusters as solved by simply raising thresholds
5. keep native structured outputs, deterministic lint, and anchor compliance in the primary path

## Scope Of Work

### Phase A: Expand Venue-Family Taxonomy

Use the failing broader-sample phrases to harden `LOCATION_FAMILY_KEYWORDS` and related inference logic.

Priority examples:

1. spa solarium scenes that mention a pool should still resolve to `spa`
2. balcony scenes with lounge/chair wording should still resolve to `balcony` when the private cabin context is explicit
3. atrium, library, dining, and lounge scenes should not lose to incidental structural words or scenic terms

### Phase B: Refine Scenic Composition Clusters

Target atmospheric collapse without weakening blocker thresholds.

Priority examples:

1. `deck_sea_wide` overuse in stargazing / skywatching campaigns
2. scenic quiet scenes that are semantically distinct but classifier-coarse

### Phase C: Re-Benchmark Wider Cohort

Rerun the same wider cohort and confirm:

1. stitch and sketchbook stay clean
2. broader-sample anchor drift decreases materially
3. night-sky style scenic blockers are reduced through better classification, not threshold weakening

## Relevant Files

- `tests/phase-2c-diagnostic-breakdown.ts`
- `tests/phase-2c-direct-library.ts`
- `lib/campaigns/editors-room.ts`
- `lib/campaigns/brief-engine/orchestrator.ts`
- `lib/campaigns/media/production-build-lint.ts`
- `.github/DOCS/Implementation/GROUP_STRATEGY/CAMPAIGN_MEDIA/Aesthetics_Optimization/phase-result.md`

## Acceptance Criteria

The phase is complete only when all of the following are true:

1. stitch and sketchbook remain clean
2. tabletop does not regress beyond warning-level noise on rerun
3. broader-sample anchor-location drift is reduced across the known failing cohort
4. night-sky-style scenic collapse is reduced without threshold weakening
5. cue strength and anti-generic performance remain intact across the same cohort

## Verification

Primary commands:

- targeted `npx tsx tests/phase-2c-diagnostic-breakdown.ts <campaign-slug>` for the wider failing cohort
- `npx tsx tests/phase-2c-direct-library.ts` for representative regression confirmation if needed

Regression commands after deterministic changes:

- `npx tsx lib/campaigns/__tests__/anchor-compliance.test.ts`
- `npx tsx lib/campaigns/__tests__/production-build-quality.test.ts`
- `npx tsx lib/campaigns/__tests__/brief-engine.orchestrator.test.ts`
- `npx tsx lib/campaigns/__tests__/brief-engine.validation.test.ts`
- `npx tsx lib/campaigns/__tests__/reference-packs.test.ts`

## Next Agent Instructions

### Objective

Harden venue-family inference and scenic composition clustering using the broader coverage sweep results, without regressing the proving trio.

### Do First

1. read the latest entries in `phase-result.md`
2. treat stitch and sketchbook as locked baselines to protect
3. use the wider-sweep failing campaigns as the deterministic input set
4. do not reopen cue-legibility work unless a regression proves it returned

### Primary Task

1. fix reusable venue-taxonomy misses
2. fix scenic composition over-collapse
3. rerun the wider cohort
4. record before/after coverage in `phase-result.md`

### Do Not Do

1. do not weaken thresholds to hide composition collapse
2. do not patch only one campaign when the same phrase pattern appears across several
3. do not reopen reference-pack work first unless classifier fixes fail to move the broader cohort
4. do not regress stitch or sketchbook while broadening taxonomy coverage

### Required Proof For Completion

Minimum proof:

1. wider failing cohort rerun after code changes
2. explicit before/after anchor and blocker counts for the known failing campaigns
3. confirmation that cue strength and generic-fallback counts did not regress
4. confirmation that stitch and sketchbook stayed clean

### Required `phase-result.md` Update

Update `phase-result.md` with:

1. the failing cohort before/after measurements
2. the exact taxonomy and composition rules that changed
3. whether broader aesthetic readiness materially improved after the deterministic pass
