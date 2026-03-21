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