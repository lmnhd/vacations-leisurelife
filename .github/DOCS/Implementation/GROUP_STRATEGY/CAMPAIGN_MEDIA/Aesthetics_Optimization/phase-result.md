# Phase Result: Aesthetics Optimization Phase 2A

## What Changed

### Shared Gate-Time Lint Recompute

- Added `recomputeAndResyncLint(brief, campaign)` in `lib/campaigns/brief-engine/orchestrator.ts`.
- The helper recomputes `productionBuildLint` from the saved `landingStillBible` using the current `lintProductionBuild(...)` rules.
- When the recomputed verdict differs from the stored `productionBuildStatus`, the helper resyncs:
	- `productionBuildLint`
	- `productionBuildStatus`
	- `productionBuildEvaluatedAt`
- The resync is persisted in one place through `saveAestheticBrief(...)`.
- If `landingStillBible` is absent, the helper returns without attempting recompute.

### Readiness And Approval Now Use Current Lint Semantics

- `computeReadiness(...)` is now async and calls `recomputeAndResyncLint(...)` before applying any production-build gate logic.
- `getReadiness(...)` therefore reports readiness using the effective current lint result, not only the previously stored status.
- `approveForMedia(...)` now calls `recomputeAndResyncLint(...)` after structural validation and before the production-build gate.
- Result: a stale stored `fail` that now recomputes to `warn` or `pass` no longer keeps a campaign falsely blocked.
- A genuine recomputed `fail` still blocks approval and keeps readiness at `needs_review`.

## Stale-State Findings

### Confirmed False-Block Pattern

- A saved brief can retain stale `productionBuildStatus = fail` and stale blocking issue codes after lint logic or generation guidance has changed.
- Recomputing lint against the same saved still set can now yield `warn` instead of `fail`.
- Before this phase, readiness and approval trusted the stale stored fields and could keep the campaign blocked incorrectly.

### Representative Campaign Check

- `transpacific-vinyl-listening-nov-2026` reproduced the stale-state drift pattern.
- Stored state showed:
	- `productionBuildStatus = fail`
	- blocking issues: `weak_niche_signal`, `identity_legibility_too_low`
- Fresh recomputation against the same saved `landingStillBible` showed:
	- verdict: `warn`
	- no blocking issues
	- warning: `weak_niche_signal`
- This confirmed that at least some remaining blocked campaigns were false blocks caused by stale persisted lint state rather than fresh generator failure.

## Routes Or Shared Methods Affected

- `lib/campaigns/brief-engine/orchestrator.ts`
	- `recomputeAndResyncLint(...)`
	- `computeReadiness(...)`
	- `getReadiness(...)`
	- `approveForMedia(...)`

No route surface changes were required for Phase 2A. The fix stays in the shared orchestration path used by both UI and agent callers.

## Final Shared Contract Status

- The existing brief-step contract remains unchanged at the route level.
- The behavioral change is internal correctness:
	- readiness and approval now derive production-build gating from current saved content plus current lint semantics
	- stale stored verdicts are resynced instead of blindly trusted

## Generation-Quality Progress Versus Stale-State Progress

### Completed In Phase 2A

- Eliminated false blocking caused by stale stored production-build verdicts.
- Preserved the already-fixed approval gate for true `fail` cases.
- Added regression coverage for stale-lint drift and resync behavior.

### Still Open

- Phase 2B remains open.
- The remaining work is improving production-planning bundle quality for newly generated campaigns so real production-build blocker frequency drops on fresh runs.
- This is separate from the stale-state fix and should be evaluated with live generation runs and representative campaign comparisons.

## Phase 2B Blocker-Frequency Snapshot

### Fresh Campaign Frequency Check

Across three fresh campaigns, structural quality is now materially stronger, but production-build quality remains the gating bottleneck.

| Campaign | Structural Blockers | Production Build Blockers | Total Blockers | Ready For Media |
|---|---:|---:|---:|---|
| `bp-tabletop-icon-2027` | 0 | 1 | 1 | No |
| `deck-sketchbook-society` | 0 | 2 | 2 | No |
| `eastern-caribbean-stitch-sail-2026-09-19` | 0 | 2 | 2 | No |
| **Total** | **0** | **5** | **5** | **0/3** |

### Measured Outcome

- Structural blockers across the sample: `0`
- Production-build blockers across the sample: `5`
- Fresh campaigns reaching `ready_for_media`: `0%`
- Auto-fix successfully cleared structural issues, but did not resolve the production-build failures.

### Observed Production-Build Failure Patterns

- `weak_niche_signal` is still the dominant blocker pattern.
- missing campaign identity in the still set remains a recurring failure mode.
- still-role coverage gaps still appear in some campaigns.

Representative example from the fresh run set:

- `eastern-caribbean-stitch-sail-2026-09-19`
	- structural blockers: `0`
	- production-build blockers: `2`
	- warnings: `3` total
	- auto-fix applied: `3` fixes
	- ready for media: `no`
	- blocker pattern: `5/6` stills had no legible niche cue and only `1` still carried campaign identity

### Interpretation

- Phase 2A succeeded in fixing stale-state false blocks.
- The latest fresh-run sample suggests Phase 2B is still incomplete.
- The main remaining problem is not structural brief validity; it is the still-generation layer failing to embed strong enough niche cues and campaign identity into the landing still set.
- The next implementation focus should stay on `aesthetic-engine.ts` and the visual-planning prompt path, with success measured by reduced production-build blocker frequency on fresh campaign runs.

## Residual Risks

1. Phase 2A fixes stale stored lint drift at gate time, but it does not itself improve prompt quality for newly generated campaigns.
2. Existing campaigns may still require fresh evaluation to distinguish true generator-quality failures from previously stale stored results.
3. The representative campaign evidence currently proves the false-block pattern exists, but broader backfill or sweep behavior for all historical briefs was not implemented in this phase unless covered elsewhere.
4. The current fresh-campaign sample shows `0%` structural blockers but `100%` production-build failure rate, so the production-planning bundle remains the dominant obstacle to completion.

## Verification Commands Run

```powershell
# Orchestrator regression including stale-lint tests (26/26 pass)
npx tsx lib/campaigns/__tests__/brief-engine.orchestrator.test.ts

# Validation regression (2/2 pass)
npx tsx lib/campaigns/__tests__/brief-engine.validation.test.ts

# Production-build quality regression (10/10 pass)
npx tsx lib/campaigns/__tests__/production-build-quality.test.ts

# Representative stale-state campaign recomputation check
npx tsx tmp/evaluate-campaigns.ts transpacific-vinyl-listening-nov-2026 drift-festival-icon-2026

# Fresh campaign blocker-frequency check
# Results recorded for:
# - bp-tabletop-icon-2027
# - deck-sketchbook-society
# - eastern-caribbean-stitch-sail-2026-09-19

# Fresh-vs-stored lint drift inspection for transpacific campaign
npx tsx -e "import { loadEnvConfig } from '@next/env'; loadEnvConfig(process.cwd()); async function main(){ const storeMod = await import('./lib/campaigns/campaign-store'); const store:any = storeMod.default; const lintMod:any = await import('./lib/campaigns/media/production-build-lint'); const lint = lintMod.default?.lintProductionBuild ?? lintMod.lintProductionBuild; const brief = await store.getAestheticBrief('transpacific-vinyl-listening-nov-2026'); if (!brief) { console.log('brief_not_found'); return; } const report = lint({ landingStillBible: brief.landingStillBible, themeName: brief.themeName, nicheKeywords: brief.nicheKeywords ?? [] }); console.log(JSON.stringify({ storedVerdict: brief.productionBuildLint?.verdict, storedBlocking: brief.productionBuildLint?.blockingIssues?.map((i:any)=>i.code) ?? [], storedWarnings: brief.productionBuildLint?.warnings?.map((i:any)=>i.code) ?? [], recomputedVerdict: report.verdict, recomputedBlocking: report.blockingIssues.map((i:any)=>i.code), recomputedWarnings: report.warnings.map((i:any)=>i.code), recomputedPatternSummary: report.patternSummary }, null, 2)); } main().catch(err => { console.error(err); process.exit(1); });"
```
