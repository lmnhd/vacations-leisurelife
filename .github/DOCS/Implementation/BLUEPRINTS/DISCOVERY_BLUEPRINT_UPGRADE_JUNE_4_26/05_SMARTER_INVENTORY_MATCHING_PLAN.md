# Plan: Smarter, Never-Fail Inventory Matching (ranked best-available)

## Context

**Why:** Matching a campaign to CB inventory currently feels brittle and frequently returns
"no match" even when 50+ eligible sailings exist. The operator wants something "smarter than
a toss-up" but that **always assigns something** when any eligible inventory exists.

**Root causes found in `lib/campaigns/cb-inventory-matcher.ts`:**
1. **Hard ship lock** (`scoreMatch`, lines ~219-228): if the GPT-named `shipTarget` exists
   anywhere in inventory, `exactShipRequired=true` and every *other* ship scores **0**. A
   campaign gets locked to one vessel's handful of sailings even though the theme fits dozens.
2. **`MIN_MATCH_SCORE = 25` discard** (`matchGroupInventoryToCampaign` ~line 287,
   `rankGroupInventoryCandidates` ~line 455): candidates below 25 are dropped, so a campaign
   whose guessed ship isn't present and whose destination text doesn't literally overlap
   returns **null** → "no match" despite real options.
3. **Text-overlap scoring dominates** (ship-name tokens, date words, destination strings)
   while the genuinely intelligent signal — niche fit — is a minor `+/-` nudge.
4. **Affinity is vendor-only** (`lib/campaigns/niche-affinity.ts` → niche→cruise *line*). With
   ~95% RCL inventory, vendor affinity barely differentiates, so the matcher falls back to
   ship-name text matching. There is **no ship-class** signal, even though ship class
   (Icon/Quantum/Voyager/Radiance/Vision) is the dimension that actually distinguishes
   products for a niche (the discovery prompt in `core-logic.ts` already documents these
   classes — that knowledge exists but isn't used in matching).

**Operator decisions (confirmed):**
- `shipTarget` = **soft preference, never a lock.** Prefer it if available; otherwise rank by
  ship-class fit + niche affinity + season.
- **Always pick the best available** — drop the hard `MIN_MATCH_SCORE` discard. As long as any
  launch-window-eligible, on-vendor sailing exists, return the top-ranked one. Record the
  score so low-confidence matches stay visible.

**Intended outcome:** A campaign with any eligible inventory always gets assigned the *best*
sailing — never refused — and "best" is driven by niche/ship-class intelligence, not rigid
text matching. Agent groups are preferred over House groups when both fit (economics).

## Approach

All changes are in `lib/campaigns/cb-inventory-matcher.ts` plus one small new ship-class map.
`matchGroupInventoryToCampaign` (single-match, used by discovery gate + rematch) and
`rankGroupInventoryCandidates` (top-N, used by Phase B) share the scoring; keep them in sync.

### 1. Remove the hard ship lock → soft preference
- Delete the `exactShipRequired → return 0` gate. Instead:
  - Exact ship name match: keep the `+60` boost (strong preference).
  - No exact match: do NOT zero out — fall through to class + affinity + season scoring.

### 2. Add ship-class fit (the new "smart" signal)
- New `lib/campaigns/ship-classes.ts`: a `shipName → class` map for the RCL fleet
  (Icon/Oasis, Quantum, Voyager/Freedom, Radiance, Vision) — the same fleet knowledge already
  written into the discovery prompt. Export `getShipClass(shipName)` and a
  `getShipClassAffinityScore(campaign, shipClass)` that scores the campaign's niche signals
  (name/aesthetic/keywords) against class traits (e.g. cozy/scenic/literary → Radiance/Vision;
  high-energy/family/party → Icon/Oasis/Quantum). Reuse the niche signal-text extraction
  pattern from `niche-affinity.ts` (`extractCampaignSignalText`).
- Add its score to `scoreMatch` as a **primary** contributor (weight comparable to the
  niche-affinity boost), so class fit meaningfully ranks ships within the same vendor.

### 3. Always pick the best available (drop the no-match floor)
- In both `matchGroupInventoryToCampaign` and `rankGroupInventoryCandidates`: keep
  launch-window eligibility and (where set) vendor scoping as the only HARD filters. Remove the
  `< MIN_MATCH_SCORE` discard. If the eligible set is non-empty, always return the top-ranked
  candidate(s). Only return null/empty when there is genuinely no launch-window-eligible
  inventory at all.
- Keep `matchScore` on the result (already surfaced in the candidate UI) so weak matches are
  visible. Add a `lowConfidence` boolean (score under a soft threshold, e.g. 30) the UI can
  badge later — non-blocking.

### 4. Prefer agent groups over House groups when both fit
- House vs agent isn't known from the cached `view_groups` list alone (only confirmed at the
  detail-page scrape in Phase B). So the *ranking* tiebreaker here is best-effort: where the
  cached row exposes a `personalLink`, boost it above rows without one. (Most cache rows have
  no link, so this mainly helps when CB does surface one.) The stronger agent-preference
  already happens naturally in Phase B candidate ordering; document that this is a soft nudge,
  not a guarantee.

### 5. Keep the two scorers identical
Factor the shared per-item scoring into one function both entry points call, so single-match
and ranked-candidates can't drift (today they have subtly different gates).

## Critical files
- `lib/campaigns/cb-inventory-matcher.ts` — `scoreMatch`, `matchGroupInventoryToCampaign`,
  `rankGroupInventoryCandidates` (remove ship lock + score floor; add class signal; share scorer).
- `lib/campaigns/ship-classes.ts` — NEW: ship→class map + class-affinity scorer.
- (Reuse) `lib/campaigns/niche-affinity.ts` — signal-text extraction pattern + vendor scorer.
- (No change, already correct) `lib/campaigns/launch-window.ts` eligibility.

## Explicitly NOT doing
- Not changing Phase B's House-group → retail flow (works; that's the booking surface, separate
  from *which* group is matched).
- Not rewriting the discovery prompt.
- Not building a full ship-class affinity knowledgebase JSON now — a focused in-code map for the
  RCL fleet covers ~95% of inventory; can graduate to JSON later if needed.

## Verification
1. `npx tsc --noEmit -p tsconfig.json` — clean.
2. Unit-style: run the existing matcher tests (`lib/campaigns/__tests__/check-cb-matching.ts`,
   `tests/check-cb-matching.ts`) and confirm no campaign with eligible inventory returns null.
3. Re-run discovery generation for a seed whose GPT ship guess is NOT in inventory; confirm it
   still matches (best-available) instead of being discarded at the gate.
4. Re-run Phase B / Rematch on the test campaigns; confirm ranked candidates now include
   class-appropriate ships and the top pick has a sensible score; low-confidence picks carry
   the flag.
5. Spot-check a cozy/scenic niche (e.g. urban-sketchers) ranks Radiance/Vision-class above
   Icon/Oasis-class, and a high-energy niche ranks the opposite.

## Status
- [x] Implemented (2026-06-04)
- [x] Typecheck clean (`npx tsc --noEmit` passes)
- [x] Functional test passed (against the live 60-item cache)
- [ ] Operator-verified end-to-end (re-run Phase B / discovery)

### Functional test result (live cache, 60 items)
- Cozy/scenic niche with a **nonexistent** ship guess → **Brilliance of the Seas
  (Radiance-class)**, score 68 (old code would have returned NULL). Top-3 all Radiance-class.
- High-energy party niche → **Symphony of the Seas (Icon/Oasis-class)**, score 100.
- Opposite niches pick opposite classes; never null when eligible inventory exists.

### Note on planned-but-skipped verification
The plan referenced matcher unit tests, but the repo has **no test framework** configured and
`tests/check-cb-matching.ts` is a live-DynamoDB diagnostic script, not a unit test. Verified
instead via typecheck + a functional run against the real cache (above).
