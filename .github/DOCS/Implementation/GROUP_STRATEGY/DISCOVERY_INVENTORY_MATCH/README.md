# Discovery & Inventory Match Implementation

**Status:** Active implementation reference  
**Branch:** `feature/shadow-groups`  
**Last Updated:** 2026-05-26  
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

Discovery evidence rule:

- The discovery pipeline is vacation-first, but niche proof must be community-first. A viable niche is a community, taste world, fandom, hobby, identity cluster, or shared ritual culture that exists independently of travel.
- Travel sectors, itinerary categories, destination trends, and tourism market labels are venue context only. They can support ship or destination plausibility, but they should not be the lead proof that the niche exists or will convert.
- `researchRationale` and `audienceSignals` should cite community-native evidence first: subreddits, Discords, forums, clubs, creator ecosystems, hashtags, apps/tools, gear, meetups, rituals, jargon, spend signals, or social psychology.
- Example: for a stargazing concept, "astrotourism is growing" is only itinerary context. Stronger niche signals are offline star-map apps, binocular preferences, astronomy-club behavior, creator/forum patterns, dark-sky meetups, and shared-awe psychology.
- Prompt cache version `2026-05-25-community-native-niche-evidence-v1` invalidates older cached research so new runs do not keep reusing travel-sector-led evidence.

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
- Phase B status and default matching runs exclude retired campaigns. Retired records remain in DynamoDB for history and deduplication, but they should not appear in the active Phase B work queue or be included in "Match Active" runs.
- Cache ingestion now preserves row-level `detailUrl` and `personalLink` when CB exposes them, and Phase B tries those cached links before opening the group detail page. This closes the gap where discovery could match a CB row but Phase B later failed only because the booking link was not carried forward.
- When detail-page link extraction still fails, `scrapeGroupPersonalLink()` writes debug artifacts to `scripts/agent/output/cb-group-link-debug/group-{groupId}.{json,html,png}` so the operator can see whether CB served a login page, an empty shell, or a page variant with the link hidden behind an action.
- Phase B now has an explicit retail fallback path. If no healthy CB booking link validates but the top CB candidate still represents a viable sailing, the runner can promote that campaign into `RETAIL_MULTI_BOOKING` and keep the retail checkout link instead of forcing an inventory-failed pause.
- `scrapeGroupPersonalLink()` now stubs the esbuild compiler helpers (`__name`, `__publicField`, `__defProp`) on the page via `addInitScript` before evaluate runs. Without this stub, tsx-compiled named arrow functions inside the evaluate body throw `ReferenceError: __name is not defined` in the browser context, which silently broke every fresh CB personal-link scrape — only the stored-link fallback was succeeding.
- `booking-link-validator.ts` now logs the full diagnostic context (`url`, `finalUrl`, `pageTitle`, matched failure pattern, 200-char body preview) for every `FAILED` and `DEGRADED` outcome. The previous behavior returned a bare `failureReason` string that obscured whether the validator was seeing a login redirect, an expired-package message, a missing-cabin-content shell, or a Playwright timeout.

House group routing:

- CB's "view_groups (price_advantage=on)" inventory mixes agent-claimed groups with House-owned groups (`Group Contact: House`). House groups do not expose an agent-issued personal booking link on the detail page by design — the only bookable surface is the Odysseus retail flow with `hasAgGroupRate=true`.
- When `scrapeGroupPersonalLink()` returns null on a House group, retail fallback is the **correct outcome**, not a scrape bug. The campaign is written as `activeBookingMode: "RETAIL_MULTI_BOOKING"` and `inventoryHealth: "HEALTHY"`. The price advantage may or may not survive depending on what Odysseus returns; the retail share-link is always functional.
- This is the dominant explanation for the previous symptom of "rigorous match → vast inventory → most campaigns fail validation": the matcher was correctly picking House groups (they show real price advantages), and the validator was correctly rejecting their non-existent personal links. Only by adding the retail fallback path do these campaigns now resolve cleanly.

Phase A ↔ Phase B UI alignment:

- `mergePhaseBStatusIntoBlueprints()` in `app/(tests)/tests/groups/discovery/page.tsx` now carries `activeBookingMode`, `inventoryHealth`, `inventoryCandidates`, and `inventoryLastCheckedAt` from Phase B back onto the Phase A blueprint card. Previously these fields were dropped during the merge, leaving Phase A cards showing stale "CB Match Found" badges even after Phase B wrote `INVENTORY_FAILED_PAUSED` or `RETAIL_MULTI_BOOKING` to DynamoDB.
- Phase A discovery cards now show the same `InventoryHealthBadge` and `activeBookingMode` chip that Phase B rows display, so the two panels are visually 1:1.
- `PricingBadge` gained a third state, "🛟 Retail Confirmed" (amber), keyed off `activeBookingMode === "RETAIL_MULTI_BOOKING"`. Previously every healthy outcome rendered as "✅ CB Confirmed" regardless of whether the campaign had a real CB group rate or only a retail-fallback link. The new badge makes it visible at a glance which campaigns carry CB group pricing and which are retail-only.

Conversation progress:

- Discovery evidence was corrected to favor community-native niche proof instead of travel-sector-first proof.
- Phase B was narrowed to active campaigns only, so retired campaigns no longer clutter the work queue.
- CB cache refresh now preserves richer row data instead of overwriting it with thinner price-advantage rows.
- Personal-link extraction was tightened so random third-party external links do not masquerade as valid CB booking links.
- Phase B now has faster CB session checks plus a watchdog so long hangs surface as a clear failure instead of an endless poll loop.
- The Phase A "vast inventory but most matches fail" mystery was resolved by combining the `__name` fix (live link scrape now actually executes), the validator diagnostic logs (failure cause is visible per candidate), and the House-group recognition (retail fallback is the correct outcome, not a bug).

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
- `detailUrl` when present in the group row
- `personalLink` when present in the group row
- `sourceUrl`

Current guardrails:

- Cache must exist before discovery.
- Cache must be less than 72 hours old.
- Discovery mapper now uses the refreshed cache shape directly instead of misreading itinerary, port, sail date, or price fields.
- The all-groups scrape remains the canonical row shape. The price-advantage pass enriches price fields without replacing richer itinerary, port, nights, detail URL, or personal-link data with thinner price-advantage rows.

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
- Phase A blueprint cards now mirror Phase B inventory state field-by-field via the merge function, including health badge, active booking mode chip, and the new "🛟 Retail Confirmed" pricing badge for House-group-routed campaigns.
- `PricingBadge` distinguishes three healthy outcomes: ✅ CB Confirmed (real CB group rate), 🛟 Retail Confirmed (RETAIL_MULTI_BOOKING fallback), and CB Match Found (matched but not yet validated by Phase B).

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

## Brief Studio — Targeted Lint Fix

Entry point:

- `/tests/brief-studio` → "Fix This Issue" button on a production-build-lint card

Endpoints:

- `POST /api/groups/campaign/[slug]/brief/fix-issue` (trial — dry run, returns proposed patch + diff, does NOT persist)
- `POST /api/groups/campaign/[slug]/brief/fix-issue/apply` (commit — re-validates contract against current brief state, writes patched bible, re-runs lint)

Core files:

- `lib/campaigns/media/lint-fix-contracts.ts` — per-rule `FixContract` definitions
- `lib/campaigns/media/targeted-lint-fix.ts` — trial runner + contract gates + apply helper
- `app/api/groups/campaign/[slug]/brief/fix-issue/route.ts` — trial endpoint
- `app/api/groups/campaign/[slug]/brief/fix-issue/apply/route.ts` — apply endpoint
- `app/(tests)/tests/brief-studio/page.tsx` — `TargetedFixModal` + lint card button

Purpose:

The Brief Studio production-build-lint surface flags issues (composition repetition, generic fallback overuse, weak niche signals, etc.) that historically forced an operator to either accept the warning or run a full brief regeneration. Targeted lint fix lets the operator request a narrow LLM edit bounded to the affected stills, governed by a per-rule contract, without re-paying for the full brief.

Contract shape:

Each `FixContract` declares the rule it repairs, the `LandingStillSpec` fields the LLM may rewrite (`mutableFields`), the fields that must stay byte-identical (`frozenFields`), a deterministic `successPredicate` that proves the proposed patch clears the originating rule, and a `buildHint` that derives natural-language guidance from the lint issue.

Currently implemented:

- `repeated_composition_family` — moves affected stills into distinct composition families (location keyword × action keyword buckets, evaluated via `extractCompositionFamily()`).

Validation pipeline (server-side, before the operator sees a diff):

1. Schema parse with a flat per-patch shape (stillId plus optional mutable string fields at the top level; nested `fields: {}` shapes broke small models).
2. Affected-stillId check — the patch must target only stills listed in the originating issue.
3. Frozen-field gate — any change to a frozen field aborts the trial with a specific rejection reason.
4. Contract success predicate — the patched stills must satisfy the rule (e.g. distinct composition families).
5. Full-lint regression gate — total `blocker + warning` count after applying the patch must be ≤ count before.

If any gate fails the trial returns `status: "rejected"` with a `rejectReason` and (when relevant) the model's own rationale, so the operator can adjust guidance and retry without paying for an Apply.

Operator guidance:

The modal exposes an optional 500-character textarea for free-form direction (e.g. "move still-02 to a dining context, keep still-01 on the deck"). Guidance is injected into the system prompt as creative direction; the contract's frozen-field policy and success predicate take precedence on conflict.

Post-apply transparency:

After Apply, the readiness card shows a green banner with:
- the rule code that was patched and the affected stillIds,
- the lint verdict transition (verdict + blocker/warning counts before and after),
- per-still composition-family transitions (e.g. `still-01: music_deck_activity → lounge_social`),
- a reminder that adjacent stills sharing the same family may surface as a new lint instance below — this is correct lint behavior, not a regression.

The server also logs the family transitions and verdict delta under `[brief:fix-issue:apply]` for after-the-fact verification.

Model routing:

- Trial uses `ModelName.GPT_5_MEDIUM` (gpt-5.4-mini), `maxOutputTokens: 4000`, `skipRepair: true`. The bounded scope (one issue, ≤ 4 stills, only mutable fields) keeps the call cheap and fast (~5s wall time).

What this is NOT:

- Not a replacement for `Regenerate Brief`. Set-shape rules (`missing_role_coverage`, `hero_set_too_homogeneous`, `identity_legibility_too_low`) still require regeneration because they need coordinated changes across the whole still library. Only slot-local rules with prescriptive hints get a "Fix This Issue" button (currently gated by `TARGETED_FIX_RULE_CODES` in the UI).
- Not an auto-loop. The operator clicks once per issue. If a new issue surfaces after apply, it's a deliberate, visible step — not silent retries.

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
- `scrapeGroupPersonalLink()` injects esbuild helper stubs into the page context before navigating, so tsx-compiled named functions inside `page.evaluate()` no longer throw `ReferenceError: __name is not defined`.
- `booking-link-validator.ts` emits a structured diagnostic line per non-HEALTHY validation outcome (url, finalUrl, pageTitle, matched failure pattern, 200-char body preview) so the operator can tell apart login redirects, expired packages, and SPA-render-too-slow cases.
- Targeted lint fix trial gates (frozen-field, contract success predicate, full-lint regression) run before the operator sees a diff, so applying a patch never silently introduces new lint regressions.
- Targeted lint fix apply re-validates the contract against current brief state on the server, so a trial → regenerate → apply race cannot stamp stale patches onto a freshly regenerated bible.

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
- Tune the retail fallback policy so operators can choose when a skipped ship/date change should auto-promote versus remain review-only.
- Add an operator override to force retail fallback on selected campaigns when the backup sailing is acceptable but the CB group link is not.
- Detect "Group Contact: House" on the group detail page during `scrapeGroupPersonalLink()` and short-circuit straight to retail fallback (skip the debug-bundle write and rephrase the log line as "house-group → retail" instead of "could not find link").
- Extend targeted lint fix to `generic_fallback_overuse` and `weak_niche_signal` contracts. Both are slot-local with prescriptive hints; the contract scaffolding is already in place.
- Add a "fix every still currently in family X" mode for cases where the same composition family keeps re-surfacing across successive single-issue patches.
- Persist targeted lint fix history on the brief (rule code, operator guidance, patched still ids, family transitions, applied-at timestamp) so a future auditor can see why a still was rewritten outside of full regeneration.

### Later

- Migrate structured generation to the newer OpenAI endpoint that supports GPT 5.5 Pro.
- Add automated regression tests for CB cache mapping and launch-window candidate selection.
- Add a visual operator dashboard for discovery slate health, retirement reasons, revision loops, and Phase B readiness.
