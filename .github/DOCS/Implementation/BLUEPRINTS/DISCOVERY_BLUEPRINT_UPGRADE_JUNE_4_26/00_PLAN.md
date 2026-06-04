# Discovery Upgrade — June 4, 2026

Branch: `feature/shadow-groups`

This upgrade extends the Group Campaign Discovery page (`/tests/groups/discovery`) with
three operator-requested capabilities, plus several pipeline optimizations surfaced during
a deep-dive of the existing discovery process.

## Operator goals (verbatim intent)

1. **Manual idea seeds** — besides the Gemini "Deep Research" ideation funnel, allow the
   operator to type a niche idea (e.g. "Star Wars Theme") and have the system develop a
   full blueprint + Phase B inventory match from it.
2. **Redesigned filtering / sorting / layout** — the current card list is too tall and
   hard to manage. Use the full page width, denser rows, tabbed/collapsible sections,
   richer sort + filter + search, and a cleaner Phase A / Phase B separation.
3. **Forget-from-memory + reinsert-on-run** — a way to remove blueprints (even retired
   ones) from the model's dedup feedback so it stops re-suggesting near-duplicates, and
   reinsert them only when a campaign actually runs. Plus a true "clear everything" reset.

## Operator decisions (from clarifying questions)

- **Manual seed depth:** *Let me choose per-run.* The manual-entry form exposes a
  "Deep research this niche" checkbox (default ON). ON = one focused Gemini Deep Research
  call scoped to the seed niche, then GPT-5. OFF = GPT-5 only, grounded on CB inventory +
  the seed.
- **Forget model:** *New `archived` state.* A reversible, non-destructive flag distinct
  from `retired` (hidden but still feeds dedup) and hard delete. Archived campaigns are
  excluded from dedup prompts AND hidden from the default view, but kept in the DB. A
  campaign auto-leaves archived (rejoins dedup) when it converts to a running campaign.
- **UI scope:** *Full redesign, full-width.* Remove the `max-w-5xl` cap, compact rows with
  expand-on-click detail, rich toolbar, tabbed Phase A / Phase B.

---

## Existing pipeline (as traced)

All Phase A logic lives in `app/api/groups/discovery/core-logic.ts`.

| Step | Function | Model | Output |
|---|---|---|---|
| 1 Psychographic | `buildPsychographicPrompt` → `callGeminiDeepResearch` | Gemini Deep Research | 5 communities |
| 2 Aesthetic/ship | `buildAestheticPrompt` → `callGeminiDeepResearch` | Gemini Deep Research | deepened + ship fit |
| 3 Blueprints | `runStep3AndPersist` → `callGlobalGenerateObject` | GPT-5 high | exactly 5 blueprints |

Step 3 enforces two hard gates before saving (`DRAFT` to DynamoDB `lll-shadow-campaigns`):
- **Launch-window compliance** (`lib/campaigns/launch-window.ts`)
- **CB inventory match gate** (`lib/campaigns/cb-inventory-matcher.ts`)

Invocation forms:
- Legacy all-in-one: `GET /api/groups/discovery` (`runGroupDiscoveryPipeline`)
- Two-stage: `runDiscoveryResearch` (cached → `.github/data/discovery-research-cache.json`)
  then `generateDiscoveryBlueprints` (idempotent on slug).

Post-generation loop: red-team **Review** (`discovery-red-team.ts`) → **Revise**
(`discovery-revision.ts`, single/branch/retire) → **Retire** (manual; record kept for
dedup). Then **Phase B** does the live Playwright CB match.

The **dossier** (`lib/campaigns/campaign-research.ts`, `generateCampaignResearchDossier`)
is a Phase 1.5 *depth* pass that runs AFTER a campaign is selected — explicitly not an
ideation pass. Its "research the niche, not the cruise" framing is reused by the new
seed-research prompt.

## Optimization findings (from the deep-dive)

1. **Manual-seed seam already exists** — a seed skips Steps 1–2 and feeds a single seed
   into a Step-3-style generation. Reuses launch-window + inventory gates verbatim.
2. **"Exactly 5" is hardcoded in 3 places** — `DiscoveryBlueprintBatchSchema.length(5)`,
   the Step 3 prompt, and the UI "Newest 5" filter. Parameterized via a `count` arg + a
   single-blueprint schema rather than forking the generator.
3. **"Clear all" is partial** — `deleteCampaignBlueprint` only deletes `SK: METADATA`,
   orphaning `MEDIA#AESTHETIC_BRIEF` and other SK rows. Hardened to a true per-campaign
   wipe.
4. **Dedup exclusion list is unbounded** — `buildExistingThemesBlock` injects *every*
   campaign name; bloats prompts as the slate grows. Capped to most-recent N + archived
   excluded.
5. **UI vertical-space problem is structural** — full card + 12-section rationale per row,
   locked to `max-w-5xl`, no sort, no search.
6. **Phase A/B share fragile state** — `mergePhaseBStatusIntoBlueprints` must be preserved
   through the redesign or badge logic breaks.

---

## Implementation parts

### Part 1 — Manual seed → blueprint pipeline
- `lib/campaigns/discovery-schema.ts`: add `DiscoverySingleBlueprintSchema`; keep the
  field schema shared so seed + batch don't diverge.
- `lib/campaigns/types.ts`: add `seedConcept?: string` (provenance), `archived?: boolean`,
  `archivedAt?: string`.
- `core-logic.ts`: `buildSeedResearchPrompt(seed)`, `generateBlueprintFromSeed({ seed,
  deepResearch, respin })`; parameterize generation count; cap + archive-filter the dedup
  context.
- `POST /api/groups/discovery/seed`.

### Part 2 — Archive state
- Dedup context filters out `archived` campaigns; cap exclusion list.
- Auto-clear `archived` when `status` advances past `DRAFT`.
- `POST/DELETE /api/groups/discovery/archive/[slug]`; bulk "Archive all".
- Harden `/clear` to a true full wipe (all SK rows).

### Part 3 — Full-width UI redesign
- Remove `max-w-5xl`; full-width container.
- Dense sortable/searchable Phase A rows, expand-on-click detail.
- Toolbar: search, sort (created/name/price/days-until-sail/verdict), pricing/launch/
  retired/archived filters.
- Tabbed Phase A / Phase B; preserve `mergePhaseBStatusIntoBlueprints` + all badges.

## Constraints honored
- All LLM calls through `@/lib/ai/llm-gateway` helpers (`callGlobalGenerateObject`,
  `callGeminiDeepResearch`). No direct provider SDKs.
- DynamoDB only; no Prisma.
- TypeScript strict; no `any`.
- No autonomous Playwright; no dev-server start/restart — operator runs verification.

## Status
**Implementation complete** (typecheck clean; awaiting operator verification).
See `01_PROGRESS.md` for the full implementation log, file-by-file changes, state-semantics
table, and the operator verification checklist.
