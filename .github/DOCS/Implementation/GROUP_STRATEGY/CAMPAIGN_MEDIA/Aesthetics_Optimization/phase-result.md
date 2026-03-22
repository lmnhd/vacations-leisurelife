# Phase Result: Architecture Pivot For Aesthetic Briefs

## Current Status

The project is no longer pursuing incremental prompt-balancing as the primary solution for aesthetic brief quality.

Recent work established three durable facts:

1. Approval and readiness gate correctness are fixed.
2. Stale stored production-build status drift is fixed.
3. Prompt-negation tuning for the still-generation layer is not stable enough to trust as the long-term path.

The active decision is to replace the monolithic visual-planning generation pattern with an architecture-first `Editor's Room` pipeline.

## What Already Worked

### Phase 2A

- Gate-time production-build lint recomputation and resync were implemented.
- Readiness and approval no longer trust stale persisted fail state.
- False blocks caused by stale stored lint drift were eliminated.

### Phase 2B

- Prompt and guidance improvements produced a real live improvement on the representative sample.
- At the strongest measured point, the sample improved to `2/3` campaigns ready for media with `2` production-build blockers remaining.
- This proved that quality could move materially, but it did not prove the prompt-led approach was stable enough to keep scaling.

## What Failed

### Phase 2C Prompt-Balancing Attempt

- The negation-heavy prompt-tuning pass did not generalize cleanly.
- Live verification regressed on representative campaigns.
- The system remained vulnerable to the same core pattern:
	- overloaded prompt responsibilities
	- brittle niche expression
	- generic fallback clustering
	- unstable still-set behavior across reruns

This was the decisive signal that the remaining issue is architectural rather than editorial.

## Root Cause

The current monolithic generation step is trying to do too many jobs at once:

- interpret campaign identity
- invent niche-native moments
- satisfy slot distribution
- generate still prompts
- avoid generic fallbacks
- preserve production constraints
- maintain schema validity
- self-correct under lint pressure

That responsibility stack is too large for one generation step to handle reliably. The result is oscillation rather than convergence.

## Active Solution Direction

The approved direction is now an `Editor's Room` pipeline.

Instead of one overloaded generation pass, the system should use a small sequence of specialized steps:

1. generate community-native action anchors
2. generate `landingStillBible` from those locked anchors plus slot requirements
3. lint and structurally validate the still set
4. revise only failing stills once with issue-specific inputs
5. generate or synthesize `productionBible` from the brief and validated still set
6. return final readiness, blockers, and revision-used status

This is the first strategy in the project that explicitly separates:

- creation
- critique
- repair

That separation is the core architectural move.

## Representative Benchmark

Use the same campaigns for all future comparisons:

- `bp-tabletop-icon-2027`
- `deck-sketchbook-society`
- `eastern-caribbean-stitch-sail-2026-09-19`

The latest recorded live results in this phase log are the benchmark to beat.
Do not claim success from fixture tests alone.

## Current Recommendation

Do not spend another implementation cycle on prompt-negation balancing.

Proceed with the architecture-first implementation in:

- `lib/campaigns/brief-engine/orchestrator.ts`
- `lib/campaigns/aesthetic-engine.ts`
- `lib/campaigns/schema.ts`

Treat `landingStillBible` as the primary creative artifact.
Treat `productionBible` as a downstream synthesis artifact.
Treat deterministic lint as the critic.
Treat isolated still revision as the only allowed corrective pass.

## What Has To Be Proven Next

The next implementation pass must prove all of the following:

1. the new pipeline improves live results on the representative sample
2. currently passing campaigns stay green
3. isolated still revision repairs specific failures without destabilizing the rest of the brief
4. readiness and approval semantics remain correct
5. stale-lint resync behavior remains correct

## Verification Commands To Use After Implementation

```powershell
# Regression suites
npx tsx lib/campaigns/__tests__/brief-engine.orchestrator.test.ts
npx tsx lib/campaigns/__tests__/brief-engine.validation.test.ts
npx tsx lib/campaigns/__tests__/production-build-quality.test.ts

# Fresh representative live reruns through the shared brief API
# POST /api/groups/campaign/bp-tabletop-icon-2027/brief
# POST /api/groups/campaign/deck-sketchbook-society-2026/brief
# POST /api/groups/campaign/eastern-caribbean-stitch-sail-2026-09-19/brief
# Then check GET /api/groups/campaign/{slug}/brief/readiness for each
```

## Operator Guidance

- Implement code next.
- Do not run the full live verification sample yet.
- Run tests after the pipeline skeleton exists and the intermediate schemas and orchestration steps are wired.
- Run the representative live sample only after the new generation path is actually in place.

---

## Editor's Room Pipeline — Implemented (commit `ebb82b2`)

### Architecture Change

Replaced the monolithic `generateVisualPlanningFromBrief` call (one LLM pass generating both `landingStillBible` + `productionBible` simultaneously) with a 7-step pipeline in `generateFullBriefBundle`.

### New File: `lib/campaigns/editors-room.ts`

Four exported generation functions:

| Function | Purpose | Input | Output |
|---|---|---|---|
| `generateActionAnchors` | Community-native action seeds | campaign + brief | 6-8 anchors with location, niche signal, social unit |
| `generateLandingStillBible` | 6 stills from locked anchors + slot rules | campaign + brief + anchors | `LandingStillBible` |
| `repairFailingStills` | One-pass isolated repair for specific stills | campaign + brief + failing IDs + blockers | `LandingStillSpec[]` (only failing stills) |
| `generateProductionBibleFromStills` | Scene library + storyboards from validated stills | campaign + brief + validated stills | `ProductionBible` |

Two exported utility functions: `extractFailingStillIds` + `mergeRepairedStills`.

### Updated Orchestration Flow (`orchestrator.ts`)

```
Step 1: generateAestheticBrief          — core brief (unchanged)
Step 2: generateActionAnchors           — 6-8 community-native seeds (NEW)
Step 3: generateLandingStillBible       — 6 stills from anchors (NEW)
Step 4: lintProductionBuild (stills)    — identify which stills failed (NEW split point)
Step 5: repairFailingStills (if needed) — one-pass isolated repair, subset only (NEW)
Step 6: generateProductionBibleFromStills — scenes + storyboards from validated stills (NEW)
Step 7: lintProductionBuild (final)     — full report including production bible
```

The isolated repair (Step 5) only triggers if `blockingIssues.length > 0` and the failing stills are a strict subset of the set (partial failure). Full-set failure falls through to production bible generation then returns blockers.

### What Each Step Separates

- **Creation** (`generateActionAnchors` + `generateLandingStillBible`): niche identity locked before any visual generation happens; prompt responsibility reduced per call
- **Critique** (`lintProductionBuild`): deterministic machine check, not embedded in the generation prompt
- **Repair** (`repairFailingStills`): knows exactly which stills failed and why, doesn't destabilize passing stills
- **Synthesis** (`generateProductionBibleFromStills`): production bible gets the validated still set as reference — can use actual community identity rather than inferring it

### New `BriefEngineResult` Field

`isolatedStillRevisionUsed: boolean` — set to `true` if Step 5 ran. Propagated through `createOrRefreshBrief` and `applyStructuredRevision`.

### Exported Helpers (aesthetic-engine.ts)

Six private functions made exported so editors-room.ts can share them:
`buildLintComplianceBlock`, `getCanonicalShipName`, `buildShipContext`, `buildEventFramingGuidance`, `joinCampaignList`, `sanitizePromptList`.

### Regression Results After Implementation

- Orchestrator: **26/26**
- Validation: **2/2**
- Production-build quality: **12/12**

### Live Verification Required

Run against three representative campaigns:

```powershell
# Direct library approach (no dev server needed)
npx tsx tests/phase-2c-direct-library.ts

# Or via HTTP (dev server must be running)
npx tsx tests/phase-2c-live-verification.ts
```

Expected outcomes:
- `bp-tabletop-icon-2027-7n-caribbean` → stays green (0 production blockers)
- `eastern-caribbean-stitch-sail-2026-09-19` → stays green
- `deck-sketchbook-society-2026` → target: 0 production blockers, `ready_for_media`

Before/after blocker counts must be recorded here after live runs.

---

## Architecture Progress — Post-Implementation Live Reruns

### What Changed Since The Editor's Room Landed

Two follow-up hardening changes were made after the first live reruns exposed contract holes:

1. actual still text is now checked against anchor location family instead of trusting anchor metadata alone
2. isolated still repair is now limited to true subset failures and no longer rewrites a whole 6/6 failing set as if it were a local repair

Supporting regressions now cover:

- anchor location drift
- duplicate actual location families even when anchor metadata differs
- subset-only isolated repair semantics

Focused test status after those changes:

- `anchor-compliance.test.ts` → `20/20`
- `brief-engine.orchestrator.test.ts` → `29/29`

### Latest Representative Live Results

Command used:

```powershell
npx tsx tests/phase-2c-direct-library.ts
```

#### `bp-tabletop-icon-2027-7n-caribbean`

- Structural blockers: `0`
- Production blockers: `1`
- Production status: `fail`
- Final readiness: `needs_review`
- Production issue:
  - `[missing_role_coverage]` Still set missing required roles: editorial/concept stills (have 1, need 2)
- Generic fallback stills: `3/6`
- No niche cue stills: `3/6`
- Explicit niche cues: `3/6`
- Isolated still revision behavior: skipped because `6/6` stills failed

Interpretation:
This campaign is no longer broadly broken. The primary remaining blocker is role coverage, with generic fallback and niche-cue weakness still present but secondary.

#### `eastern-caribbean-stitch-sail-2026-09-19`

- Structural blockers: `0`
- Production blockers: `3`
- Production status: `fail`
- Final readiness: `needs_review`
- Production issues:
  - `[weak_niche_signal]` `5/6` stills have no legible niche cue
  - `[generic_fallback_overuse]` `5/6` stills use generic cruise-lifestyle fallback templates
  - `[identity_legibility_too_low]` Only `1` still carries discernible campaign identity
- Generic fallback stills: `5/6`
- No niche cue stills: `5/6`
- Explicit niche cues: `1/6`
- Isolated still revision behavior: skipped because `6/6` stills failed

Interpretation:
This campaign is primarily a niche-legibility and generic-fallback problem, not a role-coverage problem.

#### `deck-sketchbook-society-2026`

- Diagnostic run showed `9` anchor compliance violations before completion of the full rerun
- Isolated still revision behavior: skipped because `6/6` stills failed

Interpretation:
This campaign is currently failing earlier than lint quality optimization. The immediate issue is anchor-contract adherence and whole-set collapse behavior.

### Direct Diagnostic Breakdown — Tabletop

To separate blended failures, a direct diagnostic script was added:

```powershell
npx tsx tests/phase-2c-diagnostic-breakdown.ts bp-tabletop-icon-2027-7n-caribbean
```

This script runs the same generation pass and prints:

- generated anchors
- anchor compliance violations
- per-still lint diagnostics
- per-still blocker/warning mapping

### Tabletop Diagnostic Findings

Latest tabletop report:

- primary blocker: `missing_role_coverage`
- two editorial stills fail `slot_usage_mismatch`
- three stills are still generic fallback templates
- one still violates the anchor location contract
- two stills carry niche labels but still register as `no_niche_cue`

Reported still-level issues:

1. `OTS-03-EDITORIAL-LIBRARY` and `OTS-04-EDITORIAL-SOLARIUM`
	- flagged with `slot_usage_mismatch`
	- expected: wide/medium editorial composition
	- actual wording still fails the slot contract under lint interpretation

2. `OTS-02-HEROALT-POOL`, `OTS-05-INTIMATE-DINING`, `OTS-06-FLEX-BALCONY`
	- flagged as generic fallback templates

3. `OTS-06-FLEX-BALCONY`
	- anchor violation: `anchor_location_mismatch`
	- expected: `balcony`
	- actual: `rail`

4. `OTS-01-HERO-POOL` and `OTS-06-FLEX-BALCONY`
	- still receiving `no_niche_cue` despite declared niche carry-through values

### Phase B Diagnostic Result — Role Coverage Still Not Cleared

An additional tabletop-focused pass attempted to fix role coverage by normalizing editorial compositions.

Result: incomplete.

Observed outcome:

1. `missing_role_coverage` is still firing
2. `OTS-03-EDITORIAL_A` now classifies correctly as `role=editorial`
3. `OTS-04-EDITORIAL_B` still classifies incorrectly as `role=intimate`

Current root cause assessment:

1. the current `normalizeEditorialCompositions()` logic only removes or rewrites a subset of intimate-triggering language
2. `OTS-04-EDITORIAL_B` still contains composition cues that pull lint toward intimate classification
3. current composition wording reported for the failing still:
   - `airily wide, side-table foreground and open lounger context`
4. this means the role-coverage problem is not solved by the current targeted normalization pass

Interpretation:

The first tabletop remediation pass partially worked, but only for one editorial slot.
The next pass must deliberately choose between:

1. broadening editorial composition normalization so editorial slots cannot retain intimate cues that override `wide`
2. adjusting lint role-classification logic so legitimate editorial-wide phrasing is not misread as intimate

Do not treat this as a generic-fallback or niche-legibility pass yet.
`missing_role_coverage` remains the active blocker to clear first.

### What Improved

1. approval/readiness semantics remain correct
2. stale stored lint drift remains corrected
3. anchor location drift is now caught deterministically
4. isolated repair no longer destabilizes whole failing sets by pretending a 6/6 collapse is a local repair case
5. tabletop moved from multi-blocker failure down to a single explicit production blocker

### What Did Not Improve Yet

1. role coverage is still not reliably satisfied on tabletop
2. generic fallback clustering remains strong on stitch and still present on tabletop
3. niche-legibility remains weak on stitch and partially weak on tabletop
4. sketchbook still fails too early on anchor compliance to treat production lint as the primary issue

### Residual Blocker Classes Still Remaining

The remaining problems are now cleanly separable:

1. role coverage interpretation
2. generic fallback generation patterns
3. niche cue legibility mismatch
4. anchor contract drift
5. whole-set failure behavior

### Current Recommendation

Do not make another blended prompt pass.

The next implementation phase should work the failure classes independently in this order:

1. tabletop role coverage first
2. generic fallback reduction second
3. niche-legibility alignment third
4. sketchbook anchor-contract cleanup and explicit whole-set failure behavior after that

Immediate next-step recommendation for tabletop:

1. inspect the exact lint shot-role classifier for why `OTS-04-EDITORIAL_B` is resolving to `intimate`
2. either strengthen editorial composition normalization or adjust deterministic role classification with a narrowly scoped rule
3. rerun tabletop diagnostics only after that change
4. do not claim Phase B complete until `missing_role_coverage` is actually gone

### Next Proving Target

Use `bp-tabletop-icon-2027-7n-caribbean` as the next proving campaign.

Success for the next pass means:

1. `missing_role_coverage` is removed
2. the tabletop editorial slots stop failing `slot_usage_mismatch`
3. no approval/readiness regressions are introduced
4. any remaining blocker after that is named explicitly as the next independent failure class

---

## Phase B — Tabletop Role Coverage Fix

### Root Cause Identified

`missing_role_coverage` was caused by a composition-keyword interpretation gap:

- The LLM generates EDITORIAL_WIDE_A/B stills with intimate/close/tight/detail keywords in their `composition` field
- Lint's `extractShotRole` sees `usage=concept` + intimate keyword → classifies as `intimate`, not `editorial`
- Result: `editorialRoleCount = 1` when 2 are required → `missing_role_coverage` blocker

This is a deterministic gap between how the model writes composition descriptions and how the lint categorizes shot roles. It is not a prompt-balancing problem.

### What Was Changed

Added `normalizeEditorialCompositions()` to `lib/campaigns/editors-room.ts`:

- Deterministic post-generation step (no LLM call)
- Runs only on EDITORIAL_WIDE_A and EDITORIAL_WIDE_B slots
- Replaces intimate/close/tight/detail keywords with wide/medium equivalents using precise regex replacements
- INTIMATE, HERO_PRIMARY, HERO_ALT, FLEX stills are untouched
- Returns same reference when no changes are made (zero cost on passing sets)

Wired as **Step 3.1** in `lib/campaigns/brief-engine/orchestrator.ts`, between still generation (Step 3) and anchor compliance gate (Step 3.5). Both the compliance gate and lint see corrected compositions.

### Regression Tests Added

`lib/campaigns/__tests__/anchor-compliance.test.ts` — 7 new Phase B tests:

- intimate composition normalized on EDITORIAL_WIDE_A
- tight composition normalized on EDITORIAL_WIDE_B
- detail/detailed composition normalized on EDITORIAL_WIDE_A
- HERO_PRIMARY with intimate composition is NOT touched
- INTIMATE slot composition is NOT touched
- EDITORIAL_WIDE with safe composition returned unchanged (same reference)
- after normalization, EDITORIAL_WIDE no longer triggers `slot_usage_mismatch` in anchor compliance

### Test Status After Phase B

| Suite | Result |
|-------|--------|
| `anchor-compliance.test.ts` | 27/27 |
| `brief-engine.orchestrator.test.ts` | 29/29 |
| `brief-engine.validation.test.ts` | 2/2 |
| `production-build-quality.test.ts` | 12/12 |

### Expected Tabletop Before/After

**Before Phase B:**
- tabletop primary blocker: `missing_role_coverage` — editorial/concept stills (have 1, need 2)
- two EDITORIAL_WIDE stills failing `slot_usage_mismatch` due to intimate composition wording
- isolated repair: skipped (6/6 stills failed anchor compliance)

**After Phase B (deterministic):**
- EDITORIAL_WIDE compositions with intimate keywords are corrected before anchor compliance and lint
- `slot_usage_mismatch` for EDITORIAL_WIDE composition no longer fires
- lint now classifies both EDITORIAL_WIDE stills as `editorial` → `editorialRoleCount = 2`
- `missing_role_coverage` should no longer fire on tabletop for editorial coverage
- isolated repair gate unchanged (subset-only rule still applies)

### What Phase B Does NOT Fix

- generic fallback clustering (tabletop: 3/6 stills, stitch: 5/6 stills)
- niche cue legibility mismatch (two stills with nicheCarryThrough still registering as `no_niche_cue`)
- anchor contract drift on non-editorial stills
- whole-set failure behavior (stitch and sketchbook still skip repair at 6/6)

### Next Failure Class

If tabletop `missing_role_coverage` is resolved by this pass, the next primary blocker for tabletop will be one of:

- `generic_fallback_overuse` (3/6 stills on last run)
- `weak_niche_signal` (2 stills claiming carry-through but not registering as legible)

Address as **Phase C** — generic fallback reduction — separately.

### Commands Used

```powershell
npx tsx lib/campaigns/__tests__/anchor-compliance.test.ts
npx tsx lib/campaigns/__tests__/brief-engine.orchestrator.test.ts
npx tsx lib/campaigns/__tests__/brief-engine.validation.test.ts
npx tsx lib/campaigns/__tests__/production-build-quality.test.ts
```

Commit: `561c94d`

---

## Phase B Fix #2 — slotRole-Aware Lint Classification

### Why Fix #1 Was Insufficient

The composition normalizer (`normalizeEditorialCompositions`) only catches a known set of intimate keywords (`intimate`, `close`, `close-up`, `tight`, `detail`, `detailed`). Live diagnostic showed `OTS-04-EDITORIAL_B` with composition `"airily wide, side-table foreground and open lounger context"` — no intimate keywords present, yet lint still classified it as `role=intimate`.

The normalizer approach is inherently fragile: the LLM generates unbounded composition text, and substring matching will always have edge cases the normalizer cannot predict.

### Root Cause

Lint's `extractShotRole` used only `usage` + composition substring matching to determine roles, completely ignoring the structurally-enforced `slotRole`. Even when anchor compliance verified a still's slot assignment, lint would override it based on composition heuristics.

### What Was Changed

Modified `extractShotRole` in `lib/campaigns/media/production-build-lint.ts` to check `slotRole` first:

- `HERO_PRIMARY` / `HERO_ALT` → `hero`
- `EDITORIAL_WIDE_A` / `EDITORIAL_WIDE_B` → `editorial`
- `INTIMATE` → `intimate`
- `FLEX` and `undefined` → fall through to existing `usage`/composition inference

This is not weakening lint — it's making lint structurally consistent with the anchor compliance gate that already enforces slot assignments. Backward compatible: stills without `slotRole` use existing inference.

### Regression Tests Added

`lib/campaigns/__tests__/production-build-quality.test.ts` — 2 new tests:

- `EDITORIAL_WIDE` with intimate composition keywords is still editorial when `slotRole` is set
- `missing_role_coverage` still fires when `slotRole` is absent and composition triggers intimate (backward compat)

### Test Status After Fix #2

| Suite | Result |
|-------|--------|
| `anchor-compliance.test.ts` | 27/27 |
| `brief-engine.orchestrator.test.ts` | 29/29 |
| `brief-engine.validation.test.ts` | 2/2 |
| `production-build-quality.test.ts` | 14/14 |

### Expected Impact

- `missing_role_coverage` should now be permanently resolved for any still set where anchor compliance has assigned `EDITORIAL_WIDE_A` and `EDITORIAL_WIDE_B` — regardless of what composition text the LLM generates
- The normalizer (fix #1) remains as defense-in-depth for the anchor compliance gate's own composition check
- This fix eliminates the cat-and-mouse game of predicting LLM composition wording

Commit: `df14aa3`