# Discovery & Inventory Match Implementation

**Status:** Active implementation reference  
**Branch:** `feature/shadow-groups`  
**Last Updated:** 2026-05-25  
**Parent Strategy:** [`../GROUP_CAMPAIGN_STRATEGY.md`](../GROUP_CAMPAIGN_STRATEGY.md) §6  
**Related Working Strategy:** [`GROUP_CAMPAIGN_STRATEGY-v2.md`](./GROUP_CAMPAIGN_STRATEGY-v2.md)

---

## Purpose

This directory owns the implementation plan and operating notes for the campaign discovery process that happens before Campaign Media Phase 1.

The goal is to generate viable Shadow Group campaign blueprints, ground them in real CB group inventory, validate launch-window timing, and preserve enough metadata for downstream aesthetics, media generation, landing pages, and booking flows.

---

## Current Pipeline

### Phase A — Discovery Research and Blueprint Generation

Entry points:

- `/tests/groups/discovery`
- `GET /api/groups/discovery`
- `POST /api/groups/discovery/research`
- `POST /api/groups/discovery/generate`

Core files:

- `app/api/groups/discovery/route.ts`
- `app/api/groups/discovery/research/route.ts`
- `app/api/groups/discovery/generate/route.ts`
- `app/api/groups/discovery/core-logic.ts`
- `lib/campaigns/discovery-schema.ts`

Flow:

1. Load and validate CB inventory cache from `.github/data/cb-deals-cache.json`.
2. Build current inventory context from CB group inventory.
3. Inject existing campaign exclusions and re-spin feedback when `respin=true`.
4. Run Gemini Deep Research Step 1 for psychographic discovery.
5. Run Gemini Deep Research Step 2 for cruise-native expression and ship plausibility.
6. Generate exactly 5 typed campaign blueprints using `callGlobalGenerateObject` with `ModelName.GPT_5_HIGH`.
7. Enforce launch-window eligibility.
8. Apply the inventory match gate before saving.
9. Save only eligible, inventory-matched campaigns to DynamoDB.

Current high-tier GPT routing:

- `ModelName.GPT_5_HIGH` → `gpt-5.4`
- `ModelName.GPT_5_MEDIUM` → `gpt-5.4-mini`

GPT 5.5 is available in the OpenAI account, but `gpt-5.5-pro` is not compatible with the current Chat Completions structured JSON path.

---

## Phase B — Inventory Validation and Booking Link Resolution

Entry points:

- `GET /api/groups/discovery/phase-b`
- `GET /api/groups/discovery/phase-b?run=true`
- `POST /api/groups/discovery/phase-b`
- `npx tsx scripts/run-phase-b.ts`

Core files:

- `app/api/groups/discovery/phase-b/route.ts`
- `scripts/run-phase-b.ts`
- `scripts/cb-inventory-scraper.ts`
- `lib/campaigns/cb-inventory-matcher.ts`
- `lib/campaigns/campaign-store.ts`
- `lib/campaigns/cb-inventory-types.ts`

Flow:

1. Scan campaigns with `pricingStatus: 'CB_MATCHED'`.
2. Re-check the top CB inventory candidate.
3. Scrape or recover personal booking links.
4. Validate retail booking link generation when needed.
5. Update campaign inventory health and booking mode.

Recent hardening:

- Phase B now reuses stored campaign booking links by ship and sail date when live scraping cannot recover the same personal link.
- Personal link scraping in `cb-inventory-scraper.ts` was broadened to handle more CB page variants.
- UI now distinguishes failed validation from healthy CB matches.

---

## CB Inventory Cache

Cache file:

- `.github/data/cb-deals-cache.json`

Expected top-level fields:

- `generatedAtIso`
- `priceAdvantages[]`

Expected `priceAdvantages` item fields:

- `groupId`
- `shipName`
- `vendor`
- `itinerary`
- `departurePort`
- `nights`
- `sailDate`
- `startingPrice`
- `priceAdvantage`
- `sourceUrl`

Current guardrails:

- Cache must exist before discovery.
- Cache must be less than 72 hours old.
- Discovery mapper now uses the refreshed cache shape directly instead of misreading itinerary, port, sail date, or price fields.

---

## Launch Window Rules

Core file:

- `lib/campaigns/launch-window.ts`

Current behavior:

- Discovery must reject or discard generated blueprints that do not meet launch-window requirements.
- UI launch-window displays now prefer the current rank-0 CB inventory candidate over stale campaign-level matched fields.
- Launch filters also use the current primary candidate date where available.

Recent hardening:

- If GPT generates mixed-validity results, the system discards only launch-window-ineligible blueprints instead of failing the whole paid generation run.
- If no blueprints remain saveable after launch and inventory validation, the run throws a specific error with counts and requested ships.

---

## Discovery UI Features

Core file:

- `app/(tests)/tests/groups/discovery/page.tsx`

Current capabilities:

- Load existing discovery campaigns.
- Run full Re-Spin.
- Run research and generation separately.
- Review all or selected blueprints.
- Revise selected blueprints.
- Select all or deselect all visible campaigns.
- Remove selected campaigns from active discovery list.
- Show retired campaigns when needed.
- Run Phase B for all or selected campaigns.

Recent changes:

- Added `Select All` / `Deselect All` for the visible filtered campaign list.
- Added `Remove Selected`, which uses manual discovery retirement rather than hard deletion.
- Retired campaigns remain in DynamoDB for history and deduplication.

---

## Retirement vs Deletion

Core files:

- `lib/campaigns/discovery-iteration.ts`
- `app/api/groups/discovery/retire/[slug]/route.ts`

Rules:

- Discovery removal must use retirement, not hard deletion.
- Retirement sets `retiredAt` and `retirementReason`.
- Default UI hides retired campaigns.
- Retired records stay available for duplicate avoidance, audit history, and future learning.

Hard delete remains separate and should not be used for normal discovery cleanup.

---

## Run Guidance

Recommended full paid refresh:

1. Confirm CB inventory cache is fresh.
2. Use `/tests/groups/discovery`.
3. Click `Re-Spin`.
4. Let Phase A complete.
5. Review generated blueprints.
6. Use `Remove Selected` for concepts that should leave the active slate.
7. Run Phase B only for selected or high-confidence campaigns.

Important current note:

- For an actual respin, prefer the main `Re-Spin` button. The two-stage research path is useful, but should be reviewed before relying on it for respin-feedback injection.

---

## Current Safeguards

- In-flight route locks prevent concurrent discovery and Phase B runs.
- API route durations for discovery research/generate are now `300s`.
- Research cache is written after each Gemini research step.
- CB cache freshness is checked before discovery prompt construction.
- Paid GPT generation no longer fails the whole run when only some generated blueprints violate launch-window rules.
- Inventory match metadata is now written onto saved campaigns during Phase A gating.
- Phase B has stored-link fallback by ship and sail date.
- Default UI hides manually retired campaigns without deleting records.

---

## Known Limitations

- GPT 5.5 Pro is available but not compatible with the current Chat Completions JSON flow.
- The two-stage `Run Research` flow should be audited before using it as the primary respin-feedback path.
- Phase A still throws if zero generated campaigns are saveable after validation.
- Phase B personal link scraping depends on CB page structure and authenticated session behavior.
- The current docs in `GROUP_CAMPAIGN_STRATEGY.md` still contain older references to Perplexity/Sonar and VTG that should be reconciled with the current Gemini + CB implementation.

---

## Next Refinement Plan

### Near Term

- Add an explicit model/version badge to the discovery UI so the operator sees `gpt-5.4` before running.
- Update two-stage research to pass `respin: true` when the operator is intentionally refreshing with prior feedback.
- Add a dry-run preflight endpoint that validates cache freshness, model routing, env keys, and route readiness without starting paid calls.
- Surface CB cache age and inventory count directly beside the Re-Spin button.

### Medium Term

- Move discovery prompt builders into dedicated prompt modules to separate AI prompt text from core orchestration.
- Persist discarded generated blueprint diagnostics for review, including launch-window and inventory-gate failure reasons.
- Add a discovery run ledger with model IDs, cache timestamp, generated count, saved count, discarded count, and total estimated cost.
- Add a structured Phase A result object that distinguishes saved, skipped, retired, launch-discarded, and inventory-discarded outcomes.

### Later

- Migrate structured generation to the newer OpenAI endpoint that supports GPT 5.5 Pro.
- Add automated regression tests for CB cache mapping and launch-window candidate selection.
- Add a visual operator dashboard for discovery slate health, retirement reasons, revision loops, and Phase B readiness.
