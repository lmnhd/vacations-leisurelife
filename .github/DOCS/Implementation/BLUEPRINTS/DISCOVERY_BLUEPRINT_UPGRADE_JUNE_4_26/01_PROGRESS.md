# Implementation Log — Discovery Upgrade (June 4, 2026)

Status: **Implementation complete, typecheck clean.** Awaiting operator verification
(requires running the dev server + a fresh CB deals cache; not run autonomously per repo rules).

Branch: `feature/shadow-groups`

---

## Files changed

### Part 1 — Manual seed pipeline + pipeline optimizations

**`lib/campaigns/types.ts`**
- Added `Campaign.seedConcept?: string` — provenance for manually-seeded blueprints.
- Added `Campaign.archived?: boolean` + `archivedAt?: string` — the new archive state
  (distinct from `discoveryIteration.retiredAt`).

**`lib/campaigns/discovery-schema.ts`**
- Added `DiscoverySingleBlueprintSchema` (`{ blueprint }`) reusing the existing
  per-blueprint field schema, so seed + batch generation never diverge.
- `mapDiscoveryBlueprintToCampaign` now accepts `options?: { seedConcept }` and stamps it
  onto the campaign.

**`app/api/groups/discovery/core-logic.ts`**
- `DEDUP_EXCLUSION_CAP = 40` + `selectCampaignsForDedup()` — excludes `archived` campaigns
  from dedup feedback and caps the exclusion list to the most-recent N (fixes finding #4).
- `buildDiscoveryPromptContext` now scans all campaigns but feeds only the dedup-eligible
  subset into the exclusion/feedback/Gemini blocks. Exposes `existingCampaignsCount`
  (total) and `dedupCampaignsCount` (after filter).
- Extracted `buildCbInventoryHardConstraintBlock()` (shared by batch + seed prompts).
- Extracted `gateAndPersistBlueprints()` — the launch-window + CB inventory match gate +
  idempotent DynamoDB save, now shared by both the 5-blueprint batch path
  (`runStep3AndPersist`) and the seed path. Validation can no longer drift between them.
- Added the **manual seed pipeline**:
  - `buildSeedResearchPrompt(seed, cbInventoryContext)` — focused single-niche Deep
    Research prompt, borrowing the dossier's "research the niche, not the cruise" framing.
  - `buildSeedBlueprintPrompt(...)` — single-blueprint GPT-5 prompt reusing the batch
    field requirements + realism boundaries.
  - `generateBlueprintFromSeed({ seed, deepResearch })` — orchestrates: optional Gemini
    pass → GPT-5 single blueprint → shared gate + persist. Returns the saved campaign,
    a `skipped` flag, and the `seedResearch` text.

**`app/api/groups/discovery/seed/route.ts`** (new)
- `POST` with `{ seed, deepResearch? }`, zod-validated, in-process lock. Returns the
  campaign ref or a 422 when the blueprint can't pass the gates.

### Part 2 — Archive state + clear hardening

**`lib/campaigns/discovery-iteration.ts`**
- `applyCampaignArchive` / `clearCampaignArchive` — set/clear the archive flag.
- `clearArchiveOnStatusAdvance` — clears archive when `status` is past `DRAFT` so a
  running campaign auto-rejoins dedup.

**`lib/campaigns/campaign-store.ts`**
- `saveCampaignBlueprint` now runs `clearArchiveOnStatusAdvance` at the persistence
  boundary (auto-rejoin-on-run).
- `deleteCampaignBlueprint` hardened: queries the whole partition (PK) and deletes EVERY
  SK row, not just `METADATA` (fixes finding #3 — orphaned aesthetic briefs/dossiers).

**`app/api/groups/discovery/archive/[slug]/route.ts`** (new)
- `POST` archives, `DELETE` unarchives. Mirrors the retire route.

**`app/api/groups/discovery/clear/route.ts`**
- `DELETE` is now a true full wipe (all SK rows) + research-cache clear. Doc updated.
- `POST` (new) = non-destructive "archive all" + research-cache clear (the
  "wipe model memory, reinsert on run" path).

### Part 3 — Full-width UI redesign

**`app/(tests)/tests/groups/discovery/page.tsx`**
- Container: `max-w-5xl` → `w-full max-w-[1800px]` (full-width).
- Header now hosts **Phase A / Phase B tabs**; each phase wrapped in its tab.
- **Manual Concept panel** (Phase A): text input + "Deep research this niche" checkbox
  (default ON) + "Develop Blueprint" → `POST /seed`. Enter-to-submit. New campaign merges
  into the slate.
- **Toolbar additions:** search box (name/niche/ship/keywords/seed), sort dropdown
  (newest/oldest/name/price↑↓/days-to-sail/verdict), "Show archived" toggle.
- **Dense rows:** each blueprint collapses to a one-line summary (name, seed badge,
  aesthetic, ship, dates, price, days-to-sail, status badges). Click to expand the full
  body + actions + `BlueprintRationaleSection` (preserved verbatim).
- **Per-card Archive / Unarchive** button alongside Retire.
- **Destructive group:** "Archive All" (non-destructive, amber) + "Clear All" (destructive,
  red, now hard-deletes all rows).
- Preserved verbatim: `mergePhaseBStatusIntoBlueprints`, `PricingBadge`,
  `InventoryHealthBadge`, `PhaseBCampaignRow`, `BlueprintRationaleSection`, and all Phase B
  logic (finding #6).

---

## State semantics (quick reference)

| State | Hidden by default | Feeds model dedup | In DB | Reversible |
|---|---|---|---|---|
| Active | no | yes | yes | — |
| **Retired** | yes | **yes** | yes | yes (unretire) |
| **Archived** | yes | **no** | yes | yes (unarchive / auto on run) |
| Hard-deleted | n/a | no | **no** | no |

"Archived" is the operator's "make the model forget this idea" lever. A campaign auto-
leaves archived when it advances past `DRAFT` (it "runs"), rejoining dedup.

---

## Verification checklist (operator-run)

Prereqs: dev server running, fresh CB deals cache (`npm run scrape-cb-deals`,
< 72h old), `GOOGLE_GENERATIVE_AI_API_KEY` + OpenAI creds in `.env.local`.

1. **Manual seed (GPT-only):** open `/tests/groups/discovery`, type "Star Wars Theme",
   UNCHECK "Deep research", Develop Blueprint. Expect a new DRAFT row with a fuchsia
   "seed" badge in seconds.
2. **Manual seed (deep research):** repeat with the checkbox ON. Expect a multi-minute run
   and a more grounded blueprint.
3. **Seed gate failure:** try an implausible seed that can't match inventory; expect a 422
   with a helpful message (no crash).
4. **Search / sort:** type in the search box; switch sort keys; confirm rows reorder.
5. **Expand/collapse:** click a row; confirm the full rationale renders; collapse again.
6. **Archive one:** Archive a card → it disappears from default view, appears under "Show
   archived". Run a discovery re-spin and confirm the archived niche is NOT in the
   exclusion list (check server logs for `dedupCampaignsCount`).
7. **Unarchive:** restore it; confirm it rejoins the default view.
8. **Archive All:** confirm all rows archive (non-destructive), research cache cleared,
   records still present under "Show archived".
9. **Clear All:** confirm true deletion (re-load shows nothing; check that aesthetic-brief
   rows for deleted campaigns are gone too).
10. **Phase B tab:** switch tabs; confirm Phase B queue + badges still work and
    `mergePhaseBStatusIntoBlueprints` still reconciles health onto Phase A rows.

## Validation already done
- `npx tsc --noEmit` — **clean** across the whole project after every part.
- JSX balance verified via tsc (no unterminated fragments).
- ESLint not run: project is on Next 16 where `next lint` is removed and no flat
  `eslint.config.js` exists; tsc + manual review used instead.

## Not touched
- Phase B Playwright behavior, `cb-inventory-matcher`, `discovery-red-team`,
  `discovery-revision`, launch-window policy.
- No dev server start/restart; no autonomous Playwright (per repo rules).
