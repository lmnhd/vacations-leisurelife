# Aesthetic Pipeline — Operator Notes

## Merch Layer Priority
**DO NOT over-engineer or loop on Merch.** Merch is an insignificant afterthought to the overall campaign development. Do not let red-team findings about merch copy, frequency, or uniformity optics drive additional revision cycles.

## Revision Loop Anti-Patterns (Identified 2026-03-15)

### 1. Scope Leak
The red team reads the full campaign context (blueprint + brief) but the reviser only writes to the aesthetic brief. Anything flagged in the campaign blueprint `description` field (e.g., precise times like "08:30/17:30") creates an unfixable loop because the reviser cannot modify the blueprint.

**Fix needed:** Scope the red-team prompt to evaluate only the aesthetic brief, or give the reviser write access to the blueprint description.

### 2. Scope Creep
Each red-team pass performs a full fresh review rather than validating just the `requiredFixes`. New warnings appear every cycle, widening the brief instead of tightening it.

**Fix needed:** Add a "re-review" mode that checks only whether `requiredFixes` were addressed, not a full sweep.

### 3. Severity Inflation
The brief went from `warn` → `block` after meaningful improvements because the red team penalized a field outside the reviser's control.

**Fix needed:** Cap revision loops. If 2 passes don't reach `pass`, surface to operator with a summary instead of continuing to loop.
