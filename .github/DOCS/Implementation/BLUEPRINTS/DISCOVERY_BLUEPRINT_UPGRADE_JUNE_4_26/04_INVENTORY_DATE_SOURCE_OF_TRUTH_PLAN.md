# Plan: Make CB Inventory the Single Source of Sail-Date Truth

> Implementation plan, approved 2026-06-04. Companion to
> `02_INVENTORY_MATCH_ARCHITECTURE_REVIEW.md` (which captured the north star) and
> `03_PHASE_B_ROOT_CAUSE.md` (the Phase B fixes that preceded this).

## Context

**Why this change:** Today a campaign's sail date is *invented by GPT* at discovery time
(`targetDates`), then a CB group is matched near that guess, then Phase B writes the real
sailing date to a *separate* field (`matchedSailDate`) — leaving `targetDates` holding the
stale guess. Downstream code then inconsistently reads one or the other. This is the root of
the whole `INVENTORY_FAILED` / date-drift class of bugs debugged this session.

**Proof of the inconsistency** (`lib/campaigns/landing/view-model.ts`):
- Line 1498: `campaign.matchedSailDate ?? campaign.targetDates` ✓ (real date wins)
- Line 444: `campaign.matchedSailDate` ✓
- **Line 333: `campaign.targetDates ?? 'coming up'` ✗ (shows the GPT guess)**

So the *same landing page* can display the guessed date in one spot and the real matched
date in another.

**Operator's north star:**
> "The date should be defined PURELY by the inventory matching."

**Intended outcome:** Exactly ONE human-facing sail date on a campaign, and once inventory is
matched it is *always* the real sailing's date — never a guess. A date "mismatch" between
fields becomes structurally impossible.

## Decisions (confirmed with operator)
1. **Canonical date model:** When a match is found, **overwrite `targetDates` with the matched
   real date.** `matchedSailDate` retains the precise matched value. Add a
   `targetDatesSource: 'estimate' | 'inventory'` marker so we always know whether the date is
   still a guess or inventory-confirmed.
2. **Discovery role:** `targetDates` from GPT stays as a **season/preference hint** for the
   matcher. No prompt rewrite — clarify intent in comments and via the new `targetDatesSource`
   flag (defaults to `'estimate'` at generation).

## Approach

### 1. Type + provenance flag
- `lib/campaigns/types.ts`: add `targetDatesSource?: 'estimate' | 'inventory'` to `Campaign`
  (absent = treat as `'estimate'`; no migration needed).

### 2. Single canonical write point — when a match is persisted
In `lib/campaigns/campaign-store.ts` (every match funnels through here):
- **`upsertCampaignPricingMatch`** (SET expr ~line 250): also set
  `targetDates = :matchedSailDate` and `targetDatesSource = 'inventory'` when
  `match.matchedSailDate` is present. This is the moment Phase B confirms a real sailing.
- **`markCampaignUnmatched`** (~line 433): also set `targetDatesSource = 'estimate'` (leave
  `targetDates` as-is so the campaign keeps a hint to re-match against).

### 3. Discovery-time match (Phase A) — same rule, in memory
`app/api/groups/discovery/core-logic.ts` `gateAndPersistBlueprints()` already enriches each
matched campaign with `matchedSailDate`. Add to that same object:
`targetDates: match.matchedSailDate ?? campaign.targetDates` and
`targetDatesSource: match.matchedSailDate ? 'inventory' : 'estimate'`. Mapper default in
`mapDiscoveryBlueprintToCampaign` (`lib/campaigns/discovery-schema.ts`) sets `'estimate'`.

### 4. Rematch route — inherits the fix
`app/api/groups/discovery/rematch/[slug]/route.ts` calls `upsertCampaignPricingMatch`, so once
(2) is done it overwrites `targetDates` correctly with no extra change.

### 5. Fix the known stale reader + sweep siblings
- `lib/campaigns/landing/view-model.ts:333`: `campaign.matchedSailDate?.trim() ||
  campaign.targetDates || 'coming up'`.
- Grep `targetDates` across `lib/campaigns/**` and `app/**` runtime (NOT tests/docs) for other
  *direct* reads in guest-facing/pricing output; apply `matchedSailDate ?? targetDates`.
  Known-correct already: `launch-window.ts` `getLaunchWindowAssessment` (line 157), view-model
  444/1498.

### 6. Surface the flag in campaign GET
`app/api/groups/campaign/[slug]/route.ts` GET: add `targetDatesSource` to the flat response.

## Critical files
- `lib/campaigns/types.ts`
- `lib/campaigns/campaign-store.ts` (`upsertCampaignPricingMatch` + `markCampaignUnmatched`)
- `app/api/groups/discovery/core-logic.ts` (`gateAndPersistBlueprints`)
- `lib/campaigns/discovery-schema.ts` (`mapDiscoveryBlueprintToCampaign`)
- `lib/campaigns/landing/view-model.ts` (line 333)
- `app/api/groups/campaign/[slug]/route.ts`

## Explicitly NOT doing
- No discovery prompt rewrite (targetDates stays a hint).
- Not removing `targetDates` or `matchedSailDate` — both stay.
- Not rewriting test/doc files that mention `targetDates`; only runtime readers producing
  guest-facing/pricing output.
- Not changing `getLaunchWindowAssessment` — it already prefers `matchedSailDate`.

## Verification
1. `npx tsc --noEmit -p tsconfig.json` — clean.
2. Re-run Phase B on a matched campaign (e.g. `urban-sketchers-sea-voyage-radiance`); confirm
   via campaign GET JSON that `targetDates === matchedSailDate` and
   `targetDatesSource === 'inventory'`.
3. Re-run discovery for a fresh seed; new DRAFTs have `targetDatesSource: 'estimate'`, and if
   matched at gate time, `'inventory'` with `targetDates` = matched sailing.
4. Load a confirmed campaign's landing view-model; the former line-333 date now matches the
   real sailing date.
5. Force `markCampaignUnmatched` → flag flips back to `'estimate'`, hint retained.

## Notes
- `matchedSailDate` is CB's display string (e.g. "Jan. 9, 2027"); overwriting `targetDates`
  with it is fine — `parseCampaignDate`/`getLaunchWindowAssessment` already parse that format.
- Low risk: the canonical write is centralized in `upsertCampaignPricingMatch`, which Phase B,
  rematch, and discovery-match all funnel through.

## Status
- [x] Implemented (2026-06-04)
- [x] Typecheck clean (`npx tsc --noEmit` passes)
- [ ] Operator-verified end-to-end

### Implementation notes
- `lib/campaigns/types.ts`: added `targetDatesSource?: 'estimate' | 'inventory'` with doc
  comments reframing `targetDates` as "single human-facing date, hint until matched".
- `lib/campaigns/campaign-store.ts`:
  - `upsertCampaignPricingMatch` — when `match.matchedSailDate` is present, the SET expression
    now also writes `targetDates = :matchedSailDate` and `targetDatesSource = 'inventory'`.
  - `markCampaignUnmatched` — now sets `targetDatesSource = 'estimate'` (targetDates hint
    retained, matchedSailDate removed as before).
- `app/api/groups/discovery/core-logic.ts` `gateAndPersistBlueprints` — matched campaigns get
  `targetDates` overwritten with the matched sailing date + `targetDatesSource: 'inventory'`.
- `lib/campaigns/discovery-schema.ts` `mapDiscoveryBlueprintToCampaign` — defaults
  `targetDatesSource` to `'estimate'` (preserves existing value on re-map).
- Guest-facing readers updated to prefer `matchedSailDate ?? targetDates`:
  `landing/view-model.ts:333`, `distribution-discord.ts`, `design-system/niche-tokens.ts`.
  (`launch-window.getLaunchWindowAssessment`, `ad-pack-adapter`, view-model:1501 already did.)
- `app/api/groups/campaign/[slug]/route.ts` GET — returns `targetDatesSource`.
- Matcher inputs that read `targetDates` as a *hint* (cb-inventory-matcher, discovery-revision,
  trinity kernel assert, aesthetic-* context) were intentionally left unchanged.

### How to verify (operator)
1. Re-run Phase B on a matched campaign → campaign GET JSON shows
   `targetDates === matchedSailDate` and `targetDatesSource: 'inventory'`.
2. Generate a fresh seed → new DRAFT has `targetDatesSource: 'estimate'`; if matched at the
   gate, `'inventory'` with `targetDates` = matched sailing.
3. Confirmed campaign's landing copy shows the real sailing date everywhere (no guessed date).
